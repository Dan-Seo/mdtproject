import { describe, expect, it } from 'vitest'

import type { GirderSection, Member } from '../model/member'
import type { GirderSpan } from '../model/project'
import type { Rebar } from '../model/rebar'
import { coverConditions, lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import { resolveGirderEnd } from './girder-ends'
import {
  generateGirderRebar,
  type GirderRebarInput,
} from './girder'
import { stirrupPositions } from './stirrup-layout'

const member: Member = {
  id: '1F-G1-X1Y1-X',
  kind: '大梁',
  memberClass: '躯体',
  sectionId: 'section-G1',
  storyId: '1F',
  position: { axis: 'X', ix: 0, iy: 0 },
}

const section: GirderSection = {
  id: 'section-G1',
  kind: '大梁',
  mark: 'G1',
  b: 400,
  depth: 750,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  main: { size: 'D25', topCount: 4, bottomCount: 4 },
  stirrup: { size: 'D13', pitch: 100 },
}

const span: GirderSpan = {
  axis: 'X',
  centerSpan: 6000,
  clear: 5200,
  startFaceOffsetMm: 400,
  endFaceOffsetMm: 400,
  startSupportLengthAlongAxisMm: 800,
  endSupportLengthAlongAxisMm: 800,
}

function input(
  overrides: Partial<GirderRebarInput> = {},
): GirderRebarInput {
  return { member, section, span, ...overrides }
}

function byRole(
  generated: ReturnType<typeof generateGirderRebar>,
  role: '上端筋' | '下端筋' | 'あばら筋',
) {
  const rebar = generated.find((candidate) => candidate.role === role)
  expect(rebar, `${role} should be generated`).toBeDefined()
  return rebar!
}

function polylineLength(points: Rebar['points'], closed: boolean): number {
  const pairs = points.slice(1).map((point, index) => [points[index], point])
  if (closed) pairs.push([points.at(-1)!, points[0]])

  return pairs.reduce((total, [from, to]) => {
    const [dx, dy, dz] = to.map((value, index) => value - from[index])
    return total + Math.hypot(dx, dy, dz)
  }, 0)
}

const coverRule = lookupRule(
  jpMlitRulePack,
  'cover.minimum',
  coverConditions(section),
)
const fabricationAdditionRule = lookupRule(
  jpMlitRulePack,
  'cover.fabrication.addition',
  {},
)
const fabricationCover = coverRule.value + fabricationAdditionRule.value
const startOffsetRule = lookupRule(
  jpMlitRulePack,
  'stirrup.start-offset',
  {},
)

describe('generateGirderRebar', () => {
  it('generates [上端筋, 下端筋, あばら筋] as representative rows', () => {
    const expectedStirrups = stirrupPositions(
      span.clear,
      section.stirrup.pitch,
      startOffsetRule.value,
    )
    const generated = generateGirderRebar(input(), jpMlitRulePack)

    expect(generated.map(({ role }) => role)).toEqual([
      '上端筋',
      '下端筋',
      'あばら筋',
    ])
    expect(byRole(generated, '上端筋')).toMatchObject({
      shape: 'hook90',
      closed: false,
      count: 4,
    })
    expect(byRole(generated, '下端筋')).toMatchObject({
      shape: 'hook90',
      closed: false,
      count: 4,
    })
    expect(byRole(generated, 'あばら筋')).toMatchObject({
      shape: 'hoop',
      closed: true,
      count: expectedStirrups.positionsMm.length,
    })
  })

  it('adds both 折曲げ定着 lengths to the sample G1 上端筋 without rounding', () => {
    const endInput = {
      barSize: section.main.size,
      fc: section.fc,
      grade: section.grade,
      bendDirection: '下' as const,
    }
    const start = resolveGirderEnd(
      {
        ...endInput,
        supportLengthMm: span.startSupportLengthAlongAxisMm,
      },
      jpMlitRulePack,
    )
    const end = resolveGirderEnd(
      {
        ...endInput,
        supportLengthMm: span.endSupportLengthAlongAxisMm,
      },
      jpMlitRulePack,
    )
    const top = byRole(generateGirderRebar(input(), jpMlitRulePack), '上端筋')

    expect(start.kind).toBe('折曲げ定着')
    expect(end.kind).toBe('折曲げ定着')
    expect(top.length).toBe(span.clear + start.lengthMm + end.lengthMm)
    expect(polylineLength(top.points, top.closed)).toBe(top.length)
    expect(top.formula).not.toContain('切上げ')
  })

  it('uses 直線定着 at both ends when virtual supports are large enough', () => {
    const largeSupportSpan: GirderSpan = {
      ...span,
      centerSpan: 6600,
      startFaceOffsetMm: 700,
      endFaceOffsetMm: 700,
      startSupportLengthAlongAxisMm: 1400,
      endSupportLengthAlongAxisMm: 1400,
    }
    const endInput = {
      supportLengthMm: 1400,
      barSize: section.main.size,
      fc: section.fc,
      grade: section.grade,
      bendDirection: '下' as const,
    }
    const detail = resolveGirderEnd(endInput, jpMlitRulePack)
    const top = byRole(
      generateGirderRebar(
        input({ span: largeSupportSpan }),
        jpMlitRulePack,
      ),
      '上端筋',
    )

    expect(detail.kind).toBe('直線定着')
    expect(top.shape).toBe('straight')
    expect(top.length).toBe(largeSupportSpan.clear + 2 * detail.lengthMm)
    expect(top.points).toEqual([
      [-detail.lengthMm, section.depth - fabricationCover, fabricationCover],
      [
        largeSupportSpan.clear + detail.lengthMm,
        section.depth - fabricationCover,
        fabricationCover,
      ],
    ])
  })

  it('records two path-distance 定着 zones within each 主筋 加工長', () => {
    const generated = generateGirderRebar(input(), jpMlitRulePack)

    for (const role of ['上端筋', '下端筋'] as const) {
      const main = byRole(generated, role)

      const bendDirection: '上' | '下' = role === '上端筋' ? '下' : '上'
      const endInput = {
        barSize: section.main.size,
        fc: section.fc,
        grade: section.grade,
        bendDirection,
      }
      const start = resolveGirderEnd(
        {
          ...endInput,
          supportLengthMm: span.startSupportLengthAlongAxisMm,
        },
        jpMlitRulePack,
      )
      const end = resolveGirderEnd(
        {
          ...endInput,
          supportLengthMm: span.endSupportLengthAlongAxisMm,
        },
        jpMlitRulePack,
      )

      expect(main.zones).toEqual([
        { kind: '定着', pathFromMm: 0, pathToMm: start.lengthMm },
        {
          kind: '定着',
          pathFromMm: main.length - end.lengthMm,
          pathToMm: main.length,
        },
      ])

      for (const zone of main.zones ?? []) {
        expect(zone.pathFromMm).toBeGreaterThanOrEqual(0)
        expect(zone.pathFromMm).toBeLessThan(zone.pathToMm)
        expect(zone.pathToMm).toBeLessThanOrEqual(main.length)
      }
    }
  })

  it('derives あばら筋 count from the bounded placement array', () => {
    const positions = stirrupPositions(
      span.clear,
      section.stirrup.pitch,
      startOffsetRule.value,
    ).positionsMm
    const stirrup = byRole(
      generateGirderRebar(input(), jpMlitRulePack),
      'あばら筋',
    )

    expect(stirrup.count).toBe(positions.length)
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions.every((position) => position <= span.clear)).toBe(true)
  })

  it('keeps both 主筋 counts exactly as supplied by the section list (ADR-012)', () => {
    const changedSection: GirderSection = {
      ...section,
      main: { ...section.main, topCount: 7, bottomCount: 9 },
    }
    const generated = generateGirderRebar(
      input({ section: changedSection }),
      jpMlitRulePack,
    )

    expect(byRole(generated, '上端筋').count).toBe(7)
    expect(byRole(generated, '下端筋').count).toBe(9)
  })

  it('tracks only existing rules in a stable contribution order', () => {
    const knownKeys = new Set(jpMlitRulePack.entries.map(({ key }) => key))
    const generated = generateGirderRebar(input(), jpMlitRulePack)
    const bentMainRules = [
      'cover.minimum',
      'cover.fabrication.addition',
      'anchorage.L1',
      'anchorage.L1h',
      'anchorage.La',
      'anchorage.bent.tail.minimum',
      'anchorage.bent.projection.minimum',
    ]

    expect(byRole(generated, '上端筋').rules).toEqual(bentMainRules)
    expect(byRole(generated, '下端筋').rules).toEqual(bentMainRules)
    expect(byRole(generated, 'あばら筋').rules).toEqual([
      'cover.minimum',
      'cover.fabrication.addition',
      'bend.hook135',
      'stirrup.start-offset',
    ])

    for (const rebar of generated) {
      expect(new Set(rebar.rules).size).toBe(rebar.rules.length)
      for (const key of rebar.rules) {
        expect(knownKeys.has(key), `${key} should exist in the rule pack`).toBe(
          true,
        )
      }
    }
  })

  it('shows both end methods and the 加工用かぶり calculation in formulas', () => {
    const generated = generateGirderRebar(input(), jpMlitRulePack)
    const coverFormula =
      `加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ ` +
      `加算 ${fabricationAdditionRule.value} ＝ ${fabricationCover}）`

    for (const role of ['上端筋', '下端筋'] as const) {
      const main = byRole(generated, role)
      expect(main.formula).toContain('始端 折曲げ定着')
      expect(main.formula).toContain('終端 折曲げ定着')
      expect(main.formula).toContain(coverFormula)
    }

    expect(byRole(generated, 'あばら筋').formula).toContain(coverFormula)
  })
})
