import type { BarSize, SteelGrade } from '../model/member'
import { MemberUnsupportedError } from '../model/unsupported'
import { lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'

/** 판정에 실제로 쓴 룰 행 — 지점 柱의 かぶり처럼 大梁 조건으로는 되짚을 수 없다 */
interface UsedRules {
  usedRules: RuleHit[]
}

export type GirderEndDetail =
  | ({
      kind: '直線定着'
      lengthRule: 'anchorage.L1'
      lengthMm: number
    } & UsedRules)
  | ({
      kind: '折曲げ定着'
      lengthRule: 'anchorage.L1h'
      projectionRule: 'anchorage.La'
      lengthMm: number
      projectionMm: number
      direction: '上' | '下'
    } & UsedRules)

export interface GirderEndInput {
  /** 지점 柱의 축방향 전체 치수 (GirderSpan의 *SupportLengthAlongAxisMm) */
  supportLengthMm: number
  barSize: BarSize
  fc: number
  grade: SteelGrade
  /** 上端筋이면 '下'(아래로 절곡), 下端筋이면 '上' */
  bendDirection: '上' | '下'
}

function barDiameter(size: BarSize): number {
  const diameter = Number(size.replace(/^D/, ''))

  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Invalid BarSize: ${size}`)
  }

  return diameter
}

function millimetres(rule: RuleHit, diameter?: number): number {
  if (rule.unit === 'mm') return rule.value
  if (rule.unit === 'd' && diameter !== undefined) {
    return rule.value * diameter
  }

  throw new Error(
    `Rule ${rule.key} must use mm or use d with a supplied bar diameter`,
  )
}

function ratio(rule: RuleHit): number {
  if (rule.unit !== 'ratio') {
    throw new Error(`Rule ${rule.key} must use ratio`)
  }

  return rule.value
}

/**
 * GirderEndInput에는 柱의 exposure/finish가 없으므로 表5.3.6의 비토접 柱
 * 후보 중 가장 큰 かぶり를 쓴다. 작은 값을 임의 기본값으로 택해 철근이 반대면
 * かぶり를 뚫는 것보다 보수적으로 실패시키기 위한 판정이다.
 */
function columnMinimumCover(pack: RulePack): RuleHit {
  const candidates = pack.entries.filter(
    ({ key, conditions }) =>
      key === 'cover.minimum' &&
      conditions.memberKind === '柱' &&
      conditions.soilContact !== true,
  )

  if (candidates.length === 0) {
    throw new Error('Rule not found: cover.minimum for non-soil 柱')
  }

  const conservative = candidates.reduce((largest, candidate) =>
    candidate.value > largest.value ? candidate : largest,
  )

  return lookupRule(pack, conservative.key, conservative.conditions)
}

export function resolveGirderEnd(
  input: GirderEndInput,
  pack: RulePack,
): GirderEndDetail {
  const diameter = barDiameter(input.barSize)
  const straightRule = lookupRule(pack, 'anchorage.L1', {
    fc: input.fc,
    grade: input.grade,
    hook: false,
  })
  const minimumCoverRule = columnMinimumCover(pack)
  const fabricationCoverAdditionRule = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const fabricationCoverMm =
    millimetres(minimumCoverRule) +
    millimetres(fabricationCoverAdditionRule)
  const availableProjectionMm = input.supportLengthMm - fabricationCoverMm
  const straightLengthMm = millimetres(straightRule, diameter)

  const coverRules = [minimumCoverRule, fabricationCoverAdditionRule]

  if (straightLengthMm <= availableProjectionMm) {
    return {
      kind: '直線定着',
      lengthRule: 'anchorage.L1',
      lengthMm: straightLengthMm,
      usedRules: [straightRule, ...coverRules],
    }
  }

  const bentRule = lookupRule(pack, 'anchorage.L1h', {
    fc: input.fc,
    grade: input.grade,
    hook: true,
  })
  const projectionRule = lookupRule(pack, 'anchorage.La', {
    fc: input.fc,
    grade: input.grade,
  })
  const tailMinimumRule = lookupRule(
    pack,
    'anchorage.bent.tail.minimum',
    {},
  )
  const projectionMinimumRule = lookupRule(
    pack,
    'anchorage.bent.projection.minimum',
    { detail: '梁主筋の柱内定着' },
  )
  const projectionMm = Math.max(
    millimetres(projectionRule, diameter),
    input.supportLengthMm * ratio(projectionMinimumRule),
  )

  if (projectionMm > availableProjectionMm) {
    throw new MemberUnsupportedError(
      '定着不成立',
      `折曲げ定着が支点柱に収まらない: ` +
        `必要投影 ${projectionMm} mm > 使用可能 ${availableProjectionMm} mm`,
    )
  }

  const lengthMm = Math.max(
    millimetres(bentRule, diameter),
    projectionMm + millimetres(tailMinimumRule, diameter),
  )

  return {
    kind: '折曲げ定着',
    lengthRule: 'anchorage.L1h',
    projectionRule: 'anchorage.La',
    lengthMm,
    projectionMm,
    direction: input.bendDirection,
    // 直線 L1 은 折曲げ 채택 판정의 비교원이므로 기여 룰로 남긴다
    usedRules: [
      straightRule,
      bentRule,
      projectionRule,
      tailMinimumRule,
      projectionMinimumRule,
      ...coverRules,
    ],
  }
}
