import type { Rebar } from '@/domain/model/rebar'

export interface LegendEntry {
  kind: '定着' | '重ね継手'
  lengthMm: number
  ruleKey: string
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

      if (!entries.has(key)) {
        entries.set(key, { kind: zone.kind, lengthMm, ruleKey: zone.ruleKey })
      }
    }
  }

  return [...entries.values()]
}
