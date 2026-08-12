import { describe, expect, it } from 'vitest'

import { distributionCount, hoopDesignLengthMm } from './measurement'

// 規準どおりの値そのものは tests/golden/quantity-measurement.test.ts が原文転写と
// 突き合わせる。ここで見るのは、規準が想定していない入力で黙って数字を返さないこと。

describe('hoopDesignLengthMm', () => {
  it('returns the perimeter of the design section', () => {
    expect(hoopDesignLengthMm(400, 750)).toBe(2300)
  })

  it.each([
    ['zero width', 0, 750],
    ['zero depth', 400, 0],
    ['negative width', -400, 750],
    ['NaN depth', 400, Number.NaN],
  ])('throws for %s', (_label, widthMm, depthMm) => {
    expect(() => hoopDesignLengthMm(widthMm, depthMm)).toThrow(
      /断面の設計寸法/,
    )
  })
})

describe('distributionCount', () => {
  it('rounds the quotient up before adding the closing bar', () => {
    expect(distributionCount(4750, 200)).toBe(25)
  })

  it('still adds one when the length divides evenly', () => {
    expect(distributionCount(5200, 100)).toBe(53)
  })

  it.each([
    ['zero length', 0, 100],
    ['negative length', -5200, 100],
    ['NaN length', Number.NaN, 100],
  ])('throws for %s', (_label, partLengthMm, pitchMm) => {
    expect(() => distributionCount(partLengthMm, pitchMm)).toThrow(
      /その部分の長さ/,
    )
  })

  it.each([
    ['zero pitch', 5200, 0],
    ['negative pitch', 5200, -100],
    ['NaN pitch', 5200, Number.NaN],
  ])('throws for %s', (_label, partLengthMm, pitchMm) => {
    expect(() => distributionCount(partLengthMm, pitchMm)).toThrow(
      /鉄筋の間隔/,
    )
  })
})
