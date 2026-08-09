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

function takeoffLines() {
  const { result } = renderHook(() => useTakeoff())
  return result.current.lines
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
    const line = lines.find(({ id }) => id === '1階|C|C1|主筋')
    expect(line).toBeDefined()

    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId('quantity-line-1階|C|C1|主筋')
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent(
      (line!.lengthMm / 1000).toFixed(3),
    )
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
    render(<TakeoffPane />)

    const row = screen.getByTestId('quantity-line-1階|C|C1|主筋')
    fireEvent.click(within(row).getAllByRole('link')[0])

    expect(useAppStore.getState().sel).toEqual({
      group: null,
      memberId: null,
    })
    expect(screen.queryByTestId('formula-1階|C|C1|主筋')).not.toBeInTheDocument()
  })

  it('updates hoverRowId without changing sel', () => {
    useAppStore.setState({
      sel: { group: '2階|C|C1', memberId: '2F-X2Y2' },
    })
    const initialSelection = useAppStore.getState().sel
    render(<TakeoffPane />)

    const row = screen.getByTestId('quantity-line-1階|C|C1|主筋')
    fireEvent.mouseEnter(row)

    expect(useAppStore.getState().hoverRowId).toBe('1階|C|C1|主筋')
    expect(useAppStore.getState().sel).toEqual(initialSelection)

    fireEvent.mouseLeave(row)

    expect(useAppStore.getState().hoverRowId).toBeNull()
    expect(useAppStore.getState().sel).toEqual(initialSelection)
  })

  it('expands the exact domain formula when a rebar row is clicked', () => {
    const lines = takeoffLines()
    const line = lines.find(({ id }) => id === '1階|C|C1|帯筋')
    expect(line).toBeDefined()
    render(<TakeoffTable lines={lines} />)

    fireEvent.click(screen.getByTestId(`quantity-line-${line!.id}`))

    expect(screen.getByTestId(`formula-${line!.id}`)).toHaveTextContent(
      line!.formula,
    )
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
    render(<TakeoffPane />)

    const row = screen.getByTestId('quantity-line-1階|C|C1|主筋')
    const chip = within(row).getByText('JIS G 3112')

    expect(chip).toHaveAttribute('aria-disabled', 'true')
    expect(chip).toHaveAttribute('title', expect.stringContaining('未確保'))
    expect(chip.closest('a')).toBeNull()
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
})
