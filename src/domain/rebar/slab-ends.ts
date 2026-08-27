import type { BarSize, SteelGrade } from '../model/member'
import { MemberUnsupportedError } from '../model/unsupported'
import { lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'

/**
 * 床板主筋が大梁の中でどう定着するか (ADR-028)。
 *
 * 大梁の `resolveGirderEnd` と同じ形だが、引く列が違う。
 *   下端筋 … 通常の床板は表5.3.4 の **L3（スラブ欄）**「10d かつ150mm以上」(注3)。
 *            片持床板は同じセルの括弧書き「25d」が全体を置き換える。
 *   上端筋 … 表5.3.4 の一般値 **L1**(注1)。入らなければ 5.3.4(5)(ｲ) の折曲げ定着で、
 *            通常の床板の投影は表5.3.5 の **Lb**、片持床板は表5.3.5 の **La**。
 *
 * 梁主筋と違い、投影に「柱せいの3/4 倍以上」の下限は掛からない — 5.3.4(5)(ｲ)(c)
 * のその但書は「梁主筋の柱内定着においては」と対象を限っている。
 *
 * 下端筋には折曲げの逃げ道がない。表5.3.5 の Lb/La は上端筋の投影列であり、表5.3.4 の
 * L3h はスラブ欄が原文で「─」だ。支点に入らなければ曲げ方を製品が作らず落とす。
 */
interface UsedRules {
  usedRules: RuleHit[]
}

export type SlabEndDetail =
  | ({
      kind: '直線定着'
      /**
       * 長さを実際に決めた行。通常の床板の L3 は「10d かつ150mm以上」なので、
       * 細い径では下限が勝つ。片持床板はセル全体の例外値 25d を使う。
       */
      lengthRule: 'anchorage.L1' | 'anchorage.L3' | 'anchorage.L3.minimum'
      lengthMm: number
    } & UsedRules)
  | ({
      kind: '折曲げ定着'
      /** max(L1, 投影＋余長下限) — 勝った項に根拠が付く */
      lengthRule: 'anchorage.L1' | 'anchorage.bent.tail.minimum'
      /** 通常の床板は Lb、片持床板は La。どちらも競う下限がない */
      projectionRule: 'anchorage.La' | 'anchorage.Lb'
      lengthMm: number
      /** 5.3.4(5)(ｲ)(a)「全長は、表5.3.4 の直線定着の長さ以上とする」の L1 */
      straightMinimumMm: number
      /** 同(b)「余長は、8d 以上」を全長の下限に換算したもの */
      tailMinimumMm: number
      /** 同(c) 投影定着長さ ＝ 表5.3.5 La または Lb */
      projectionMm: number
    } & UsedRules)

export interface SlabEndInput {
  /** 定着先の大梁の幅 b (mm) — 床板筋はこの中へ入っていく */
  supportWidthMm: number
  /** 定着先の大梁のかぶり照会条件。床板のものではない */
  supportCover: Record<string, string | boolean>
  barSize: BarSize
  fc: number
  grade: SteelGrade
  face: '上端' | '下端'
  /** 片持床板は L3 のセル全体を 25d として読む。 */
  supportKind?: 'スラブ' | '片持スラブ'
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

export function resolveSlabEnd(
  input: SlabEndInput,
  pack: RulePack,
): SlabEndDetail {
  const diameter = barDiameter(input.barSize)
  const minimumCoverRule = lookupRule(pack, 'cover.minimum', input.supportCover)
  const fabricationCoverAdditionRule = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const coverRules = [minimumCoverRule, fabricationCoverAdditionRule]
  const availableMm =
    input.supportWidthMm -
    (millimetres(minimumCoverRule) +
      millimetres(fabricationCoverAdditionRule))

  if (input.face === '下端') {
    return resolveBottom(input, pack, diameter, availableMm, coverRules)
  }

  return resolveTop(input, pack, diameter, availableMm, coverRules)
}

/**
 * 下端筋 — 通常の床板は表5.3.4 注3 の「10d かつ150mm以上」なので二つの行の
 * 大きい方だ。片持床板は同じセルの括弧書き「25d」が全体を置き換えるため、
 * 下限行を引かない (ADR-039)。
 */
function resolveBottom(
  input: SlabEndInput,
  pack: RulePack,
  diameter: number,
  availableMm: number,
  coverRules: RuleHit[],
): SlabEndDetail {
  const supportKind = input.supportKind ?? 'スラブ'
  const perDiameterRule = lookupRule(pack, 'anchorage.L3', {
    member: supportKind,
  })
  const perDiameterMm = millimetres(perDiameterRule, diameter)

  if (supportKind === '片持スラブ') {
    if (perDiameterMm > availableMm) {
      throw new MemberUnsupportedError(
        '定着不成立',
        `片持床板下端筋の支持辺定着が大梁に収まらない: ` +
          `必要 ${perDiameterMm} mm > 使用可能 ${availableMm} mm`,
      )
    }

    return {
      kind: '直線定着',
      lengthRule: 'anchorage.L3',
      lengthMm: perDiameterMm,
      usedRules: [perDiameterRule, ...coverRules],
    }
  }

  const floorRule = lookupRule(pack, 'anchorage.L3.minimum', {
    member: supportKind,
  })
  const floorMm = millimetres(floorRule)
  const lengthMm = Math.max(perDiameterMm, floorMm)

  if (lengthMm > availableMm) {
    throw new MemberUnsupportedError(
      '定着不成立',
      `床板下端筋の直線定着が大梁に収まらない: ` +
        `必要 ${lengthMm} mm > 使用可能 ${availableMm} mm`,
    )
  }

  return {
    kind: '直線定着',
    lengthRule:
      perDiameterMm >= floorMm ? 'anchorage.L3' : 'anchorage.L3.minimum',
    lengthMm,
    usedRules: [perDiameterRule, floorRule, ...coverRules],
  }
}

/**
 * 上端筋 — 一般値 L1(注1)。L2 は「割裂破壊のおそれのない箇所」限定で、その
 * 判定材料を製品が持たない (R7)。直線が入らなければ 5.3.4(5)(ｲ) の (a)(b)(c)。
 */
function resolveTop(
  input: SlabEndInput,
  pack: RulePack,
  diameter: number,
  availableMm: number,
  coverRules: RuleHit[],
): SlabEndDetail {
  const straightRule = lookupRule(pack, 'anchorage.L1', {
    fc: input.fc,
    grade: input.grade,
    hook: false,
  })
  const straightLengthMm = millimetres(straightRule, diameter)

  if (straightLengthMm <= availableMm) {
    return {
      kind: '直線定着',
      lengthRule: 'anchorage.L1',
      lengthMm: straightLengthMm,
      usedRules: [straightRule, ...coverRules],
    }
  }

  // anchorage.L1h は引かない — 5.3.4(5)(ｲ) で L1h は**適用条件**であって
  // (a)(b)(c) のどの値も決めない (大梁の resolveGirderEnd と同じ理由)。
  const projectionKey =
    input.supportKind === '片持スラブ' ? 'anchorage.La' : 'anchorage.Lb'
  const projectionRule = lookupRule(pack, projectionKey, {
    fc: input.fc,
    grade: input.grade,
  })
  const tailMinimumRule = lookupRule(pack, 'anchorage.bent.tail.minimum', {})
  const projectionMm = millimetres(projectionRule, diameter)

  if (projectionMm > availableMm) {
    throw new MemberUnsupportedError(
      '定着不成立',
      `床板上端筋の折曲げ定着が大梁に収まらない: ` +
        `必要投影 ${projectionMm} mm > 使用可能 ${availableMm} mm`,
    )
  }

  const tailMinimumMm = projectionMm + millimetres(tailMinimumRule, diameter)
  const lengthMm = Math.max(straightLengthMm, tailMinimumMm)

  return {
    kind: '折曲げ定着',
    lengthRule:
      straightLengthMm >= tailMinimumMm
        ? 'anchorage.L1'
        : 'anchorage.bent.tail.minimum',
    projectionRule: projectionKey,
    lengthMm,
    straightMinimumMm: straightLengthMm,
    tailMinimumMm,
    projectionMm,
    usedRules: [
      straightRule,
      projectionRule,
      tailMinimumRule,
      ...coverRules,
    ],
  }
}
