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
// 도면 어디에 놓이든 걸리도록 내용으로 한 겹 더 본다. 사람·조직을 식별하는 표기로
// 좁힌다: 「事務所」(○○事務所棟·室名)·「登録」(認定登録番号)·「設計者と協議」 같은
// 도면 상용어까지 걸면 PII가 없는 도면도 실패해 픽스처 확장이 막힌다 (R10)
const PII_MARKERS: Array<[string, RegExp]> = [
  ['連絡先', /TEL|ＴＥＬ|FAX|ＦＡＸ|〒/i],
  ['電話番号', /\d{2,4}-\d{3,4}-\d{4}/],
  ['メール', /[\w.-]+@[\w.-]+\.[a-z]{2,}/i],
  ['資格・登録', /一級建築士|二級建築士|建築士事務所登録|登録番号/],
  ['事務所・氏名', /建築士事務所|設計事務所|氏名|設計者名|監理者名/],
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

/**
 * 縦書き(rot≠0) 문자열은 1글자 단위로 y만 다르게 저장돼 있어 가로 행에는 절대
 * 이어지지 않는다(현행 픽스처 442건, 전부 -90). 세로로도 이어 봐야 표제란 문구가
 * 검사망에 걸린다. 세로로 인접한 글자만 잇는다 — 무관한 행의 글자가 같은 x에서
 * 우연히 이어지면 없는 문자열을 만들어 오탐이 된다.
 * 읽는 방향은 회전 부호가 정한다(`toTextItems`의 rot은 atan2라 +90도 나온다) —
 * 한쪽으로만 이으면 반대 회전 문자열이 역순이 되어 마커가 매칭되지 않는다
 */
function joinedColumns(items: TextItemFixture['items']): string[] {
  // 방향을 x 버킷 단위로 정하면 같은 x에 +90 글자가 하나만 섞여도 그 버킷의
  // -90 문자열이 통째로 뒤집힌다 — 부호로 먼저 가른 뒤 각각 잇는다.
  // 회전 없는 글자도 따로 가른다: 같은 대역에 섞으면 가로 글자 하나가 세로 런
  // 가운데로 끼어들어 마커가 빠져나간다
  const rotated = items.filter(({ rot }) => rot !== undefined && rot !== 0)
  const unrotated = items.filter(({ rot }) => rot === undefined || rot === 0)
  const upward = ({ rot }: TextItemFixture['items'][number]) =>
    rot !== undefined && rot > 0

  return [
    ...columnRuns(rotated.filter(upward), true),
    ...columnRuns(
      rotated.filter((item) => !upward(item)),
      false,
    ),
    // 회전 정보 없이 세로로 쓰인 문자열은 rot으로 방향이 정해지지 않는다
    // (좌표계는 「좌상 원점, +y 아래」라 위→아래가 y 오름차순이지만, 아래에서
    // 위로 쌓인 표기도 있다) — 양방향을 본다
    ...columnRuns(unrotated, true),
    ...columnRuns(unrotated, false),
    // 위 분할은 서로소라 한 런에 회전·무회전이 섞이면(縦中横 — 세로쓰기 안의
    // 숫자만 무회전인 표기, 표제란 전화번호가 정확히 이 형태다) 어느 패스에서도
    // 이어지지 않는다. 원본 전체를 잇는 패스를 덧붙여 진짜 superset으로 만든다 —
    // 오탐은 사람이 한 번 보면 끝나지만 누락은 PII가 그대로 커밋된다
    ...columnRuns(items, true),
    ...columnRuns(items, false),
  ]
}

function columnRuns(
  items: TextItemFixture['items'],
  upward: boolean,
): string[] {
  const columns = new Map<number, TextItemFixture['items']>()
  for (const item of items) {
    const key = Math.round(item.x)
    columns.set(key, [...(columns.get(key) ?? []), item])
  }

  return [...columns.values()].flatMap((columnItems) => {
    const sorted = [...columnItems].sort((left, right) =>
      upward ? left.y - right.y : right.y - left.y,
    )
    const runs: string[] = []
    let current: string[] = []
    let previous: TextItemFixture['items'][number] | undefined

    for (const item of sorted) {
      const adjacent =
        previous !== undefined &&
        Math.abs(previous.y - item.y) <= Math.max(previous.h, item.h) * 2
      if (!adjacent && current.length > 0) {
        runs.push(current.join(''))
        current = []
      }
      current.push(item.str)
      previous = item
    }
    if (current.length > 0) runs.push(current.join(''))

    return runs
  })
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
    // 아래 PII 스캔과 같은 규약 — 실패 메시지에 원문을 싣지 않는다.
    // 어서션 대상도 배열이 아니라 개수다: 배열을 넘기면 vitest가 received로
    // 아이템 전체(str 포함)를 찍어 메시지만 고쳐도 원문이 로그에 남는다
    expect(
      leaked.length,
      `title-block leak: ${leaked.length}件 (先頭 x=${leaked[0]?.x}, y=${leaked[0]?.y})`,
    ).toBe(0)

    const rows = joinedRows(fixture.items)
    // 좌표 검사는 생성기와 같은 술어라 「경계 밖에 남은 개인정보」를 원리상 못 잡는다.
    // 문자는 아이템 단위로 쪼개져 있으므로 가로·세로 양쪽으로 이어붙인 뒤 본다
    const scanned = [...rows, ...joinedColumns(fixture.items)]
    for (const [label, pattern] of PII_MARKERS) {
      // 매치된 원문은 찍지 않는다 — 커밋을 막아도 CI 로그·아티팩트에 평문으로
      // 남으면 유출은 그대로다. 위치만 알려주고 실물은 로컬에서 보게 한다
      const hitIndex = scanned.findIndex((text) => pattern.test(text))
      expect(hitIndex, `PII marker (${label}) at index ${hitIndex}`).toBe(-1)
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

  it('reconstructs 縦書き text so the PII scan is not bypassed by rotation', () => {
    // 마커 0건은 「세로도 봤다」의 증거가 못 된다 — 세로 채널이 실제로 글자를
    // 이어붙이는지 고정한다. 「10-D13」은 이 픽스처에서 세로로만 나타난다
    const fixture = readFixture('kani-p38.json')

    expect(joinedRows(fixture.items).some((row) => row.includes('10-D13'))).toBe(
      false,
    )
    expect(joinedColumns(fixture.items)).toContain('10-D13')
  })

  it('reads 縦書き in either rotation direction', () => {
    // 현행 픽스처는 전부 rot=-90이라 +90은 합성으로 고정한다 — 한 방향만 이으면
    // 반대 회전 문자열이 역순이 되어 마커가 통째로 빠져나간다
    const vertical = (rot: number) =>
      [...'TEL'].map((str, index) => ({
        str,
        x: 100,
        y: rot > 0 ? 100 + index * 10 : 100 - index * 10,
        w: 8,
        h: 8,
        rot,
      }))

    expect(joinedColumns(vertical(-90))).toContain('TEL')
    expect(joinedColumns(vertical(90))).toContain('TEL')
  })

  it('keeps both directions readable when one x column holds both rotations', () => {
    // 방향을 x 버킷 단위로 추측하면 +90 글자 하나가 같은 버킷의 -90 문자열을
    // 통째로 뒤집어 마커가 빠져나간다
    const items = [
      ...[...'TEL'].map((str, index) => ({
        str,
        x: 100,
        y: 200 - index * 10,
        w: 8,
        h: 8,
        rot: -90,
      })),
      ...[...'FAX'].map((str, index) => ({
        str,
        x: 100,
        y: 100 + index * 10,
        w: 8,
        h: 8,
        rot: 90,
      })),
    ]

    const joined = joinedColumns(items)
    expect(joined).toContain('TEL')
    expect(joined).toContain('FAX')
  })

  it('does not let an unrotated glyph break a 縦書き run in the same column', () => {
    // 회전 없는 글자를 같은 대역에 섞으면 세로 런 가운데로 끼어들어
    // 「TEL」이 「TXEL」이 되고 마커가 그대로 빠져나간다
    const items = [
      ...[...'TEL'].map((str, index) => ({
        str,
        x: 100,
        y: 200 - index * 10,
        w: 8,
        h: 8,
        rot: -90,
      })),
      { str: 'X', x: 100, y: 195, w: 8, h: 8 },
    ]

    expect(joinedColumns(items)).toContain('TEL')
  })

  it('reads unrotated 縦書き stacked either way', () => {
    // 좌표계가 「좌상 원점, +y 아래」라 위→아래가 y 오름차순이다 — 무회전
    // 세로쓰기를 한 방향으로만 이으면 통째로 뒤집혀 마커가 빠져나간다
    const stacked = (step: number) =>
      [...'TEL'].map((str, index) => ({
        str,
        x: 100,
        y: 100 + index * step,
        w: 8,
        h: 8,
      }))

    expect(joinedColumns(stacked(10))).toContain('TEL')
    expect(joinedColumns(stacked(-10))).toContain('TEL')
  })

  it('reads a 縦中横 run whose digits are unrotated', () => {
    // 세로쓰기 안의 숫자만 무회전인 표기(표제란 전화번호가 이 형태다) —
    // 회전 유무로 대역을 가르면 이 런은 어느 패스에서도 이어지지 않는다
    const items = [...'03-1234-5678'].map((str, index) => ({
      str,
      x: 100,
      y: 100 + index * 10,
      w: 8,
      h: 8,
      ...(/\d/.test(str) ? {} : { rot: -90 }),
    }))

    expect(
      joinedColumns(items).some((text) =>
        /\d{2,4}-\d{3,4}-\d{4}/.test(text),
      ),
    ).toBe(true)
  })
})
