import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { gridPointCount } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { PlanEditor, placePlanMember, StoryTabs } from './PlanEditor'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/telemetry', () => ({ capture }))

describe('PlanEditor', () => {

  // 通り芯의 이름은 도면에 있는 것이다. 없을 때 index로 지어내지 않고,
  // 있을 때 그것을 쓰는 것이 図面と製品を突き合わせる唯一の手がかりになる。
  it('通り芯 이름이 있으면 스팬을 그 이름으로 부른다', () => {
    act(() => {
      const { project } = useAppStore.getState()
      useAppStore.setState({
        project: {
          ...project,
          grid: {
            ...project.grid,
            xLabels: Array.from(
              { length: project.grid.xSpans.length + 1 },
              (_, index) => `bX${index + 1}`,
            ),
          },
        },
      })
    })

    render(<PlanEditor />)

    expect(screen.getByLabelText('bX1-bX2')).toBeInTheDocument()
  })

  it('이름이 없으면 축과 순번으로 부른다 — index로 이름을 지어내지 않는다', () => {
    render(<PlanEditor />)

    expect(screen.getByLabelText('Xスパン 1')).toBeInTheDocument()
  })
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

  it('draws a wall only over its partial extent and labels the height extent', () => {
    const project = createSampleProject()
    const wall = project.members.find(({ kind }) => kind === '耐震壁')!

    const { container } = render(<PlanEditor />)
    const fullWallButton = screen.getByRole('button', {
      name: `W1 ${wall.id}`,
    })
    const fullWallLines = fullWallButton.querySelectorAll('line')
    const fullWallFace = fullWallLines[2]
    if (fullWallFace === undefined) {
      throw new Error('Full wall face was not rendered')
    }
    const fullLength = Math.abs(
      Number(fullWallFace.getAttribute('y2')) -
        Number(fullWallFace.getAttribute('y1')),
    )

    act(() =>
      useAppStore.setState({
        project: {
          ...project,
          members: project.members.map((member) =>
            member.id === wall.id
              ? {
                  ...member,
                  wallExtent: {
                    horizontal: { anchor: '終端', lengthMm: 2400 },
                    vertical: { anchor: '下端', heightMm: 900 },
                  },
                }
              : member,
          ),
        },
      }),
    )

    const wallButton = screen.getByRole('button', { name: `W1 ${wall.id}` })
    const wallLines = wallButton.querySelectorAll('line')
    const visibleWall = wallLines[2]
    if (visibleWall === undefined) throw new Error('Wall face was not rendered')

    const drawnLength = Math.abs(
      Number(visibleWall.getAttribute('y2')) -
        Number(visibleWall.getAttribute('y1')),
    )
    expect(drawnLength).toBeGreaterThan(0)
    expect(drawnLength).toBeLessThan(fullLength * 0.6)
    expect(screen.getByTestId('wall-extent-label')).toHaveTextContent(
      '腰壁 H=900',
    )
    expect(container.querySelectorAll('[data-testid="wall-extent-label"]')).toHaveLength(1)
  })
})

describe('PlanEditor 壁・床板の配置と削除 (ADR-038)', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  function setProject(project: ReturnType<typeof createSampleProject>) {
    act(() => useAppStore.setState({ project }))
  }

  it('offers only an empty, measurable edge and places a selected 耐震壁 section there', () => {
    const project = createSampleProject()
    setProject({
      ...project,
      members: project.members.filter(({ kind }) => kind !== '耐震壁'),
    })
    render(<PlanEditor />)

    fireEvent.click(screen.getByTestId('placement-wall-X-0-0'))

    const placed = useAppStore
      .getState()
      .project.members.find(({ id }) => id === '1F-W1-0-0-X')
    expect(placed).toMatchObject({
      id: '1F-W1-0-0-X',
      kind: '耐震壁',
      memberClass: '躯体',
      sectionId: 'section-W1',
      storyId: '1F',
      position: { axis: 'X', ix: 0, iy: 0 },
    })
    expect(screen.queryByTestId('placement-wall-X-0-0')).not.toBeInTheDocument()
  })

  it('places 床板 only in an empty bay surrounded by four 大梁', () => {
    const project = createSampleProject()
    setProject({
      ...project,
      members: project.members.filter(({ kind }) => kind !== '床板'),
    })
    render(<PlanEditor />)

    fireEvent.click(screen.getByTestId('placement-slab-0-0'))

    expect(
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === '1F-S1-0-0'),
    ).toMatchObject({
      kind: '床板',
      memberClass: '躯体',
      sectionId: 'section-S1',
      position: { ix: 0, iy: 0 },
    })
  })

  it('does not offer a wall edge when its 大梁 or endpoint 柱 is absent', () => {
    const project = createSampleProject()
    const withoutGirder = project.members.filter(
      ({ id }) => id !== '1F-G1-X1Y1-X',
    )
    setProject({
      ...project,
      members: withoutGirder.filter(({ kind }) => kind !== '耐震壁'),
    })
    const { rerender } = render(<PlanEditor />)
    expect(screen.queryByTestId('placement-wall-X-0-0')).not.toBeInTheDocument()

    setProject({
      ...project,
      members: project.members.filter(
        ({ id, kind }) => id !== '1F-X1Y1' && kind !== '耐震壁',
      ),
    })
    rerender(<PlanEditor />)
    expect(screen.queryByTestId('placement-wall-X-0-0')).not.toBeInTheDocument()
  })

  it('does not offer a bay when one of its four surrounding 大梁 is absent', () => {
    const project = createSampleProject()
    setProject({
      ...project,
      members: project.members.filter(
        ({ id, kind }) => id !== '1F-G1-X1Y1-X' && kind !== '床板',
      ),
    })
    render(<PlanEditor />)

    expect(screen.queryByTestId('placement-slab-0-0')).not.toBeInTheDocument()
  })

  it('shows only section guidance and no candidates when a section kind is absent', () => {
    const project = createSampleProject()
    setProject({
      ...project,
      sections: project.sections.filter(({ kind }) => kind !== '耐震壁'),
      members: project.members.filter(({ kind }) => kind !== '耐震壁'),
    })
    render(<PlanEditor />)

    expect(screen.getByTestId('placement-wall-no-section')).toBeInTheDocument()
    expect(screen.queryByTestId('placement-wall-X-0-0')).not.toBeInTheDocument()
  })

  it('rejects a second placement with the same position and 符号', () => {
    const project = createSampleProject()
    const withoutWalls = {
      ...project,
      members: project.members.filter(({ kind }) => kind !== '耐震壁'),
    }
    const first = placePlanMember(withoutWalls, '1F', 'section-W1', {
      axis: 'X',
      ix: 0,
      iy: 0,
    })
    expect(first.member).toBeDefined()

    const second = placePlanMember(first.project, '1F', 'section-W1', {
      axis: 'X',
      ix: 0,
      iy: 0,
    })
    expect(second.reason).toBe('duplicate')
    expect(second.project.members).toHaveLength(first.project.members.length)
  })

  it('deletes the selected wall, including its openings and wallExtent, without changing other members', () => {
    const project = createSampleProject()
    const wall = project.members.find(({ kind }) => kind === '耐震壁')!
    const withDetails = {
      ...project,
      members: project.members.map((member) =>
        member.id === wall.id
          ? {
              ...member,
              openings: [
                {
                  id: 'opening-to-delete',
                  xMm: 100,
                  yMm: 100,
                  widthMm: 800,
                  heightMm: 800,
                },
              ],
              wallExtent: {
                vertical: { anchor: '下端' as const, heightMm: 900 },
              },
            }
          : member,
      ),
    }
    setProject(withDetails)
    act(() => useAppStore.getState().selectMember(wall.id))
    render(<PlanEditor />)

    const otherIds = withDetails.members
      .filter(({ id }) => id !== wall.id)
      .map(({ id }) => id)
    fireEvent.click(screen.getByTestId('delete-member'))

    const state = useAppStore.getState()
    expect(state.project.members.find(({ id }) => id === wall.id)).toBeUndefined()
    expect(state.project.members.map(({ id }) => id)).toEqual(otherIds)
    expect(state.sel).toEqual({ group: null, memberId: null })
  })

  it('deletes a selected 床板 and does not expose deletion for a selected 柱', () => {
    const project = createSampleProject()
    const slab = project.members.find(({ kind }) => kind === '床板')!
    setProject(project)
    act(() => useAppStore.getState().selectMember(slab.id))
    const { rerender } = render(<PlanEditor />)

    expect(screen.getByTestId('delete-member')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('delete-member'))
    expect(
      useAppStore.getState().project.members.find(({ id }) => id === slab.id),
    ).toBeUndefined()

    const column = useAppStore
      .getState()
      .project.members.find(({ kind }) => kind === '柱')!
    act(() => useAppStore.getState().selectMember(column.id))
    rerender(<PlanEditor />)
    expect(screen.queryByTestId('delete-member')).not.toBeInTheDocument()
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

  it('edits an 開口補強筋 transcription through updateProject', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))
    fireEvent.click(
      screen.getByRole('button', { name: '開口補強筋を追加' }),
    )

    fireEvent.change(
      screen.getByLabelText(
        `W1 ${wall.id} 1 開口補強筋（設計図書から転記） 1 径`,
      ),
      { target: { value: 'D16' } },
    )
    fireEvent.change(
      screen.getByLabelText(
        `W1 ${wall.id} 1 開口補強筋（設計図書から転記） 1 本数`,
      ),
      { target: { value: '4' } },
    )
    fireEvent.change(
      screen.getByLabelText(
        `W1 ${wall.id} 1 開口補強筋（設計図書から転記） 1 設計長さ (mm)`,
      ),
      { target: { value: '1800' } },
    )

    const reinforcement =
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.openings![0]
        .reinforcements![0]
    expect(reinforcement).toEqual({ size: 'D16', count: 4, lengthMm: 1800 })
  })

  it('marks a newly added zero-length row as untranscribed', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))
    fireEvent.click(
      screen.getByRole('button', { name: '開口補強筋を追加' }),
    )

    expect(
      screen.getByTestId('opening-reinforcement-untranscribed'),
    ).toHaveTextContent('未転記')
    expect(
      screen.getByTestId('opening-reinforcement-untranscribed'),
    ).toHaveTextContent('数量に計上されません')
    expect(wall.id).toBeTruthy()
  })

  it('deletes only the selected 開口補強筋 row', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))
    fireEvent.click(
      screen.getByRole('button', { name: '開口補強筋を追加' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '開口補強筋を追加' }),
    )

    const removeButtons = screen.getAllByRole('button', {
      name: /補強筋を削除$/,
    })
    expect(removeButtons).toHaveLength(2)
    fireEvent.click(removeButtons[0])

    const stored =
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.openings![0]
        .reinforcements!
    expect(stored).toHaveLength(1)
  })

  it('drops the reinforcements key when the last transcription row is removed', () => {
    const wall = selectWall()
    render(<PlanEditor />)
    fireEvent.click(screen.getByRole('button', { name: '開口部を追加' }))
    fireEvent.click(
      screen.getByRole('button', { name: '開口補強筋を追加' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /補強筋を削除$/ }),
    )

    const stored =
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.openings![0]
    expect(stored).not.toHaveProperty('reinforcements')
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

describe('PlanEditor 壁の内法範囲入力 (ADR-037)', () => {
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

  it('defaults both axes to 指定しない（全内法）', () => {
    selectWall()
    render(<PlanEditor />)

    expect(screen.getByTestId('wall-extent-editor')).toBeInTheDocument()
    expect(screen.getByTestId('wall-extent-vertical-anchor')).toHaveValue(
      'none',
    )
    expect(screen.getByTestId('wall-extent-horizontal-anchor')).toHaveValue(
      'none',
    )
    expect(
      useAppStore
        .getState()
        .project.members.find(({ kind }) => kind === '耐震壁'),
    ).not.toHaveProperty('wallExtent')
  })

  it('stores each selected axis and deletes an axis when reset to 全内法', () => {
    const wall = selectWall()
    render(<PlanEditor />)

    fireEvent.change(screen.getByTestId('wall-extent-vertical-anchor'), {
      target: { value: '下端' },
    })
    fireEvent.change(screen.getByTestId('wall-extent-vertical-dimension'), {
      target: { value: '900' },
    })
    fireEvent.change(screen.getByTestId('wall-extent-horizontal-anchor'), {
      target: { value: '終端' },
    })
    fireEvent.change(screen.getByTestId('wall-extent-horizontal-dimension'), {
      target: { value: '2400' },
    })

    expect(
      useAppStore.getState().project.members.find(({ id }) => id === wall.id),
    ).toMatchObject({
      wallExtent: {
        vertical: { anchor: '下端', heightMm: 900 },
        horizontal: { anchor: '終端', lengthMm: 2400 },
      },
    })

    fireEvent.change(screen.getByTestId('wall-extent-vertical-anchor'), {
      target: { value: 'none' },
    })
    expect(
      useAppStore.getState().project.members.find(({ id }) => id === wall.id),
    ).toMatchObject({
      wallExtent: { horizontal: { anchor: '終端', lengthMm: 2400 } },
    })
    expect(
      useAppStore
        .getState()
        .project.members.find(({ id }) => id === wall.id)!.wallExtent,
    ).not.toHaveProperty('vertical')

    fireEvent.change(screen.getByTestId('wall-extent-horizontal-anchor'), {
      target: { value: 'none' },
    })
    expect(
      useAppStore.getState().project.members.find(({ id }) => id === wall.id),
    ).not.toHaveProperty('wallExtent')
  })

  it('keeps an out-of-range value and shows the domain rejection', () => {
    const wall = selectWall()
    render(<PlanEditor />)

    fireEvent.change(screen.getByTestId('wall-extent-vertical-anchor'), {
      target: { value: '下端' },
    })
    fireEvent.change(screen.getByTestId('wall-extent-vertical-dimension'), {
      target: { value: '99999' },
    })

    expect(
      useAppStore.getState().project.members.find(({ id }) => id === wall.id),
    ).toMatchObject({ wallExtent: { vertical: { heightMm: 99999 } } })
    expect(screen.getByTestId('wall-extent-invalid')).toHaveTextContent(
      '寸法不成立',
    )
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
