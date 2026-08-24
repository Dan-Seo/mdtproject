import { recoverRows, verticalRuns } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/types'

import type { AxisLabel, DimensionText, GridAxis } from './types'

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
 * makeSegments의 인접 판정 배수 — 라벨(「X1」)과 치수(「6,000」) 둘 다에 쓴다.
 * 한 토큰 안의 글자는 사실상 붙어 있어 글자 사이 간격이 0에 가깝고, 서로 다른
 * 토큰 사이는 그보다 뚜렷하게 벌어진다는 같은 전제가 둘 다에 성립한다.
 * 섹션리스트용 기본 배수(2.2, 글자 높이 h≈14pt에서 문턱≈31pt)는 그보다 좁게
 * 찍힌 토큰 사이 간격(예: 10pt)까지 하나로 묶는다 — 라벨은 compact가 "X1X2"가
 * 되어 AXIS_LABEL(`^([XY])(\d{1,2})$`)이, 치수는 "6,0007,000"이 되어 DIMENSION이
 * 통짜 문자열을 통째로 거절한다. ADR-030③이 남긴 표기 흔들림(X1'・X1A 같은
 * 補助通り芯) 거절과 같은 계열의 실패다(지어내지 않고 조용히 빠뜨린다). 문턱을
 * 글자 높이의 절반(h≈14pt에서 ≈7pt)으로 좁혀, 토큰 내부의 거의 0인 간격은
 * 여전히 묶고 토큰 사이 간격은 계속 가른다.
 */
const TIGHT_TOKEN_GAP_RATIO = 0.5

export function axisLabels(items: TextItem[]): AxisLabel[] {
  const order: string[] = []
  const occurrencesByLabel = new Map<string, AxisLabel[]>()

  for (const row of recoverRows(items, TIGHT_TOKEN_GAP_RATIO)) {
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

/**
 * 寸法値の形。3〜5桁で、千位にコンマが入ることがある。
 * 3桁を下限にするのは、2桁以下が階数・枝番・本数であって寸法ではないからだ。
 */
const DIMENSION = /^(\d{1,2},\d{3}|\d{3,5})$/

function toMillimetres(text: string): number | undefined {
  if (!DIMENSION.test(text)) return undefined
  const value = Number(text.replace(/,/g, ''))
  // 「000」「00000」「0,000」は形だけ寸法で値は 0 だ。0 を候補プールに入れると
  // ADR-030③ の合計照合が壊れる — ある部分和 S が合計と合えば S ∪ {0} も必ず
  // 合うので、「合う組み合わせは一つ」という一意性そのものが消える。
  // 机上の危険ではない: yokohama-p14 の「650x1000」を pdf.js が
  // `650`・`x`・`1`・`000` に割って出すため、実際に 0mm が4か所出ていた。
  if (value <= 0) return undefined
  return value
}

/**
 * 図面から読めた寸法値をすべて拾う。**戻り値の順序に意味はない** — 呼び出し側は
 * `axis` で絞ってから `positionPt` で自分で並べ替えること。
 *
 * 現在の並びは「X（行ごと・行内は左から）を全部、そのあとに Y（列ごと・列内は
 * 下から）」だが、これは実装の副産物であって約束ではない。並べ替えてから返さない
 * のは、そうしても呼び出し側の手間が減らないからだ: ADR-030③ の合計照合は軸ごとの
 * 部分和で順序を見ないし、位置順が要る利用者はどのみち軸で絞ったあとに並べる。
 * ここで混在配列を並べても誰も使えない保証が増えるだけになる。
 *
 * 拾うのは値と、その軸方向の位置だけだ。軸に直交する座標は落とす — 「スパン寸法線
 * の上の 6,000」と「別の場所の詳細寸法の 6,000」は区別されずに同じプールに入る。
 * ADR-030③ が設計上のふるいを合計照合に置いたので、ここで選り分けない。
 */
export function dimensionTexts(items: TextItem[]): DimensionText[] {
  const found: DimensionText[] = []

  // 横書きは X通り方向の寸法 — 通り芯の間隔が図面の横に並ぶ。gapRatio は
  // ラベルと同じ理由で狭める(TIGHT_TOKEN_GAP_RATIO 参照) — 寸法値一つ(例
  // "6,000")の字間もラベルと同様ほぼ0で、基本倍率のままだと隣の寸法値と
  // くっついて "6,0007,000" になり、DIMENSION が丸ごと拒否する。
  for (const row of recoverRows(items, TIGHT_TOKEN_GAP_RATIO)) {
    for (const segment of row.segments) {
      const valueMm = toMillimetres(segment.compact)
      if (valueMm === undefined) continue
      found.push({ valueMm, positionPt: segment.centerX, axis: 'X' })
    }
  }

  // 回転文字列は Y通り方向。verticalRuns は y 降順に読むので、図面の
  // 「下から上へ」の読み順どおりの文字列が返る — ここで反転しない。
  //
  // 배수는 넘기지 않는다. 안전한 값(1.5)이 runs.ts의 기본값 그 자체라서다 —
  // 여기서 같은 수를 다시 적으면 같은 값이 두 곳에 놓여 따로 움직일 여지만
  // 생긴다. 측정과 근거는 `VERTICAL_RUN_GAP_RATIO`에 있다.
  for (const run of verticalRuns(items)) {
    const valueMm = toMillimetres(run.text)
    if (valueMm === undefined) continue
    found.push({ valueMm, positionPt: run.y, axis: 'Y' })
  }

  return found
}
