import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { jpMlitRulePack } from '../../src/rulepack'

import fixture from './fixtures/spec-r7-ch5.json'

type FixtureEntry = (typeof fixture.entries)[number]

const requiredSourceFields = ['doc', 'edition', 'sha256', 'url'] as const
const requiredEntryFields = [
  'table',
  'pdfPage',
  'printedPage',
  'kind',
  'conditions',
  'value',
  'unit',
  'imageRead',
] as const

function entriesFor(...kinds: string[]): FixtureEntry[] {
  return fixture.entries.filter(({ kind }) => kinds.includes(kind))
}

describe('公共建築工事標準仕様書 令和7年版 5章 fixture', () => {
  it('has the required source and entry fields', () => {
    expect(fixture.entries.length).toBeGreaterThan(0)

    for (const field of requiredSourceFields) {
      expect(fixture.source).toHaveProperty(field)
      expect(fixture.source[field]).not.toBe('')
    }

    for (const entry of fixture.entries) {
      for (const field of requiredEntryFields) {
        expect(entry).toHaveProperty(field)
      }

      expect(entry.table).not.toBe('')
      expect(entry.pdfPage).toBeGreaterThan(0)
      expect(entry.printedPage).toBeGreaterThan(0)
    }

    const citedPages = [...fixture.entries, ...fixture.constraints].filter(
      (entry) =>
        typeof entry.pdfPage === 'number' &&
        typeof entry.printedPage === 'number',
    )
    expect(citedPages).toHaveLength(fixture.entries.length + fixture.constraints.length)
    for (const entry of citedPages) {
      if (typeof entry.pdfPage !== 'number' || typeof entry.printedPage !== 'number') {
        continue
      }

      // PDF 앞붙이 6쪽을 제외한 이 판의 PDF 쪽과 인쇄 쪽 대응이다.
      expect(
        entry.pdfPage,
        `${entry.table} ${entry.kind}: PDF 쪽은 인쇄 쪽 + 6이어야 한다`,
      ).toBe(entry.printedPage + 6)
    }
  })

  it('contains all 22 重ね継手 cells', () => {
    expect(entriesFor('lap.L1', 'lap.L1h')).toHaveLength(22)
  })

  it('contains all 44 定着 cells for 柱 and 大梁', () => {
    expect(
      entriesFor(
        'anchorage.L1',
        'anchorage.L2',
        'anchorage.L1h',
        'anchorage.L2h',
      ),
    ).toHaveLength(44)
  })

  it('contains all 11 梁主筋 投影定着 La cells', () => {
    expect(entriesFor('anchorage.La')).toHaveLength(11)
  })

  it('contains all 11 小梁・スラブ上端筋 投影定着 Lb cells', () => {
    // La と同じ帯構造の別の列だ。数が合わないなら列を跨いで読んでいる。
    expect(entriesFor('anchorage.Lb')).toHaveLength(11)
  })

  it('takes L3 as one merged スラブ cell, not a per-Fc grid', () => {
    // 表5.3.4 の L3 は縦に結合されたセルで、鉄筋の種類にも Fc にも依らない。
    // 11マスに展開して転写していたら、原文にない格子を作ったことになる。
    const l3 = entriesFor('anchorage.L3', 'anchorage.L3.minimum')

    expect(l3).toHaveLength(3)
    expect(l3.filter((entry) => entry.kind === 'anchorage.L3')).toHaveLength(2)
    expect(
      l3.find((entry) => entry.kind === 'anchorage.L3.minimum')?.conditions,
    ).toEqual({ member: 'スラブ' })
    expect(
      l3.find(
        (entry) => entry.conditions.member === 'スラブ' && entry.kind === 'anchorage.L3',
      )?.value,
    ).toBe(10)
    expect(
      l3.find(
        (entry) => entry.conditions.member === '片持スラブ' && entry.kind === 'anchorage.L3',
      )?.value,
    ).toBe(25)
    expect(
      l3.some(
        (entry) =>
          entry.kind === 'anchorage.L3.minimum' &&
          entry.conditions.member === '片持スラブ',
      ),
    ).toBe(false)
  })

  it('carries explicit expansion values for every band', () => {
    // 帯 표기(fcBand·barSizeBand)만 있고 전개값이 없으면 골든테스트가 전개
    // 근거를 .ts 상수로 되가져가게 된다 — 전개값은 픽스처의 전사 데이터다.
    for (const entry of fixture.entries) {
      const conditions = entry.conditions as Record<string, unknown>
      if ('fcBand' in conditions) {
        expect(
          Array.isArray(conditions.fcValues) && conditions.fcValues.length > 0,
          `${entry.table} ${String(conditions.fcBand)} needs fcValues`,
        ).toBe(true)
      }
      if (entry.kind === 'bend.inside-diameter') {
        expect(
          Array.isArray(conditions.barSizes) && conditions.barSizes.length > 0,
          `${entry.table} needs barSizes`,
        ).toBe(true)
      }
    }
  })

  it('keeps non-rule-shaped clauses in constraints, separate from rule entries', () => {
    // 제품이 소비하지 않는 제약과 조건부 전사는 룰팩 행과 분리한다 —
    // entries에 섞으면 소비자가 없는 값이 계산에 기여하는 것처럼 보인다.
    expect(fixture.constraints).toHaveLength(3)
    expect(fixture.constraints[0]).toMatchObject({
      table: '5.3.4(1)',
      kind: 'lap.prohibited.minimum-bar-size',
      conditions: { barSizeBand: 'D35以上' },
      prohibited: true,
    })
    expect(
      fixture.entries.some(({ kind }) => kind.startsWith('lap.prohibited')),
    ).toBe(false)
  })

  it('records 表5.3.1 注1 as a conditional transcription, not a rule-pack row', () => {
    const note1 = fixture.constraints.find(
      ({ kind }) => kind === 'bend.free-end-hook.minimum',
    )

    expect(note1).toMatchObject({
      table: '表5.3.1 注1',
      pdfPage: 33,
      printedPage: 27,
      quote:
        '片持ちスラブ先端、壁筋の自由端側の先端で90°フック又は135°フックを用いる場合には、余長は4d 以上とする。',
      value: 4,
      unit: 'd',
      confidence: 'transcribed',
      imageRead: false,
    })
    expect(
      jpMlitRulePack.entries.some(
        ({ key }) => key === 'bend.free-end-hook.minimum',
      ),
    ).toBe(false)
  })

  it('records who re-read the original, how, and what it proved', () => {
    // 「独立検討済み(stated)」に上げてよいかを判断する材料は、値そのものでは
    // なく**誰がどうやって確かめたか**だ。ここが空のまま等級だけ上がるのを防ぐ。
    const [verification] = fixture.source.verifications

    expect(fixture.source.verifications.length).toBeGreaterThan(0)
    expect(verification.date).not.toBe('')
    expect(verification.method).not.toBe('')
    expect(verification.tables.length).toBeGreaterThan(0)
    expect(verification.cells).toBeGreaterThan(0)
    // 2回目の読みが転写者と同じ人格なら、それは独立検討ではない。
    // その事実を書き残していないと、後から「検証済み」とだけ読まれる。
    expect(verification.note).toContain('独立検討ではない')
  })

  it('separates 意図した除外 from 転写漏れ', () => {
    // 表5.3.4 の L3・L3h と表5.3.5 の Lb は小梁・スラブ専用で ADR-005 の対象外だ。
    // どこにも書いていないと、後で「表を全部写していない」と読まれる。
    const excludedColumns = fixture.excluded.flatMap(({ columns }) => columns)

    // 床板が範囲に入った時点で L3 のスラブ欄と Lb は除外から entries へ移った
    // (ADR-028)。残る除外は小梁の列と、原文が「─」の L3h だけである。
    expect(excludedColumns).toEqual(['L3(小梁)', 'L3h'])
    for (const entry of fixture.excluded) {
      expect(entry.reason).toContain('ADR-005')
      expect(entry.quote).not.toBe('')
    }
    // 除外した列が entries に紛れ込んでいない。L3h はスラブ欄が「─」で値が
    // ないので、どの経路でも entries に現れてはならない。
    expect(fixture.entries.some(({ kind }) => /\.L3h$/.test(kind))).toBe(false)
  })

  it('names the rules that are transcribed but not yet reachable', () => {
    // 軽量コンクリートの 5d 加算は原文の注を写してあるが、製品が軽量かどうかを
    // 入力に持たないので今はどの照会にも当たらない。値が誤っているのではなく
    // 使い道がまだない — 「死んだ行」と「間違った行」を取り違えないための記録。
    const [unused] = fixture.unused

    expect(unused.kinds).toContain('anchorage.lightweight.addition')
    expect(unused.reason).toContain('入力として受け取らない')

    // 折曲げ定着の全長下限が L1h から L1 に直った時点で L1h はどの値も決めなく
    // なった。台帳に載せないと「死んだ行」が「まだ書いていない行」に見える。
    const kinds = fixture.unused.flatMap(({ kinds: list }) => list)
    expect(kinds).toContain('anchorage.L1h')
    expect(kinds).toContain('anchorage.L2')
    for (const entry of fixture.unused) {
      expect(entry.quote, entry.kinds.join(',')).not.toBe('')
      expect(entry.reason, entry.kinds.join(',')).not.toBe('')
    }
  })

  /**
   * 台帳が実態から外れたら落ちる。ルールパックのキーのうち、ドメインコードが
   * 文字列リテラルで引いていないものは全部ここに名前が載っていなければならない
   * — でなければこの台帳は作られた日にしか正しくない。
   */
  it('lists every rulepack key the product never looks up', () => {
    const roots = ['src/domain', 'src/lib', 'src/components']
    const sources = roots.flatMap((root) => {
      const dir = new URL(`../../${root}/`, import.meta.url)
      return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
        .map((name) => readFileSync(new URL(name, dir), 'utf8'))
    })
    const looked = new Set(
      sources
        .join(' ')
        .match(/'[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+'/g)
        ?.map((quoted) => quoted.slice(1, -1)) ?? [],
    )
    const ledger = new Set(fixture.unused.flatMap(({ kinds }) => kinds))
    const orphans = [
      ...new Set(jpMlitRulePack.entries.map(({ key }) => key)),
    ].filter((key) => !looked.has(key) && !ledger.has(key))

    expect(orphans, '台帳に無い未照会キー').toEqual([])
  })

  it('carries 折曲げ定着 の全長下限 as a reference to 直線定着, not a number', () => {
    // この条項が fixture に無かったせいで resolveGirderEnd が下限に L1h を使い、
    // 全長が条文より短く出ていた。参照先の kind をここで名指ししておく。
    const total = fixture.constraints.find(
      ({ kind }) => kind === 'anchorage.bent.total-length.minimum',
    )!

    expect(total).toBeDefined()
    expect(total.table).toBe('5.3.4(5)(ｲ)(a)')
    expect(total.printedPage).toBe(31)
    expect(total.quote).toBe('全長は、表5.3.4 の直線定着の長さ以上とする。')
    // 「フックありの定着の長さ」ではない — L1h は (ｲ) の適用条件であって下限ではない。
    expect(total.referencesKind).toBe('anchorage.L1')
    expect(total.quote).not.toContain('フックあり')
  })
})
