import type { Rebar, RebarZone } from '@/domain/model/rebar'
import type { RuleHit } from '@/domain/rules/types'

export interface LegendEntry {
  kind: RebarZone['kind']
  lengthMm: number
  ruleKey: string
  /** 이 길이를 정한 룰. 出典 표시가 법적 의무이므로 수치와 함께 나른다. */
  rule: RuleHit
}

/**
 * 범례는 산정부가 zone에 실어 보낸 룰 키를 그대로 표시한다 — 형상·길이에서
 * 어느 룰이 지배했는지 되짚으면 도메인과 어긋날 수 있는 두 번째 판정이 된다.
 */
export function legendEntries(rebars: Rebar[]): LegendEntry[] {
  const entries = new Map<string, LegendEntry>()

  for (const rebar of rebars) {
    for (const zone of rebar.zones ?? []) {
      const lengthMm = zone.pathToMm - zone.pathFromMm
      const key = JSON.stringify([zone.kind, zone.ruleKey, lengthMm])

      if (entries.has(key)) continue

      const rule = rebar.ruleHits.find(({ key }) => key === zone.ruleKey)

      if (rule === undefined) {
        // 생성기는 zone을 만든 룰을 반드시 ruleHits에도 싣는다. 없다면 결함이며,
        // 出典 없는 수치를 조용히 띄우는 대신 실패시킨다.
        throw new Error(
          `Legend rule missing from ruleHits: ${rebar.id} ${zone.ruleKey}`,
        )
      }

      entries.set(key, { kind: zone.kind, lengthMm, ruleKey: zone.ruleKey, rule })
    }
  }

  return [...entries.values()]
}
