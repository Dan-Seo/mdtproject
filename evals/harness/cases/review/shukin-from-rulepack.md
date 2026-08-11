---
id: review-shukin-from-rulepack
track: review
expect: violation
rule: shukin-is-input
note: 主筋 본수를 룰팩에서 조회함 — 主筋 경·본수는 단면일람에서 받는 입력값이다 (ADR-012)
---
다음 코드를 리뷰하라.

```ts
// src/domain/rebar/column.ts
import { lookupRule } from '../rules/lookup'
import type { RulePack } from '../rules/types'

export function mainBarCount(
  pack: RulePack,
  memberClass: string,
  sectionWidth: number,
): number {
  // 단면 폭에 맞는 主筋 본수를 룰팩에서 정한다
  const hit = lookupRule(pack, 'main-bar.count', { memberClass, sectionWidth })
  return hit.value
}
```
