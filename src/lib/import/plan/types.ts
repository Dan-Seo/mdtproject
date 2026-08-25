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

/**
 * 通り芯とスパンが噛み合わなかった理由。値を作らずにこれを返す (ADR-004・ADR-030③)。
 * - 通り芯ラベル不足: ラベルが2本未満で、スパンが1つも定義できない
 * - 区間数不足: ラベルがちょうど2本（スパンが1本）で、合計照合が何も確かめない
 *   ─ その1本自身を合計と読めば常に成立してしまうからだ (ADR-030③-2)
 * - 寸法本数不一致: 隣り合う通り芯の間に、合計以外で使える寸法が一つも無い
 * - 合計寸法不一致: 区間ごとに1本ずつ選んでも、和が合計寸法になる並びが無い
 * - 寸法組合せ不定: 和が合計寸法になる並びが2通り以上あり、一つに決められない
 * - 計算量超過: 部分和の組み合わせが多すぎて、上限内に検算し切れない
 */
export type GridIssue =
  | '通り芯ラベル不足'
  | '区間数不足'
  | '寸法本数不一致'
  | '合計寸法不一致'
  | '寸法組合せ不定'
  | '計算量超過'

/**
 * 1軸分の読み取り結果。`issues` が空のときだけ取り込める。
 *
 * `labels` は**図面上の位置順**で、`spansMm[i]` は `labels[i]` と `labels[i+1]`
 * の間の寸法だ。ラベル番号順ではない — +y が下向きなので Y通りは位置順に並べると
 * Y3・Y2・Y1 になる(kani-p38 実測)。
 *
 * `issues` が空でないときは `spansMm` が空・`totalMm` が null になる。検算に
 * 落ちた並びを部分的に返すと、どれが誤読か判らないまま値が出てしまう。
 */
export interface GridCandidate {
  axis: GridAxis
  labels: AxisLabel[]
  spansMm: number[]
  totalMm: number | null
  issues: GridIssue[]
}
