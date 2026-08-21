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
      ]),
    )
  })

  it('claims no independently reviewed value while R6 is open', () => {
    // `stated` 는 「원문 명시 ＋ 독립 검토 완료」다. 아직 독립 검토를 거친 행이
    // 없으므로 0행이어야 한다 — 여기가 늘어나는 순간이 R6 를 실제로 닫는 때이고,
    // 늘리려면 docs/ADR.md ADR-023 의 승급 조건을 먼저 만족시켜야 한다.
    const stated = jpMlitRulePack.entries.filter(
      ({ confidence }) => confidence === 'stated',
    )

    expect(stated).toHaveLength(0)
  })

  it('marks every 原文明示 row transcribed and only sourceless rows inferred', () => {
    // 원문에 값이 없는 것만 inferred 다. 지금은 反対解釈로 세운 継手 算入倍率
    // (明文なし) 하나뿐이다 — 또 하나였던 JIS 単位質量은 원문 자체가 미확보라
    // 룰팩에서 빼고 프로젝트 입력으로 받는다(schema v6). 읽지 않은 문헌을
    // 出典에 세우지 않는다는 ADR-003 을 등급이 아니라 구조로 지킨 것이다.
    const inferred = jpMlitRulePack.entries.filter(
      ({ confidence }) => confidence === 'inferred',
    )

    expect(new Set(inferred.map(({ key }) => key))).toEqual(
      new Set(['measure.splice.length.factor']),
    )
    for (const rule of inferred) {
      expect(
        rule.note,
        `${rule.key} must say why the original has no value`,
      ).toMatch(/明文ではない|明文はない|未確保/)
    }
  })

  it('resolves source and confidence metadata for every entry', () => {
    expect(jpMlitRulePack.entries.length).toBeGreaterThan(0)
    for (const rule of jpMlitRulePack.entries) {
      expect(rule.source.doc).not.toBe('')
      expect(rule.source.publisher).not.toBe('')
      expect(['stated', 'transcribed', 'inferred']).toContain(
        rule.confidence,
      )
    }
  })

  it('cites only externally published documents — never a self-authored one', () => {
    // 룰팩은 근거 있는 規準値만 담는다. 조문에 없는 값을 자작 출처 문서로 세탁하면
    // UI·엑셀의 出典 표시가 거짓이 된다 (CLAUDE.md CRITICAL, PDL1.0 출처 표시 의무).
    // 근거 없는 배치값은 룰팩이 아니라 断面一覧의 입력으로 받는다 (ADR-012).
    const cited = new Set(jpMlitRulePack.entries.map(({ source }) => source.doc))

    expect([...cited].sort()).toEqual(
      ['公共建築工事標準仕様書（建築工事編）', '公共建築数量積算基準'].sort(),
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
