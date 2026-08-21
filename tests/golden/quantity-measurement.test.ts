import { describe, expect, it } from 'vitest'

import type {
  ColumnSection,
  GirderSection,
  Member,
} from '../../src/domain/model/member'
import {
  columnEnds,
  PROJECT_SCHEMA_VERSION,
  girderRun,
  type Project,
  type Story,
} from '../../src/domain/model/project'
import { generateColumnRebar } from '../../src/domain/rebar/column'
import { generateGirderRebar } from '../../src/domain/rebar/girder'
import { intervalSpliceCount } from '../../src/domain/rebar/measurement'
import { lookupRule, lookupUnitMass } from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/quantity-r5-ch3.json'

/**
 * 期待値は原文からの独立転写であって実装から導かない (ADR-010)。この
 * ファイルが読むのは fixture の数値だけで、ルールパック照会で組み立て直さない。
 */

const STORY: Story = { id: '1F', name: '1階', height: 4200 }

function columnSection(
  overrides: Partial<ColumnSection> = {},
): ColumnSection {
  return {
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
    ...overrides,
  }
}

function girderSection(
  overrides: Partial<GirderSection> = {},
): GirderSection {
  return {
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
    ...overrides,
  }
}

function columnMember(index: number, sectionId: string): Member {
  return {
    id: `1F-C${index}`,
    kind: '柱',
    memberClass: '躯体',
    sectionId,
    storyId: STORY.id,
    position: { ix: index, iy: 0 },
  }
}

function girderMember(index: number, sectionId: string): Member {
  return {
    id: `1F-G${index}`,
    kind: '大梁',
    memberClass: '躯体',
    sectionId,
    storyId: STORY.id,
    position: { axis: 'X', ix: index, iy: 0 },
  }
}

/** 通り芯上に X 方向へ連続する大梁を並べたプロジェクト。 */
function girderProject(
  centerSpansMm: number[],
  column: ColumnSection,
  girder: GirderSection,
  story: Story = STORY,
): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: '数量積算基準ゴールデンテスト',
    grid: { xSpans: centerSpansMm, ySpans: [6000] },
    stories: [story],
    sections: [column, girder],
    members: [
      ...centerSpansMm.map((_, index) => columnMember(index, column.id)),
      columnMember(centerSpansMm.length, column.id),
      ...centerSpansMm.map((_, index) => girderMember(index, girder.id)),
    ],
  }
}

function girderRebarFor(
  centerSpansMm: number[],
  column: ColumnSection,
  girder: GirderSection,
  story: Story = STORY,
) {
  const project = girderProject(centerSpansMm, column, girder, story)
  const owner = project.members.find(({ kind }) => kind === '大梁')!
  const run = girderRun(project, owner)

  return {
    run,
    rebars: generateGirderRebar({ run, section: girder }, jpMlitRulePack),
  }
}

function columnRebarFor(section: ColumnSection, story: Story = STORY) {
  return generateColumnRebar(
    {
      member: columnMember(0, section.id),
      section,
      story,
      beamDepthAbove: 750,
      // 既定は単独スタック（1階建て）— 基礎に定着し、屋上は先端（1通則1)、R9①）。
      ends: { bottom: '定着', top: '先端' },
    },
    jpMlitRulePack,
  )
}

function roleOf(rebars: ReturnType<typeof columnRebarFor>, role: string) {
  const found = rebars.find((rebar) => rebar.role === role)
  expect(found, `${role} should be generated`).toBeDefined()
  return found!
}

describe('公共建築数量積算基準 令和5年改定 第4編第3章 fixture', () => {
  it('carries the source identity needed to re-check the original', () => {
    for (const field of [
      'doc',
      'edition',
      'url',
      'sha256',
      'chapter',
      'chapterShort',
    ]) {
      expect(fixture.source).toHaveProperty(field)
      expect(fixture.source[field as keyof typeof fixture.source]).not.toBe('')
    }
  })

  it('cites both page numbers for every clause and definition', () => {
    const cited = [...fixture.clauses, ...fixture.definitions]
    expect(cited.length).toBeGreaterThan(0)

    for (const entry of cited) {
      expect(entry.id).not.toBe('')
      expect(entry.quote).not.toBe('')
      expect(entry.printedPage).toBeGreaterThan(0)
      // 紙面頁と PDF 頁の対応が崩れたら転写元が別の版だということ。
      expect(entry.pdfPage).toBe(entry.printedPage + 5)
    }
  })

  it('leaves no clause neither covered nor explicitly deferred', () => {
    // 「対照した」と「見送った」が区別できないと、未実装が緑に見える。
    for (const clause of fixture.clauses) {
      expect(['covered', 'deferred']).toContain(clause.status)

      if (clause.status === 'covered') {
        expect(clause).toHaveProperty('coveredBy')
        expect(clause.coveredBy).not.toBe('')
      } else {
        expect(clause).toHaveProperty('reason')
        expect(clause.reason).not.toBe('')
      }
    }
  })
})

describe('1通則 前文 — 設計長さ × JIS の単位質量', () => {
  it('delegates the unit mass to JIS rather than carrying its own value', () => {
    const unitMass = lookupUnitMass(jpMlitRulePack, 'D25')

    expect(unitMass.source.short).toBe('JIS G 3112')
    expect(unitMass.unit).toBe('kg/m')
  })
})

describe('計測規則の出典がルールパックに載っている', () => {
  // 数量を決めた条項が RuleHit にならないと、内訳行の出典チップにはその数量に
  // 効かないかぶり行だけが残る。出典表示は法的義務なので空白にできない。
  const cited = [
    { key: 'measure.hoop.length.addition', clause: '1通則2)' },
    { key: 'measure.distribution.addition', clause: '1通則7)' },
  ]

  it.each(cited)('$key cites $clause with its printed page', ({ key, clause }) => {
    const entry = fixture.clauses.find(({ id }) => id === clause)!
    const hit = lookupRule(jpMlitRulePack, key, {})

    expect(hit.source.doc).toBe(fixture.source.doc)
    expect(hit.source.edition).toBe(fixture.source.edition)
    expect(hit.source.section).toBe(
      `${fixture.source.chapterShort} ${clause}`,
    )
    expect(hit.source.page).toBe(entry.printedPage)
    // 原文に明記された条項なので推定ではない。
    expect(hit.confidence).toBe('stated')
    expect(entry.status).toBe('covered')
  })

  it('attaches both to the 帯筋 and あばら筋 rows they govern', () => {
    const hoop = roleOf(columnRebarFor(columnSection()), '帯筋')
    const { rebars } = girderRebarFor([6000], columnSection(), girderSection())
    const stirrup = roleOf(rebars, 'あばら筋')

    for (const rebar of [hoop, stirrup]) {
      const keys = rebar.ruleHits.map(({ key }) => key)
      for (const { key } of cited) expect(keys).toContain(key)
    }
  })
})

describe('1通則2) フープ・スタラップの長さ ＝ 断面の設計寸法による周長', () => {
  const columnCases = fixture.cases.hoopDesignLength.filter(
    ({ memberKind }) => memberKind === '柱',
  )
  const girderCases = fixture.cases.hoopDesignLength.filter(
    ({ memberKind }) => memberKind === '大梁',
  )

  it.each(columnCases)('$label 帯筋 ＝ $expectedMm', (testCase) => {
    const hoop = roleOf(
      columnRebarFor(
        columnSection({
          b: testCase.sectionWidthMm,
          d: testCase.sectionDepthMm,
        }),
      ),
      '帯筋',
    )

    expect(hoop.length).toBe(testCase.expectedMm)
  })

  it.each(girderCases)('$label あばら筋 ＝ $expectedMm', (testCase) => {
    const section = girderSection({
      b: testCase.sectionWidthMm,
      depth: testCase.sectionDepthMm,
    })
    const { rebars } = girderRebarFor([6000], columnSection(), section)

    expect(roleOf(rebars, 'あばら筋').length).toBe(testCase.expectedMm)
  })

})

describe('1通則7) 割付本数 ＝ ⌈その部分の長さ ÷ 間隔⌉ ＋ 1', () => {
  it.each(
    fixture.cases.distributionCount.filter(({ label }) =>
      label.startsWith('各階柱'),
    ),
  )('$label ＝ $expectedCount 本', (testCase) => {
    // （２）柱3)「フープは各階ごとに」＋ 躯体の区分「各階柱は各階床板上面間」
    // ＝ その部分の長さは階高。上部大梁せいを引いた内法ではない。
    const hoop = roleOf(
      columnRebarFor(
        columnSection({
          hoop: {
            size: 'D13',
            pitch: testCase.pitchMm,
            startOffsetMm: 0,
          },
        }),
        { ...STORY, height: testCase.partLengthMm },
      ),
      '帯筋',
    )

    expect(hoop.count).toBe(testCase.expectedCount)
  })

  it.each(
    fixture.cases.distributionCount.filter(({ label }) =>
      label.startsWith('大梁'),
    ),
  )('$label ＝ $expectedCount 本', (testCase) => {
    // （３）梁3)「スタラップは各梁ごとに」＋ 躯体の区分「大梁は内法部分」
    // ＝ その部分の長さは内法長さ。断面一覧の初期オフセットは関与しない。
    const column = columnSection()
    const centerSpan = testCase.partLengthMm + column.b
    const { rebars } = girderRebarFor(
      [centerSpan],
      column,
      girderSection({
        stirrup: { size: 'D13', pitch: testCase.pitchMm, startOffsetMm: 50 },
      }),
    )

    expect(roleOf(rebars, 'あばら筋').count).toBe(testCase.expectedCount)
  })

  it('ignores the section-list start offset when counting', () => {
    const column = columnSection()
    const counts = [0, 50, 125].map((startOffsetMm) => {
      const { rebars } = girderRebarFor(
        [6000],
        column,
        girderSection({
          stirrup: { size: 'D13', pitch: 100, startOffsetMm },
        }),
      )
      return roleOf(rebars, 'あばら筋').count
    })

    expect(new Set(counts).size).toBe(1)
  })
})

describe('2（２）柱1) 主筋の長さ ＝ 柱の長さ ＋ 定着長さ及び余長', () => {
  it('measures the 柱 length term as the story height', () => {
    const main = roleOf(columnRebarFor(columnSection()), '主筋')
    const ends = main.zones ?? []

    // 既定 ends は下端 定着・上端 先端（R9①） — 先端は 1通則1) により
    // 定着を加えないので、ゾーンは下端の1本だけになる。
    expect(ends).toHaveLength(1)
    const extensions = ends.reduce(
      (total, zone) => total + (zone.pathToMm - zone.pathFromMm),
      0,
    )
    // 継手は （２）柱2) が別に置く分なので、柱の長さ項からは外して測る。
    const splice = main.splice?.lengthMm ?? 0

    expect(main.length - extensions - splice).toBe(
      fixture.cases.columnMain.storyHeightMm,
    )
  })
})

describe('1通則1)・2（２）柱1) 但書 — 最上階柱の主筋は１通則１）による（R9①）', () => {
  it('marks the tip-termination clause as covered in the fixture', () => {
    const clause = fixture.clauses.find(({ id }) => id === '1通則1)')!

    expect(clause.status).toBe('covered')
  })

  it('columnEnds treats the stack top (no column above) as 先端, not 定着', () => {
    const column = columnSection()
    const stories: Story[] = [
      { id: '1F', name: '1階', height: 4200 },
      { id: '2F', name: '2階', height: 3600 },
    ]
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: 'R9①端部条件テスト',
      grid: { xSpans: [6000], ySpans: [6000] },
      stories,
      sections: [column],
      members: stories.map((story) => ({
        id: `${story.id}-C1`,
        kind: '柱',
        memberClass: '躯体',
        sectionId: column.id,
        storyId: story.id,
        position: { ix: 0, iy: 0 },
      })),
    }
    const [ground, roof] = project.members

    // 基礎への定着は変わらない — 変わるのは「上に柱がない」屋上だけ。
    expect(columnEnds(project, ground)).toEqual({ bottom: '定着', top: 'なし' })
    expect(columnEnds(project, roof)).toEqual({ bottom: 'なし', top: '先端' })
  })

  it('adds no length at a 先端 end — matches an unanchored なし end exactly', () => {
    const column = columnSection()
    const withJoint = roleOf(
      generateColumnRebar(
        {
          member: columnMember(0, column.id),
          section: column,
          story: STORY,
          beamDepthAbove: 750,
          ends: { bottom: '定着', top: 'なし' },
        },
        jpMlitRulePack,
      ),
      '主筋',
    )
    const withTip = roleOf(
      generateColumnRebar(
        {
          member: columnMember(0, column.id),
          section: column,
          story: STORY,
          beamDepthAbove: 750,
          ends: { bottom: '定着', top: '先端' },
        },
        jpMlitRulePack,
      ),
      '主筋',
    )

    // 1通則1)「先端で止まる鉄筋は、コンクリートの設計寸法をその部分の鉄筋の
    // 長さとする」— 定着長さを加えない点は中間接合部の通し（なし）と同じ質量になる。
    expect(withTip.length).toBe(withJoint.length)
    expect(withTip.zones).toHaveLength(1)

    const tipRule = lookupRule(jpMlitRulePack, 'measure.tip.length.addition', {})
    expect(tipRule.source.section).toBe('第4編第3章第2節 1通則1)')
    expect(tipRule.confidence).toBe('stated')
    expect(withTip.ruleHits.map(({ key }) => key)).toContain(
      'measure.tip.length.addition',
    )
  })
})

describe('1通則4)・2（２）柱2)・（３）梁2) 継手箇所数', () => {
  it.each(fixture.cases.spliceCount.column)(
    '$label ＝ $expectedPerBar か所',
    (testCase) => {
      const main = roleOf(columnRebarFor(columnSection()), '主筋')

      expect(main.splice?.countPerBar).toBe(testCase.expectedPerBar)
    },
  )

  it.each(fixture.cases.spliceCount.continuousGirder)(
    '$label ＝ $expectedPerBar か所',
    (testCase) => {
      // 梁の長さ ＝ ランの芯長（内法の和 ＋ 中間柱せい）。2スパンに割り付けて作る。
      const column = columnSection()
      const clear = (testCase.beamLengthMm - column.b) / 2
      const { run, rebars } = girderRebarFor(
        [clear + column.b, clear + column.b],
        column,
        girderSection(),
      )

      expect(run.coreLengthMm).toBe(testCase.beamLengthMm)
      expect(roleOf(rebars, '上端筋').splice?.countPerBar).toBe(
        testCase.expectedPerBar,
      )
    },
  )

  it.each(fixture.cases.spliceCount.interval)(
    '$label ＝ $expectedPerBar か所',
    (testCase) => {
      const intervalRule = lookupRule(
        jpMlitRulePack,
        'measure.splice.interval',
        { size: testCase.barSize },
      )

      expect(intervalSpliceCount(testCase.barLengthMm, intervalRule)).toBe(
        testCase.expectedPerBar,
      )
    },
  )

  it('sends a single-span run to 1通則4) and a continuous run to （３）梁2)', () => {
    // 「連続する梁」かどうかで条項が入れ替わる。取り違えると 5m 前後の単独梁が
    // 0.5か所になり、10m を超える連続梁が長さ割りで数えられる。
    const column = columnSection()
    const single = girderRebarFor([6000], column, girderSection())
    const continuous = girderRebarFor(
      [6000, 6000],
      column,
      girderSection(),
    )

    expect(
      roleOf(single.rebars, '上端筋').splice?.rules.map(({ key }) => key),
    ).toContain('measure.splice.interval')
    expect(
      roleOf(continuous.rebars, '上端筋').splice?.rules.map(({ key }) => key),
    ).toContain('measure.splice.girder.continuous')
  })
})

describe('2（３）梁1) 連続する主筋は定着にかえて柱幅の1/2', () => {
  const expected = fixture.cases.continuousGirderMain

  it('adds half the intermediate column width from each side, not an anchorage', () => {
    const column = columnSection()
    const centerSpans = expected.clearLengthsMm.map(
      (clear) => clear + column.b,
    )
    const { run } = girderRebarFor(centerSpans, column, girderSection())

    expect(run.spans).toHaveLength(expected.clearLengthsMm.length)
    expect(run.spans.map(({ clear }) => clear)).toEqual(
      expected.clearLengthsMm,
    )
    expect(run.coreLengthMm).toBe(expected.expectedCoreLengthMm)
    expect(run.coreLengthMm).toBe(
      expected.clearLengthsMm.reduce((total, clear) => total + clear, 0) +
        expected.intermediateSupportLengthsMm.length *
          expected.halfSupportWidthPerSideMm *
          2,
    )
  })

  it('anchors the through bar only at the two ends of the run', () => {
    const column = columnSection()
    const centerSpans = expected.clearLengthsMm.map(
      (clear) => clear + column.b,
    )
    const { rebars } = girderRebarFor(centerSpans, column, girderSection())
    const top = roleOf(rebars, '上端筋')

    // 中間支点に定着が付いたら二重計上に戻ったということ (R7②)。
    expect(top.zones?.filter(({ kind }) => kind === '定着')).toHaveLength(2)
  })
})
