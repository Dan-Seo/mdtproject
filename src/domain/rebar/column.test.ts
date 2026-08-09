import { describe, expect, it } from 'vitest'

import type { ColumnSection, Member } from '../model/member'
import type { Story } from '../model/project'
import { lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import { generateColumnRebar, type ColumnRebarInput } from './column'

const member: Member = {
  id: '1F-X2Y2',
  kind: '柱',
  memberClass: '躯体',
  sectionId: 'section-C1',
  storyId: '1F',
  position: { ix: 1, iy: 1 },
}

const section: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100 },
}

const story: Story = { id: '1F', name: '1階', height: 4200 }

function input(
  overrides: Partial<ColumnRebarInput> = {},
): ColumnRebarInput {
  return {
    member,
    section,
    story,
    beamDepthAbove: 750,
    ...overrides,
  }
}

function byRole(
  generated: ReturnType<typeof generateColumnRebar>,
  role: '主筋' | '帯筋',
) {
  const rebar = generated.find((candidate) => candidate.role === role)
  expect(rebar, `${role} should be generated`).toBeDefined()
  return rebar!
}

describe('generateColumnRebar', () => {
  it('generates the fixed C1 input as one 主筋 row and one 帯筋 row', () => {
    const generated = generateColumnRebar(input(), jpMlitRulePack)
    const main = byRole(generated, '主筋')
    const hoop = byRole(generated, '帯筋')

    expect(generated).toHaveLength(2)
    expect(main).toMatchObject({
      memberId: member.id,
      size: 'D25',
      shape: 'straight',
      closed: false,
      count: 12,
    })
    expect(hoop).toMatchObject({
      memberId: member.id,
      size: 'D13',
      shape: 'hoop',
      closed: true,
      count: 36,
    })
  })

  it('records only existing rule keys on every generated Rebar', () => {
    const knownKeys = new Set(jpMlitRulePack.entries.map(({ key }) => key))
    const generated = generateColumnRebar(input(), jpMlitRulePack)

    for (const rebar of generated) {
      expect(rebar.rules.length).toBeGreaterThan(0)
      for (const key of rebar.rules) {
        expect(knownKeys.has(key), `${key} should exist in the rule pack`).toBe(
          true,
        )
      }
    }

    expect(byRole(generated, '主筋').rules).toEqual([
      'cover.minimum',
      'anchorage.L2',
      'lap.L1',
      'rounding.length',
    ])
    expect(byRole(generated, '帯筋').rules).toEqual([
      'cover.minimum',
      'bend.hook135',
      'rounding.length',
    ])
  })

  it('uses the supplied 主筋 count without structurally recalculating it', () => {
    const changedSection: ColumnSection = {
      ...section,
      main: { ...section.main, count: 16 },
    }

    const main = byRole(
      generateColumnRebar(input({ section: changedSection }), jpMlitRulePack),
      '主筋',
    )

    expect(main.count).toBe(changedSection.main.count)
  })

  it('uses the supplied beamDepthAbove instead of a global constant', () => {
    const baseHoop = byRole(
      generateColumnRebar(input(), jpMlitRulePack),
      '帯筋',
    )
    const changedHoop = byRole(
      generateColumnRebar(input({ beamDepthAbove: 800 }), jpMlitRulePack),
      '帯筋',
    )

    expect(changedHoop.count).not.toBe(baseHoop.count)
    expect(changedHoop.count).toBe(baseHoop.count - 1)
  })

  it('keeps mm geometry and reproducible calculations on each row', () => {
    const generated = generateColumnRebar(input(), jpMlitRulePack)
    const main = byRole(generated, '主筋')
    const hoop = byRole(generated, '帯筋')
    const anchorage = lookupRule(jpMlitRulePack, 'anchorage.L2', {
      fc: section.fc,
      grade: section.grade,
      hook: false,
    })
    const lap = lookupRule(jpMlitRulePack, 'lap.L1', {
      fc: section.fc,
      grade: section.grade,
      hook: false,
    })
    const hook135 = lookupRule(jpMlitRulePack, 'bend.hook135', {})
    const rounding = lookupRule(jpMlitRulePack, 'rounding.length', {})
    const mainDiameter = Number(section.main.size.replace(/^D/, ''))
    const hoopDiameter = Number(section.hoop.size.replace(/^D/, ''))

    expect(main.points).toHaveLength(2)
    expect(hoop.points).toHaveLength(4)
    expect(main.length % rounding.value).toBe(0)
    expect(hoop.length % rounding.value).toBe(0)
    expect(main.formula).toContain(
      `定着長さ L2 ${anchorage.value}d(${anchorage.value * mainDiameter})`,
    )
    expect(main.formula).toContain(
      `重ね継手長さ L1 ${lap.value}d(${lap.value * mainDiameter})`,
    )
    expect(main.formula).toContain(`${rounding.expr.split('に')[0]}切上げ`)
    expect(hoop.formula).toContain(`2×{(${section.b}−2×`)
    expect(hoop.formula).toContain(
      `135°フック余長 ${hook135.value}d(${hook135.value * hoopDiameter})`,
    )
    expect(hoop.formula).toContain(
      '⌈(階高 4200 − 上部大梁せい 750) ÷ 帯筋ピッチ 100⌉ ＋ 1 ＝ 36',
    )
  })
})
