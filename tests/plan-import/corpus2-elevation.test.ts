import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFrameElevations } from '@/lib/import/framing-plan/elevation'
import { compact } from '@/lib/import/runs'
import type { TextPage } from '@/lib/import/section-list/types'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

type AxisFixture = {
  labels: string[]
  spansMm: number[]
  totalMm: number | null
}

type ElevationEntryFixture = {
  title?: string
  titles?: string[]
  levels?: string[]
  heightsMm?: number[]
  levelsBottom?: string[]
  heightsBottomMm?: number[]
  axis?: AxisFixture
}

type ElevationFixture = {
  heightsMm?: number[]
  levels?: string[]
  levelTexts?: string[]
  elevations: ElevationEntryFixture[]
}

type GridFixture = {
  blocks: Array<{
    x: AxisFixture
    y: AxisFixture
  }>
}

const GOLDEN_DIR = resolve(
  process.cwd(),
  'tests/fixtures/plan-import/expected',
)

function goldenFiles(suffix: '-elevation.json' | '-grid.json'): string[] {
  return readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort()
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

function readGolden(file: string): ElevationFixture {
  return JSON.parse(
    readFileSync(
      resolve(GOLDEN_DIR, file),
      'utf8',
    ),
  ) as ElevationFixture
}

function readGridGolden(file: string): GridFixture {
  return JSON.parse(
    readFileSync(resolve(GOLDEN_DIR, file), 'utf8'),
  ) as GridFixture
}

function expectAxisSelfConsistent(axis: AxisFixture): void {
  expect(axis.labels.length).toBe(axis.spansMm.length + 1)
  if (axis.totalMm !== null) {
    expect(axis.spansMm.reduce((sum, span) => sum + span, 0)).toBe(
      axis.totalMm,
    )
  }
}

function orientedAxis(
  axis: AxisFixture,
  reverse: boolean,
): AxisFixture {
  return reverse
    ? {
        labels: [...axis.labels].reverse(),
        spansMm: [...axis.spansMm].reverse(),
        totalMm: axis.totalMm,
      }
    : axis
}

function axisIsOrderedSubsequence(
  elevation: AxisFixture,
  grid: AxisFixture,
): boolean {
  for (const reverse of [false, true]) {
    const candidate = orientedAxis(grid, reverse)
    let previousGridIndex = -1
    let matches = true

    for (const [elevationLabelIndex, label] of elevation.labels.entries()) {
      const gridIndex = candidate.labels.indexOf(label)
      if (gridIndex <= previousGridIndex) {
        matches = false
        break
      }

      if (elevationLabelIndex > 0) {
        const gridSpan = candidate.spansMm
          .slice(previousGridIndex, gridIndex)
          .reduce((sum, span) => sum + span, 0)
        if (elevation.spansMm[elevationLabelIndex - 1] !== gridSpan) {
          matches = false
          break
        }
      }

      previousGridIndex = gridIndex
    }

    if (matches) return true
  }

  return false
}

const AXIS_CROSSCHECKS = [
  {
    elevationFile: 'hirosaki-kikyono-p25-elevation.json',
    gridFile: 'hirosaki-kikyono-p21-grid.json',
    axis: 'y',
  },
  {
    elevationFile: 'tsu-kanritou-p21-elevation.json',
    gridFile: 'tsu-kanritou-p16-grid.json',
    axis: 'x',
  },
  {
    elevationFile: 'karatsu-jikugumi1-p1-elevation.json',
    gridFile: 'karatsu-fukuzu-p1-grid.json',
    axis: 'y',
  },
] as const

function elevationForTitle(
  parsed: ReturnType<typeof parseFrameElevations>,
  title: string,
): ReturnType<typeof parseFrameElevations>['elevations'][number] {
  const normalized = compact(title)
  const expectedTitle = normalized.includes('軸組図')
    ? normalized
    : `${normalized}軸組図`
  const matches = parsed.elevations.filter((elevation) =>
    elevation.titles.some(
      (candidateTitle) =>
        candidateTitle === expectedTitle ||
        candidateTitle.startsWith(`${expectedTitle}S=`),
    ),
  )
  expect(matches).toEqual([expect.anything()])
  return matches[0]!
}

function labelsByLevel(
  elevation: ReturnType<typeof parseFrameElevations>['elevations'][number],
): string[][] {
  return elevation.levels.map((level) => level.labels)
}

function titlesOf(
  expected: ElevationFixture['elevations'][number],
): string[] {
  return (
    expected.titles ??
    (expected.title === undefined ? [] : [expected.title])
  )
}

function expectCorpus2Elevations(
  pageFile: string,
  goldenFile: string,
): ReturnType<typeof parseFrameElevations>['elevations'][] {
  const golden = readGolden(goldenFile)
  const parsed = parseFrameElevations(readPage(pageFile))

  expect(parsed.issues).toEqual([])
  const actualsByExpected = golden.elevations.map((expected) => {
    const titles = titlesOf(expected)
    expect(titles).not.toEqual([])
    return titles.map((title) => elevationForTitle(parsed, title))
  })
  const actuals = actualsByExpected.flat()

  // 모든 파서 계열은 골든 항목에서 청구되어야 한다. 골든 여러 항목이
  // 하나의 계열을 공유하는 경우(예: karatsu X3·X4)도 허용하되,
  // 파서만의 미청구 계열은 허용하지 않는다.
  expect(new Set(parsed.elevations)).toEqual(new Set(actuals))

  for (const [index, expected] of golden.elevations.entries()) {
    const expectedActuals = actualsByExpected[index]!
    expect(new Set(expectedActuals)).toEqual(new Set([expectedActuals[0]]))

    const actual = expectedActuals[0]!
    const expectedHeights = expected.heightsMm ?? golden.heightsMm
    const expectedLabels = expected.levels ?? golden.levelTexts
    expect(expectedHeights).toBeDefined()
    expect(expectedLabels).toBeDefined()
    expect(actual.heightsMm).toEqual(expectedHeights)
    expect(labelsByLevel(actual)).toEqual(
      expectedLabels!.map((label) => [label]),
    )
  }

  return actualsByExpected
}

describe('階高 corpus 2 골든', () => {
  it('karatsu: 골든의 모든 제목 항목을 대응 계열의 높이·레벨 라벨과 대조한다', () => {
    const actualsByExpected = expectCorpus2Elevations(
      'karatsu-jikugumi1-p1.json',
      'karatsu-jikugumi1-p1-elevation.json',
    )

    // 골든의 X3·X4 항목은 도면의 같은 치수 열을 공유하므로 하나의
    // 파서 계열로 묶여야 한다. 이 관계를 골든 순서에서 직접 검증한다.
    expect(actualsByExpected[1]?.[0]).toBe(actualsByExpected[2]?.[0])
  })

  it('tsu: p21의 모든 제목 계열을 전체 골든 높이·레벨 라벨과 대조한다', () => {
    expectCorpus2Elevations(
      'tsu-p21.json',
      'tsu-kanritou-p21-elevation.json',
    )
  })

  it('tsu: p22의 모든 제목 계열을 전체 골든 높이·레벨 라벨과 대조한다', () => {
    expectCorpus2Elevations(
      'tsu-p22.json',
      'tsu-kanritou-p22-elevation.json',
    )
  })

  it('hirosaki: 골든의 모든 제목 계열을 높이·레벨 라벨과 대조한다', () => {
    expectCorpus2Elevations(
      'hirosaki-p25.json',
      'hirosaki-kikyono-p25-elevation.json',
    )
  })

  it('levels가 있으면 levelTexts와 순서·접두사 관계를 대조한다', () => {
    let checked = 0

    for (const file of goldenFiles('-elevation.json')) {
      const golden = readGolden(file)
      if (golden.levels === undefined) continue

      expect(golden.levelTexts).toBeDefined()
      expect(golden.levels).toHaveLength(golden.levelTexts!.length)
      golden.levels.forEach((level, index) => {
        expect(golden.levelTexts![index]!.startsWith(level)).toBe(true)
      })
      checked += 1
    }

    expect(checked).toBeGreaterThan(0)
  })
})

describe('軸組図·伏図 axis 골든 상호검증', () => {
  it('모든 골든의 axis가 라벨·스팬·합계에 대해 자기 정합성을 갖는다', () => {
    let axisCount = 0

    for (const file of goldenFiles('-grid.json')) {
      const golden = readGridGolden(file)
      for (const block of golden.blocks) {
        for (const axis of [block.x, block.y]) {
          expectAxisSelfConsistent(axis)
          axisCount += 1
        }
      }
    }

    for (const file of goldenFiles('-elevation.json')) {
      const golden = readGolden(file)
      for (const elevation of golden.elevations) {
        if (elevation.axis === undefined) continue
        expectAxisSelfConsistent(elevation.axis)
        axisCount += 1
      }
    }

    expect(axisCount).toBeGreaterThan(0)
  })

  it('levelsBottom·heightsBottomMm이 있으면 전체 계열의 꼬리와 일치한다', () => {
    for (const file of goldenFiles('-elevation.json')) {
      const golden = readGolden(file)
      for (const elevation of golden.elevations) {
        if (elevation.levelsBottom !== undefined) {
          expect(elevation.levels).toBeDefined()
          if (elevation.levels !== undefined) {
            expect(elevation.levelsBottom).toEqual(
              elevation.levels.slice(
                elevation.levels.length - elevation.levelsBottom.length,
              ),
            )
          }
        }

        if (elevation.heightsBottomMm !== undefined) {
          expect(elevation.heightsMm).toBeDefined()
          if (elevation.heightsMm !== undefined) {
            expect(elevation.heightsBottomMm).toEqual(
              elevation.heightsMm.slice(
                elevation.heightsMm.length -
                  elevation.heightsBottomMm.length,
              ),
            )
          }
        }
      }
    }
  })

  it.each(AXIS_CROSSCHECKS)(
    '$elevationFile의 axis가 $gridFile의 $axis 축 부분열이다',
    ({ elevationFile, gridFile, axis }) => {
      const elevationGolden = readGolden(elevationFile)
      const gridGolden = readGridGolden(gridFile)
      const gridAxis = gridGolden.blocks[0]?.[axis]
      expect(gridAxis).toBeDefined()
      if (gridAxis === undefined) return

      for (const elevation of elevationGolden.elevations) {
        if (elevation.axis === undefined) continue
        expect(
          axisIsOrderedSubsequence(elevation.axis, gridAxis),
        ).toBe(true)
      }
    },
  )

  // 2026-09-05: tsu p21 elevations[1]과 p22 두 항목의 axis를 전사해 0이 됐다.
  // 면 안의 모든 軸組図 블록이 같은 通り芯 축을 쓰는 것을 원본에서 확인했으므로,
  // 제목 없는 항목의 대응 블록을 몰라도 axis 값이 정해진다. 이 수는 골든에서
  // 파생되며, 미전사가 다시 늘면 실패해야 하므로 고정값으로 남긴다.
  it('axis 없는 elevation 항목이 없다', () => {
    let skippedAxisCount = 0

    for (const file of goldenFiles('-elevation.json')) {
      const golden = readGolden(file)
      for (const elevation of golden.elevations) {
        if (elevation.axis === undefined) skippedAxisCount += 1
      }
    }

    expect(skippedAxisCount).toBe(0)
  })
})
