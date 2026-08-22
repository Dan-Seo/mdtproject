import { describe, expect, it } from 'vitest'

import type { Opening } from '../model/member'
import { MemberUnsupportedError } from '../model/unsupported'
import { jpMlitRulePack } from '../../rulepack'
import { openingDeduction } from './opening'

function opening(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  id = `${xMm}-${yMm}`,
): Opening {
  return { id, xMm, yMm, widthMm, heightMm }
}

// 内法 5200×2400、ピッチ 200。縦筋(alongY)は 27本・横筋(alongX)は 13本 —
// どちらも 1通則7) の ⌈長さ÷間隔⌉＋1 である。
function wall(
  openings: Opening[],
  barAxis: 'x' | 'y',
  totalCount = barAxis === 'x' ? 13 : 27,
) {
  return openingDeduction(
    {
      openings,
      clearXMm: 5200,
      clearYMm: 2400,
      barAxis,
      pitchMm: 200,
      totalCount,
    },
    jpMlitRulePack,
  )
}

describe('openingDeduction — 数量積算基準 1通則8)', () => {
  it('は開口がなければ全数を1つの群にまとめる', () => {
    const result = wall([], 'y')

    expect(result.groups).toEqual([{ deductionMm: 0, count: 27 }])
    expect(result.ignored).toEqual([])
    // 開口がない部材の算出式に閾値の行を挙げると、効いていない根拠を示すことになる。
    expect(result.rules).toEqual([])
  })

  it('は開口を横切る本だけを開口の内法寸法だけ短くする', () => {
    const result = wall([opening(2000, 600, 1800, 1200)], 'y')

    expect(result.groups).toEqual([
      { deductionMm: 0, count: 19 },
      { deductionMm: 1200, count: 8 },
    ])
  })

  it('は走る向きで欠除する寸法を変える — 横筋は開口の幅を欠く', () => {
    const result = wall([opening(2000, 600, 1800, 1200)], 'x')

    expect(result.groups).toEqual([
      { deductionMm: 0, count: 8 },
      { deductionMm: 1800, count: 5 },
    ])
  })

  it('は境界にちょうど載る本を欠除しない', () => {
    // 開口 x ＝ 2000〜3800。割付は 200 刻みなので 2000 と 3800 に本が載る。
    // その2本まで欠けたことにすると、開口の外にある鉄筋を欠除することになる。
    const result = wall([opening(2000, 600, 1800, 1200)], 'y')
    const cut = result.groups.find(({ deductionMm }) => deductionMm > 0)

    // 2000〜3800 の内側は 2200〜3600 の8本。境界を含めれば10本になる。
    expect(cut?.count).toBe(8)
  })

  it('は同じ本が2つの開口を通れば両方を足して欠く', () => {
    const result = wall(
      [opening(2000, 200, 1000, 600), opening(2000, 1400, 1000, 600)],
      'y',
    )

    expect(result.groups).toEqual([
      { deductionMm: 0, count: 23 },
      { deductionMm: 1200, count: 4 },
    ])
  })

  it('は欠除量ごとに群を分ける — 内訳書は「寸法等ごと」に行を立てる', () => {
    const result = wall(
      [opening(1000, 200, 1000, 600), opening(3000, 200, 1000, 800)],
      'y',
    )

    expect(result.groups).toEqual([
      { deductionMm: 0, count: 19 },
      { deductionMm: 600, count: 4 },
      { deductionMm: 800, count: 4 },
    ])
  })

  it('は 1か所当たり内法面積 0.5㎡以下の開口を欠除しない', () => {
    // 700×700 ＝ 0.49㎡
    const result = wall([opening(2000, 600, 700, 700)], 'y')

    expect(result.groups).toEqual([{ deductionMm: 0, count: 27 }])
    expect(result.ignored.map(({ id }) => id)).toEqual(['2000-600'])
  })

  it('は境目ちょうどの 0.5㎡ を欠除しない — 条文が「以下」である', () => {
    const exact = wall([opening(2000, 600, 1000, 500)], 'y')
    const over = wall([opening(2000, 600, 1000, 520)], 'y')

    expect(exact.groups).toEqual([{ deductionMm: 0, count: 27 }])
    expect(over.groups).toHaveLength(2)
  })

  it('は欠除が効いたときだけ閾値の行を根拠に挙げる', () => {
    const cut = wall([opening(2000, 600, 1800, 1200)], 'y')
    const ignored = wall([opening(2000, 600, 700, 700)], 'y')

    // 但書で落とした開口も「0.5㎡以下だから欠除しない」という判断の産物なので、
    // どちらの向きに効いても行は挙がる。
    for (const result of [cut, ignored]) {
      expect(result.rules.map(({ key }) => key)).toEqual([
        'measure.opening.deduction.minimum.area',
      ])
    }
  })

  it('は部材の内法からはみ出す開口を落とす — 図面にない壁を作らない', () => {
    expect(() => wall([opening(4000, 600, 1800, 1200)], 'y')).toThrow(
      MemberUnsupportedError,
    )
    expect(() => wall([opening(2000, 1800, 1800, 1200)], 'y')).toThrow(
      MemberUnsupportedError,
    )
    expect(() => wall([opening(-100, 600, 1800, 1200)], 'y')).toThrow(
      MemberUnsupportedError,
    )
  })

  it('は寸法の正でない開口を落とす', () => {
    expect(() => wall([opening(2000, 600, 0, 1200)], 'y')).toThrow(
      MemberUnsupportedError,
    )
  })

  it('は部材の全長にわたる開口を落とす — 残る鉄筋がない', () => {
    // 内法いっぱいの開口は「壁がない」ということであって、鉄筋 0本の壁ではない。
    expect(() => wall([opening(0, 0, 5200, 2400)], 'y')).toThrow(
      MemberUnsupportedError,
    )
  })

  it('は割付本数を数え直さない — 1通則7) が数えた本数をそのまま配る', () => {
    // 本数を外から与えると、その合計がそのまま群の合計になる。
    const result = wall([opening(2000, 600, 1800, 1200)], 'y', 27)
    const total = result.groups.reduce((sum, { count }) => sum + count, 0)

    expect(total).toBe(27)
  })
})
