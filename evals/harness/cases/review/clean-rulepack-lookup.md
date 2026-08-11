---
id: review-clean-rulepack-lookup
track: review
expect: pass
note: 룰팩 조회 + 단위 변환 상수(1000)만 있는 정상 코드 — 오탐 방지 가드
---
다음 코드를 리뷰하라.

```ts
// src/domain/rebar/column.ts
import { lookupRule } from '../rules/lookup'
import type { RulePack } from '../rules/types'

export function anchorageLengthMm(
  pack: RulePack,
  barDiameterMm: number,
  conditions: Record<string, unknown>,
): number {
  const hit = lookupRule(pack, 'anchorage.L2', conditions)
  return hit.value * barDiameterMm
}

export function anchorageLengthM(
  pack: RulePack,
  barDiameterMm: number,
  conditions: Record<string, unknown>,
): number {
  return anchorageLengthMm(pack, barDiameterMm, conditions) / 1000 // mm → m
}
```
