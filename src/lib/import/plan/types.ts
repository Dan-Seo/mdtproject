/** 通り芯の軸。図面の X通り・Y通り をそのまま持つ (ADR-008)。 */
export type GridAxis = 'X' | 'Y'

/** 図面から読めた通り芯ラベル1本。positionPt はラベル文字の中心（図面座標 pt）。 */
export interface AxisLabel {
  label: string
  axis: GridAxis
  index: number
  positionPt: number
}

/**
 * 図面に書かれた寸法値ひとつ。図面の寸法は mm 単位で、千位のコンマを打つ
 * 書き方が多い（実測: kani 基礎伏図 の「6,000」）。
 */
export interface DimensionText {
  valueMm: number
  positionPt: number
  axis: GridAxis
}
