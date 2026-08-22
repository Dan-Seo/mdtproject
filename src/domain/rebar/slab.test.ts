import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from '../../rulepack'
import type { Member, SlabSection } from '../model/member'
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
