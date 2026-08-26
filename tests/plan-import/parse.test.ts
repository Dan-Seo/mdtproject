import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DIMENSION_PATTERN,
  parseFramingPlan,
} from '@/lib/import/framing-plan/parse'
import type { PlanGridCandidate } from '@/lib/import/framing-plan/types'
import type { TextPage } from '@/lib/import/section-list/types'
import { recoverRows, verticalRuns } from '@/lib/import/runs'

// TextItem 픽스처 코퍼스는 section-import와 공유한다 — 좌표 규약과 표제란 제외를
// 한 파이프라인(scripts/extract-textitems.mjs)이 보증하기 때문이다.
type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

function readPage(file: string): TextPage {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/section-import/textitems',
    file,
  )
  const fixture = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as TextItemFixture

  return { ...fixture.page, items: fixture.items }
}

const DRAWING_FIXTURES = [
  'kani-p38.json',
  'kani-p39.json',
  'kani-p40.json',
  'kani-p41.json',
  'ojkk-p2.json',
  'ojkk-p3.json',
  'ojkk-p4.json',
  'yokohama-p13.json',
  'yokohama-p14.json',
  'yokohama-p15.json',
  'yokohama-p6.json',
  'yokohama-p7.json',
  'yokohama-p8.json',
  'yokohama-p9.json',
]

function dimensionCandidates(page: TextPage): string[] {
  const horizontal = recoverRows(page.items).flatMap((row) =>
    row.segments.map((segment) => segment.compact),
  )
  const vertical = verticalRuns(page.items).map((run) => run.text)
  return [...horizontal, ...vertical].filter((text) =>
    DIMENSION_PATTERN.test(text),
  )
}

it('실도면 14면의 가로·세로 치수 후보에는 0mm 이하가 없다', () => {
  // 이 가드는 파서 출력이 아니라 runs.ts의 세그먼트 문턱 불변식이다.
  // 실측상 기본 문턱에서는 14면 모두 0건이고, gapRatio를 0.5로 낮추면
  // yokohama-p14의 「650x1000」이 650·x·1·000으로 갈라져 000이 4건 나온다.
  // 0.8·0.7·0.6에서는 침묵하므로 촘촘한 경계가 아닌 굵은 트립와이어다.
  // 세로 `VERTICAL_RUN_GAP_RATIO`도 가로와 같은 굵은 트립와이어다. 14면 전체의 같은
  // 열 인접 1,697쌍에서 `gap / max(w)` 최솟값은 1.000000이고, 1.5~2.0 구간은
  // yokohama-p7의 1쌍뿐이었다. 1 미만인 쌍은 0개였다
  // (6자리 반올림 기준; 원시 최솟값은 부동소수 ULP 잔차로 0.9999999999999634).
  // 0.99·0.8·0.5·0.3에서는 모든 런이 1글자로 갈라져 `DIMENSION_PATTERN`
  // 통과가 0건이다. 배수가 정확히 1.0일 때는 창 `(1w, 2w)`의 하단 모서리에서
  // `00`·`000` 조각이 생겨 0mm 가드가 울며, 기존 8면의 40건을 포함해 kani-p38 3건 ·
  // kani-p39 11건 · ojkk-p3 21건 · ojkk-p4 1건 · yokohama-p6 12건 · p7 13건 ·
  // p8 3건 · p9 5건, 합계 69건이다.
  const measured = DRAWING_FIXTURES.map((file) => {
    const candidates = dimensionCandidates(readPage(file))
    return {
      file,
      nonPositive: candidates.filter(
        (text) => Number.parseInt(text.replaceAll(',', ''), 10) <= 0,
      ),
    }
  })

  expect(measured).toEqual(
    DRAWING_FIXTURES.map((file) => ({ file, nonPositive: [] })),
  )
})

// 이 네 페이지 중 축 라벨 모양의 세그먼트를 가진 것은 yokohama-p14 하나뿐이다
// (12개: `X2端`·`X3端`·`Y2端`·`Y3端`·`Y4端`·`Y5端`의 반복). yokohama-p13·ojkk-p2·
// ojkk-p3은 각각 0개라 라벨 후보 자체가 없다. 이 구별은 폐지된 원본 테스트에도
// 명시돼 있었고, 실측 근거는 fa5ab24의 tests/section-import/plan-grid.test.ts에 남아 있다.
//
// 옛 grid-parse는 X2·X3를 먼저 라벨로 찾은 뒤, 스팬 1본 축은 검산이
// 공회전한다는 이유로 `区間数不足`으로 거절했다. framing-plan은 기전이
// 다르다. 실제 세그먼트는 `X2端`·`Y4端`처럼 라벨 뒤에 `端`이 붙어 있고,
// sticky AXIS_LABEL_PATTERN은 X2를 매치한 뒤 남은 端까지 소비하지 못한다.
// splitAxisLabels가 세그먼트 전체를 설명하지 못한 것으로 보고 빈 배열을
// 반환하므로, framing-plan은 라벨을 찾기 전 단계에서 `通り芯ラベル未検出`을 낸다.
describe('断面リスト pages do not produce framing grids', () => {
  it('does not invent grids from axis-like section marks', () => {
    const files = [
      'yokohama-p14.json',
      'yokohama-p13.json',
      'ojkk-p2.json',
      'ojkk-p3.json',
    ]

    expect(
      files.map((file) => {
        const parsed = parseFramingPlan(readPage(file))
        return {
          file,
          grids: parsed.grids.length,
          issues: parsed.issues,
        }
      }),
    ).toEqual([
      {
        file: 'yokohama-p14.json',
        grids: 0,
        issues: ['通り芯ラベル未検出'],
      },
      {
        file: 'yokohama-p13.json',
        grids: 0,
        issues: ['通り芯ラベル未検出'],
      },
      {
        file: 'ojkk-p2.json',
        grids: 0,
        issues: ['通り芯ラベル未検出'],
      },
      {
        file: 'ojkk-p3.json',
        grids: 0,
        issues: ['通り芯ラベル未検出'],
      },
    ])
  })
})

function grid(
  candidates: PlanGridCandidate[],
  direction: 'X' | 'Y',
): PlanGridCandidate {
  const found = candidates.find((entry) => entry.direction === direction)
  expect(found, `missing ${direction} grid`).toBeDefined()
  return found as PlanGridCandidate
}

// 기대값은 도면에서 독립 전사한 값이다 (원본: tests/fixtures/section-import/SOURCES.md).
// 축 위치(pt)는 도면 좌표라 여기 박지 않고 단조 증가만 본다 — 도면의 진실은
// 라벨 순서와 스팬 치수(mm)다.

describe('yokohama p7 (2階床伏図・R階床伏図)', () => {
  const parsed = parseFramingPlan(readPage('yokohama-p7.json'))

  it('두 블록·양단 중복이 접혀 X·Y 각 1개의 후보가 남는다', () => {
    expect(parsed.issues).toEqual([])
    expect(parsed.grids).toHaveLength(2)
  })

  it('X: bX1–bX3·cX1, 스팬 8700·8700·1200', () => {
    const x = grid(parsed.grids, 'X')
    expect(x.axes.map((axis) => axis.label)).toEqual([
      'bX1',
      'bX2',
      'bX3',
      'cX1',
    ])
    expect(x.spansMm).toEqual([8700, 8700, 1200])
    expect(x.totalConfirmed).toBe(false)
  })

  it('Y: bY6→bY1 (도면 그대로의 순서), 스팬 5000·6000·10000·6000·5000', () => {
    const y = grid(parsed.grids, 'Y')
    expect(y.axes.map((axis) => axis.label)).toEqual([
      'bY6',
      'bY5',
      'bY4',
      'bY3',
      'bY2',
      'bY1',
    ])
    expect(y.spansMm).toEqual([5000, 6000, 10000, 6000, 5000])
    expect(y.totalConfirmed).toBe(false)
  })

  it('축 위치는 단조 증가하고 실측 축척은 1/100 부근이다', () => {
    for (const candidate of parsed.grids) {
      const positions = candidate.axes.map((axis) => axis.positionPt)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      // 1/100 도면의 pt/mm = 72 / 25.4 / 100 ≈ 0.02835
      expect(candidate.scalePtPerMm).toBeGreaterThan(0.027)
      expect(candidate.scalePtPerMm).toBeLessThan(0.03)
    }
  })
})

describe('kani p38 (基礎伏図)', () => {
  const parsed = parseFramingPlan(readPage('kani-p38.json'))

  it('X: X1–X4, 스팬 6000·6000·8000 — 전체 치수 20,000으로 확인된다', () => {
    const x = grid(parsed.grids, 'X')
    expect(x.axes.map((axis) => axis.label)).toEqual(['X1', 'X2', 'X3', 'X4'])
    expect(x.spansMm).toEqual([6000, 6000, 8000])
    expect(x.totalConfirmed).toBe(true)
  })

  it('Y: 도면 좌→우가 Y3·Y2·Y1 — 스팬 6000·10500, 전체 16,500으로 확인된다', () => {
    const y = grid(parsed.grids, 'Y')
    expect(y.axes.map((axis) => axis.label)).toEqual(['Y3', 'Y2', 'Y1'])
    expect(y.spansMm).toEqual([6000, 10500])
    expect(y.totalConfirmed).toBe(true)
  })

  it('세부 치수 연쇄(2,800+3,200 등)는 중점 매칭이 배제한다', () => {
    expect(parsed.issues).toEqual([])
    expect(parsed.grids).toHaveLength(2)
  })
})

// 아래 기대값은 새 픽스처의 원시 TextItem 문자 좌표에서 독립 전사했다
// (원본·쪽: tests/fixtures/section-import/SOURCES.md). 파서 출력에서 복사하지 않았다.
// yokohama p6의 위·아래 축 대역에는 bX1·bX2·bX3·cX1과 8700·8700·1200이,
// 좌우 세로 치수 열에는 bY6→bY1과 5000·6000·10000·6000·5000이 반복된다.
describe('yokohama p6 (基礎伏図・1階床伏図)', () => {
  const parsed = parseFramingPlan(readPage('yokohama-p6.json'))

  it('반복된 두 伏図의 X·Y 격자 정의를 각각 하나로 접는다', () => {
    expect(parsed.issues).toEqual([])
    expect(
      parsed.grids.map((candidate) => ({
        direction: candidate.direction,
        labels: candidate.axes.map((axis) => axis.label),
        spansMm: candidate.spansMm,
        totalConfirmed: candidate.totalConfirmed,
      })),
    ).toEqual([
      {
        direction: 'X',
        labels: ['bX1', 'bX2', 'bX3', 'cX1'],
        spansMm: [8700, 8700, 1200],
        totalConfirmed: false,
      },
      {
        direction: 'Y',
        labels: ['bY6', 'bY5', 'bY4', 'bY3', 'bY2', 'bY1'],
        spansMm: [5000, 6000, 10000, 6000, 5000],
        totalConfirmed: false,
      },
    ])
  })
})

// kani p39 원시 TextItem의 가로 대역은 X1→X4와 6,000·6,000·8,000,
// 세로 대역은 Y3→Y1과 6,000·10,500을 명시하고 두 合計(20,000·16,500)를 갖는다.
describe('kani p39 (梁伏図)', () => {
  const parsed = parseFramingPlan(readPage('kani-p39.json'))

  it('X·Y 격자를 合計 확인 후보로 낸다', () => {
    expect(parsed.issues).toEqual([])
    expect(
      parsed.grids.map((candidate) => ({
        direction: candidate.direction,
        labels: candidate.axes.map((axis) => axis.label),
        spansMm: candidate.spansMm,
        totalConfirmed: candidate.totalConfirmed,
      })),
    ).toEqual([
      {
        direction: 'X',
        labels: ['X1', 'X2', 'X3', 'X4'],
        spansMm: [6000, 6000, 8000],
        totalConfirmed: true,
      },
      {
        direction: 'Y',
        labels: ['Y3', 'Y2', 'Y1'],
        spansMm: [6000, 10500],
        totalConfirmed: true,
      },
    ])
  })
})

// kani p41 원시 TextItem에는 두 軸組図마다 X1→X4와 6,000·6,000·8,000,
// 合計 20,000이 반복된다. Y축 열은 없으므로 X 정의 하나만 접혀 나온다.
describe('kani p41 (Y1・Y2通り軸組図)', () => {
  const parsed = parseFramingPlan(readPage('kani-p41.json'))

  it('반복된 X 격자 하나만 내고 Y 격자를 지어내지 않는다', () => {
    expect(parsed.issues).toEqual([])
    expect(
      parsed.grids.map((candidate) => ({
        direction: candidate.direction,
        labels: candidate.axes.map((axis) => axis.label),
        spansMm: candidate.spansMm,
        totalConfirmed: candidate.totalConfirmed,
      })),
    ).toEqual([
      {
        direction: 'X',
        labels: ['X1', 'X2', 'X3', 'X4'],
        spansMm: [6000, 6000, 8000],
        totalConfirmed: true,
      },
    ])
  })
})

// yokohama p9 원시 TextItem에는 위쪽 bY1→bY6 대역(5000·6000·10000·6000·5000)과
// 옆의 bY1→bY3 대역(5000·6000)이 있고, 아래쪽 軸組図에서도 같은 정의가 반복된다.
describe('yokohama p9 (軸組図(2))의 framing-plan 실태', () => {
  const parsed = parseFramingPlan(readPage('yokohama-p9.json'))

  it('Y 방향 두 격자 정의를 후보로 내고 合計는 확인하지 않는다', () => {
    expect(parsed.issues).toEqual([])
    expect(
      parsed.grids.map((candidate) => ({
        direction: candidate.direction,
        labels: candidate.axes.map((axis) => axis.label),
        spansMm: candidate.spansMm,
        totalConfirmed: candidate.totalConfirmed,
      })),
    ).toEqual([
      {
        direction: 'Y',
        labels: ['bY1', 'bY2', 'bY3', 'bY4', 'bY5', 'bY6'],
        spansMm: [5000, 6000, 10000, 6000, 5000],
        totalConfirmed: false,
      },
      {
        direction: 'Y',
        labels: ['bY1', 'bY2', 'bY3'],
        spansMm: [5000, 6000],
        totalConfirmed: false,
      },
    ])
  })
})

// 아래 배치 기대값은 픽스처 좌표를 손으로 검산해 얻었다 (파서 출력에서 유도하지
// 않는다 — ADR-010). 검산 근거: 좌블록의 通り芯 실좌표는 bX1=510·bX2=757·
// bX3=1003·cX1=1037(x), bY6=216·bY5=358·bY4=528·bY3=812·bY2=982·bY1=1123(y)이다.
//   C51@(528,207)  → x는 bX1(510)에서 18pt, y는 bY6(216)에서 9pt        → 格子点(0,0)
//   G51@(880,335)  → x는 bX2–bX3 중점(880)에 정확히, y는 bY5(358)에서 23 → 辺 X(1,1)
//   C53@(528,519)  → bX1(18) · bY4(9)                                    → 格子点(0,2)
//   CB52@(476,669) → bX1(34) · bY4–bY3 중점(670)에서 1pt                 → 辺 Y(0,2)
describe('yokohama p7 — 부재 배치', () => {
  const parsed = parseFramingPlan(readPage('yokohama-p7.json'))

  it('두 장의 伏図가 각각 블록이 되고 제목을 원문대로 갖는다', () => {
    expect(parsed.blocks.map((block) => block.title)).toEqual([
      '2階床伏図1/100',
      'R階床伏図1/100',
    ])
  })

  it('블록마다 자기 위치의 通り芯을 갖는다 — 라벨은 같고 좌표는 다르다', () => {
    const [left, right] = parsed.blocks
    expect(left.xGrid.axes.map((axis) => axis.label)).toEqual(
      right.xGrid.axes.map((axis) => axis.label),
    )
    expect(left.xGrid.axes[0].positionPt).toBeLessThan(
      right.xGrid.axes[0].positionPt,
    )
    expect(left.yGrid.axes.map((axis) => axis.label)).toEqual([
      'bY6',
      'bY5',
      'bY4',
      'bY3',
      'bY2',
      'bY1',
    ])
  })

  it('柱는 格子点, 大梁는 辺으로 붙는다', () => {
    const placements = parsed.blocks[0].placements
    expect(placements).toContainEqual({
      mark: 'C51',
      role: '格子点',
      ix: 0,
      iy: 0,
    })
    expect(placements).toContainEqual({
      mark: 'C53',
      role: '格子点',
      ix: 0,
      iy: 2,
    })
    expect(placements).toContainEqual({
      mark: 'G51',
      role: '辺',
      ix: 1,
      iy: 1,
      axis: 'X',
    })
    expect(placements).toContainEqual({
      mark: 'CB52',
      role: '辺',
      ix: 0,
      iy: 2,
      axis: 'Y',
    })
  })

  it('부호는 도면에 있는 만큼만 나오고 지어내지 않는다', () => {
    // 小梁으로 잘게 나뉜 칸 안의 스ラブ·小梁 부호는 主 통り芯에 붙지 않는다 —
    // 제품이 小梁을 모델링하지 않으므로(ADR-005) 붙일 자리 자체가 없다
    for (const block of parsed.blocks) {
      expect(block.placements.length).toBeGreaterThan(0)
      for (const placement of block.placements) {
        expect(placement.ix).toBeGreaterThanOrEqual(0)
        expect(placement.ix).toBeLessThan(block.xGrid.axes.length)
        expect(placement.iy).toBeGreaterThanOrEqual(0)
        expect(placement.iy).toBeLessThan(block.yGrid.axes.length)
        if (placement.role === '辺' && placement.axis === 'X') {
          expect(placement.ix).toBeLessThan(block.xGrid.axes.length - 1)
        }
        if (placement.role === '辺' && placement.axis === 'Y') {
          expect(placement.iy).toBeLessThan(block.yGrid.axes.length - 1)
        }
      }
    }
  })
})
