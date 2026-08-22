import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { gridPointCount } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { PlanEditor, StoryTabs } from './PlanEditor'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/telemetry', () => ({ capture }))

describe('PlanEditor', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  it('selects a clicked member and reflects the selection', () => {
    render(<PlanEditor />)

    const member = screen.getByRole('button', {
      name: 'C1 1F-X2Y2',
    })
    fireEvent.click(member)

    expect(useAppStore.getState().sel).toEqual({
      group: '1階|C|C1',
      memberId: '1F-X2Y2',
    })
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'plan',
    })
    expect(member).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not re-report member_selected when the same member is clicked again', () => {
    render(<PlanEditor />)

    const member = screen.getByRole('button', { name: 'C1 1F-X2Y2' })
    fireEvent.click(member)
    expect(capture).toHaveBeenCalledTimes(1)

    fireEvent.click(member)
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('keeps the 柱 mark label out of the clickable group so it matches the marker', () => {
    render(<PlanEditor />)

    const member = screen.getByRole('button', { name: 'C1 1F-X1Y1' })
    const { nx, ny } = gridPointCount(useAppStore.getState().project.grid)

    expect(member.querySelector('rect')).not.toBeNull()
    expect(member.querySelector('text')).toBeNull()
    expect(screen.getAllByText('C1')).toHaveLength(nx * ny)
  })

  it('adds an X span and regenerates the project grid members', () => {
    const initialXSpans = useAppStore.getState().project.grid.xSpans
    render(<PlanEditor />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Xスパンを追加' }),
    )

    const project = useAppStore.getState().project
    const { nx, ny } = gridPointCount(project.grid)
    expect(project.grid.xSpans.slice(0, -1)).toEqual(initialXSpans)
    expect(project.grid.xSpans).toHaveLength(initialXSpans.length + 1)
    expect(
      project.members.filter(
        ({ storyId, kind }) => storyId === '1F' && kind === '柱',
      ),
    ).toHaveLength(nx * ny)
  })

  it('updates a span value through updateProject', () => {
    render(<PlanEditor />)

    fireEvent.change(screen.getByLabelText('Xスパン 1'), {
      target: { value: '7200' },
    })

    expect(useAppStore.getState().project.grid.xSpans[0]).toBe(7200)
  })

  // スパン 입력은 number input의 onChange라 "6000"을 치면 네 번 들어온다.
  // 축마다 한 번씩만 남겨야 이벤트가 타이핑 속도가 아니라 편집 여부를 센다.
  it('reports the span edit once per axis however many keystrokes land', () => {
    render(<PlanEditor />)

    fireEvent.change(screen.getByLabelText('Xスパン 1'), {
      target: { value: '6000' },
    })
    fireEvent.change(screen.getByLabelText('Xスパン 1'), {
      target: { value: '6500' },
    })
    fireEvent.change(screen.getByLabelText('Yスパン 1'), {
      target: { value: '5000' },
    })

    const edits = capture.mock.calls.filter(
      ([name]) => name === 'grid_edited',
    )
    expect(edits).toHaveLength(2)
    expect(edits.map(([, properties]) => properties)).toEqual([
      { axis: 'x' },
      { axis: 'y' },
    ])
  })
})

describe('PlanEditor 開口部の入力 (数量積算基準 1通則8))', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  function selectWall() {
    const wall = useAppStore
      .getState()
      .project.members.find(({ kind }) => kind === '耐震壁')!
    act(() => {
      useAppStore.getState().selectMember(wall.id)
    })
    return wall
  }

  it('tells the user to pick a 耐震壁 or 床板 first', () => {
    render(<PlanEditor />)

    expect(screen.getByTestId('opening-editor-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('opening-editor')).not.toBeInTheDocument()
  })

  it('does not offer openings for 柱 — 1通則8) names 窓・出入口', () => {
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C1 1F-X2Y2' }))

    expect(screen.queryByTestId('opening-editor')).not.toBeInTheDocument()
  })

  it('adds an opening that fits inside the 内法 of the selected wall', () => {
    const wall = selectWall()
    render(<PlanEditor />)

    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))

    const stored = useAppStore
      .getState()
      .project.members.find(({ id }) => id === wall.id)!.openings!
    expect(stored).toHaveLength(1)
    // 内法 5200×3450 の中央に 1/3 の大きさ — 置いた瞬間にはみ出さない。
    const [opening] = stored
    expect(opening.xMm).toBeGreaterThanOrEqual(0)
    expect(opening.yMm).toBeGreaterThanOrEqual(0)
    expect(opening.xMm + opening.widthMm).toBeLessThanOrEqual(5200)
    expect(opening.yMm + opening.heightMm).toBeLessThanOrEqual(3450)
    expect(capture).toHaveBeenCalledWith('opening_edited', {
      memberKind: '耐震壁',
    })
  })

  it('edits an opening dimension through updateProject', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))

    const width = screen.getByLabelText(`W1 ${wall.id} 1 内法幅`)
    fireEvent.change(width, { target: { value: '1800' } })

    expect(
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.openings![0]
        .widthMm,
    ).toBe(1800)
  })

  it('marks an opening the clause does not deduct', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))

    fireEvent.change(screen.getByLabelText(`W1 ${wall.id} 1 内法幅`), {
      target: { value: '700' },
    })
    fireEvent.change(screen.getByLabelText(`W1 ${wall.id} 1 内法高さ`), {
      target: { value: '700' },
    })

    // 0.49㎡ — 「1か所当たり内法面積0.5㎡以下」なので欠除しない。
    expect(screen.getByText(/0\.5㎡以下/)).toBeInTheDocument()
  })

  it('warns when an opening leaves the 内法 instead of trimming it', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))

    fireEvent.change(screen.getByLabelText(`W1 ${wall.id} 1 内法幅`), {
      target: { value: '9000' },
    })

    // 切り詰めて受け取ると図面にない大きさの開口を製品が決めることになる。
    expect(screen.getByTestId('opening-outside')).toBeInTheDocument()
    expect(
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.openings![0]
        .widthMm,
    ).toBe(9000)
  })

  it('drops the key entirely when the last opening is removed', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))
    fireEvent.click(screen.getByRole('button', { name: `W1 ${wall.id} 1 削除` }))

    const stored = useAppStore
      .getState()
      .project.members.find(({ id }) => id === wall.id)!
    expect(stored).not.toHaveProperty('openings')
  })

  it('draws a 床板 opening at its true position, not inside the drawn inset', () => {
    const project = createSampleProject()
    const slab = project.members.find(({ kind }) => kind === '床板')!
    act(() => {
      useAppStore.setState({
        project: {
          ...project,
          members: project.members.map((member) =>
            member.id === slab.id
              ? {
                  ...member,
                  openings: [
                    {
                      id: 'op1',
                      xMm: 2400,
                      yMm: 2400,
                      widthMm: 1200,
                      heightMm: 1200,
                    },
                  ],
                }
              : member,
          ),
        },
      })
    })
    const { container } = render(<PlanEditor />)

    const rects = container.querySelectorAll('rect[class*="opening"]')
    expect(rects).toHaveLength(1)
    // 開口は正方形なので、平面でも幅と高さが等しく出る（実寸で写している証拠）。
    const width = Number(rects[0].getAttribute('width'))
    const height = Number(rects[0].getAttribute('height'))
    expect(width).toBeCloseTo(height, 6)
    expect(width).toBeGreaterThan(0)
  })
})

describe('StoryTabs', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  it('changes activeStoryId when a story tab is clicked', () => {
    render(<StoryTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '2階' }))

    expect(useAppStore.getState().activeStoryId).toBe('2F')
  })

  it('reports the story switch', () => {
    render(<StoryTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '2階' }))

    expect(capture).toHaveBeenCalledWith('story_selected')
  })

  // ViewerTabs·member_selected와 같은 기준 — 이미 활성인 층을 다시
  // 눌러도 전환이 아니다 (10차 리뷰 minor).
  it('does not report when clicking the already-active story tab', () => {
    render(<StoryTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '1階' }))

    expect(capture).not.toHaveBeenCalled()
  })

  it('follows a selection changed outside the plan pane', () => {
    render(<StoryTabs />)

    act(() => useAppStore.getState().selectMember('2F-X2Y2'))

    expect(screen.getByRole('tab', { name: '2階' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

})
