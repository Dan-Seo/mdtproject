import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from '../../rulepack'
import { MemberUnsupportedError } from '../model/unsupported'
import { resolveSlabEnd } from './slab-ends'

// サンプル案件の大梁 G1 と同じかぶりセル。定着が納まるかは支点（大梁）の
// かぶりで決まるので、床板側の仕上げではなくこちらを渡す。
const girderCover = {
  memberKind: '大梁',
  soilContact: false,
  exposure: '屋外',
  finish: '仕上げなし',
}

// 屋外・仕上げなし ＝ 最小かぶり 40 ＋ 加工用 10。幅 400 の大梁なら投影に
// 使えるのは 350mm である。
const fabricationCoverMm = 50

function end(
  overrides: Partial<Parameters<typeof resolveSlabEnd>[0]> = {},
) {
  return resolveSlabEnd(
    {
      supportWidthMm: 400,
      supportCover: girderCover,
      barSize: 'D13',
      fc: 24,
      grade: 'SD345',
      face: '下端',
      ...overrides,
    },
    jpMlitRulePack,
  )
}

describe('床板下端筋の定着 — 表5.3.4 の L3（スラブ欄）', () => {
  it('は「10d かつ150mm以上」の大きい方を取る — D13 では下限が勝つ', () => {
    const detail = end({ barSize: 'D13' })

    if (detail.kind !== '直線定着') throw new Error('直線定着 expected')
    expect(detail.lengthMm).toBe(150) // max(10×13 ＝ 130, 150)
    expect(detail.lengthRule).toBe('anchorage.L3.minimum')
  })

  it('は太い径では 10d が勝つ — 下限で頭打ちにしない', () => {
    const detail = end({ barSize: 'D16' })

    if (detail.kind !== '直線定着') throw new Error('直線定着 expected')
    expect(detail.lengthMm).toBe(160) // max(10×16 ＝ 160, 150)
    expect(detail.lengthRule).toBe('anchorage.L3')
  })

  it('は L1 を使わない — 一般値を引くと下端筋が3倍以上長くなる', () => {
    const detail = end()

    expect(detail.usedRules.map(({ key }) => key)).toContain('anchorage.L3')
    expect(detail.usedRules.map(({ key }) => key)).not.toContain('anchorage.L1')
  })

  it('は折曲げに逃げない — 表5.3.5 Lb は上端筋の列で、L3h のスラブ欄は「─」だ', () => {
    // 支点に入らなければ折曲げ定着ではなく不成立である。曲げ方を製品が
    // 決めてよい根拠が原文にない。
    expect(() => end({ supportWidthMm: 180 })).toThrow(MemberUnsupportedError)
    expect(() => end({ supportWidthMm: 180 })).toThrow(/定着不成立|収まらない/)
  })
})

describe('床板上端筋の定着 — 直線 L1、入らなければ 5.3.4(5)(ｲ) の折曲げ', () => {
  it('は大梁が広ければ直線定着 L1 で入る', () => {
    // 幅 800 なら使用可能 750 ≧ L1 40d ＝ 520
    const detail = end({ face: '上端', supportWidthMm: 800 })

    if (detail.kind !== '直線定着') throw new Error('直線定着 expected')
    expect(detail.lengthMm).toBe(40 * 13)
    expect(detail.lengthRule).toBe('anchorage.L1')
  })

  it('は入らなければ折曲げ定着になり、投影は表5.3.5 の Lb である', () => {
    // 使用可能 350 < L1 520 なので折曲げ。Lb は SD345 Fc24 ＝ 15d ＝ 195。
    const detail = end({ face: '上端' })

    if (detail.kind !== '折曲げ定着') throw new Error('折曲げ定着 expected')
    expect(detail.projectionMm).toBe(15 * 13)
    expect(detail.projectionRule).toBe('anchorage.Lb')
    expect(detail.projectionMm).toBeLessThanOrEqual(400 - fabricationCoverMm)
  })

  it('は (a) 全長 ≧ L1・(b) 余長 ≧ 8d をともに満たす', () => {
    const detail = end({ face: '上端' })

    if (detail.kind !== '折曲げ定着') throw new Error('折曲げ定着 expected')
    // (a) 全長は表5.3.4 の**直線**定着以上 — L1h ではない (R7③-1 と同じ罠)
    expect(detail.lengthMm).toBeGreaterThanOrEqual(40 * 13)
    expect(detail.lengthMm).toBe(Math.max(40 * 13, 15 * 13 + 8 * 13))
    // (b) 余長 ＝ 全長 − 投影
    expect(detail.lengthMm - detail.projectionMm).toBeGreaterThanOrEqual(8 * 13)
  })

  it('は柱せいの3/4 を投影の下限にしない — その但書は梁主筋の柱内定着だけだ', () => {
    // 5.3.4(5)(ｲ)(c) の「ただし、梁主筋の柱内定着においては、柱せいの3/4 倍
    // 以上とする」は床板筋に掛からない。掛けると幅 400 の大梁で 300mm を
    // 要求することになり、原文にない値で不成立を作る。
    const detail = end({ face: '上端' })

    if (detail.kind !== '折曲げ定着') throw new Error('折曲げ定着 expected')
    expect(detail.projectionMm).toBe(15 * 13)
    expect(detail.usedRules.map(({ key }) => key)).not.toContain(
      'anchorage.bent.projection.minimum',
    )
    expect(detail.usedRules.map(({ key }) => key)).not.toContain('anchorage.La')
  })

  it('は投影すら入らなければ不成立で落とす — 黙って短くしない', () => {
    // 幅 240 の大梁なら使用可能 190 < Lb 195
    expect(() => end({ face: '上端', supportWidthMm: 240 })).toThrow(
      MemberUnsupportedError,
    )
  })

  it('は L1h を引かない — (ｲ) の適用条件であって全長の下限ではない', () => {
    const detail = end({ face: '上端' })

    expect(detail.usedRules.map(({ key }) => key)).not.toContain(
      'anchorage.L1h',
    )
  })
})
