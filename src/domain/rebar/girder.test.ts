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
  main: { size: 'D25', topCount: 4, bottomCount: 4 },
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
      main: { ...section.main, topCount: 7, bottomCount: 9 },
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

/**
 * 数量積算基準 2（３）梁1) —「梁の全長にわたる主筋の長さは、梁の長さにその定着
 * 長さを加えたものとする。トップ筋、ハンチ部分の主筋、補強筋等は設計図書による。」
 *
 * 断面一覧が位置別（端部／中央）に本数を分けている表を受けたときの分け方を固定する。
 * 全長にわたる本数は小さい方、超過分は「設計図書による」＝止め位置の入力で決まる。
 */
describe('generateGirderRebar with 位置別 主筋本数', () => {
  const endInput = {
    barSize: section.main.size,
    supportCover,
    fc: section.fc,
    grade: section.grade,
  }
  const topStart = resolveGirderEnd(
    {
      ...endInput,
      bendDirection: '下' as const,
      supportLengthMm: span.startSupportLengthAlongAxisMm,
    },
    jpMlitRulePack,
  )
  const cutoffMm = 1200

  function withPositions(overrides: Partial<GirderSection['main']>): GirderSection {
    return { ...section, main: { ...section.main, ...overrides } }
  }

  function partialsOf(
    generated: ReturnType<typeof generateGirderRebar>,
    role: '上端筋' | '下端筋',
  ) {
    return generated.filter(
      (rebar) => rebar.role === role && rebar.layerIndex === 1,
    )
  }

  it('keeps every v6 断面 unchanged — 端部欄がなければ追加筋は出ない', () => {
    const generated = generateGirderRebar(input(), jpMlitRulePack)

    expect(generated.filter(({ layerIndex }) => layerIndex === 1)).toEqual([])
    expect(byRole(generated, '上端筋').count).toBe(section.main.topCount)
  })

  it('通し筋は端部欄と中央欄の小さい方、超過分は両端の追加筋になる', () => {
    const generated = generateGirderRebar(
      input({
        section: withPositions({
          topCount: 4,
          endCount: { topCount: 7, bottomCount: 4 },
          cutoffMm,
        }),
      }),
      jpMlitRulePack,
    )
    const through = byRole(generated, '上端筋')
    const partials = partialsOf(generated, '上端筋')

    expect(through.count).toBe(4)
    expect(through.formula).toContain('端部 7・中央 4 の小さい方')
    // 始端と終端の2区間。支点が同寸なので長さも同じだが、3D では別の位置に
    // 描かれるので鉄筋としては2本立てる — 内訳書側で1行に束ねる。
    expect(partials).toHaveLength(2)
    for (const partial of partials) {
      expect(partial.count).toBe(3)
      expect(partial.length).toBe(topStart.lengthMm + cutoffMm)
      expect(partial.splice?.countPerBar).toBe(0)
      expect(polylineLength(partial.points, partial.closed)).toBe(partial.length)
    }
    // 始端の追加筋は柱に定着し、内法側は止め位置で切れる
    expect(partials[0].points.at(-1)).toEqual([
      cutoffMm,
      section.depth - fabricationCover,
      fabricationCover,
    ])
    expect(partials[0].zones).toEqual([
      {
        kind: '定着',
        ruleKey: topStart.lengthRule,
        pathFromMm: 0,
        pathToMm: topStart.lengthMm,
      },
    ])
    expect(partials[1].points[0]).toEqual([
      span.clear - cutoffMm,
      section.depth - fabricationCover,
      fabricationCover,
    ])
  })

  it('中央欄の方が多ければ中央だけに入る補強筋になる', () => {
    const generated = generateGirderRebar(
      input({
        section: withPositions({
          bottomCount: 6,
          endCount: { topCount: 4, bottomCount: 4 },
          cutoffMm,
        }),
      }),
      jpMlitRulePack,
    )
    const through = byRole(generated, '下端筋')
    const partials = partialsOf(generated, '下端筋')

    expect(through.count).toBe(4)
    expect(partials).toHaveLength(1)
    expect(partials[0].count).toBe(2)
    expect(partials[0].length).toBe(span.clear - 2 * cutoffMm)
    expect(partials[0].zones).toEqual([])
    expect(partials[0].shape).toBe('straight')
    expect(partials[0].points).toEqual([
      [cutoffMm, fabricationCover, fabricationCover],
      [span.clear - cutoffMm, fabricationCover, fabricationCover],
    ])
  })

  it('中間支点では追加筋も接合部を貫くので定着が付かない', () => {
    const secondMember: Member = {
      ...member,
      id: '1F-G1-X2Y1-X',
      position: { axis: 'X', ix: 1, iy: 0 },
    }
    const continuousRun: GirderRun = {
      axis: 'X',
      members: [member, secondMember],
      ownerId: member.id,
      spans: [span, { ...span }],
      memberOffsetsMm: [0, span.clear + span.endSupportLengthAlongAxisMm],
      coreLengthMm:
        span.clear + span.endSupportLengthAlongAxisMm + span.clear,
    }
    const generated = generateGirderRebar(
      input({
        run: continuousRun,
        section: withPositions({
          topCount: 4,
          endCount: { topCount: 6, bottomCount: 4 },
          cutoffMm,
        }),
      }),
      jpMlitRulePack,
    )
    const partials = partialsOf(generated, '上端筋')
    const middle = partials.find(({ zones }) => zones?.length === 0)

    expect(partials).toHaveLength(3)
    expect(middle).toBeDefined()
    expect(middle!.length).toBe(
      2 * cutoffMm + span.endSupportLengthAlongAxisMm,
    )
    expect(middle!.points).toEqual([
      [span.clear - cutoffMm, section.depth - fabricationCover, fabricationCover],
      [
        span.clear + span.endSupportLengthAlongAxisMm + cutoffMm,
        section.depth - fabricationCover,
        fabricationCover,
      ],
    ])
  })

  it('refuses a 断面 whose 位置別本数 differs without a 止め位置', () => {
    expect(() =>
      generateGirderRebar(
        input({
          section: withPositions({
            topCount: 4,
            endCount: { topCount: 7, bottomCount: 4 },
          }),
        }),
        jpMlitRulePack,
      ),
    ).toThrow(MemberUnsupportedError)
    try {
      generateGirderRebar(
        input({
          section: withPositions({
            topCount: 4,
            endCount: { topCount: 7, bottomCount: 4 },
          }),
        }),
        jpMlitRulePack,
      )
    } catch (error) {
      expect((error as MemberUnsupportedError).reason).toBe('止め位置未入力')
    }
  })

  it('refuses a 止め位置 that does not fit inside the 内法', () => {
    expect(() =>
      generateGirderRebar(
        input({
          section: withPositions({
            topCount: 4,
            endCount: { topCount: 7, bottomCount: 4 },
            cutoffMm: span.clear / 2,
          }),
        }),
        jpMlitRulePack,
      ),
    ).toThrow(/内法長さ/)
  })
})
