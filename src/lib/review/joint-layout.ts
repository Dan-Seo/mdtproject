import type { Opening, Section } from '@/domain/model/member'
import {
  findSection,
  memberGroupKey,
  slabRun,
  type Project,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { jointMemberIds, jointRebarMemberIds, type Joint } from '@/domain/review/joint'
import { quantityLineId } from '@/domain/quantity'
import { buildingLayout, memberWorldPoint, type ConcreteBox } from '@/lib/viewer/building'
import {
  rebarBatches,
  type Bounds,
  type Point3,
  type RebarBatch,
  type Segment,
} from '@/lib/viewer/geometry'

import type { BarRef } from './geometry-check'

export interface JointLayout {
  batches: RebarBatch[]
  segmentRefs: BarRef[][]
  boxes: { target: ConcreteBox[]; reference: ConcreteBox[] }
  bounds: Bounds
  rowMembers: Map<string, string[]>
  focusTarget: Point3
}

function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
}

function expandBounds(bounds: Bounds, point: Point3): void {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis])
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis])
  }
}

function boxCorners(box: ConcreteBox): Point3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => [
    box.center[0] + (mask & 1 ? 1 : -1) * box.size[0] / 2,
    box.center[1] + (mask & 2 ? 1 : -1) * box.size[1] / 2,
    box.center[2] + (mask & 4 ? 1 : -1) * box.size[2] / 2,
  ])
}

function openingsFor(
  project: Project,
  member: Project['members'][number],
  rebar: Rebar,
): Opening[] {
  if (member.kind === '床板') {
    return slabRun(
      project,
      member,
      rebar.role.startsWith('X方向') ? 'X' : 'Y',
    ).openings
  }

  return member.kind === '耐震壁' ? member.openings ?? [] : []
}

function sameRef(left: BarRef, right: BarRef): boolean {
  return (
    left.memberId === right.memberId &&
    left.rebarId === right.rebarId &&
    left.role === right.role &&
    left.size === right.size &&
    left.barIndex === right.barIndex &&
    left.segmentIndex === right.segmentIndex
  )
}

function worldBatch(
  batch: RebarBatch,
  worldPoint: (point: Point3) => Point3,
): RebarBatch {
  return {
    ...batch,
    segments: batch.segments.map((segment) => ({
      ...segment,
      from: worldPoint(segment.from),
      to: worldPoint(segment.to),
    })),
  }
}

function addRowMember(
  rowMembers: Map<string, string[]>,
  rowId: string,
  memberId: string,
): void {
  const members = rowMembers.get(rowId)
  if (members === undefined) rowMembers.set(rowId, [memberId])
  else if (!members.includes(memberId)) members.push(memberId)
}

function refsFor(
  rebar: Rebar,
  segments: Segment[],
  segmentIndices: Map<number, number>,
): BarRef[] {
  return segments.map((segment) => {
    const barIndex = segment.barIndex ?? 0
    const segmentIndex = segmentIndices.get(barIndex) ?? 0
    segmentIndices.set(barIndex, segmentIndex + 1)
    return {
      memberId: rebar.memberId,
      rebarId: rebar.id,
      role: rebar.role,
      size: rebar.size,
      barIndex,
      segmentIndex,
    }
  })
}

export function jointLayout(
  project: Project,
  rebars: Rebar[],
  unsupportedMemberIds: ReadonlySet<string>,
  joint: Joint,
): JointLayout {
  const building = buildingLayout(project, rebars, unsupportedMemberIds)
  const targetIds = new Set(jointMemberIds(joint))
  const referenceIds = new Set(joint.reference.memberIds)
  const boxes = {
    target: building.boxes.filter(({ memberId }) => targetIds.has(memberId)),
    reference: building.boxes.filter(({ memberId }) => referenceIds.has(memberId)),
  }
  const rebarMemberIds = new Set(jointRebarMemberIds(project, joint))
  const rebarsByMember = new Map<string, Rebar[]>()

  for (const rebar of rebars) {
    if (!rebarMemberIds.has(rebar.memberId)) continue
    const memberRebars = rebarsByMember.get(rebar.memberId)
    if (memberRebars === undefined) rebarsByMember.set(rebar.memberId, [rebar])
    else memberRebars.push(rebar)
  }

  const batches: RebarBatch[] = []
  const segmentRefs: BarRef[][] = []
  const rowMembers = new Map<string, string[]>()

  for (const memberId of rebarMemberIds) {
    if (unsupportedMemberIds.has(memberId)) continue
    const member = project.members.find(({ id }) => id === memberId)
    if (member === undefined) throw new Error(`Member not found: ${memberId}`)
    const section: Section = findSection(project, member.sectionId)
    const worldPoint = memberWorldPoint(project, member)

    for (const rebar of rebarsByMember.get(memberId) ?? []) {
      const rowId = quantityLineId(memberGroupKey(project, member), rebar)
      const localBatches = rebarBatches(
        [{ rowId, rebar, originOffsetMm: 0, openings: openingsFor(project, member, rebar) }],
        section,
      )
      const segmentIndices = new Map<number, number>()

      for (const batch of localBatches) {
        batches.push(worldBatch(batch, worldPoint))
        segmentRefs.push(refsFor(rebar, batch.segments, segmentIndices))
        addRowMember(rowMembers, rowId, memberId)
      }
    }
  }

  const bounds = emptyBounds()
  for (const box of boxes.target) {
    for (const point of boxCorners(box)) expandBounds(bounds, point)
  }
  for (const batch of batches) {
    for (const segment of batch.segments) {
      expandBounds(bounds, segment.from)
      expandBounds(bounds, segment.to)
    }
  }
  if (boxes.target.length === 0 && batches.length === 0) {
    bounds.min = [0, 0, 0]
    bounds.max = [0, 0, 0]
  }

  const focusBox = boxes.target.find(
    ({ memberId }) => memberId === joint.columnMemberId,
  )
  if (focusBox === undefined) {
    throw new Error(`Joint column box not found: ${joint.columnMemberId}`)
  }

  return {
    batches,
    segmentRefs,
    boxes,
    bounds,
    rowMembers,
    focusTarget: focusBox.center,
  }
}

export function segmentFor(layout: JointLayout, ref: BarRef): Segment | null {
  for (let batchIndex = 0; batchIndex < layout.segmentRefs.length; batchIndex += 1) {
    const refs = layout.segmentRefs[batchIndex]
    for (let segmentIndex = 0; segmentIndex < refs.length; segmentIndex += 1) {
      if (sameRef(refs[segmentIndex], ref)) {
        return layout.batches[batchIndex].segments[segmentIndex] ?? null
      }
    }
  }

  return null
}
