import { describe, expect, it } from 'vitest'

import type {
  ColumnSection,
  GirderSection,
  Member,
} from '../model/member'
import type { Story, GirderRun, GirderSpan } from '../model/project'
import type { Rebar, Vec3 } from '../model/rebar'
import { jpMlitRulePack } from '../../rulepack'
import { generateColumnRebar } from './column'
import { generateGirderRebar } from './girder'
import { symmetricInwardDirections } from './stirrup-layout'

const columnMember: Member = {
  id: '1F-X1Y1',
  kind: '柱',
  memberClass: '躯体',
  sectionId: 'section-C1',
  storyId: '1F',
  position: { ix: 0, iy: 0 },
}

const rectangularColumn: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  shape: '矩形',
  b: 800,
  d: 600,
  fc: 24,
  grade: 'SD345',
  exposure: '屋内',
  finish: '仕上げあり',
  spliceMethod: '重ね継手',
  main: { size: 'D25', count: 8 },
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
}

const circularColumn: ColumnSection = {
  ...rectangularColumn,
  id: 'section-C2',
  mark: 'C2',
  shape: '円形',
  b: 600,
  d: 600,
}

const story: Story = { id: '1F', name: '1階', height: 4200 }

const girderMember: Member = {
  id: '1F-G1-X1Y1-X',
  kind: '大梁',
  memberClass: '躯体',
  sectionId: 'section-G1',
  storyId: '1F',
  position: { axis: 'X', ix: 0, iy: 0 },
}

const girderSection: GirderSection = {
  id: 'section-G1',
  kind: '大梁',
  mark: 'G1',
  b: 400,
  depth: 750,
  fc: 24,
  grade: 'SD345',
  exposure: '屋内',
  finish: '仕上げあり',
  spliceMethod: '重ね継手',
  main: {
    size: 'D25',
    top: { endCount: 4, centerCount: 4 },
    bottom: { endCount: 4, centerCount: 4 },
    cutoffFromSupportFaceMm: 0,
  },
  stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
}

const supportCover = {
  memberKind: '柱',
  soilContact: false,
  exposure: '屋内',
  finish: '仕上げあり',
}

const girderSpan: GirderSpan = {
  axis: 'X',
  centerSpan: 6000,
  clear: 5200,
  startFaceOffsetMm: 400,
  endFaceOffsetMm: 400,
  startSupportLengthAlongAxisMm: 800,
  endSupportLengthAlongAxisMm: 800,
  startSupportCover: supportCover,
  endSupportCover: supportCover,
}

const girderRun: GirderRun = {
  axis: 'X',
  members: [girderMember],
  ownerId: girderMember.id,
  spans: [girderSpan],
  memberOffsetsMm: [0],
  coreLengthMm: girderSpan.clear,
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return left.map((value, index) => value - right[index]) as Vec3
}

function add(left: Vec3, right: Vec3): Vec3 {
  return left.map((value, index) => value + right[index]) as Vec3
}

function scale(vector: Vec3, factor: number): Vec3 {
  return vector.map((value) => value * factor) as Vec3
}

function length(vector: Vec3): number {
  return Math.hypot(...vector)
}

function unit(vector: Vec3): Vec3 {
  return scale(vector, 1 / length(vector))
}

function dot(left: Vec3, right: Vec3): number {
  return left.reduce((total, value, index) => total + value * right[index], 0)
}

function angleBetween(left: Vec3, right: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(unit(left), unit(right)))))
}

function centreOf(points: Vec3[]): Vec3 {
  return scale(
    points.reduce((total, point) => add(total, point), [0, 0, 0]),
    1 / points.length,
  )
}

function assertSymmetricInwardTails(rebar: Rebar, inward: Vec3): void {
  const tails = rebar.hookTails
  expect(tails).toBeDefined()
  if (tails === undefined) return

  const vectors = tails.map((tail) => subtract(tail, rebar.points[0]))
  const directions = vectors.map(unit)

  expect(length(vectors[0])).toBeCloseTo(length(vectors[1]), 8)
  expect(directions[0]).not.toEqual(directions[1])
  expect(unit(add(directions[0], directions[1]))).toEqual(
    expect.objectContaining({
      0: expect.closeTo(unit(inward)[0], 8),
      1: expect.closeTo(unit(inward)[1], 8),
      2: expect.closeTo(unit(inward)[2], 8),
    }),
  )

  // 半開き45°だと矩形の角では二等分線±45°が隣接二辺の方向と一致し、
  // 尾が同半径の辺チューブに埋もれて見えない — 方向がどちらの辺とも
  // 重ならないことを固定する (ADR-040 세 번째 정정)。
  const edges = [
    unit(subtract(rebar.points[1], rebar.points[0])),
    unit(subtract(rebar.points.at(-1)!, rebar.points[0])),
  ]
  for (const direction of directions) {
    for (const edge of edges) {
      expect(angleBetween(direction, edge)).toBeGreaterThan(0.01)
    }
  }
}

function rectangularInward(points: Vec3[]): Vec3 {
  return add(unit(subtract(points[1], points[0])), unit(subtract(points.at(-1)!, points[0])))
}

function generatedHoop(
  section: ColumnSection,
): Rebar {
  const rebar = generateColumnRebar(
    {
      member: { ...columnMember, sectionId: section.id },
      section,
      story,
      beamDepthAbove: 750,
      ends: { bottom: 'なし', top: '先端' },
    },
    jpMlitRulePack,
  ).find(({ role }) => role === '帯筋')
  expect(rebar).toBeDefined()
  return rebar!
}

describe('shear-hook direction construction', () => {
  it('keeps the rectangular 柱 帯筋 tails equal, distinct, and inward-symmetric', () => {
    const hoop = generatedHoop(rectangularColumn)

    assertSymmetricInwardTails(hoop, rectangularInward(hoop.points))
  })

  it('derives 大梁 あばら筋 symmetry in its Y/Z section plane', () => {
    const stirrup = generateGirderRebar(
      { run: girderRun, section: girderSection },
      jpMlitRulePack,
    ).find(({ role }) => role === 'あばら筋')
    expect(stirrup).toBeDefined()

    assertSymmetricInwardTails(
      stirrup!,
      rectangularInward(stirrup!.points),
    )
  })

  it('derives 円形柱 帯筋 symmetry from the points toward their centre', () => {
    const hoop = generatedHoop(circularColumn)
    const inward = subtract(centreOf(hoop.points), hoop.points[0])

    assertSymmetricInwardTails(hoop, inward)
  })

  it('keeps the symmetricInwardDirections half-opening angle at Math.PI / 8', () => {
    const [first, second] = symmetricInwardDirections(0)

    expect(angleBetween([first[0], 0, first[1]], [second[0], 0, second[1]])).toBeCloseTo(
      2 * (Math.PI / 8),
      8,
    )
  })
})
