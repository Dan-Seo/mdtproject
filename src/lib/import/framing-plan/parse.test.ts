import { describe, expect, it } from 'vitest'

import type { TextItem } from '../types'
import type { TextPage } from '../section-list/types'

import { parseFramingPlan } from './parse'

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

describe('parseFramingPlan — 通り芯グリッド', () => {
  it('라벨이 하나도 없으면 通り芯ラベル未検出', () => {
    const parsed = parseFramingPlan(page([h('8700', 200, 80)]))
    expect(parsed.grids).toEqual([])
    expect(parsed.issues).toEqual(['通り芯ラベル未検出'])
  })

  it('가로 밴드: 라벨 2본 + 중점 치수 → X 후보', () => {
    const parsed = parseFramingPlan(
      page([h('X1', 100, 50), h('X2', 300, 50), h('6000', 200, 80)]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.grids).toEqual([
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
    const parsed = parseFramingPlan(
      page([h('bY1', 50, 100), h('bY2', 50, 300), v('4500', 80, 200)]),
    )
    expect(parsed.issues).toEqual([])
    expect(parsed.grids).toEqual([
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
    const parsed = parseFramingPlan(
      page([h('X1', 100, 50), h('X2', 300, 50), h('6,000', 200, 80)]),
    )
    expect(parsed.grids[0]?.spansMm).toEqual([6000])
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
      const parsed = parseFramingPlan(page(items))
      expect(parsed.grids).toEqual([])
      expect(parsed.issues).toEqual(['寸法欠落'])
    }
  })

  it('스팬별 실측 축척이 3%를 넘게 갈리면 縮尺不整合', () => {
    const parsed = parseFramingPlan(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X3', 500, 50),
        h('6000', 200, 80),
        h('3000', 400, 80), // 같은 200pt인데 3000mm — 축척이 2배 갈린다
      ]),
    )
    expect(parsed.grids).toEqual([])
    expect(parsed.issues).toEqual(['縮尺不整合'])
  })

  it('전체 치수가 스팬 합과 일치하면 totalConfirmed', () => {
    const parsed = parseFramingPlan(
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
    expect(parsed.grids[0]?.totalConfirmed).toBe(true)
  })

  it('전체 치수가 스팬 합과 다르면 合計不一致 — 오독 신호이므로 후보를 내지 않는다', () => {
    const parsed = parseFramingPlan(
      page([
        h('X1', 100, 50),
        h('X2', 300, 50),
        h('X3', 500, 50),
        h('6000', 200, 80),
        h('6000', 400, 80),
        h('11000', 300, 110),
      ]),
    )
    expect(parsed.grids).toEqual([])
    expect(parsed.issues).toEqual(['合計不一致'])
  })

  it('같은 밴드에서 라벨이 반복되면 블록 경계로 갈라 읽고, 동일 결과는 하나로 접는다', () => {
    // 한 페이지에 같은 그리드의 伏図가 두 블록 — 실물 p7의 배치다
    const parsed = parseFramingPlan(
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
    expect(parsed.grids).toHaveLength(1)
    expect(parsed.grids[0]?.axes.map((axis) => axis.label)).toEqual([
      'X1',
      'X2',
    ])
  })

  it('한 밴드에 X와 Y 라벨이 섞이면 ラベル文字混在 — 방향을 지어내지 않는다', () => {
    const parsed = parseFramingPlan(
      page([h('X1', 50, 100), h('Y2', 50, 300), v('4500', 80, 200)]),
    )
    expect(parsed.grids).toEqual([])
    expect(parsed.issues).toEqual(['ラベル文字混在'])
  })
})

describe('parseFramingPlan — 부재 배치', () => {
  /** 3×3 격자 하나. X: X1·X2·X3 (0·200·400pt), Y: Y1·Y2·Y3 (0·200·400pt) */
  function gridItems(): TextItem[] {
    return [
      h('X1', 0, -40),
      h('X2', 200, -40),
      h('X3', 400, -40),
      h('6000', 100, -20),
      h('6000', 300, -20),
      h('Y1', -40, 0),
      h('Y2', -40, 200),
      h('Y3', -40, 400),
      v('6000', -20, 100),
      v('6000', -20, 300),
    ]
  }

  it('격자점 위의 부호는 格子点 — 방향을 갖지 않는다', () => {
    const parsed = parseFramingPlan(page([...gridItems(), h('C1', 200, 200)]))
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0]?.placements).toEqual([
      { mark: 'C1', role: '格子点', ix: 1, iy: 1 },
    ])
  })

  it('X 중점·Y 격자점이면 辺 axis=X — 시작 격자점을 싣는다', () => {
    const parsed = parseFramingPlan(page([...gridItems(), h('G1', 300, 200)]))
    expect(parsed.blocks[0]?.placements).toEqual([
      { mark: 'G1', role: '辺', ix: 1, iy: 1, axis: 'X' },
    ])
  })

  it('X 격자점·Y 중점이면 辺 axis=Y', () => {
    const parsed = parseFramingPlan(page([...gridItems(), h('G2', 200, 100)]))
    expect(parsed.blocks[0]?.placements).toEqual([
      { mark: 'G2', role: '辺', ix: 1, iy: 0, axis: 'Y' },
    ])
  })

  it('양쪽 중점이면 ベイ — 원점 쪽 격자점을 싣는다', () => {
    const parsed = parseFramingPlan(page([...gridItems(), h('S1', 300, 300)]))
    expect(parsed.blocks[0]?.placements).toEqual([
      { mark: 'S1', role: 'ベイ', ix: 1, iy: 1 },
    ])
  })

  it('격자점에서도 중점에서도 먼 부호는 지어내지 않고 未配置로 남긴다', () => {
    // 허용은 **중앙값** 스팬의 1/4이므로, 등간격 격자에서는 어느 점이든 반드시
    // 어딘가에 붙는다(최대 거리가 정확히 허용과 같다). 못 붙는 자리는 유난히
    // 긴 스팬 안에서 생긴다 — 실물 yokohama의 1200mm 띠와 8700mm 스팬처럼
    const parsed = parseFramingPlan(
      page([
        h('X1', 0, -40),
        h('X2', 200, -40),
        h('X3', 400, -40),
        h('X4', 1200, -40),
        h('6000', 100, -20),
        h('6000', 300, -20),
        h('24000', 800, -20),
        h('Y1', -40, 0),
        h('Y2', -40, 200),
        v('6000', -20, 100),
        // 격자점 400 에서도 중점 800 에서도 200pt — 중앙값 스팬 200 의 1/4 을 넘는다
        h('B1', 600, 0),
      ]),
    )
    expect(parsed.blocks[0]?.placements).toEqual([])
    expect(parsed.blocks[0]?.unplacedMarks).toEqual(['B1'])
  })

  it('블록 밖의 부호는 아예 보지 않는다 — 같은 페이지의 断面リスト가 섞이지 않는다', () => {
    const parsed = parseFramingPlan(page([...gridItems(), h('C9', 900, 900)]))
    expect(parsed.blocks[0]?.placements).toEqual([])
    expect(parsed.blocks[0]?.unplacedMarks).toEqual([])
  })

  it('같은 부호가 여러 자리에 있으면 자리마다 하나씩 낸다', () => {
    const parsed = parseFramingPlan(
      page([...gridItems(), h('C1', 0, 0), h('C1', 400, 400)]),
    )
    expect(parsed.blocks[0]?.placements).toEqual([
      { mark: 'C1', role: '格子点', ix: 0, iy: 0 },
      { mark: 'C1', role: '格子点', ix: 2, iy: 2 },
    ])
  })

  it('伏図 제목을 원문 그대로 싣는다 — 階 대응은 사람이 정한다', () => {
    const parsed = parseFramingPlan(
      page([...gridItems(), h('2階床伏図1/100', 200, 460)]),
    )
    expect(parsed.blocks[0]?.title).toBe('2階床伏図1/100')
  })

  it('블록마다 자기 위치의 通り芯을 갖는다 — 그리드는 접혀도 블록은 안 접힌다', () => {
    const right = gridItems().map((item) => ({ ...item, x: item.x + 800 }))
    const parsed = parseFramingPlan(
      page([...gridItems(), ...right, h('C1', 200, 200), h('C2', 1000, 200)]),
    )
    expect(parsed.grids).toHaveLength(2)
    expect(parsed.blocks).toHaveLength(2)
    const xPositions = parsed.blocks.map(
      (block) => block.xGrid.axes[0]?.positionPt,
    )
    expect(xPositions).toEqual([
      0, 800,
    ])
    expect(
      parsed.blocks.map((block) =>
        block.placements.map((placement) => placement.mark),
      ),
    ).toEqual([['C1'], ['C2']])
  })
})

describe('parseFramingPlan — X·Y 通り芯 짝지음', () => {
  it('Y 열이 X 열의 실측 스팬에 비해 너무 멀면 블록을 만들지 않는다', () => {
    const parsed = parseFramingPlan(
      page([
        h('X1', 0, -40),
        h('X2', 200, -40),
        h('X3', 400, -40),
        h('6000', 100, -20),
        h('6000', 300, -20),
        h('Y1', 800, 0),
        h('Y2', 800, 200),
        h('Y3', 800, 400),
        v('6000', 820, 100),
        v('6000', 820, 300),
      ]),
    )

    expect(parsed.blocks).toEqual([])
    expect(parsed.issues).toContain('通り芯対応不明')
  })

  it('서로 다른 X 열 둘이 같은 Y 열을 공유하지 않는다', () => {
    const parsed = parseFramingPlan(
      page([
        h('X1', 0, -40),
        h('X2', 200, -40),
        h('X3', 400, -40),
        h('X1', 500, -40),
        h('X2', 700, -40),
        h('X3', 900, -40),
        h('6000', 100, -20),
        h('6000', 300, -20),
        h('6000', 600, -20),
        h('6000', 800, -20),
        h('Y1', 450, 0),
        h('Y2', 450, 200),
        h('Y3', 450, 400),
        v('6000', 470, 100),
        v('6000', 470, 300),
      ]),
    )

    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.issues).toContain('通り芯対応不明')
  })

  it('최소 거리가 같은 Y 열이 둘이면 배열 순서로 고르지 않는다', () => {
    const parsed = parseFramingPlan(
      page([
        h('X1', 400, -40),
        h('X2', 600, -40),
        h('X3', 800, -40),
        h('6000', 500, -20),
        h('6000', 700, -20),
        h('Y1', 300, 0),
        h('Y2', 300, 200),
        h('Y3', 300, 400),
        v('6000', 320, 100),
        v('6000', 320, 300),
        h('Y1', 900, 0),
        h('Y2', 900, 200),
        h('Y3', 900, 400),
        v('6000', 920, 100),
        v('6000', 920, 300),
      ]),
    )

    expect(parsed.blocks).toEqual([])
    expect(parsed.issues).toContain('通り芯対応不明')
  })
})
