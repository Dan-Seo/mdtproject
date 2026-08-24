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

export function axisLabels(items: TextItem[]): AxisLabel[] {
  const order: string[] = []
  const occurrencesByLabel = new Map<string, AxisLabel[]>()

  for (const row of recoverRows(items)) {
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
