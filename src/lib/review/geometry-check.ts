import type { Project } from '@/domain/model/project'
import type { RebarRole } from '@/domain/model/rebar'
import type { ShearBarSize } from '@/domain/model/member'
import {
  checkConditionsFingerprint,
  canonicalJson,
  hashString,
} from '@/domain/review/fingerprint'
import {
  jointMemberIds,
  jointRebarMemberIds,
  type Joint,
} from '@/domain/review/joint'
import type {
  CheckExclusion,
  ClearanceBasis,
  FindingKind,
  ReviewFingerprints,
} from '@/domain/review/types'
import {
  buildingLayout,
  type RebarInstance,
} from '@/lib/viewer/building'
import { barDiameter, type Point3 } from '@/lib/viewer/geometry'

import { capsuleClearanceMm, type Segment } from './segment-distance'

export type { FindingKind } from '@/domain/review/types'

export const GEOMETRY_CHECK_VERSION = 1
// Floating-point calculation tolerance only; this is not a code or construction tolerance.
export const NUMERICAL_TOLERANCE_MM = 1e-6

export interface BarRef {
  memberId: string
  rebarId: string
  role: RebarRole
  size: ShearBarSize
  barIndex: number
  segmentIndex: number
}

export interface Finding {
  id: string
  kind: FindingKind
  a: BarRef
  b: BarRef
  clearanceMm: number
  closestPoints: [Point3, Point3]
  midpoint: Point3
  basis:
    | { kind: '\u5E7E\u4F55\u5B66\u7684\u91CD\u306A\u308A' }
    | { kind: '\u5229\u7528\u8005\u5165\u529B\u3042\u304D'; valueMm: number; scope: string }
    | { kind: '\u63A5\u89E6\uFF08\u8A31\u5BB9\u8AA4\u5DEE\u5185\uFF09' }
  excludedBy: string | null
}

export interface UncheckedItem {
  what: string
  reason: string
  source: string
}

export interface CheckScope {
  memberIds: string[]
  rebarMemberIds: string[]
  referenceMemberIds: string[]
  unsupportedMemberIds: string[]
  barCount: number
  segmentCount: number
  regionMm: {
    x: [number, number]
    y: [number, number]
    z: [number, number]
  }
  pairsTested: number
  droppedOutsideRegion: number
}

export type AxisVerdict<Yes extends string, No extends string> =
  | Yes
  | No
  | '\u691C\u67FB\u5BFE\u8C61\u306A\u3057'

export interface CheckVerdict {
  clash: AxisVerdict<'\u5E72\u6E09\u5019\u88DC\u3042\u308A', '\u5E72\u6E09\u5019\u88DC\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09'>
  clearance:
    | AxisVerdict<'\u3042\u304D\u4E0D\u8DB3\u5019\u88DC\u3042\u308A', '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09'>
    | '\u5224\u65AD\u4E0D\u53EF\uFF08\u3042\u304D\u57FA\u6E96\u672A\u5165\u529B\uFF09'
  contact: AxisVerdict<'\u63A5\u89E6\u3042\u308A', '\u63A5\u89E6\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09'>
  excludedCounts: Record<FindingKind, number>
}

export interface CheckResult {
  checkId: string
  version: number
  jointRef: { columnMemberId: string }
  scope: CheckScope
  verdict: CheckVerdict
  findings: Finding[]
  unchecked: UncheckedItem[]
  assumptions: string[]
  toleranceMm: number
}

export interface CheckInput {
  project: Project
  rebars: import('@/domain/model/rebar').Rebar[]
  unsupportedMemberIds: ReadonlySet<string>
  joint: Joint
  settings: { clearance: ClearanceBasis | null }
  exclusions: CheckExclusion[]
  fingerprints: ReviewFingerprints
}

const CLASH: FindingKind = '\u5E72\u6E09\u5019\u88DC'
const CLEARANCE: FindingKind = '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC'
const CONTACT: FindingKind = '\u63A5\u89E6'
const NO_TARGET = '\u691C\u67FB\u5BFE\u8C61\u306A\u3057'
const NOT_ENOUGH = '\u5224\u65AD\u4E0D\u53EF\uFF08\u3042\u304D\u57FA\u6E96\u672A\u5165\u529B\uFF09'

const ASSUMPTIONS = [
  '\u547C\u3073\u5F84\uFF1D\u5916\u5F84\uFF08\u7BC0\u3092\u542B\u3080\u6700\u5916\u5F84\u3067\u306F\u306A\u3044\uFF09',
  '\u4E3B\u7B4B\u306F\u5E2F\u7B4B\u5185\u9762\u306B\u63A5\u3059\u308B\u4F5C\u56F3\u898F\u5247\u306E\u4F4D\u7F6E\uFF08\u8A2D\u8A08\u56F3\u66F8\u306E\u6BB5\u914D\u7F6E\u3067\u306F\u306A\u3044\uFF09',
  '\u6298\u66F2\u3052\u306F\u89D2\u3067\u63CF\u304F',
  '\u7D99\u624B\u3092\u63CF\u304B\u306A\u3044',
  '\u5927\u6881\u306E\u4EA4\u5DEE\u90E8\u3067\u4E0A\u4E0B\u95A2\u4FC2\u3092\u6301\u305F\u306A\u3044\uFF08\u540C\u3058\u9AD8\u3055\u306B\u63CF\u304F\uFF09',
] as string[]

function emptyExcludedCounts(): Record<FindingKind, number> {
  const counts = {} as Record<FindingKind, number>
  counts[CLASH] = 0
  counts[CLEARANCE] = 0
  counts[CONTACT] = 0
  return counts
}

function refOf(instance: RebarInstance): BarRef {
  return {
    memberId: instance.memberId,
    rebarId: instance.rebarId,
    role: instance.role,
    size: instance.size,
    barIndex: instance.barIndex,
    segmentIndex: instance.segmentIndex,
  }
}

function refKey(ref: BarRef): string {
  return canonicalJson(ref)
}

function findingId(kind: FindingKind, a: BarRef, b: BarRef): string {
  const refs = [a, b].sort((left, right) => refKey(left).localeCompare(refKey(right)))
  return hashString(canonicalJson({ kind, a: refs[0], b: refs[1] }))
}

function orderedRefs(a: BarRef, b: BarRef): [BarRef, BarRef] {
  return [a, b].sort((left, right) => refKey(left).localeCompare(refKey(right))) as [BarRef, BarRef]
}

function rangeOf(from: number, to: number): [number, number] {
  return [Math.min(from, to), Math.max(from, to)]
}

function rangesOverlap(left: [number, number], right: [number, number]): boolean {
  return left[1] >= right[0] && right[1] >= left[0]
}

function segmentRange(instance: RebarInstance, axis: 0 | 1 | 2): [number, number] {
  return rangeOf(instance.from[axis], instance.to[axis])
}

function expandedSegmentRange(
  instance: RebarInstance,
  axis: 0 | 1 | 2,
  padding: number,
): [number, number] {
  const range = segmentRange(instance, axis)
  return [range[0] - padding, range[1] + padding]
}

function segmentIntersectsRegion(
  instance: RebarInstance,
  region: CheckScope['regionMm'],
  padding: number,
): boolean {
  return rangesOverlap(expandedSegmentRange(instance, 0, instance.radius + padding), region.x)
    && rangesOverlap(expandedSegmentRange(instance, 2, instance.radius + padding), region.z)
}

function midpoint(a: Point3, b: Point3): Point3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

function pointInPlanRegion(point: Point3, region: CheckScope['regionMm']): boolean {
  return point[0] >= region.x[0] && point[0] <= region.x[1]
    && point[2] >= region.z[0] && point[2] <= region.z[1]
}

function findColumnBox(project: Project, columnMemberId: string) {
  return project.members.find((member) => member.id === columnMemberId)
}

function checkRegion(
  layout: ReturnType<typeof buildingLayout>,
  column: Project['members'][number] | undefined,
  instances: RebarInstance[],
  maximumDiameter: number,
): CheckScope['regionMm'] {
  const box = layout.boxes.find(({ memberId }) => memberId === column?.id)
  const x: [number, number] = box
    ? [box.center[0] - box.size[0] / 2 - maximumDiameter, box.center[0] + box.size[0] / 2 + maximumDiameter]
    : [0, 0]
  const z: [number, number] = box
    ? [box.center[2] - box.size[2] / 2 - maximumDiameter, box.center[2] + box.size[2] / 2 + maximumDiameter]
    : [0, 0]

  const ys = instances.flatMap(({ from, to }) => [from[1], to[1]])
  return {
    x,
    y: ys.length ? [Math.min(...ys), Math.max(...ys)] as [number, number] : [0, 0],
    z,
  }
}

function uncheckedItems(unsupportedMemberIds: string[]): UncheckedItem[] {
  const items: UncheckedItem[] = [
    { what: '\u7D99\u624B\u4F4D\u7F6E', reason: '\u88685.3.3\u304C\u539F\u6587\u3067\u753B\u50CF\u2014 3D\u306B\u7D99\u624B\u3092\u63CF\u304B\u306A\u3044', source: 'ADR-019' },
    { what: '\u30D1\u30CD\u30EB\u30BE\u30FC\u30F3\u5E2F\u7B4B', reason: '\u30E2\u30C7\u30EB\u306B\u306A\u3044\uFF08hoopSpan = story.height - beamDepthAbove\uFF09', source: 'ADR-022' },
    { what: '\u6298\u66F2\u3052\u5185\u6CD5\u76F4\u5F84\u30FB\u66F2\u3052\u90E8\u306E\u4F38\u3073', reason: '\u6298\u66F2\u3052\u70B9\u3092\u89D2\u3067\u63CF\u304F', source: 'docs/RISKS.md R12' },
    { what: '\u5E45\u6B62\u3081\u7B4B\u306E\u4F59\u9577', reason: '\u4F59\u9577\u306E\u6839\u62E0\u304C\u672A\u78BA\u5B9A', source: 'docs/RISKS.md R12' },
    { what: '\u958B\u53E3\u88DC\u5F37\u7B4B', reason: '\u5F62\u72B6\u3092\u88FD\u54C1\u304C\u4F5C\u3089\u306A\u3044', source: 'ADR-034' },
    { what: '\u4E0A\u4E0B\u968E\u67F1\u306E\u4E3B\u7B4B\u30FB\u7D99\u624B\u3068\u306E\u5E72\u6E09', reason: '\u53C2\u7167\u90E8\u6750\u306F\u691C\u67FB\u5BFE\u8C61\u5916', source: 'ADR-019' },
  ]
  for (const memberId of unsupportedMemberIds.slice().sort()) {
    items.push({ what: `\u672A\u5BFE\u5FDC\u90E8\u6750: ${memberId}`, reason: '\u90E8\u6750\u5358\u4F4D\u3067\u691C\u67FB\u5BFE\u8C61\u304B\u3089\u9664\u5916', source: 'ADR-047' })
  }
  return items
}

function findingOrder(kind: FindingKind): number {
  return kind === CLASH ? 0 : kind === CLEARANCE ? 1 : 2
}

function noTargetVerdict(): CheckVerdict {
  return {
    clash: NO_TARGET,
    clearance: NO_TARGET,
    contact: NO_TARGET,
    excludedCounts: emptyExcludedCounts(),
  }
}

function verdictFor(findings: Finding[], pairsTested: number, clearance: ClearanceBasis | null): CheckVerdict {
  if (pairsTested === 0) return noTargetVerdict()
  const visible = (kind: FindingKind) => findings.some((finding) => finding.kind === kind && finding.excludedBy === null)
  return {
    clash: visible(CLASH) ? '\u5E72\u6E09\u5019\u88DC\u3042\u308A' : '\u5E72\u6E09\u5019\u88DC\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09',
    clearance: clearance === null
      ? NOT_ENOUGH
      : visible(CLEARANCE) ? '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC\u3042\u308A' : '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09',
    contact: visible(CONTACT) ? '\u63A5\u89E6\u3042\u308A' : '\u63A5\u89E6\u306A\u3057\uFF08\u691C\u67FB\u6761\u4EF6\u5185\uFF09',
    excludedCounts: findings.reduce((counts, finding) => {
      if (finding.excludedBy !== null) counts[finding.kind] += 1
      return counts
    }, emptyExcludedCounts()),
  }
}

export function exclusionMatches(
  exclusion: CheckExclusion,
  kind: FindingKind,
  a: BarRef,
  b: BarRef,
): boolean {
  const { scope } = exclusion
  if (!scope.kinds.includes(kind)) return false
  const sameRoles = (scope.roles[0] === a.role && scope.roles[1] === b.role)
    || (scope.roles[0] === b.role && scope.roles[1] === a.role)
  if (!sameRoles) return false
  if (scope.sameMemberOnly && a.memberId !== b.memberId) return false
  return scope.memberIds === undefined
    || (scope.memberIds.includes(a.memberId) && scope.memberIds.includes(b.memberId))
}

export function defaultExclusions(now: string): CheckExclusion[] {
  const reason = '\u4F5C\u56F3\u898F\u5247\u306B\u3088\u308B\u610F\u56F3\u3055\u308C\u305F\u63A5\u89E6 \u2014 \u5E2F\u7B4B/\u3042\u3070\u3089\u7B4B\u306E\u5916\u9762\u3092\u304B\u3076\u308A\u9762\u306B\u3001\u4E3B\u7B4B\u3092\u305D\u306E\u5185\u9762\u306B\u63A5\u3059\u308B\u3088\u3046\u914D\u7F6E\u3059\u308B\uFF08src/lib/viewer/geometry.ts rebarPlacements\uFF09'
  return [
    ['\u5E2F\u7B4B', '\u4E3B\u7B4B'],
    ['\u3042\u3070\u3089\u7B4B', '\u4E0A\u7AEF\u7B4B'],
    ['\u3042\u3070\u3089\u7B4B', '\u4E0B\u7AEF\u7B4B'],
  ].map(([left, right]) => {
    const scope = {
      sameMemberOnly: true,
      roles: [left, right] as [string, string],
      kinds: [CONTACT] as FindingKind[],
    }
    return { id: hashString(canonicalJson(scope)), scope, reason, createdAt: now }
  })
}

export function runGeometryCheck(input: CheckInput): CheckResult {
  const allRebarMemberIds = jointRebarMemberIds(input.project, input.joint)
  const memberIds = jointMemberIds(input.joint)
  const unsupported = allRebarMemberIds.filter((id) => input.unsupportedMemberIds.has(id))
  const rebarMemberIds = allRebarMemberIds.filter((id) => !input.unsupportedMemberIds.has(id))
  const targetIds = new Set(rebarMemberIds)
  const layout = buildingLayout(
    input.project,
    input.rebars,
    input.unsupportedMemberIds,
    (size) => barDiameter(size) / 2,
  )
  const targetInstances = layout.rebar.filter((instance) => targetIds.has(instance.memberId))
  const maximumDiameter = targetInstances.length
    ? Math.max(...targetInstances.map(({ size }) => barDiameter(size)))
    : 0
  const column = findColumnBox(input.project, input.joint.columnMemberId)
  const regionMm = checkRegion(layout, column, targetInstances, maximumDiameter)
  const scope: CheckScope = {
    memberIds: [...memberIds],
    rebarMemberIds: [...rebarMemberIds],
    referenceMemberIds: [...input.joint.reference.memberIds],
    unsupportedMemberIds: [...unsupported],
    barCount: new Set(targetInstances.map(({ rebarId, barIndex }) => `${rebarId}:${barIndex}`)).size,
    segmentCount: targetInstances.length,
    regionMm,
    pairsTested: 0,
    droppedOutsideRegion: 0,
  }

  const padding = Math.max(NUMERICAL_TOLERANCE_MM, input.settings.clearance?.valueMm ?? 0)
  const candidates = targetInstances.filter((instance) => segmentIntersectsRegion(instance, regionMm, padding))
  const findings: Finding[] = []

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex]
      if (left.rebarId === right.rebarId && left.barIndex === right.barIndex) continue
      if (!rangesOverlap(expandedSegmentRange(left, 0, left.radius + padding), expandedSegmentRange(right, 0, right.radius + padding))) continue
      if (!rangesOverlap(expandedSegmentRange(left, 1, left.radius + padding), expandedSegmentRange(right, 1, right.radius + padding))) continue
      if (!rangesOverlap(expandedSegmentRange(left, 2, left.radius + padding), expandedSegmentRange(right, 2, right.radius + padding))) continue

      scope.pairsTested += 1
      const result = capsuleClearanceMm(
        { from: left.from, to: left.to, radius: left.radius } satisfies Segment,
        { from: right.from, to: right.to, radius: right.radius } satisfies Segment,
      )
      const middle = midpoint(result.pa, result.pb)
      if (!pointInPlanRegion(middle, regionMm)) {
        scope.droppedOutsideRegion += 1
        continue
      }

      const leftRef = refOf(left)
      const rightRef = refOf(right)
      let kind: FindingKind | null = null
      let basis: Finding['basis'] | null = null
      if (result.clearanceMm < -NUMERICAL_TOLERANCE_MM) {
        kind = CLASH
        basis = { kind: '\u5E7E\u4F55\u5B66\u7684\u91CD\u306A\u308A' }
      } else if (Math.abs(result.clearanceMm) <= NUMERICAL_TOLERANCE_MM) {
        kind = CONTACT
        basis = { kind: '\u63A5\u89E6\uFF08\u8A31\u5BB9\u8AA4\u5DEE\u5185\uFF09' }
      } else if (input.settings.clearance !== null && result.clearanceMm < input.settings.clearance.valueMm) {
        kind = CLEARANCE
        basis = {
          kind: '\u5229\u7528\u8005\u5165\u529B\u3042\u304D',
          valueMm: input.settings.clearance.valueMm,
          scope: input.settings.clearance.scope,
        }
      }
      if (kind === null || basis === null) continue

      const excludedBy = input.exclusions.find((exclusion) => exclusionMatches(exclusion, kind, leftRef, rightRef))?.id ?? null
      const [a, b] = orderedRefs(leftRef, rightRef)
      findings.push({
        id: findingId(kind, a, b),
        kind,
        a,
        b,
        clearanceMm: result.clearanceMm,
        closestPoints: [result.pa, result.pb],
        midpoint: middle,
        basis,
        excludedBy,
      })
    }
  }

  findings.sort((left, right) => findingOrder(left.kind) - findingOrder(right.kind)
    || left.clearanceMm - right.clearanceMm
    || left.id.localeCompare(right.id))

  const checkId = hashString(canonicalJson({
    version: GEOMETRY_CHECK_VERSION,
    members: Object.fromEntries(rebarMemberIds.slice().sort().map((memberId) => [memberId, input.fingerprints.members[memberId] ?? null])),
    checkConditions: checkConditionsFingerprint(input.settings, input.exclusions),
    regionMm,
  }))
  return {
    checkId,
    version: GEOMETRY_CHECK_VERSION,
    jointRef: { columnMemberId: input.joint.columnMemberId },
    scope,
    verdict: verdictFor(findings, scope.pairsTested, input.settings.clearance),
    findings,
    unchecked: uncheckedItems(unsupported),
    assumptions: [...ASSUMPTIONS],
    toleranceMm: NUMERICAL_TOLERANCE_MM,
  }
}
