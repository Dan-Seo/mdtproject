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
  spliceMethod: '重ね継手',
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
    // 既定は「下は通し・上は先端」＝ 下に柱があるスタック最上段の柱
    // （1通則1)＋（２）柱1) 但書により先端は定着を加えない、R9①）。
    ends: { bottom: 'なし', top: '先端' },
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
      // 設計本数は積算基準 1通則7)（階高 4200 ÷ ピッチ 100 ＋ 1）。
      // 3D の配置本数 36 とは別物で、後者は placement が持つ。
      count: 43,
      placement: {
        axis: 'y',
        clearMm: story.height - input().beamDepthAbove,
        pitchMm: section.hoop.pitch,
        startOffsetMm: 0,
        lastGapMm: expectedHoops.lastGapMm,
        positionCount: expectedHoops.positionsMm.length,
      },
    })
    expect(expectedHoops.positionsMm).toHaveLength(36)
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

    // 端部の順（下端 → 上端）のあとに継手。既定入力は 下端 通し・上端 先端で、
    // 継手は端部条件と関係なく （２）柱2) が各階に1か所置く。
    expect(byRole(generated, '主筋').ruleHits.map(({ key }) => key)).toEqual([
      'cover.minimum',
      'cover.fabrication.addition',
      'measure.tip.length.addition',
      'measure.splice.column',
      'measure.splice.length.factor',
      'lap.L1',
    ])
    // 帯筋の設計長さ・設計本数を決めるのは積算基準のこの2条項だけだ。
    // かぶりは 3D 形状 (points) にしか効かないので、内訳行の根拠に混ぜると
    // 算出式に一度も現れない行を出典として示すことになる。
    expect(byRole(generated, '帯筋').ruleHits.map(({ key }) => key)).toEqual([
      'measure.hoop.length.addition',
      'measure.distribution.addition',
    ])
  })

  it('anchors the base of the stack but adds nothing at the roof, and gives every storey one 継手 (R7①・R9①・（２）柱2))', () => {
    const base = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )
    const roof = byRole(
      generateColumnRebar(
        input({ ends: { bottom: 'なし', top: '先端' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    // 接合部には定着が付かない。屋上（先端）にも定着は付かない —
    // 1通則1)＋（２）柱1) 但書により最上階柱主筋はコンクリート設計寸法までで
    // 止まる。どちらにも各階1か所の継手だけが付く。
    expect(base.zones).toHaveLength(1)
    expect(roof.zones).toHaveLength(0)
    expect(base.splice?.countPerBar).toBe(1)
    expect(roof.splice?.countPerBar).toBe(1)
    expect(base.length).toBe(story.height + anchorage + lap)
    expect(roof.length).toBe(story.height + lap)
  })

  it('anchors only the base — not the roof — when the column stands alone in its stack (R9①)', () => {
    const main = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: '先端' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    expect(main.length).toBe(story.height + anchorage + lap)
  })

  it('extends the 3D geometry by exactly what each end contributes', () => {
    const main = byRole(
      generateColumnRebar(
        input({ ends: { bottom: '定着', top: 'なし' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    // 継手は位置が決まらないので描かない — 設計長さにだけ入る。
    expect(main.points[0][1]).toBe(-anchorage)
    expect(main.points[1][1]).toBe(story.height)
    expect(main.length - (main.points[1][1] - main.points[0][1])).toBe(lap)
  })

  it.each(
    [
      { ends: { bottom: '定着', top: 'なし' }, bottomAnchored: true },
      { ends: { bottom: '定着', top: '先端' }, bottomAnchored: true },
      { ends: { bottom: 'なし', top: 'なし' }, bottomAnchored: false },
      { ends: { bottom: 'なし', top: '先端' }, bottomAnchored: false },
    ] satisfies {
      ends: ColumnEnds
      bottomAnchored: boolean
    }[],
  )(
    // 上端は なし・先端いずれも定着しない(R9①) — ゾーンは下端の定着だけが決める。
    'emits a path-distance zone only for a 定着 bottom, never for the top ($ends.bottom/$ends.top)',
    ({ ends, bottomAnchored }) => {
      const main = byRole(
        generateColumnRebar(input({ ends }), jpMlitRulePack),
        '主筋',
      )
      const anchorageKey = lookupRule(
        jpMlitRulePack,
        'anchorage.L1',
        conditions,
      ).key
      const expected: RebarZone[] = []

      if (bottomAnchored) {
        expected.push({
          kind: '定着',
          ruleKey: anchorageKey,
          pathFromMm: 0,
          pathToMm: anchorage,
        })
      }

      expect(main.zones).toEqual(expected)
    },
  )

  it('keeps every zone within the drawn 主筋 path, not the 設計長さ', () => {
    const endCombinations: ColumnEnds[] = [
      { bottom: '定着', top: '先端' },
      { bottom: '定着', top: 'なし' },
      { bottom: 'なし', top: '先端' },
      { bottom: 'なし', top: 'なし' },
    ]

    for (const ends of endCombinations) {
      const main = byRole(
        generateColumnRebar(input({ ends }), jpMlitRulePack),
        '主筋',
      )
      const drawnLength = main.points[1][1] - main.points[0][1]

      expect(main.zones).toBeDefined()
      for (const zone of main.zones ?? []) {
        expect(zone.pathFromMm).toBeGreaterThanOrEqual(0)
        expect(zone.pathFromMm).toBeLessThan(zone.pathToMm)
        expect(zone.pathToMm).toBeLessThanOrEqual(drawnLength)
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

  it('cites 重ね継手長さ only when the 継手方式 puts it into the 設計長さ', () => {
    const lapped = byRole(
      generateColumnRebar(input(), jpMlitRulePack),
      '主筋',
    )
    const pressureWelded = byRole(
      generateColumnRebar(
        input({ section: { ...section, spliceMethod: 'ガス圧接' } }),
        jpMlitRulePack,
      ),
      '主筋',
    )

    // ガス圧接は 1通則5)「長さの変化はないものとする」— 箇所数は残るが質量は変わらない。
    expect(lapped.ruleHits.map(({ key }) => key)).toContain('lap.L1')
    expect(pressureWelded.ruleHits.map(({ key }) => key)).not.toContain('lap.L1')
    expect(pressureWelded.splice?.countPerBar).toBe(1)
    expect(pressureWelded.splice?.lengthMm).toBe(0)
    expect(lapped.length - pressureWelded.length).toBe(lap)
  })

  it('cites 定着 only on the rows that actually reach a stack end', () => {
    const interior = byRole(
      generateColumnRebar(
        input({ ends: { bottom: 'なし', top: 'なし' } }),
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

    // 上部大梁せいが効くのは 3D の配置区間だけだ。数量本数は積算基準 1通則7)
    // により階高で決まるので動かない — 動いたら数量が形状に引きずられている。
    expect(changedHoop.placement?.clearMm).toBe(
      (baseHoop.placement?.clearMm ?? 0) - 50,
    )
    expect(changedHoop.placement?.positionCount).toBe(
      (baseHoop.placement?.positionCount ?? 0) - 1,
    )
    expect(changedHoop.count).toBe(baseHoop.count)
  })

  it('keeps mm geometry and reproducible calculations on each row', () => {
    // 定着長さの文言を検証する必要があるので、既定(先端)ではなく下端定着で作る。
    const generated = generateColumnRebar(
      input({ ends: { bottom: '定着', top: 'なし' } }),
      jpMlitRulePack,
    )
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
    const mainDiameter = Number(section.main.size.replace(/^D/, ''))
    // 積算基準 1通則2) — 断面の設計寸法による周長。かぶり控除もフックもない。
    const expectedHoopLength = 2 * (section.b + section.d)

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
    expect(main.formula).not.toContain('切上げ')
    // 表示される項だけで数量を再現できなければ算出根拠の説明にならない。
    expect(hoop.formula).toContain(
      `設計長さ ＝ 断面の設計寸法による周長 2×(${section.b}＋${section.d}) ` +
        `＝ ${expectedHoopLength}`,
    )
    expect(hoop.formula).toContain(
      '設計本数 ＝ ⌈階高 4200 ÷ ピッチ 100⌉ ＋ 1 ＝ 43',
    )
    // 内訳行は上部大梁せいの違う柱を束ねる。部材ごとに違う 3D 配置の項を
    // 数量の算出式に載せると、束ねられた他の柱について嘘になる。
    expect(hoop.formula).not.toContain('配置区間')
    expect(hoop.formula).not.toContain('上部大梁せい')
    expect(hoop.formula).not.toContain(fabricationCoverFormula)
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
