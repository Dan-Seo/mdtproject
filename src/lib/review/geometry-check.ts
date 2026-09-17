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
    | { kind: '幾何学的重なり' }
    | { kind: '利用者入力あき'; valueMm: number; scope: string }
    | { kind: '接触（許容誤差内）' }
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
  | '検査対象なし'

export interface CheckVerdict {
  clash: AxisVerdict<'干渉候補あり', '干渉候補なし（検査条件内）'>
  clearance:
    | AxisVerdict<'あき不足候補あり', 'あき不足候補なし（検査条件内）'>
    | '判断不可（あき基準未入力）'
  contact: AxisVerdict<'接触あり', '接触なし（検査条件内）'>
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

const CLASH: FindingKind = '干渉候補'
const CLEARANCE: FindingKind = 'あき不足候補'
const CONTACT: FindingKind = '接触'
const NO_TARGET = '検査対象なし'
const NOT_ENOUGH = '判断不可（あき基準未入力）'

const ASSUMPTIONS = [
  '呼び径＝外径（節を含む最外径ではない）',
  '主筋は帯筋内面に接する作図規則の位置（設計図書の段配置ではない）',
  '折曲げは角で描く',
  '継手を描かない',
  '大梁の交差部で上下関係を持たない（同じ高さに描く）',
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
    { what: '継手位置', reason: '表5.3.3が原文で画像— 3Dに継手を描かない', source: 'ADR-019' },
    { what: 'パネルゾーン帯筋', reason: 'モデルにない（hoopSpan = story.height - beamDepthAbove）', source: 'ADR-022' },
    { what: '折曲げ内法直径・曲げ部の伸び', reason: '折曲げ点を角で描く', source: 'docs/RISKS.md R12' },
    { what: '幅止め筋の余長', reason: '余長の根拠が未確定', source: 'docs/RISKS.md R12' },
    { what: '開口補強筋', reason: '形状を製品が作らない', source: 'ADR-034' },
    { what: '上下階柱の主筋・継手との干渉', reason: '参照部材は検査対象外', source: 'ADR-019' },
  ]
  for (const memberId of unsupportedMemberIds.slice().sort()) {
    items.push({ what: `未対応部材: ${memberId}`, reason: '部材単位で検査対象から除外', source: 'ADR-047' })
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
    clash: visible(CLASH) ? '干渉候補あり' : '干渉候補なし（検査条件内）',
    clearance: clearance === null
      ? NOT_ENOUGH
      : visible(CLEARANCE) ? 'あき不足候補あり' : 'あき不足候補なし（検査条件内）',
    contact: visible(CONTACT) ? '接触あり' : '接触なし（検査条件内）',
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
  const reason = '作図規則による意図された接触 — 帯筋/あばら筋の外面をかぶり面に、主筋をその内面に接するよう配置する（src/lib/viewer/geometry.ts rebarPlacements）'
  return [
    ['帯筋', '主筋'],
    ['あばら筋', '上端筋'],
    ['あばら筋', '下端筋'],
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
        basis = { kind: '幾何学的重なり' }
      } else if (Math.abs(result.clearanceMm) <= NUMERICAL_TOLERANCE_MM) {
        kind = CONTACT
        basis = { kind: '接触（許容誤差内）' }
      } else if (input.settings.clearance !== null && result.clearanceMm < input.settings.clearance.valueMm) {
        kind = CLEARANCE
        basis = {
          kind: '利用者入力あき',
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
