import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import {
  PROJECT_SCHEMA_VERSION,
  serializeProject,
  type Project,
} from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { ProjectActions } from './ProjectActions'

function choose(contents: string): void {
  const input = screen.getByLabelText('案件を読み込み')
  const file = new File([contents], '案件.json', { type: 'application/json' })

  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('ProjectActions', () => {
  it('hands the browser the current 案件 as JSON', async () => {
    let blob: Blob | undefined
    let filename: string | undefined
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value
        return 'blob:kijun-test'
      }),
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

    render(<ProjectActions />)
    try {
      fireEvent.click(screen.getByRole('button', { name: '案件を保存' }))
    } finally {
      click.mockRestore()
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }

    expect(filename).toBe('サンプル案件 RC 2階建て.json')
    expect(await blob!.text()).toBe(
      serializeProject(useAppStore.getState().project),
    )
  })

  it('replaces the 案件 with the chosen file', async () => {
    const loaded: Project = { ...createSampleProject(), name: '取り込んだ案件' }
    render(<ProjectActions />)

    choose(serializeProject(loaded))

    await waitFor(() => {
      expect(useAppStore.getState().project.name).toBe('取り込んだ案件')
    })
  })

  it('keeps the current 案件 and says so when the file cannot be read', async () => {
    // 黙って失敗すると、利用者には「読み込んだのに何も変わらない」としか
    // 見えない。今開いている案件は残す。
    const before = useAppStore.getState().project
    render(<ProjectActions />)

    choose('{ not json')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '読み込めませんでした',
    )
    expect(useAppStore.getState().project).toBe(before)
  })

  it('refuses a file saved under an older schema', async () => {
    const stale = serializeProject({
      ...createSampleProject(),
      schemaVersion: PROJECT_SCHEMA_VERSION - 1,
    } as Project)
    const before = useAppStore.getState().project
    render(<ProjectActions />)

    choose(stale)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().project).toBe(before)
  })

  it('clears the failure once a valid file is chosen', async () => {
    render(<ProjectActions />)

    choose('{ not json')
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    choose(serializeProject({ ...createSampleProject(), name: '再挑戦' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(useAppStore.getState().project.name).toBe('再挑戦')
  })
})
