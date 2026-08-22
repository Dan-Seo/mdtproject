import { describe, expect, it } from 'vitest'

import type { ColumnSection } from '../model/member'
import type { RuleEntry, RulePack } from './types'
import {
  coverConditions,
  lookupMarkup,
  lookupRule,
  lookupRuleSeries,
} from './lookup'

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

describe('lookupRuleSeries', () => {
  // 区分表（（３）梁2) の 5.0m 未満／以上……）は行の並び自体が規準なので、
  // 何区分あるかをコードに書かずルールパックから読む。
  it('returns every row of the key in ascending order of the given condition', () => {
    const third = entry('splice.band', { band: 3 }, 2)
    const first = entry('splice.band', { band: 1 }, 0.5)
    const second = entry('splice.band', { band: 2 }, 1)
    const pack: RulePack = {
      id: 'test',
      entries: [third, first, second, entry('other', { band: 1 }, 9)],
    }

    expect(lookupRuleSeries(pack, 'splice.band', 'band')).toEqual([
      first,
      second,
      third,
    ])
  })

  it('throws when the key has no rows — a silent empty series measures nothing', () => {
    const pack: RulePack = { id: 'test', entries: [] }

    expect(() => lookupRuleSeries(pack, 'splice.band', 'band')).toThrow(
      /not found/i,
    )
  })

  it('throws when a row lacks the ordering condition', () => {
    const pack: RulePack = {
      id: 'test',
      entries: [entry('splice.band', { band: 1 }, 0.5), entry('splice.band', {}, 1)],
    }

    expect(() => lookupRuleSeries(pack, 'splice.band', 'band')).toThrow(/band/)
  })
})

describe('specialized lookups', () => {
  const markup = entry(
    'markup.rate',
    { memberClass: '躯体' },
    Number.EPSILON,
  )
  const pack: RulePack = { id: 'test', entries: [markup] }

  it('looks up markup by the supplied member class without a fallback', () => {
    expect(lookupMarkup(pack, '躯体')).toBe(markup)
    expect(() => lookupMarkup(pack, '山留め壁')).toThrow(/not found/i)
  })
})

describe('coverConditions', () => {
  const section: ColumnSection = {
    id: 'section-C1',
    kind: '柱',
    mark: 'C1',
    shape: '矩形',
    b: 800,
    d: 800,
    fc: 24,
    grade: 'SD345',
    exposure: '屋外',
    finish: '仕上げなし',
    spliceMethod: '重ね継手',
    main: { size: 'D25', count: 12 },
    hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
  }

  it('pins the 表5.3.6 cover cell conditions to the section input', () => {
    // 생성기(column.ts)와 집계기(quantity/index.ts)가 공유하는 단일 출처 —
    // 조건 집합이 달라지면 두 경로가 서로 다른 셀을 보게 되므로 여기서 고정한다.
    expect(coverConditions(section)).toEqual({
      memberKind: '柱',
      soilContact: false,
      exposure: '屋外',
      finish: '仕上げなし',
    })
  })

  it('follows the section input for the 屋内・仕上げあり cell', () => {
    expect(
      coverConditions({
        ...section,
        exposure: '屋内',
        finish: '仕上げあり',
      }),
    ).toMatchObject({ exposure: '屋内', finish: '仕上げあり' })
  })
})
