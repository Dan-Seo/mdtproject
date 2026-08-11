import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { PlanEditor, StoryTabs } from './PlanEditor'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('posthog-js', () => ({ default: { capture } }))

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

  it('keeps the 柱 mark label out of the clickable group so it matches the marker', () => {
    render(<PlanEditor />)

    const member = screen.getByRole('button', { name: 'C1 1F-X1Y1' })

    expect(member.querySelector('rect')).not.toBeNull()
    expect(member.querySelector('text')).toBeNull()
    expect(screen.getAllByText('C1')).toHaveLength(9)
  })

  it('adds an X span and regenerates the project grid members', () => {
    render(<PlanEditor />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Xスパンを追加' }),
    )

    const project = useAppStore.getState().project
    expect(project.grid.xSpans).toEqual([6000, 6000, 6000])
    expect(
      project.members.filter(
        ({ storyId, kind }) => storyId === '1F' && kind === '柱',
      ),
    ).toHaveLength(12)
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

describe('StoryTabs', () => {
  beforeEach(() => {
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

  it('follows a selection changed outside the plan pane', () => {
    render(<StoryTabs />)

    act(() => useAppStore.getState().selectMember('2F-X2Y2'))

    expect(screen.getByRole('tab', { name: '2階' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

})
