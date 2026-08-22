import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RebarModelInput } from '@/lib/export/gltf'
import { useAppStore } from '@/lib/store'

const { capture, captureException, exportRebarGlb } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  exportRebarGlb: vi.fn(async (_input: RebarModelInput) => {}),
}))

vi.mock('@/lib/telemetry', () => ({ capture, captureException }))
vi.mock('@/lib/export/gltf', () => ({ exportRebarGlb }))

import { ViewerExportButton } from './ViewerExportButton'

describe('ViewerExportButton', () => {
  beforeEach(() => {
    capture.mockClear()
    captureException.mockClear()
    exportRebarGlb.mockClear()
    exportRebarGlb.mockImplementation(async () => {})
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('exports the whole 案件, not just the selected 部材', async () => {
    render(<ViewerExportButton />)

    fireEvent.click(screen.getByRole('button', { name: '3D 書き出し' }))

    await waitFor(() => expect(exportRebarGlb).toHaveBeenCalledTimes(1))
    const [input] = exportRebarGlb.mock.calls[0]
    expect(input.project).toBe(useAppStore.getState().project)
    expect(input.rebars.length).toBeGreaterThan(0)
  })

  it('records the outcome, not the click', async () => {
    // 書き出しはこの製品の産出物だ。押した時点で成功を記録すると、three の
    // チャンク読み込み失敗が成功として集計される (TakeoffActions と同じ基準)。
    render(<ViewerExportButton />)

    fireEvent.click(screen.getByRole('button', { name: '3D 書き出し' }))

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('model_exported', {
        locale: 'ja',
      }),
    )
  })

  it('reports a failed export instead of leaving it silent', async () => {
    exportRebarGlb.mockImplementation(async () => {
      throw new Error('GLTFExporter chunk failed')
    })
    render(<ViewerExportButton />)

    fireEvent.click(screen.getByRole('button', { name: '3D 書き出し' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(captureException).toHaveBeenCalled()
    expect(capture).toHaveBeenCalledWith('model_export_failed', {
      locale: 'ja',
    })
  })

  it('leaves the 未対応 部材 out of the model the same way the viewer does', async () => {
    render(<ViewerExportButton />)

    fireEvent.click(screen.getByRole('button', { name: '3D 書き出し' }))

    await waitFor(() => expect(exportRebarGlb).toHaveBeenCalled())
    const [input] = exportRebarGlb.mock.calls[0]
    expect(input.unsupportedMemberIds).toBeInstanceOf(Set)
  })
})
