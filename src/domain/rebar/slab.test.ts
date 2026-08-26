import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from '../../rulepack'
import type { Member, Opening, SlabSection } from '../model/member'
import { slabRun, type Project } from '../model/project'
import { createSampleProject, slabSection } from '../model/sample-project'
import { MemberUnsupportedError } from '../model/unsupported'
import type { Rebar } from '../model/rebar'
import { generateSlabRebar } from './slab'

// サンプル案件: 通り芯 6000×(6000+6000)、大梁は全て b400。躯体の区分（４）で
// 床板は「柱、梁等に接する水平材の内法部分」なので、1ベイの内法は
// 6000 − 400/2 − 400/2 ＝ 5600 である。
const CLEAR = 5600
const GIRDER_WIDTH = 400
// Y方向は2ベイ連なる — ラン芯長 ＝ 5600＋5600＋中間大梁 400 ＝ 11600
const Y_RUN_CORE = CLEAR * 2 + GIRDER_WIDTH

const project = createSampleProject()

function slabAt(project: Project, ix: number, iy: number): Member {
  const found = project.members.find(
    (member) =>
      member.kind === '床板' &&
      member.storyId === '1F' &&
      !('axis' in member.position) &&
      member.position.ix === ix &&
      member.position.iy === iy,
  )
  if (!found) throw new Error(`床板 not found at (${ix}, ${iy})`)
  return found
}

function generate(
  axis: 'X' | 'Y',
  overrides: Partial<SlabSection> = {},
  origin = slabAt(project, 0, 0),
): Rebar[] {
  return generateSlabRebar(
    {
      run: slabRun(project, origin, axis),
      section: { ...slabSection, ...overrides },
    },
    jpMlitRulePack,
  )
}

function byRole(rebars: Rebar[], role: string): Rebar {
  const found = rebars.find((rebar) => rebar.role === role)
  if (!found) throw new Error(`${role} not generated`)
  return found
}

describe('generateSlabRebar — 数量積算基準 2（４）床板', () => {
  it('は1つのランから上端筋と下端筋を1本ずつ出す', () => {
    const rebars = generate('X')

    expect(rebars.map(({ role }) => role)).toEqual([
      'X方向下端筋',
      'X方向上端筋',
    ])
  })

  it('は方向で役割を分ける — 内訳で X と Y が同じ行に見えないように', () => {
    expect(generate('Y').map(({ role }) => role)).toEqual([
      'Y方向下端筋',
      'Y方向上端筋',
    ])
  })

  it('は単独床板の下端筋を「内法 ＋ L3×2」で測る', () => {
    // L3 ＝ max(10×13, 150) ＝ 150。単独床板なので継手は 1通則4) で
    // floor(5900 ÷ 6000) ＝ 0か所 ＝ 長さの加算なし。
    const bottom = byRole(generate('X'), 'X方向下端筋')

    expect(bottom.length).toBe(CLEAR + 150 * 2)
    expect(bottom.splice?.countPerBar).toBe(0)
  })

  it('は上端筋の定着に一般値 L1 を使い、折曲げでも全長は L1 のままである', () => {
    // 大梁 b400 では直線 L1 40d ＝ 520 が入らないので折曲げ定着になるが、
    // 5.3.4(5)(ｲ)(a) が全長を直線定着以上と定めるので長さは 520 のままだ。
    const top = byRole(generate('X'), 'X方向上端筋')

    expect(top.shape).toBe('hook90')
    // 5600 ＋ 520×2 ＝ 6640 → 1通則4) で floor(6640÷6000) ＝ 1か所 ＋ L1 40d
    expect(top.length).toBe(CLEAR + 520 * 2 + 520)
    expect(top.splice?.countPerBar).toBe(1)
  })

  it('は連続する床板をランで測り、中間大梁の幅を1本分だけ足す', () => {
    // 2（４）床板1) の但書「定着長さにかえて接続する梁、壁等の幅の１／２」が
    // 両側から来て中間大梁1本分になる。中間支点に定着は付かない。
    const bottom = byRole(generate('Y'), 'Y方向下端筋')

    expect(slabRun(project, slabAt(project, 0, 0), 'Y').coreLengthMm).toBe(
      Y_RUN_CORE,
    )
    // 11600 ＋ 150×2 ＝ 11900。継手は 2（４）床板2) の 9.0m以上13.5m未満 ＝ 1.5か所
    expect(bottom.splice?.countPerBar).toBe(1.5)
    expect(bottom.length).toBe(Y_RUN_CORE + 150 * 2 + 520 * 1.5)
  })

  it('は連続床板に 1通則4) ではなく 2（４）床板2) の区分表を使う', () => {
    const bottom = byRole(generate('Y'), 'Y方向下端筋')

    expect(bottom.splice?.rules.map(({ key }) => key)).toContain(
      'measure.splice.slab.continuous',
    )
    expect(bottom.splice?.rules.map(({ key }) => key)).not.toContain(
      'measure.splice.interval',
    )
  })

  it('は単独床板に 1通則4) へ戻す — 2（４）床板2) ただし書き', () => {
    const top = byRole(generate('X'), 'X方向上端筋')

    expect(top.splice?.rules.map(({ key }) => key)).toContain(
      'measure.splice.interval',
    )
  })

  it('は本数を 1通則7) で割り付ける — 直交方向の内法をピッチで割る', () => {
    // ⌈5600 ÷ 200⌉ ＋ 1 ＝ 29
    for (const rebar of generate('X')) {
      expect(rebar.count).toBe(29)
    }
  })

  it('は割付の基準に直交方向の内法を取る — 走る向きの長さではない', () => {
    const rebars = generate('X', {
      x: {
        top: { size: 'D13', pitch: 400, startOffsetMm: 100 },
        bottom: { size: 'D13', pitch: 400, startOffsetMm: 100 },
      },
    })

    // ピッチだけ倍にすると本数が半分になる — 走る向きの長さは変わっていない
    for (const rebar of rebars) {
      expect(rebar.count).toBe(15) // ⌈5600 ÷ 400⌉ ＋ 1
    }
  })

  it('は表5.3.6 の「スラブ、耐力壁以外の壁」行でかぶりを取る', () => {
    const bottom = byRole(generate('X'), 'X方向下端筋')
    const cover = bottom.ruleHits.find(
      ({ key, conditions }) =>
        key === 'cover.minimum' && conditions.memberKind === '床板',
    )

    expect(cover?.value).toBe(20) // 仕上げあり — 柱・大梁の 30/40 とは別の行
    // 加工用かぶり ＝ 20 ＋ 10 ＝ 30。下端筋は板の下からその高さに立つ。
    expect(bottom.points[0][2]).toBe(30)
  })

  it('は上端筋を板厚から加工用かぶりを引いた高さに置き、下へ折り曲げる', () => {
    const top = byRole(generate('X'), 'X方向上端筋')
    const barZ = slabSection.thickness - 30

    // 折曲げ定着の垂直余長 ＝ 全長 520 − 投影 195 ＝ 325 を下へ
    expect(top.points[0]).toEqual([-195, 0, barZ - 325])
    expect(top.points[1]).toEqual([-195, 0, barZ])
    expect(top.points.at(-1)).toEqual([CLEAR + 195, 0, barZ - 325])
  })

  it('は X方向の鉄筋を局所 x に伸ばし、y へ並べる', () => {
    const bottom = byRole(generate('X'), 'X方向下端筋')

    expect(bottom.points[0]).toEqual([-150, 0, 30])
    expect(bottom.points.at(-1)).toEqual([CLEAR + 150, 0, 30])
    expect(bottom.placement?.axis).toBe('y')
    expect(bottom.placement?.clearMm).toBe(CLEAR)
  })

  it('は Y方向の鉄筋を局所 y に伸ばし、x へ並べる', () => {
    const bottom = byRole(generate('Y'), 'Y方向下端筋')

    expect(bottom.points[0]).toEqual([0, -150, 30])
    expect(bottom.points.at(-1)).toEqual([0, Y_RUN_CORE + 150, 30])
    expect(bottom.placement?.axis).toBe('x')
  })

  it('は定着区間を zones に載せる — 3D の凡例が形状から推し直さないように', () => {
    const bottom = byRole(generate('X'), 'X方向下端筋')

    expect(bottom.zones).toEqual([
      { kind: '定着', ruleKey: 'anchorage.L3.minimum', pathFromMm: 0, pathToMm: 150 },
      {
        kind: '定着',
        ruleKey: 'anchorage.L3.minimum',
        pathFromMm: CLEAR + 150,
        pathToMm: CLEAR + 300,
      },
    ])
  })

  it('はランが 13.5m 以上なら箇所数を作らずに落とす', () => {
    // 2（４）床板2) の区分表は「９．０ｍ以上１３．５ｍ未満」で終わる。梁の表と
    // 違って上が開いていないので、そこから先は原文にない。
    const wide = createSampleProject()
    wide.grid = { xSpans: [7000], ySpans: [7000, 7000] }

    expect(() =>
      generateSlabRebar(
        { run: slabRun(wide, slabAt(wide, 0, 0), 'Y'), section: slabSection },
        jpMlitRulePack,
      ),
    ).toThrow(MemberUnsupportedError)
  })

  it('は板厚に上下2面が入らなければ落とす — 裏返った板を描かない', () => {
    // 加工用かぶり ＝ 20 ＋ 10 ＝ 30。板厚 60 では上端筋が下端筋より下になる。
    expect(() => generate('X', { thickness: 60 })).toThrow(
      MemberUnsupportedError,
    )
  })

  it('は算出式に条文と内訳を書く', () => {
    const bottom = byRole(generate('Y'), 'Y方向下端筋')

    expect(bottom.formula).toContain('内法長さ')
    expect(bottom.formula).toContain('中間大梁')
    expect(bottom.formula).toContain('L3')
    // 継手の条文は継手の行が語る — 内訳書でも「箇所」の行は別に立つ。
    expect(bottom.splice?.formula).toContain('2（４）床板2)')
  })
})

describe('generateSlabRebar — 開口部の欠除 (数量積算基準 1通則8))', () => {
  // 内法 5600×5600、ピッチ 200 で 29本。開口 1200×1200 を (2400, 2400) に置くと、
  // どちらの向きも直交方向の (2400, 3600) の内側 5本が 1200 を欠く。
  const opening = {
    id: 'S1-op1',
    xMm: 2400,
    yMm: 2400,
    widthMm: 1200,
    heightMm: 1200,
  }

  function holed(openings = [opening], ix = 0, iy = 0): Project {
    const target = slabAt(project, ix, iy)
    return {
      ...project,
      members: project.members.map((member) =>
        member.id === target.id ? { ...member, openings } : member,
      ),
    }
  }

  function rows(axis: 'X' | 'Y', from: Project = holed()): Rebar[] {
    return generateSlabRebar(
      { run: slabRun(from, slabAt(from, 0, 0), axis), section: slabSection },
      jpMlitRulePack,
    )
  }

  it('は開口を横切る本だけを欠除し、欠除量ごとに行を分ける', () => {
    const bottom = rows('X').filter(({ role }) => role === 'X方向下端筋')

    expect(bottom.map(({ count }) => count)).toEqual([24, 5])
    expect(bottom[0].length - bottom[1].length).toBe(1200)
  })

  it('は両方向に効く — 1通則8) は部材も向きも限っていない', () => {
    const y = rows('Y').filter(({ role }) => role === 'Y方向下端筋')

    expect(y.map(({ count }) => count)).toEqual([24, 5])
  })

  it('は単独床板の継手を欠除後の長さで数える — 1通則4)', () => {
    const top = rows('X').filter(({ role }) => role === 'X方向上端筋')

    // 5600 ＋ 定着 520×2 ＝ 6640 は 6.0m を越えるが、1200 を欠くと越えない。
    expect(top[0].splice?.countPerBar).toBe(1)
    expect(top[1].splice?.countPerBar).toBe(0)
  })

  it('は連続床板の継手箇所数を変えない — 区分表は「床板の長さ」で引く', () => {
    // 壁の 2（５）壁1)② と違って、床板の 2（４）床板2) には開口の但書がない。
    const y = rows('Y').filter(({ role }) => role === 'Y方向下端筋')

    for (const rebar of y) {
      expect(rebar.splice?.countPerBar).toBe(1.5)
    }
  })

  it('はベイの開口をラン座標に直す — 2ベイ目の開口は始端から離れる', () => {
    // 2ベイ目 (0,1) の開口は、ラン原点から 5600＋中間大梁 400 ＝ 6000 先にある。
    const run = slabRun(holed([opening], 0, 1), slabAt(project, 0, 0), 'Y')

    expect(run.openings).toEqual([{ ...opening, yMm: 2400 + 6000 }])
  })

  it('は 2ベイ目の開口でもX方向筋の並びは動かさない — 直交方向は共通である', () => {
    const x = rows('X', holed([opening], 0, 1)).filter(
      ({ role }) => role === 'X方向下端筋',
    )

    // X方向のランは (0,0) の1ベイだけなので、隣のベイの開口は効かない。
    expect(x).toHaveLength(1)
    expect(x[0].count).toBe(29)
  })

  it('は 0.5㎡以下の開口を欠除しない', () => {
    const small = holed([{ ...opening, widthMm: 700, heightMm: 700 }])
    const bottom = rows('X', small).filter(
      ({ role }) => role === 'X方向下端筋',
    )

    expect(bottom).toHaveLength(1)
    expect(bottom[0].count).toBe(29)
    expect(bottom[0].formula).toContain('0.5㎡以下')
  })

  it('は行ごとに 3D の並び位置を分ける', () => {
    const bottom = rows('X').filter(({ role }) => role === 'X方向下端筋')

    expect(bottom[1].placement?.positionsMm).toEqual([
      2600, 2800, 3000, 3200, 3400,
    ])
    expect(bottom[0].placement?.positionsMm).toHaveLength(24)
  })

  it('は開口がなければ並べ方も行数も変えない', () => {
    const bottom = rows('X', project).filter(
      ({ role }) => role === 'X方向下端筋',
    )

    expect(bottom).toHaveLength(1)
    expect(bottom[0].placement?.positionsMm).toBeUndefined()
  })

  it('は欠除を算出式に書き、出典を行の根拠に載せる', () => {
    const bottom = rows('X').filter(({ role }) => role === 'X方向下端筋')

    expect(bottom[1].formula).toContain('1通則8)')
    expect(bottom[1].ruleHits.map(({ key }) => key)).toContain(
      'measure.opening.deduction.minimum.area',
    )
  })
})

describe('generateSlabRebar — 開口補強筋の設計図書転記 (1通則8) なお書き', () => {
  it('emits reinforcement transcriptions from a floor opening', () => {
    const opening: Opening = {
      id: 'S1-reinforcement-opening',
      xMm: 2400,
      yMm: 2400,
      widthMm: 1200,
      heightMm: 1200,
      reinforcements: [{ size: 'D13', count: 3, lengthMm: 900 }],
    }
    const target = slabAt(project, 0, 0)
    const withOpening: Project = {
      ...project,
      members: project.members.map((member) =>
        member.id === target.id ? { ...member, openings: [opening] } : member,
      ),
    }

    const reinforcements = generateSlabRebar(
      {
        run: slabRun(withOpening, slabAt(withOpening, 0, 0), 'X'),
        section: slabSection,
      },
      jpMlitRulePack,
    ).filter(({ role }) => role === '開口補強筋')

    expect(reinforcements).toHaveLength(1)
    expect(reinforcements[0]).toMatchObject({
      role: '開口補強筋',
      size: 'D13',
      count: 3,
      length: 900,
      shape: 'straight',
      points: [
        [0, 0, 0],
        [900, 0, 0],
      ],
      closed: false,
      ruleHits: [],
    })
    expect(reinforcements[0]).not.toHaveProperty('zones')
    expect(reinforcements[0]).not.toHaveProperty('placement')
    expect(reinforcements[0].formula).toContain('設計図書転記')
    expect(reinforcements[0].formula).toContain('1通則8)')
  })
})
