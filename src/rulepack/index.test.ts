import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from './index'

describe('jpMlitRulePack', () => {
  it('loads every M1 rule category from raw YAML', () => {
    const keys = new Set(jpMlitRulePack.entries.map(({ key }) => key))

    expect(keys).toEqual(
      new Set([
        'cover.minimum',
        'anchorage.L2',
        'lap.L1',
        'bend.inside-diameter',
        'bend.hook90',
        'bend.hook135',
        'rounding.length',
        'markup.rate',
        'unit-mass.value',
      ]),
    )
  })

  it('resolves source and confidence metadata for every entry', () => {
    expect(jpMlitRulePack.entries.length).toBeGreaterThan(0)
    for (const rule of jpMlitRulePack.entries) {
      expect(rule.source.doc).not.toBe('')
      expect(rule.source.publisher).not.toBe('')
      expect(['stated', 'inferred']).toContain(rule.confidence)
    }
  })
})
