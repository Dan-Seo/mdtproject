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

function titlePage(title: string, mark: string): TextPage {
  return {
    widthPt: 300,
    heightPt: 180,
    items: [
      { str: title, x: 10, y: 5, w: 260, h: 8 },
      { str: '符号', x: 10, y: 20, w: 20, h: 8 },
      { str: mark, x: 140, y: 20, w: 12, h: 8 },
      { str: '断面', x: 10, y: 50, w: 20, h: 8 },
      { str: '400×600', x: 120, y: 50, w: 50, h: 8 },
    ],
  }
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
      shape: '矩形',
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

    // 高強度せん断補強筋 K13。フープの数量は断面周長だけで決まるので
    // 規準にない値を引かずに取り込める (ADR-026)
    const c2aFirst = candidate(columns, 'C2A', '1F')
    expect(c2aFirst.main).toEqual({ count: 22, size: 'D32' })
    expect(c2aFirst.hoop).toEqual({ size: 'K13', pitchMm: 100 })
    expect(c2aFirst.raw['帯筋']).toBeUndefined()
    expect(c2aFirst.issues).toHaveLength(0)

    const c2First = candidate(columns, 'C2', '1F')
    expect(c2First.hoop).toEqual({ size: 'K13', pitchMm: 100 })
    expect(candidate(columns, 'FC1', '1F').kind).toBe('対象外')
  })

  it('detects the fifth TextItem fixture and its 大梁 list', () => {
    const parsed = parseSectionLists(readPage('ojkk-p3.json'))
    const girders = list(parsed, '大梁リスト')

    expectMarksInclude(girders, ['G1', 'G2', 'G3', 'G4', 'G5'])
    expect(candidate(girders, 'G1', 'RF').kind).toBe('大梁')
    expect(candidate(girders, 'G1', 'RF').sideBar).toEqual({
      size: 'D10',
      count: 2,
    })
    expect(girders.candidates).not.toHaveLength(0)
    for (const parsedCandidate of girders.candidates) {
      expect(parsedCandidate.widthTie).toEqual({
        size: 'D10',
        pitchMm: 1000,
      })
    }
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
    expect(c51First.hoop).toEqual({ size: 'S13', pitchMm: 100 })
    expect(c51First.raw['HOOP']).toBeUndefined()
    for (const parsedCandidate of columns.candidates) {
      expect(parsedCandidate.widthTie).toBeUndefined()
    }

    // 円形柱。直径記号があるので b×d ではなく直径ひとつとして確定する (ADR-027)
    const c56 = candidate(columns, 'C56', '2階')
    expect(c56.main).toEqual({ count: 12, size: 'D22' })
    expect(c56.shape).toBe('円形')
    expect(c56.b).toBe(600)
    expect(c56.d).toBe(600)
    expect(c56.raw['断面']).toBeUndefined()
    expect(c56.issues).toHaveLength(0)
    expect(candidate(columns, 'C58A', '1階').main).toEqual({
      count: 26,
      size: 'D25',
    })

    expectMarksInclude(smallGirders, ['B51'])
    expect(candidate(smallGirders, 'B51').kind).toBe('対象外')

    // 「―」は読取失敗ではなく、その欄に配筋がないという図面の値である。
    const b55 = candidate(smallGirders, 'B55')
    expect(b55.sideBar).toBeUndefined()
    expect(b55.issues).not.toContain('腹筋解釈不能')
    for (const parsedCandidate of smallGirders.candidates) {
      expect(parsedCandidate.widthTie).toBeUndefined()
    }
  })

  it('maps position-dependent 大梁 main bars, including asymmetric ends', () => {
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
    expect(g51Roof.girderMain).toEqual({
      size: 'D25',
      topCount: 8,
      bottomCount: 8,
      asymmetricEnds: {
        labels: ['外端', '内端'],
        topCounts: [8, 13],
        bottomCounts: [8, 11],
      },
      cutoffFromSupportFaceMm: 2500,
    })
    expect(g51Roof.issues).not.toContain('主筋端部左右相違')
    expect(g51Roof.sideBar).toEqual({ size: 'D10', count: 2 })

    const cutoffEntries = girders.candidates.flatMap(({ raw }) =>
      Object.entries(raw).filter(([key]) => key.startsWith('カットオフ')),
    )
    expect(g51Roof.raw['カットオフ(内端)']?.normalize('NFKC')).toBe('[2500]')
    expect(cutoffEntries).toHaveLength(6)
    expect(
      cutoffEntries.map(([, value]) => value.normalize('NFKC')).sort(),
    ).toEqual(['[2500]', '[2700]', '[2700]', '[2700]', '[2700]', '[3000]'])

    expect(candidate(girders, 'G52', 'R階').sideBar).toEqual({
      size: 'D10',
      count: 4,
    })
    expect(girders.candidates).not.toHaveLength(0)
    for (const parsedCandidate of girders.candidates) {
      expect(parsedCandidate.widthTie).toEqual({
        size: 'D10',
        pitchMm: 1000,
      })
    }

    const g51Second = candidate(girders, 'G51', '2階')
    expect(g51Second.stirrup).toEqual({ size: 'D13', pitchMm: 150 })
    // 両端が同値の表は位置別に確定する — 上下とも中央 7・端部 11
    expect(g51Second.girderMain).toEqual({
      size: 'D25',
      topCount: 7,
      bottomCount: 7,
      endTopCount: 11,
      endBottomCount: 11,
    })

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
    expect(candidate(girders, 'G55', 'R階').girderMain).toEqual({
      size: 'D25',
      topCount: 5,
      bottomCount: 5,
      asymmetricEnds: {
        labels: ['Y2端', 'Y3端'],
        topCounts: [4, 8],
        bottomCounts: [4, 5],
      },
    })
  })

  it('keeps a half-width cutoff raw without a position instead of inventing a candidate field', () => {
    const parsed = parseSectionLists({
      widthPt: 300,
      heightPt: 180,
      items: [
        {
          str: '大梁リスト特記[]内はカットオフの柱面からの寸法を示す。',
          x: 10,
          y: 5,
          w: 220,
          h: 8,
        },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 140, y: 20, w: 12, h: 8 },
        { str: '[1500]', x: 120, y: 40, w: 40, h: 8 },
        { str: '断面', x: 10, y: 60, w: 20, h: 8 },
        { str: '400×600', x: 120, y: 60, w: 50, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1')

    expect(g1.raw['カットオフ']).toBe('[1500]')
    expect('cutoff' in g1).toBe(false)
  })

  it.each([
    ['ojkk-p3.json', '大梁リスト'],
    ['kani-p38.json', '地中梁リスト'],
  ])('%s has no カットオフ raw values', (fixture, listKind) => {
    const parsedList = list(parseSectionLists(readPage(fixture)), listKind)

    for (const parsedCandidate of parsedList.candidates) {
      expect(
        Object.keys(parsedCandidate.raw).some((key) =>
          key.startsWith('カットオフ'),
        ),
      ).toBe(false)
    }
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
    expect(fg1.sideBar).toBeUndefined()
    expect(fg1.widthTie).toBeUndefined()
    expect(fg1.issues).not.toContain('腹筋解釈不能')
    expect(fg1.raw['腹筋']).toBeUndefined()
  })

  it('keeps an unexpected 腹筋 cell raw instead of inventing a value', () => {
    const parsed = parseSectionLists({
      widthPt: 300,
      heightPt: 180,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 140, y: 20, w: 12, h: 8 },
        { str: '腹筋', x: 10, y: 50, w: 20, h: 8 },
        { str: '2-K13', x: 125, y: 50, w: 36, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1')

    expect(g1.sideBar).toBeUndefined()
    expect(g1.raw['腹筋']).toBe('2-K13')
    expect(g1.issues).toContain('腹筋解釈不能')
  })

  it('separates a three-digit 幅止め筋 pitch from the next numbered title item', () => {
    const parsed = parseSectionLists(
      titlePage(
        '大梁リスト特記なき限り1.巾止筋D10-@5002.中吊り筋受け筋D10-@1000',
        'G1',
      ),
    )
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1')

    expect(g1.widthTie).toEqual({ size: 'D10', pitchMm: 500 })
  })

  it.each([
    {
      fixture: 'ojkk-p3',
      title: '大梁リスト※幅止筋はD10@1000とする',
      listKind: '大梁リスト',
      mark: 'G1',
      expected: { size: 'D10', pitchMm: 1000 },
    },
    {
      fixture: 'yokohama-p14',
      title:
        '大梁断面リスト特記なき限り1.巾止筋D10-@10002.中吊り筋受け筋D10-@10003.［］内はｶｯﾄｵﾌの柱面からの寸法を示す。',
      listKind: '大梁断面リスト',
      mark: 'G1',
      expected: { size: 'D10', pitchMm: 1000 },
    },
    {
      fixture: 'yokohama-p13 柱',
      title:
        '柱断面リスト1/30特記なき限り1.巾止筋D10-@5002.S13はKSS785を示す。3.HOOPの…',
      listKind: '柱断面リスト',
      mark: 'C1',
      expected: undefined,
    },
    {
      fixture: 'yokohama-p13 小梁',
      title:
        '小梁断面リスト1/30特記なき限り1.巾止筋D10-@10002.中吊り筋受け筋D10-@1000',
      listKind: '小梁断面リスト',
      mark: 'B1',
      expected: undefined,
    },
  ])('reads the restored $fixture title without crossing item boundaries', ({
    title,
    listKind,
    mark,
    expected,
  }) => {
    const parsedCandidate = candidate(
      list(parseSectionLists(titlePage(title, mark)), listKind),
      mark,
    )

    expect(parsedCandidate.widthTie).toEqual(expected)
  })

  it('recognizes a two-digit next item number only after splitting sequential items', () => {
    const title =
      '大梁リスト特記なき限り1.a2.b3.c4.d5.e6.f7.g8.h9.巾止筋D10-@50010.中吊り筋'
    const g1 = candidate(
      list(parseSectionLists(titlePage(title, 'G1')), '大梁リスト'),
      'G1',
    )

    expect(g1.widthTie).toEqual({ size: 'D10', pitchMm: 500 })
  })

  it('keeps an unbounded 幅止め筋 title item raw with an issue', () => {
    const parsed = parseSectionLists(
      titlePage(
        '大梁リスト特記幅止め筋D10-@1000中吊り筋受け筋D13-@200',
        'G1',
      ),
    )
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1')

    expect(g1.widthTie).toBeUndefined()
    expect(g1.raw['幅止筋']).toBe(
      '幅止め筋D10-@1000中吊り筋受け筋D13-@200',
    )
    expect(g1.issues).toContain('幅止め筋解釈不能')
  })

  it('keeps the pre-phase-7 numeric pitch limit for table cells', () => {
    const parsed = parseSectionLists({
      widthPt: 300,
      heightPt: 180,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 140, y: 20, w: 12, h: 8 },
        { str: 'ST', x: 10, y: 40, w: 20, h: 8 },
        { str: 'D13@0100', x: 120, y: 40, w: 50, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1')

    expect(g1.stirrup).toEqual({ size: 'D13', pitchMm: 100 })
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
  /** 円形断面の直径。b・d の代わりにこれを持つ (ADR-027) */
  直径?: number
  断面raw?: string
  主筋: string | Record<string, string>
  帯筋?: string
  HOOP?: string
}

interface ExpectedColumnsDoc {
  entries: Array<{ mark: string; stories: Record<string, ExpectedColumnCell> }>
}

/** 行 라벨은 도면마다 다르다 — 전사는 그 도면이 쓴 말을 그대로 적는다 */
interface GirderLabels {
  top: string
  bottom: string
  stirrup: string
}

type ExpectedGirderCell = Record<string, unknown> & {
  b: number
  depth: number
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

interface ExpectedWallEntry {
  mark: string
  thickness?: number
  断面raw?: string
  縦筋: string
  横筋: string
}

interface ExpectedSlabEntry {
  mark: string
  thickness: number
  上端筋?: Record<string, string>
  下端筋?: Record<string, string>
  上筋?: Record<string, string>
  下筋?: Record<string, string>
}

interface ExpectedList {
  listKind: string
  scope?: string
  entries?: Array<{ mark: string }>
  outOfScopeMarks?: string[]
  marks?: string[]
}

interface ExpectedWallSlabDoc {
  lists: Array<ExpectedList & {
    entries?: Array<ExpectedWallEntry | ExpectedSlabEntry>
  }>
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
        // 円形は b×d ではなく直径ひとつ。転写側も「600φ」を直径 600 と読む
        if (cell.直径 !== undefined) {
          expect(c.shape, label).toBe('円形')
          expect(c.b, label).toBe(cell.直径)
          expect(c.d, label).toBe(cell.直径)
        } else {
          expect(c.shape, label).toBe('矩形')
          expect(c.b, label).toBe(cell.b)
          expect(c.d, label).toBe(cell.d)
        }
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

/**
 * 転写キーの位置名。表は中央欄を一つしか持たないので、中央でなければ端部だ。
 * 파서의 분류기를 쓰지 않고 테스트가 따로 판정한다 (ADR-010).
 */
function isCenterPosition(position: string): boolean {
  return position.includes('中央')
}

function sweepGirders(
  pageFile: string,
  expectedFile: string,
  listKind: string,
  labels: GirderLabels,
): { main: number; stirrup: number; dimension: number } {
  const doc = readExpected<ExpectedGirdersDoc>(expectedFile)
  const girders = list(parseSectionLists(readPage(pageFile)), listKind)
  const counts = { main: 0, stirrup: 0, dimension: 0 }

  for (const entry of doc.entries) {
    for (const [story, cell] of Object.entries(entry.stories)) {
      const c = candidate(girders, entry.mark, story)
      const label = `${entry.mark}/${story}`
      const topCellsRaw = cell[labels.top]
      const bottomCellsRaw = cell[labels.bottom]
      expect(topCellsRaw, `${label} ${labels.top} fixture key missing`).toBeDefined()
      expect(
        bottomCellsRaw,
        `${label} ${labels.bottom} fixture key missing`,
      ).toBeDefined()
      const topCells = topCellsRaw as Record<string, string>
      const bottomCells = bottomCellsRaw as Record<string, string>
      const stirrupText = cell[labels.stirrup] as string

      if (c.b !== undefined) {
        expect(c.b, label).toBe(cell.b)
        expect(c.depth, label).toBe(cell.depth)
        counts.dimension += 1
      }
      if (c.girderMain) {
        // 位置別に確定した候補は、位置ごとに転写と突き合わせる — 端部の値を中央に
        // 入れた候補は「確定した」ままここを通ってしまう
        const {
          size,
          topCount,
          bottomCount,
          endTopCount,
          endBottomCount,
          asymmetricEnds,
        } = c.girderMain
        if (asymmetricEnds) {
          const endpointPositions = Object.keys(topCells).filter(
            (position) => !isCenterPosition(position),
          )
          expect(asymmetricEnds.labels, `${label} endpoint labels`).toEqual(
            endpointPositions,
          )
          if (asymmetricEnds.topCounts) {
            expect(
              asymmetricEnds.topCounts,
              `${label} ${labels.top} endpoint counts`,
            ).toEqual(
              endpointPositions.map((position) =>
                Number(topCells[position]?.split('-')[0]),
              ),
            )
          }
          if (asymmetricEnds.bottomCounts) {
            expect(
              asymmetricEnds.bottomCounts,
              `${label} ${labels.bottom} endpoint counts`,
            ).toEqual(
              endpointPositions.map((position) =>
                Number(bottomCells[position]?.split('-')[0]),
              ),
            )
          }
        }
        for (const [position, text] of Object.entries(topCells)) {
          const endIndex = asymmetricEnds?.labels.indexOf(position) ?? -1
          const count = isCenterPosition(position)
            ? topCount
            : endIndex >= 0
              ? (asymmetricEnds?.topCounts?.[endIndex] ?? endTopCount ?? topCount)
              : (endTopCount ?? topCount)
          expect(`${count}-${size}`, `${label} ${labels.top}(${position})`).toBe(
            text,
          )
        }
        for (const [position, text] of Object.entries(bottomCells)) {
          const endIndex = asymmetricEnds?.labels.indexOf(position) ?? -1
          const count = isCenterPosition(position)
            ? bottomCount
            : endIndex >= 0
              ? (asymmetricEnds?.bottomCounts?.[endIndex] ??
                endBottomCount ??
                bottomCount)
              : (endBottomCount ?? bottomCount)
          expect(
            `${count}-${size}`,
            `${label} ${labels.bottom}(${position})`,
          ).toBe(text)
        }
        counts.main += 1
      } else {
        for (const [position, text] of Object.entries(topCells)) {
          const raw = c.raw[`${labels.top}(${position})`]
          expect(raw, `${label} ${labels.top}(${position}) 원문 소실`).toBeDefined()
          expect(raw, label).toBe(text)
        }
        for (const [position, text] of Object.entries(bottomCells)) {
          const raw = c.raw[`${labels.bottom}(${position})`]
          expect(
            raw,
            `${label} ${labels.bottom}(${position}) 원문 소실`,
          ).toBeDefined()
          expect(raw, label).toBe(text)
        }
      }
      if (c.stirrup) {
        expect(`${c.stirrup.size}@${c.stirrup.pitchMm}`, label).toBe(
          normPitch(stirrupText),
        )
        counts.stirrup += 1
      } else if (c.raw[labels.stirrup] !== undefined) {
        expect(normPitch(c.raw[labels.stirrup]), label).toBe(
          normPitch(stirrupText),
        )
      }
    }
  }

  return counts
}

describe('전사 픽스처 전 셀 대조 (ADR-010)', () => {
  it('ojkk 柱リスト — 19칸 (位置 2행·帯筋의 고강도 K13 포함 전 칸 확정)', () => {
    expect(
      sweepColumns('ojkk-p2.json', 'ojkk-akamichi-p2-columns.json', '柱リスト'),
      // K13 3칸(C2 1F·C2A 2F·C2A 1F)이 ADR-026로 확정되어 帯筋도 전 칸 찼다.
      // 断面은 라벨 행이 없지만 스케치의 가로·세로 치수를 짝지어 전 칸 확정 —
      // 값은 전사(700×700·FC1 600×600)와 대조된다
    ).toEqual({ main: 19, hoop: 19, dimension: 19 })
  })

  it('yokohama 柱断面リスト — 15칸 (断面 라벨 행·位置 없음·S13·600φ 전 칸 확정)', () => {
    expect(
      sweepColumns(
        'yokohama-p13.json',
        'yokohama-kanazawa-p13-columns.json',
        '柱断面リスト',
      ),
      // S13 4칸은 ADR-026로, 600φ(C56)는 ADR-027으로 확정되어 전 칸이 찼다
    ).toEqual({ main: 15, hoop: 15, dimension: 15 })
  })

  it('yokohama 大梁断面リスト — 전사분 5칸 (位置별 상이 主筋 포함)', () => {
    expect(
      sweepGirders(
        'yokohama-p14.json',
        'yokohama-kanazawa-p14-girders.json',
        '大梁断面リスト',
        { top: '上筋', bottom: '下筋', stirrup: 'ST' },
      ),
      // 端部가 좌우 동값인 1칸(G51 2階)은 기존 대칭 필드로, 나머지 2칸
      // (G51 R階 外端8/内端13, G55 R階)은 원문 라벨과 좌우 본수를
      // asymmetricEnds로 확정한다. 방향 결정은 다음 취입 단계의 책임이다
    ).toEqual({ main: 5, stirrup: 5, dimension: 5 })
  })

  it('ojkk 大梁リスト — 32칸 (断面 라벨 행 없음·2F에만 G1A·G2A)', () => {
    expect(
      sweepGirders(
        'ojkk-p3.json',
        'ojkk-akamichi-p3-girders.json',
        '大梁リスト',
        { top: '上端筋', bottom: '下端筋', stirrup: 'あばら筋' },
      ),
      // 断面은 라벨 행이 없지만 스케치의 가로(端部 아래)·세로(中央 오른쪽) 치수를
      // 짝지어 전 칸 확정 — 정사각형이 아니라 가로→b·세로→depth 대응까지 대조된다.
      // 主筋은 端部와 中央이 다른 17칸도 位置別로 확정해 전 칸이 찼다 —
      // 표가 端部/中央 두 열만 쓰므로 좌우 방향을 정할 필요가 없다
    ).toEqual({ main: 32, stirrup: 32, dimension: 32 })
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

  it('ojkk 壁リスト·スラブリスト — 벽 5칸과 床板 6칸을 전사 대조한다', () => {
    const doc = readExpected<ExpectedWallSlabDoc>(
      'ojkk-akamichi-p4-walls-slabs.json',
    )
    const parsed = parseSectionLists(readPage('ojkk-p4.json'))
    const walls = list(parsed, '壁リスト')
    const slabs = list(parsed, 'スラブリスト')
    const expectedListKinds = doc.lists
      .filter(({ listKind }) => listKind !== '屋内階段・屋外階段 配筋図')
      .map(({ listKind }) => listKind)
      .sort()
    expect(parsed.map(({ listKind }) => listKind).sort()).toEqual(expectedListKinds)
    for (const listSpec of doc.lists.filter(
      ({ listKind }) => listKind !== '屋内階段・屋外階段 配筋図',
    )) {
      const parsedList = list(parsed, listSpec.listKind)
      const expectedMarks = [
        ...(listSpec.entries ?? []).map(({ mark }) => mark),
        ...(listSpec.outOfScopeMarks ?? []),
        ...(listSpec.marks ?? []),
      ].sort()
      expect(parsedList.candidates.map(({ mark }) => mark).sort()).toEqual(expectedMarks)
    }
    const wallEntries = doc.lists.find(({ listKind }) => listKind === '壁リスト')!
      .entries as ExpectedWallEntry[]
    const slabEntries = doc.lists.find(({ listKind }) => listKind === 'スラブリスト')!
      .entries as ExpectedSlabEntry[]

    const counts = { wallThickness: 0, wallVertical: 0, wallHorizontal: 0, slabThickness: 0, slabBars: 0 }
    for (const entry of wallEntries) {
      const c = candidate(walls, entry.mark)
      expect(c.kind, entry.mark).toBe('耐震壁')
      if (entry.thickness !== undefined) {
        expect(c.thickness, entry.mark).toBe(entry.thickness)
        counts.wallThickness += 1
      } else {
        expect(c.thickness, entry.mark).toBeUndefined()
        expect(c.raw['断面'], entry.mark).toBe(entry['断面raw'])
      }
      for (const [role, expected] of [['vertical', entry.縦筋], ['horizontal', entry.横筋]] as const) {
        const parsedBar = c[role]
        const match = expected.match(/^(D\d+)@([0-9]+)\((.+)\)$/)
        if (match) {
          expect(parsedBar, `${entry.mark} ${role}`).toEqual({
            size: match[1],
            pitchMm: Number(match[2]),
          })
          expect(c.layers, `${entry.mark} ${role}`).toBe(
            /ダブル|ﾀﾞﾌﾞﾙ|ダブルチドリ/.test(match[3]) ? 2 : 1,
          )
          counts[role === 'vertical' ? 'wallVertical' : 'wallHorizontal'] += 1
        } else {
          expect(parsedBar, `${entry.mark} ${role}`).toBeUndefined()
          expect(c.raw[role === 'vertical' ? '縦筋' : '横筋'], `${entry.mark} ${role}`).toBe(expected)
        }
      }
    }
    expect(counts).toEqual({
      wallThickness: 4,
      wallVertical: 5,
      wallHorizontal: 5,
      slabThickness: 0,
      slabBars: 0,
    })

    for (const entry of slabEntries) {
      const c = candidate(slabs, entry.mark)
      expect(c.kind, entry.mark).toBe('床板')
      expect(c.thickness, entry.mark).toBe(entry.thickness)
      counts.slabThickness += 1
      const top = entry.上端筋 ?? entry.上筋!
      const bottom = entry.下端筋 ?? entry.下筋!
      for (const [face, values] of [['top', top], ['bottom', bottom] as const] as const) {
        for (const [axis, expected] of Object.entries(values)) {
          const key = axis === '短辺方向' ? 'shortSide' : 'longSide'
          const parsedBar = c[key]?.[face]
          const match = expected.match(/^(D\d+)-?@([0-9]+)$/)
          if (match) {
            expect(parsedBar, `${entry.mark} ${axis} ${face}`).toEqual({
              size: match[1],
              pitchMm: Number(match[2]),
            })
            counts.slabBars += 1
          } else {
            expect(parsedBar, `${entry.mark} ${axis} ${face}`).toBeUndefined()
            expect(
              c.raw[`${axis}(${face})`],
              `${entry.mark} ${axis} ${face}`,
            ).toBe(expected)
          }
        }
      }
    }
    expect(counts.slabThickness).toBe(6)
    expect(counts.slabBars).toBe(15)
    expectMarksInclude(slabs, ['FS1', 'FS2', 'FS3', 'FS4'])
    for (const mark of doc.lists.find(({ listKind }) => listKind === 'スラブリスト')!.outOfScopeMarks!) {
      expect(candidate(slabs, mark).kind, mark).toBe('対象外')
    }

    for (const listSpec of doc.lists.filter(
      ({ scope, listKind }) =>
        scope === '対象外' &&
        ['小梁リスト', '片持梁リスト'].includes(listKind),
    )) {
      const parsedList = list(parsed, listSpec.listKind)
      expect(parsedList.candidates.every(({ kind }) => kind === '対象外')).toBe(true)
      for (const mark of listSpec.marks ?? []) expectMarksInclude(parsedList, [mark])
    }
  })

  it('yokohama スラブリスト — 上筋/下筋 별칭과 床板 실패 경로를 대조한다', () => {
    const doc = readExpected<ExpectedWallSlabDoc>(
      'yokohama-kanazawa-p15-slabs-walls.json',
    )
    const parsed = parseSectionLists(readPage('yokohama-p15.json'))
    const slabs = list(parsed, 'スラブリスト')
    expect(parsed.map(({ listKind }) => listKind).sort()).toEqual(
      doc.lists.map(({ listKind }) => listKind).sort(),
    )
    for (const listSpec of doc.lists) {
      const parsedList = list(parsed, listSpec.listKind)
      const expectedMarks =
        listSpec.scope === '形式対象外'
          ? []
          : [
              ...(listSpec.entries ?? []).map(({ mark }) => mark),
              ...(listSpec.marks ?? []),
            ].sort()
      expect(parsedList.candidates.map(({ mark }) => mark).sort()).toEqual(expectedMarks)
    }
    const entries = doc.lists.find(({ listKind }) => listKind === 'スラブリスト')!
      .entries as ExpectedSlabEntry[]
    let thickness = 0
    let bars = 0
    for (const entry of entries) {
      const c = candidate(slabs, entry.mark)
      expect(c.kind).toBe('床板')
      expect(c.thickness).toBe(entry.thickness)
      thickness += 1
      const top = entry.上筋!
      const bottom = entry.下筋!
      for (const [face, values] of [['top', top], ['bottom', bottom] as const] as const) {
        for (const [axis, expected] of Object.entries(values)) {
          const key = axis === '短辺方向' ? 'shortSide' : 'longSide'
          const parsedBar = c[key]?.[face]
          const match = expected.match(/^(D\d+)-?@([0-9]+)$/)
          if (match) {
            expect(parsedBar).toEqual({ size: match[1], pitchMm: Number(match[2]) })
            bars += 1
          } else {
            expect(parsedBar).toBeUndefined()
            expect(c.raw[`${axis}(${face})`]).toBe(expected)
          }
        }
      }
    }
    expect({ thickness, bars }).toEqual({ thickness: 6, bars: 19 })

    for (const listSpec of doc.lists.filter(({ scope }) => scope === '対象外')) {
      const parsedList = list(parsed, listSpec.listKind)
      expect(parsedList.candidates.every(({ kind }) => kind === '対象外')).toBe(true)
      for (const mark of listSpec.marks ?? []) expectMarksInclude(parsedList, [mark])
    }
    expect(list(parsed, '壁リスト').candidates).toHaveLength(0)
  })
})
