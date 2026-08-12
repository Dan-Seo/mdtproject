import { describe, expect, it } from 'vitest'

import type { RuleHit, RulePack } from '../rules/types'
import { lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import {
  resolveGirderEnd,
  type GirderEndInput,
} from './girder-ends'

const input: GirderEndInput = {
  supportLengthMm: 800,
  barSize: 'D25',
  fc: 24,
  grade: 'SD345',
  bendDirection: '下',
}

function millimetres(rule: RuleHit, diameter?: number): number {
  if (rule.unit === 'mm') return rule.value
  if (rule.unit === 'd' && diameter !== undefined) {
    return rule.value * diameter
  }

  throw new Error(`Unexpected unit for ${rule.key}: ${rule.unit}`)
}

function columnMinimumCoverRule(pack: RulePack): RuleHit {
  const candidates = pack.entries.filter(
    ({ key, conditions }) =>
      key === 'cover.minimum' &&
      conditions.memberKind === '柱' &&
      conditions.soilContact !== true,
  )

  if (candidates.length === 0) {
    throw new Error('No non-soil 柱 cover.minimum rule')
  }

  const conservative = candidates.reduce((largest, candidate) =>
    candidate.value > largest.value ? candidate : largest,
  )

  return lookupRule(pack, conservative.key, conservative.conditions)
}

function expectedRules(pack: RulePack, supportLengthMm = input.supportLengthMm) {
  const diameter = Number(input.barSize.replace(/^D/, ''))
  const straight = lookupRule(pack, 'anchorage.L1', {
    fc: input.fc,
    grade: input.grade,
    hook: false,
  })
  const bent = lookupRule(pack, 'anchorage.L1h', {
    fc: input.fc,
    grade: input.grade,
    hook: true,
  })
  const projection = lookupRule(pack, 'anchorage.La', {
    fc: input.fc,
    grade: input.grade,
  })
  const tailMinimum = lookupRule(
    pack,
    'anchorage.bent.tail.minimum',
    {},
  )
  const projectionMinimum = lookupRule(
    pack,
    'anchorage.bent.projection.minimum',
    { detail: '梁主筋の柱内定着' },
  )
  const minimumCover = columnMinimumCoverRule(pack)
  const fabricationAddition = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const fabricationCoverMm =
    millimetres(minimumCover) + millimetres(fabricationAddition)
  const straightLengthMm = millimetres(straight, diameter)
  const projectionMm = Math.max(
    millimetres(projection, diameter),
    supportLengthMm * projectionMinimum.value,
  )
  const bentLengthMm = Math.max(
    millimetres(bent, diameter),
    projectionMm + millimetres(tailMinimum, diameter),
  )

  return {
    fabricationCoverMm,
    straightLengthMm,
    bentLengthMm,
    projectionMm,
    rawProjectionMm: millimetres(projection, diameter),
  }
}

describe('resolveGirderEnd', () => {
  it('uses 折曲げ定着 when the sample D25 L1 cannot fit in an 800mm 柱', () => {
    const expected = expectedRules(jpMlitRulePack)

    expect(expected.straightLengthMm).toBeGreaterThan(
      input.supportLengthMm - expected.fabricationCoverMm,
    )
    expect(resolveGirderEnd(input, jpMlitRulePack)).toEqual({
      kind: '折曲げ定着',
      lengthRule: 'anchorage.L1h',
      projectionRule: 'anchorage.La',
      lengthMm: expected.bentLengthMm,
      projectionMm: expected.projectionMm,
      direction: input.bendDirection,
    })
  })

  it('uses 直線定着 when the support is sufficiently large', () => {
    const supportLengthMm = 1400
    const expected = expectedRules(jpMlitRulePack, supportLengthMm)

    expect(
      resolveGirderEnd(
        { ...input, supportLengthMm },
        jpMlitRulePack,
      ),
    ).toEqual({
      kind: '直線定着',
      lengthRule: 'anchorage.L1',
      lengthMm: expected.straightLengthMm,
    })
  })

  it('allows 直線定着 exactly at the fabrication-cover boundary', () => {
    const expected = expectedRules(jpMlitRulePack)
    const supportLengthMm =
      expected.straightLengthMm + expected.fabricationCoverMm

    expect(
      resolveGirderEnd(
        { ...input, supportLengthMm },
        jpMlitRulePack,
      ),
    ).toEqual({
      kind: '直線定着',
      lengthRule: 'anchorage.L1',
      lengthMm: expected.straightLengthMm,
    })
  })

  it('throws when even the 折曲げ projection cannot fit', () => {
    const expected = expectedRules(jpMlitRulePack)
    const supportLengthMm =
      expected.fabricationCoverMm + expected.rawProjectionMm - 1

    expect(() =>
      resolveGirderEnd(
        { ...input, supportLengthMm },
        jpMlitRulePack,
      ),
    ).toThrow(/折曲げ定着.*収まらない/)
  })
})
