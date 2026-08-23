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
    file: 'yokohama-p7.json',
    cacheFile: 'dwg-yokohama.pdf',
    sha256: '37d20dbab2dec0721d77ed9dfce74cce6685cd9c9f2e34fec4f346bf5d2e237b',
    page: 7,
    // 伏図 픽스처 — 断面リスト가 아니라 형상(通り芯·부재 배치)의 근거다 (ADR-030)
    needles: [['2階床伏図'], ['bX1'], ['bY6'], ['8700'], ['G51']],
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
/**
 * 스캔 대상을 半角으로 접는다. 마커마다 全角 이형을 나열하는 방식은 반드시 하나를
 * 빠뜨린다 — CP932의 0x815C·0x817C만 해도 U+2014·U+2015·U+2212로 갈리고, 하나라도
 * 빠지면 그 표기의 연락처가 조용히 통과한다. NFKC가 ０-９·＠·．·ＴＥＬ·全角ハイフン
 * (U+FF0D)·半角長音(U+FF70→U+30FC)까지 접으므로, 남는 것은 하이픈류 통일뿐이다.
 *
 * 접는 방식 자체는 프로덕션 파서(`normalized`, src/lib/import/section-list/parse.ts)와
 * 같지만 문자 집합은 **같지 않다** — 프로덕션은 U+2015(―)와 U+30FC(ー)가 빠져 있다.
 * 여기서는 둘 다 넣는다. 스캐너는 놓치면 PII가 커밋되고, 파서는 놓쳐도 빈칸+원문
 * 표시로 정직하게 실패하므로 요구 수준이 다르다.
 */
function normalizedForScan(text: string): string {
  return text.normalize('NFKC').replace(/[‐‑‒–—―−ー]/g, '-')
}

// 마커는 半角으로 적는다 — 스캔 대상이 이미 접혀 있다. 세로 재구성 테스트도 이
// 상수를 함께 쓴다: 검증 정규식이 갈라지면 「이어붙였다」와 「걸린다」가 다른
// 것을 말하게 된다
const PHONE_PATTERN = /\d{2,4}-\d{3,4}-\d{4}/

const PII_MARKERS: Array<[string, RegExp]> = [
  // 全角 분기는 두지 않는다 — 스캔 대상이 이미 NFKC로 접혀 ＴＥＬ은 TEL로 온다
  ['連絡先', /TEL|FAX|〒/i],
  ['電話番号', PHONE_PATTERN],
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

function rowGroups(
  items: TextItemFixture['items'],
): Array<TextItemFixture['items']> {
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

  return rows.map(({ items: rowItems }) => rowItems)
}

function joinedRows(items: TextItemFixture['items']): string[] {
  return rowGroups(items).map((rowItems) =>
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
  const clusters = horizontalClusters(items)

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
    // 위 분할은 서로소라 한 런에 회전·무회전이 섞이면 어느 패스에서도 이어지지
    // 않는다. 원본 전체를 잇는 패스를 덧붙여 진짜 superset으로 만든다 —
    // 오탐은 사람이 한 번 보면 끝나지만 누락은 PII가 그대로 커밋된다
    ...columnRuns(items, true),
    ...columnRuns(items, false),
    // 그래도 縦中横은 남는다 — 글자마다 x가 갈려 열 키가 x인 패스로는 한 칸도
    // 이어지지 않는다. 가로 덩이로 묶은 뒤 그 중심 x로 다시 잇는다
    ...columnRuns(clusters, true),
    ...columnRuns(clusters, false),
  ]
}

/**
 * 같은 y에 가로로 붙은 글자를 한 덩이로 묶어 「중심 x를 가진 한 아이템」으로 만든다.
 * 縦中横(세로쓰기 안에서 숫자만 가로로 눕는 표기 — 표제란 전화번호가 이 형태다)은
 * 세로줄 중심에 맞춰 놓이므로, 덩이의 중심 x가 같은 줄 회전 글자의 x와 겹친다
 * (kani-p38 실측: 「F2H」 중심 942.91 대 회전 열 943, 「75」 365.02 대 365).
 */
function horizontalClusters(
  items: TextItemFixture['items'],
): TextItemFixture['items'] {
  const clusters: TextItemFixture['items'] = []

  for (const rowItems of rowGroups(items)) {
    const sorted = [...rowItems].sort((left, right) => left.x - right.x)
    let current: TextItemFixture['items'] = []

    const flush = () => {
      if (current.length === 0) return
      const start = Math.min(...current.map(({ x }) => x))
      const end = Math.max(...current.map((item) => item.x + horizontalWidth(item)))
      clusters.push({
        str: current.map(({ str }) => str).join(''),
        x: (start + end) / 2,
        y: current[0].y,
        w: end - start,
        h: Math.max(...current.map(({ h }) => h)),
      })
      current = []
    }

    for (const item of sorted) {
      const previous = current[current.length - 1]
      // 한 글자 폭보다 벌어지면 다른 덩이다 — 같은 행의 무관한 글자까지 이으면
      // 중심이 뭉개져 어느 세로줄에도 붙지 않는다(그건 이미 joinedRows가 본다)
      const separated =
        previous !== undefined &&
        item.x - (previous.x + horizontalWidth(previous)) >
          Math.max(horizontalWidth(previous), horizontalWidth(item))
      if (separated) flush()
      current.push(item)
    }
    flush()
  }

  return clusters
}

/**
 * 회전 글자의 w는 세로 방향 이동량이라 가로 폭이 아니다 — 그대로 더하면 중심이
 * 밀려 같은 세로줄의 덩이와 열이 갈린다.
 */
function horizontalWidth(item: TextItemFixture['items'][number]): number {
  return item.rot !== undefined && item.rot !== 0 ? 0 : item.w
}

function columnRuns(
  items: TextItemFixture['items'],
  upward: boolean,
): string[] {
  // 정수 반올림 버킷은 값이 경계에 걸리면 같은 세로줄을 갈라놓는다 — 회전 글자
  // x와 덩이 중심의 실측 어긋남은 0.1pt 미만이지만 그 사이에 정수 경계가 있는지는
  // 운이다. x 오름차순 앵커 체인은 그 경계를 없앤다: 입력 순서(PDF 원본 순서)에
  // 좌우되지 않고 열 폭도 앵커+허용오차로 갇힌다.
  // 다만 앵커 체인은 반올림 묶음의 초집합이 **아니다** — 왼쪽 1pt 안에 무관한
  // 글자가 하나 있으면 앵커가 그리로 끌려가 뒤쪽이 갈린다(99.0·99.6·100.4에서
  // 반올림은 뒤 둘을 함께 100에 넣지만 앵커는 99.6까지만 묶는다). 어느 쪽도
  // 서로를 포함하지 않으므로 둘 다 낸다 — 누락은 PII가 그대로 커밋된다
  const columnTolerancePt = 1
  const anchored = new Map<number, TextItemFixture['items']>()
  const rounded = new Map<number, TextItemFixture['items']>()
  let anchor: number | undefined

  for (const item of [...items].sort((left, right) => left.x - right.x)) {
    if (anchor === undefined || item.x - anchor > columnTolerancePt) {
      anchor = item.x
    }
    anchored.set(anchor, [...(anchored.get(anchor) ?? []), item])

    const key = Math.round(item.x)
    rounded.set(key, [...(rounded.get(key) ?? []), item])
  }

  return [...anchored.values(), ...rounded.values()].flatMap((columnItems) => {
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
    const scanned = [...rows, ...joinedColumns(fixture.items)].map(
      normalizedForScan,
    )
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

  it('keeps the rounded grouping that the anchor chain would split', () => {
    // 앵커 체인은 왼쪽 1pt 안의 무관한 글자에 끌려간다 — 99.0이 앵커가 되면
    // 99.6까지만 묶여 100.4가 떨어져 나간다. 반올림은 99.6과 100.4를 함께
    // 100에 넣는다. 어느 쪽도 서로를 포함하지 않으므로 둘 다 내야 한다
    const items = [
      { str: 'X', x: 99.0, y: 210, w: 8, h: 8, rot: -90 },
      { str: 'T', x: 99.6, y: 200, w: 8, h: 8, rot: -90 },
      { str: 'E', x: 100.4, y: 190, w: 8, h: 8, rot: -90 },
      { str: 'L', x: 100.4, y: 180, w: 8, h: 8, rot: -90 },
    ]

    expect(joinedColumns(items)).toContain('TEL')
  })

  it('joins a drifting column that stays inside the tolerance', () => {
    // 앵커 체인이 하는 일 자체를 못박는다 — 0.4pt씩 밀리는 세로줄은 정수
    // 경계(100.5, 100.4와 100.8 사이)를 넘어가므로 반올림 버킷만으로는 갈린다.
    // 입력 순서를 뒤집어도 같은 문자열이 나와야 한다
    const items = [
      { str: 'T', x: 100.4, y: 200, w: 8, h: 8, rot: -90 },
      { str: 'E', x: 100.8, y: 190, w: 8, h: 8, rot: -90 },
      { str: 'L', x: 101.2, y: 180, w: 8, h: 8, rot: -90 },
    ]

    expect(joinedColumns(items)).toContain('TEL')
    expect(joinedColumns([...items].reverse())).toContain('TEL')
  })

  it('groups columns identically however the items are ordered', () => {
    // 픽스처의 아이템 순서는 PDF 원본 순서라 x 정렬이 아니다. 「먼저 만들어진
    // 열」에 붙이면 같은 세로줄이 삽입 순서에 따라 다르게 갈려, 어떤 도면에서는
    // 이어지고 어떤 도면에서는 끊긴다 — 끊긴 쪽은 PII가 그대로 통과한다.
    // 여기서 보는 것은 「같은 분할이 나오는가」다. 결합 자체는 위 케이스가
    // 못박는다 — 순서 의존은 드리프트가 허용오차를 넘을 때만 드러나는데 그
    // 구간에서는 어느 묶기로도 런이 이어지지 않아 한 케이스로 둘 다 볼 수 없다
    const items = [
      { str: 'T', x: 100, y: 200, w: 8, h: 8, rot: -90 },
      { str: 'E', x: 100.9, y: 190, w: 8, h: 8, rot: -90 },
      { str: 'L', x: 101.7, y: 180, w: 8, h: 8, rot: -90 },
    ]

    const forward = joinedColumns(items)
    expect(forward.length).toBeGreaterThan(0)
    expect([...joinedColumns([...items].reverse())].sort()).toEqual(
      [...forward].sort(),
    )
  })

  it('catches 全角 contact strings that half-width markers would miss', () => {
    // 마커마다 全角 이형을 나열하는 방식은 반드시 하나를 빠뜨린다 — CP932의
    // 0x815C·0x817C만 해도 U+2014·U+2015·U+2212로 갈린다. 마커는 半角으로 두고
    // 스캔 대상을 정규화한다(프로덕션 파서의 `normalized`와 같은 방식)
    const samples = [
      '０３－１２３４－５６７８', // 全角ハイフンマイナス U+FF0D
      '０３—１２３４—５６７８', // em dash U+2014
      '０３−１２３４−５６７８', // minus sign U+2212
      '０３–１２３４–５６７８', // en dash U+2013
      '０３ｰ１２３４ｰ５６７８', // 半角長音 U+FF70
      'ａｂｃ＠ｘｘ．ｃｏ．ｊｐ', // 全角 메일 주소
      'ＴＥＬ ０３（１２３４）５６７８', // 全角 라벨 — 마커에 全角 분기가 없어도 걸린다
    ]

    samples.forEach((sample, index) => {
      const scanned = normalizedForScan(sample)
      expect(
        PII_MARKERS.some(([, pattern]) => pattern.test(scanned)),
        `全角 sample #${index} slipped through`,
      ).toBe(true)
    })
  })

  it('joins a rotated column that holds a single unrotated glyph', () => {
    // 회전·무회전을 섞은 전수 패스를 고정한다. 무회전 글자 하나는 덩이 중심이
    // x+w/2로 밀려 덩이 패스로는 회전 열에 붙지 않고, 회전/무회전 전용 패스는
    // 서로소라 어느 쪽도 잇지 못한다 — 전수 패스를 지우면 이 케이스가 깨진다
    const items = [
      ...[...'TE'].map((str, index) => ({
        str,
        x: 100,
        y: 200 - index * 10,
        w: 8,
        h: 8,
        rot: -90,
      })),
      { str: 'L', x: 100, y: 180, w: 8, h: 8 },
    ]

    expect(joinedColumns(items)).toContain('TEL')
  })

  it('reads a 縦中横 run whose digits sit horizontally', () => {
    // 세로쓰기 안의 숫자만 가로로 눕는 표기(표제란 전화번호가 이 형태다).
    // 숫자는 글자마다 x가 갈린 채 세로줄 중심에 맞춰 놓인다 — 열 키가 글자 x인
    // 패스로는 한 칸도 이어지지 않는다. 숫자를 같은 x에 세로로 쌓아 두면 이
    // 배치를 재현하지 못해 테스트가 통과해도 방어선이 없다
    const lineX = 100.4
    const digits = (text: string, y: number) =>
      [...text].map((str, index) => ({
        str,
        x: lineX - (text.length * 5) / 2 + index * 5,
        y,
        w: 5,
        h: 10,
      }))
    // 회전 글자의 w는 세로 방향 이동량이라 x가 곧 세로줄 중심이다. 덩이 중심과는
    // 0.2pt 어긋나 있고 그 사이에 정수 경계가 있다 — 실측에서도 어긋남은 0.1pt
    // 미만이었으므로, 열 키를 정수로 반올림하면 이 런은 운에 따라 끊긴다
    const separator = (y: number) => ({
      str: '-',
      x: lineX + 0.2,
      y,
      w: 10,
      h: 10,
      rot: -90,
    })
    const items = [
      ...digits('03', 100),
      separator(110),
      ...digits('1234', 120),
      separator(130),
      ...digits('5678', 140),
    ]

    // 스캔과 같은 규칙으로 본다 — 접기를 건너뛰면 「이어붙였다」와 「걸린다」가
    // 다른 것을 말하게 된다
    expect(
      joinedColumns(items)
        .map(normalizedForScan)
        .some((text) => PHONE_PATTERN.test(text)),
    ).toBe(true)
  })
})
