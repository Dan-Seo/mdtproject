import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFrameElevations } from '@/lib/import/framing-plan/elevation'
import type { TextPage } from '@/lib/import/section-list/types'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

type ElevationFixture = {
  heightsMm?: number[]
  elevations: Array<{
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

function labelsFrom(
  parsed: ReturnType<typeof parseFrameElevations>,
  wanted: string[],
): string[][] {
  const wantedSet = new Set(wanted)
  return parsed.elevations.map((elevation) =>
    elevation.levels.flatMap((level) =>
      level.labels.filter((label) => wantedSet.has(label)),
    ),
  )
}

describe('階高 corpus 2 골든', () => {
  it('karatsu: 짧은 150mm 구간과 원문 레벨 라벨을 모든 공유 계열에서 보존한다', () => {
    const golden = readGolden('karatsu-jikugumi1-p1-elevation.json')
    const parsed = parseFrameElevations(readPage('karatsu-jikugumi1-p1.json'))

    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(2)
    expect(parsed.elevations.map((entry) => entry.heightsMm)).toEqual(
      parsed.elevations.map(() => golden.heightsMm),
    )
    expect(labelsFrom(parsed, ['RFL水上', '2FL', '1FL', 'GL'])).toEqual([
      ['RFL水上', '2FL', '1FL', 'GL'],
      ['RFL水上', '2FL', '1FL', 'GL'],
    ])
  })

  it('tsu: 아래쪽 확정 구간 3500·150·1170을 연쇄 끝에서 보존한다', () => {
    const golden = readGolden('tsu-kanritou-p21-elevation.json')
    const parsed = parseFrameElevations(readPage('tsu-p21.json'))
    const expectedHeights = golden.elevations[0]?.heightsBottomMm

    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(2)
    expect(
      parsed.elevations.map((entry) => entry.heightsMm.slice(-3)),
    ).toEqual([expectedHeights, expectedHeights])
    expect(labelsFrom(parsed, ['2FL', '1FL', '設計GL', '基礎下端'])).toEqual([
      ['2FL', '1FL', '設計GL', '基礎下端'],
      ['2FL', '1FL', '設計GL', '基礎下端'],
    ])
  })

  it('hirosaki: 100mm 레벨과 그 아래 2310mm 구간을 각 계열에 보존한다', () => {
    const golden = readGolden('hirosaki-kikyono-p25-elevation.json')
    const parsed = parseFrameElevations(readPage('hirosaki-p25.json'))

    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(3)
    expect(parsed.elevations.map((entry) => entry.heightsMm)).toEqual([
      golden.elevations[0]?.heightsMm,
      golden.elevations[0]?.heightsMm,
      golden.elevations[1]?.heightsMm,
    ])
    expect(
      labelsFrom(parsed, [
        'RFL',
        'PHFL',
        '3FL',
        '2FL',
        '1FL',
        '設計GL',
        '△基礎下端',
      ]),
    ).toEqual([
      ['RFL', 'PHFL', '3FL', '2FL', '1FL', '設計GL', '△基礎下端'],
      ['RFL', 'PHFL', '3FL', '2FL', '1FL', '設計GL', '△基礎下端'],
      ['PHFL', '3FL', '2FL', '1FL', '設計GL', '△基礎下端'],
    ])
  })
})
