import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { girderRun, gridPointCount } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

import { useTakeoff } from './useTakeoff'

describe('useTakeoff', () => {
  beforeEach(() => {
    useAppStore.setState({ project: createSampleProject() })
  })

  it('derives one 通し筋 pair per run and あばら筋 per member', () => {
    // 종전 테스트는 連続スパン Y大梁이 미지원 목록에 들어가는지 보증했다.
    // 이제 같은 샘플 형상을 유지한 채 Y방향 런도 通し筋으로 산정되고,
    // 산정 단위가 부재가 아니라 런으로 바뀌었음을 행 수로 보증한다.
    const { result } = renderHook(() => useTakeoff())
    const project = useAppStore.getState().project
    const { nx, ny } = gridPointCount(project.grid)
    const columnsPerStory = nx * ny
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
    const girderLines = result.current.lines.filter(
      ({ memberKind }) => memberKind === '大梁',
    )
    const firstStoryG1Lines = girderLines.filter(
      ({ storyName, mark }) => storyName === '1階' && mark === 'G1',
    )
    const firstStoryGirderLines = girderLines.filter(
      ({ storyName }) => storyName === '1階',
    )
    const firstStoryColumnLines = result.current.lines.filter(
      ({ storyName, memberKind }) =>
        storyName === '1階' && memberKind === '柱',
    )

    expect(result.current.rebars.length).toBeGreaterThan(0)
    expect(result.current.lines.length).toBeGreaterThan(0)
    // 単一 스팬 런 2개와 2스팬 런 1개가 만드는 행 구성을 그대로 박는다.
    // あばら筋·幅止め筋·腹筋은 X·Y 스팬 内法이 같아 각각 한 행으로 묶이고
    // places로 세어진다 — 셋 다 부재(梁)마다 생기는 배근이라 런으로 묶이지 않는다.
    // 継手 행(箇所)은 単一 스팬 런에도 붙는다 — 単独梁이라 1通則4)로 돌아가는데
    // 折曲げ定着 全長이 5.3.4(5)(ｲ)(a)의 L1 하한을 받으면서 D25 通し筋이 7.2m가
    // 되어 7.0m를 넘긴다(1か所). 2스팬 런은 連続梁이라 （３）梁2)의 11.2m ＝ 2か所.
    expect(firstStoryG1Lines.map(({ role, unit }) => `${role}/${unit}`)).toEqual([
      '上端筋/kg',
      '上端筋/箇所',
      '下端筋/kg',
      '下端筋/箇所',
      'あばら筋/kg',
      '幅止め筋/kg',
      '腹筋/kg',
      '上端筋/kg',
      '上端筋/箇所',
      '下端筋/kg',
      '下端筋/箇所',
    ])
    // 샘플 1층: X 단일 스팬 런 3 + Y 2스팬 런 2 = 5런.
    // 같은 길이·符号는 QuantityLine 한 행으로 묶일 수 있으므로 places 합으로
    // 通し筋은 런 수, あばら筋은 실제 부재 수(3 + 2×2 = 7)를 검산한다.
    // 箇所 행은 같은 役割로 따로 서므로 質量 행만 세어야 런 수가 된다.
    const firstStoryGirderMassLines = firstStoryGirderLines.filter(
      ({ unit }) => unit === 'kg',
    )
    expect(
      firstStoryGirderMassLines
        .filter(({ role }) => role === '上端筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(5)
    expect(
      firstStoryGirderMassLines
        .filter(({ role }) => role === '下端筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(5)
    expect(
      firstStoryGirderMassLines
        .filter(({ role }) => role === 'あばら筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(7)
    // 柱主筋에도 継手 행이 붙는다（（２）柱2) 各階ごとに1か所）— 여기서 세려는
    // 것은 부재 수이므로 質量 행만 센다.
    const firstStoryColumnMassLines = firstStoryColumnLines.filter(
      ({ unit }) => unit === 'kg',
    )
    expect(
      firstStoryColumnMassLines
        .filter(({ role }) => role === '主筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(columnsPerStory)
    expect(
      firstStoryColumnMassLines
        .filter(({ role }) => role === '帯筋')
        .reduce((sum, { places }) => sum + places, 0),
    ).toBe(columnsPerStory)
    const yOwner = project.members.find(
      ({ id }) => id === '1F-G1-X1Y1-Y',
    )!
    const yRun = girderRun(project, yOwner)
    expect(
      result.current.rebars
        .filter(({ memberId }) => memberId === yRun.ownerId)
        .map(({ role }) => role),
    ).toEqual(['上端筋', '下端筋', 'あばら筋', '幅止め筋', '腹筋'])
    expect(
      yRun.members.every(({ id: memberId }) =>
        result.current.rebars.some(
          (rebar) => rebar.memberId === memberId && rebar.role === 'あばら筋',
        ),
      ),
    ).toBe(true)
    expect(
      [...xGirderIds].every((memberId) =>
        result.current.rebars.some((rebar) => rebar.memberId === memberId),
      ),
    ).toBe(true)
    expect(result.current.hasUnverified).toBe(true)
    expect(result.current.unverifiedRules.length).toBeGreaterThan(0)
    // kg 행은 JIS 単位質量(원문 미확보)을 반드시 타므로 추론 근거도 남는다.
    expect(result.current.inferredRules.length).toBeGreaterThan(0)
  })

  it('reports every member of an unsupported run and keeps other runs and 柱', () => {
    const targetIds = ['1F-G1-X1Y1-Y', '1F-G1-X1Y2-Y']

    // 한 Y방향 2스팬 런에만 별도 단면을 붙여 あばら筋 배치구간을 불성립시킨다.
    // 깨진 스팬 하나가 있으면 通し筋까지 생성되지 않으므로 런의 두 부재가 모두
    // 미지원이어야 하며, 다른 런과 柱 산정은 계속되어야 한다.
    useAppStore.getState().updateProject((project) => {
      const girderSection = project.sections.find(
        ({ id }) => id === 'section-G1',
      )
      if (girderSection?.kind !== '大梁') {
        throw new Error('expected section-G1')
      }

      return {
        ...project,
        sections: [
          ...project.sections,
          {
            ...girderSection,
            id: 'section-G1-unsupported',
            stirrup: {
              ...girderSection.stirrup,
              startOffsetMm: 3000,
            },
          },
        ],
        members: project.members.map((member) =>
          targetIds.includes(member.id)
            ? { ...member, sectionId: 'section-G1-unsupported' }
            : member,
        ),
      }
    })

    const { result } = renderHook(() => useTakeoff())

    const unsupportedTargetIds = result.current.unsupportedMembers
      .filter(
        ({ storyName, reason }) =>
          storyName === '1階' && reason === '寸法不成立',
      )
      .map(({ memberId }) => memberId)

    expect(unsupportedTargetIds).toEqual(targetIds)
    expect(
      result.current.rebars.some(
        ({ memberId, role }) =>
          memberId === '1F-G2-X2Y1-Y' && role === '上端筋',
      ),
    ).toBe(true)
    expect(result.current.lines.some(({ role }) => role === '主筋')).toBe(true)
  })

  it('keeps the other members when a 柱 turns out unbuildable', () => {
    // 帯筋 初期オフセット은 이제 断面一覧 입력이라 사용자가 배치 구간을 넘길 수
    // 있다. 大梁과 같이 그 부재만 빠져야 하고, 페인이 죽으면 안 된다.
    useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.kind === '柱'
          ? { ...section, hoop: { ...section.hoop, startOffsetMm: 5000 } }
          : section,
      ),
    }))

    const { result } = renderHook(() => useTakeoff())

    expect(
      result.current.unsupportedMembers.some(
        ({ reason }) => reason === '寸法不成立',
      ),
    ).toBe(true)
    expect(result.current.lines.some(({ role }) => role === '上端筋')).toBe(
      true,
    )
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
