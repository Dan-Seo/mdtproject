import { describe, expect, it } from 'vitest'

import { lookupRule } from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/spec-r7-ch5.json'

interface TableEntry {
  table: string
  printedPage: number
  kind: string
  conditions: {
    grade: string
    fcBand: string
    hook?: boolean
  }
  value: number
  unit: string
}

interface ExpandedCase {
  entry: TableEntry
  conditions: Record<string, string | number | boolean>
}

const supportedKinds = new Set([
  'lap.L1',
  'lap.L1h',
  'anchorage.L1',
  'anchorage.L2',
  'anchorage.L1h',
  'anchorage.L2h',
  'anchorage.La',
])

function expandFcBand(fcBand: string): number[] {
  const boundaries = fcBand.split('-').map(Number)

  if (boundaries.some((boundary) => !Number.isFinite(boundary))) {
    throw new Error(`Invalid fcBand in fixture: ${fcBand}`)
  }

  return [...new Set(boundaries)]
}

const tableEntries = (fixture.entries as unknown as TableEntry[]).filter(
  ({ kind }) => supportedKinds.has(kind),
)

const expandedCases: ExpandedCase[] = tableEntries.flatMap((entry) => {
  const { fcBand, ...baseConditions } = entry.conditions

  return expandFcBand(fcBand).map((fc) => ({
    entry,
    conditions: { ...baseConditions, fc },
  }))
})

describe('公共建築工事標準仕様書 令和7年版 定着・重ね継手 tables', () => {
  it.each(expandedCases)(
    '$entry.kind Fc$conditions.fc $entry.conditions.grade matches $entry.table',
    ({ entry, conditions }) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, conditions)

      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('LLM転写 — 独立検討待ち')
    },
  )

  it('fails fast for an Fc value absent from the fixture bands', () => {
    expect(() =>
      lookupRule(jpMlitRulePack, 'anchorage.L2', {
        fc: Number('25'),
        grade: 'SD345',
        hook: false,
      }),
    ).toThrow(/not found/i)
  })
})
