import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { createStressProject } from '@/domain/model/stress-project'

import { useAppStore } from './store'

describe('useAppStore dev instrumentation', () => {
  // R4 성능 측정 하네스가 브라우저에서 대용량 Project를 주입할 방법이 필요하다 —
  // 이 노출이 없으면 dev-browser 스크립트가 스토어에 닿을 길이 없다.
  it('exposes the store on window for the stress-scale measurement harness', () => {
    expect((window as unknown as { __kijunStore?: unknown }).__kijunStore).toBe(
      useAppStore,
    )
  })
})

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
      viewerLayers: { main: true, hoop: true, concrete: true },
    })
  })

  it('starts in the member view and toggles to the building view', () => {
    expect(useAppStore.getInitialState().viewerMode).toBe('member')

    useAppStore.getState().setViewerMode('building')

    expect(useAppStore.getState().viewerMode).toBe('building')
  })

  it('starts with every viewer layer visible and toggles layers independently', () => {
    expect(useAppStore.getInitialState().viewerLayers).toEqual({
      main: true,
      hoop: true,
      concrete: true,
    })

    useAppStore.getState().toggleViewerLayer('hoop')

    expect(useAppStore.getState().viewerLayers).toEqual({
      main: true,
      hoop: false,
      concrete: true,
    })
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

describe('loadProject', () => {
  it('re-points the selection at the loaded 案件', () => {
    // 取り込んだ案件に、前の案件で選ばれていた部材 id は無い。選択を
    // そのままにすると3ペインが存在しない部材を指したままになる。
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: 'stale-group', memberId: 'stale-member' },
      activeStoryId: 'stale-story',
    })
    const loaded = createStressProject({
      xSpanCount: 1,
      ySpanCount: 1,
      storyCount: 1,
    })

    useAppStore.getState().loadProject(loaded)

    const { project, sel, activeStoryId } = useAppStore.getState()
    expect(project).toBe(loaded)

    const member = project.members.find(({ id }) => id === sel.memberId)
    expect(member).toBeDefined()
    expect(member?.kind).toBe('柱')
    expect(sel.group).not.toBe('stale-group')
    expect(activeStoryId).toBe(member?.storyId)
  })

  it('clears the hovered row, which belonged to the previous 案件', () => {
    useAppStore.setState({ hoverRowId: '1階|C|C1|主筋' })

    useAppStore.getState().loadProject(createSampleProject())

    expect(useAppStore.getState().hoverRowId).toBeNull()
  })
})
