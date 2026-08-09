export interface ResolvedSource {
  short: string
  doc: string
  edition: string | null
  publisher: string
  url: string | null
  section: string | null
  page: number | null
}

export interface RuleEntry {
  key: string
  label: string
  expr: string
  conditions: Record<string, string | number | boolean>
  value: number
  unit: string
  source: ResolvedSource
  confidence: 'stated' | 'inferred'
  note: string
}

export type RuleHit = RuleEntry

export interface RulePack {
  id: string
  entries: RuleEntry[]
}
