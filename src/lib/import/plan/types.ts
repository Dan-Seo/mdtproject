/** 通り芯の軸。図面の X通り・Y通り をそのまま持つ (ADR-008)。 */
export type GridAxis = 'X' | 'Y'

/** 図面から読めた通り芯ラベル1本。positionPt はラベル文字の中心（図面座標 pt）。 */
export interface AxisLabel {
  label: string
  axis: GridAxis
  index: number
  positionPt: number
}
