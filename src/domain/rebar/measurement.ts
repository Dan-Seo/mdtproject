/**
 * 公共建築数量積算基準 第4編第3章第2節「鉄筋の計測・計算」の規則。
 *
 * ここが答えるのは**数量をどう測るか**であって配筋詳細ではない。定着・重ね継手・
 * 折曲げ・かぶりの寸法は標準仕様書5章＝ルールパックの他ファイルが持つ (ADR-002)。
 * 積算基準のこの節が定めるのは寸法ではなく測り方なので、ルールパック側は
 * 「加算しない／加算する量」を持ち、組み立てはここの普通の TS 関数がやる。
 *
 * 測り方は配筋の実際とわざと食い違う（フックを計上しない・初期オフセットを見ない）。
 * 食い違いは誤りではなく積算基準の簡略化なので、数量はここに従い、3D 形状は
 * `Rebar.points`・`Rebar.placement` が別に持つ (ADR-019)。
 */

import type { RuleHit } from '../rules/types'

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function additionMm(rule: RuleHit): number {
  if (rule.unit !== 'mm') {
    throw new Error(`Rule ${rule.key} must use mm: ${rule.unit}`)
  }

  return rule.value
}

/**
 * 1通則2)（紙面 p.15）
 * 「フープ、スタラップの長さは、それぞれ柱、基礎梁、梁及び壁梁のコンクリートの
 *   断面の設計寸法による周長を鉄筋の長さとし、フックはないものとする。」
 *
 * 加工用かぶりを控除せず、フック余長も足さない — その「足さない量」を
 * `measure.hoop.length.addition` が持つ。実際の加工長より長く出る。
 */
export function hoopDesignLengthMm(
  sectionWidthMm: number,
  sectionDepthMm: number,
  additionRule: RuleHit,
): number {
  if (!positiveFinite(sectionWidthMm) || !positiveFinite(sectionDepthMm)) {
    throw new Error(
      `断面の設計寸法 must be positive: ${sectionWidthMm}×${sectionDepthMm}`,
    )
  }

  return 2 * (sectionWidthMm + sectionDepthMm) + additionMm(additionRule)
}

/**
 * 1通則2) の円形断面。
 *
 * 条文は断面形状を矩形に限っていない — 定めているのは「断面の設計寸法による周長」
 * であって、円形断面ではそれが円周 π×直径 である。矩形版と同じく加工用かぶりを
 * 控除せず、フック余長も足さない。
 *
 * 端数は丸めない。1通則6) が四捨五入を定めるのはフック・定着・余長・重ね継手の
 * 長さについてであって周長ではなく、丸めの根拠がない (ADR-026)。
 */
export function circularHoopDesignLengthMm(
  diameterMm: number,
  additionRule: RuleHit,
): number {
  if (!positiveFinite(diameterMm)) {
    throw new Error(`断面の設計寸法 must be positive: ${diameterMm}φ`)
  }

  return Math.PI * diameterMm + additionMm(additionRule)
}

/**
 * 1通則3)（紙面 p.15）
 * 「幅止筋の長さは、基礎梁、梁、壁梁、壁のコンクリートの設計幅又は厚さとし、
 *   フックはないものとする。」
 *
 * 隣の 1通則2) と違って周長ではない — 断面の設計幅そのものである。加工用かぶりを
 * 控除せず、フック余長も足さない。「足さない量」を `measure.width-tie.length.addition`
 * が持つ。条項が挙げる部材に柱はないので、柱にはこの関数を使わない。
 */
export function widthTieDesignLengthMm(
  sectionWidthMm: number,
  additionRule: RuleHit,
): number {
  if (!positiveFinite(sectionWidthMm)) {
    throw new Error(`コンクリートの設計幅 must be positive: ${sectionWidthMm}`)
  }

  return sectionWidthMm + additionMm(additionRule)
}

/**
 * 1通則4)（紙面 p.15）
 * 「重ね継手又はガス圧接継手について……計測・計算した鉄筋の長さについて、径１３㎜
 *   以下の鉄筋は６．０ｍごとに、径１６㎜以上の鉄筋は７．０ｍごとに継手があるもの
 *   として継手箇所数を求める。」
 *
 * 「ごとに」を長さ÷単位の整数部と読む。ちょうど倍数のときに1か所か2か所かは
 * 原文から決まらないので、ゴールデン事例は端数を持つ長さだけを固定してある
 * （tests/golden/fixtures/quantity-r5-ch3.json の spliceCount.interpretation）。
 */
export function intervalSpliceCount(
  barLengthMm: number,
  intervalRule: RuleHit,
): number {
  if (!positiveFinite(barLengthMm)) {
    throw new Error(`鉄筋の長さ must be positive: ${barLengthMm}`)
  }

  const intervalMm = additionMm(intervalRule)
  if (!positiveFinite(intervalMm)) {
    throw new Error(
      `継手箇所数を求める長さの単位 must be positive: ${intervalMm}`,
    )
  }

  return Math.floor(barLengthMm / intervalMm)
}

/** 箇所で数える規準値を読む。0.5か所（（３）梁2)）があるので整数に丸めない。 */
export function spliceCount(rule: RuleHit): number {
  if (rule.unit !== '箇所') {
    throw new Error(`Rule ${rule.key} must use 箇所: ${rule.unit}`)
  }

  return rule.value
}

/** 長さの区分で継手箇所数が変わる規準（（３）梁2)）の1区分。 */
export interface SpliceBand {
  countRule: RuleHit
  /** この区分の上限 (mm)。上限を持たない区分が最後の区分になる。 */
  upperBoundRule: RuleHit | null
}

/**
 * 2（３）梁2)（紙面 p.17）
 * 「連続する梁の全長にわたる主筋の継手については、１通則４）の規定にかかわらず、
 *   梁の長さが、５．０ｍ未満は０．５か所、５．０ｍ以上１０．０ｍ未満は１か所、
 *   １０．０ｍ以上は２か所あるものとする。」
 *
 * 区分の境目（5.0m・10.0m）は規準の数値なのでルールパックが持つ。ここが持つのは
 * 「上限未満ならその区分」という読み方だけである。
 *
 * bands は上限の昇順で渡す。昇順でない区分表はここでは検査しない —
 * ルールパックはビルド時に固まるチェックイン済みの YAML で、順序は
 * src/rulepack/index.test.ts が値で固定する。
 */
export function bandedSpliceRule(
  lengthMm: number,
  bands: SpliceBand[],
): RuleHit {
  if (!positiveFinite(lengthMm)) {
    throw new Error(`梁の長さ must be positive: ${lengthMm}`)
  }

  const openEnded = bands.findIndex(({ upperBoundRule }) => upperBoundRule === null)
  if (openEnded !== bands.length - 1) {
    // 上限なしの区分が最後にちょうど1つないと、長い梁が表から落ちて箇所数が
    // 0 になるか、短い梁が上限なしの区分に吸われる。黙って数字を返さない。
    throw new Error(
      '継手箇所数の区分表は上限なしの区分を最後に1つだけ持たなければならない',
    )
  }

  for (const { countRule, upperBoundRule } of bands) {
    if (upperBoundRule === null) return countRule
    if (lengthMm < additionMm(upperBoundRule)) return countRule
  }

  throw new Error(`継手箇所数の区分が見つからない: ${lengthMm}`)
}

/**
 * 継手箇所数を設計長さに算入する量。重ね継手なら1か所あたり重ね継手長さ、
 * ガス圧接なら 1通則5)「長さの変化はないものとする」で 0 になる。
 * どちらの倍率もルールパックの measure.splice.length.factor が持つ。
 */
export function spliceLengthMm(
  count: number,
  lapLengthMm: number,
  factorRule: RuleHit,
): number {
  if (factorRule.unit !== 'ratio') {
    throw new Error(`Rule ${factorRule.key} must use ratio: ${factorRule.unit}`)
  }
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`継手箇所数 must not be negative: ${count}`)
  }
  if (!Number.isFinite(lapLengthMm) || lapLengthMm < 0) {
    throw new Error(`継手の重ね長さ must not be negative: ${lapLengthMm}`)
  }

  return count * lapLengthMm * factorRule.value
}

/**
 * 1通則7)（紙面 p.15）
 * 「鉄筋の割付本数が設計図書に記載されていない場合は、その部分の長さを鉄筋の
 *   間隔で除し、小数点以下第１位を切り上げた整数……に１を加える。」
 *
 * 「その部分の長さ」は躯体の区分（第4編第1章第2節・紙面 p.10）による。
 * 各階柱は各階床板上面間＝階高、大梁は柱に接する内法部分＝内法長さ。
 * 断面一覧の初期オフセットは配置の都合であって積算基準は関知しない —
 * だから引数に取らない。
 */
export function distributionCount(
  partLengthMm: number,
  pitchMm: number,
  additionRule: RuleHit,
): number {
  if (!positiveFinite(partLengthMm)) {
    throw new Error(`その部分の長さ must be positive: ${partLengthMm}`)
  }
  if (!positiveFinite(pitchMm)) {
    throw new Error(`鉄筋の間隔 must be positive: ${pitchMm}`)
  }
  if (additionRule.unit !== '本') {
    throw new Error(`Rule ${additionRule.key} must use 本: ${additionRule.unit}`)
  }

  return Math.ceil(partLengthMm / pitchMm) + additionRule.value
}
