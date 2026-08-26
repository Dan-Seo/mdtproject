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

describe('generateWallRebar — 開口補強筋の設計図書転記 (1通則8) なお書き', () => {
  const reinforcementMember: Member = {
    ...member,
    openings: [
      {
        id: 'W1-op1',
        xMm: 2000,
        yMm: 900,
        widthMm: 1800,
        heightMm: 1200,
        reinforcements: [
          { size: 'D13', count: 4, lengthMm: 1800 },
          { size: 'D10', count: 2, lengthMm: 1200 },
        ],
      },
    ],
  }

  it('emits each transcribed value as a separate straight Rebar', () => {
    const reinforcements = generateWallRebar(
      input({ member: reinforcementMember }),
      jpMlitRulePack,
    ).filter(({ role }) => role === '開口補強筋')

    expect(reinforcements).toHaveLength(2)
    expect(reinforcements).toMatchObject([
      {
        role: '開口補強筋',
        size: 'D13',
        count: 4,
        length: 1800,
        shape: 'straight',
        points: [
          [0, 0, 0],
          [1800, 0, 0],
        ],
        closed: false,
        ruleHits: [],
      },
      {
        role: '開口補強筋',
        size: 'D10',
        count: 2,
        length: 1200,
        shape: 'straight',
        points: [
          [0, 0, 0],
          [1200, 0, 0],
        ],
        closed: false,
        ruleHits: [],
      },
    ])

    for (const rebar of reinforcements) {
      expect(rebar).not.toHaveProperty('zones')
      expect(rebar).not.toHaveProperty('placement')
      expect(rebar.formula).toContain('設計図書転記')
      expect(rebar.formula).toContain('1通則8)')
      expect(rebar.formula).toContain(`${rebar.length}`)
      expect(rebar.formula).toContain(`${rebar.count}`)
    }
  })
})

describe('generateWallRebar — 開口部の欠除 (数量積算基準 1通則8))', () => {
  // 内法 5200×3450、ピッチ 200。縦筋 27本・横筋 19本 (1通則7))。
  // 開口 1800×1200 を (2000, 900) に置くと、縦筋は x (2000,3800) の内側 8本が
  // 高さ 1200 を、横筋は y (900,2100) の内側 6本が 幅 1800 を欠く。
  const opening = {
    id: 'W1-op1',
    xMm: 2000,
    yMm: 900,
    widthMm: 1800,
    heightMm: 1200,
  }
  const holed = { ...member, openings: [opening] }

  function rows(role: '縦筋' | '横筋', member_: Member = holed) {
    return generateWallRebar(input({ member: member_ }), jpMlitRulePack).filter(
      (rebar) => rebar.role === role,
    )
  }

  it('は欠除量ごとに行を分ける — 前文「規格、形状、寸法等ごとに」', () => {
    const vertical = rows('縦筋')

    expect(vertical).toHaveLength(2)
    // 27本のうち 8本が欠け、19本がそのまま。どちらもダブル配筋で ×2。
    expect(vertical.map(({ count }) => count)).toEqual([19 * 2, 8 * 2])
  })

  it('は開口を横切る本だけを開口の内法寸法だけ短くする', () => {
    const [full, cut] = rows('縦筋')

    expect(full.length - cut.length).toBe(
      // 欠除 1200 と、継手が 1か所から 0か所に落ちた分。
      1200 + lap,
    )
    expect(cut.length).toBe(3450 - 1200 + 2 * anchorage)
  })

  it('は走る向きで欠く寸法を変える — 横筋は開口の幅を欠く', () => {
    const [full, cut] = rows('横筋')

    expect(full.count).toBe(13 * 2)
    expect(cut.count).toBe(6 * 2)
    expect(cut.length).toBe(
      5200 - 1800 + 2 * anchorage + cut.splice!.lengthMm,
    )
  })

  it('は開口で断たれた縦筋の継手を 0か所にする — 2（５）壁1)② 但書', () => {
    const [full, cut] = rows('縦筋')

    expect(full.splice?.countPerBar).toBe(1)
    expect(full.splice?.rules.map(({ key }) => key)).toContain(
      'measure.splice.wall.vertical',
    )
    expect(cut.splice?.countPerBar).toBe(0)
    expect(cut.splice?.rules.map(({ key }) => key)).toContain(
      'measure.splice.wall.opening',
    )
    expect(cut.splice?.formula).toContain('開口部腰壁、手すり壁等')
  })

  it('は横筋の継手を欠除後の長さで数える — 1通則4)「計測・計算した鉄筋の長さ」', () => {
    const [full, cut] = rows('横筋')

    // 5200＋定着 は 6.0m を越えるが、1800 を欠くと越えない。
    expect(full.splice?.countPerBar).toBe(1)
    expect(cut.splice?.countPerBar).toBe(0)
  })

  it('は 0.5㎡以下の開口で行を分けず、欠除しなかったことを算出式に書く', () => {
    const small = {
      ...member,
      openings: [{ ...opening, widthMm: 700, heightMm: 700 }],
    }
    const vertical = rows('縦筋', small)

    expect(vertical).toHaveLength(1)
    expect(vertical[0].count).toBe(27 * 2)
    expect(vertical[0].formula).toContain('700×700')
    expect(vertical[0].formula).toContain('0.5㎡以下')
  })

  it('は行ごとに 3D の並び位置を分ける — 同じ場所に二度描かない', () => {
    const [full, cut] = rows('縦筋')
    const fullAt = full.placement?.positionsMm ?? []
    const cutAt = cut.placement?.positionsMm ?? []

    expect(cutAt).toEqual([2200, 2400, 2600, 2800, 3000, 3200, 3400, 3600])
    expect(fullAt).toHaveLength(19)
    expect(new Set([...fullAt, ...cutAt]).size).toBe(27)
    // positionCount は数量の本数ではなく描く本数だ (ADR-019)。
    expect(full.placement?.positionCount).toBe(19)
  })

  it('は開口がなければ並べ方を変えない — 初期オフセットのままである', () => {
    const vertical = rows('縦筋', member)

    expect(vertical).toHaveLength(1)
    expect(vertical[0].placement?.positionsMm).toBeUndefined()
    expect(vertical[0].placement?.startOffsetMm).toBe(100)
  })

  it('は欠除の出典を行の根拠に載せる', () => {
    const [, cut] = rows('縦筋')

    expect(cut.ruleHits.map(({ key }) => key)).toContain(
      'measure.opening.deduction.minimum.area',
    )
    expect(cut.formula).toContain('1通則8)')
  })

  it('は 3D 経路を欠かせない — 欠ける位置は本ごとに違う', () => {
    const [, cut] = rows('縦筋')

    // points は開口を知らない全長の経路で、表示部が Member.openings で切る。
    expect(cut.points[0]).toEqual([0, -anchorage, expect.any(Number)])
    expect(cut.points[1]).toEqual([0, 3450 + anchorage, expect.any(Number)])
  })
})
