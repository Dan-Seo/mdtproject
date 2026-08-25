import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  axisLabels,
  dimensionTexts,
  parseGrid,
} from '@/lib/import/plan/grid-parse'
import type { TextItem } from '@/lib/import/types'

/**
 * 伏図 파서를 픽스처 5부에 통째로 돌리는 가드. 인라인 glyph 단위 테스트는
 * `src/lib/import/plan/grid-parse.test.ts`에 남고, **실도면 코퍼스를 도는 것은
 * 여기 모은다** — 이 레포의 코퍼스 가드는 예외 없이 node 프로젝트(`tests/`)에
 * 있고, 로더 규약도 `parse.test.ts`와 같다.
 */
const FIXTURES = [
  'kani-p38.json',
  'ojkk-p2.json',
  'ojkk-p3.json',
  'yokohama-p13.json',
  'yokohama-p14.json',
]

function readItems(file: string): TextItem[] {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/section-import/textitems',
    file,
  )
  return (JSON.parse(readFileSync(fixturePath, 'utf8')) as { items: TextItem[] })
    .items
}

describe('伏図 파서 — 실도면 5부', () => {
  it('実図面5部のどこからも 0mm 候補が出ない', () => {
    // 机上の話ではない: yokohama-p14 の「650x1000」は pdf.js が
    // `650`・`x`・`1`・`000` の4アイテムに割って出すので、狭めた閾値では
    // `000` が単独セグメントになり 0mm として通っていた（4か所）。
    for (const file of FIXTURES) {
      const zeros = dimensionTexts(readItems(file)).filter(
        (dimension) => dimension.valueMm <= 0,
      )
      expect({ file, zeros }).toEqual({ file, zeros: [] })
    }
  })

  it('【회귀 가드 ─ 파서 출력 유래. 実測 골든이 아니다】kani-p38의 通り芯과 스팬·合計가 그대로 나온다', () => {
    // **기대값의 출처는 파서 자신의 출력이다.** ADR-010의 골든테스트는 「원문
    // 표를 독립 전사한 픽스처」와 대조하는 것이고 이 테스트는 그것이 아니다 —
    // `.cache/`가 비어 원본 PDF가 없어 지금은 육안 전사를 할 방법이 없다.
    // 그래서 이것은 「이 값이 옳다」를 주장하지 않는다. 지키는 것은 하나다:
    // **인접 문턱 3개(가로 배수 0.5·세로 배수 1.5·고정 4pt 하한 제거)를 한꺼번에
    // 움직였는데, 이 도면이 조용히 스팬을 잃지 않는가.** 직전 판의 실도면
    // 테스트는 「0mm가 안 나온다」만 봤기 때문에 스팬 하나가 통째로 사라져도
    // 아무도 몰랐다.
    //
    // 육안 전사한 `kani-p38-grid.json`이 들어오면 이 테스트는 그것으로 교체된다.
    // 그때까지 이 값들을 「도면이 이렇다」의 근거로 인용하지 말 것.
    //
    // 값은 ADR-030의 実測 서술과 일치한다: X1~X4·Y1~Y3, X 스팬 6,000/6,000/8,000
    // 合計 20,000(= 6,000+6,000+8,000), Y 스팬 6,000/10,500 合計 16,500.
    const items = readItems('kani-p38.json')

    // 라벨은 반환 순서(행 y→x의 조우 순서)를 약속하지 않으므로 라벨명으로
    // 정렬해 비교한다. 位置는 pt를 반올림한다 — 부동소수 잔차를 고정하는 것은
    // 이 가드의 목적이 아니다.
    const labels = axisLabels(items)
      .map((label) => ({
        label: label.label,
        axis: label.axis,
        at: Math.round(label.positionPt),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))

    expect(labels).toEqual([
      { label: 'X1', axis: 'X', at: 364 },
      { label: 'X2', axis: 'X', at: 534 },
      { label: 'X3', axis: 'X', at: 704 },
      { label: 'X4', axis: 'X', at: 931 },
      // Y는 도면 위쪽이 y 작은 쪽 — Y3가 위, Y1이 아래다
      { label: 'Y1', axis: 'Y', at: 786 },
      { label: 'Y2', axis: 'Y', at: 488 },
      { label: 'Y3', axis: 'Y', at: 318 },
    ])

    const dimensions = dimensionTexts(items)
    const pool = (axis: 'X' | 'Y') =>
      dimensions.filter((dimension) => dimension.axis === axis)

    const spans = (axis: 'X' | 'Y', values: number[]) =>
      pool(axis)
        .filter((dimension) => values.includes(dimension.valueMm))
        .map((dimension) => ({
          mm: dimension.valueMm,
          at: Math.round(dimension.positionPt),
        }))
        .sort((left, right) => left.at - right.at)

    // 位置 순서로 늘어놓는다. 合計는 도면 전체를 걸치는 치수선이라 중앙에 온다.
    expect(spans('X', [6000, 8000, 20000])).toEqual([
      { mm: 6000, at: 449 }, // X1–X2
      { mm: 6000, at: 619 }, // X2–X3
      { mm: 20000, at: 647 }, // 合計 X1–X4
      { mm: 8000, at: 818 }, // X3–X4
    ])
    expect(spans('Y', [6000, 10500, 16500])).toEqual([
      { mm: 6000, at: 405 }, // Y3–Y2
      { mm: 16500, at: 554 }, // 合計 Y3–Y1
      { mm: 10500, at: 639 }, // Y2–Y1
    ])

    // 후보 풀의 크기 ＝ ADR-030이 「노이즈가 압도적이라 合計 대조가 유일한
    // 장치다」의 근거로 든 수치다. 손으로 적는 값이라 코드보다 뒤처지므로
    // 여기서 못 박는다 — 문턱을 움직여 이 수가 변하면 ADR도 같이 고쳐야 한다.
    expect({ x: pool('X').length, y: pool('Y').length }).toEqual({
      x: 38,
      y: 52,
    })
  })

  it('【회귀 가드 ─ 파서 출력 유래. 実測 골든이 아니다】伏図가 아닌 4부에서는 격자를 하나도 내지 않는다', () => {
    // 앞의 가드와 같은 이유로 파서 출력 유래다 — 다만 여기서 지키는 것은
    // **값이 아니라 침묵**이다. ojkk 2부와 yokohama 2부는 断面リスト 페이지라
    // 伏図가 없고, 따라서 어떤 격자도 나와서는 안 된다.
    //
    // yokohama-p14 는 그냥 「라벨이 없다」로 끝나지 않는다: 断面リスト의 符号
    // X2・X3(그리고 Y4・Y5)가 通り芯 라벨의 모양을 그대로 갖고 있어 라벨로
    // 잡힌다. 둘 다 라벨이 정확히 2개(스팬 1본)인 축이고, 「和 ＝ 合計」는
    // 스팬이 1본일 때 **아무것도 확인하지 않는다** — 그 1본 자신을 合計로
    // 읽으면 언제나 성립하기 때문이다(区間 안의 900 을 合計로 읽으면
    // 「X2~X3 는 900mm」라는 도면에 없는 격자가 성립하는 식). 이전에는
    // 「合計가 스팬과 다른 한 본으로 적혀 있어야 한다」는 writtenAsTotal 가드가
    // 이 구멍을 막고 있었으나, 독립 리뷰가 그 가드는 **우연히** 막혔을 뿐임을
    // 보였다(같은 값이 페이지 어딘가에 한 번 더 있기만 해도 뚫린다) — 그래서
    // 지금은 라벨이 2개인 축은 데이터를 보기도 전에 거절한다(`区間数不足`,
    // ADR-030③-2 정정). X・Y 둘 다 이 이유로 통일된다.
    const produced = FIXTURES.filter((file) => file !== 'kani-p38.json').flatMap(
      (file) =>
        parseGrid(readItems(file)).map((candidate) => ({
          file,
          axis: candidate.axis,
          labels: candidate.labels.map((label) => label.label),
          spansMm: candidate.spansMm,
          totalMm: candidate.totalMm,
          issues: candidate.issues,
        })),
    )

    expect(produced).toEqual([
      ...['ojkk-p2.json', 'ojkk-p3.json', 'yokohama-p13.json'].flatMap((file) =>
        (['X', 'Y'] as const).map((axis) => ({
          file,
          axis,
          labels: [],
          spansMm: [],
          totalMm: null,
          issues: ['通り芯ラベル不足'],
        })),
      ),
      {
        file: 'yokohama-p14.json',
        axis: 'X',
        labels: ['X2', 'X3'],
        spansMm: [],
        totalMm: null,
        issues: ['区間数不足'],
      },
      {
        file: 'yokohama-p14.json',
        axis: 'Y',
        labels: ['Y4', 'Y5'],
        spansMm: [],
        totalMm: null,
        issues: ['区間数不足'],
      },
    ])
  })

  it('【회귀 가드 ─ 날조 0건(독립 리뷰 🔴1)】yokohama-p14 X는 구간 안 치수가 정확히 1개인데도 격자를 만들지 않는다', () => {
    // yokohama-p14 X는 断面リスト의 符号 X2・X3가 通り芯 라벨로 오인되고,
    // 그 사이 구간에 寸法 후보가 정확히 하나(900)만 있다 — 라벨 2개(스팬 1본)
    // 축의 실측 사례다. writtenAsTotal 가드(合計는 스팬과 다른 한 본이어야
    // 한다)만으로는 이 축을 못 막는다는 것이 독립 리뷰의 지적이었다: 우연히
    // 페이지에 900이 유일값이라 막혔을 뿐, 다른 곳에 900이 한 번 더 있었다면
    // 「X2~X3 は 900mm」라는 도면에 없는 격자가 issues:[] 로 성립했을 것이다.
    // 지금은 라벨 2개(스팬 1본) 자체를 데이터와 무관하게 거절하므로(区間数不足)
    // 이 축은 어떤 경우에도 값을 내지 않는다.
    const [x] = parseGrid(readItems('yokohama-p14.json'))

    expect(x.axis).toBe('X')
    expect(x.labels.map((label) => label.label)).toEqual(['X2', 'X3'])
    expect(x.issues).toEqual(['区間数不足'])
    expect(x.spansMm).toEqual([])
    expect(x.totalMm).toBeNull()
  })

  it('【회귀 가드 ─ 파서 출력 유래. 実測 골든이 아니다】kani-p38에서 두 축 다 격자가 하나로 정해진다', () => {
    // 위 두 가드와 같은 성격(파서 출력 유래)이고, 여기서 지키는 것은
    // **후보 38·52건에서 해가 정확히 하나로 좁혀진다**는 사실이다.
    // 하나라도 더 나오면 `寸法組合せ不定`이 되어 값이 안 나온다 — 즉 이 가드는
    // 「位置 구간 ＋ 合計」 두 겹이 실도면에서 실제로 유일해를 만든다는
    // ADR-030③ 의 주장을 붙잡는다.
    expect(parseGrid(readItems('kani-p38.json'))).toMatchObject([
      {
        axis: 'X',
        spansMm: [6000, 6000, 8000],
        totalMm: 20000,
        issues: [],
      },
      {
        axis: 'Y',
        spansMm: [6000, 10500],
        totalMm: 16500,
        issues: [],
      },
    ])
  })
})
