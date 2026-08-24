import { describe, expect, it } from 'vitest'

import { axisLabels, dimensionTexts } from '@/lib/import/plan/grid-parse'
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
    // 정확히 2w다. 기본 배수(PROXIMITY_MULTIPLIER=2)의 문턱이 딱 2w라서 이 경계는
    // 부동소수 잔차 1 ULP로 갈린다 — 실측에서는 gap이 문턱보다 5.7e-14 커서
    // 우연히 갈렸다. 부호가 뒤집히면(다른 pdf.js 빌드·viewport·픽스처 재생성)
    // 「150」+「50」이 「15050」로 붙고, 그 통짜 문자열이 DIMENSION(\d{3,5})을
    // **통과해** 도면에 없는 값이 후보 풀에 들어간다. 거절이 아니라 날조라서
    // 이 프로젝트가 못 견디는 실패다.
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

  it('寸法に見えない数字は拾わない', () => {
    // 3桁未満は部材符号の枝番や階数であって寸法ではない
    const items = [glyph('2', 100, 500), glyph('F', 105, 500)]

    expect(dimensionTexts(items)).toEqual([])
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
