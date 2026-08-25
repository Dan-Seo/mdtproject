import { describe, expect, it } from 'vitest'

import {
  axisLabels,
  dimensionTexts,
  parseGrid,
} from '@/lib/import/plan/grid-parse'
import type { GridCandidate } from '@/lib/import/plan/types'
import type { TextItem } from '@/lib/import/types'

const glyph = (str: string, x: number, y: number, h = 8): TextItem => ({
  str,
  x,
  y,
  w: 5,
  h,
})

const rotGlyph = (str: string, x: number, y: number): TextItem => ({
  str,
  x,
  y,
  w: 5,
  h: 8,
  rot: -90,
})

describe('axisLabels', () => {
  it('X通り・Y通り のラベルを軸と番号に分けて読む', () => {
    const items = [
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      glyph('X', 200, 40),
      glyph('2', 205, 40),
      glyph('Y', 40, 300),
      glyph('1', 45, 300),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
      { label: 'X2', axis: 'X', index: 2, positionPt: 205 },
      { label: 'Y1', axis: 'Y', index: 1, positionPt: 296 },
    ])
  })

  it('通り芯でない文字列は拾わない', () => {
    const items = [
      glyph('F', 100, 40),
      glyph('C', 105, 40),
      glyph('1', 110, 40),
    ]

    expect(axisLabels(items)).toEqual([])
  })

  it('Y通りラベルと同じ行に高さ・yの違う文字列が混ざっても、ラベル自身の字形だけで中心を測る', () => {
    const items = [
      glyph('Y', 40, 300),
      glyph('1', 45, 300),
      // 部材符号など無関係な文字列。recoverRows の許容誤差(tolerance = min(8,20)*0.3 = 2.4)
      // 内の y=302 で同じ行に混ざり、行の高さ集計を 8→20 に引き上げる。x が離れているので
      // makeSegments では別セグメントになる — row.y・row.height を使うと Y1 の中心が
      // このセグメントに引きずられることを検出する
      glyph('G1', 140, 302, 20),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'Y1', axis: 'Y', index: 1, positionPt: 296 },
    ])
  })

  it('같은 라벨이 도면 양 끝(위·아래)에 같은 위치로 중복 인쇄돼도 하나로 접는다', () => {
    const items = [
      // 위쪽 X1
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      // 아래쪽 X1 — 같은 통り芯이므로 x는 같고 y만 다르다
      glyph('X', 100, 800),
      glyph('1', 105, 800),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
    ])
  })

  it('같은 라벨의 중복 인쇄가 허용오차 밖에서 어긋나면 그 라벨은 통째로 버리고, 다른 라벨은 영향받지 않는다', () => {
    const items = [
      // X1 — 위·아래가 20pt 어긋난다(런 재조립이 다른 격자선을 잘못 묶었다고 가정)
      glyph('X', 100, 40),
      glyph('1', 105, 40),
      glyph('X', 120, 800),
      glyph('1', 125, 800),
      // X2 — 한 번만 나오므로 영향받지 않고 그대로 남는다
      glyph('X', 200, 40),
      glyph('2', 205, 40),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X2', axis: 'X', index: 2, positionPt: 205 },
    ])
  })

  it('라벨용 문턱을 좁혀, 기본 배수(2.2)라면 붙어버릴 라벨 사이 간격(약10pt)도 갈라 읽는다', () => {
    const h = 14.16 // kani 실측 글자 높이(ADR-030)에 근접한 값
    const items = [
      glyph('X', 100, 40, h),
      glyph('1', 105, 40, h),
      // 다음 라벨과의 간격 10pt — 기본 배수(문턱 ≈31pt)라면 한 세그먼트로
      // 붙어 compact가 "X1X2"가 되고, AXIS_LABEL(^([XY])(\d{1,2})$)이 그 통짜
      // 문자열을 거절한다 — ADR-030③의 표기 흔들림 거절과 같은 계열의 실패
      glyph('X', 120, 40, h),
      glyph('2', 125, 40, h),
    ]

    expect(axisLabels(items)).toEqual([
      { label: 'X1', axis: 'X', index: 1, positionPt: 105 },
      { label: 'X2', axis: 'X', index: 2, positionPt: 125 },
    ])
  })
})

describe('dimensionTexts', () => {
  it('横書きの寸法をコンマを外して mm で読む', () => {
    const items = [
      glyph('6', 100, 500),
      glyph(',', 105, 500),
      glyph('0', 110, 500),
      glyph('0', 115, 500),
      glyph('0', 120, 500),
    ]

    expect(dimensionTexts(items)).toEqual([
      { valueMm: 6000, positionPt: 112.5, axis: 'X' },
    ])
  })

  it('回転した寸法を Y軸として読む', () => {
    // 読み順は y 降順 — 先頭の '1' が一番下(y が最大)に来る。
    // 字送りは w ちょうど: toTextItems が同じ pdf.js アイテムの文字を
    // `y + directionY * characterWidth * index` で置き、その characterWidth を
    // そのまま w に載せる — つまり1トークン内部の原点間隔は**構造上** 1w だ
    // (実測でも回転文字列 307ペアが例外なく 1.0000)。前の版は原点を8刻みに
    // 置きながら w=5 のままで、一つの pdf.js アイテムでは起こりえない 1.6w
    // だった。
    // positionPt は verticalRuns の y ＝ バウンディングボックスの縦中心
    // （原点だけの平均ではない — runs.ts の VerticalRun.y 規約参照）。
    // 原点: 120,115,110,105,100,95(各 w=5) → 真の下限は 95-5=90、上限は 120。
    // positionPt = (90+120)/2 = 105
    const items = [
      rotGlyph('1', 40, 120),
      rotGlyph('0', 40, 115),
      rotGlyph(',', 40, 110),
      rotGlyph('5', 40, 105),
      rotGlyph('0', 40, 100),
      rotGlyph('0', 40, 95),
    ]

    expect(dimensionTexts(items)).toEqual([
      { valueMm: 10500, positionPt: 105, axis: 'Y' },
    ])
  })

  it('세로 치수 두 값이 정확히 2w 간격이어도 붙지 않는다 — 붙으면 "15050"이 지어낸 값이 된다', () => {
    // kani-p38 실측(x≈1625.92): 토큰 내부 글자 간격은 정확히 1w, 토큰 사이는
    // 정확히 2w다. 폐기한 옛 기본값 2는 문턱이 딱 2w라 이 경계가 부동소수 잔차
    // 1 ULP로 갈렸다 — 실측에서는 gap이 문턱보다 5.7e-14 커서 우연히 갈렸다.
    // 부호가 뒤집히면(다른 pdf.js 빌드·viewport·픽스처 재생성) 「150」+「50」이
    // 「15050」로 붙고, 그 통짜 문자열이 DIMENSION(\d{3,5})을 **통과해** 도면에
    // 없는 값이 후보 풀에 들어간다. 거절이 아니라 날조라서 이 프로젝트가 못
    // 견디는 실패다. 지금 기본값은 창 (1w, 2w)의 한가운데인
    // `VERTICAL_RUN_GAP_RATIO`(1.5)다.
    const items = [
      // 아래에서 위로 읽는다(y 내림차순). 「150」 — 글자 간격 5 ＝ 1w
      rotGlyph('1', 40, 200),
      rotGlyph('5', 40, 195),
      rotGlyph('0', 40, 190),
      // 다음 토큰까지 간격 10 ＝ 2w
      rotGlyph('5', 40, 180),
      rotGlyph('0', 40, 175),
    ]

    // 「50」은 2자리라 DIMENSION이 거절한다 — 남는 것은 150 하나뿐이고,
    // 15050은 어디에도 없어야 한다.
    // 「150」의 바운딩 박스: 원점 200·195·190, 앞쪽 끝은 190-5=185 → (185+200)/2
    expect(dimensionTexts(items)).toEqual([
      { valueMm: 150, positionPt: 192.5, axis: 'Y' },
    ])
  })

  it('세로 치수가 2w 간격으로 붙으면 축 전체가 조용히 죽는다 — 갈라 읽는다', () => {
    // 위와 같은 2w 경계인데 이번엔 두 값 다 정상 치수다. 붙으면
    // 「6,00010,500」이 되어 DIMENSION이 통째로 거절 → Y축 후보가 0개가 되고,
    // ADR-030③의 合計 대조는 「합이 안 맞는다」가 아니라 「값이 없다」로만 실패한다.
    const items = [
      // 「6,000」 — 원점 300·295·290·285·280, 앞쪽 끝 280-5=275 → (275+300)/2
      rotGlyph('6', 40, 300),
      rotGlyph(',', 40, 295),
      rotGlyph('0', 40, 290),
      rotGlyph('0', 40, 285),
      rotGlyph('0', 40, 280),
      // 간격 10 ＝ 2w
      // 「10,500」 — 원점 270..245, 앞쪽 끝 245-5=240 → (240+270)/2
      rotGlyph('1', 40, 270),
      rotGlyph('0', 40, 265),
      rotGlyph(',', 40, 260),
      rotGlyph('5', 40, 255),
      rotGlyph('0', 40, 250),
      rotGlyph('0', 40, 245),
    ]

    expect(dimensionTexts(items)).toEqual([
      { valueMm: 6000, positionPt: 287.5, axis: 'Y' },
      { valueMm: 10500, positionPt: 255, axis: 'Y' },
    ])
  })

  it('合計が6桁の図面でも合計を拾う — 100m級の建物で軸ごと落ちない', () => {
    // 上限を5桁に切ると、合計が「120,000」の図面は合計そのものが候補プールに
    // 入らない。ADR-030③ の自己検算は合計と突き合わせる装置なので、合計が
    // 拾えないとその軸は**原理的に**成立しない — スパン値を全部読めていても
    // 候補が0本になる。「読めない」ではなく「読めるのに落とす」失敗だ。
    const text = '120,000'
    const items = [...text].map((char, index) => glyph(char, 100 + index * 5, 500))

    expect(dimensionTexts(items)).toEqual([
      { valueMm: 120000, positionPt: 117.5, axis: 'X' },
    ])
  })

  it('コンマのない6桁は拒否する — それは癒着が作る形だからだ', () => {
    // 6桁を開けるのはコンマがあるときだけだ。コンマなしの6桁は、隣り合う
    // 二つの寸法が一つのセグメントに癒着したときにちょうど出る形
    // (「150」＋「050」→「150050」)であって、図面に書かれた値ではない。
    // 上限を「桁数」ではなく「コンマの有無」で引くのが要点だ。
    const merged = ['150050', '1506,000', '6,0007,000']

    for (const text of merged) {
      const items = [...text].map((char, index) =>
        glyph(char, 100 + index * 5, 500),
      )
      expect({ text, found: dimensionTexts(items) }).toEqual({ text, found: [] })
    }
  })

  it('寸法に見えない数字は拾わない', () => {
    // 3桁未満は部材符号の枝番や階数であって寸法ではない
    const items = [glyph('2', 100, 500), glyph('F', 105, 500)]

    expect(dimensionTexts(items)).toEqual([])
  })

  it('0mm になる文字列は寸法として拾わない', () => {
    // 「000」「00000」「0,000」はどれも DIMENSION の形に合うが値は 0 だ。
    // 0 が候補プールに入ると ADR-030③ の合計照合が壊れる — 部分和 S に対して
    // S ∪ {0} も同じ合計になるので、「合計と合う組み合わせは一つ」という
    // 一意性が消える。拾わないのが正しい。
    const zeros = ['000', '00000', '0,000']

    for (const text of zeros) {
      const items = [...text].map((char, index) =>
        glyph(char, 100 + index * 5, 500),
      )
      expect(dimensionTexts(items)).toEqual([])
    }
  })

  it('隣り合う二つの寸法値が一つのセグメントに癒着しない(gapRatio を狭めた効果)', () => {
    // 基本倍率(2.2, h=14.16 で閾値≈31pt)なら二値の間隔10ptは癒着し、
    // "6,0007,000" になって DIMENSION が丸ごと拒否する — ADR-030③と同じ
    // 失敗系列。ラベル用に狭めた倍率(0.5, 閾値≈7.08pt)を寸法にも使うことで
    // 各値の内部(間隔0)は保ったまま値どうしは割る。
    const h = 14.16
    const items = [
      glyph('6', 100, 500, h),
      glyph(',', 105, 500, h),
      glyph('0', 110, 500, h),
      glyph('0', 115, 500, h),
      glyph('0', 120, 500, h), // ここまでで "6,000"、endX=125
      // 次の値まで間隔10pt(135-125)
      glyph('7', 135, 500, h),
      glyph(',', 140, 500, h),
      glyph('0', 145, 500, h),
      glyph('0', 150, 500, h),
      glyph('0', 155, 500, h),
    ]

    expect(dimensionTexts(items)).toEqual([
      { valueMm: 6000, positionPt: 112.5, axis: 'X' },
      { valueMm: 7000, positionPt: 147.5, axis: 'X' },
    ])
  })
})

/**
 * 라벨 문자열 하나를 横書き로 놓는다. 字送り는 glyph의 w(5)와 같아 한 세그먼트로
 * 붙는다 — 세그먼트 중심은 (x, x + 5·글자수)의 중점이다.
 */
const horizontal = (text: string, x: number, y: number): TextItem[] =>
  [...text].map((character, index) => glyph(character, x + index * 5, y))

/**
 * 回転寸法(rot=-90) 하나. 読み順은 y 내림차순이고 字送り는 정확히 1w다
 * (`toTextItems`의 규약 — dimensionTexts 테스트의 주석 참고).
 */
const vertical = (text: string, x: number, topY: number): TextItem[] =>
  [...text].map((character, index) => rotGlyph(character, x, topY - index * 5))

/**
 * X1..Xn 라벨과 그 사이의 스팬 寸法·合計寸法을 늘어놓은 최소 伏図.
 * 라벨은 x=100부터 100pt 간격(중심 105·205·…), 스팬 寸法은 두 라벨 사이에 쓴다.
 * 合計는 도면 전폭을 걸치는 치수선이라 왼쪽 끝에서 시작한다 — 그 결과 合計의
 * 중심이 **첫 스팬 구간 안에 들어앉는다**(kani-p38 실측에서 20,000이 X2~X3
 * 구간에 있는 것과 같은 모양이다).
 */
function xAxisItems(spans: number[], total: number): TextItem[] {
  const items: TextItem[] = []

  spans.forEach((span, index) => {
    items.push(...horizontal(`X${index + 1}`, 100 + index * 100, 40))
    items.push(
      ...horizontal(span.toLocaleString('en-US'), 140 + index * 100, 500),
    )
  })
  items.push(...horizontal(`X${spans.length + 1}`, 100 + spans.length * 100, 40))
  items.push(...horizontal(total.toLocaleString('en-US'), 100, 560))

  return items
}

function candidateOf(items: TextItem[], axis: 'X' | 'Y'): GridCandidate {
  const found = parseGrid(items).find((entry) => entry.axis === axis)
  expect(found, `missing axis: ${axis}`).toBeDefined()
  return found as GridCandidate
}

describe('parseGrid', () => {
  it('ラベルと寸法が噛み合えば取り込める候補を返す', () => {
    const candidate = candidateOf(xAxisItems([6000, 6000, 8000], 20000), 'X')

    expect(candidate.issues).toEqual([])
    expect(candidate.spansMm).toEqual([6000, 6000, 8000])
    expect(candidate.totalMm).toBe(20000)
    expect(candidate.labels.map((label) => label.label)).toEqual([
      'X1',
      'X2',
      'X3',
      'X4',
    ])
  })

  it('スパンの和が合計寸法と違えば値を出さずに理由を返す', () => {
    // 8,000 と書いてあるべき所を 8,500 と読んだ場合 — 合計 20,000 と合わない。
    // **値は一つも返さない**。読めた3本のうちどれが誤読かは判らないので、
    // 部分的に正しそうな並びを返すのは「作らずに拒む」を破る (ADR-030③)。
    const candidate = candidateOf(xAxisItems([6000, 6000, 8500], 20000), 'X')

    expect(candidate.issues).toEqual(['合計寸法不一致'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
  })

  it('隣り合う2本の通り芯の間に寸法が一つも無ければ理由を返す', () => {
    // 2番目・3番目のスパン寸法を落とす(x≥240 の寸法行)
    const items = xAxisItems([6000, 6000, 8000], 20000).filter(
      (item) => item.y !== 500 || item.x < 240,
    )

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual(['寸法本数不一致'])
    expect(candidate.spansMm).toEqual([])
  })

  it('ラベルが1本しかなければスパンを定義できない', () => {
    const candidate = candidateOf(horizontal('X1', 100, 40), 'X')

    expect(candidate.issues).toEqual(['通り芯ラベル不足'])
    expect(candidate.labels.map((label) => label.label)).toEqual(['X1'])
  })

  it('区間の外の寸法は無視し、区間の中の余分な寸法も合計が退ける', () => {
    // kani-p38 실측의 모양 그대로다: X1~X2 구간에 스팬(6,000) 말고도 3,700·2,400이
    // 들어와 있고, 라벨 범위 밖에는 部材 치수가 30건 널려 있다.
    const items = [
      ...xAxisItems([6000, 6000, 8000], 20000),
      ...horizontal('2,400', 160, 620), // X1~X2 구간 안(중심 172.5)의 노이즈
      ...horizontal('1,900', 600, 620), // 라벨 범위 밖(중심 612.5)의 노이즈
    ]

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual([])
    expect(candidate.spansMm).toEqual([6000, 6000, 8000])
  })

  it('合計と合う並びが2通りあれば、どちらかを選ばずに理由を返す', () => {
    // 2,000+3,000 と 3,000+2,000 のどちらも合計 5,000 に合う。位置で絞っても
    // 一意にならない場合で、**選べば作ったことになる**ので選ばない (ADR-030③)。
    const items = [
      ...horizontal('X1', 100, 40),
      ...horizontal('X2', 200, 40),
      ...horizontal('X3', 300, 40),
      ...horizontal('2,000', 140, 500), // X1~X2
      ...horizontal('3,000', 160, 520), // X1~X2
      ...horizontal('3,000', 240, 500), // X2~X3
      ...horizontal('2,000', 260, 520), // X2~X3
      ...horizontal('5,000', 100, 560), // 合計
    ]

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual(['寸法組合せ不定'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
  })

  it('ラベルがちょうど2本(スパン1本)なら、合計寸法の有無に関わらず検算は成立しない', () => {
    // スパンが1本のとき「和 ＝ 合計」は**何も確かめない** — その1本自身を合計と
    // 読めばいつでも合う(区間数不足)。合計を別に書かなくても同じだ。
    const candidate = candidateOf(
      [
        ...horizontal('X1', 100, 40),
        ...horizontal('X2', 200, 40),
        ...horizontal('6,000', 140, 500),
      ],
      'X',
    )

    expect(candidate.issues).toEqual(['区間数不足'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
  })

  it('合計寸法を別に書いても、スパンが1本の軸は取り込めない — 検算が空洞化する穴(独立リビュー 🔴1)', () => {
    // 以前はこの形(スパンと別の一本として合計が書かれている)を「取り込める」と
    // していたが、それ自体が検算の抜け穴だった。この1本を合計と読めば常に
    // 和＝合計になる — 別の場所に同じ値がもう一本あるかどうかは無関係で、
    // 実測でも起きた: yokohama-p14 は断面リストの頁なのに符号 X2・X3 が
    // ラベルに見え、区間内の 900 を合計と読めば「X2~X3 は 900mm」という
    // **図面に無い格子**が一つ出来上がっていた(リビューアが実図面の 900 の
    // 重複で、コントローラーが合成入力で、それぞれ独立に再現した)。
    // 「別の一本」を要求する writtenAsTotal ガードでは閉じない — ここでは
    // 6,000 が軸上にもう一本ある(=合計として「書かれている」体裁)が、
    // それでも区間数不足で値を出さない。
    const candidate = candidateOf(
      [
        ...horizontal('X1', 100, 40),
        ...horizontal('X2', 200, 40),
        ...horizontal('6,000', 140, 500), // スパン
        ...horizontal('6,000', 140, 560), // 別の一本として書かれた「合計」
        ...horizontal('6,000', 600, 620), // ラベル範囲外の重複 — どこでもよい
      ],
      'X',
    )

    expect(candidate.issues).toEqual(['区間数不足'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
  })

  it('Y通りは位置順とラベル番号順が逆でも、位置順のスパンとして読む', () => {
    // +y が下なので、図面の上から Y3・Y2・Y1 と並ぶ(kani-p38 実測)。
    // ラベル番号で並べ替えると 6,000 と 10,500 が入れ替わる。
    const items = [
      ...horizontal('Y1', 40, 800), // 中心 796
      ...horizontal('Y2', 40, 500), // 中心 496
      ...horizontal('Y3', 40, 300), // 中心 296
      ...vertical('6,000', 200, 410), // 中心 397.5 — Y3~Y2
      ...vertical('16,500', 200, 575), // 中心 560 — 合計。Y2~Y1 の中に居る
      ...vertical('10,500', 200, 655), // 中心 640 — Y2~Y1
    ]

    const candidate = candidateOf(items, 'Y')
    expect(candidate.issues).toEqual([])
    expect(candidate.spansMm).toEqual([6000, 10500])
    expect(candidate.totalMm).toBe(16500)
    expect(candidate.labels.map((label) => label.label)).toEqual([
      'Y3',
      'Y2',
      'Y1',
    ])
  })

  it('プールの最大値がノイズなら、その軸は丸ごと拒む — 作るよりは拒む', () => {
    // 合計はプールの最大値だと見る(Ruling 6)。スパンより大きな部材寸法などが
    // 混ざればその値が合計に化け、スパンの和と合わなくなる。**拒否であって
    // 捏造ではない**ので、この向きに倒れるのは正しい。
    const items = [
      ...xAxisItems([6000, 6000, 8000], 20000),
      ...horizontal('99,000', 600, 620), // ラベル範囲外の巨大なノイズ
    ]

    expect(candidateOf(items, 'X').issues).toEqual(['合計寸法不一致'])
  })

  it('区間内に唯一ある寸法が合計除外フィルタで弾かれても、理由は「本数不一致」であって「合計不一致」ではない(独立リビュー 🟡3)', () => {
    // 区間1(X1~X2)の唯一の候補が合計(＝プール最大値)と同値で、別の一本として
    // 書かれていない(writtenAsTotal===1)場合、除外フィルタを通すとその区間の
    // usable が空になる。フィルタを掛ける**前**に「区間(inside)が空でない」だけ
    // 見ていた旧実装は、これを素通りさせて最後に DP が失敗し、見当違いの理由
    // (合計寸法不一致)を返していた。
    const items = [
      ...horizontal('X1', 0, 40),
      ...horizontal('X2', 2000, 40),
      ...horizontal('X3', 4000, 40),
      ...horizontal('5000', 800, 500), // 区間1の唯一の候補 — かつプール最大値
      ...horizontal('3000', 2800, 500), // 区間2
    ]

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual(['寸法本数不一致'])
    expect(candidate.spansMm).toEqual([])
  })

  it('部分和の状態数が上限を超えたら、部分結果を返さずに即座に打ち切る(独立リビュー 🔴2)', () => {
    // MAX_REACH_STATES(=10,000)の実測根拠は grid-parse.ts のコメント参照。
    // ラベルを3本(区間2つ)にする — ラベル2本(区間数不足)の早期リジェクトを
    // 迂回するためだ。区間1に100種、区間2に150種の値を離して置くと組み合わせが
    // 最大100×150=15,000通りになり上限(10,000)を超える。
    const items: TextItem[] = [
      ...horizontal('X1', 0, 40),
      ...horizontal('X2', 20000, 40),
      ...horizontal('X3', 50000, 40),
    ]
    for (let i = 0; i < 100; i += 1) {
      items.push(...horizontal(String(1000 + i * 900), 100 + i * 50, 500))
    }
    for (let j = 0; j < 150; j += 1) {
      items.push(...horizontal(String(100 + j), 25000 + j * 50, 500))
    }

    const start = performance.now()
    const candidate = candidateOf(items, 'X')
    const elapsedMs = performance.now() - start

    expect(candidate.issues).toEqual(['計算量超過'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
    expect(elapsedMs).toBeLessThan(1000)
  })

  it('曖昧さが最後の区間ではなく途中の区間で生じても、前方に伝播する(独立リビュー 🟡4)', () => {
    // 既存の曖昧テストは2区間で、最終合流でしか曖昧さを検知しない —
    // `count: Math.min(2, state.count)` を `count: 1` に変えても、その変異は
    // 「新しい和を初めて作るとき」にしか効かないので見逃す。ここでは3区間目
    // (X3~X4)で新しい和(7,500)へ移る際に、2区間目(X2~X3)で既に曖昧になった
    // 状態(count=2, 経路 [1,000+6,000] と [4,000+3,000] がどちらも7,000)が
    // そのまま運ばれることを確かめる。
    //   区間1(X1~X2): 1,000 / 4,000
    //   区間2(X2~X3): 3,000 / 6,000 → 1,000+6,000 と 4,000+3,000 がどちらも 7,000
    //   区間3(X3~X4): 500 → 7,000+500=7,500 に曖昧さがそのまま運ばれる
    //   合計: 7,500(ラベル範囲外に書く)
    const items = [
      ...horizontal('X1', 0, 40),
      ...horizontal('X2', 2000, 40),
      ...horizontal('X3', 4000, 40),
      ...horizontal('X4', 6000, 40),
      ...horizontal('1000', 200, 500), // 区間1
      ...horizontal('4000', 800, 500), // 区間1
      ...horizontal('3000', 2200, 500), // 区間2
      ...horizontal('6000', 2800, 500), // 区間2
      ...horizontal('500', 4500, 500), // 区間3
      ...horizontal('7500', 6500, 560), // 合計(ラベル範囲外)
    ]

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual(['寸法組合せ不定'])
    expect(candidate.spansMm).toEqual([])
    expect(candidate.totalMm).toBeNull()
  })

  it('区間の境界(開区間)ちょうどにある寸法候補は、どちらの区間にも入れない(独立リビュー 🟡5)', () => {
    // ラベル X2 の中心位置(2,005)にぴったり重なる寸法「4,000」を置く。開区間
    // なのでどちらの区間にも入らないのが正しい — 区間1(X1~X2)は3,000/6,000、
    // 区間2(X2~X3)は7,000/6,000 で、合計10,000に合うのは 3,000+7,000 の
    // 一通りだけになる。`>`→`>=`(区間2の下限)にすると境界の4,000が区間2に
    // 漏れて 6,000+4,000=10,000 という別解が、`<`→`<=`(区間1の上限)にすると
    // 区間1に漏れて 4,000+6,000=10,000 という別解が生まれる — どちらの変異でも
    // 結果が 寸法組合せ不定 に倒れ、この一つのテストで両方を検出する。
    const items = [
      ...horizontal('X1', 0, 40),
      ...horizontal('X2', 2000, 40),
      ...horizontal('X3', 4000, 40),
      ...horizontal('3000', 200, 500), // 区間1
      ...horizontal('6000', 800, 500), // 区間1
      ...horizontal('4000', 1995, 520), // ちょうど X2 の中心(2,005) — 境界
      ...horizontal('7000', 2200, 500), // 区間2
      ...horizontal('6000', 2800, 500), // 区間2
      ...horizontal('10000', 4500, 560), // 合計(ラベル範囲外)
    ]

    const candidate = candidateOf(items, 'X')
    expect(candidate.issues).toEqual([])
    expect(candidate.spansMm).toEqual([3000, 7000])
    expect(candidate.totalMm).toBe(10000)
  })
})
