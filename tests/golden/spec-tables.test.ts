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

interface BendInsideDiameterEntry {
  table: string
  printedPage: number
  kind: 'bend.inside-diameter'
  conditions: {
    grades: string[]
    barSizeBand: string
  }
  value: number
  unit: string
  imageRead: boolean
}

interface DirectEntry {
  table: string
  printedPage: number
  kind: string
  conditions: Record<string, never>
  value: number
  unit: string
  imageRead: boolean
}

interface CoverEntry {
  table: string
  printedPage: number
  kind: 'cover.minimum'
  conditions: {
    memberKinds: string[]
    soilContact: boolean
    exposure?: string
    finish?: string
  }
  value: number
  unit: string
  imageRead: boolean
}

interface ExpandedCase {
  entry: {
    table: string
    printedPage: number
    kind: string
    value: number
    unit: string
  }
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

function expandBarSizeBand(barSizeBand: string): string[] {
  const diameters = barSizeBand.match(/\d+/g)

  if (!diameters || diameters.length === 0) {
    throw new Error(`Invalid barSizeBand in fixture: ${barSizeBand}`)
  }

  return [...new Set(diameters)].map((diameter) => `D${diameter}`)
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

const bendInsideDiameterEntries = (
  fixture.entries as unknown as BendInsideDiameterEntry[]
).filter(({ kind }) => kind === 'bend.inside-diameter')

const bendInsideDiameterCases: ExpandedCase[] =
  bendInsideDiameterEntries.flatMap((entry) =>
    entry.conditions.grades.flatMap((grade) =>
      expandBarSizeBand(entry.conditions.barSizeBand).map((size) => ({
        entry,
        conditions: { grade, size },
      })),
    ),
  )

const hookEntries = (fixture.entries as unknown as DirectEntry[]).filter(
  ({ kind }) =>
    ['bend.hook180', 'bend.hook135', 'bend.hook90', 'bend.hook-tome'].includes(
      kind,
    ),
)

const coverEntries = (fixture.entries as unknown as CoverEntry[]).filter(
  ({ kind }) => kind === 'cover.minimum',
)

const coverCases: ExpandedCase[] = coverEntries.flatMap((entry) => {
  const { memberKinds, ...baseConditions } = entry.conditions

  return memberKinds.map((memberKind) => ({
    entry,
    conditions: { ...baseConditions, memberKind },
  }))
})

const fabricationAdditionEntry = (
  fixture.entries as unknown as DirectEntry[]
).find(({ kind }) => kind === 'cover.fabrication.addition')

if (!fabricationAdditionEntry) {
  throw new Error('Fixture is missing cover.fabrication.addition')
}

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

describe('公共建築工事標準仕様書 令和7年版 折曲げ・かぶり tables', () => {
  it.each(bendInsideDiameterCases)(
    '$entry.kind $conditions.grade $conditions.size matches $entry.table',
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

  it.each(hookEntries)(
    '$kind matches the image-read value in $table',
    (entry) => {
      const hit = lookupRule(jpMlitRulePack, entry.kind, entry.conditions)

      expect(entry.imageRead).toBe(true)
      expect(hit.value).toBe(entry.value)
      expect(hit.unit).toBe(entry.unit)
      expect(hit.source.section).toBe(entry.table)
      expect(hit.source.page).toBe(entry.printedPage)
      expect(hit.confidence).toBe('inferred')
      expect(hit.note).toContain('画像')
    },
  )

  it.each(coverCases)(
    '$entry.kind $conditions.memberKind matches $entry.table',
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

  it('matches the 加工用かぶり addition independently of length rounding', () => {
    const entry = fabricationAdditionEntry
    const hit = lookupRule(jpMlitRulePack, entry.kind, entry.conditions)

    expect(hit.value).toBe(entry.value)
    expect(hit.unit).toBe(entry.unit)
    expect(hit.source.section).toBe(entry.table)
    expect(hit.source.page).toBe(entry.printedPage)
    expect(hit.confidence).toBe('inferred')
    expect(hit.key).not.toBe('rounding.length')
  })
})
