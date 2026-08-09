import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'

import { useAppStore } from './store'

describe('useAppStore initial state', () => {
  it('lands with a 柱 already selected so the 3D pane is not empty', () => {
    const { sel, activeStoryId, project } = useAppStore.getInitialState()

    expect(sel.memberId).not.toBeNull()
    expect(sel.group).not.toBeNull()

    const member = project.members.find(({ id }) => id === sel.memberId)
    expect(member?.kind).toBe('柱')
    expect(member?.storyId).toBe(activeStoryId)
  })
})

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      hoverRowId: null,
      locale: 'ja',
      activeStoryId: '1F',
      viewerMode: 'member',
    })
  })

  it('starts in the member view and toggles to the building view', () => {
    expect(useAppStore.getInitialState().viewerMode).toBe('member')

    useAppStore.getState().setViewerMode('building')

    expect(useAppStore.getState().viewerMode).toBe('building')
  })

  it('selectMember updates sel and switches to the member story', () => {
    useAppStore.getState().selectMember('2F-X2Y2')

    expect(useAppStore.getState().sel).toEqual({
      group: '2階|C|C1',
      memberId: '2F-X2Y2',
    })
    expect(useAppStore.getState().activeStoryId).toBe('2F')
  })

  it('selectGroup also switches to the representative member story', () => {
    useAppStore
      .getState()
      .selectGroup('2階|C|C1', '2F-X1Y1')

    expect(useAppStore.getState().sel).toEqual({
      group: '2階|C|C1',
      memberId: '2F-X1Y1',
    })
    expect(useAppStore.getState().activeStoryId).toBe('2F')
  })

  it('setHoverRow does not modify the independent member selection axis', () => {
    useAppStore.getState().selectMember('1F-X2Y2')
    const selection = useAppStore.getState().sel

    useAppStore.getState().setHoverRow('1階|C|C1|主筋')

    expect(useAppStore.getState().hoverRowId).toBe('1階|C|C1|主筋')
    expect(useAppStore.getState().sel).toEqual(selection)
  })

  it('does not store derived rebars or quantity lines', () => {
    const state = useAppStore.getState()

    expect(state).not.toHaveProperty('rebars')
    expect(state).not.toHaveProperty('quantityLines')
  })
})
