import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type TextItemFixture = {
  source: {
    cacheFile: string
    sha256: string
    page: number
  }
  page: {
    widthPt: number
    heightPt: number
  }
  items: Array<{
    str: string
    x: number
    y: number
    w: number
    h: number
    rot?: number
  }>
}

const fixtures = [
  {
    file: 'ojkk-p2.json',
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    sha256: 'dcb9504a50d8661a76bbd96c412a20f468cfff7495167cd055ca0bb2289e1343',
    page: 2,
    needles: [['柱リスト'], ['C2A'], ['16-D25'], ['22-D32'], ['700']],
  },
  {
    file: 'ojkk-p3.json',
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    sha256: 'dcb9504a50d8661a76bbd96c412a20f468cfff7495167cd055ca0bb2289e1343',
    page: 3,
    needles: [['梁リスト'], ['上端筋'], ['あばら筋']],
  },
  {
    file: 'yokohama-p13.json',
    cacheFile: 'dwg-yokohama.pdf',
    sha256: '37d20dbab2dec0721d77ed9dfce74cce6685cd9c9f2e34fec4f346bf5d2e237b',
    page: 13,
    needles: [['柱断面リスト'], ['C58A'], ['18-D25'], ['600φ']],
  },
  {
    file: 'yokohama-p14.json',
    cacheFile: 'dwg-yokohama.pdf',
    sha256: '37d20dbab2dec0721d77ed9dfce74cce6685cd9c9f2e34fec4f346bf5d2e237b',
    page: 14,
    needles: [['大梁断面リスト'], ['G51'], ['13-D25'], ['650']],
  },
  {
    file: 'kani-p38.json',
    cacheFile: 'dwg-kani-kids.pdf',
    sha256: '6d4b0f806b429a0103facf10189f75ef87568303459759fbc2826988fc037c8f',
    page: 38,
    needles: [['地中梁リスト'], ['ＦＧ１', 'FG1'], ['3-D19'], ['D10@200']],
  },
] as const

function readFixture(file: string): TextItemFixture {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/section-import/textitems',
    file,
  )

  return JSON.parse(readFileSync(fixturePath, 'utf8')) as TextItemFixture
}

function joinedRows(items: TextItemFixture['items']): string[] {
  const rowTolerancePt = 1
  const rows: Array<{ y: number; items: TextItemFixture['items'] }> = []

  for (const item of [...items].sort((left, right) => left.y - right.y)) {
    const row = rows.find(({ y }) => Math.abs(y - item.y) <= rowTolerancePt)

    if (row) {
      row.items.push(item)
      row.y =
        row.items.reduce((total, rowItem) => total + rowItem.y, 0) /
        row.items.length
    } else {
      rows.push({ y: item.y, items: [item] })
    }
  }

  return rows.map(({ items: rowItems }) =>
    rowItems
      .sort((left, right) => left.x - right.x)
      .map(({ str }) => str)
      .join(''),
  )
}

describe('section-import TextItem fixtures', () => {
  it.each(fixtures)('$file preserves dense, positioned drawing text', (spec) => {
    const fixture = readFixture(spec.file)

    expect(fixture.source).toEqual({
      cacheFile: spec.cacheFile,
      sha256: spec.sha256,
      page: spec.page,
    })
    expect(fixture.page.widthPt).toBeGreaterThan(0)
    expect(fixture.page.heightPt).toBeGreaterThan(0)
    // 표제란(개인 실명·연락처)은 추출 시점에 제외한다 — 밀도 하한은 그 제외 후의
    // 최소 실측(ojkk-p2 707)보다 낮게 잡아, 빈 픽스처·절단 회귀만 걸러낸다
    expect(fixture.items.length).toBeGreaterThanOrEqual(600)

    for (const item of fixture.items) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x).toBeLessThan(fixture.page.widthPt)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeLessThan(fixture.page.heightPt)
    }

    const rows = joinedRows(fixture.items)
    for (const alternatives of spec.needles) {
      expect(
        alternatives.some((needle) =>
          rows.some((row) => row.includes(needle)),
        ),
        `missing same-row text: ${alternatives.join(' or ')}`,
      ).toBe(true)
    }
  })
})
