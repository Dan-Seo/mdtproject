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
  if (!(sectionWidthMm > 0) || !(sectionDepthMm > 0)) {
    throw new Error(
      `断面の設計寸法 must be positive: ${sectionWidthMm}×${sectionDepthMm}`,
    )
  }

  return 2 * (sectionWidthMm + sectionDepthMm) + additionMm(additionRule)
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
  if (!(partLengthMm > 0)) {
    throw new Error(`その部分の長さ must be positive: ${partLengthMm}`)
  }
  if (!(pitchMm > 0)) {
    throw new Error(`鉄筋の間隔 must be positive: ${pitchMm}`)
  }
  if (additionRule.unit !== '本') {
    throw new Error(`Rule ${additionRule.key} must use 本: ${additionRule.unit}`)
  }

  return Math.ceil(partLengthMm / pitchMm) + additionRule.value
}
