import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { gridPointCount } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { PlanEditor, StoryTabs } from './PlanEditor'

describe('PlanEditor', () => {
  beforeEach(() => {
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
    expect(member).toHaveAttribute('aria-pressed', 'true')
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
