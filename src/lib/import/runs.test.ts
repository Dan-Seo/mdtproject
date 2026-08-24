import { describe, expect, it } from 'vitest'

import { makeSegments, recoverRows, verticalRuns } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/section-list/types'

const glyph = (
  str: string,
  x: number,
  y: number,
  rot?: number,
  h = 8,
): TextItem => ({ str, x, y, w: 5, h, ...(rot === undefined ? {} : { rot }) })

describe('makeSegments', () => {
  it('centerY는 세그먼트 자신의 글리프에서만 잰다 — y는 평균, 높이는 최댓값(둘이 다른 값이면 행 집계와 갈린다)', () => {
    const items = [
      glyph('1', 10, 300, undefined, 8),
      glyph('2', 15, 304, undefined, 20),
    ]

    const segments = makeSegments(items)

    expect(segments).toHaveLength(1)
    // baseline 평균 = (300+304)/2 = 302, 높이 최댓값 = 20 → centerY = 302 - 10
    expect(segments[0].centerY).toBe(292)
  })
})

describe('recoverRows', () => {
  it('가로로 인접한 글자를 한 세그먼트로 되돌린다', () => {
    const items = [
      glyph('6', 100, 50),
      glyph(',', 105, 50),
      glyph('0', 110, 50),
      glyph('0', 115, 50),
      glyph('0', 120, 50),
    ]

    const rows = recoverRows(items)

    expect(rows).toHaveLength(1)
    expect(rows[0].segments.map((segment) => segment.text)).toEqual(['6,000'])
  })
})

describe('verticalRuns', () => {
  it('rot=-90 의 글자를 아래에서 위로 읽어 되돌린다', () => {
    // 도면의 세로 치수는 아래에서 위로 읽는다 — `verticalRuns`가 y 내림차순으로
    // 읽으므로, 첫 글자 '1'이 가장 아래(y가 가장 큼)에 있어야 '16,500'이 된다.
    // 글자 간격 8 ≤ w(5) × PROXIMITY_MULTIPLIER(2) 라 한 런으로 묶인다.
    const items = [
      glyph('1', 40, 120, -90),
      glyph('6', 40, 112, -90),
      glyph(',', 40, 104, -90),
      glyph('5', 40, 96, -90),
      glyph('0', 40, 88, -90),
      glyph('0', 40, 80, -90),
    ]

    const runs = verticalRuns(items)

    expect(runs.map((run) => run.text)).toEqual(['16,500'])
  })
})
