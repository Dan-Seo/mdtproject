import type { Opening } from '../model/member'
import { MemberUnsupportedError } from '../model/unsupported'
import { lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'

/**
 * 開口部による鉄筋の欠除 (数量積算基準 1通則8))。
 *
 * 「窓、出入口等の開口部による鉄筋の欠除は、原則として建具類等開口部の内法寸法に
 *   よる。ただし、１か所当たり内法面積０．５㎡以下の開口部による鉄筋の欠除は
 *   原則としてないものとする。なお、開口補強筋は設計図書により計測・計算する。」
 *
 * 条文が定めるのは**欠除する量**（開口の内法寸法）と**欠除しない大きさ**（0.5㎡）の
 * 二つだけで、「どの本が欠けるか」は言わない。製品はそこを 1通則7) の割付から読む —
 * 同項が本数を「⌈その部分の長さ ÷ 間隔⌉ ＋ 1」と定めるので、その算式どおりに
 * i 本目を `min(i×間隔, その部分の長さ)` に置き、開口の内法寸法の**内側**に来た本
 * だけを欠けたものとする。境界にちょうど載る本は欠けない（外側の鉄筋を欠除しない）。
 *
 * この並べ方は 1通則7) の読み方であって原文が図で示すものではない (ADR-028・R2)。
 * 断面一覧の初期オフセットは使わない — 積算基準はそれを関知しないからで、
 * `stirrupPositions` が 3D のために置く位置とは別物である (ADR-019)。
 *
 * 開口補強筋はここにない。同項が「設計図書により計測・計算する」と委任するので、
 * 2（３）梁1)・2（４）床板1) の「補強筋等は設計図書による」と同じく製品は作らない。
 */
export interface OpeningDeductionGroup {
  /** この群の1本あたり欠除長さ (mm)。0 は開口を横切らない本の群である */
  deductionMm: number
  count: number
}

export interface OpeningDeductionInput {
  openings: Opening[]
  /** 部材内法域の局所 x 方向の長さ (mm) */
  clearXMm: number
  /** 同じく局所 y 方向 (mm) */
  clearYMm: number
  /** 鉄筋が走る向き。'x' なら局所 x に伸びて y へ並ぶ */
  barAxis: 'x' | 'y'
  pitchMm: number
  /** 1通則7) が数えた割付本数。この関数は数え直さない */
  totalCount: number
}

export interface OpeningDeduction {
  /** 欠除量の昇順。開口がなければ長さ1（全数が欠除 0） */
  groups: OpeningDeductionGroup[]
  /** 但書で欠除しなかった開口 — 算出式がこれを名指す */
  ignored: Opening[]
  /** 欠除の判定に実際に効いた行。開口が一つもなければ空である */
  rules: RuleHit[]
  /**
   * 実際に欠除が起きたときだけの、1通則7) の割付が置く位置 (mm) と、その位置の
   * 本が欠く長さ (mm)。同じ添字が対応する。
   *
   * 3D はふだん断面一覧の初期オフセットから位置を作る (`stirrupPositions`) が、
   * 開口のある部材ではこちらに揃える — 数量が「どの本が欠けたか」を言っている
   * のに、3D がそれとは別の本を欠かせては画面が数量を説明しなくなるからだ。
   * 欠除がなければ null で、そのときは並べ方を変える理由がない (ADR-028)。
   */
  layout: { positionsMm: number[]; deductionsMm: number[] } | null
}

/** ㎡ で書かれた面積の行を mm² に直す。ルールパックは原文の単位のまま持つ。 */
function squareMillimetres(rule: RuleHit): number {
  if (rule.unit !== '㎡') {
    throw new Error(`Rule ${rule.key} must use ㎡: ${rule.unit}`)
  }

  return rule.value * 1_000_000
}

function assertInsideMember(
  opening: Opening,
  clearXMm: number,
  clearYMm: number,
): void {
  const { id, xMm, yMm, widthMm, heightMm } = opening

  if (widthMm <= 0 || heightMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `開口部の内法寸法が正でない: ${id} (${widthMm}×${heightMm})`,
    )
  }

  if (
    xMm < 0 ||
    yMm < 0 ||
    xMm + widthMm > clearXMm ||
    yMm + heightMm > clearYMm
  ) {
    // 内法からはみ出す開口を切り詰めて受け取ると、図面にない大きさの開口を
    // 製品が決めることになる (ADR-004)。入力の誤りとして部材ごと落とす。
    throw new MemberUnsupportedError(
      '寸法不成立',
      `開口部が部材の内法をはみ出す: ${id} ` +
        `(${xMm},${yMm})＋${widthMm}×${heightMm} > ${clearXMm}×${clearYMm}`,
    )
  }
}

export function openingDeduction(
  input: OpeningDeductionInput,
  pack: RulePack,
): OpeningDeduction {
  const { openings, clearXMm, clearYMm, barAxis, pitchMm, totalCount } = input

  if (openings.length === 0) {
    return {
      groups: [{ deductionMm: 0, count: totalCount }],
      ignored: [],
      rules: [],
      layout: null,
    }
  }

  const minimumAreaRule = lookupRule(
    pack,
    'measure.opening.deduction.minimum.area',
    {},
  )
  const minimumAreaMm2 = squareMillimetres(minimumAreaRule)

  const ignored: Opening[] = []
  const deducting: Opening[] = []
  for (const opening of openings) {
    assertInsideMember(opening, clearXMm, clearYMm)

    // 「１か所当たり内法面積０．５㎡以下……は欠除しない」— 境目ちょうどは欠除しない。
    if (opening.widthMm * opening.heightMm <= minimumAreaMm2) {
      ignored.push(opening)
      continue
    }
    deducting.push(opening)
  }

  // 走る向きが x なら y に並び、欠除するのは開口の x 方向の内法寸法である。
  const alongClearMm = barAxis === 'x' ? clearXMm : clearYMm
  const distributionClearMm = barAxis === 'x' ? clearYMm : clearXMm
  const crossing = (opening: Opening): [number, number] =>
    barAxis === 'x'
      ? [opening.yMm, opening.yMm + opening.heightMm]
      : [opening.xMm, opening.xMm + opening.widthMm]
  const deductionOf = (opening: Opening): number =>
    barAxis === 'x' ? opening.widthMm : opening.heightMm

  const counts = new Map<number, number>()
  const positionsMm: number[] = []
  const deductionsMm: number[] = []
  for (let index = 0; index < totalCount; index += 1) {
    // 1通則7) の「⌈その部分の長さ ÷ 間隔⌉ ＋ 1」を位置として読む。最後の1本は
    // 部分の終わりに立つので、間隔の倍数が長さを越えたところで止める。
    const positionMm = Math.min(index * pitchMm, distributionClearMm)
    let deductionMm = 0

    for (const opening of deducting) {
      const [fromMm, toMm] = crossing(opening)
      if (positionMm > fromMm && positionMm < toMm) {
        deductionMm += deductionOf(opening)
      }
    }

    counts.set(deductionMm, (counts.get(deductionMm) ?? 0) + 1)
    positionsMm.push(positionMm)
    deductionsMm.push(deductionMm)
  }

  const groups = [...counts.entries()]
    .map(([deductionMm, count]) => ({ deductionMm, count }))
    .sort((left, right) => left.deductionMm - right.deductionMm)

  const gone = groups.find(({ deductionMm }) => deductionMm >= alongClearMm)
  if (gone) {
    // 欠除しきった鉄筋は「長さ0の鉄筋」ではなく、そこに部材がないということだ。
    throw new MemberUnsupportedError(
      '寸法不成立',
      `開口部の欠除が鉄筋の長さを使い切る: 欠除 ${gone.deductionMm} mm ` +
        `≧ 内法 ${alongClearMm} mm`,
    )
  }

  return {
    groups,
    ignored,
    rules: [minimumAreaRule],
    layout:
      deducting.length === 0 ? null : { positionsMm, deductionsMm },
  }
}
