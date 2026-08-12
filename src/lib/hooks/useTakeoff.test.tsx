import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { gridPointCount } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { useTakeoff } from './useTakeoff'

describe('useTakeoff', () => {
  beforeEach(() => {
    useAppStore.setState({ project: createSampleProject() })
  })

  it('derives supported X大梁 rows and reports continuous Y大梁 separately', () => {
    const { result } = renderHook(() => useTakeoff())
    const project = useAppStore.getState().project
    const { nx, ny } = gridPointCount(project.grid)
    const columnsPerStory = nx * ny
    const supportedGirdersPerStory = (nx - 1) * ny
    const unsupportedGirdersPerStory = nx * (ny - 1)
    const xGirderIds = new Set(
      project.members
        .filter(
          (member) =>
            member.kind === '大梁' &&
            'axis' in member.position &&
            member.position.axis === 'X',
        )
        .map(({ id }) => id),
    )
    const yGirderIds = new Set(
      project.members
        .filter(
          (member) =>
            member.kind === '大梁' &&
            'axis' in member.position &&
            member.position.axis === 'Y',
        )
        .map(({ id }) => id),
    )
    const girderLines = result.current.lines.filter(
      ({ memberKind }) => memberKind === '大梁',
    )
    const firstStoryG1Lines = girderLines.filter(
      ({ storyName, mark }) => storyName === '1階' && mark === 'G1',
    )
    const firstStoryColumnLines = result.current.lines.filter(
      ({ storyName, memberKind }) =>
        storyName === '1階' && memberKind === '柱',
    )

    expect(result.current.rebars.length).toBeGreaterThan(0)
    expect(result.current.lines.length).toBeGreaterThan(0)
    expect(firstStoryG1Lines.map(({ role }) => role)).toEqual([
      '上端筋',
      '下端筋',
      'あばら筋',
    ])
    expect(
      girderLines.reduce((sum, { places }) => sum + places, 0),
    ).toBe(
      project.stories.length * supportedGirdersPerStory * 3,
    )
    expect(
      firstStoryColumnLines
        .filter(({ role }) => role === '主筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(columnsPerStory)
    expect(
      firstStoryColumnLines
        .filter(({ role }) => role === '帯筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(columnsPerStory)
    expect(result.current.unsupportedMembers).toHaveLength(
      project.stories.length * unsupportedGirdersPerStory,
    )
    expect(result.current.unsupportedMembers).toContainEqual({
      memberId: '1F-G1-X1Y1-Y',
      mark: 'G1',
      storyName: '1階',
      reason: '連続スパン',
    })
    expect(
      result.current.rebars.every(({ memberId }) => !yGirderIds.has(memberId)),
    ).toBe(true)
    expect(
      [...xGirderIds].every((memberId) =>
        result.current.rebars.some((rebar) => rebar.memberId === memberId),
      ),
    ).toBe(true)
    expect(result.current.hasInferred).toBe(true)
    expect(result.current.inferredRules.length).toBeGreaterThan(0)
  })

  it('keeps the other members when a 大梁 turns out unbuildable', () => {
    // 지점 柱를 줄이면 直線も折曲げも収まらない — 사용자 입력만으로 도달한다.
    // 그 부재만 미지원으로 빼고, 柱를 포함한 나머지 산정은 살아 있어야 한다.
    useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.kind === '柱' ? { ...section, b: 300, d: 300 } : section,
      ),
    }))

    const { result } = renderHook(() => useTakeoff())

    expect(
      result.current.unsupportedMembers.some(
        ({ reason }) => reason === '定着不成立',
      ),
    ).toBe(true)
    expect(
      result.current.lines.some(({ role }) => role === '主筋'),
    ).toBe(true)
  })

  it('lets a real defect through instead of hiding it as unsupported', () => {
    // 룰팩 공백·타입 위반까지 미지원으로 흡수하면 결함이 화면에서 사라진다.
    useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.kind === '大梁' ? { ...section, fc: 25 } : section,
      ),
    }))

    expect(() => renderHook(() => useTakeoff())).toThrow(/not found/i)
  })

  it('shares one computation across every consumer of the same Project', () => {
    // TakeoffPane · TakeoffActions · Viewer3D가 각각 호출한다. 각자 계산하면
    // 입력 한 글자에 파이프라인이 세 번 돈다.
    const first = renderHook(() => useTakeoff())
    const second = renderHook(() => useTakeoff())

    expect(second.result.current.lines).toBe(first.result.current.lines)
    expect(second.result.current.rebars).toBe(first.result.current.rebars)
  })

  it('recomputes once the Project is replaced', () => {
    const { result } = renderHook(() => useTakeoff())
    const before = result.current.lines

    useAppStore
      .getState()
      .updateProject((project) => ({ ...project, name: '別案件' }))

    const after = renderHook(() => useTakeoff()).result.current.lines

    expect(after).not.toBe(before)
    expect(after).toHaveLength(before.length)
  })
})
