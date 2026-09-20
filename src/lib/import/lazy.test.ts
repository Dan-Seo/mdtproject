import { describe, expect, it } from 'vitest'

import {
  loadDrawingSetModules,
  loadFramingModules,
  loadSectionListParser,
  peekDrawingSetModules,
  peekFramingModules,
  peekSectionListParser,
} from './lazy'

/**
 * 解析器を受け取る前は「まだ無い」と答える。ここが null を返す間、取入の画面は
 * 候補なしとして描く — 待たせない代わりに、勝手な既定値も作らない。
 */
describe('図面取入の解析器の遅延境界', () => {
  it('受け取る前は null、受け取った後は同じ版を同期で返す', async () => {
    expect(peekSectionListParser()).toBeNull()
    expect(peekFramingModules()).toBeNull()
    expect(peekDrawingSetModules()).toBeNull()

    const parser = await loadSectionListParser()
    const framing = await loadFramingModules()
    const drawingSet = await loadDrawingSetModules()

    expect(typeof parser.parseSectionLists).toBe('function')
    expect(typeof framing.parse.parseFramingPlan).toBe('function')
    expect(typeof framing.elevation.parseFrameElevations).toBe('function')
    expect(typeof framing.apply.applyFramingPlan).toBe('function')
    expect(typeof framing.apply.applyElevation).toBe('function')
    expect(typeof drawingSet.reconcile.assembleDrawingSet).toBe('function')
    expect(typeof drawingSet.plan.previewDrawingSetPlan).toBe('function')
    expect(typeof drawingSet.plan.resolveDrawingSetPlan).toBe('function')
    expect(typeof drawingSet.apply.applyDrawingSet).toBe('function')

    expect(peekSectionListParser()).toBe(parser)
    expect(peekFramingModules()).toBe(framing)
    expect(peekDrawingSetModules()).toBe(drawingSet)
  })

  it('二度目の取得でも控えが入れ替わらない — 選び直しで待たせない', async () => {
    const framing = peekFramingModules()
    expect(framing).not.toBeNull()
    expect(await loadFramingModules()).toBe(framing)
    expect(peekFramingModules()).toBe(framing)
  })
})
