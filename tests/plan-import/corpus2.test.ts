import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFramingPlan } from '@/lib/import/framing-plan/parse'
import type { TextPage } from '@/lib/import/section-list/types'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

type GridGolden = {
  blocks: Array<{
    x: { labels: string[]; spansMm: number[]; totalMm: number | null }
    y: { labels: string[]; spansMm: number[]; totalMm: number | null }
  }>
}

const CASES = [
  ['fuji-p17.json', 'fuji-kanritou-p17-grid.json'],
  ['hirosaki-p21.json', 'hirosaki-kikyono-p21-grid.json'],
  ['ina-p6.json', 'ina-pump-p6-grid.json'],
  ['karatsu-fukuzu-p1.json', 'karatsu-fukuzu-p1-grid.json'],
  ['karatsu-hashirashin-p1.json', 'karatsu-hashirashin-p1-grid.json'],
  ['shibata-p1.json', 'shibata-fire-p1-grid.json'],
  ['tsu-p16.json', 'tsu-kanritou-p16-grid.json'],
] as const

type GridSnapshot = {
  direction: 'X' | 'Y'
  labels: string[]
  spansMm: number[]
  totalConfirmed: boolean
}

const EXISTING_14 = [
  ['kani-p38.json', [
    { direction: 'X', labels: ['X1', 'X2', 'X3', 'X4'], spansMm: [6000, 6000, 8000], totalConfirmed: true },
    { direction: 'Y', labels: ['Y3', 'Y2', 'Y1'], spansMm: [6000, 10500], totalConfirmed: true },
  ], []],
  ['kani-p39.json', [
    { direction: 'X', labels: ['X1', 'X2', 'X3', 'X4'], spansMm: [6000, 6000, 8000], totalConfirmed: true },
    { direction: 'Y', labels: ['Y3', 'Y2', 'Y1'], spansMm: [6000, 10500], totalConfirmed: true },
  ], []],
  ['kani-p40.json', [
    { direction: 'Y', labels: ['Y1', 'Y2', 'Y3'], spansMm: [10500, 6000], totalConfirmed: true },
  ], []],
  ['kani-p41.json', [
    { direction: 'X', labels: ['X1', 'X2', 'X3', 'X4'], spansMm: [6000, 6000, 8000], totalConfirmed: true },
  ], []],
  ['ojkk-p2.json', [], ['通り芯ラベル未検出']],
  ['ojkk-p3.json', [], ['通り芯ラベル未検出']],
  ['ojkk-p4.json', [], ['通り芯ラベル未検出']],
  ['yokohama-p13.json', [], ['通り芯ラベル未検出']],
  ['yokohama-p14.json', [], ['通り芯ラベル未検出']],
  ['yokohama-p15.json', [], ['通り芯ラベル未検出']],
  ['yokohama-p6.json', [
    { direction: 'X', labels: ['bX1', 'bX2', 'bX3', 'cX1'], spansMm: [8700, 8700, 1200], totalConfirmed: false },
    { direction: 'Y', labels: ['bY6', 'bY5', 'bY4', 'bY3', 'bY2', 'bY1'], spansMm: [5000, 6000, 10000, 6000, 5000], totalConfirmed: false },
  ], []],
  ['yokohama-p7.json', [
    { direction: 'X', labels: ['bX1', 'bX2', 'bX3', 'cX1'], spansMm: [8700, 8700, 1200], totalConfirmed: false },
    { direction: 'Y', labels: ['bY6', 'bY5', 'bY4', 'bY3', 'bY2', 'bY1'], spansMm: [5000, 6000, 10000, 6000, 5000], totalConfirmed: false },
  ], []],
  ['yokohama-p8.json', [
    { direction: 'X', labels: ['bX1', 'bX2', 'bX3'], spansMm: [8700, 8700], totalConfirmed: false },
  ], []],
  ['yokohama-p9.json', [
    { direction: 'Y', labels: ['bY1', 'bY2', 'bY3', 'bY4', 'bY5', 'bY6'], spansMm: [5000, 6000, 10000, 6000, 5000], totalConfirmed: false },
    { direction: 'Y', labels: ['bY1', 'bY2', 'bY3'], spansMm: [5000, 6000], totalConfirmed: false },
  ], []],
] as const satisfies ReadonlyArray<readonly [string, readonly GridSnapshot[], readonly string[]]>

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

function readGolden(file: string): GridGolden {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'tests/fixtures/plan-import/expected', file),
      'utf8',
    ),
  ) as GridGolden
}

function comparableExpectedGrid(
  actual: {
    axes: Array<{ label: string }>
    spansMm: number[]
    totalConfirmed: boolean
  },
  expected: { labels: string[]; spansMm: number[]; totalMm: number | null },
  allowExtra: boolean,
) {
  const labels = allowExtra
    ? actual.axes.slice(0, expected.labels.length).map((axis) => axis.label)
    : actual.axes.map((axis) => axis.label)
  const spansMm = allowExtra
    ? actual.spansMm.slice(0, expected.spansMm.length)
    : actual.spansMm

  return {
    labels,
    spansMm,
    totalMm: actual.totalConfirmed
      ? spansMm.reduce((sum, span) => sum + span, 0)
      : null,
  }
}

describe('2차 7면 伏図 격자 골든', () => {
  it.each(CASES)('%s', (textItemsFile, goldenFile) => {
    const parsed = parseFramingPlan(readPage(textItemsFile))
    const golden = readGolden(goldenFile)

    expect(parsed.blocks).toHaveLength(golden.blocks.length)
    for (const [index, expectedBlock] of golden.blocks.entries()) {
      const actualBlock = parsed.blocks[index]
      expect(actualBlock).toBeDefined()
      if (!actualBlock) continue
      const shibataExtra =
        goldenFile === 'shibata-fire-p1-grid.json'
      expect(
        comparableExpectedGrid(actualBlock.xGrid, expectedBlock.x, shibataExtra),
      ).toEqual(expectedBlock.x)
      expect(
        comparableExpectedGrid(actualBlock.yGrid, expectedBlock.y, false),
      ).toEqual(expectedBlock.y)
    }

    for (const block of golden.blocks) {
      for (const axis of [block.x, block.y]) {
        if (axis.totalMm === null) continue
        expect(axis.totalMm).toBe(
          axis.spansMm.reduce((sum, span) => sum + span, 0),
        )
      }
    }

  })
})

describe('伏図 격자 축 순서 규약', () => {
  it.each(CASES)('%s의 모든 축 좌표는 페이지 순서로 단조 증가한다', (textItemsFile) => {
    const parsed = parseFramingPlan(readPage(textItemsFile))

    for (const grid of parsed.grids) {
      const positions = grid.axes.map((axis) => axis.positionPt)
      expect(positions).toEqual([...positions].sort((left, right) => left - right))
    }
  })
})

describe('기존 14면 격자 회귀', () => {
  it.each(EXISTING_14)('%s', (textItemsFile, expectedGrids, expectedIssues) => {
    const parsed = parseFramingPlan(readPage(textItemsFile))
    expect(
      parsed.grids.map((grid) => ({
        direction: grid.direction,
        labels: grid.axes.map((axis) => axis.label),
        spansMm: grid.spansMm,
        totalConfirmed: grid.totalConfirmed,
      })),
    ).toEqual(expectedGrids)
    expect(parsed.issues).toEqual(expectedIssues)
  })
})
