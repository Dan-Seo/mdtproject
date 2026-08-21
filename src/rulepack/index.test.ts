import { describe, expect, it } from 'vitest'

import { lookupRuleSeries } from '../domain/rules/lookup'
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
        'cover.fabrication.addition',
        'measure.hoop.length.addition',
        'measure.width-tie.length.addition',
        'measure.distribution.addition',
        'measure.tip.length.addition',
        'measure.splice.interval',
        'measure.splice.column',
        'measure.splice.girder.continuous',
        'measure.splice.girder.continuous.band.upper',
        'measure.splice.length.factor',
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

  it('cites only externally published documents — never a self-authored one', () => {
    // 룰팩은 근거 있는 規準値만 담는다. 조문에 없는 값을 자작 출처 문서로 세탁하면
    // UI·엑셀의 出典 표시가 거짓이 된다 (CLAUDE.md CRITICAL, PDL1.0 출처 표시 의무).
    // 근거 없는 배치값은 룰팩이 아니라 断面一覧의 입력으로 받는다 (ADR-012).
    const cited = new Set(jpMlitRulePack.entries.map(({ source }) => source.doc))

    expect([...cited].sort()).toEqual(
      [
        '公共建築工事標準仕様書（建築工事編）',
        '公共建築数量積算基準',
        '鉄筋コンクリート用棒鋼',
      ].sort(),
    )
  })

  it('keeps 継手箇所数の区分上限 strictly ascending in band order', () => {
    // bandedSpliceRule は先頭一致で区分を返すので、上限が昇順でないと後ろの
    // 区分が前の区分に食われ、例外ではなく黙って違う箇所数が出る。順序は
    // 実行時に検査せずここで値として固定する — ルールパックはチェックイン済みの
    // YAML で、破れるのは実行時ではなく編集時だからである。
    // 境目の値そのものは tests/golden が押さえるのでここでは書かない。
    const uppers = lookupRuleSeries(
      jpMlitRulePack,
      'measure.splice.girder.continuous.band.upper',
      'band',
    ).map(({ value }) => value)

    expect(uppers).toEqual([...uppers].sort((left, right) => left - right))
    expect(new Set(uppers).size).toBe(uppers.length)
  })
})
