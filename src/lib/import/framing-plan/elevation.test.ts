import { describe, expect, it } from 'vitest'

import type { TextItem, TextPage } from '../section-list/types'

import { parseFrameElevations } from './elevation'

// 실물 도면 픽스처 대조는 tests/plan-import/elevation.test.ts에 있다.

function h(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 0, h: 8 }
}

/** 세로쓰기 치수. 軸組図의 階高 치수는 실물에서 rot=-90이다 */
function v(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 8, h: 0, rot: -90 }
}

function page(items: TextItem[]): TextPage {
  return { widthPt: 1000, heightPt: 1000, items }
}

/**
 * 축척 0.05pt/mm의 3층. 치수는 자기가 재는 구간의 **중점**에 놓이므로
 * 인접 두 치수의 간격이 (v0+v1)/2 × 축척이 된다 — 파서는 그 관계로 축척을 푼다.
 */
function threeLevels(): TextItem[] {
  return [
    v('2000', 50, 150),
    v('2000', 50, 250),
    h('3FL', 80, 100),
    h('2FL', 80, 200),
    h('1FL', 80, 300),
  ]
}

describe('parseFrameElevations', () => {
  it('치수 열이 없으면 寸法列未検出', () => {
    const parsed = parseFrameElevations(page([h('2FL', 80, 200)]))
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('치수 연쇄에서 축척과 레벨 위치를 풀고, 라벨을 원문 그대로 붙인다', () => {
    const parsed = parseFrameElevations(page(threeLevels()))
    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toEqual([
      {
        titles: [],
        levels: [
          { labels: ['3FL'], positionPt: 100 },
          { labels: ['2FL'], positionPt: 200 },
          { labels: ['1FL'], positionPt: 300 },
        ],
        heightsMm: [2000, 2000],
        scalePtPerMm: 0.05,
      },
    ])
  })

  it('같은 높이의 라벨이 둘이면 둘 다 싣는다 — 어느 쪽이 階인지 고르지 않는다', () => {
    // 실물 yokohama p8의 「中央棟1FL」과 「基準GL」이 이 관계다 (190mm 차 ＝ 5pt)
    const parsed = parseFrameElevations(
      page([...threeLevels(), h('基準GL', 20, 303)]),
    )
    expect(parsed.elevations[0]?.levels.at(-1)).toEqual({
      labels: ['1FL', '基準GL'],
      positionPt: 300,
    })
  })

  it('라벨이 붙은 레벨이 둘 미만이면 계열로 보지 않는다', () => {
    // 부분 치수 열(かぶり·段差 등)은 라벨을 갖지 않는다 — 그것이 유일한 구분이다
    const parsed = parseFrameElevations(
      page([v('2000', 50, 150), v('2000', 50, 250), h('3FL', 80, 100)]),
    )
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('축척이 끊기는 자리에서 계열을 나눈다 — 같은 열의 위·아래 두 軸組図', () => {
    const lower = threeLevels().map((item) => ({ ...item, y: item.y + 600 }))
    const parsed = parseFrameElevations(page([...threeLevels(), ...lower]))
    expect(parsed.elevations).toHaveLength(2)
    expect(parsed.elevations.map((e) => e.levels[0].positionPt)).toEqual([
      100, 700,
    ])
  })

  it('軸組図 제목을 가장 가까운 계열에 원문 그대로 붙인다', () => {
    const parsed = parseFrameElevations(
      page([
        ...threeLevels(),
        h('bY1通り軸組図1/100', 300, 400),
        h('bY2通り軸組図1/100', 600, 400),
      ]),
    )
    expect(parsed.elevations[0]?.titles).toEqual([
      'bY1通り軸組図1/100',
      'bY2通り軸組図1/100',
    ])
  })

  it('레벨 라벨은 치수 열 근처의 것만 본다 — 도면 안의 부재 부호가 섞이지 않는다', () => {
    const parsed = parseFrameElevations(
      page([...threeLevels(), h('C51', 800, 200)]),
    )
    expect(parsed.elevations[0]?.levels[1].labels).toEqual(['2FL'])
  })
})
