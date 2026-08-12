import { describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { gridPoint, gridPointCount } from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'

import { buildingLayout, groupInstancesByRadius } from './building'
import { rebarRadius } from './geometry'

const project = createSampleProject()

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
  rules: ['cover.minimum'],
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
  count: 3,
  rules: ['cover.minimum'],
  formula: 'test',
}

describe('buildingLayout', () => {
  it('creates one concrete box per member of the sample project', () => {
    const layout = buildingLayout(project, [])
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
    const layout = buildingLayout(project, [])
    const box = layout.boxes.find(({ memberId }) => memberId === '2F-X1Y1')

    // 1F 높이 4200 위에 2F(높이 3600)가 앉는다. 그리드 교점에 단면 중심 정렬.
    expect(box?.center).toEqual([0, 4200 + 3600 / 2, 0])
    expect(box?.size).toEqual([800, 3600, 800])
  })

  it('aligns girder tops to the story ceiling and respects section depth', () => {
    const layout = buildingLayout(project, [])
    const box = layout.boxes.find(
      ({ memberId }) => memberId === '1F-G2-X1Y2-X',
    )

    // G2: depth 700, X축 스팬 6000, y=2번째 통り(6000). 상단 = 1F 천장 4200.
    expect(box?.center).toEqual([3000, 4200 - 700 / 2, 6000])
    expect(box?.size).toEqual([6000, 700, 400])
  })

  it('translates 柱 rebar segments to the member grid position', () => {
    const layout = buildingLayout(project, [main, hoop])
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

  it('extends the bounds to cover rebar protruding beyond the boxes', () => {
    const layout = buildingLayout(project, [main, hoop])

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

    expect(() => buildingLayout(project, [orphan])).toThrow(
      'Member not found: no-such-member',
    )
  })
})

describe('groupInstancesByRadius', () => {
  it('groups instances by display radius for instanced rendering', () => {
    const layout = buildingLayout(project, [main, hoop])
    const groups = groupInstancesByRadius(layout.rebar)

    expect(groups.size).toBe(2)
    expect(groups.get(rebarRadius('D25'))).toHaveLength(12)
    expect(groups.get(rebarRadius('D13'))).toHaveLength(12)
  })
})
