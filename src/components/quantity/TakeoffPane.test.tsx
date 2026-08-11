import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { grandTotal, storySubtotals } from '@/domain/quantity'
import { exportTakeoffXlsx } from '@/lib/export'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'

import {
  TakeoffActions,
  TakeoffPane,
  TakeoffTable,
} from './TakeoffPane'

vi.mock('@/lib/export', () => ({
  exportTakeoffXlsx: vi.fn().mockResolvedValue(undefined),
}))

const { capture, captureException } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: { capture, captureException } }))

function takeoffLines() {
  const { result } = renderHook(() => useTakeoff())
  return result.current.lines
}

// 行 id は加工長・本数まで含むので、書き下さずに集計結果から引く。
function lineFor(role: '主筋' | '帯筋') {
  const line = takeoffLines().find(
    (candidate) => candidate.groupId === '1階|C|C1' && candidate.role === role,
  )

  if (!line) throw new Error(`QuantityLine not found: ${role}`)
  return line
}

describe('TakeoffPane', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
    })

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.mocked(exportTakeoffXlsx).mockClear()
    capture.mockClear()
    captureException.mockClear()
  })

  it('renders the twelve DESIGN §4 headers in order', () => {
    render(<TakeoffPane />)

    const headers = within(screen.getByTestId('takeoff-head'))
      .getAllByRole('columnheader')
      .map((header) => header.textContent)

    expect(headers).toEqual([
      '鉄筋',
      '径',
      '形状',
      '長さ (m)',
      '本数',
      '箇所',
      '総延長 (m)',
      'kg/m',
      '設計数量 (kg)',
      '所要数量 (kg)',
      '出典',
      '備考',
    ])
  })

  it('formats 長さ in metres with three decimal places', () => {
    const lines = takeoffLines()
    const line = lineFor('主筋')

    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent(
      (line.lengthMm / 1000).toFixed(3),
    )
  })

  it('localises the 形状 label instead of hardcoding Japanese', () => {
    const lines = takeoffLines()
    const lineId = lineFor('主筋').id
    useAppStore.setState({ locale: 'ko' })

    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    expect(within(row).getByLabelText('직선')).toBeInTheDocument()
    expect(within(row).queryByLabelText('直線')).not.toBeInTheDocument()
  })

  it('states that 大梁 is excluded from the quantities', () => {
    render(<TakeoffPane />)

    expect(screen.getByRole('note')).toHaveTextContent('大梁')
    expect(screen.getByRole('note')).toHaveTextContent('M3')
  })

  it('omits the 大梁 notice when the project has no 大梁', () => {
    // 柱만 남기면 beamDepthAbove가 실패하므로, 부재가 없는 신규 안건 상태로 본다.
    useAppStore.setState({
      project: { ...createSampleProject(), members: [] },
    })

    render(<TakeoffPane />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('shows a row warning only from QuantityLine.inferred', () => {
    const lines = takeoffLines()
    const inferredLine = lines[0]
    const statedLine = { ...lines[1], inferred: false }

    const { rerender } = render(<TakeoffTable lines={[inferredLine]} />)

    expect(
      within(
        screen.getByTestId(`quantity-line-${inferredLine.id}`),
      ).getByLabelText('未確認の規準値'),
    ).toBeInTheDocument()

    rerender(<TakeoffTable lines={[statedLine]} />)

    expect(
      within(
        screen.getByTestId(`quantity-line-${statedLine.id}`),
      ).queryByLabelText('未確認の規準値'),
    ).not.toBeInTheDocument()
  })

  it('does not select or expand a row when a source link is clicked', () => {
    const lineId = lineFor('主筋').id
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.click(within(row).getAllByRole('link')[0])

    expect(useAppStore.getState().sel).toEqual({
      group: null,
      memberId: null,
    })
    expect(screen.queryByTestId(`formula-${lineId}`)).not.toBeInTheDocument()
  })

  it('updates hoverRowId without changing sel', () => {
    const lineId = lineFor('主筋').id
    useAppStore.setState({
      sel: { group: '2階|C|C1', memberId: '2F-X2Y2' },
    })
    const initialSelection = useAppStore.getState().sel
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.mouseEnter(row)

    expect(useAppStore.getState().hoverRowId).toBe(lineId)
    expect(useAppStore.getState().sel).toEqual(initialSelection)

    fireEvent.mouseLeave(row)

    expect(useAppStore.getState().hoverRowId).toBeNull()
    expect(useAppStore.getState().sel).toEqual(initialSelection)
  })

  it('drives the highlight axis from keyboard focus, not only hover', () => {
    useAppStore.setState({
      sel: { group: '2階|C|C1', memberId: '2F-X2Y2' },
    })
    const initialSelection = useAppStore.getState().sel
    render(<TakeoffPane />)

    const lineId = lineFor('主筋').id
    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.focus(row)

    expect(useAppStore.getState().hoverRowId).toBe(lineId)
    expect(useAppStore.getState().sel).toEqual(initialSelection)

    fireEvent.blur(row)

    expect(useAppStore.getState().hoverRowId).toBeNull()
    expect(useAppStore.getState().sel).toEqual(initialSelection)
  })

  it('expands the exact domain formula when a rebar row is clicked', () => {
    const lines = takeoffLines()
    const line = lineFor('帯筋')
    render(<TakeoffTable lines={lines} />)

    fireEvent.click(screen.getByTestId(`quantity-line-${line.id}`))

    expect(screen.getByTestId(`formula-${line.id}`)).toHaveTextContent(
      line.formula,
    )
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'takeoff',
    })
  })

  it('renders story subtotals and the grand total from domain helpers', () => {
    const lines = takeoffLines()
    const subtotals = storySubtotals(lines)
    const total = grandTotal(lines)
    render(<TakeoffTable lines={lines} />)

    for (const subtotal of subtotals) {
      const row = screen.getByTestId(`story-subtotal-${subtotal.storyName}`)
      const cells = within(row).getAllByRole('cell')
      expect(cells[0]).toHaveTextContent(subtotal.designKg.toFixed(3))
      expect(cells[1]).toHaveTextContent(subtotal.requiredKg.toFixed(3))
    }

    const totalCells = within(screen.getByTestId('grand-total')).getAllByRole(
      'cell',
    )
    expect(totalCells[0]).toHaveTextContent(total.designKg.toFixed(3))
    expect(totalCells[1]).toHaveTextContent(total.requiredKg.toFixed(3))
  })

  it('selects a representative member and scrolls to external selections', () => {
    render(<TakeoffPane />)

    fireEvent.click(screen.getByTestId('quantity-group-1階|C|C1'))
    expect(useAppStore.getState().sel).toEqual({
      group: '1階|C|C1',
      memberId: '1F-X1Y1',
    })

    act(() => useAppStore.getState().selectMember('2F-X2Y2'))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByTestId('quantity-group-2階|C|C1')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('renders unavailable sources as disabled chips instead of links', () => {
    const lineId = lineFor('主筋').id
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    const chip = within(row).getByText('JIS G 3112')

    expect(chip).toHaveAttribute('aria-disabled', 'true')
    expect(chip).toHaveAttribute('title', expect.stringContaining('未確保'))
    expect(chip.closest('a')).toBeNull()
  })

  it('stores a typed 備考 in the Project instead of dropping it', () => {
    render(<TakeoffPane />)

    const lineId = lineFor('主筋').id
    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.change(within(row).getByLabelText(`${lineId} 備考`), {
      target: { value: '要確認' },
    })

    expect(useAppStore.getState().project.notes).toEqual({
      [lineId]: '要確認',
    })
    expect(
      within(screen.getByTestId(`quantity-line-${lineId}`)).getByLabelText(
        `${lineId} 備考`,
      ),
    ).toHaveValue('要確認')
  })

  it('keeps an unavailable source chip reachable by keyboard', () => {
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineFor('主筋').id}`)
    const chip = within(row).getByText('JIS G 3112')

    expect(chip).toHaveAttribute('tabindex', '0')
  })

  it('shows the rulepack markup and exports the current project as xlsx', async () => {
    render(<TakeoffActions />)

    expect(screen.getByText('割増 4%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))

    await waitFor(() => expect(exportTakeoffXlsx).toHaveBeenCalledOnce())
    expect(exportTakeoffXlsx).toHaveBeenCalledWith({
      project: useAppStore.getState().project,
      lines: expect.any(Array),
      locale: 'ja',
    })
  })

  // 파일이 실제로 내려간 뒤에만 발화해야 퍼널의 마지막 칸이 "받았다"를 뜻한다.
  // 미검증 룰팩 항목이 섞인 채로도 내보내는지가 ADR-015가 걸어둔 가설이다.
  it('reports the export only after the workbook resolves, with the inferred rules it carried', async () => {
    render(<TakeoffActions />)

    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))
    expect(capture).not.toHaveBeenCalledWith(
      'takeoff_exported',
      expect.anything(),
    )

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('takeoff_exported', {
        locale: 'ja',
        line_count: expect.any(Number),
        has_inferred: expect.any(Boolean),
        inferred_rules: expect.any(Array),
      }),
    )
  })

  it('reports a failed export instead of dropping the rejection', async () => {
    const failure = new Error('exceljs chunk failed to load')
    vi.mocked(exportTakeoffXlsx).mockRejectedValueOnce(failure)

    render(<TakeoffActions />)
    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))

    await waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(failure, {
        stage: 'takeoff_export',
      }),
    )
    expect(capture).toHaveBeenCalledWith('takeoff_export_failed', {
      locale: 'ja',
      line_count: expect.any(Number),
    })
    expect(capture).not.toHaveBeenCalledWith(
      'takeoff_exported',
      expect.anything(),
    )
  })
})
