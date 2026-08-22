import { describe, expect, it } from 'vitest'

import type { RuleEntry } from '../../src/domain/rules/types'
import { jpMlitRulePack } from '../../src/rulepack'

/**
 * 構造不変式による転写検証 (R6)。
 *
 * ルールパックの定着・継手・折曲げ・かぶりは `標準仕様書5章` の表からの転写だが、
 * 転写者と承認者が同一人物なので独立検討になっていない (R6)。値そのものを人が
 * 全部見直すのは現実的でないので、**表が持つ構造的な性質**を機械が見張る。
 *
 * ここに置いてよいのは「原文がそうなっている理由を言える性質」だけである。
 * 「たぶんそうだろう」で書いた不変式は、検証ではなく二つ目の未検証の仮定になる。
 * だから各 describe には、その性質が成り立つ根拠（条文か力学）を書く。
 *
 * 見つけられる誤りは主に**セルのずれ**だ — `標準仕様書` の表は結合セルを含み、
 * PyMuPDF の `get_text()` は読み順を保証しない (docs/M0-FINDINGS.md)。1マス
 * ずれた転写は単調性や列間の大小を壊すので、ここで落ちる。
 *
 * **どこまで守れるか（2026-08-21 の変異テストで実測）**
 * 値をわざと1マスずらして、どの検査が落ちるかを確かめた。
 *   ① L1 SD345 Fc24 を 40d→45d … この不変式群が捕捉（表5.3.2 との一致が崩れる）
 *   ② L2 SD345 の列を1バンド下へ … この不変式群が捕捉（L1 > L2 が崩れる）
 *   ③ La SD345 Fc30 を 15d→20d … **この不変式群では捕捉できない**。
 *      La は対になる表を持たず、L1 との差も大きいので構造が壊れない。
 *      捕まえたのは spec-tables.test.ts の ルールパック↔フィクスチャ照合だった。
 *
 * つまり検証は3層で、層ごとに捕まえる誤りが違う。
 *   ルールパック↔フィクスチャ … 二つの転写物の食い違い（同じ誤読が両方に入ると素通り）
 *   構造不変式（この file） … 表の構造を壊す誤読（両方に同じ誤りが入っていても落ちる）
 *   原文の再読 … 上の二つを素通りする共通誤読（人手・エージェントの2回目の読み）
 * 3層目の実施記録は spec-r7-ch5.json の source.verifications にある。
 */

const FC_BANDS = [18, 21, 24, 27, 30, 33, 36] as const
const GRADES = ['SD295', 'SD345', 'SD390'] as const

function rows(key: string): RuleEntry[] {
  return jpMlitRulePack.entries.filter((entry) => entry.key === key)
}

function valueAt(key: string, grade: string, fc: number): number | null {
  const found = rows(key).find(
    (entry) => entry.conditions.grade === grade && entry.conditions.fc === fc,
  )
  return found?.value ?? null
}

/** Fc·grade の格子を持つ行 — 表5.3.2・表5.3.4・表5.3.5 由来のものだけ */
const GRID_KEYS = [
  'anchorage.L1',
  'anchorage.L2',
  'anchorage.L1h',
  'anchorage.L2h',
  'anchorage.La',
  'anchorage.Lb',
  'lap.L1',
  'lap.L1h',
] as const

describe('表の格子が欠けていない', () => {
  it.each(GRID_KEYS)('%s covers every Fc band for every grade', (key) => {
    for (const grade of GRADES) {
      for (const fc of FC_BANDS) {
        const value = valueAt(key, grade, fc)
        // SD390 に Fc18 が無いのは原文どおり — 表5.3.2・5.3.4・5.3.5 の
        // SD390 は Fc21 から始まる。それ以外の空きは転写漏れである。
        if (grade === 'SD390' && fc === 18) {
          expect(value, `${key} ${grade} Fc${fc} should be absent`).toBeNull()
          continue
        }
        expect(value, `${key} ${grade} Fc${fc} is missing`).not.toBeNull()
      }
    }
  })
})

describe('Fc が上がると定着・継手は短くなる（単調非増加）', () => {
  // コンクリートが強いほど短く定着できる。表5.3.2・5.3.4・5.3.5 はどの列も
  // Fc の昇順に非増加で並ぶ。1マスずれるとここが壊れる。
  it.each(GRID_KEYS)('%s is non-increasing in Fc', (key) => {
    for (const grade of GRADES) {
      const series = FC_BANDS.map((fc) => valueAt(key, grade, fc)).filter(
        (value): value is number => value !== null,
      )
      expect(series.length).toBeGreaterThan(1)
      for (let index = 1; index < series.length; index += 1) {
        expect(
          series[index],
          `${key} ${grade}: Fc band ${index} exceeds the previous band`,
        ).toBeLessThanOrEqual(series[index - 1])
      }
    }
  })
})

describe('鉄筋が強いほど長く定着する（grade 単調非減少）', () => {
  // 降伏強度が高いほど必要な付着長が伸びる。SD295 ≤ SD345 ≤ SD390。
  it.each(GRID_KEYS)('%s is non-decreasing in grade', (key) => {
    for (const fc of FC_BANDS) {
      const series = GRADES.map((grade) => valueAt(key, grade, fc)).filter(
        (value): value is number => value !== null,
      )
      for (let index = 1; index < series.length; index += 1) {
        expect(
          series[index],
          `${key} Fc${fc}: grade ${index} is shorter than the weaker grade`,
        ).toBeGreaterThanOrEqual(series[index - 1])
      }
    }
  })
})

describe('フックがあれば短くなる', () => {
  // 表5.3.4 注5・表5.3.2 注2 — フック分の定着が効くので、フックあり(L1h/L2h)は
  // 同条件の直線(L1/L2)より短い。等しくなるマスは原文に無い。
  it.each([
    ['anchorage.L1', 'anchorage.L1h'],
    ['anchorage.L2', 'anchorage.L2h'],
    ['lap.L1', 'lap.L1h'],
  ])('%s > %s at every cell', (straightKey, hookedKey) => {
    for (const grade of GRADES) {
      for (const fc of FC_BANDS) {
        const straight = valueAt(straightKey, grade, fc)
        const hooked = valueAt(hookedKey, grade, fc)
        if (straight === null || hooked === null) continue
        expect(hooked, `${grade} Fc${fc}`).toBeLessThan(straight)
      }
    }
  })
})

describe('割裂破壊のおそれのない箇所は短くてよい', () => {
  // 表5.3.4 注1・注2 — L2/L2h は「割裂破壊のおそれのない箇所」限定で、
  // 一般値 L1/L1h より短い。逆転していたら列を取り違えている。
  it.each([
    ['anchorage.L1', 'anchorage.L2'],
    ['anchorage.L1h', 'anchorage.L2h'],
  ])('%s > %s at every cell', (generalKey, safeKey) => {
    for (const grade of GRADES) {
      for (const fc of FC_BANDS) {
        const general = valueAt(generalKey, grade, fc)
        const safe = valueAt(safeKey, grade, fc)
        if (general === null || safe === null) continue
        expect(safe, `${grade} Fc${fc}`).toBeLessThan(general)
      }
    }
  })
})

describe('投影定着長さは直線定着より短い', () => {
  // La・Lb は仕口面から鉄筋外面までの投影分でしかなく全長ではない
  // (5.3.4(5)(ｲ)(c)・図5.3.3)。L1 を上回るなら列を取り違えている。
  it.each(['anchorage.La', 'anchorage.Lb'])('%s < L1 at every cell', (key) => {
    for (const grade of GRADES) {
      for (const fc of FC_BANDS) {
        const projection = valueAt(key, grade, fc)
        const l1 = valueAt('anchorage.L1', grade, fc)
        if (projection === null || l1 === null) continue
        expect(projection, `${grade} Fc${fc}`).toBeLessThan(l1)
      }
    }
  })
})

describe('スラブ下端筋の定着は一般値より短い', () => {
  // 表5.3.4 注1・注3 — L3 は「小梁及びスラブの下端筋」限定の緩和で、注2〜4 に
  // 当たらない一般値 L1 より短い。L2 が L1 より短いのと同じ構造である。
  // L3 は縦結合セルなので Fc・鉄筋の種類の格子を持たない — その一つの値が
  // 表のどのマスの L1 よりも小さいことを見る。逆転していたら列を取り違えている。
  it('L3 < L1 at every cell of 表5.3.4', () => {
    const l3 = rows('anchorage.L3')

    expect(l3).toHaveLength(1)
    expect(l3[0].unit).toBe('d')

    for (const grade of GRADES) {
      for (const fc of FC_BANDS) {
        const l1 = valueAt('anchorage.L1', grade, fc)
        if (l1 === null) continue
        expect(l3[0].value, `${grade} Fc${fc}`).toBeLessThan(l1)
      }
    }
  })

  it('L3 の下限 150mm は D13 を上回る — 下限が効かないなら行が要らない', () => {
    // 「10d かつ 150mm 以上」の 150mm は、細い径でこそ効く下限だ。10d を
    // 下回る値を書いてしまうと行があっても一度も効かず、転写ミスに気づけない。
    const floor = rows('anchorage.L3.minimum')
    const perDiameter = rows('anchorage.L3')

    expect(floor).toHaveLength(1)
    expect(floor[0].unit).toBe('mm')
    expect(floor[0].value).toBeGreaterThan(perDiameter[0].value * 13)
  })
})

describe('表5.3.2 と表5.3.4 は別々に読んで一致した', () => {
  it('lap と anchorage の L1・L1h が全マスで一致する', () => {
    // 重ね継手(表5.3.2 紙面28)と定着(表5.3.4 紙面30)は別の頁の別の表で、
    // 別々に転写した。R7 版では全マスが一致する — 片方を複製したのでは
    // ないことの裏づけになる（出典頁が違うことは spec-fixture.test.ts が見る）。
    // 将来版で分岐したらここが落ちる。落ちたら再転写の合図であって、
    // 期待値をこっそり緩める場所ではない。
    for (const [lapKey, anchorageKey] of [
      ['lap.L1', 'anchorage.L1'],
      ['lap.L1h', 'anchorage.L1h'],
    ]) {
      for (const grade of GRADES) {
        for (const fc of FC_BANDS) {
          expect(valueAt(lapKey, grade, fc), `${lapKey} ${grade} Fc${fc}`).toBe(
            valueAt(anchorageKey, grade, fc),
          )
        }
      }
    }
  })
})

describe('かぶり厚さは条件が厳しいほど厚い', () => {
  // 表5.3.6 — 屋外は屋内以上、仕上げなしは仕上げあり以上、土に接する部分は
  // 屋外以上。逆転していたら行を取り違えている。
  function cover(
    memberKind: string,
    soilContact: boolean,
    exposure?: string,
    finish?: string,
  ): number {
    const found = rows('cover.minimum').find(
      (entry) =>
        entry.conditions.memberKind === memberKind &&
        entry.conditions.soilContact === soilContact &&
        (soilContact ||
          (entry.conditions.exposure === exposure &&
            entry.conditions.finish === finish)),
    )
    if (found === undefined) {
      throw new Error(
        `cover.minimum missing: ${memberKind} ${String(soilContact)}`,
      )
    }
    return found.value
  }

  it.each(['柱', '大梁', '耐震壁'])('%s covers grow with exposure', (memberKind) => {
    const indoorFinished = cover(memberKind, false, '屋内', '仕上げあり')
    const outdoorFinished = cover(memberKind, false, '屋外', '仕上げあり')
    const outdoorBare = cover(memberKind, false, '屋外', '仕上げなし')
    const soil = cover(memberKind, true)

    expect(outdoorFinished).toBeGreaterThanOrEqual(indoorFinished)
    expect(outdoorBare).toBeGreaterThanOrEqual(outdoorFinished)
    expect(soil).toBeGreaterThanOrEqual(outdoorBare)
    expect(
      cover(memberKind, false, '屋内', '仕上げなし'),
    ).toBeGreaterThanOrEqual(indoorFinished)
  })

  it('床板は仕上げの有無だけで分かれ、仕上げなしの方が厚い', () => {
    // 表5.3.6 の「スラブ、耐力壁以外の壁」行は**屋内・屋外の区別を持たない** —
    // 「柱、梁、耐力壁」行と構造が違う。exposure 条件を持つ行が混ざっていたら
    // 隣の行から写している。
    const slab = rows('cover.minimum').filter(
      ({ conditions }) => conditions.memberKind === '床板',
    )

    expect(slab).toHaveLength(2)
    for (const entry of slab) {
      expect(entry.conditions).not.toHaveProperty('exposure')
      expect(entry.conditions.soilContact).toBe(false)
    }

    const finished = slab.find(
      ({ conditions }) => conditions.finish === '仕上げあり',
    )!
    const bare = slab.find(
      ({ conditions }) => conditions.finish === '仕上げなし',
    )!

    expect(bare.value).toBeGreaterThan(finished.value)
    // 同じ表の「柱、梁、耐力壁」より薄い側の行だ — 取り違えていたら等しくなる。
    expect(finished.value).toBeLessThan(
      cover('大梁', false, '屋内', '仕上げあり'),
    )
  })

  it('加工用かぶりは最小かぶりに上乗せする正の量である', () => {
    // 5.3.5(2) — 加工用かぶり厚さは最小かぶり厚さに加算する。0 なら区別が消える。
    const addition = rows('cover.fabrication.addition')

    expect(addition).toHaveLength(1)
    expect(addition[0].value).toBeGreaterThan(0)
  })
})

describe('折曲げ内法直径は太い鉄筋・強い鉄筋ほど大きい', () => {
  // 表5.3.1 — 曲げ半径は径と降伏強度で決まり、細く弱いほど小さく曲げられる。
  const SIZES = ['D10', 'D13', 'D16', 'D19', 'D22', 'D25', 'D29', 'D32']

  function bendDiameter(grade: string, size: string): number | null {
    return (
      rows('bend.inside-diameter').find(
        (entry) =>
          entry.conditions.grade === grade && entry.conditions.size === size,
      )?.value ?? null
    )
  }

  it('is non-decreasing in bar size', () => {
    for (const grade of GRADES) {
      const series = SIZES.map((size) => bendDiameter(grade, size)).filter(
        (value): value is number => value !== null,
      )
      for (let index = 1; index < series.length; index += 1) {
        expect(series[index], grade).toBeGreaterThanOrEqual(series[index - 1])
      }
    }
  })

  it('is non-decreasing in grade at the same size', () => {
    for (const size of SIZES) {
      const series = GRADES.map((grade) => bendDiameter(grade, size)).filter(
        (value): value is number => value !== null,
      )
      for (let index = 1; index < series.length; index += 1) {
        expect(series[index], size).toBeGreaterThanOrEqual(series[index - 1])
      }
    }
  })
})

describe('フック余長は角度が浅いほど長い', () => {
  it('180° < 135° < 90°', () => {
    // 表5.3.1 — 折り曲げが浅いほど抜けやすいので余長で補う。
    // この4つは原文が画像で、テキスト抽出ではなく目視転写だ (M0) — 目視ぶん
    // 誤読の余地が大きいので、順序だけは機械で押さえる。
    const hook180 = rows('bend.hook180')[0].value
    const hook135 = rows('bend.hook135')[0].value
    const hook90 = rows('bend.hook90')[0].value

    expect(hook180).toBeLessThan(hook135)
    expect(hook135).toBeLessThan(hook90)
  })
})

describe('値が単位ごとの常識帯に収まる', () => {
  // 桁の取り違え（40d を 400d、40mm を 4mm）はここで落ちる。
  it('every d-unit 定着・継手 value is between 10d and 60d', () => {
    for (const key of GRID_KEYS) {
      for (const entry of rows(key)) {
        expect(entry.unit, key).toBe('d')
        expect(
          entry.value,
          `${key} ${JSON.stringify(entry.conditions)}`,
        ).toBeGreaterThanOrEqual(10)
        expect(entry.value).toBeLessThanOrEqual(60)
      }
    }
  })

  it('every mm-unit かぶり value is between 20mm and 100mm', () => {
    for (const entry of rows('cover.minimum')) {
      expect(entry.unit).toBe('mm')
      expect(entry.value).toBeGreaterThanOrEqual(20)
      expect(entry.value).toBeLessThanOrEqual(100)
    }
  })

  it('no rule carries a non-finite or negative value', () => {
    for (const entry of jpMlitRulePack.entries) {
      expect(Number.isFinite(entry.value), entry.key).toBe(true)
      expect(entry.value, entry.key).toBeGreaterThanOrEqual(0)
    }
  })
})
