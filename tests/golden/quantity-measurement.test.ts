import { describe, expect, it } from 'vitest'

import type {
  ColumnSection,
  GirderSection,
  Member,
  SlabSection,
} from '../../src/domain/model/member'
import {
  columnEnds,
  PROJECT_SCHEMA_VERSION,
  girderRun,
  slabRun,
  type Project,
  type Story,
} from '../../src/domain/model/project'
import { MemberUnsupportedError } from '../../src/domain/model/unsupported'
import { aggregateQuantity, massLines } from '../../src/domain/quantity'
import { generateColumnRebar } from '../../src/domain/rebar/column'
import { generateGirderRebar } from '../../src/domain/rebar/girder'
import { generateSlabRebar } from '../../src/domain/rebar/slab'
import {
  distributionCount,
  intervalSpliceCount,
} from '../../src/domain/rebar/measurement'
import { openingDeduction } from '../../src/domain/rebar/opening'
import { lookupRule } from '../../src/domain/rules/lookup'
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
    shape: '矩形',
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

function slabSection(overrides: Partial<SlabSection> = {}): SlabSection {
  return {
    id: 'section-S1',
    kind: '床板',
    mark: 'S1',
    thickness: 200,
    fc: 24,
    grade: 'SD345',
    finish: '仕上げあり',
    spliceMethod: '重ね継手',
    x: {
      top: { size: 'D13', pitch: 200, startOffsetMm: 100 },
      bottom: { size: 'D13', pitch: 200, startOffsetMm: 100 },
    },
    y: {
      top: { size: 'D13', pitch: 200, startOffsetMm: 100 },
      bottom: { size: 'D13', pitch: 200, startOffsetMm: 100 },
    },
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
  // 条文は質量を「設計長さ × JIS G 3112 の単位質量」と定めるだけで、値そのものは
  // JIS に委ねる。その JIS は有償規格で未確保だ — ルールパックに値を置けば、
  // 読んでいない文献を出典に立てることになる（出典表示は法的義務 — ADR-003）。
  it('carries no 単位質量 of its own because the clause delegates it to JIS', () => {
    expect(
      jpMlitRulePack.entries.filter(({ key }) => key.startsWith('unit-mass')),
    ).toHaveLength(0)
  })

  it('takes the 単位質量 from the project instead, and stays silent until it is entered', () => {
    const section = columnSection()
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: '単位質量テスト',
      grid: { xSpans: [6000], ySpans: [6000] },
      stories: [STORY],
      sections: [section],
      members: [columnMember(0, section.id)],
    }
    const rebars = columnRebarFor(section)
    const main = roleOf(rebars, '主筋')

    const withoutInput = massLines(
      aggregateQuantity(project, rebars, jpMlitRulePack),
    )
    const withInput = massLines(
      aggregateQuantity(
        { ...project, unitMass: { [main.size]: 1 } },
        rebars,
        jpMlitRulePack,
      ),
    )
    const line = withInput.find(({ role }) => role === '主筋')!

    expect(withoutInput.every(({ designKg }) => designKg === null)).toBe(true)
    // 1 kg/m なら設計数量は総延長(m)そのもの — 前文の積がそのまま見える。
    expect(line.designKg).toBe(line.totalLengthMm / 1000)
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
    // 原文に明記された条項なので推定(inferred)ではない。ただし転写者＝承認者
    // なので独立検討済み(stated)でもない — transcribed である (R6・ADR-023)。
    expect(hit.confidence).toBe('transcribed')
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
    ({ memberKind, diameterMm }) => memberKind === '柱' && diameterMm === undefined,
  )
  const circularCases = fixture.cases.hoopDesignLength.filter(
    ({ diameterMm }) => diameterMm !== undefined,
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

  // 条文は断面形状を矩形に限っていない。円形断面では「断面の設計寸法による
  // 周長」がそのまま円周であり、製品が新しい値を作るわけではない (ADR-027)。
  it.each(circularCases)('$label 帯筋 ＝ $expectedMm', (testCase) => {
    const hoop = roleOf(
      columnRebarFor(
        columnSection({
          shape: '円形',
          b: testCase.diameterMm!,
          d: testCase.diameterMm!,
        }),
      ),
      '帯筋',
    )

    expect(hoop.length).toBeCloseTo(testCase.expectedMm, 3)
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
    expect(tipRule.confidence).toBe('transcribed')
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

/**
 * Y通りに床板が連なるプロジェクト。X は1スパンだけなので、Y方向のランが
 * `centerSpansMm.length` ベイ、X方向のランは常に1ベイ（単独床板）になる。
 * ラン芯長 ＝ Σ内法 ＋ Σ中間大梁幅 ＝ Σ通り芯間 − 大梁幅1本分である。
 */
function slabProject(
  centerSpansMm: number[],
  column: ColumnSection,
  girder: GirderSection,
  slab: SlabSection,
  story: Story = STORY,
): Project {
  const members: Member[] = []
  const bays = centerSpansMm.length

  for (let iy = 0; iy <= bays; iy += 1) {
    for (let ix = 0; ix <= 1; ix += 1) {
      members.push({
        id: `1F-C-X${ix}Y${iy}`,
        kind: '柱',
        memberClass: '躯体',
        sectionId: column.id,
        storyId: story.id,
        position: { ix, iy },
      })
    }
    members.push({
      id: `1F-GX-Y${iy}`,
      kind: '大梁',
      memberClass: '躯体',
      sectionId: girder.id,
      storyId: story.id,
      position: { axis: 'X', ix: 0, iy },
    })
  }

  for (let iy = 0; iy < bays; iy += 1) {
    for (let ix = 0; ix <= 1; ix += 1) {
      members.push({
        id: `1F-GY-X${ix}Y${iy}`,
        kind: '大梁',
        memberClass: '躯体',
        sectionId: girder.id,
        storyId: story.id,
        position: { axis: 'Y', ix, iy },
      })
    }
    members.push({
      id: `1F-S-Y${iy}`,
      kind: '床板',
      memberClass: '躯体',
      sectionId: slab.id,
      storyId: story.id,
      position: { ix: 0, iy },
    })
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: '数量積算基準ゴールデンテスト（床板）',
    grid: { xSpans: [6000], ySpans: centerSpansMm },
    stories: [story],
    sections: [column, girder, slab],
    members,
  }
}

function slabRunFor(
  centerSpansMm: number[],
  axis: 'X' | 'Y' = 'Y',
  slab: SlabSection = slabSection(),
) {
  const project = slabProject(
    centerSpansMm,
    columnSection(),
    girderSection(),
    slab,
  )
  const owner = project.members.find(({ kind }) => kind === '床板')!

  return { project, run: slabRun(project, owner, axis), slab }
}

describe('2（４）床板2) 連続する床板の継手箇所数', () => {
  it.each(fixture.cases.spliceCount.continuousSlab)(
    '$label ＝ $expectedPerBar か所',
    (testCase) => {
      // ラン芯長 ＝ Σ通り芯間 − 大梁幅1本分。2ベイに割り付けて狙った長さを作る。
      const centerSpan = (testCase.slabLengthMm + girderSection().b) / 2
      const { run, slab } = slabRunFor([centerSpan, centerSpan])

      expect(run.coreLengthMm).toBe(testCase.slabLengthMm)

      if (testCase.expectedPerBar === null) {
        // 13.5m 以上は条文に区分がない。0.5 でも 2 でもなく、計上しない。
        expect(() =>
          generateSlabRebar({ run, section: slab }, jpMlitRulePack),
        ).toThrow(MemberUnsupportedError)
        return
      }

      const rebars = generateSlabRebar({ run, section: slab }, jpMlitRulePack)
      expect(roleOf(rebars, 'Y方向下端筋').splice?.countPerBar).toBe(
        testCase.expectedPerBar,
      )
    },
  )

  it('sends a single-bay run to 1通則4) and a continuous run to 2（４）床板2)', () => {
    // 「連続する床板」かどうかで条項が入れ替わる。取り違えると 4.5m 前後の
    // 単独床板が 0.5か所になり、長い連続床板が長さ割りで数えられる。
    const single = slabRunFor([6000], 'X')
    const continuous = slabRunFor([6000, 6000], 'Y')

    expect(
      roleOf(
        generateSlabRebar(
          { run: single.run, section: single.slab },
          jpMlitRulePack,
        ),
        'X方向下端筋',
      ).splice?.rules.map(({ key }) => key),
    ).toContain('measure.splice.interval')
    expect(
      roleOf(
        generateSlabRebar(
          { run: continuous.run, section: continuous.slab },
          jpMlitRulePack,
        ),
        'Y方向下端筋',
      ).splice?.rules.map(({ key }) => key),
    ).toContain('measure.splice.slab.continuous')
  })
})

describe('2（４）床板1) 連続する主筋は定着にかえて梁幅の1/2', () => {
  const expected = fixture.cases.continuousSlabMain

  it('adds half the intermediate girder width from each side, not an anchorage', () => {
    const girder = girderSection()
    const centerSpans = expected.clearLengthsMm.map((clear) => clear + girder.b)
    const { run } = slabRunFor(centerSpans)

    expect(run.bays).toHaveLength(expected.clearLengthsMm.length)
    expect(run.bays.map(({ clearYMm }) => clearYMm)).toEqual(
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
    const girder = girderSection()
    const centerSpans = expected.clearLengthsMm.map((clear) => clear + girder.b)
    const { run, slab } = slabRunFor(centerSpans)
    const bottom = roleOf(
      generateSlabRebar({ run, section: slab }, jpMlitRulePack),
      'Y方向下端筋',
    )

    // 中間支点に定着が付いたら二重計上だ — 梁の R7② と同じ形である。
    expect(bottom.zones?.filter(({ kind }) => kind === '定着')).toHaveLength(2)
  })

  it('measures the bay 内法 by 躯体の区分（４）— 通り芯間ではない', () => {
    const definition = fixture.definitions.find(
      ({ id }) => id === '第4編第1章第2節（４）床板（スラブ）',
    )!
    const { run } = slabRunFor([6000, 6000])

    expect(definition.quote).toContain('内法部分')
    // 通り芯間 6000 から両側の大梁幅 400 の半分ずつを引いて 5600
    expect(run.bays[0].clearYMm).toBe(6000 - 400)
    expect(run.bays[0].centerSpanYMm).toBe(6000)
  })
})

describe('1通則3) 幅止筋の長さ ＝ コンクリートの設計幅（フックなし）', () => {
  it('cites 1通則3) with its printed page', () => {
    const entry = fixture.clauses.find(({ id }) => id === '1通則3)')!
    const hit = lookupRule(
      jpMlitRulePack,
      'measure.width-tie.length.addition',
      {},
    )

    expect(hit.source.doc).toBe(fixture.source.doc)
    expect(hit.source.edition).toBe(fixture.source.edition)
    expect(hit.source.section).toBe(`${fixture.source.chapterShort} 1通則3)`)
    expect(hit.source.page).toBe(entry.printedPage)
    expect(hit.confidence).toBe('transcribed')
    expect(entry.status).toBe('covered')
  })

  it.each(fixture.cases.widthTieDesignLength)(
    '$label ＝ $expectedMm',
    (testCase) => {
      const { rebars } = girderRebarFor(
        [6000],
        columnSection(),
        girderSection({
          b: testCase.sectionWidthMm,
          widthTie: { size: 'D10', pitch: 1000 },
        }),
      )

      expect(roleOf(rebars, '幅止め筋').length).toBe(testCase.expectedMm)
    },
  )

  it('measures the design width itself — never the あばら筋 の周長', () => {
    // 1通則2) と 3) は隣り合う条項で、取り違えると幅止筋が周長 2×(b＋D) になる。
    const section = girderSection({
      b: 400,
      depth: 750,
      widthTie: { size: 'D10', pitch: 1000 },
    })
    const { rebars } = girderRebarFor([6000], columnSection(), section)

    expect(roleOf(rebars, '幅止め筋').length).toBe(section.b)
    expect(roleOf(rebars, 'あばら筋').length).not.toBe(section.b)
  })

  it('generates no 幅止め筋 for 柱 — the clause lists only 基礎梁・梁・壁梁・壁', () => {
    const generated = columnRebarFor(columnSection())

    expect(generated.some(({ role }) => role === '幅止め筋')).toBe(false)
  })

  it('omits the 幅止め筋 entirely when the section list has none', () => {
    // 断面一覧に記載のない配筋を製品が勝手に足さない (ADR-012)。
    const { rebars } = girderRebarFor([6000], columnSection(), girderSection())

    expect(rebars.some(({ role }) => role === '幅止め筋')).toBe(false)
  })
})

describe('2（３）梁3) 幅止筋の本数 ＝ 各梁ごとに 1通則7)', () => {
  it.each(fixture.cases.widthTieCount)(
    '$label ＝ $expectedCount 本',
    (testCase) => {
      const column = columnSection()
      const { rebars } = girderRebarFor(
        [testCase.partLengthMm + column.b],
        column,
        girderSection({
          widthTie: { size: 'D10', pitch: testCase.pitchMm },
        }),
      )

      expect(roleOf(rebars, '幅止め筋').count).toBe(testCase.expectedCount)
    },
  )

  it('carries both governing clauses as its 出典', () => {
    const { rebars } = girderRebarFor(
      [6000],
      columnSection(),
      girderSection({ widthTie: { size: 'D10', pitch: 1000 } }),
    )

    expect(roleOf(rebars, '幅止め筋').ruleHits.map(({ key }) => key)).toEqual([
      'measure.width-tie.length.addition',
      'measure.distribution.addition',
    ])
  })

  it('counts per 梁 — a 2-span run gets one 幅止め筋 row per span', () => {
    const { rebars } = girderRebarFor(
      [6000, 6000],
      columnSection(),
      girderSection({ widthTie: { size: 'D10', pitch: 1000 } }),
    )

    expect(rebars.filter(({ role }) => role === '幅止め筋')).toHaveLength(2)
  })
})

describe('1通則6) 腹筋の余長 — JASS 5 未確保のため断面一覧の入力', () => {
  it('keeps the clause deferred rather than inventing a 余長', () => {
    const clause = fixture.clauses.find(({ id }) => id === '1通則6)')!

    expect(clause.status).toBe('deferred')
  })

  it('carries no rule pack row for the 腹筋 — the value has no source', () => {
    // 標準仕様書 R7 全330頁に「腹筋」は0件、積算基準は余長を JASS 5 に委任する。
    // 出典のない数値をルールパックに置かない (CLAUDE.md CRITICAL)。
    const keys = jpMlitRulePack.entries.map(({ key }) => key)

    expect(keys.some((key) => key.includes('side-bar'))).toBe(false)
    expect(keys.some((key) => key.includes('腹筋'))).toBe(false)
  })

  it('takes the 余長 from the section list and shows it in the 設計長さ', () => {
    const column = columnSection()
    const lengths = [0, 150].map((extraLengthMm) => {
      const { rebars } = girderRebarFor(
        [6000],
        column,
        girderSection({
          sideBar: { size: 'D10', count: 2, extraLengthMm },
        }),
      )
      return roleOf(rebars, '腹筋').length
    })
    const [withoutTail, withTail] = lengths

    // 余長は梁の両端に付く。入力がそのまま設計長さに出ないと、利用者は
    // 図面の値を入れたのに数量が動かない画面を見ることになる。
    expect(withTail - withoutTail).toBe(2 * 150)
    expect(withoutTail).toBe(6000 - column.b)
  })

  it('uses the 記載本数 rather than 1通則7) — 腹筋 is written as 2-D10', () => {
    const { rebars } = girderRebarFor(
      [6000],
      columnSection(),
      girderSection({ sideBar: { size: 'D10', count: 2, extraLengthMm: 0 } }),
    )

    expect(roleOf(rebars, '腹筋').count).toBe(2)
    expect(roleOf(rebars, '腹筋').ruleHits).toEqual([])
  })

  it('omits the 腹筋 entirely when the section list has none', () => {
    const { rebars } = girderRebarFor([6000], columnSection(), girderSection())

    expect(rebars.some(({ role }) => role === '腹筋')).toBe(false)
  })
})

describe('1通則8) 開口部による鉄筋の欠除', () => {
  const spec = fixture.cases.openingDeduction

  it('reads the deduction threshold from the clause, not from the code', () => {
    const rule = lookupRule(
      jpMlitRulePack,
      'measure.opening.deduction.minimum.area',
      {},
    )

    expect(rule.unit).toBe('㎡')
    for (const band of spec.threshold) {
      // 面積そのものが閾値と一致する事例をゴールデンが持つので、行の値が
      // 動けば「欠除する／しない」の期待とすぐ食い違う。
      expect(band.widthMm * band.heightMm).toBe(band.areaM2 * 1_000_000)
      expect(band.areaM2 > rule.value).toBe(band.deducts)
    }
  })

  it.each(spec.cases.map((entry) => [entry.label, entry] as const))(
    '%s',
    (_label, entry) => {
      for (const [barAxis, expected] of [
        ['x', entry.expected.alongX],
        ['y', entry.expected.alongY],
      ] as const) {
        const distributionClearMm =
          barAxis === 'x' ? entry.clearYMm : entry.clearXMm

        // 手で導いた本数が 1通則7) の割付と一致することをまず確かめる。
        // ここがずれていれば欠除の期待も土台から違う。
        expect(
          distributionCount(
            distributionClearMm,
            entry.pitchMm,
            lookupRule(jpMlitRulePack, 'measure.distribution.addition', {}),
          ),
        ).toBe(expected.totalCount)

        const result = openingDeduction(
          {
            // id は製品の識別子であって規準の値ではない — 転写した寸法に
            // ここで付ける（フィクスチャに書くと原文にない列が増える）。
            openings: entry.openings.map((opening, index) => ({
              ...opening,
              id: `${entry.label}#${index + 1}`,
            })),
            clearXMm: entry.clearXMm,
            clearYMm: entry.clearYMm,
            barAxis,
            pitchMm: entry.pitchMm,
            totalCount: expected.totalCount,
          },
          jpMlitRulePack,
        )

        expect(result.groups).toEqual(expected.groups)
        // 群の合計は割付本数そのもの — 欠除は本数を減らさず長さを減らす。
        expect(result.groups.reduce((sum, { count }) => sum + count, 0)).toBe(
          expected.totalCount,
        )
      }
    },
  )

  it('leaves 開口補強筋 to 設計図書 — the clause delegates it', () => {
    const clause = fixture.clauses.find(({ id }) => id === '1通則8)')

    expect(clause?.quote).toContain('開口補強筋は設計図書により計測・計算する')
    // 委任された鉄筋の値をルールパックが持っていたら、原文にない数字を
    // 製品が作ったということだ。開口部について持ってよいのは「欠除しない
    // 大きさ」の1行だけである。
    expect(
      jpMlitRulePack.entries.filter(({ key }) =>
        key.startsWith('measure.opening'),
      ),
    ).toHaveLength(1)
  })
})
