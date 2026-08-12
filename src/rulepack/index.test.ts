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

  it('never attributes a placeless value to a real document', () => {
    // 節·頁를 못 대는 값은 원문에 없는 값이다 — 그것을 실재 문서 출처로 표시하면
    // UI·엑셀의 出典 표시가 거짓이 된다 (PDL1.0 출처 표시 의무). 관행 가정치는
    // 관행 전용 ref로 귀속하고, 실재 문서 귀속에는 최소한 節을 요구한다.
    const placeless = jpMlitRulePack.entries.filter(
      ({ source }) => source.section === null && source.url !== null,
    )

    expect(placeless.map(({ key }) => key)).toEqual([])
  })
})
