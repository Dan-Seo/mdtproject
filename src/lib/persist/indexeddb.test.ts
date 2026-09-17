import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { PROJECT_SCHEMA_VERSION, type Project } from '@/domain/model/project'
import { emptyReviewState } from '@/domain/review/state'
import type { ReviewState } from '@/domain/review/types'

import {
  AUTOSAVE_DEBOUNCE_MS,
  clearStoredProject,
  createAutosave,
  loadStoredBundle,
  loadStoredProject,
  saveBundle,
  saveProject,
} from './indexeddb'

async function reset(): Promise<void> {
  await clearStoredProject()
}

function deleteStore(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('kijun')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

beforeEach(reset)
afterEach(reset)

describe('IndexedDB への自動保存', () => {
  it('restores the project that was saved last', async () => {
    const project = { ...createSampleProject(), name: '再訪テスト' }

    await saveProject(project)

    expect(await loadStoredProject()).toEqual(project)
  })

  it('has nothing to restore on a first visit', async () => {
    expect(await loadStoredProject()).toBeNull()
  })

  it('drops a project stored under an older schema instead of loading it', async () => {
    // 旧版の JSON をそのまま読むと、無い必須フィールドを undefined のまま
    // 計算に渡すことになる。サンプル案件で起動し直す方が安全だ。
    const project = createSampleProject()
    await saveProject({
      ...project,
      schemaVersion: PROJECT_SCHEMA_VERSION - 1,
    } as Project)

    expect(await loadStoredProject()).toBeNull()
  })

  it('closes the connection when the transaction cannot be created', async () => {
    // ストアの無い v1 DB — onupgradeneeded を付けずに開いたコードが作る
    // (tests/e2e の筋書きがこの形で開く)。database.transaction() はそこで
    // 同期に投げる。
    await deleteStore()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kijun', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })

    const close = vi.spyOn(IDBDatabase.prototype, 'close')
    try {
      await expect(saveProject(createSampleProject())).rejects.toThrow()
      // 閉じずに reject すると、その接続が呼び出しの数だけ残る —
      // 以後の自動保存は永遠に失敗し、版を上げるとき onblocked で止まる。
      expect(close).toHaveBeenCalled()
    } finally {
      close.mockRestore()
      await deleteStore()
    }
  })

  it('survives a corrupted record without throwing at start-up', async () => {
    // 保存中にタブが落ちれば途中まで書かれた文字列が残りうる。起動経路で
    // 投げると、消す手立てのないまま画面が真っ白になる。
    await saveProject(createSampleProject())
    const corrupted = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kijun', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction('project', 'readwrite')
        transaction.objectStore('project').put('{ not json', 'current')
        transaction.oncomplete = () => {
          request.result.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
    await corrupted

    expect(await loadStoredProject()).toBeNull()
  })
})

describe('review bundle persistence', () => {
  it('stores and restores the project and review as one bundle', async () => {
    const project = createSampleProject()
    const review = {
      ...emptyReviewState(),
      settings: {
        clearance: {
          valueMm: 20,
          source: '利用者入力' as const,
          scope: 'same-member',
          enteredAt: '2026-09-17T00:00:00.000Z',
          note: 'note',
        },
      },
    }

    await saveBundle({ project, review })

    await expect(loadStoredBundle()).resolves.toEqual({ project, review })
  })

  it('clears both the project and review records', async () => {
    await saveBundle({ project: createSampleProject(), review: emptyReviewState() })

    await clearStoredProject()

    await expect(loadStoredBundle()).resolves.toEqual({
      project: null,
      review: null,
    })
  })

  it('returns a null review for a corrupted review record', async () => {
    const project = createSampleProject()
    await saveProject(project)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kijun', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('project', 'readwrite')
        transaction.objectStore('project').put('{ not json', 'review')
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })

    await expect(loadStoredBundle()).resolves.toEqual({
      project,
      review: null,
    })
  })

  it('does not restore a review without its project', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kijun', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('project', 'readwrite')
        transaction.objectStore('project').put(
          JSON.stringify(emptyReviewState()),
          'review',
        )
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })

    await expect(loadStoredBundle()).resolves.toEqual({
      project: null,
      review: null,
    })
  })

  it('writes both bundle keys in one readwrite transaction', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    let transactionCallCount = 0
    let transactionArgs: unknown[] = []
    let putCallCount = 0
    let putKeys: unknown[] = []

    try {
      await saveBundle({
        project: createSampleProject(),
        review: emptyReviewState(),
      })
      transactionCallCount = transaction.mock.calls.length
      transactionArgs = transaction.mock.calls[0]
      putCallCount = put.mock.calls.length
      putKeys = put.mock.calls.map(([, key]) => key)
    } finally {
      transaction.mockRestore()
      put.mockRestore()
    }

    expect(transactionCallCount).toBe(1)
    expect(transactionArgs).toEqual(['project', 'readwrite'])
    expect(putCallCount).toBe(2)
    expect(putKeys).toEqual(['current', 'review'])
  })
})

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes once for a burst of edits', async () => {
    // 断面一覧はセルを打つたびに Project を差し替える。1打鍵1書き込みだと
    // 入力中ずっと IndexedDB を叩き続けることになる。
    const written: Project[] = []
    const autosave = createAutosave(async (project) => {
      written.push(project)
    })
    const project = createSampleProject()

    autosave({ ...project, name: 'a' })
    autosave({ ...project, name: 'ab' })
    autosave({ ...project, name: 'abc' })

    expect(written).toEqual([])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)

    expect(written.map(({ name }) => name)).toEqual(['abc'])
  })

  it('flushes the pending write instead of losing it when the page goes away', async () => {
    // 打ち終わって 500ms 以内に閉じられると、「前回の続き」を戻す
    // 機能が最後の一打を落とす。
    const written: Project[] = []
    const autosave = createAutosave(async (project) => {
      written.push(project)
    })

    autosave({ ...createSampleProject(), name: '最後の一打' })
    expect(written).toEqual([])

    autosave.flush()
    await Promise.resolve()

    expect(written.map(({ name }) => name)).toEqual(['最後の一打'])

    // 流した後にタイマーがもう一度発火して二重に書かない。
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)

    expect(written).toHaveLength(1)
  })

  it('keeps the order when a slow write overlaps the next one', async () => {
    // 書き込みは呼び出しごとに接続を開き直すので、重なると commit の順が
    // 入れ替わる — 遅れた古い案件が最後に残り、直前の一打が消えて見える。
    const written: string[] = []
    const gate: (() => void)[] = []
    let calls = 0
    const autosave = createAutosave(async (project) => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>((resolve) => gate.push(resolve))
      }
      written.push(project.name)
    })
    const project = createSampleProject()
    const settle = async () => {
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
    }

    autosave({ ...project, name: '先' })
    autosave.flush()
    autosave({ ...project, name: '後' })
    autosave.flush()
    await settle()

    // 先が詰まっている間は後も出さない。追い越せば古い方が最後に残る。
    expect(written).toEqual([])

    gate[0]()
    await settle()

    expect(written).toEqual(['先', '後'])
  })

  it('drops the version overtaken while a slow write is in flight', async () => {
    // 待ちを鎖に積むと、頁を離れる時の flush が積まれた分の後ろに回り、
    // open すら発行できないまま文書が壊される。行列は一つきりにして、
    // 追い越された中間版は落とす — 案件は毎回まるごと書き直すからだ。
    const written: string[] = []
    const gate: (() => void)[] = []
    let calls = 0
    const autosave = createAutosave(async (project) => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>((resolve) => gate.push(resolve))
      }
      written.push(project.name)
    })
    const project = createSampleProject()
    const settle = async () => {
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
    }

    for (const name of ['先', '中', '後']) {
      autosave({ ...project, name })
      autosave.flush()
    }
    await settle()
    gate[0]()
    await settle()

    expect(written).toEqual(['先', '後'])
  })

  it('does nothing when flushed with no pending edit', () => {
    const written: Project[] = []
    const autosave = createAutosave(async (project) => {
      written.push(project)
    })

    autosave.flush()

    expect(written).toEqual([])
  })

  it('keeps saving after the burst settles', async () => {
    const written: Project[] = []
    const autosave = createAutosave(async (project) => {
      written.push(project)
    })
    const project = createSampleProject()

    autosave({ ...project, name: 'first' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    autosave({ ...project, name: 'second' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)

    expect(written.map(({ name }) => name)).toEqual(['first', 'second'])
  })

  it('keeps a failed write from reaching the caller', async () => {
    // 保存できないこと自体は作業を止める理由にならない — 画面の計算は
    // ブラウザ内で完結している。投げるとタイマーの中なので誰も捕まえられない。
    const autosave = createAutosave(async () => {
      throw new Error('QuotaExceededError')
    })

    autosave(createSampleProject())

    await expect(
      vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS),
    ).resolves.not.toThrow()
  })

  it('accepts non-project bundles through its generic value type', async () => {
    const written: ReviewState[] = []
    const autosave = createAutosave<ReviewState>(async (review) => {
      written.push(review)
    })

    autosave(emptyReviewState())
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)

    expect(written).toEqual([emptyReviewState()])
  })
})
