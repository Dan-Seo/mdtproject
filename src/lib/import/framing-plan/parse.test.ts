import { describe, expect, it } from 'vitest'

import type { TextItem, TextPage } from '../section-list/types'

import { parseFramingPlanGrids } from './parse'

// 실물 도면 픽스처 대조는 tests/plan-import/parse.test.ts에 있다.
// 여기는 합성 TextPage로 파서의 경계 규칙만 고정한다 (section-list와 같은 분담).

/** 가로쓰기 토큰 하나. w=0이라 centerX == x — 중점 계산을 정수로 유지한다. */
function h(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 0, h: 8 }
}

/** 세로쓰기(rot=-90) 토큰 하나. verticalRuns가 단독 런으로 복원한다. */
function v(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 8, h: 0, rot: -90 }
}

function page(items: TextItem[]): TextPage {
  return { widthPt: 1000, heightPt: 1000, items }
}

describe('parseFramingPlanGrids', () => {
  it('라벨이 하나도 없으면 通り芯ラベル未検出', () => {
    const parsed = parseFramingPlanGrids(page([h('8700', 200, 80)]))
    expect(parsed.candidates).toEqual([])
    expect(parsed.issues).toEqual(['通り芯ラベル未検出'])
  })

  it('가로 밴드: 라벨 2본 + 중점 치수 → X 후보', () => {
    const parsed = parseFramingPlanGrids(
      page([h('X1', 100, 50), h('X2', 300, 50), h('6000', 200, 80)]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates).toEqual([
      {
        direction: 'X',
        axes: [
          { label: 'X1', positionPt: 100 },
          { label: 'X2', positionPt: 300 },
        ],
        spansMm: [6000],
        scalePtPerMm: 200 / 6000,
        totalConfirmed: false,
      },
    ])
  })

  it('세로 밴드: 위치는 y, 치수는 rot=-90 런에서 온다', () => {
    const parsed = parseFramingPlanGrids(
      page([h('bY1', 50, 100), h('bY2', 50, 300), v('4500', 80, 200)]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates).toEqual([
      {
        direction: 'Y',
        axes: [
          { label: 'bY1', positionPt: 100 },
          { label: 'bY2', positionPt: 300 },
        ],
        spansMm: [4500],
        scalePtPerMm: 200 / 4500,
        totalConfirmed: false,
      },
    ])
  })

  it('쉼표 치수(6,000)를 mm 정수로 읽는다', () => {
    const parsed = parseFramingPlanGrids(
      page([h('X1', 100, 50), h('X2', 300, 50), h('6,000', 200, 80)]),
    )
    expect(parsed.candidates[0]?.spansMm).toEqual([6000])
  })

  it('인접 쌍의 중점에 치수가 없으면 寸法欠落 — 후보를 내지 않는다', () => {
    const cases: TextItem[][] = [
      // 치수 자체가 없다
      [h('X1', 100, 50), h('X2', 300, 50)],
      // 중점에서 20pt 벗어났다 (허용 15pt)
      [h('X1', 100, 50), h('X2', 300, 50), h('6000', 220, 80)],
      // 라벨 밴드에서 70pt 떨어진 다른 열의 숫자다 (창 60pt)
      [h('X1', 100, 50), h('X2', 300, 50), h('6000', 200, 120)],
    ]
    for (const items of cases) {
      const parsed = parseFramingPlanGrids(page(items))
      expect(parsed.candidates).toEqual([])
      expect(parsed.issues).toEqual(['寸法欠落'])
    }
  })

  it('스팬별 실측 축척이 3%를 넘게 갈리면 縮尺不整合', () => {
    const parsed = parseFramingPlanGrids(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X3', 500, 50),
        h('6000', 200, 80),
        h('3000', 400, 80), // 같은 200pt인데 3000mm — 축척이 2배 갈린다
      ]),
    )
    expect(parsed.candidates).toEqual([])
    expect(parsed.issues).toEqual(['縮尺不整合'])
  })

  it('전체 치수가 스팬 합과 일치하면 totalConfirmed', () => {
    const parsed = parseFramingPlanGrids(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X3', 500, 50),
        h('6000', 200, 80),
        h('6000', 400, 80),
        h('12000', 300, 110), // 첫-끝 중점. 인접 중점(200·400)과는 100pt 떨어져 있다
      ]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates[0]?.totalConfirmed).toBe(true)
  })

  it('전체 치수가 스팬 합과 다르면 合計不一致 — 오독 신호이므로 후보를 내지 않는다', () => {
    const parsed = parseFramingPlanGrids(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X3', 500, 50),
        h('6000', 200, 80),
        h('6000', 400, 80),
        h('11000', 300, 110),
      ]),
    )
    expect(parsed.candidates).toEqual([])
    expect(parsed.issues).toEqual(['合計不一致'])
  })

  it('같은 밴드에서 라벨이 반복되면 블록 경계로 갈라 읽고, 동일 결과는 하나로 접는다', () => {
    // 한 페이지에 같은 그리드의 伏図가 두 블록 — 실물 p7의 배치다
    const parsed = parseFramingPlanGrids(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X1', 700, 50),
        h('X2', 900, 50),
        h('6000', 200, 80),
        h('6000', 800, 80),
      ]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0]?.axes.map((axis) => axis.label)).toEqual([
      'X1',
      'X2',
    ])
  })

  it('한 밴드에 X와 Y 라벨이 섞이면 ラベル文字混在 — 방향을 지어내지 않는다', () => {
    const parsed = parseFramingPlanGrids(
      page([h('X1', 50, 100), h('Y2', 50, 300), v('4500', 80, 200)]),
    )
    expect(parsed.candidates).toEqual([])
    expect(parsed.issues).toEqual(['ラベル文字混在'])
  })
})
