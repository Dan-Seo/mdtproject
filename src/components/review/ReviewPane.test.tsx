import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { formatLength } from '@/components/quantity/TakeoffPane'
import { memberGroupKey } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { quantityLineId } from '@/domain/quantity'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'
import { xrayForRow } from '@/lib/review/xray'

import { ReviewPane } from './ReviewPane'

describe('ReviewPane', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
      sel: { group: null, memberId: '1F-X2Y1' },
      hoverRowId: null,
      viewerMode: 'member',
    })
  })

  it('shows the selected column joint and rejects a selected girder', () => {
    render(<ReviewPane />)

    const joint = within(screen.getByTestId('review-joint'))
    expect(joint.getByText('G1 終端')).toBeInTheDocument()
    expect(joint.getByText('G2 始端')).toBeInTheDocument()
    expect(joint.getByText('参考表示（検討対象外）')).toBeInTheDocument()

    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))

    expect(screen.getByTestId('review-joint')).toHaveTextContent('柱ではありません')
    expect(screen.getByTestId('review-joint')).toHaveTextContent('柱を選択してください')
  })

  it('keeps design and 3D values separate and expands exact rule users', () => {
    const project = createSampleProject()
    const takeoff = buildTakeoff(project)
    const rebar = takeoff.rebars.find(
      ({ memberId, role }) => memberId === '1F-X1Y1' && role === '主筋',
    )
    if (!rebar) throw new Error('sample column main rebar expected')
    const member = project.members.find(({ id }) => id === rebar.memberId)
    if (!member) throw new Error('sample column expected')
    const rowId = quantityLineId(memberGroupKey(project, member), rebar)
    const expected = xrayForRow(rowId, takeoff.rebars, project, takeoff.lines)
    if (expected.length === 0 || !expected[0].shape.drawn) {
      throw new Error('sample xray expected')
    }
    act(() => useAppStore.getState().setHoverRow(rowId))

    render(<ReviewPane />)

    const designLengths = screen.getAllByTestId('xray-design-length')
    const drawnLengths = screen.getAllByTestId('xray-drawn-length')
    expect(designLengths.map((cell) => cell.textContent)).toContain(
      formatLength(expected[0].quantity.designLengthMm),
    )
    expect(drawnLengths.map((cell) => cell.textContent)).toContain(
      formatLength(expected[0].shape.drawnLengthMm),
    )
    expect(designLengths[0].textContent).not.toBe(drawnLengths[0].textContent)
    expect(screen.getAllByTestId('xray-differs')[0]).toHaveTextContent(
      '一致しない（数量には用いない）',
    )
    expect(screen.getAllByTestId('xray-rule-anchorage.L1')[0]).toHaveTextContent('fc=24')
    expect(screen.getAllByTestId('xray-rule-lap.L1')[0]).toBeInTheDocument()
    expect(screen.getAllByTestId('xray-rule-cover.minimum')[0]).toBeInTheDocument()

    const anchorageRule = screen.getAllByTestId('xray-rule-anchorage.L1')[0]
    fireEvent.click(
      within(anchorageRule).getByRole('button', { name: 'この根拠を使う鉄筋' }),
    )

    const users = within(anchorageRule).getAllByRole('button')
    expect(users.length).toBeGreaterThan(1)
    fireEvent.click(users[1])
    expect(useAppStore.getState().hoverRowId).toBeTruthy()
  })
})
