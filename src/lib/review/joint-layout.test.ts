import { describe, expect, it } from 'vitest'

import { coverConditions, lookupRule } from '@/domain/rules/lookup'
import { createSampleProject } from '@/domain/model/sample-project'
import { gridPoint, memberGroupKey, storyElevation } from '@/domain/model/project'
import { projectFingerprints } from '@/domain/review/fingerprint'
import { jointMemberIds, resolveJoint } from '@/domain/review/joint'
import { quantityLineId } from '@/domain/quantity'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { buildingLayout } from '@/lib/viewer/building'
import {
  barDiameter,
  rebarRadius,
  type Bounds,
  type Point3,
} from '@/lib/viewer/geometry'
import { jpMlitRulePack } from '@/rulepack'

import { runGeometryCheck } from './geometry-check'
import { jointLayout, segmentFor } from './joint-layout'

function fixture(columnMemberId = '1F-X2Y1') {
  const project = createSampleProject()
  const takeoff = buildTakeoff(project)
  const resolution = resolveJoint(project, columnMemberId)
  if (resolution.status !== 'joint') throw new Error('joint fixture expected')

  return {
    project,
    takeoff,
    joint: resolution.joint,
    unsupportedMemberIds: new Set(
      takeoff.unsupportedMembers.map(({ memberId }) => memberId),
    ),
  }
}

function boundsOf(points: Point3[]): Bounds {
  const min: Point3 = [Infinity, Infinity, Infinity]
  const max: Point3 = [-Infinity, -Infinity, -Infinity]

  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis])
      max[axis] = Math.max(max[axis], point[axis])
    }
  }

  return { min, max }
}

function boxCorners(box: { center: Point3; size: Point3 }): Point3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => [
    box.center[0] + (mask & 1 ? 1 : -1) * box.size[0] / 2,
    box.center[1] + (mask & 2 ? 1 : -1) * box.size[1] / 2,
    box.center[2] + (mask & 4 ? 1 : -1) * box.size[2] / 2,
  ])
}

function layoutFor(columnMemberId = '1F-X2Y1') {
  const input = fixture(columnMemberId)
  const layout = jointLayout(
    input.project,
    input.takeoff.rebars,
    input.unsupportedMemberIds,
    input.joint,
  )
  return { ...input, layout }
}

describe('jointLayout', () => {
  it('uses quantity rows and maps the joint member scope', () => {
    const { project, takeoff, joint, unsupportedMemberIds } = fixture()
    const layout = jointLayout(project, takeoff.rebars, unsupportedMemberIds, joint)
    const lineIds = new Set(takeoff.lines.map(({ id }) => id))

    expect(layout.batches.every(({ rowId }) => lineIds.has(rowId))).toBe(true)
    expect([...layout.rowMembers.values()].flat()).toEqual(
      expect.arrayContaining([
        '1F-X2Y1',
        '1F-G1-X1Y1-X',
        '1F-G2-X2Y1-Y',
      ]),
    )
  })

  it('places the column hoop and girder upper main in independent world-coordinate oracles', () => {
    const { project, takeoff, joint, unsupportedMemberIds } = fixture()
    const layout = jointLayout(project, takeoff.rebars, unsupportedMemberIds, joint)
    const column = project.members.find(({ id }) => id === '1F-X2Y1')!
    const columnSection = project.sections.find(({ id }) => id === column.sectionId)
    if (columnSection?.kind !== '柱') throw new Error('column fixture expected')
    const cover = lookupRule(jpMlitRulePack, 'cover.minimum', coverConditions(columnSection)).value
    const fabricationCover = cover + lookupRule(
      jpMlitRulePack,
      'cover.fabrication.addition',
      {},
    ).value
    const columnPoint = gridPoint(project.grid, 1, 0)
    const hoopIndex = layout.segmentRefs.findIndex((refs) =>
      refs[0]?.memberId === column.id && refs[0].role === '帯筋',
    )
    expect(hoopIndex).toBeGreaterThanOrEqual(0)
    const hoop = layout.batches[hoopIndex].segments[0]
    expect(hoop.from[0]).toBeCloseTo(
      columnPoint.x - columnSection.b / 2 + fabricationCover + rebarRadius('D13'),
    )
    expect(hoop.from[2]).toBeCloseTo(
      columnPoint.y - columnSection.d / 2 + fabricationCover + rebarRadius('D13'),
    )

    const girderSection = project.sections.find(({ id }) => id === 'section-G1')
    if (girderSection?.kind !== '大梁') throw new Error('girder fixture expected')
    const girder = '1F-G1-X1Y1-X'
    const mainIndex = layout.segmentRefs.findIndex((refs) =>
      refs[0]?.memberId === girder && refs[0].role === '上端筋',
    )
    expect(mainIndex).toBeGreaterThanOrEqual(0)
    const main = layout.batches[mainIndex].segments.find(
      ({ from, to }) => from[1] === to[1],
    )
    if (main === undefined) throw new Error('horizontal main segment expected')
    const story = project.stories.find(({ id }) => id === '1F')!
    expect(main.from[1]).toBeCloseTo(
      storyElevation(project.stories, story.id) +
        story.height -
        fabricationCover -
        2 * rebarRadius(girderSection.stirrup.size) -
        rebarRadius('D25'),
    )
  })

  it('matches buildingLayout for every displayed segment reference', () => {
    const { project, takeoff, joint, unsupportedMemberIds } = fixture()
    const layout = jointLayout(project, takeoff.rebars, unsupportedMemberIds, joint)
    const building = buildingLayout(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      rebarRadius,
    )

    layout.batches.forEach((batch, batchIndex) => {
      batch.segments.forEach((segment, segmentIndex) => {
        const ref = layout.segmentRefs[batchIndex][segmentIndex]
        const instance = building.rebar.find(
          (candidate) =>
            candidate.memberId === ref.memberId &&
            candidate.rebarId === ref.rebarId &&
            candidate.barIndex === ref.barIndex &&
            candidate.segmentIndex === ref.segmentIndex,
        )
        expect(instance).toBeDefined()
        expect(segment.from).toEqual(instance?.from)
        expect(segment.to).toEqual(instance?.to)
      })
    })
  })

  it('keeps a continuous-run representative rebar for a terminal joint', () => {
    const { layout } = layoutFor('1F-X1Y3')

    expect(
      layout.segmentRefs.some((refs) =>
        refs.some(
          ({ memberId, role }) =>
            memberId === '1F-G1-X1Y1-Y' && role === '上端筋',
        ),
      ),
    ).toBe(true)
  })

  it('separates target and reference concrete boxes', () => {
    const { layout, joint } = layoutFor()
    const targetIds = new Set(layout.boxes.target.map(({ memberId }) => memberId))
    const referenceIds = new Set(
      layout.boxes.reference.map(({ memberId }) => memberId),
    )
    const runPeer = joint.reference.memberIds.find((id) => id.startsWith('1F-G2-'))

    expect([...referenceIds]).toEqual(
      expect.arrayContaining(['2F-X2Y1', runPeer]),
    )
    expect(targetIds).not.toContain('2F-X2Y1')
    expect(targetIds).not.toContain(runPeer)
    expect(referenceIds).not.toContain('1F-X1Y3')
    expect(targetIds).not.toContain('1F-X1Y3')
  })

  it('resolves geometry-check BarRefs and rejects an unknown reference', () => {
    const input = fixture()
    const result = runGeometryCheck({
      project: input.project,
      rebars: input.takeoff.rebars,
      unsupportedMemberIds: input.unsupportedMemberIds,
      joint: input.joint,
      settings: { clearance: null },
      exclusions: [],
      fingerprints: projectFingerprints(
        input.project,
        input.takeoff.rebars,
        input.unsupportedMemberIds,
        jpMlitRulePack,
        1,
        null,
      ),
    })
    const layout = jointLayout(
      input.project,
      input.takeoff.rebars,
      input.unsupportedMemberIds,
      input.joint,
    )
    const finding = result.findings[0]
    if (finding === undefined) throw new Error('geometry finding expected')
    expect(segmentFor(layout, finding.a)).not.toBeNull()
    expect(segmentFor(layout, finding.b)).not.toBeNull()
    expect(
      segmentFor(layout, { ...finding.a, rebarId: 'missing-rebar' }),
    ).toBeNull()
  })

  it('focuses the camera on the target column center', () => {
    const { project, layout } = layoutFor()
    const point = gridPoint(project.grid, 1, 0)
    const story = project.stories.find(({ id }) => id === '1F')!

    expect(layout.focusTarget).toEqual([
      point.x,
      storyElevation(project.stories, story.id) + story.height / 2,
      point.y,
    ])
  })

  it('bounds only target boxes and target rebar endpoints', () => {
    const { layout } = layoutFor()
    const targetPoints = layout.boxes.target.flatMap(boxCorners)
    const segmentPoints = layout.batches.flatMap(({ segments }) =>
      segments.flatMap(({ from, to }) => [from, to]),
    )
    expect(layout.bounds).toEqual(boundsOf([...targetPoints, ...segmentPoints]))

    const referenceColumn = layout.boxes.reference.find(
      ({ memberId }) => memberId === '2F-X2Y1',
    )
    expect(referenceColumn).toBeDefined()
    expect(referenceColumn!.center[1]).toBeGreaterThan(layout.bounds.max[1])
  })
})

describe('jointLayout row keys', () => {
  it('uses the same quantityLineId contract as the takeoff', () => {
    const { project, takeoff, joint, unsupportedMemberIds } = fixture()
    const layout = jointLayout(project, takeoff.rebars, unsupportedMemberIds, joint)
    const expected = new Set(
      takeoff.rebars
        .filter(({ memberId }) =>
          jointMemberIds(joint).includes(memberId) ||
          joint.reference.memberIds.includes(memberId),
        )
        .map((rebar) => {
          const member = project.members.find(({ id }) => id === rebar.memberId)!
          return quantityLineId(memberGroupKey(project, member), rebar)
        }),
    )

    expect(layout.batches.every(({ rowId }) => expected.has(rowId))).toBe(true)
    expect(barDiameter('D13')).toBe(13)
  })
})
