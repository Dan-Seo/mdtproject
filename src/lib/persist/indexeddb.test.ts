import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { PROJECT_SCHEMA_VERSION, type Project } from '@/domain/model/project'

import {
  AUTOSAVE_DEBOUNCE_MS,
  clearStoredProject,
  createAutosave,
  loadStoredProject,
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
})
