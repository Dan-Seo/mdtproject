import { describe, expect, it } from 'vitest'

import type { ColumnSection, Member } from '../model/member'
import type { ColumnEnds, Story } from '../model/project'
import type { RebarRole, RebarZone } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
import { lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import { generateColumnRebar, type ColumnRebarInput } from './column'
import { stirrupPositions } from './stirrup-layout'

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
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
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

describe('Rebar model', () => {
  it('accepts the standard 大梁 row roles', () => {
    const roles: RebarRole[] = ['上端筋', '下端筋', 'あばら筋']

    expect(roles).toEqual(['上端筋', '下端筋', 'あばら筋'])
  })
})

describe('generateColumnRebar', () => {
  it('generates the fixed C1 input as one 主筋 row and one 帯筋 row', () => {
    const generated = generateColumnRebar(input(), jpMlitRulePack)
    const main = byRole(generated, '主筋')
    const hoop = byRole(generated, '帯筋')
    const expectedHoops = stirrupPositions(
      story.height - input().beamDepthAbove,
      section.hoop.pitch,
      0,
    )

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
      placement: {
        axis: 'y',
        clearMm: story.height - input().beamDepthAbove,
        pitchMm: section.hoop.pitch,
        startOffsetMm: 0,
        lastGapMm: expectedHoops.lastGapMm,
      },
    })
  })

  it('records only rows that came from the rule pack on every generated Rebar', () => {
    const generated = generateColumnRebar(input(), jpMlitRulePack)

    for (const rebar of generated) {
      expect(rebar.ruleHits.length).toBeGreaterThan(0)
      for (const hit of rebar.ruleHits) {
        expect(
          jpMlitRulePack.entries.includes(hit),
          `${hit.key} should be a row of the rule pack`,
        ).toBe(true)
      }
    }

    // 端部の順（下端 → 上端）で並ぶ。既定入力は 下端 継手・上端 定着。
    expect(byRole(generated, '主筋').ruleHits.map(({ key }) => key)).toEqual([
      'cover.minimum',
      'cover.fabrication.addition',
      'lap.L1',
      'anchorage.L1',
    ])
    expect(byRole(generated, '帯筋').ruleHits.map(({ key }) => key)).toEqual([
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

  it.each(
    [
      {
        ends: { bottom: '定着', top: '定着' },
        bottomKind: '定着',
        bottomLength: anchorage,
        topAnchored: true,
      },
      {
        ends: { bottom: '定着', top: 'なし' },
        bottomKind: '定着',
        bottomLength: anchorage,
        topAnchored: false,
      },
      {
        ends: { bottom: '継手', top: '定着' },
        bottomKind: '重ね継手',
        bottomLength: lap,
        topAnchored: true,
      },
      {
        ends: { bottom: '継手', top: 'なし' },
        bottomKind: '重ね継手',
        bottomLength: lap,
        topAnchored: false,
      },
    ] satisfies {
      ends: ColumnEnds
      bottomKind: RebarZone['kind']
      bottomLength: number
      topAnchored: boolean
    }[],
  )(
    'emits path-distance zones for $ends.bottom/$ends.top ends',
    ({ ends, bottomKind, bottomLength, topAnchored }) => {
      const main = byRole(
        generateColumnRebar(input({ ends }), jpMlitRulePack),
        '主筋',
      )
      const expected: RebarZone[] = [
        {
          kind: bottomKind,
          ruleKey:
            bottomKind === '重ね継手'
              ? lookupRule(jpMlitRulePack, 'lap.L1', conditions).key
              : lookupRule(jpMlitRulePack, 'anchorage.L1', conditions).key,
          pathFromMm: 0,
          pathToMm: bottomLength,
        },
      ]

      if (topAnchored) {
        expected.push({
          kind: '定着',
          ruleKey: lookupRule(jpMlitRulePack, 'anchorage.L1', conditions).key,
          pathFromMm: main.length - anchorage,
          pathToMm: main.length,
        })
      }

      expect(main.zones).toEqual(expected)
    },
  )

  it('keeps every zone within the 主筋 加工長 path', () => {
    const endCombinations: ColumnEnds[] = [
      { bottom: '定着', top: '定着' },
      { bottom: '定着', top: 'なし' },
      { bottom: '継手', top: '定着' },
      { bottom: '継手', top: 'なし' },
    ]

    for (const ends of endCombinations) {
      const main = byRole(
        generateColumnRebar(input({ ends }), jpMlitRulePack),
        '主筋',
      )

      expect(main.zones).toBeDefined()
      for (const zone of main.zones ?? []) {
        expect(zone.pathFromMm).toBeGreaterThanOrEqual(0)
        expect(zone.pathFromMm).toBeLessThan(zone.pathToMm)
        expect(zone.pathToMm).toBeLessThanOrEqual(main.length)
      }
    }
  })

  it('does not emit a zone for an end whose condition is なし', () => {
    const main = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(main.zones).toEqual([
      {
        kind: '定着',
        ruleKey: lookupRule(jpMlitRulePack, 'anchorage.L1', conditions).key,
        pathFromMm: 0,
        pathToMm: anchorage,
      },
    ])
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

    expect(withoutLap.ruleHits.map(({ key }) => key)).not.toContain('lap.L1')
    expect(withoutLap.formula).not.toContain('重ね継手')
    expect(withLap.ruleHits.map(({ key }) => key)).toContain('lap.L1')
  })

  it('cites 定着 only on the rows that actually reach a stack end', () => {
    const interior = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '継手', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(interior.ruleHits.map(({ key }) => key)).not.toContain(
      'anchorage.L1',
    )
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

  it('fails fast when the section cannot contain the 帯筋 fabrication cover', () => {
    // 加工用かぶり×2 이하의 단면은 음수 加工長을 만들고 마이너스 kg로
    // 조용히 집계된다 — throw로 막는다 (ADR-014).
    const tiny: ColumnSection = { ...section, b: 100, d: 100 }

    expect(() =>
      generateColumnRebar(input({ section: tiny }), jpMlitRulePack),
    ).toThrow(/positive/)
  })

  it('fails fast when the 上部大梁 depth consumes the whole storey height', () => {
    expect(() =>
      generateColumnRebar(
        input({ beamDepthAbove: story.height }),
        jpMlitRulePack,
      ),
    ).toThrow(/positive/)
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
      // stirrupPositions 는 오프셋을 양단에 적용한다 — 表示される項だけで
      // 本数を再現できなければ算出根拠の説明にならない。
      '帯筋配置（配置区間 3450［階高 4200 − 上部大梁せい 750］、' +
        'ピッチ 100、始端・終端オフセット 0）＝ 36',
    )
  })

  it.each([
    {
      label: '初期オフセット',
      section: {
        ...section,
        hoop: { ...section.hoop, startOffsetMm: 5000 },
      },
      beamDepthAbove: input().beamDepthAbove,
    },
    {
      label: '上部大梁せい',
      section,
      beamDepthAbove: 4200,
    },
    {
      label: '断面寸法',
      section: { ...section, b: 50, d: 50 },
      beamDepthAbove: input().beamDepthAbove,
    },
  ])(
    'reports a non-viable 帯筋 配置区間 from $label as a member-level failure',
    ({ section: columnSection, beamDepthAbove }) => {
      // 둘 다 断面一覧 입력으로 도달 가능한 형상 불성립이다 — 부재 하나를
      // 미지원으로 빼야 하고, 페인을 죽이는 결함으로 다루면 안 된다.
      expect(() =>
        generateColumnRebar(
          { ...input(), section: columnSection, beamDepthAbove },
          jpMlitRulePack,
        ),
      ).toThrow(MemberUnsupportedError)
    },
  )
})
