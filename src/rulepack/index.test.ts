import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from './index'

describe('jpMlitRulePack', () => {
  it('loads every configured rule key from raw YAML', () => {
    const keys = new Set(jpMlitRulePack.entries.map(({ key }) => key))

    expect(keys).toEqual(
      new Set([
        'cover.minimum',
        'anchorage.L1',
        'anchorage.L2',
        'anchorage.L1h',
        'anchorage.L2h',
        'anchorage.La',
        'anchorage.bent.tail.minimum',
        'anchorage.bent.projection.minimum',
        'lap.L1',
        'lap.L1h',
        'bend.inside-diameter',
        'bend.hook180',
        'bend.hook90',
        'bend.hook135',
        'bend.hook-tome',
        'stirrup.start-offset',
        'cover.fabrication.addition',
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
