import { describe, expect, it } from 'vitest'

import type { RuleEntry, RulePack } from './types'
import { lookupMarkup, lookupRule, lookupUnitMass } from './lookup'

function entry(
  key: string,
  conditions: RuleEntry['conditions'],
  value: number,
): RuleEntry {
  return {
    key,
    label: key,
    expr: String(value),
    conditions,
    value,
    unit: 'test',
    source: {
      short: 'test',
      doc: 'test',
      edition: 'test',
      publisher: 'test',
      url: 'https://example.com',
      section: 'test',
      page: 1,
    },
    confidence: 'stated',
    note: 'test',
  }
}

describe('lookupRule', () => {
  it('matches subset conditions and selects the most specific candidate', () => {
    const generic = entry('lap.L1', { grade: 'SD345' }, 1)
    const specific = entry(
      'lap.L1',
      { grade: 'SD345', fc: 24, hook: false },
      2,
    )
    const pack: RulePack = { id: 'test', entries: [generic, specific] }

    expect(
      lookupRule(pack, 'lap.L1', {
        grade: 'SD345',
        fc: 24,
        hook: false,
        ignored: true,
      }),
    ).toBe(specific)
  })

  it('throws instead of choosing between equally specific candidates', () => {
    const pack: RulePack = {
      id: 'test',
      entries: [
        entry('lap.L1', { grade: 'SD345' }, 1),
        entry('lap.L1', { fc: 24 }, 2),
      ],
    }

    expect(() =>
      lookupRule(pack, 'lap.L1', { grade: 'SD345', fc: 24 }),
    ).toThrow(/ambiguous/i)
  })

  it('throws when no candidate matches', () => {
    const pack: RulePack = {
      id: 'test',
      entries: [entry('lap.L1', { grade: 'SD345' }, 1)],
    }

    expect(() => lookupRule(pack, 'lap.L1', { grade: 'SD390' })).toThrow(
      /not found/i,
    )
  })
})

describe('specialized lookups', () => {
  const markup = entry(
    'markup.rate',
    { memberClass: '躯体' },
    Number.EPSILON,
  )
  const unitMass = entry('unit-mass.value', { size: 'D13' }, 0.995)
  const pack: RulePack = { id: 'test', entries: [markup, unitMass] }

  it('looks up markup by the supplied member class without a fallback', () => {
    expect(lookupMarkup(pack, '躯体')).toBe(markup)
    expect(() => lookupMarkup(pack, '山留め壁')).toThrow(/not found/i)
  })

  it('looks up unit mass by BarSize', () => {
    expect(lookupUnitMass(pack, 'D13')).toBe(unitMass)
  })
})
