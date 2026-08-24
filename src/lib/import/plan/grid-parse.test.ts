import { describe, expect, it } from 'vitest'

import { axisLabels } from '@/lib/import/plan/grid-parse'
import type { TextItem } from '@/lib/import/section-list/types'

const glyph = (str: string, x: number, y: number, h = 8): TextItem => ({
  str,
  x,
  y,
  w: 5,
  h,
})

describe('axisLabels', () => {
  it('X通り・Y通り のラベルを軸と番号に分けて読む', () => {
    const items = [
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      glyph('X', 200, 40),
      glyph('2', 205, 40),
      glyph('Y', 40, 300),
      glyph('1', 45, 300),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
      { label: 'X2', axis: 'X', index: 2, positionPt: 205 },
      { label: 'Y1', axis: 'Y', index: 1, positionPt: 296 },
    ])
  })

  it('通り芯でない文字列は拾わない', () => {
    const items = [
      glyph('F', 100, 40),
      glyph('C', 105, 40),
      glyph('1', 110, 40),
    ]

    expect(axisLabels(items)).toEqual([])
  })

  it('Y通りラベルと同じ行に高さ・yの違う文字列が混ざっても、ラベル自身の字形だけで中心を測る', () => {
    const items = [
      glyph('Y', 40, 300),
      glyph('1', 45, 300),
      // 部材符号など無関係な文字列。recoverRows の許容誤差(tolerance = min(8,20)*0.3 = 2.4)
      // 内の y=302 で同じ行に混ざり、行の高さ集計を 8→20 に引き上げる。x が離れているので
      // makeSegments では別セグメントになる — row.y・row.height を使うと Y1 の中心が
      // このセグメントに引きずられることを検出する
      glyph('G1', 140, 302, 20),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'Y1', axis: 'Y', index: 1, positionPt: 296 },
    ])
  })
})
