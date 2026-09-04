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
    heightsMm?: number[]
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
})
