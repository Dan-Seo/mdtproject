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

function readExpected<T>(file: string): T {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/section-import/expected',
    file,
  )
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as T
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
    // 이 표에는 断面 라벨 행이 없다 — 근거는 스케치에 붙은 가로·세로 치수 두 개뿐이고,
    // 세로는 회전 문자열이라 행 복원에서 빠진다. 둘을 짝지어야 700×700이 나온다.
    const c1 = candidate(columns, 'C1', '6F')
    expect(c1).toMatchObject({
      kind: '柱',
      mark: 'C1',
      storyLabel: '6F',
      main: { count: 16, size: 'D25' },
      hoop: { size: 'D13', pitchMm: 100 },
    })
    expect([c1.b, c1.d]).toEqual([700, 700])
    expect(c1.raw['断面']).toBeUndefined()
    expect(c1.issues).toHaveLength(0)
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

})

// ── 전사 픽스처 전 셀 대조 ────────────────────────────────────────────────
// expected/*.json은 도면을 눈으로 읽어 적은 원문 독립 전사다 (ADR-010).
// 규칙: 파서가 확정한 값은 전사와 일치해야 하고(지어내기 검출), 확정하지 않은
// 칸은 raw 원문이 전사와 모순되면 안 된다. 어느 칸을 확정할지는 파서 정책이므로
// 값이 아니라 확정 칸 수를 핀으로 박아 대량 미확정 회귀를 막는다.

interface ExpectedColumnCell {
  b?: number
  d?: number
  断面raw?: string
  主筋: string | Record<string, string>
  帯筋?: string
  HOOP?: string
}

interface ExpectedColumnsDoc {
  entries: Array<{ mark: string; stories: Record<string, ExpectedColumnCell> }>
}

interface ExpectedGirderCell {
  b: number
  depth: number
  上筋: Record<string, string>
  下筋: Record<string, string>
  ST: string
}

interface ExpectedGirdersDoc {
  entries: Array<{ mark: string; stories: Record<string, ExpectedGirderCell> }>
}

interface ExpectedKaniEntry {
  mark: string
  b: number
  depth: number
  上端筋: string
  下端筋: string
  STP: string
}

/** 「D13-@100」·「D10@200」 표기 차를 흡수한다 — 하이픈은 장식이다 */
function normPitch(text: string): string {
  return text.replace('-@', '@')
}

function sweepColumns(
  pageFile: string,
  expectedFile: string,
  listKind: string,
): { main: number; hoop: number; dimension: number } {
  const doc = readExpected<ExpectedColumnsDoc>(expectedFile)
  const columns = list(parseSectionLists(readPage(pageFile)), listKind)
  const counts = { main: 0, hoop: 0, dimension: 0 }

  for (const entry of doc.entries) {
    for (const [story, cell] of Object.entries(entry.stories)) {
      const c = candidate(columns, entry.mark, story)
      const label = `${entry.mark}/${story}`

      if (c.b !== undefined) {
        expect(c.b, label).toBe(cell.b)
        expect(c.d, label).toBe(cell.d)
        counts.dimension += 1
      }
      if (cell.断面raw !== undefined && c.raw['断面'] !== undefined) {
        expect(c.raw['断面'], label).toBe(cell.断面raw)
      }

      const mainCells =
        typeof cell.主筋 === 'string' ? { 全断面: cell.主筋 } : cell.主筋
      if (c.main) {
        for (const text of Object.values(mainCells)) {
          expect(`${c.main.count}-${c.main.size}`, label).toBe(text)
        }
        counts.main += 1
      } else {
        for (const [position, text] of Object.entries(mainCells)) {
          const raw = c.raw[`主筋(${position})`] ?? c.raw['主筋']
          if (raw !== undefined) expect(raw, label).toBe(text)
        }
      }

      const hoopText = cell.帯筋 ?? cell.HOOP
      if (hoopText !== undefined) {
        if (c.hoop) {
          expect(`${c.hoop.size}@${c.hoop.pitchMm}`, label).toBe(
            normPitch(hoopText),
          )
          counts.hoop += 1
        } else {
          const raw = c.raw['帯筋'] ?? c.raw['HOOP']
          if (raw !== undefined) {
            expect(normPitch(raw), label).toBe(normPitch(hoopText))
          }
        }
      }
    }
  }

  return counts
}

describe('전사 픽스처 전 셀 대조 (ADR-010)', () => {
  it('ojkk 柱リスト — 19칸 (位置 2행·帯筋에 고강도 K13 포함)', () => {
    expect(
      sweepColumns('ojkk-p2.json', 'ojkk-akamichi-p2-columns.json', '柱リスト'),
      // K13 3칸(C2 1F·C2A 2F·C2A 1F)만 미확정. 断面은 라벨 행이 없지만 스케치의
      // 가로·세로 치수를 짝지어 전 칸 확정 — 값은 전사(700×700·FC1 600×600)와 대조된다
    ).toEqual({ main: 19, hoop: 16, dimension: 19 })
  })

  it('yokohama 柱断面リスト — 15칸 (断面 라벨 행·位置 없음·S13·600φ 포함)', () => {
    expect(
      sweepColumns(
        'yokohama-p13.json',
        'yokohama-kanazawa-p13-columns.json',
        '柱断面リスト',
      ),
      // S13 4칸만 帯筋 미확정, 断面은 600φ(C56) 1칸만 미확정
    ).toEqual({ main: 15, hoop: 11, dimension: 14 })
  })

  it('yokohama 大梁断面リスト — 전사분 5칸 (位置별 상이 主筋 포함)', () => {
    const doc = readExpected<ExpectedGirdersDoc>(
      'yokohama-kanazawa-p14-girders.json',
    )
    const girders = list(
      parseSectionLists(readPage('yokohama-p14.json')),
      '大梁断面リスト',
    )
    const counts = { main: 0, stirrup: 0, dimension: 0 }

    for (const entry of doc.entries) {
      for (const [story, cell] of Object.entries(entry.stories)) {
        const c = candidate(girders, entry.mark, story)
        const label = `${entry.mark}/${story}`

        if (c.b !== undefined) {
          expect(c.b, label).toBe(cell.b)
          expect(c.depth, label).toBe(cell.depth)
          counts.dimension += 1
        }
        if (c.girderMain) {
          for (const text of Object.values(cell.上筋)) {
            expect(
              `${c.girderMain.topCount}-${c.girderMain.size}`,
              label,
            ).toBe(text)
          }
          for (const text of Object.values(cell.下筋)) {
            expect(
              `${c.girderMain.bottomCount}-${c.girderMain.size}`,
              label,
            ).toBe(text)
          }
          counts.main += 1
        } else {
          for (const [position, text] of Object.entries(cell.上筋)) {
            const raw = c.raw[`上筋(${position})`]
            if (raw !== undefined) expect(raw, label).toBe(text)
          }
          for (const [position, text] of Object.entries(cell.下筋)) {
            const raw = c.raw[`下筋(${position})`]
            if (raw !== undefined) expect(raw, label).toBe(text)
          }
        }
        if (c.stirrup) {
          expect(`${c.stirrup.size}@${c.stirrup.pitchMm}`, label).toBe(
            normPitch(cell.ST),
          )
          counts.stirrup += 1
        } else if (c.raw['ST'] !== undefined) {
          expect(normPitch(c.raw['ST']), label).toBe(normPitch(cell.ST))
        }
      }
    }

    // 位置별 상이 3칸(G51 R階·2階, G55 R階)은 主筋 미확정이 정답
    expect(counts).toEqual({ main: 2, stirrup: 5, dimension: 5 })
  })

  it('kani 地中梁リスト — 전사 1칸 전부 확정', () => {
    const doc = readExpected<{ entries: ExpectedKaniEntry[] }>(
      'kani-sakuragaoka-p38-foundation-girder.json',
    )
    const girders = list(
      parseSectionLists(readPage('kani-p38.json')),
      '地中梁リスト',
    )

    for (const entry of doc.entries) {
      const c = candidate(girders, entry.mark)
      expect(c.b, entry.mark).toBe(entry.b)
      expect(c.depth, entry.mark).toBe(entry.depth)
      expect(
        c.girderMain && `${c.girderMain.topCount}-${c.girderMain.size}`,
        entry.mark,
      ).toBe(entry.上端筋)
      expect(
        c.girderMain && `${c.girderMain.bottomCount}-${c.girderMain.size}`,
        entry.mark,
      ).toBe(entry.下端筋)
      expect(
        c.stirrup && `${c.stirrup.size}@${c.stirrup.pitchMm}`,
        entry.mark,
      ).toBe(normPitch(entry.STP))
    }
  })
})
