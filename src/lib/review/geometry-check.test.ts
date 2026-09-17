import { describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { createStressProject } from '@/domain/model/stress-project'
import { projectFingerprints } from '@/domain/review/fingerprint'
import {
  jointRebarMemberIds,
  resolveJoint,
} from '@/domain/review/joint'
import type { CheckExclusion } from '@/domain/review/types'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { buildingLayout } from '@/lib/viewer/building'
import { barDiameter, rebarRadius } from '@/lib/viewer/geometry'
import { jpMlitRulePack } from '@/rulepack'
import { capsuleClearanceMm } from './segment-distance'

import {
  defaultExclusions,
  NUMERICAL_TOLERANCE_MM,
  exclusionMatches,
  runGeometryCheck,
  type BarRef,
  type FindingKind,
} from './geometry-check'

const CLASH: FindingKind = '干渉候補'
const CLEARANCE: FindingKind = 'あき不足候補'
const CONTACT: FindingKind = '接触'
const UPPER = '上端筋'
const HOOP = '帯筋'

function sampleInput(
  jointId = '1F-X2Y1',
  clearance: number | null = null,
  project = createSampleProject(),
  exclusions: CheckExclusion[] = [],
) {
  const takeoff = buildTakeoff(project)
  const resolution = resolveJoint(project, jointId)
  if (resolution.status !== 'joint') throw new Error('joint fixture expected')
  const unsupportedMemberIds = new Set(takeoff.unsupportedMembers.map(({ memberId }) => memberId))
  const settings = clearance === null
    ? { clearance: null }
    : {
        clearance: {
          valueMm: clearance,
          source: '利用者入力' as const,
          scope: 'test boundary',
          enteredAt: '2026-09-17T00:00:00Z',
          note: 'test input',
        },
      }
  const fingerprints = projectFingerprints(
    project,
    takeoff.rebars,
    unsupportedMemberIds,
    jpMlitRulePack,
    1,
    null,
  )
  return {
    project,
    takeoff,
    rebars: takeoff.rebars,
    joint: resolution.joint,
    unsupportedMemberIds,
    settings,
    fingerprints,
    exclusions,
  }
}

function check(
  jointId = '1F-X2Y1',
  clearance: number | null = null,
  exclusions: CheckExclusion[] = [],
) {
  const input = sampleInput(jointId, clearance, createSampleProject(), exclusions)
  return runGeometryCheck(input)
}

function geometryBarKey(bar: {
  memberId: string
  rebarId: string
  role: string
  size: string
  barIndex: number
  segmentIndex: number
}): string {
  return JSON.stringify([
    bar.memberId,
    bar.rebarId,
    bar.role,
    bar.size,
    bar.barIndex,
    bar.segmentIndex,
  ])
}

function allPairFindingKeys(
  input: ReturnType<typeof sampleInput>,
  result: ReturnType<typeof runGeometryCheck>,
): string[] {
  const targetMemberIds = new Set(
    jointRebarMemberIds(input.project, input.joint)
      .filter((memberId) => !input.unsupportedMemberIds.has(memberId)),
  )
  const layout = buildingLayout(
    input.project,
    input.rebars,
    input.unsupportedMemberIds,
    (size) => barDiameter(size) / 2,
  )
  const instances = layout.rebar.filter((instance) => targetMemberIds.has(instance.memberId))
  const keys: string[] = []
  for (let leftIndex = 0; leftIndex < instances.length; leftIndex += 1) {
    const left = instances[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < instances.length; rightIndex += 1) {
      const right = instances[rightIndex]
      if (left.rebarId === right.rebarId && left.barIndex === right.barIndex) continue
      const measured = capsuleClearanceMm(
        { from: left.from, to: left.to, radius: left.radius },
        { from: right.from, to: right.to, radius: right.radius },
      )
      const middle = [
        (measured.pa[0] + measured.pb[0]) / 2,
        (measured.pa[1] + measured.pb[1]) / 2,
        (measured.pa[2] + measured.pb[2]) / 2,
      ] as const
      const region = result.scope.regionMm
      if (middle[0] < region.x[0] || middle[0] > region.x[1]
        || middle[2] < region.z[0] || middle[2] > region.z[1]) continue

      const kind = measured.clearanceMm < -NUMERICAL_TOLERANCE_MM
        ? CLASH
        : Math.abs(measured.clearanceMm) <= NUMERICAL_TOLERANCE_MM
          ? CONTACT
          : input.settings.clearance !== null
            && measured.clearanceMm < input.settings.clearance.valueMm
            ? CLEARANCE
            : null
      if (kind === null) continue
      const bars = [left, right].map(geometryBarKey).sort()
      keys.push(JSON.stringify([kind, ...bars]))
    }
  }
  return keys.sort()
}

function resultFindingKeys(result: ReturnType<typeof runGeometryCheck>): string[] {
  return result.findings.map(({ kind, a, b }) => JSON.stringify([
    kind,
    ...[a, b].map(geometryBarKey).sort(),
  ])).sort()
}

function ref(memberId: string, role: string): BarRef {
  return {
    memberId,
    rebarId: `${memberId}-rebar`,
    role: role as BarRef['role'],
    size: 'D13',
    barIndex: 0,
    segmentIndex: 0,
  }
}

describe('geometry check', () => {
  it('finds the sample upper-main clash at the corner joint', () => {
    const result = check()
    const finding = result.findings.find((entry) =>
      entry.kind === CLASH
      && entry.a.role === UPPER
      && entry.b.role === UPPER
      && entry.a.memberId !== entry.b.memberId,
    )
    expect(finding).toBeDefined()
    expect(finding?.clearanceMm).toBeCloseTo(-22, 6)
    expect(finding?.basis).toEqual({ kind: '幾何学的重なり' })
    expect(finding?.midpoint[0]).toBeGreaterThanOrEqual(result.scope.regionMm.x[0])
    expect(finding?.midpoint[0]).toBeLessThanOrEqual(result.scope.regionMm.x[1])
    expect(finding?.midpoint[2]).toBeGreaterThanOrEqual(result.scope.regionMm.z[0])
    expect(finding?.midpoint[2]).toBeLessThanOrEqual(result.scope.regionMm.z[1])
  })

  it('keeps the 25 mm lower-main gap distinct from its user threshold', () => {
    const noBasis = check('1F-X2Y1', null)
    expect(noBasis.verdict.clearance).toBe('判断不可（あき基準未入力）')
    expect(noBasis.findings.some(({ kind, clearanceMm }) => kind === CLEARANCE && Math.abs(clearanceMm - 25) < 1e-6)).toBe(false)

    const below = check('1F-X2Y1', 24)
    expect(below.findings.some(({ kind, clearanceMm }) => kind === CLEARANCE && Math.abs(clearanceMm - 25) < 1e-6)).toBe(false)

    const above = check('1F-X2Y1', 26)
    const finding = above.findings.find(({ kind, clearanceMm }) => kind === CLEARANCE && Math.abs(clearanceMm - 25) < 1e-6)
    expect(finding).toBeDefined()
    expect(finding?.basis).toEqual({ kind: '利用者入力あき', valueMm: 26, scope: 'test boundary' })
  })

  it('reports fixed unchecked items without a global pass claim', () => {
    const result = check()
    expect(result.unchecked.map(({ what }) => what)).toEqual(expect.arrayContaining([
      '継手位置',
      'パネルゾーン帯筋',
    ]))
    expect(JSON.stringify(result)).not.toContain('合格')
    expect(JSON.stringify(result)).not.toContain('安全')
    expect(JSON.stringify(result)).not.toContain('施工可能')
  })

  it('excludes only the three intended same-member contacts', () => {
    const raw = check('1F-X2Y1', null, [])
    const excluded = check('1F-X2Y1', null, defaultExclusions('2026-09-17T00:00:00Z'))
    expect(raw.findings.some(({ kind }) => kind === CLASH)).toBe(true)
    expect(raw.findings.some(({ kind }) => kind === CONTACT)).toBe(true)
    expect(excluded.verdict.contact).toBe('接触なし（検査条件内）')
    expect(excluded.verdict.excludedCounts[CONTACT]).toBeGreaterThan(0)
    expect(excluded.findings.some(({ kind, excludedBy }) => kind === CONTACT && excludedBy !== null)).toBe(true)
    expect(excluded.findings.some(({ kind }) => kind === CLASH)).toBe(true)
  })

  it('matches exclusions by kind, unordered roles, member scope, and same-member flag', () => {
    const a = ref('m1', HOOP)
    const b = ref('m1', '主筋')
    const other = ref('m2', '主筋')
    const exclusion = defaultExclusions('now')[0]
    expect(exclusionMatches(exclusion, CONTACT, a, b)).toBe(true)
    expect(exclusionMatches(exclusion, CONTACT, a, other)).toBe(false)
    expect(exclusionMatches({ ...exclusion, scope: { ...exclusion.scope, sameMemberOnly: false } }, CONTACT, a, other)).toBe(true)
    expect(exclusionMatches(exclusion, CLASH, a, b)).toBe(false)
    expect(exclusionMatches({ ...exclusion, scope: { ...exclusion.scope, memberIds: ['m2'] } }, CONTACT, a, b)).toBe(false)
  })

  it('keeps narrowed findings equal to repeated runs and uses real radii', () => {
    const first = check()
    const second = check()
    expect(second.checkId).toBe(first.checkId)
    expect(second.findings).toEqual(first.findings)
    expect(first.findings.some(({ a, b }) =>
      a.rebarId === b.rebarId && a.barIndex === b.barIndex,
    )).toBe(false)

    const input = sampleInput()
    const real = buildingLayout(input.project, input.takeoff.rebars, input.unsupportedMemberIds, (size) => Number(size.replace(/^[A-Z]+/, '')) / 2)
    const display = buildingLayout(input.project, input.takeoff.rebars, input.unsupportedMemberIds, rebarRadius)
    const realInstance = real.rebar.find(({ memberId }) => jointRebarMemberIds(input.project, input.joint).includes(memberId))
    const displayInstance = display.rebar.find(({ rebarId, barIndex, segmentIndex }) =>
      rebarId === realInstance?.rebarId && barIndex === realInstance.barIndex && segmentIndex === realInstance.segmentIndex,
    )
    expect(realInstance).toBeDefined()
    expect(displayInstance?.radius).not.toBe(realInstance?.radius)
  })

  it('keeps the region prefilter conservative for user clearance thresholds', () => {
    // These are user-entered test thresholds, not code or construction tolerances.
    for (const clearance of [null, 26, 40]) {
      const input = sampleInput('1F-X2Y1', clearance)
      const result = runGeometryCheck(input)
      expect(resultFindingKeys(result)).toEqual(allPairFindingKeys(input, result))
    }
  })

  it('changes check identity only for checked inputs and condition scopes', () => {
    const baseInput = sampleInput()
    const base = runGeometryCheck(baseInput)
    const renamed = runGeometryCheck({ ...baseInput, project: { ...baseInput.project, name: 'other' } })
    expect(renamed.checkId).toBe(base.checkId)

    const changedCondition = runGeometryCheck(sampleInput('1F-X2Y1', 26))
    expect(changedCondition.checkId).not.toBe(base.checkId)
    const sameScopeDifferentReason = runGeometryCheck({
      ...baseInput,
      exclusions: baseInput.exclusions.map((exclusion) => ({ ...exclusion, reason: 'changed' })),
    })
    expect(sameScopeDifferentReason.checkId).toBe(base.checkId)
    const changedScope = runGeometryCheck({
      ...baseInput,
      exclusions: defaultExclusions('now').map((exclusion) => ({
        ...exclusion,
        scope: { ...exclusion.scope, sameMemberOnly: false },
      })),
    })
    expect(changedScope.checkId).not.toBe(base.checkId)

    const memberId = base.scope.rebarMemberIds[0]
    const memberFingerprint = baseInput.fingerprints.members[memberId]
    if (!memberFingerprint) throw new Error('member fingerprint expected')
    const changedFingerprint = {
      ...baseInput.fingerprints,
      members: {
        ...baseInput.fingerprints.members,
        [memberId]: { ...memberFingerprint, result: 'changed' },
      },
    }
    expect(runGeometryCheck({ ...baseInput, fingerprints: changedFingerprint }).checkId).not.toBe(base.checkId)
  })

  it('records unsupported members and returns no-target when all target rebars are unsupported', () => {
    const input = sampleInput()
    const allTargetIds = new Set(jointRebarMemberIds(input.project, input.joint))
    const result = runGeometryCheck({ ...input, unsupportedMemberIds: allTargetIds })
    expect(result.scope.unsupportedMemberIds).toEqual(expect.arrayContaining([...allTargetIds]))
    expect(result.unchecked.some(({ what }) => what.startsWith('未対応部材'))).toBe(true)
    expect(result.verdict.clash).toBe('検査対象なし')
    expect(result.verdict.clearance).toBe('検査対象なし')
    expect(result.verdict.contact).toBe('検査対象なし')
  })

  it('keeps the terminal run-owner girder in the inspected member set', () => {
    const input = sampleInput('1F-X1Y3')
    const owner = '1F-G1-X1Y1-Y'
    expect(input.joint.reference.memberIds).toContain(owner)
    expect(input.joint && jointRebarMemberIds(input.project, input.joint)).toContain(owner)
    const result = runGeometryCheck(input)
    expect(result.scope.rebarMemberIds).toContain(owner)
    expect(result.scope.barCount).toBeGreaterThan(0)
  })

  it('records unit-only stress evidence for one central joint', () => {
    const project = createStressProject({ xSpanCount: 4, ySpanCount: 3, storyCount: 5 })
    const takeoff = buildTakeoff(project)
    const resolution = resolveJoint(project, '3F-X3Y2')
    if (resolution.status !== 'joint') throw new Error('stress joint fixture expected')
    const unsupported = new Set(takeoff.unsupportedMembers.map(({ memberId }) => memberId))
    const fingerprints = projectFingerprints(project, takeoff.rebars, unsupported, jpMlitRulePack, 1, null)
    const started = performance.now()
    const result = runGeometryCheck({
      project,
      rebars: takeoff.rebars,
      unsupportedMemberIds: unsupported,
      joint: resolution.joint,
      settings: { clearance: null },
      exclusions: [],
      fingerprints,
    })
    const elapsed = performance.now() - started
    expect(Number.isFinite(elapsed)).toBe(true)
    expect(result.scope.pairsTested).toBeGreaterThanOrEqual(0)
    expect(result.scope.segmentCount).toBeGreaterThan(0)
  })
})
