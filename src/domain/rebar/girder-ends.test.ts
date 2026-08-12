import { describe, expect, it } from 'vitest'

import type { ColumnSection } from '../model/member'
import { MemberUnsupportedError } from '../model/unsupported'
import type { RuleHit, RulePack } from '../rules/types'
import { coverConditions, lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import {
  resolveGirderEnd,
  type GirderEndInput,
} from './girder-ends'

const supportColumnSection: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
}

const input: GirderEndInput = {
  supportLengthMm: 800,
  supportCover: coverConditions(supportColumnSection),
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
  const minimumCover = lookupRule(pack, 'cover.minimum', input.supportCover)
  const fabricationAddition = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const fabricationCoverMm =
    millimetres(minimumCover) + millimetres(fabricationAddition)
  const straightLengthMm = millimetres(straight, diameter)
  const laMm = millimetres(projection, diameter)
  const projectionMinimumMm = supportLengthMm * projectionMinimum.value
  const projectionMm = Math.max(laMm, projectionMinimumMm)
  const l1hMm = millimetres(bent, diameter)
  const tailMinimumMm = projectionMm + millimetres(tailMinimum, diameter)
  const bentLengthMm = Math.max(l1hMm, tailMinimumMm)

  return {
    fabricationCoverMm,
    straightLengthMm,
    bentLengthMm,
    projectionMm,
    rawProjectionMm: laMm,
    laMm,
    projectionMinimumMm,
    l1hMm,
    tailMinimumMm,
    // 판정에 실제로 쓴 행들 — 지점 柱의 かぶり는 大梁 조건으로 되짚을 수 없어
    // 판정 결과에 실려 나와야 근거 표시에서 살아남는다.
    straightUsedRules: [straight, minimumCover, fabricationAddition],
    bentUsedRules: [
      straight,
      bent,
      projection,
      tailMinimum,
      projectionMinimum,
      minimumCover,
      fabricationAddition,
    ],
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
      lengthRule:
        expected.l1hMm >= expected.tailMinimumMm
          ? 'anchorage.L1h'
          : 'anchorage.bent.tail.minimum',
      projectionRule:
        expected.laMm >= expected.projectionMinimumMm
          ? 'anchorage.La'
          : 'anchorage.bent.projection.minimum',
      lengthMm: expected.bentLengthMm,
      l1hMm: expected.l1hMm,
      tailMinimumMm: expected.tailMinimumMm,
      projectionMm: expected.projectionMm,
      laMm: expected.laMm,
      projectionMinimumMm: expected.projectionMinimumMm,
      direction: input.bendDirection,
      usedRules: expected.bentUsedRules,
    })
  })

  it('attributes the 折曲げ length to the term that actually governs', () => {
    // 余長下限이 지배할 때 그 길이는 表5.3.4에 없는 값이다 — L1h로 제시하면
    // 근거 표시가 거짓이 된다. 샘플 D25/柱800이 바로 그 경우다.
    const expected = expectedRules(jpMlitRulePack)
    const detail = resolveGirderEnd(input, jpMlitRulePack)

    expect(expected.tailMinimumMm).toBeGreaterThan(expected.l1hMm)
    expect(detail.kind).toBe('折曲げ定着')
    expect(detail.lengthRule).toBe('anchorage.bent.tail.minimum')
    expect(detail.lengthMm).toBe(expected.tailMinimumMm)
  })

  it('attributes the 投影長 to the term that actually governs', () => {
    // 投影 역시 max(La, 柱せい×3/4)다 — 下限이 이기면 表5.3.5에 없는 값이므로
    // La로 제시하면 거짓이 된다. 샘플 柱800이 그 경우다.
    const expected = expectedRules(jpMlitRulePack)
    const detail = resolveGirderEnd(input, jpMlitRulePack)

    if (detail.kind !== '折曲げ定着') throw new Error('expected 折曲げ定着')

    expect(expected.projectionMinimumMm).toBeGreaterThan(expected.laMm)
    expect(detail.projectionRule).toBe('anchorage.bent.projection.minimum')
    expect(detail.projectionMm).toBe(expected.projectionMinimumMm)
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
      usedRules: expected.straightUsedRules,
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
      usedRules: expected.straightUsedRules,
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

  it('uses the support 柱 own かぶり conditions, not the most conservative row', () => {
    // 屋内·仕上げあり 柱는 最小かぶり가 작아 使用可能 투영이 넓어진다. 표에서 가장
    // 큰 행을 골라 쓰면 屋内 柱에도 屋外 값이 적용돼 直線/折曲げ 분기와 加工長이
    // 함께 뒤집힌다.
    const indoor: ColumnSection = {
      ...supportColumnSection,
      exposure: '屋内',
      finish: '仕上げあり',
    }
    const indoorCover = lookupRule(
      jpMlitRulePack,
      'cover.minimum',
      coverConditions(indoor),
    )
    const outdoorCover = lookupRule(
      jpMlitRulePack,
      'cover.minimum',
      coverConditions(supportColumnSection),
    )

    expect(indoorCover.value).toBeLessThan(outdoorCover.value)

    const detail = resolveGirderEnd(
      { ...input, supportCover: coverConditions(indoor) },
      jpMlitRulePack,
    )

    expect(detail.usedRules).toContain(indoorCover)
    expect(detail.usedRules).not.toContain(outdoorCover)
  })

  it('reports the unfitting 定着 as a member-level unsupported reason', () => {
    // 지점 柱를 줄이면 사용자 입력만으로 도달한다 — 페인을 죽이는 결함이 아니라
    // 그 부재를 산정할 수 없다는 판정이어야 한다 (M3a).
    const expected = expectedRules(jpMlitRulePack)
    const supportLengthMm =
      expected.fabricationCoverMm + expected.rawProjectionMm - 1

    try {
      resolveGirderEnd({ ...input, supportLengthMm }, jpMlitRulePack)
      expect.unreachable('resolveGirderEnd should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MemberUnsupportedError)
      expect((error as MemberUnsupportedError).reason).toBe('定着不成立')
    }
  })
})
