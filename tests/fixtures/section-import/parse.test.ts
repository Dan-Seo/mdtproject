import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseSectionLists } from '@/lib/import/section-list/parse'
import type {
  ParsedSectionList,
  SectionCandidate,
  TextPage,
} from '@/lib/import/section-list/types'

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

function list(
  parsed: ParsedSectionList[],
  listKind: string,
): ParsedSectionList {
  const found = parsed.find((entry) => entry.listKind === listKind)
  expect(found, `missing list: ${listKind}`).toBeDefined()
  return found as ParsedSectionList
}

function candidate(
  parsedList: ParsedSectionList,
  mark: string,
  storyLabel?: string,
): SectionCandidate {
  const found = parsedList.candidates.find(
    (entry) => entry.mark === mark && entry.storyLabel === storyLabel,
  )
  expect(
    found,
    `missing candidate: ${parsedList.listKind} ${mark} ${storyLabel ?? ''}`,
  ).toBeDefined()
  return found as SectionCandidate
}

function expectMarksInclude(
  parsedList: ParsedSectionList,
  expectedMarks: readonly string[],
): void {
  const parsedMarks = new Set(parsedList.candidates.map(({ mark }) => mark))
  for (const mark of expectedMarks) expect(parsedMarks.has(mark), mark).toBe(true)
}

describe('parseSectionLists', () => {
  it('parses the horizontal ojkk 柱リスト without inventing unsupported hoop sizes', () => {
    const parsed = parseSectionLists(readPage('ojkk-p2.json'))
    const columns = list(parsed, '柱リスト')

    expectMarksInclude(columns, ['C1', 'C2', 'C2A', 'FC1'])
    expect(candidate(columns, 'C1', '6F')).toMatchObject({
      kind: '柱',
      mark: 'C1',
      storyLabel: '6F',
      b: 700,
      d: 700,
      main: { count: 16, size: 'D25' },
      hoop: { size: 'D13', pitchMm: 100 },
      raw: {},
      issues: [],
    })
    expect(candidate(columns, 'C2A', '2F')).toMatchObject({
      main: { count: 20, size: 'D29' },
    })

    const c2aFirst = candidate(columns, 'C2A', '1F')
    expect(c2aFirst.main).toEqual({ count: 22, size: 'D32' })
    expect(c2aFirst.hoop).toBeUndefined()
    expect(c2aFirst.raw['帯筋']).toBe('K13-@100')
    expect(c2aFirst.issues).not.toHaveLength(0)

    const c2First = candidate(columns, 'C2', '1F')
    expect(c2First.hoop).toBeUndefined()
    expect(c2First.raw['帯筋']).toBe('K13-@100')
    expect(candidate(columns, 'FC1', '1F').kind).toBe('対象外')
  })

  it('detects the fifth TextItem fixture and its 大梁 list', () => {
    const parsed = parseSectionLists(readPage('ojkk-p3.json'))
    const girders = list(parsed, '大梁リスト')

    expectMarksInclude(girders, ['G1', 'G2', 'G3', 'G4', 'G5'])
    expect(candidate(girders, 'G1', 'RF').kind).toBe('大梁')
  })

  it('parses yokohama 柱 and 小梁 tables on the same page', () => {
    const parsed = parseSectionLists(readPage('yokohama-p13.json'))
    const columns = list(parsed, '柱断面リスト')
    const smallGirders = list(parsed, '小梁断面リスト')

    expectMarksInclude(columns, [
      'C51',
      'C52',
      'C53',
      'C54',
      'C55',
      'C56',
      'C57',
      'C58',
      'C58A',
    ])
    expect(candidate(columns, 'C51', '2階')).toMatchObject({
      kind: '柱',
      b: 800,
      d: 800,
      main: { count: 18, size: 'D25' },
      hoop: { size: 'D13', pitchMm: 100 },
    })

    const c51First = candidate(columns, 'C51', '1階')
    expect(c51First.main).toEqual({ count: 22, size: 'D25' })
    expect(c51First.hoop).toBeUndefined()
    expect(c51First.raw['HOOP']).toBe('S13-@100')

    const c56 = candidate(columns, 'C56', '2階')
    expect(c56.main).toEqual({ count: 12, size: 'D22' })
    expect(c56.b).toBeUndefined()
    expect(c56.d).toBeUndefined()
    expect(c56.raw['断面']).toBe('600φ')
    expect(c56.issues).not.toHaveLength(0)
    expect(candidate(columns, 'C58A', '1階').main).toEqual({
      count: 26,
      size: 'D25',
    })

    expectMarksInclude(smallGirders, ['B51'])
    expect(candidate(smallGirders, 'B51').kind).toBe('対象外')
  })

  it('leaves position-dependent 大梁 main bars blank and maps uniform sections', () => {
    const parsed = parseSectionLists(readPage('yokohama-p14.json'))
    const girders = list(parsed, '大梁断面リスト')

    expectMarksInclude(girders, ['G51', 'G54', 'G55', 'G55A'])

    const g51Roof = candidate(girders, 'G51', 'R階')
    expect(g51Roof).toMatchObject({
      kind: '大梁',
      b: 650,
      depth: 800,
      stirrup: { size: 'D13', pitchMm: 100 },
    })
    expect(g51Roof.girderMain).toBeUndefined()
    expect(g51Roof.raw).toMatchObject({
      '上筋(外端)': '8-D25',
      '上筋(中央)': '8-D25',
      '上筋(内端)': '13-D25',
      '下筋(外端)': '8-D25',
      '下筋(中央)': '8-D25',
      '下筋(内端)': '11-D25',
    })

    const g51Second = candidate(girders, 'G51', '2階')
    expect(g51Second.stirrup).toEqual({ size: 'D13', pitchMm: 150 })
    expect(g51Second.girderMain).toBeUndefined()
    expect(g51Second.raw['上筋(中央)']).toBe('7-D25')

    expect(candidate(girders, 'G54', 'R階').girderMain).toEqual({
      size: 'D25',
      topCount: 5,
      bottomCount: 5,
    })
    expect(candidate(girders, 'G55A', 'R階')).toMatchObject({
      b: 450,
      depth: 700,
      girderMain: { size: 'D22', topCount: 5, bottomCount: 4 },
    })
    expect(candidate(girders, 'G55', 'R階').girderMain).toBeUndefined()
  })

  it('parses the vertical kani 地中梁リスト and tolerates an empty 腹筋 cell', () => {
    const parsed = parseSectionLists(readPage('kani-p38.json'))
    const foundationGirders = list(parsed, '地中梁リスト')

    expectMarksInclude(foundationGirders, ['FG1'])
    const fg1 = candidate(foundationGirders, 'FG1')
    expect(fg1).toMatchObject({
      kind: '対象外',
      mark: 'FG1',
      b: 300,
      depth: 500,
      girderMain: { size: 'D19', topCount: 3, bottomCount: 3 },
      stirrup: { size: 'D10', pitchMm: 200 },
    })
    expect(fg1.raw['腹筋']).toBeUndefined()
  })

  it('returns an empty array when no supported list title exists', () => {
    expect(
      parseSectionLists({
        widthPt: 100,
        heightPt: 100,
        items: [{ str: '図面枠', x: 10, y: 10, w: 20, h: 5 }],
      }),
    ).toEqual([])
  })

  it('does not promote one readable 柱 position into a complete 主筋 candidate', () => {
    const parsed = parseSectionLists({
      widthPt: 240,
      heightPt: 120,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 15, w: 20, h: 8 },
        { str: 'C1', x: 115, y: 15, w: 10, h: 8 },
        { str: '位置', x: 10, y: 25, w: 20, h: 8 },
        { str: '柱頭', x: 90, y: 25, w: 20, h: 8 },
        { str: '柱脚', x: 130, y: 25, w: 20, h: 8 },
        { str: '1F', x: 10, y: 35, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 45, w: 20, h: 8 },
        { str: '16-D25', x: 82, y: 45, w: 36, h: 8 },
      ],
    })
    const incomplete = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(incomplete.main).toBeUndefined()
    expect(incomplete.raw['主筋(柱頭)']).toBe('16-D25')
    expect(incomplete.issues).not.toHaveLength(0)
  })
})
