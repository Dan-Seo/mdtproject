import { describe, expectTypeOf, it } from 'vitest'

import type { Rebar } from './rebar'
import type { RuleHit } from '../rules/types'

describe('Rebar', () => {
  it('carries the looked-up rows themselves, not rule keys', () => {
    // 키 문자열만 남기면 집계부가 조회 조건을 되짚어야 하고, 되짚을 수 없는
    // 조회(지점 柱의 かぶり)는 근거 표시에서 통째로 사라진다 (ADR-015).
    expectTypeOf<Rebar['ruleHits']>().toEqualTypeOf<RuleHit[]>()
  })
})
