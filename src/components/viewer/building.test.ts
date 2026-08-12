import { describe, expect, it } from 'vitest'

import type { GirderSection, Member } from '@/domain/model/member'
import { createSampleProject } from '@/domain/model/sample-project'
import {
  findSection,
  girderRun,
  girderSpan,
  gridPoint,
  gridPointCount,
  storyElevation,
  type Project,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { generateGirderRebar } from '@/domain/rebar/girder'
import { jpMlitRulePack } from '@/rulepack'

import {
  buildingLayout,
  groupInstancesByLayerAndRadius,
  type RebarInstance,
} from './building'
import { rebarRadius, rebarSegments } from './geometry'

const project = createSampleProject()
const noUnsupportedMembers = new Set<string>()

// geometry.test.ts와 같은 대표 배근 픽스처 — memberId만 X2Y2(그리드 중앙)로 잡는다.
const main: Rebar = {
  id: '1F-X2Y2|main',
  memberId: '1F-X2Y2',
  role: '主筋',
  size: 'D25',
  shape: 'straight',
  points: [
    [40, -875, 40],
    [40, 5200, 40],
  ],
  closed: false,
  length: 6080,
  count: 12,
  ruleHits: [],
  formula: 'test',
}

const hoop: Rebar = {
  id: '1F-X2Y2|hoop',
  memberId: '1F-X2Y2',
  role: '帯筋',
  size: 'D13',
  shape: 'hoop',
  points: [
    [40, 0, 40],
    [760, 0, 40],
    [760, 0, 760],
    [40, 0, 760],
  ],
  closed: true,
  length: 3040,
  // 帯筋 전개는 도메인 배치를 따르므로 本数와 内法이 서로 맞아야 한다
  // (@100 × 内法 200 → 0·100·200의 3본).
  count: 3,
  placement: {
    axis: 'y',
    clearMm: 200,
    pitchMm: 100,
    startOffsetMm: 0,
    lastGapMm: 100,
  },
  ruleHits: [],
  formula: 'test',
}

function girderFixture(
  source: Project,
  memberId: string,
): { member: Member; section: GirderSection; rebars: Rebar[] } {
  const member = source.members.find(({ id }) => id === memberId)
  if (
    member?.kind !== '大梁' ||
    !('axis' in member.position)
  ) {
    throw new Error(`大梁 not found: ${memberId}`)
  }

  const section = findSection(source, member.sectionId)
  if (section.kind !== '大梁') {
    throw new Error(`大梁 member references a non-大梁 section: ${memberId}`)
  }

  return {
    member,
    section,
    rebars: generateGirderRebar(
      { run: girderRun(source, member), section },
      jpMlitRulePack,
    ),
  }
}

function roleRebar(rebars: Rebar[], role: Rebar['role']): Rebar {
  const rebar = rebars.find((candidate) => candidate.role === role)
  if (!rebar) throw new Error(`${role} not found`)
  return rebar
}

describe('buildingLayout', () => {
  it('creates one concrete box per member of the sample project', () => {
    const layout = buildingLayout(project, [], noUnsupportedMembers)
    const { nx, ny } = gridPointCount(project.grid)
    const columnCount = nx * ny * project.stories.length
    const girderCount =
      ((nx - 1) * ny + nx * (ny - 1)) * project.stories.length

    expect(layout.boxes).toHaveLength(columnCount + girderCount)
    expect(layout.boxes.filter(({ kind }) => kind === '柱')).toHaveLength(
      columnCount,
    )
    expect(layout.boxes.filter(({ kind }) => kind === '大梁')).toHaveLength(
      girderCount,
    )
  })

  it('places a 2F column on the accumulated story elevation', () => {
    const layout = buildingLayout(project, [], noUnsupportedMembers)
    const box = layout.boxes.find(({ memberId }) => memberId === '2F-X1Y1')

    // 1F 높이 4200 위에 2F(높이 3600)가 앉는다. 그리드 교점에 단면 중심 정렬.
    expect(box?.center).toEqual([0, 4200 + 3600 / 2, 0])
    expect(box?.size).toEqual([800, 3600, 800])
  })

  it('aligns girder tops to the story ceiling and respects section depth', () => {
    const layout = buildingLayout(project, [], noUnsupportedMembers)
    const box = layout.boxes.find(
      ({ memberId }) => memberId === '1F-G2-X1Y2-X',
    )

    // G2: depth 700, X축 스팬 6000, y=2번째 통り(6000). 상단 = 1F 천장 4200.
    expect(box?.center).toEqual([3000, 4200 - 700 / 2, 6000])
    expect(box?.size).toEqual([6000, 700, 400])
  })

  it('translates 柱 rebar segments to the member grid position', () => {
    const layout = buildingLayout(
      project,
      [main, hoop],
      noUnsupportedMembers,
    )
    const { x, y } = gridPoint(project.grid, 1, 1)
    // 단면 중심을 교점에 맞추므로 로컬 원점은 교점 − 단면/2 로 이동한다.
    const offsetX = x - 800 / 2
    const offsetZ = y - 800 / 2

    const mains = layout.rebar.filter(
      ({ radius }) => radius === rebarRadius('D25'),
    )
    expect(mains).toHaveLength(12)
    for (const instance of mains) {
      expect(instance.memberId).toBe('1F-X2Y2')
      expect(instance.from[0]).toBeGreaterThanOrEqual(offsetX)
      expect(instance.from[0]).toBeLessThanOrEqual(offsetX + 800)
      expect(instance.from[2]).toBeGreaterThanOrEqual(offsetZ)
      expect(instance.from[2]).toBeLessThanOrEqual(offsetZ + 800)
      // 主筋은 定着(−875)만큼 층 바닥(표고 0) 아래로 돌출한다.
      expect(instance.from[1]).toBe(-875)
      expect(instance.to[1]).toBe(5200)
    }

    const hoops = layout.rebar.filter(
      ({ radius }) => radius === rebarRadius('D13'),
    )
    // 폐합 4변 × 3본
    expect(hoops).toHaveLength(12)
    expect(hoops[0].from[0]).toBeCloseTo(offsetX + 40 + rebarRadius('D13'))
    expect(hoops[0].from[2]).toBeCloseTo(offsetZ + 40 + rebarRadius('D13'))
  })

  it('includes both single-span and continuous-run 大梁 rebar', () => {
    const supportedX = girderFixture(project, '1F-G1-X1Y1-X')
    const continuousY = girderFixture(project, '1F-G1-X1Y1-Y')
    const layout = buildingLayout(
      project,
      [...supportedX.rebars, ...continuousY.rebars],
      noUnsupportedMembers,
    )

    expect(
      layout.rebar.some(
        ({ memberId }) => memberId === supportedX.member.id,
      ),
    ).toBe(true)
    expect(
      layout.rebar.some(
        ({ memberId }) => memberId === continuousY.member.id,
      ),
    ).toBe(true)
  })

  it('maps an X-axis 大梁 上端筋 from the start 柱 face into world coordinates', () => {
    const fixture = girderFixture(project, '1F-G1-X1Y1-X')
    const top = roleRebar(fixture.rebars, '上端筋')
    const local = rebarSegments(top, fixture.section)[0]
    const span = girderSpan(project, fixture.member)
    const start = gridPoint(
      project.grid,
      fixture.member.position.ix,
      fixture.member.position.iy,
    )
    const story = project.stories.find(
      ({ id }) => id === fixture.member.storyId,
    )!
    const base =
      storyElevation(project.stories, story.id) +
      story.height -
      fixture.section.depth
    const expectedFrom = [
      start.x + span.startFaceOffsetMm + local.from[0],
      base + local.from[1],
      start.y - fixture.section.b / 2 + local.from[2],
    ]
    const expectedTo = [
      start.x + span.startFaceOffsetMm + local.to[0],
      base + local.to[1],
      start.y - fixture.section.b / 2 + local.to[2],
    ]

    expect(
      buildingLayout(project, fixture.rebars, noUnsupportedMembers).rebar,
    ).toContainEqual({
      memberId: fixture.member.id,
      from: expectedFrom,
      to: expectedTo,
      radius: local.radius,
      layer: 'main',
    })
  })

  it('maps a supported Y-axis 大梁 上端筋 with span along world Z', () => {
    const supportedYProject: Project = {
      ...project,
      members: project.members.filter(
        ({ id }) => id !== '1F-G1-X1Y2-Y',
      ),
    }
    const fixture = girderFixture(
      supportedYProject,
      '1F-G1-X1Y1-Y',
    )
    const top = roleRebar(fixture.rebars, '上端筋')
    const local = rebarSegments(top, fixture.section)[0]
    const span = girderSpan(supportedYProject, fixture.member)
    const start = gridPoint(
      supportedYProject.grid,
      fixture.member.position.ix,
      fixture.member.position.iy,
    )
    const story = supportedYProject.stories.find(
      ({ id }) => id === fixture.member.storyId,
    )!
    const base =
      storyElevation(supportedYProject.stories, story.id) +
      story.height -
      fixture.section.depth
    const expectedFrom = [
      start.x - fixture.section.b / 2 + local.from[2],
      base + local.from[1],
      start.y + span.startFaceOffsetMm + local.from[0],
    ]
    const expectedTo = [
      start.x - fixture.section.b / 2 + local.to[2],
      base + local.to[1],
      start.y + span.startFaceOffsetMm + local.to[0],
    ]

    expect(
      buildingLayout(
        supportedYProject,
        fixture.rebars,
        noUnsupportedMembers,
      ).rebar,
    ).toContainEqual({
      memberId: fixture.member.id,
      from: expectedFrom,
      to: expectedTo,
      radius: local.radius,
      layer: 'main',
    })
  })

  it('keeps every supported 大梁 segment inside the support 柱 exterior faces', () => {
    const generated = project.members.flatMap((member) =>
      member.kind === '大梁'
        ? girderFixture(project, member.id).rebars
        : [],
    )
    const layout = buildingLayout(project, generated, noUnsupportedMembers)

    for (const instance of layout.rebar) {
      const member = project.members.find(
        ({ id }) => id === instance.memberId,
      )!
      if (member.kind !== '大梁' || !('axis' in member.position)) continue

      const run = girderRun(project, member)
      const startMember = run.members[0]
      const endMember = run.members.at(-1)!
      if (
        !('axis' in startMember.position) ||
        !('axis' in endMember.position)
      ) {
        throw new Error('GirderRun contains a non-girder position')
      }
      const startSpan = run.spans[0]
      const endSpan = run.spans.at(-1)!
      const start = gridPoint(
        project.grid,
        startMember.position.ix,
        startMember.position.iy,
      )
      const end =
        member.position.axis === 'X'
          ? gridPoint(
              project.grid,
              endMember.position.ix + 1,
              endMember.position.iy,
            )
          : gridPoint(
              project.grid,
              endMember.position.ix,
              endMember.position.iy + 1,
            )
      const coordinate = member.position.axis === 'X' ? 0 : 2
      const startCenter = member.position.axis === 'X' ? start.x : start.y
      const endCenter = member.position.axis === 'X' ? end.x : end.y
      const exteriorStart =
        startCenter - startSpan.startSupportLengthAlongAxisMm / 2
      const exteriorEnd =
        endCenter + endSpan.endSupportLengthAlongAxisMm / 2

      for (const point of [instance.from, instance.to]) {
        expect(point[coordinate]).toBeGreaterThanOrEqual(exteriorStart)
        expect(point[coordinate]).toBeLessThanOrEqual(exteriorEnd)
      }
    }
  })

  it('extends the bounds to cover rebar protruding beyond the boxes', () => {
    const layout = buildingLayout(
      project,
      [main, hoop],
      noUnsupportedMembers,
    )

    // 최저점: 主筋 하단 −875 − 표시 반경. 최고점: 2F 천장 7800.
    expect(layout.bounds.min[1]).toBeLessThanOrEqual(-875)
    expect(layout.bounds.max[1]).toBeGreaterThanOrEqual(7800)
    expect(layout.bounds.min[0]).toBeLessThanOrEqual(0)
    expect(layout.bounds.max[0]).toBeGreaterThanOrEqual(
      project.grid.xSpans.reduce((sum, span) => sum + span, 0),
    )
  })

  it('throws when a rebar references an unknown member', () => {
    const orphan: Rebar = { ...main, memberId: 'no-such-member' }

    expect(() =>
      buildingLayout(project, [orphan], noUnsupportedMembers),
    ).toThrow(
      'Member not found: no-such-member',
    )
  })

  it('maps continuous-run main bars through the intermediate 柱 to the run end', () => {
    const fixture = girderFixture(project, '1F-G1-X1Y1-Y')
    const run = girderRun(project, fixture.member)
    const startMember = run.members[0]
    if (!('axis' in startMember.position)) {
      throw new Error('GirderRun contains a non-girder position')
    }

    const start = gridPoint(
      project.grid,
      startMember.position.ix,
      startMember.position.iy,
    )
    const endInteriorFace =
      start.y + run.spans[0].startFaceOffsetMm + run.coreLengthMm
    const layout = buildingLayout(
      project,
      fixture.rebars,
      noUnsupportedMembers,
    )
    const mainInstances = layout.rebar.filter(
      ({ memberId, layer }) =>
        memberId === run.ownerId && layer === 'main',
    )
    const worldZ = mainInstances.flatMap(({ from, to }) => [from[2], to[2]])

    expect(mainInstances.length).toBeGreaterThan(0)
    expect(Math.min(...worldZ)).toBeLessThan(start.y)
    expect(Math.max(...worldZ)).toBeGreaterThan(endInteriorFace)
  })

  it('keeps unsupported member concrete but filters all of its rebar instances', () => {
    const fixture = girderFixture(project, '1F-G1-X1Y1-Y')
    const run = girderRun(project, fixture.member)
    const unsupportedMemberIds = new Set(
      run.members.map(({ id }) => id),
    )
    const layout = buildingLayout(
      project,
      fixture.rebars,
      unsupportedMemberIds,
    )

    expect(
      layout.boxes.filter(({ memberId }) => unsupportedMemberIds.has(memberId)),
    ).toHaveLength(run.members.length)
    expect(
      layout.rebar.some(({ memberId }) => unsupportedMemberIds.has(memberId)),
    ).toBe(false)
  })
})

describe('groupInstancesByLayerAndRadius', () => {
  it('groups instances by display radius for instanced rendering', () => {
    const layout = buildingLayout(
      project,
      [main, hoop],
      noUnsupportedMembers,
    )
    const groups = groupInstancesByLayerAndRadius(layout.rebar)

    expect(groups.size).toBe(2)
    expect(groups.get(`${rebarRadius('D25')}|main`)).toHaveLength(12)
    expect(groups.get(`${rebarRadius('D13')}|hoop`)).toHaveLength(12)
  })

  it('separates the same display radius by rebar layer', () => {
    const radius = rebarRadius('D25')
    const instances: RebarInstance[] = [
      {
        memberId: 'main',
        from: [0, 0, 0],
        to: [0, 1, 0],
        radius,
        layer: 'main',
      },
      {
        memberId: 'hoop',
        from: [0, 0, 0],
        to: [1, 0, 0],
        radius,
        layer: 'hoop',
      },
    ]

    const groups = groupInstancesByLayerAndRadius(instances)

    expect([...groups.keys()]).toEqual([
      `${radius}|main`,
      `${radius}|hoop`,
    ])
  })
})
