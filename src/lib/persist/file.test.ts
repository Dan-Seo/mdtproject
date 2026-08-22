import { describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import {
  PROJECT_SCHEMA_VERSION,
  serializeProject,
  type Project,
} from '@/domain/model/project'

import { downloadProjectJson, projectFileName, readProjectFile } from './file'

function projectFile(contents: string, name = 'x.json'): File {
  return new File([contents], name, { type: 'application/json' })
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
    ).resolves.toEqual(project)
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
    await expect(readProjectFile(projectFile(await blob!.text()))).resolves.toEqual(
      project,
    )
  })
})
