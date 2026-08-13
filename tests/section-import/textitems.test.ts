import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import exclusions from '../fixtures/section-import/title-block-exclusions.json'

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

// 제외 사각형 밖에 남은 개인정보는 좌표로는 잡히지 않는다 — 표제란·印影·확인란이
// 도면 어디에 놓이든 걸리도록 내용으로 한 겹 더 본다. 断面リスト의 셀 값(符号·径·
// 本数·ピッチ·寸法)에는 나타날 수 없는 표기만 고른다
const PII_MARKERS: Array<[string, RegExp]> = [
  ['連絡先', /TEL|ＴＥＬ|FAX|ＦＡＸ|〒/i],
  ['電話番号', /\d{2,4}-\d{3,4}-\d{4}/],
  ['メール', /[\w.-]+@[\w.-]+\.[a-z]{2,}/i],
  ['資格・登録', /建築士|登録/],
  ['事務所・氏名', /事務所|氏名|設計者|監理者/],
]

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

    // 밀도 하한만으로는 「표제란 첫 글자가 경계 밖에 남아 커밋됐다」를 못 잡는다 —
    // 제외 사각형 안에 아이템이 하나도 없어야 한다 (경계는 생성기와 같은 파일)
    const excludeFrom = exclusions.pages[spec.file]
    const leaked = fixture.items.filter(
      ({ x, y }) => x >= excludeFrom.x && y >= excludeFrom.y,
    )
    expect(leaked, `title-block leak: ${JSON.stringify(leaked.slice(0, 3))}`)
      .toHaveLength(0)

    const rows = joinedRows(fixture.items)
    // 좌표 검사는 생성기와 같은 술어라 「경계 밖에 남은 개인정보」를 원리상 못 잡는다.
    // 문자는 아이템 단위로 쪼개져 있으므로 행으로 이어붙인 뒤 본다
    for (const [label, pattern] of PII_MARKERS) {
      const hit = rows.find((row) => pattern.test(row))
      expect(hit, `PII marker (${label}): ${hit}`).toBeUndefined()
    }

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
