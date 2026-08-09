import type { BarSize, MemberClass } from '../model/member'
import type { RuleHit, RulePack } from './types'

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
