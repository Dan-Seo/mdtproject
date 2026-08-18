import { describe, expect, it } from 'vitest'

import type { RuleHit } from '../rules/types'
import {
  bandedSpliceRule,
  distributionCount,
  hoopDesignLengthMm,
  intervalSpliceCount,
  spliceCount,
  spliceLengthMm,
} from './measurement'

// 規準どおりの値そのものは tests/golden/quantity-measurement.test.ts が原文転写と
// 突き合わせる。ここで見るのは、規準が想定していない入力で黙って数字を返さないこと。

function rule(value: number, unit: string): RuleHit {
  return {
    key: 'measure.test',
    label: 'テスト用',
    expr: '',
    conditions: {},
    value,
    unit,
    source: {
      short: 'テスト',
      doc: 'テスト',
      edition: null,
      publisher: 'テスト',
      url: null,
      section: null,
      page: null,
    },
    confidence: 'stated',
    note: '',
  }
}

const noAddition = rule(0, 'mm')
const onePerRun = rule(1, '本')

describe('hoopDesignLengthMm', () => {
  it('returns the perimeter of the design section', () => {
    expect(hoopDesignLengthMm(400, 750, noAddition)).toBe(2300)
  })

  it('carries the addition the rule pack supplies', () => {
    // ルールが値を持つ意味がなければ出典を載せているだけの飾りになる。
    expect(hoopDesignLengthMm(400, 750, rule(30, 'mm'))).toBe(2330)
  })

  it.each([
    ['zero width', 0, 750],
    ['zero depth', 400, 0],
    ['negative width', -400, 750],
    ['NaN depth', 400, Number.NaN],
    ['Infinity width', Number.POSITIVE_INFINITY, 750],
    ['Infinity depth', 400, Number.POSITIVE_INFINITY],
  ])('throws for %s', (_label, widthMm, depthMm) => {
    expect(() => hoopDesignLengthMm(widthMm, depthMm, noAddition)).toThrow(
      /断面の設計寸法/,
    )
  })

  it('refuses an addition rule that is not in mm', () => {
    expect(() => hoopDesignLengthMm(400, 750, rule(0, 'd'))).toThrow(/mm/)
  })
})

describe('distributionCount', () => {
  it('rounds the quotient up before adding the closing bar', () => {
    expect(distributionCount(4750, 200, onePerRun)).toBe(25)
  })

  it('still adds one when the length divides evenly', () => {
    expect(distributionCount(5200, 100, onePerRun)).toBe(53)
  })

  it('carries the addition the rule pack supplies', () => {
    expect(distributionCount(5200, 100, rule(2, '本'))).toBe(54)
  })

  it.each([
    ['zero length', 0, 100],
    ['negative length', -5200, 100],
    ['NaN length', Number.NaN, 100],
    ['Infinity length', Number.POSITIVE_INFINITY, 100],
  ])('throws for %s', (_label, partLengthMm, pitchMm) => {
    expect(() =>
      distributionCount(partLengthMm, pitchMm, onePerRun),
    ).toThrow(/その部分の長さ/)
  })

  it.each([
    ['zero pitch', 5200, 0],
    ['negative pitch', 5200, -100],
    ['NaN pitch', 5200, Number.NaN],
    ['Infinity pitch', 5200, Number.POSITIVE_INFINITY],
  ])('throws for %s', (_label, partLengthMm, pitchMm) => {
    expect(() =>
      distributionCount(partLengthMm, pitchMm, onePerRun),
    ).toThrow(/鉄筋の間隔/)
  })

  it('refuses an addition rule that is not counted in 本', () => {
    expect(() => distributionCount(5200, 100, rule(1, 'mm'))).toThrow(/本/)
  })
})

const sixMetres = rule(6000, 'mm')

describe('intervalSpliceCount', () => {
  it('counts one splice for each whole interval the bar contains', () => {
    expect(intervalSpliceCount(12500, sixMetres)).toBe(2)
  })

  it('counts none for a bar shorter than the interval', () => {
    expect(intervalSpliceCount(5900, sixMetres)).toBe(0)
  })

  it.each([
    ['zero length', 0],
    ['negative length', -6000],
    ['NaN length', Number.NaN],
    ['Infinity length', Number.POSITIVE_INFINITY],
  ])('throws for %s', (_label, barLengthMm) => {
    expect(() => intervalSpliceCount(barLengthMm, sixMetres)).toThrow(
      /鉄筋の長さ/,
    )
  })

  it('refuses an interval rule that is not in mm', () => {
    expect(() => intervalSpliceCount(12500, rule(6, 'm'))).toThrow(/mm/)
  })

  it('refuses an interval of zero — it would divide by nothing', () => {
    expect(() => intervalSpliceCount(12500, rule(0, 'mm'))).toThrow(/長さの単位/)
  })
})

describe('spliceCount', () => {
  it('reads the 箇所 value the rule pack supplies', () => {
    expect(spliceCount(rule(0.5, '箇所'))).toBe(0.5)
  })

  it('refuses a rule that is not counted in 箇所', () => {
    expect(() => spliceCount(rule(1, '本'))).toThrow(/箇所/)
  })
})

describe('bandedSpliceRule', () => {
  // 区分の境目は規準の数値なのでルールパックが持つ。ここで見るのは境目の
  // 読み方（未満か以上か）と、区分表そのものが壊れていたら黙って通さないこと。
  const bands = [
    { countRule: rule(0.5, '箇所'), upperBoundRule: rule(5000, 'mm') },
    { countRule: rule(1, '箇所'), upperBoundRule: rule(10000, 'mm') },
    { countRule: rule(2, '箇所'), upperBoundRule: null },
  ]

  it.each([
    [4999, 0.5],
    [5000, 1],
    [9999, 1],
    [10000, 2],
    [11200, 2],
  ])('places %i mm in the band worth %f 箇所', (lengthMm, expected) => {
    expect(spliceCount(bandedSpliceRule(lengthMm, bands))).toBe(expected)
  })

  it.each([
    ['zero length', 0],
    ['negative length', -5000],
    ['NaN length', Number.NaN],
  ])('throws for %s', (_label, lengthMm) => {
    expect(() => bandedSpliceRule(lengthMm, bands)).toThrow(/梁の長さ/)
  })

  it('throws when no band is open-ended — a長い梁 would fall through', () => {
    expect(() =>
      bandedSpliceRule(20000, [
        { countRule: rule(1, '箇所'), upperBoundRule: rule(5000, 'mm') },
      ]),
    ).toThrow(/区分/)
  })

  it('throws when an open-ended band is not the last one', () => {
    expect(() =>
      bandedSpliceRule(4000, [
        { countRule: rule(1, '箇所'), upperBoundRule: null },
        { countRule: rule(2, '箇所'), upperBoundRule: rule(5000, 'mm') },
      ]),
    ).toThrow(/区分/)
  })

  it('throws for an empty band table', () => {
    expect(() => bandedSpliceRule(4000, [])).toThrow(/区分/)
  })
})

describe('spliceLengthMm', () => {
  it('adds the lap length once per splice when the method laps', () => {
    expect(spliceLengthMm(2, 1000, rule(1, 'ratio'))).toBe(2000)
  })

  it('adds nothing when the method does not change the length', () => {
    // ガス圧接 — 1通則5)。箇所数は残るが質量は変わらない。
    expect(spliceLengthMm(2, 1000, rule(0, 'ratio'))).toBe(0)
  })

  it('carries a half splice through to the length', () => {
    expect(spliceLengthMm(0.5, 1000, rule(1, 'ratio'))).toBe(500)
  })

  it('refuses a factor rule that is not a ratio', () => {
    expect(() => spliceLengthMm(2, 1000, rule(1, 'mm'))).toThrow(/ratio/)
  })

  it.each([
    ['negative count', -1, 1000],
    ['NaN count', Number.NaN, 1000],
    ['negative lap length', 1, -1000],
    ['Infinity lap length', 1, Number.POSITIVE_INFINITY],
  ])('throws for %s', (_label, count, lapLength) => {
    expect(() => spliceLengthMm(count, lapLength, rule(1, 'ratio'))).toThrow(
      /継手/,
    )
  })
})
