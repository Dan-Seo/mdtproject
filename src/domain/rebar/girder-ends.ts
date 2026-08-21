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
       * 加工長을 실제로 정한 항. `max(L1, 投影＋余長下限)`이므로 余長下限이
       * 지배하면 그 길이는 表5.3.4에 없는 값이다 — L1로 표시하면 근거가 거짓이 된다.
       */
      lengthRule: 'anchorage.L1' | 'anchorage.bent.tail.minimum'
      /** 投影長도 `max(La, 柱せい×3/4)` — 근거는 이긴 항에 붙는다 */
      projectionRule: 'anchorage.La' | 'anchorage.bent.projection.minimum'
      /** max(L1, 投影＋余長下限) — 算出式이 어느 항이 지배했는지 밝힐 수 있게 원항도 싣는다 */
      lengthMm: number
      /** 5.3.4(5)(ｲ)(a)「全長は、表5.3.4 の直線定着の長さ以上とする」의 그 L1 */
      straightMinimumMm: number
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

export function barDiameter(size: BarSize): number {
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

  // anchorage.L1h 는 여기서 조회하지 않는다 — 5.3.4(5)(ｲ) 에서 L1h 는 이 조항이
  // 적용되는 **조건**(「フックありの定着の長さを確保できない場合」)일 뿐이고,
  // (a)(b)(c) 중 어느 값도 정하지 않는다. 조회해두면 出典 칩에 산출식에 한 번도
  // 나오지 않는 행이 실린다.
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

  // 5.3.4(5)(ｲ) は (a) 全長 ≧ 表5.3.4 の**直線**定着の長さ、(b) 余長 ≧ 8d を
  // ともに課す。フックありの L1h は同条の**適用条件**（「フックありの定着の長さを
  // 確保できない場合」）であって全長の下限ではない — 下限に L1h を置くと L1 > L1h
  // の分だけ全長が条文より短くなり、内訳が過小計上になる。
  const tailMinimumMm = projectionMm + millimetres(tailMinimumRule, diameter)
  const lengthMm = Math.max(straightLengthMm, tailMinimumMm)

  return {
    kind: '折曲げ定着',
    lengthRule:
      straightLengthMm >= tailMinimumMm
        ? 'anchorage.L1'
        : 'anchorage.bent.tail.minimum',
    projectionRule:
      laMm >= projectionMinimumMm
        ? 'anchorage.La'
        : 'anchorage.bent.projection.minimum',
    lengthMm,
    straightMinimumMm: straightLengthMm,
    tailMinimumMm,
    projectionMm,
    laMm,
    projectionMinimumMm,
    direction: input.bendDirection,
    // L1 은 折曲げ 채택 판정의 비교원이자 (a)의 全長 下限이다.
    // L1h(anchorage.L1h)는 어떤 값도 정하지 않으므로 出典에 싣지 않는다.
    usedRules: [
      straightRule,
      projectionRule,
      tailMinimumRule,
      projectionMinimumRule,
      ...coverRules,
    ],
  }
}
