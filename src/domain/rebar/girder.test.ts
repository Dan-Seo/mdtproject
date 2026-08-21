import { describe, expect, it } from 'vitest'

import type { ColumnSection, GirderSection, Member } from '../model/member'
import type { GirderRun, GirderSpan } from '../model/project'
import type { Rebar } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
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
  spliceMethod: '重ね継手',
  main: {
    size: 'D25',
    top: { endCount: 4, centerCount: 4 },
    bottom: { endCount: 4, centerCount: 4 },
    cutoffFromSupportFaceMm: 0,
  },
  stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
}

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
  spliceMethod: '重ね継手',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
}

const supportCover = coverConditions(supportColumnSection)

const span: GirderSpan = {
  axis: 'X',
  centerSpan: 6000,
  clear: 5200,
  startFaceOffsetMm: 400,
  endFaceOffsetMm: 400,
  startSupportLengthAlongAxisMm: 800,
  endSupportLengthAlongAxisMm: 800,
  startSupportCover: supportCover,
  endSupportCover: supportCover,
}

const run: GirderRun = {
  axis: 'X',
  members: [member],
  ownerId: member.id,
  spans: [span],
  memberOffsetsMm: [0],
  coreLengthMm: span.clear,
}

function input(
  overrides: Partial<GirderRebarInput> = {},
): GirderRebarInput {
  return { run, section, ...overrides }
}

function runWithSpan(nextSpan: GirderSpan): GirderRun {
  return { ...run, spans: [nextSpan], coreLengthMm: nextSpan.clear }
}

function byRole(
  generated: ReturnType<typeof generateGirderRebar>,
  role: '上端筋' | '下端筋' | 'あばら筋' | '幅止め筋' | '腹筋',
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

describe('generateGirderRebar', () => {
  it('generates [上端筋, 下端筋, あばら筋] as representative rows', () => {
    const expectedStirrups = stirrupPositions(
      span.clear,
      section.stirrup.pitch,
      section.stirrup.startOffsetMm,
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
      // 設計本数は積算基準 1通則7)（内法 5200 ÷ ピッチ 100 ＋ 1）。
      // 3D の配置本数 52 とは別物で、後者は placement が持つ。
      count: 53,
      placement: {
        axis: 'x',
        clearMm: span.clear,
        pitchMm: section.stirrup.pitch,
        startOffsetMm: section.stirrup.startOffsetMm,
        lastGapMm: expectedStirrups.lastGapMm,
        positionCount: expectedStirrups.positionsMm.length,
      },
    })
  })

  it('adds both 折曲げ定着 lengths to the sample G1 上端筋 without rounding', () => {
    const endInput = {
      barSize: section.main.size,
      supportCover,
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
      supportCover,
      barSize: section.main.size,
      fc: section.fc,
      grade: section.grade,
      bendDirection: '下' as const,
    }
    const detail = resolveGirderEnd(endInput, jpMlitRulePack)
    const top = byRole(
      generateGirderRebar(
        input({ run: runWithSpan(largeSupportSpan) }),
        jpMlitRulePack,
      ),
      '上端筋',
    )

    expect(detail.kind).toBe('直線定着')
    expect(top.shape).toBe('straight')
    expect(top.length).toBe(
      largeSupportSpan.clear +
        2 * detail.lengthMm +
        (top.splice?.lengthMm ?? 0),
    )
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
        supportCover,
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
        {
          kind: '定着',
          ruleKey: start.lengthRule,
          pathFromMm: 0,
          pathToMm: start.lengthMm,
        },
        {
          kind: '定着',
          ruleKey: end.lengthRule,
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

  it('generates one continuous pair of 主筋 and one あばら筋 row per span', () => {
    const secondMember: Member = {
      ...member,
      id: '1F-G1-X2Y1-X',
      position: { axis: 'X', ix: 1, iy: 0 },
    }
    const secondSpan: GirderSpan = { ...span }
    const continuousRun: GirderRun = {
      axis: 'X',
      members: [member, secondMember],
      ownerId: member.id,
      spans: [span, secondSpan],
      memberOffsetsMm: [0, span.clear + span.endSupportLengthAlongAxisMm],
      coreLengthMm: span.clear + span.endSupportLengthAlongAxisMm + secondSpan.clear,
    }
    const generated = generateGirderRebar(
      input({ run: continuousRun }),
      jpMlitRulePack,
    )
    const top = byRole(generated, '上端筋')
    const endInput = {
      barSize: section.main.size,
      supportCover,
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
        supportLengthMm: secondSpan.endSupportLengthAlongAxisMm,
      },
      jpMlitRulePack,
    )
    const stirrups = generated.filter(({ role }) => role === 'あばら筋')

    // 描かれる加工長。設計長さはここに継手箇所数分が乗る (（３）梁2))。
    const drawnLength =
      continuousRun.coreLengthMm + start.lengthMm + end.lengthMm

    expect(top.memberId).toBe(continuousRun.ownerId)
    expect(top.length).toBe(drawnLength + (top.splice?.lengthMm ?? 0))
    expect(top.zones).toEqual([
      {
        kind: '定着',
        ruleKey: start.lengthRule,
        pathFromMm: 0,
        pathToMm: start.lengthMm,
      },
      {
        kind: '定着',
        ruleKey: end.lengthRule,
        pathFromMm: drawnLength - end.lengthMm,
        pathToMm: drawnLength,
      },
    ])
    expect(top.formula).toContain(
      `内法長さ ${span.clear}＋${secondSpan.clear} ＋ 中間柱せい ${span.endSupportLengthAlongAxisMm}`,
    )
    // 連続するランなので （３）梁2) の区分表で数える — 1通則4) の長さ割りではない。
    expect(top.splice?.rules.map(({ key }) => key)).toContain(
      'measure.splice.girder.continuous',
    )
    expect(top.formula).toContain('継手')
    expect(stirrups.map(({ memberId }) => memberId)).toEqual([
      member.id,
      secondMember.id,
    ])
  })

  it('changes the 通し筋 設計長さ with the 継手方式 but never the drawn shape', () => {
    const secondMember: Member = {
      ...member,
      id: '1F-G1-X2Y1-X',
      position: { axis: 'X', ix: 1, iy: 0 },
    }
    const twoSpans = input({
      run: {
        axis: 'X',
        members: [member, secondMember],
        ownerId: member.id,
        spans: [span, { ...span }],
        memberOffsetsMm: [0, span.clear + span.endSupportLengthAlongAxisMm],
        coreLengthMm:
          span.clear * 2 + span.endSupportLengthAlongAxisMm,
      },
    })
    const lapped = byRole(
      generateGirderRebar(twoSpans, jpMlitRulePack),
      '上端筋',
    )
    const welded = byRole(
      generateGirderRebar(
        {
          ...twoSpans,
          section: { ...section, spliceMethod: 'ガス圧接' },
        },
        jpMlitRulePack,
      ),
      '上端筋',
    )

    expect(lapped.splice?.countPerBar).toBe(welded.splice?.countPerBar)
    expect(welded.splice?.lengthMm).toBe(0)
    expect(lapped.length - welded.length).toBe(lapped.splice?.lengthMm)
    // 継手位置は根拠がない（表5.3.3 は画像）ので形状には出ない。
    expect(lapped.points).toEqual(welded.points)
    expect(lapped.zones).toEqual(welded.zones)
  })

  it('bounds the あばら筋 placement array inside the span', () => {
    const positions = stirrupPositions(
      span.clear,
      section.stirrup.pitch,
      section.stirrup.startOffsetMm,
    ).positionsMm
    const stirrup = byRole(
      generateGirderRebar(input(), jpMlitRulePack),
      'あばら筋',
    )

    // 3D の配置本数は placement が持つ。数量本数 count は積算基準 1通則7) で
    // 別に決まるので、ここで両者を同一視してはならない。
    expect(stirrup.placement?.positionCount).toBe(positions.length)
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions.every((position) => position <= span.clear)).toBe(true)
  })

  it('keeps both 主筋 counts exactly as supplied by the section list (ADR-012)', () => {
    const changedSection: GirderSection = {
      ...section,
      main: {
        ...section.main,
        top: { endCount: 7, centerCount: 7 },
        bottom: { endCount: 9, centerCount: 9 },
      },
    }
    const generated = generateGirderRebar(
      input({ section: changedSection }),
      jpMlitRulePack,
    )

    expect(byRole(generated, '上端筋').count).toBe(7)
    expect(byRole(generated, '下端筋').count).toBe(9)
  })

  it('explains a 0か所 splice by the count, not by the method', () => {
    // この単独梁は 6.0m 足らずで 0か所だ。長さが増えないのは方式のせいでは
    // ないのに「重ね継手は長さの変化なし」と書くと、同じ行が出典に挙げる
    // measure.splice.length.factor{重ね継手}=1（算入する）と食い違う。
    const generated = generateGirderRebar(input(), jpMlitRulePack)
    const { formula } = byRole(generated, '上端筋')

    expect(formula).toContain('継手 0か所 ＝ 0')
    expect(formula).not.toContain('長さの変化なし')
  })

  it('tracks only existing rules in a stable contribution order', () => {
    const generated = generateGirderRebar(input(), jpMlitRulePack)
    // 마지막 cover.minimum 은 端部条件을 판정한 지점 柱의 행이다 — 大梁 행과
    // 조건이 다르므로 키만으로는 구분되지 않는다.
    const bentMainRules = [
      'cover.minimum',
      'cover.fabrication.addition',
      'anchorage.L1',
      'anchorage.L1h',
      'anchorage.La',
      'anchorage.bent.tail.minimum',
      'anchorage.bent.projection.minimum',
      'cover.minimum',
      // 継手は設計長さの一部なので質量行の出典にも載る。この単独梁は
      // 6.0m 足らずで 0か所なので、重ね継手長さ（lap.L1）は載らない。
      'measure.splice.interval',
      'measure.splice.length.factor',
    ]

    expect(
      byRole(generated, '上端筋').ruleHits.map(({ key }) => key),
    ).toEqual(bentMainRules)
    expect(
      byRole(generated, '下端筋').ruleHits.map(({ key }) => key),
    ).toEqual(bentMainRules)
    // あばら筋の設計長さ・設計本数を決めるのは積算基準のこの2条項だけだ。
    // かぶりは 3D 形状 (points) にしか効かないので、内訳行の根拠に混ぜると
    // 算出式に一度も現れない行を出典として示すことになる。
    expect(
      byRole(generated, 'あばら筋').ruleHits.map(({ key }) => key),
    ).toEqual([
      'measure.hoop.length.addition',
      'measure.distribution.addition',
    ])

    for (const rebar of generated) {
      expect(new Set(rebar.ruleHits).size).toBe(rebar.ruleHits.length)
      for (const hit of rebar.ruleHits) {
        expect(
          jpMlitRulePack.entries.includes(hit),
          `${hit.key} should be a row of the rule pack`,
        ).toBe(true)
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

    // あばら筋の数量にかぶりは効かない（1通則2)）。内訳行は内法長さの違う梁を
    // 束ねうるので、部材ごとに違う 3D 配置の項も数量の算出式には載せない。
    const stirrupFormula = byRole(generated, 'あばら筋').formula
    expect(stirrupFormula).not.toContain(coverFormula)
    expect(stirrupFormula).toContain(
      '設計長さ ＝ 断面の設計寸法による周長 2×(400＋750) ＝ 2300',
    )
    expect(stirrupFormula).toContain(
      '設計本数 ＝ ⌈内法長さ 5200 ÷ ピッチ 100⌉ ＋ 1 ＝ 53',
    )
    expect(stirrupFormula).toContain('内法長さは代表値')
  })

  it('carries the 柱 かぶり row that decided the end condition, not just the 大梁 one', () => {
    // 端部条件은 지점 柱의 かぶり로 판정한다. 키 문자열만 남기면 집계부가 大梁
    // 조건으로 cover.minimum 을 되짚어 실제로 쓰지 않은 행을 근거로 표시한다 —
    // 出典 표시와 inferred 기여 목록이 산출값과 어긋난다 (ADR-015).
    const generated = generateGirderRebar(input(), jpMlitRulePack)
    const top = byRole(generated, '上端筋')
    const columnCovers = top.ruleHits.filter(
      ({ key, conditions }) =>
        key === 'cover.minimum' && conditions.memberKind === '柱',
    )

    expect(columnCovers).toHaveLength(1)
    expect(columnCovers[0].value).toBe(
      lookupRule(jpMlitRulePack, 'cover.minimum', {
        memberKind: '柱',
        soilContact: false,
        exposure: '屋外',
        finish: '仕上げなし',
      }).value,
    )
    expect(
      top.ruleHits.some(
        ({ key, conditions }) =>
          key === 'cover.minimum' && conditions.memberKind === '大梁',
      ),
    ).toBe(true)
  })

  it('reports an unbuildable あばら筋 section as a member-level unsupported reason', () => {
    // 断面 b 를 加工用かぶり 두 겹보다 작게 줄이면 사용자 입력만으로 도달한다.
    const narrow: GirderSection = { ...section, b: 2 * fabricationCover }

    expect(() =>
      generateGirderRebar(input({ section: narrow }), jpMlitRulePack),
    ).toThrow(MemberUnsupportedError)
    try {
      generateGirderRebar(input({ section: narrow }), jpMlitRulePack)
    } catch (error) {
      expect((error as MemberUnsupportedError).reason).toBe('寸法不成立')
    }
  })
})

describe('幅止め筋 (M3c)', () => {
  const withWidthTie: GirderSection = {
    ...section,
    widthTie: { size: 'D10', pitch: 1000 },
  }

  it('draws across the width between the 加工用かぶり faces', () => {
    const generated = generateGirderRebar(
      input({ section: withWidthTie }),
      jpMlitRulePack,
    )
    const tie = byRole(generated, '幅止め筋')

    // 加工長は幅からかぶり2面分を引いた実寸、設計長さは幅そのもの — わざと
    // 食い違う (ADR-019)。ここが一致してしまうと 1通則3) を取り違えている。
    expect(polylineLength(tie.points, tie.closed)).toBeLessThan(tie.length)
    expect(tie.length).toBe(withWidthTie.b)
    expect(tie.closed).toBe(false)
  })

  it('repeats along the span from the same start offset as the あばら筋', () => {
    const generated = generateGirderRebar(
      input({ section: withWidthTie }),
      jpMlitRulePack,
    )
    const tie = byRole(generated, '幅止め筋')
    const stirrup = byRole(generated, 'あばら筋')

    expect(tie.placement?.axis).toBe('x')
    expect(tie.placement?.startOffsetMm).toBe(stirrup.placement?.startOffsetMm)
    expect(tie.placement?.pitchMm).toBe(1000)
    expect(tie.placement?.positionCount).toBe(
      stirrupPositions(span.clear, 1000, section.stirrup.startOffsetMm)
        .positionsMm.length,
    )
  })

  it('rejects a section too narrow for the fabrication cover', () => {
    const narrow: GirderSection = {
      ...withWidthTie,
      b: 2 * coverRule.value,
    }

    expect(() =>
      generateGirderRebar(input({ section: narrow }), jpMlitRulePack),
    ).toThrow(MemberUnsupportedError)
  })
})

describe('腹筋 (M3c)', () => {
  const withSideBar: GirderSection = {
    ...section,
    sideBar: { size: 'D10', count: 2, extraLengthMm: 150 },
  }

  it('draws exactly the 設計長さ — 内法 plus the input 余長 at both ends', () => {
    const generated = generateGirderRebar(
      input({ section: withSideBar }),
      jpMlitRulePack,
    )
    const sideBar = byRole(generated, '腹筋')

    // 余長は入力なので加工形状と設計長さが食い違う理由がない。あばら筋のように
    // 数量側の簡略化が入らないことを固定する。
    expect(polylineLength(sideBar.points, sideBar.closed)).toBe(sideBar.length)
    expect(sideBar.length).toBe(span.clear + 2 * 150)
    expect(sideBar.placement).toBeUndefined()
  })

  it('rejects a negative 余長 rather than shortening the bar', () => {
    const negative: GirderSection = {
      ...section,
      sideBar: { size: 'D10', count: 2, extraLengthMm: -50 },
    }

    expect(() =>
      generateGirderRebar(input({ section: negative }), jpMlitRulePack),
    ).toThrow(MemberUnsupportedError)
  })
})

describe('generateGirderRebar — カットオフ筋', () => {
  // 数量積算基準 2（３）梁1)「トップ筋、ハンチ部分の主筋、補強筋等は設計図書に
  // よる」— 位置別本数の差がカットオフ筋で、切り止め位置は入力である。
  const cutoffMm = 1500

  function withMain(
    overrides: Partial<GirderSection['main']>,
  ): GirderSection {
    return {
      ...section,
      main: {
        ...section.main,
        cutoffFromSupportFaceMm: cutoffMm,
        ...overrides,
      },
    }
  }

  function topEnd(supportLengthMm: number) {
    return resolveGirderEnd(
      {
        barSize: section.main.size,
        supportCover,
        fc: section.fc,
        grade: section.grade,
        bendDirection: '下',
        supportLengthMm,
      },
      jpMlitRulePack,
    )
  }

  function byCutoffRole(
    generated: Rebar[],
    role: '上端カットオフ筋' | '下端カットオフ筋',
  ): Rebar[] {
    return generated.filter((rebar) => rebar.role === role)
  }

  const twoSpanRun: GirderRun = {
    axis: 'X',
    members: [
      member,
      { ...member, id: '1F-G1-X2Y1-X', position: { axis: 'X', ix: 1, iy: 0 } },
    ],
    ownerId: member.id,
    spans: [span, { ...span }],
    memberOffsetsMm: [0, span.clear + span.endSupportLengthAlongAxisMm],
    coreLengthMm:
      span.clear + span.endSupportLengthAlongAxisMm + span.clear,
  }

  it('端部が多い断面は通し筋を中央本数で数え、差を外側支点のカットオフ筋にする', () => {
    const generated = generateGirderRebar(
      input({ section: withMain({ top: { endCount: 6, centerCount: 4 } }) }),
      jpMlitRulePack,
    )
    const cutoffs = byCutoffRole(generated, '上端カットオフ筋')
    const start = topEnd(span.startSupportLengthAlongAxisMm)

    expect(byRole(generated, '上端筋').count).toBe(4)
    expect(cutoffs).toHaveLength(1)
    expect(cutoffs[0]).toMatchObject({
      memberId: run.ownerId,
      size: section.main.size,
      // 2本 × 外側支点2か所。両端の定着長さが同じなので1行に束ねる
      count: 4,
      axisOffsetsMm: [0, span.clear - cutoffMm],
    })
    expect(cutoffs[0].length).toBe(start.lengthMm + cutoffMm)
    // 定着は設計長さに入るが 3D には描かない（両端で向きが反転するため）
    expect(polylineLength(cutoffs[0].points, cutoffs[0].closed)).toBe(cutoffMm)
  })

  it('中央が多い断面はスパンごとに中央のカットオフ筋を出す', () => {
    const generated = generateGirderRebar(
      input({
        section: withMain({ bottom: { endCount: 2, centerCount: 4 } }),
      }),
      jpMlitRulePack,
    )
    const cutoffs = byCutoffRole(generated, '下端カットオフ筋')

    expect(byRole(generated, '下端筋').count).toBe(2)
    expect(cutoffs).toHaveLength(1)
    expect(cutoffs[0]).toMatchObject({
      memberId: member.id,
      count: 2,
      length: span.clear - 2 * cutoffMm,
      axisOffsetsMm: [cutoffMm],
    })
  })

  it('連続スパンでは中間支点を通すカットオフ筋が別行になる', () => {
    const generated = generateGirderRebar(
      input({
        run: twoSpanRun,
        section: withMain({ top: { endCount: 6, centerCount: 4 } }),
      }),
      jpMlitRulePack,
    )
    const cutoffs = byCutoffRole(generated, '上端カットオフ筋')
    const outer = topEnd(span.startSupportLengthAlongAxisMm)
    const interiorLength =
      2 * cutoffMm + span.endSupportLengthAlongAxisMm

    expect(cutoffs).toHaveLength(2)
    expect(cutoffs[0]).toMatchObject({
      count: 4,
      length: outer.lengthMm + cutoffMm,
      axisOffsetsMm: [0, twoSpanRun.coreLengthMm - cutoffMm],
    })
    expect(cutoffs[1]).toMatchObject({
      // 中間支点は貫通するので定着がつかない — 2本 × 1か所
      count: 2,
      length: interiorLength,
      axisOffsetsMm: [span.clear - cutoffMm],
    })
    expect(
      polylineLength(cutoffs[1].points, cutoffs[1].closed),
    ).toBe(interiorLength)
  })

  it('カットオフ筋の継手箇所数は連続梁の区分表ではなく 1通則4) で数える', () => {
    const wideSpan: GirderSpan = { ...span, centerSpan: 7800, clear: 7000 }
    const wideRun: GirderRun = {
      ...twoSpanRun,
      spans: [wideSpan, { ...wideSpan }],
      memberOffsetsMm: [0, wideSpan.clear + wideSpan.endSupportLengthAlongAxisMm],
      coreLengthMm:
        wideSpan.clear + wideSpan.endSupportLengthAlongAxisMm + wideSpan.clear,
    }
    const generated = generateGirderRebar(
      input({
        run: wideRun,
        section: withMain({ bottom: { endCount: 2, centerCount: 4 } }),
      }),
      jpMlitRulePack,
    )
    const [cutoff] = byCutoffRole(generated, '下端カットオフ筋')

    // 4.0m の鉄筋。連続梁の区分表なら 5.0m 未満で 0.5か所になるが、
    // カットオフ筋は「梁の全長にわたる主筋」ではないので 1通則4) に戻る。
    expect(cutoff.length).toBe(wideSpan.clear - 2 * cutoffMm)
    expect(cutoff.splice?.countPerBar).toBe(0)
    expect(cutoff.splice?.formula).toContain('1通則4)')
  })

  // 直しどころが違うので断面・内法の寸法不成立とは別の理由にする —
  // 直すのは支点柱でもスパンでもなく断面一覧のカットオフ位置である。
  it.each([
    ['スパンに納まらない', 2700],
    ['未入力', 0],
  ])('カットオフ位置が%sなら黙って0にせずカットオフ位置不成立で落とす', (_label, cutoffFromSupportFaceMm) => {
    const broken = withMain({
      top: { endCount: 6, centerCount: 4 },
      cutoffFromSupportFaceMm,
    })

    try {
      generateGirderRebar(input({ section: broken }), jpMlitRulePack)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MemberUnsupportedError)
      expect((error as MemberUnsupportedError).reason).toBe(
        'カットオフ位置不成立',
      )
    }
  })

  it('端部と中央が同数ならカットオフ筋を出さない', () => {
    const generated = generateGirderRebar(
      input({ section: withMain({}) }),
      jpMlitRulePack,
    )

    expect(generated.map(({ role }) => role)).toEqual([
      '上端筋',
      '下端筋',
      'あばら筋',
    ])
  })
})
