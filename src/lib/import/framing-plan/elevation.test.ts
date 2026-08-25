import { describe, expect, it } from 'vitest'

import type { TextItem } from '../types'
import type { TextPage } from '../section-list/types'

import { parseFrameElevations } from './elevation'

// 실물 도면 픽스처 대조는 tests/plan-import/elevation.test.ts에 있다.

function h(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 0, h: 8 }
}

const VERTICAL_GLYPH_WIDTH_PT = 8

/** 세로쓰기 치수. 軸組図의 階高 치수는 실물에서 rot=-90이다.
 *  인자 y는 문자열의 물리 중심이고, TextItem.y(원점)는 진행량 w의 절반만큼
 *  그 아래다 — VerticalRun.y가 바운딩 박스 중심이라서다 (runs.ts) */
function v(str: string, x: number, y: number): TextItem {
  return {
    str,
    x,
    y: y + VERTICAL_GLYPH_WIDTH_PT / 2,
    w: VERTICAL_GLYPH_WIDTH_PT,
    h: 0,
    rot: -90,
  }
}

function page(items: TextItem[]): TextPage {
  return { widthPt: 1000, heightPt: 1000, items }
}

/**
 * 축척 0.05pt/mm의 4레벨. 치수는 자기가 재는 구간의 **중점**에 놓이므로
 * 인접 두 치수의 간격이 (v0+v1)/2 × 축척이 된다 — 파서는 그 관계로 축척을 푼다.
 *
 * 치수가 셋인 것은 필요조건이다 — 둘이면 유도한 축척을 대조할 상대가 없다.
 */
function fourLevels(): TextItem[] {
  return [
    v('2000', 50, 150),
    v('2000', 50, 250),
    v('2000', 50, 350),
    h('RFL', 80, 100),
    h('3FL', 80, 200),
    h('2FL', 80, 300),
    h('1FL', 80, 400),
    // 계열은 軸組図에 속한다 — 제목이 없으면 무엇의 높이인지 말할 수 없다
    h('bY1通り軸組図1/100', 300, 500),
  ]
}

describe('parseFrameElevations', () => {
  it('치수 열이 없으면 寸法列未検出', () => {
    const parsed = parseFrameElevations(page([h('2FL', 80, 200)]))
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('치수 연쇄에서 축척과 레벨 위치를 풀고, 라벨을 원문 그대로 붙인다', () => {
    const parsed = parseFrameElevations(page(fourLevels()))
    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toEqual([
      {
        titles: ['bY1通り軸組図1/100'],
        levels: [
          { labels: ['RFL'], positionPt: 100 },
          { labels: ['3FL'], positionPt: 200 },
          { labels: ['2FL'], positionPt: 300 },
          { labels: ['1FL'], positionPt: 400 },
        ],
        heightsMm: [2000, 2000, 2000],
        scalePtPerMm: 0.05,
      },
    ])
  })

  it('같은 높이의 라벨이 둘이면 둘 다 싣는다 — 어느 쪽이 階인지 고르지 않는다', () => {
    // 실물 yokohama p8의 「中央棟1FL」과 「基準GL」이 이 관계다 (190mm 차 ＝ 5pt)
    const parsed = parseFrameElevations(
      page([...fourLevels(), h('基準GL', 20, 403)]),
    )
    expect(parsed.elevations[0]?.levels.at(-1)).toEqual({
      labels: ['1FL', '基準GL'],
      positionPt: 400,
    })
  })

  it('라벨이 붙은 레벨이 둘 미만이면 계열로 보지 않는다', () => {
    // 부분 치수 열(かぶり·段差 등)은 라벨을 갖지 않는다 — 그것이 유일한 구분이다
    const parsed = parseFrameElevations(
      page(
        fourLevels().filter(
          (item) => !['RFL', '3FL', '2FL'].includes(item.str),
        ),
      ),
    )
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('치수가 둘뿐인 열은 계열로 보지 않는다 — 유도한 축척을 대조할 상대가 없다', () => {
    // 실물 kani p40에서는 위·아래 두 軸組図의 같은 치수가 한 열로 이어져
    // 축척이 3배·220배로 나왔는데도 계산된 자리에 마침 글자가 있어 통과했다
    const parsed = parseFrameElevations(
      // 354 = 중심 350 + w/2 — v()가 원점을 중심 아래로 싣는다
      page(
        fourLevels().filter(
          (item) => item.y !== 350 + VERTICAL_GLYPH_WIDTH_PT / 2,
        ),
      ),
    )
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('축척이 끊기는 자리에서 계열을 나눈다 — 같은 열의 위·아래 두 軸組図', () => {
    const lower = fourLevels().map((item) => ({ ...item, y: item.y + 800 }))
    const parsed = parseFrameElevations(page([...fourLevels(), ...lower]))
    expect(parsed.elevations).toHaveLength(2)
    expect(parsed.elevations.map((e) => e.levels[0].positionPt)).toEqual([
      100, 900,
    ])
  })

  it('한 계열이 여러 通り의 軸組図에 공통으로 걸린다', () => {
    const parsed = parseFrameElevations(
      page([...fourLevels(), h('bY2通り軸組図1/100', 600, 500)]),
    )
    expect(parsed.elevations[0]?.titles).toEqual([
      'bY1通り軸組図1/100',
      'bY2通り軸組図1/100',
    ])
  })

  it('제목이 없는 치수 열은 계열로 보지 않는다', () => {
    // 실물 yokohama 전 18쪽을 통과시키면 **地質柱状図**가 걸린다 — 깊이 숫자가
    // 열을 이루고 옆에 라벨이 서서 여기까지의 조건을 전부 만족한다
    const parsed = parseFrameElevations(
      page(fourLevels().filter((item) => !item.str.includes('軸組'))),
    )
    expect(parsed.elevations).toEqual([])
    expect(parsed.issues).toEqual(['寸法列未検出'])
  })

  it('레벨 라벨은 치수 열 근처의 것만 본다 — 도면 안의 부재 부호가 섞이지 않는다', () => {
    const parsed = parseFrameElevations(
      page([...fourLevels(), h('C51', 800, 200)]),
    )
    expect(parsed.elevations[0]?.levels[1].labels).toEqual(['3FL'])
  })
})
