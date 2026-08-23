import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFramingPlanGrids } from '@/lib/import/framing-plan/parse'
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
  const parsed = parseFramingPlanGrids(readPage('yokohama-p7.json'))

  it('두 블록·양단 중복이 접혀 X·Y 각 1개의 후보가 남는다', () => {
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates).toHaveLength(2)
  })

  it('X: bX1–bX3·cX1, 스팬 8700·8700·1200', () => {
    const x = grid(parsed.candidates, 'X')
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
    const y = grid(parsed.candidates, 'Y')
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
    for (const candidate of parsed.candidates) {
      const positions = candidate.axes.map((axis) => axis.positionPt)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      // 1/100 도면의 pt/mm = 72 / 25.4 / 100 ≈ 0.02835
      expect(candidate.scalePtPerMm).toBeGreaterThan(0.027)
      expect(candidate.scalePtPerMm).toBeLessThan(0.03)
    }
  })
})

describe('kani p38 (基礎伏図)', () => {
  const parsed = parseFramingPlanGrids(readPage('kani-p38.json'))

  it('X: X1–X4, 스팬 6000·6000·8000 — 전체 치수 20,000으로 확인된다', () => {
    const x = grid(parsed.candidates, 'X')
    expect(x.axes.map((axis) => axis.label)).toEqual(['X1', 'X2', 'X3', 'X4'])
    expect(x.spansMm).toEqual([6000, 6000, 8000])
    expect(x.totalConfirmed).toBe(true)
  })

  it('Y: 도면 좌→우가 Y3·Y2·Y1 — 스팬 6000·10500, 전체 16,500으로 확인된다', () => {
    const y = grid(parsed.candidates, 'Y')
    expect(y.axes.map((axis) => axis.label)).toEqual(['Y3', 'Y2', 'Y1'])
    expect(y.spansMm).toEqual([6000, 10500])
    expect(y.totalConfirmed).toBe(true)
  })

  it('세부 치수 연쇄(2,800+3,200 등)는 중점 매칭이 배제한다', () => {
    expect(parsed.issues).toEqual([])
    expect(parsed.candidates).toHaveLength(2)
  })
})
