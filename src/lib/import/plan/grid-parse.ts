import { recoverRows } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/types'

import type { AxisLabel, GridAxis } from './types'

/**
 * 通り芯ラベルの形。X・Y に続く1〜2桁の番号だけを取る。
 * 「FC1」「G1」のような符号を拾わないよう、先頭から末尾までを縛る。
 */
const AXIS_LABEL = /^([XY])(\d{1,2})$/

/**
 * 같은 라벨이 도면 양 끝(X는 위·아래, Y는 좌·우)에 중복 인쇄될 때 「같은
 * 格子線」으로 볼 위치 오차 허용치(pt). 같은 문자열이 같은 폰트로 두 번 찍힌
 * 것이라 실제 오차는 부동소수 잔차 수준(<1pt)이고, 반대로 런 재조립이 서로
 * 다른 格子線을 같은 라벨로 잘못 묶었다면 格子 간격만큼(보통 수백 pt) 벌어진다
 * — 그 사이 어디에 둬도 판정이 갈리므로 정확한 값 자체는 중요하지 않다.
 * 規準 수치가 아니라 도면 판독 임계값이라 룰팩이 아니라 여기 상수로 둔다.
 */
const DUPLICATE_LABEL_TOLERANCE_PT = 2

/**
 * makeSegments의 인접 판정 배수(라벨 전용). 한 라벨 안의 글자(예 "X"와 "1")는
 * 사실상 붙어 있어 글자 사이 간격이 0에 가깝고, 서로 다른 라벨 사이는 그보다
 * 뚜렷하게 벌어진다. 섹션리스트용 기본 배수(2.2, 글자 높이 h≈14pt에서
 * 문턱≈31pt)는 그보다 좁게 찍힌 라벨 사이 간격(예: 10pt)까지 하나로 묶어
 * compact가 "X1X2"가 되고, 정규식이 그 통짜 문자열을 통째로 버린다(Finding B).
 * 문턱을 글자 높이의 절반(h≈14pt에서 ≈7pt)으로 좁혀, 라벨 내부의 거의 0인
 * 간격은 여전히 묶고 라벨 사이 간격은 계속 가른다.
 */
const AXIS_LABEL_GAP_RATIO = 0.5

export function axisLabels(items: TextItem[]): AxisLabel[] {
  const order: string[] = []
  const occurrencesByLabel = new Map<string, AxisLabel[]>()

  for (const row of recoverRows(items, AXIS_LABEL_GAP_RATIO)) {
    for (const segment of row.segments) {
      const match = AXIS_LABEL.exec(segment.compact)
      if (!match) continue

      const axis = match[1] as GridAxis
      const label = segment.compact
      const entry: AxisLabel = {
        label,
        axis,
        index: Number(match[2]),
        // X通りは図面の横位置に、Y通りは縦位置に並ぶ — 軸ごとに測る向きが違う。
        // 中心の求め方（ベースラインなので引く側）は centerX/centerY 自身の定義にある。
        positionPt: axis === 'X' ? segment.centerX : segment.centerY,
      }

      const occurrences = occurrencesByLabel.get(label)
      if (occurrences) {
        occurrences.push(entry)
      } else {
        occurrencesByLabel.set(label, [entry])
        order.push(label)
      }
    }
  }

  const labels: AxisLabel[] = []
  for (const label of order) {
    const occurrences = occurrencesByLabel.get(label) as AxisLabel[]
    const positions = occurrences.map((entry) => entry.positionPt)
    const spread = Math.max(...positions) - Math.min(...positions)

    // 실도면은 같은 通り芯을 도면 양 끝에 두 번 찍는다 — 위치가 맞으면 하나로
    // 접고, 어긋나면 지어내지 말고(평균 내거나 아무거나 고르지 말고) 그 라벨을
    // 통째로 버린다. ADR-030의 라벨수↔スパン数 대조가 그 빈자리를 잡는다.
    if (spread <= DUPLICATE_LABEL_TOLERANCE_PT) {
      labels.push(occurrences[0])
    }
  }

  return labels
}
