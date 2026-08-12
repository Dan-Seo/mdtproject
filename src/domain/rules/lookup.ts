import type { BarSize, MemberClass, Section } from '../model/member'
import type { RuleHit, RulePack } from './types'

/**
 * 表5.3.6 のかぶり厚さセルを特定する共通条件 — 생성기(column.ts)와
 * 집계기(quantity/index.ts)가 반드시 같은 셀을 봐야 하므로 단일 출처로 둔다.
 * 地上躯体のみを扱う (基礎・地中部材は ADR-005 でスコープ外) — 土に接しない。
 */
export function coverConditions(
  section: Section,
): Record<string, string | boolean> {
  return {
    memberKind: section.kind,
    soilContact: false,
    exposure: section.exposure,
    finish: section.finish,
  }
}

function matches(
  ruleConditions: Record<string, string | number | boolean>,
  queryConditions: Record<string, unknown>,
): boolean {
  return Object.entries(ruleConditions).every(
    ([name, value]) => queryConditions[name] === value,
  )
}

export function lookupRule(
  pack: RulePack,
  key: string,
  conditions: Record<string, unknown>,
): RuleHit {
  const candidates = pack.entries.filter(
    (entry) => entry.key === key && matches(entry.conditions, conditions),
  )

  if (candidates.length === 0) {
    throw new Error(
      `Rule not found: ${key} for ${JSON.stringify(conditions)}`,
    )
  }

  const specificity = Math.max(
    ...candidates.map((entry) => Object.keys(entry.conditions).length),
  )
  const mostSpecific = candidates.filter(
    (entry) => Object.keys(entry.conditions).length === specificity,
  )

  if (mostSpecific.length !== 1) {
    throw new Error(
      `Rule lookup is ambiguous: ${key} for ${JSON.stringify(conditions)}`,
    )
  }

  return mostSpecific[0]
}

export function lookupMarkup(
  pack: RulePack,
  memberClass: MemberClass | string,
): RuleHit {
  return lookupRule(pack, 'markup.rate', { memberClass })
}

export function lookupUnitMass(pack: RulePack, size: BarSize): RuleHit {
  return lookupRule(pack, 'unit-mass.value', { size })
}
