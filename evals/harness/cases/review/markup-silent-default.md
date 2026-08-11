---
id: review-markup-silent-default
track: review
expect: violation
rule: markup-no-default
note: 할증률 조회 실패 시 躯体 값으로 조용히 폴백함 — 범위 밖 부재 구분은 실패(throw)시켜야 한다 (ADR-014)
---
다음 코드를 리뷰하라.

```ts
// src/domain/quantity/index.ts
import { lookupMarkup } from '../rules/lookup'
import type { RulePack } from '../rules/types'

export function markupRate(pack: RulePack, memberClass: string): number {
  try {
    return lookupMarkup(pack, memberClass).value
  } catch {
    // 알 수 없는 부재 구분은 躯体로 취급한다
    return lookupMarkup(pack, '躯体').value
  }
}
```
