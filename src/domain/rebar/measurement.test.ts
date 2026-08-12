import { describe, expect, it } from 'vitest'

import type { RuleHit } from '../rules/types'
import { distributionCount, hoopDesignLengthMm } from './measurement'

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
