import { describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { emptyReviewState } from '@/domain/review/state'
import type { ReviewState } from '@/domain/review/types'
import {
  PROJECT_SCHEMA_VERSION,
  serializeProject,
  type Project,
} from '@/domain/model/project'

import {
  downloadProjectJson,
  projectFileName,
  readProjectFile,
  serializeProjectFile,
} from './file'

function projectFile(contents: string, name = 'x.json'): File {
  return new File([contents], name, { type: 'application/json' })
}

function reviewState(): ReviewState {
  const project = createSampleProject()
  const fingerprints = {
    rulepack: 'rules-v1',
    checkVersion: 1,
    checkConditions: null,
    members: {},
  }
  return {
    ...emptyReviewState(),
    baseline: {
      label: 'baseline',
      capturedAt: '2026-09-17T00:00:00.000Z',
      project,
      fingerprints,
    },
    settings: {
      clearance: {
        valueMm: 20,
        source: '利用者入力',
        scope: 'same-member',
        enteredAt: '2026-09-17T00:00:00.000Z',
        note: 'note',
      },
    },
    exclusions: [
      {
        id: 'exclusion-1',
        scope: {
          sameMemberOnly: true,
          roles: ['main', 'hoop'],
          kinds: ['干渉候補'],
        },
        reason: 'reason',
        createdAt: '2026-09-17T00:00:00.000Z',
      },
    ],
    packages: [
      {
        id: 'package-1',
        name: 'package',
        targets: [],
        assignee: 'assignee',
        dueDate: null,
        checklist: [],
        createdAt: '2026-09-17T00:00:00.000Z',
        updatedAt: '2026-09-17T00:00:00.000Z',
      },
    ],
    items: [
      {
        id: 'item-1',
        createdAt: '2026-09-17T00:00:00.000Z',
        updatedAt: '2026-09-17T00:00:00.000Z',
        targets: [],
        title: 'title',
        body: 'body',
        status: '未確認',
        confirmations: [],
        snapshot: {
          capturedAt: '2026-09-17T00:00:00.000Z',
          fingerprints,
          viewer: {
            mode: 'member',
            pose: null,
            clip: { enabled: false, axis: 'x', ratio: 0.5 },
            layers: { main: true, hoop: true, concrete: true },
            selection: { group: null, memberId: null, rowId: null },
          },
        },
      },
    ],
  }
}

describe('projectFileName', () => {
  it('names the file after the 案件', () => {
    expect(projectFileName('赤道小学校 改築')).toBe('赤道小学校 改築.json')
  })

  it('strips characters the OS refuses in a filename', () => {
    // 案件名は自由入力だ。/ や : がそのまま入ると保存に失敗するか、
    // ブラウザが勝手に別名を付けて利用者の付けた名前が消える。
    expect(projectFileName('A/B:C*D?E"F<G>H|I')).toBe('ABCDEFGHI.json')
  })

  it('does not leave the gap where a stripped character was', () => {
    // サンプル案件名の「/」がそのまま抜けると「A  B」と空白が二つ残る。
    expect(projectFileName('サンプル案件 / RC 2階建て')).toBe(
      'サンプル案件 RC 2階建て.json',
    )
  })

  it('falls back when nothing usable is left', () => {
    expect(projectFileName('   ')).toBe('kijun-project.json')
    expect(projectFileName('///')).toBe('kijun-project.json')
  })
})

describe('readProjectFile', () => {
  it('reads back a project written by the exporter', async () => {
    const project = { ...createSampleProject(), name: '往復テスト' }

    await expect(
      readProjectFile(projectFile(serializeProject(project))),
    ).resolves.toEqual({ project, review: emptyReviewState() })
  })

  it('omits an empty review from the file and preserves the old bytes', () => {
    const project = createSampleProject()

    expect(serializeProjectFile(project, emptyReviewState())).toBe(
      serializeProject(project),
    )
  })

  it('round-trips every persisted review section', async () => {
    const project = createSampleProject()
    const review = reviewState()

    await expect(
      readProjectFile(projectFile(serializeProjectFile(project, review))),
    ).resolves.toEqual({ project, review })
  })

  it('rejects a file with an unsupported review version', async () => {
    const project = createSampleProject()
    const review = { ...emptyReviewState(), reviewSchemaVersion: 2 }

    await expect(
      readProjectFile(projectFile(JSON.stringify({ ...project, review }))),
    ).rejects.toThrow(/reviewSchemaVersion/)
  })

  it('rejects the whole file when the review record is corrupted', async () => {
    const project = createSampleProject()

    await expect(
      readProjectFile(projectFile(JSON.stringify({ ...project, review: {} }))),
    ).rejects.toThrow(/ReviewState/)
  })

  it('rejects a file saved under an older schema', async () => {
    const stale = serializeProject({
      ...createSampleProject(),
      schemaVersion: PROJECT_SCHEMA_VERSION - 1,
    } as Project)

    await expect(readProjectFile(projectFile(stale))).rejects.toThrow(
      /schemaVersion/,
    )
  })

  it('rejects a file that is not JSON at all', async () => {
    // 取り込みは利用者が選んだファイルで始まる。読めないものを黙って
    // 受け入れると、サンプル案件が消えたようにしか見えない。
    await expect(readProjectFile(projectFile('not json'))).rejects.toThrow()
  })
})

describe('downloadProjectJson', () => {
  it('hands the browser a JSON blob named after the 案件', async () => {
    const project = { ...createSampleProject(), name: '保存テスト' }
    let blob: Blob | undefined
    let filename: string | undefined
    const createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:kijun-test'
    })

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download
      })

    try {
      downloadProjectJson(project)
    } finally {
      click.mockRestore()
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }

    expect(filename).toBe('保存テスト.json')
    expect(blob?.type).toBe('application/json')
    await expect(readProjectFile(projectFile(await blob!.text()))).resolves.toEqual({
      project,
      review: emptyReviewState(),
    })
  })
})
