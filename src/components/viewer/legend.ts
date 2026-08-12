import type { Rebar, RebarZone } from '@/domain/model/rebar'
import type { RuleHit } from '@/domain/rules/types'

export interface LegendEntry {
  kind: '定着' | '重ね継手'
  lengthMm: number
  ruleKey?: string
}

function barDiameter(rebar: Rebar): number {
  return Number(rebar.size.replace(/^D/, ''))
}

function ruleLengthMm(rule: RuleHit, rebar: Rebar): number | null {
  if (rule.unit === 'mm') return rule.value
  if (rule.unit === 'd') return rule.value * barDiameter(rebar)
  return null
}

function rulesForZone(
  kind: RebarZone['kind'],
  rebar: Rebar,
): RuleHit[] {
  const prefix = kind === '定着' ? 'anchorage.' : 'lap.'
  return rebar.ruleHits.filter(({ key }) => key.startsWith(prefix))
}

function primaryRule(
  kind: RebarZone['kind'],
  rebar: Rebar,
  lengthMm: number,
): RuleHit | undefined {
  const candidates = rulesForZone(kind, rebar)
  const exact = candidates.find(
    (rule) => ruleLengthMm(rule, rebar) === lengthMm,
  )
  if (exact !== undefined) return exact

  if (kind === '重ね継手') {
    return candidates.find(({ key }) => /^lap\.L\d+h?$/.test(key))
  }

  const hooked = rebar.shape === 'hook90'
  return candidates.find(({ key }) =>
    hooked
      ? /^anchorage\.L\d+h$/.test(key)
      : /^anchorage\.L\d+$/.test(key),
  )
}

export function legendEntries(rebars: Rebar[]): LegendEntry[] {
  const entries = new Map<string, LegendEntry>()

  for (const rebar of rebars) {
    for (const zone of rebar.zones ?? []) {
      const lengthMm = zone.pathToMm - zone.pathFromMm
      const key = JSON.stringify([zone.kind, lengthMm])
      const ruleKey = primaryRule(zone.kind, rebar, lengthMm)?.key
      const existing = entries.get(key)

      if (existing === undefined) {
        entries.set(key, { kind: zone.kind, lengthMm, ruleKey })
      } else if (existing.ruleKey === undefined && ruleKey !== undefined) {
        entries.set(key, { ...existing, ruleKey })
      }
    }
  }

  return [...entries.values()]
}
