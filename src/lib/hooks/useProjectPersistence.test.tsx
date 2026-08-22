import 'fake-indexeddb/auto'

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import {
  AUTOSAVE_DEBOUNCE_MS,
  clearStoredProject,
  loadStoredProject,
  saveProject,
} from '@/lib/persist/indexeddb'
import { useAppStore } from '@/lib/store'

import { useProjectPersistence } from './useProjectPersistence'

beforeEach(async () => {
  await clearStoredProject()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

afterEach(async () => {
  await clearStoredProject()
})

describe('useProjectPersistence', () => {
  it('restores the last visit instead of the sample 案件', async () => {
    const stored = { ...createSampleProject(), name: '前回の続き' }
    await saveProject(stored)

    renderHook(() => useProjectPersistence())

    await waitFor(() => {
      expect(useAppStore.getState().project.name).toBe('前回の続き')
    })
  })

  it('leaves the sample 案件 in place on a first visit', async () => {
    const sample = useAppStore.getState().project

    const { result } = renderHook(() => useProjectPersistence())

    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(useAppStore.getState().project).toBe(sample)
  })

  it('does not overwrite an edit made while the stored 案件 was still loading', async () => {
    // 読み込みは非同期だ。その間に打たれたセルを復元が上書きすると、
    // 利用者から見れば入力が消える。
    await saveProject({ ...createSampleProject(), name: '前回の続き' })
    const edited = { ...createSampleProject(), name: '入力中' }
    useAppStore.setState({ project: edited })

    const { result } = renderHook(() => useProjectPersistence())

    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(useAppStore.getState().project.name).toBe('入力中')
  })

  it('saves the edited 案件 so the next visit starts there', async () => {
    const { result } = renderHook(() => useProjectPersistence())
    await waitFor(() => expect(result.current.restored).toBe(true))

    act(() => {
      useAppStore
        .getState()
        .updateProject((project) => ({ ...project, name: '編集後' }))
    })

    await waitFor(
      async () => {
        expect((await loadStoredProject())?.name).toBe('編集後')
      },
      { timeout: AUTOSAVE_DEBOUNCE_MS * 6 },
    )
  })

  it('stops saving once the pane unmounts', async () => {
    const { result, unmount } = renderHook(() => useProjectPersistence())
    await waitFor(() => expect(result.current.restored).toBe(true))
    act(() => {
      useAppStore
        .getState()
        .updateProject((project) => ({ ...project, name: '購読中' }))
    })
    await waitFor(
      async () => {
        expect((await loadStoredProject())?.name).toBe('購読中')
      },
      { timeout: AUTOSAVE_DEBOUNCE_MS * 6 },
    )

    unmount()
    act(() => {
      useAppStore
        .getState()
        .updateProject((project) => ({ ...project, name: '解除後' }))
    })
    await new Promise((resolve) =>
      setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 4),
    )

    expect((await loadStoredProject())?.name).toBe('購読中')
  })

  it('keeps the app usable when IndexedDB is unavailable', async () => {
    // プライベートウィンドウや容量超過で open 自体が失敗しうる。保存できない
    // ことは計算を止める理由にならない — 計算はブラウザ内で完結している。
    const open = vi
      .spyOn(indexedDB, 'open')
      .mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })

    try {
      const { result } = renderHook(() => useProjectPersistence())

      await waitFor(() => expect(result.current.restored).toBe(true))
      expect(useAppStore.getState().project).toBeDefined()
    } finally {
      open.mockRestore()
    }
  })
})
