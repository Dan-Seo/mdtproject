import { recoverRows } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/types'

import type { AxisLabel, GridAxis } from './types'

/**
 * 通り芯ラベルの形。X・Y に続く1〜2桁の番号だけを取る。
 * 「FC1」「G1」のような符号を拾わないよう、先頭から末尾までを縛る。
 */
const AXIS_LABEL = /^([XY])(\d{1,2})$/

export function axisLabels(items: TextItem[]): AxisLabel[] {
  const labels: AxisLabel[] = []

  for (const row of recoverRows(items)) {
    for (const segment of row.segments) {
      const match = AXIS_LABEL.exec(segment.compact)
      if (!match) continue

      const axis = match[1] as GridAxis
      labels.push({
        label: segment.compact,
        axis,
        index: Number(match[2]),
        // X通りは図面の横位置に、Y通りは縦位置に並ぶ — 軸ごとに測る向きが違う。
        // row.y はベースライン(textitems.ts)なので文字の下端 — 中心は高さの半分だけ上、負方向にずれる。
        positionPt: axis === 'X' ? segment.centerX : row.y - row.height / 2,
      })
    }
  }

  return labels
}
