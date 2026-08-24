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

  it('같은 라벨이 도면 양 끝(위·아래)에 같은 위치로 중복 인쇄돼도 하나로 접는다', () => {
    const items = [
      // 위쪽 X1
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      // 아래쪽 X1 — 같은 통り芯이므로 x는 같고 y만 다르다
      glyph('X', 100, 800),
      glyph('1', 105, 800),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
    ])
  })

  it('같은 라벨의 중복 인쇄가 허용오차 밖에서 어긋나면 그 라벨은 통째로 버리고, 다른 라벨은 영향받지 않는다', () => {
    const items = [
      // X1 — 위·아래가 20pt 어긋난다(런 재조립이 다른 격자선을 잘못 묶었다고 가정)
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      glyph('X', 120, 800),
      glyph('1', 125, 800),
      // X2 — 한 번만 나오므로 영향받지 않고 그대로 남는다
      glyph('X', 200, 40),
      glyph('2', 205, 40),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X2', axis: 'X', index: 2, positionPt: 205 },
    ])
  })

  it('라벨용 문턱을 좁혀, 기본 배수(2.2)라면 붙어버릴 라벨 사이 간격(약10pt)도 갈라 읽는다', () => {
    const h = 14.16 // kani 실측 글자 높이(ADR-030)에 근접한 값
    const items = [
      glyph('X', 100, 40, h),
      glyph('1', 105, 40, h),
      // 다음 라벨과의 간격 10pt — 기본 배수(문턱 ≈31pt)라면 한 세그먼트로
      // 붙어 compact가 "X1X2"가 되어 정규식이 통째로 버린다(Finding B)
      glyph('X', 120, 40, h),
      glyph('2', 125, 40, h),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
      { label: 'X2', axis: 'X', index: 2, positionPt: 125 },
    ])
  })
})
