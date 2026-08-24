import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { axisLabels, dimensionTexts } from '@/lib/import/plan/grid-parse'
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
})
