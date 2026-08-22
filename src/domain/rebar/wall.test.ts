import { describe, expect, it } from 'vitest'

import type { Member, WallSection } from '../model/member'
import type { WallSpan } from '../model/project'
import { lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import { generateWallRebar, type WallRebarInput } from './wall'

const member: Member = {
  id: '1F-W1-X1Y1-X',
  kind: '耐震壁',
  memberClass: '躯体',
  sectionId: 'section-W1',
  storyId: '1F',
  position: { axis: 'X', ix: 0, iy: 0 },
}

const section: WallSection = {
  id: 'section-W1',
  kind: '耐震壁',
  mark: 'W1',
  thickness: 200,
  fc: 24,
  grade: 'SD345',
  exposure: '屋内',
  finish: '仕上げあり',
  spliceMethod: '重ね継手',
  layers: 2,
  vertical: { size: 'D13', pitch: 200, startOffsetMm: 100 },
  horizontal: { size: 'D13', pitch: 200, startOffsetMm: 100 },
}

// 6000 スパン・柱 800×800 の内法 5200、階高 4200 から大梁せい 750 を引いた内法 3450。
const span: WallSpan = {
  axis: 'X',
  clearLengthMm: 5200,
  clearHeightMm: 3450,
  startFaceOffsetMm: 400,
  endFaceOffsetMm: 400,
  girderDepthAboveMm: 750,
}

function input(overrides: Partial<WallRebarInput> = {}): WallRebarInput {
  return { member, section, span, ...overrides }
}

const diameter = 13
const conditions = { fc: section.fc, grade: section.grade, hook: false }
const anchorage =
  lookupRule(jpMlitRulePack, 'anchorage.L1', conditions).value * diameter
const tableLap =
  lookupRule(jpMlitRulePack, 'lap.L1', conditions).value * diameter
const wallLapMinimum =
  lookupRule(jpMlitRulePack, 'lap.wall.minimum', {}).value * diameter
const lap = Math.max(tableLap, wallLapMinimum)
const distributionAddition = lookupRule(
  jpMlitRulePack,
  'measure.distribution.addition',
  {},
).value

function byRole(
  generated: ReturnType<typeof generateWallRebar>,
  role: '縦筋' | '横筋',
) {
  const rebar = generated.find((candidate) => candidate.role === role)
  expect(rebar, `${role} should be generated`).toBeDefined()
  return rebar!
}

describe('generateWallRebar', () => {
  it('generates 縦筋 and 横筋 only', () => {
    // 幅止筋は作らない — 1通則3) は長さを壁にも与えるが、本数を定める条文は
    // 2（３）梁3) で梁しか名指さない。本数を製品が作らないと計上できない。
    expect(generateWallRebar(input(), jpMlitRulePack).map(({ role }) => role))
      .toEqual(['縦筋', '横筋'])
  })

  describe('縦筋 — 積算基準 2（５）壁1)①', () => {
    it('measures 内法高さ plus 定着 at both ends', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')

      // 「接続する他の部分に定着するものとし、壁の高さ……に定着長さを加えた」
      // 上は大梁、下は床板・大梁へ定着するので両端に付く。
      expect(vertical.length).toBe(3450 + 2 * anchorage + lap)
    })

    it('counts 1通則7) over 内法長さ, doubled by ダブル配筋', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')

      const perLayer = Math.ceil(5200 / 200) + distributionAddition
      expect(vertical.count).toBe(perLayer * 2)
    })

    it('halves the count for シングル配筋', () => {
      const single = generateWallRebar(
        input({ section: { ...section, layers: 1 } }),
        jpMlitRulePack,
      )
      const perLayer = Math.ceil(5200 / 200) + distributionAddition

      expect(byRole(single, '縦筋').count).toBe(perLayer)
    })

    it('takes 継手 as 各階に1か所 (2（５）壁1)②), not the 1通則4) interval', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')

      expect(vertical.splice?.countPerBar).toBe(1)
      expect(vertical.splice?.rules.map(({ key }) => key)).toContain(
        'measure.splice.wall.vertical',
      )
    })

    it('draws 定着 beyond both ends of the 内法 panel', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')
      const [bottom, top] = vertical.points

      expect(bottom[1]).toBe(-anchorage)
      expect(top[1]).toBe(3450 + anchorage)
    })
  })

  describe('横筋 — 積算基準 2（５）壁1)①', () => {
    it('measures 内法長さ plus 定着 at both ends', () => {
      const horizontal = byRole(
        generateWallRebar(input(), jpMlitRulePack),
        '横筋',
      )
      const beforeSplice = 5200 + 2 * anchorage
      const interval = lookupRule(jpMlitRulePack, 'measure.splice.interval', {
        size: 'D13',
      }).value
      const splices = Math.floor(beforeSplice / interval)

      expect(horizontal.length).toBe(beforeSplice + splices * lap)
    })

    it('counts 1通則7) over 内法高さ, doubled by ダブル配筋', () => {
      const horizontal = byRole(
        generateWallRebar(input(), jpMlitRulePack),
        '横筋',
      )

      const perLayer = Math.ceil(3450 / 200) + distributionAddition
      expect(horizontal.count).toBe(perLayer * 2)
    })

    it('returns to 1通則4) for its 継手, as 2（５）壁1)② directs', () => {
      const horizontal = byRole(
        generateWallRebar(input(), jpMlitRulePack),
        '横筋',
      )

      expect(horizontal.splice?.rules.map(({ key }) => key)).toContain(
        'measure.splice.interval',
      )
    })
  })

  describe('耐力壁の重ね継手長さ — 標準仕様書 5.3.4(3)(ｱ)', () => {
    it('takes the larger of 40d and 表5.3.2', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')

      expect(vertical.splice?.lengthMm).toBe(lap)
      expect(lap).toBeGreaterThanOrEqual(wallLapMinimum)
      expect(lap).toBeGreaterThanOrEqual(tableLap)
    })

    it('cites 表5.3.2 and the 耐力壁 lower bound together', () => {
      const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')
      const keys = vertical.splice?.rules.map(({ key }) => key) ?? []

      expect(keys).toContain('lap.L1')
      expect(keys).toContain('lap.wall.minimum')
    })
  })

  describe('ガス圧接 — 1通則5)', () => {
    it('keeps the 箇所数 but adds no length', () => {
      const generated = generateWallRebar(
        input({ section: { ...section, spliceMethod: 'ガス圧接' } }),
        jpMlitRulePack,
      )
      const vertical = byRole(generated, '縦筋')

      expect(vertical.splice?.countPerBar).toBe(1)
      expect(vertical.splice?.lengthMm).toBe(0)
      expect(vertical.length).toBe(3450 + 2 * anchorage)
    })
  })

  it('carries the かぶり and 定着 rules it actually looked up', () => {
    const vertical = byRole(generateWallRebar(input(), jpMlitRulePack), '縦筋')
    const keys = vertical.ruleHits.map(({ key }) => key)

    expect(keys).toContain('cover.minimum')
    expect(keys).toContain('anchorage.L1')
  })
})
