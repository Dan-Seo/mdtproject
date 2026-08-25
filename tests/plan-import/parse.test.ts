import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFramingPlan } from '@/lib/import/framing-plan/parse'
import type { PlanGridCandidate } from '@/lib/import/framing-plan/types'
import type { TextPage } from '@/lib/import/section-list/types'

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
