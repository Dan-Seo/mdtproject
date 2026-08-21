export interface ResolvedSource {
  short: string
  doc: string
  edition: string | null
  publisher: string
  url: string | null
  section: string | null
  page: number | null
}

/**
 * 값의 근거가 어디까지 확인됐는지. 한 축의 순서다 — 위로 갈수록 강하다.
 *
 * - `stated`      원문에 명시돼 있고 **독립 검토까지 끝났다**.
 * - `transcribed` 원문에 명시돼 있으나 **전사자와 승인자가 같다** (R6).
 *                 기계 대조(골든 픽스처·구조 불변식)는 통과한 상태다.
 * - `inferred`    원문에 그 값이 없다. 반대해석이거나, 원문 자체가 미확보다.
 *
 * `transcribed` 를 따로 둔 이유: 예전에는 「원문 명시인데 검토가 1인」과
 * 「원문에 아예 없어서 지어낸 값」이 둘 다 `inferred` 였다. 사용자는 둘을
 * 구별할 수 없었고, 定着長さ 40d 같은 원문 명시값이 「추론」으로 표시됐다.
 */
export type RuleConfidence = 'stated' | 'transcribed' | 'inferred'

/** 등급 순서 — 낮을수록 약하다. 행 묶음의 대표값은 가장 약한 것이다. */
export const CONFIDENCE_ORDER: readonly RuleConfidence[] = [
  'inferred',
  'transcribed',
  'stated',
]

export interface RuleEntry {
  key: string
  label: string
  expr: string
  conditions: Record<string, string | number | boolean>
  value: number
  unit: string
  source: ResolvedSource
  confidence: RuleConfidence
  note: string
}

export type RuleHit = RuleEntry

export interface RulePack {
  id: string
  entries: RuleEntry[]
}
