---
id: review-hardcoded-anchorage
track: review
expect: violation
rule: rulepack-literal
note: 定着長さ 계수 35가 .ts 코드에 리터럴로 하드코딩됨 — 규준 수치는 src/rulepack/ YAML에서 조회해야 한다
---
다음 코드를 리뷰하라.

```ts
// src/domain/rebar/column.ts
export function anchorageLength(barDiameter: number): number {
  // 定着長さ L2（フックなし, Fc24·SD345）
  return 35 * barDiameter
}
```
