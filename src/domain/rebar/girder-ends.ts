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
      /**
       * 加工長을 실제로 정한 항. `max(L1h, 投影＋余長下限)`이므로 余長下限이
       * 지배하면 그 길이는 表5.3.4에 없는 값이다 — L1h로 표시하면 근거가 거짓이 된다.
       */
      lengthRule: 'anchorage.L1h' | 'anchorage.bent.tail.minimum'
      projectionRule: 'anchorage.La'
      /** max(L1h, 投影＋余長下限) — 算出式이 어느 항이 지배했는지 밝힐 수 있게 원항도 싣는다 */
      lengthMm: number
      l1hMm: number
      tailMinimumMm: number
      /** max(La, 柱せい×投影下限) */
      projectionMm: number
      laMm: number
      projectionMinimumMm: number
      direction: '上' | '下'
    } & UsedRules)

export interface GirderEndInput {
  /** 지점 柱의 축방향 전체 치수 (GirderSpan의 *SupportLengthAlongAxisMm) */
  supportLengthMm: number
  /** 지점 柱의 かぶり 조회 조건 (GirderSpan의 *SupportCover) — 大梁의 것이 아니다 */
  supportCover: Record<string, string | boolean>
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
  const minimumCoverRule = lookupRule(
    pack,
    'cover.minimum',
    input.supportCover,
  )
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
  const laMm = millimetres(projectionRule, diameter)
  const projectionMinimumMm =
    input.supportLengthMm * ratio(projectionMinimumRule)
  const projectionMm = Math.max(laMm, projectionMinimumMm)

  if (projectionMm > availableProjectionMm) {
    throw new MemberUnsupportedError(
      '定着不成立',
      `折曲げ定着が支点柱に収まらない: ` +
        `必要投影 ${projectionMm} mm > 使用可能 ${availableProjectionMm} mm`,
    )
  }

  const l1hMm = millimetres(bentRule, diameter)
  const tailMinimumMm = projectionMm + millimetres(tailMinimumRule, diameter)
  const lengthMm = Math.max(l1hMm, tailMinimumMm)

  return {
    kind: '折曲げ定着',
    lengthRule:
      l1hMm >= tailMinimumMm ? 'anchorage.L1h' : 'anchorage.bent.tail.minimum',
    projectionRule: 'anchorage.La',
    lengthMm,
    l1hMm,
    tailMinimumMm,
    projectionMm,
    laMm,
    projectionMinimumMm,
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
