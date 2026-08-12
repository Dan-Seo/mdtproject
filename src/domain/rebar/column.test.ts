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
  exposure: '屋外',
  finish: '仕上げなし',
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
    // 既定は「下は継手・上は定着」＝ スタック最上段の柱。
    ends: { bottom: '継手', top: '定着' },
    ...overrides,
  }
}

const mainDiameter = Number(section.main.size.replace(/^D/, ''))
const conditions = { fc: section.fc, grade: section.grade, hook: false }
const anchorage =
  lookupRule(jpMlitRulePack, 'anchorage.L1', conditions).value * mainDiameter
const lap =
  lookupRule(jpMlitRulePack, 'lap.L1', conditions).value * mainDiameter
const minimumCover = lookupRule(jpMlitRulePack, 'cover.minimum', {
  memberKind: section.kind,
  soilContact: false,
  exposure: section.exposure,
  finish: section.finish,
}).value
const fabricationAddition = lookupRule(
  jpMlitRulePack,
  'cover.fabrication.addition',
  {},
).value
const fabricationCover = minimumCover + fabricationAddition

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

    // 端部の順（下端 → 上端）で並ぶ。既定入力は 下端 継手・上端 定着。
    expect(byRole(generated, '主筋').rules).toEqual([
      'cover.minimum',
      'cover.fabrication.addition',
      'lap.L1',
      'anchorage.L1',
    ])
    expect(byRole(generated, '帯筋').rules).toEqual([
      'cover.minimum',
      'cover.fabrication.addition',
      'bend.hook135',
    ])
  })

  it('counts the storey joint once instead of adding 定着 and 継手 to every storey (R7)', () => {
    const lower = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )
    const upper = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '継手', top: '定着' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(lower.length).toBe(story.height + anchorage)
    expect(upper.length).toBe(story.height + lap + anchorage)

    // 2층 스택 합계는 「기초 定着 ＋ 접합부 継手 1회 ＋ 지붕 定着」뿐이다.
    // 예전에는 층마다 定着＋継手가 붙어 継手 하나를 더 세고 있었다.
    const doubleCounted = (story.height + anchorage + lap) * 2

    expect(lower.length + upper.length).toBeLessThan(doubleCounted)
    expect(doubleCounted - (lower.length + upper.length)).toBe(lap)
  })

  it('anchors both ends when the column is alone in its stack', () => {
    const main = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: '定着' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(main.length).toBe(story.height + 2 * anchorage)
  })

  it('extends the 3D geometry by exactly what each end contributes', () => {
    const main = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '継手', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(main.points[0][1]).toBe(-lap)
    expect(main.points[1][1]).toBe(story.height)
  })

  it('cites 重ね継手 only on the rows that actually carry a joint', () => {
    const withoutLap = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: '定着' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )
    const withLap = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '継手', top: '定着' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(withoutLap.rules).not.toContain('lap.L1')
    expect(withoutLap.formula).not.toContain('重ね継手')
    expect(withLap.rules).toContain('lap.L1')
  })

  it('cites 定着 only on the rows that actually reach a stack end', () => {
    const interior = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '継手', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(interior.rules).not.toContain('anchorage.L1')
    expect(interior.formula).not.toContain('定着')
    expect(interior.length).toBe(story.height + lap)
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
    const anchorage = lookupRule(jpMlitRulePack, 'anchorage.L1', {
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
    const mainDiameter = Number(section.main.size.replace(/^D/, ''))
    const hoopDiameter = Number(section.hoop.size.replace(/^D/, ''))
    const expectedHoopLength =
      2 *
        (section.b - 2 * fabricationCover +
          (section.d - 2 * fabricationCover)) +
      2 * hook135.value * hoopDiameter

    expect(main.points).toHaveLength(2)
    expect(hoop.points).toHaveLength(4)
    expect(main.points[0][0]).toBe(fabricationCover)
    expect(main.points[0][2]).toBe(fabricationCover)
    expect(hoop.points[0]).toEqual([fabricationCover, 0, fabricationCover])
    expect(hoop.length).toBe(expectedHoopLength)
    expect(main.formula).toContain(
      `定着長さ L1 ${anchorage.value}d(${anchorage.value * mainDiameter})`,
    )
    expect(main.formula).toContain(
      `重ね継手長さ L1 ${lap.value}d(${lap.value * mainDiameter})`,
    )
    const fabricationCoverFormula =
      `加工用かぶり厚さ（最小かぶり ${minimumCover} ＋ ` +
      `加算 ${fabricationAddition} ＝ ${fabricationCover}）`
    expect(main.formula).toContain(fabricationCoverFormula)
    expect(hoop.formula).toContain(fabricationCoverFormula)
    expect(main.formula).not.toContain('切上げ')
    expect(hoop.formula).not.toContain('切上げ')
    expect(hoop.formula).toContain(
      `2×{(${section.b}−2×${fabricationCover})＋`,
    )
    expect(hoop.formula).toContain(
      `135°フック余長 ${hook135.value}d(${hook135.value * hoopDiameter})`,
    )
    expect(hoop.formula).toContain(
      '⌈(階高 4200 − 上部大梁せい 750) ÷ 帯筋ピッチ 100⌉ ＋ 1 ＝ 36',
    )
  })
})
