import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFrameElevations } from '@/lib/import/framing-plan/elevation'
import { compact } from '@/lib/import/runs'
import type { TextPage } from '@/lib/import/section-list/types'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

type ElevationFixture = {
  heightsMm?: number[]
  levels?: string[]
  levelTexts?: string[]
  elevations: Array<{
    title?: string
    titles?: string[]
    levels?: string[]
    levelsBottom?: string[]
    heightsMm?: number[]
    heightsBottomMm?: number[]
  }>
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
      resolve(process.cwd(), 'tests/fixtures/plan-import/expected', file),
      'utf8',
    ),
  ) as ElevationFixture
}

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
  expect(matches).toHaveLength(1)
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
): void {
  const golden = readGolden(goldenFile)
  const parsed = parseFrameElevations(readPage(pageFile))

  expect(parsed.issues).toEqual([])
  expect(parsed.elevations).toHaveLength(golden.elevations.length)

  for (const expected of golden.elevations) {
    const titles = titlesOf(expected)
    expect(titles).not.toEqual([])
    const actuals = titles.map((title) => elevationForTitle(parsed, title))
    expect(new Set(actuals)).toEqual(new Set([actuals[0]]))

    const actual = actuals[0]!
    expect(actual.heightsMm).toEqual(expected.heightsMm)
    expect(labelsByLevel(actual)).toEqual(
      expected.levels!.map((label) => [label]),
    )
  }
}

describe('階高 corpus 2 골든', () => {
  it('karatsu: 제목으로 대응한 X2·X3 두 블록의 높이와 레벨 라벨을 골든과 대조한다', () => {
    const golden = readGolden('karatsu-jikugumi1-p1-elevation.json')
    const parsed = parseFrameElevations(readPage('karatsu-jikugumi1-p1.json'))

    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(2)
    const expectedElevations = golden.elevations.filter((entry) =>
      entry.title === 'X2通り' || entry.title === 'X3通り',
    )

    // X4通り는 텍스트에 레벨 라벨 열이 없어 골든 대조에서 제외한다.
    // X2·X3은 제목의 정확한 軸組図 세그먼트로 계열을 대응한다.
    expect(expectedElevations).toHaveLength(2)
    for (const expected of expectedElevations) {
      const actual = elevationForTitle(parsed, expected.title!)
      expect(actual.heightsMm).toEqual(golden.heightsMm)
      expect(labelsByLevel(actual)).toEqual(
        golden.levelTexts!.map((label) => [label]),
      )
    }
  })

  it('tsu: 제목으로 대응한 Y3 블록의 골든 부분 전사 높이와 라벨 열을 대조한다', () => {
    const golden = readGolden('tsu-kanritou-p21-elevation.json')
    const parsed = parseFrameElevations(readPage('tsu-p21.json'))
    const expected = golden.elevations[0]!
    const actual = elevationForTitle(parsed, expected.title!)
    const expectedHeights = expected.heightsBottomMm!
    const expectedLabels = expected.levelsBottom!.map((label) => [label])

    expect(parsed.issues).toEqual([])
    // 2FL 위쪽은 최상단 레벨 라벨을 확정하지 않은 골든 부분 전사이므로
    // 높이와 라벨 모두 아래쪽 골든 구간만 대조한다.
    expect(actual.heightsMm.slice(-expectedHeights.length)).toEqual(
      expectedHeights,
    )
    expect(labelsByLevel(actual).slice(-expectedLabels.length)).toEqual(
      expectedLabels,
    )
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

  it('hirosaki: 제목으로 대응한 X1·X2·X3 세 블록의 높이와 레벨 라벨을 골든과 대조한다', () => {
    const golden = readGolden('hirosaki-kikyono-p25-elevation.json')
    const parsed = parseFrameElevations(readPage('hirosaki-p25.json'))

    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(3)
    expect(golden.elevations).toHaveLength(3)
    for (const expected of golden.elevations) {
      const actual = elevationForTitle(parsed, expected.title!)
      expect(actual.heightsMm).toEqual(expected.heightsMm)
      expect(labelsByLevel(actual)).toEqual(
        expected.levels!.map((label) => [label]),
      )
    }
  })
})
