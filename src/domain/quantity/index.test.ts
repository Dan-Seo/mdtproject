import { describe, expect, it } from 'vitest'

import type { BarSize, ColumnSection, Member } from '../model/member'
import {
  PROJECT_SCHEMA_VERSION,
  beamDepthAbove,
  columnEnds,
  findSection,
  girderRun,
  gridPointCount,
  type Project,
  type Story,
} from '../model/project'
import { createSampleProject } from '../model/sample-project'
import type { Rebar } from '../model/rebar'
import { generateColumnRebar } from '../rebar/column'
import { generateGirderRebar } from '../rebar/girder'
import { coverConditions, lookupRule } from '../rules/lookup'
import { jpMlitRulePack } from '../../rulepack'
import {
  aggregateQuantity,
  grandTotal,
  hasUnverified,
  hasUnverifiedRules,
  unverifiedRules,
  weakestConfidence,
  inferredRules,
  massLines,
  spliceLines,
  sizeSubtotals,
  spliceTotals,
  storySubtotals,
} from './index'

const section: ColumnSection = {
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

const coverHit = lookupRule(jpMlitRulePack, 'cover.minimum', {
  ...coverConditions(section),
})

/**
 * 単位質量は JIS G 3112 の値で規準側にはない — 製品は利用者入力として受け取る。
 * 算術がそのまま読めるように、テストでは規格値ではなく合成値を使う。
 */
const testUnitMass: Project['unitMass'] = { D25: 4, D13: 1 }

function projectWithStories(
  stories: Story[],
  unitMass: Project['unitMass'] = testUnitMass,
): Project {
  const members: Member[] = stories.flatMap((story) =>
    Array.from({ length: 9 }, (_, index) => ({
      id: `${story.id}-C${index + 1}`,
      kind: '柱',
      memberClass: '躯体',
      sectionId: section.id,
      storyId: story.id,
      position: { ix: index % 3, iy: Math.floor(index / 3) },
    })),
  )

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: '数量テスト',
    grid: { xSpans: [6000, 6000], ySpans: [6000, 6000] },
    stories,
    sections: [section],
    members,
    unitMass,
  }
}

function mainRebar(memberId: string, overrides: Partial<Rebar> = {}): Rebar {
  return {
    id: `${memberId}|main`,
    memberId,
    role: '主筋',
    size: 'D25',
    shape: 'straight',
    points: [
      [0, 0, 0],
      [0, 1000, 0],
    ],
    closed: false,
    length: 1000,
    count: 12,
    ruleHits: [
      coverHit,
      lookupRule(jpMlitRulePack, 'cover.fabrication.addition', {}),
      lookupRule(jpMlitRulePack, 'anchorage.L2', {
        fc: 24,
        grade: 'SD345',
        hook: false,
      }),
      lookupRule(jpMlitRulePack, 'lap.L1', {
        fc: 24,
        grade: 'SD345',
        hook: false,
      }),
    ],
    formula: '主筋の算出式',
    ...overrides,
  }
}

function splice(
  overrides: Partial<NonNullable<Rebar['splice']>> = {},
): NonNullable<Rebar['splice']> {
  return {
    method: '重ね継手',
    countPerBar: 1,
    lengthMm: 1000,
    rules: [
      lookupRule(jpMlitRulePack, 'measure.splice.column', {}),
      lookupRule(jpMlitRulePack, 'measure.splice.length.factor', {
        method: overrides.method ?? '重ね継手',
      }),
    ],
    formula: '継手の算出式',
    ...overrides,
  }
}

function hoopRebar(memberId: string): Rebar {
  return {
    id: `${memberId}|hoop`,
    memberId,
    role: '帯筋',
    size: 'D13',
    shape: 'hoop',
    points: [
      [0, 0, 0],
      [1000, 0, 0],
      [1000, 0, 1000],
      [0, 0, 1000],
    ],
    closed: true,
    length: 4000,
    count: 36,
    ruleHits: [
      coverHit,
      lookupRule(jpMlitRulePack, 'cover.fabrication.addition', {}),
      lookupRule(jpMlitRulePack, 'bend.hook135', {}),
    ],
    formula: '帯筋の算出式',
  }
}

/** 単位質量が入っている前提の小計を足す — 欠けていればテストの前提が崩れる。 */
function sumKnown(values: (number | null)[]): number {
  return values.reduce<number>((sum, value) => {
    expect(value).not.toBeNull()
    return sum + value!
  }, 0)
}

function ruleIdentity(rule: { key: string; conditions: object }): string {
  return `${rule.key}:${JSON.stringify(
    Object.entries(rule.conditions).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )}`
}

describe('aggregateQuantity', () => {
  it('groups nine members with the same 符号 into one row and nine 箇所', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const rebars = project.members.map(({ id }) => mainRebar(id))

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      id: '1階|C|C1|主筋|1000|12|形状0,0,0;0,1000,0',
      groupId: '1階|C|C1',
      storyName: '1階',
      memberKind: '柱',
      mark: 'C1',
      sectionLabel: '800×800',
      role: '主筋',
      lengthMm: 1000,
      countPerMember: 12,
      places: 9,
      totalLengthMm: 108000,
    })
  })

  it('splits one 符号 into separate rows when lengthMm differs', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members

    const lines = aggregateQuantity(
      project,
      [mainRebar(first.id), mainRebar(second.id, { length: 1010 })],
      jpMlitRulePack,
    )

    expect(lines).toHaveLength(2)
    expect(new Set(lines.map(({ id }) => id)).size).toBe(2)
    expect(massLines(lines).map(({ lengthMm }) => lengthMm)).toEqual([
      1000, 1010,
    ])
    expect(lines.map(({ places }) => places)).toEqual([1, 1])
    expect(lines.every(({ groupId }) => groupId === '1階|C|C1')).toBe(true)
  })

  it('splits one 符号 into separate rows when countPerMember differs', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members

    const lines = aggregateQuantity(
      project,
      [mainRebar(first.id), mainRebar(second.id, { count: 16 })],
      jpMlitRulePack,
    )

    expect(lines).toHaveLength(2)
    expect(new Set(lines.map(({ id }) => id)).size).toBe(2)
    expect(lines.map(({ countPerMember }) => countPerMember)).toEqual([12, 16])
    expect(lines.map(({ places }) => places)).toEqual([1, 1])
  })

  it('keeps single-span and multi-span 通し筋 in different rows', () => {
    const project = createSampleProject()
    const singleSpanMember = project.members.find(
      ({ id }) => id === '1F-G1-X1Y1-X',
    )!
    const multiSpanMember = project.members.find(
      ({ id }) => id === '1F-G1-X1Y1-Y',
    )!
    const girderSection = findSection(project, singleSpanMember.sectionId)
    if (girderSection.kind !== '大梁') {
      throw new Error('expected a 大梁 section')
    }
    const rebars = [singleSpanMember, multiSpanMember].flatMap((member) =>
      generateGirderRebar(
        { run: girderRun(project, member), section: girderSection },
        jpMlitRulePack,
      ),
    )

    const topLines = massLines(
      aggregateQuantity(project, rebars, jpMlitRulePack),
    ).filter(
      ({ storyName, mark, role }) =>
        storyName === '1階' && mark === 'G1' && role === '上端筋',
    )

    expect(topLines).toHaveLength(2)
    expect(topLines.map(({ groupId }) => groupId)).toEqual([
      '1階|G|G1',
      '1階|G|G1',
    ])
    expect(new Set(topLines.map(({ lengthMm }) => lengthMm)).size).toBe(2)
    expect(topLines[1].lengthMm).toBeGreaterThan(topLines[0].lengthMm)
    expect(topLines.map(({ places }) => places)).toEqual([1, 1])
  })

  it('merges 柱 of one 符号 even when the 大梁 above them differ in せい', () => {
    const sample = createSampleProject()
    const project: Project = {
      ...sample,
      sections: sample.sections.map((section) =>
        section.id === 'section-G2' && section.kind === '大梁'
          ? { ...section, depth: 600 }
          : section,
      ),
    }
    const rebars = project.members.flatMap((member) => {
      if (member.kind !== '柱') return []

      const columnSection = findSection(project, member.sectionId)
      if (columnSection.kind !== '柱') throw new Error('expected a 柱 section')
      const story = project.stories.find(({ id }) => id === member.storyId)
      if (!story) throw new Error('expected a story')

      return generateColumnRebar(
        {
          member,
          section: columnSection,
          story,
          beamDepthAbove: beamDepthAbove(project, member),
          ends: columnEnds(project, member),
        },
        jpMlitRulePack,
      )
    })

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const hoops = lines.filter(
      ({ role, storyName }) => role === '帯筋' && storyName === '1階',
    )

    // 上部大梁せいが違えば 3D の配置区間は違う — その前提が崩れると本テストは
    // 何も判定しない。
    const hoopRebars = rebars.filter(({ role }) => role === '帯筋')
    expect(
      new Set(hoopRebars.map(({ placement }) => placement?.clearMm)).size,
    ).toBeGreaterThan(1)

    // それでも数量は 1 行に集まる。積算基準（２）柱3) がフープを「各階ごとに」
    // 数え、その部分の長さは階高だからだ。大梁せいは数量に効かない。
    expect(hoops).toHaveLength(1)
    const { nx, ny } = gridPointCount(project.grid)
    expect(hoops[0].places).toBe(nx * ny)
    expect(hoops[0].groupId).toBe('1階|C|C1')
  })

  it('propagates the weakest contributing rule grade to the whole row', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const line = aggregateQuantity(
      project,
      [mainRebar(project.members[0].id)],
      jpMlitRulePack,
    )[0]

    // 실룰팩에 inferred 행은 더 이상 없다 — 유일한 예였던 JIS 単位質量이
    // 프로젝트 입력으로 빠졌기 때문이다. 실제 최약 등급인 transcribed 가 행
    // 전체로 번지는지를 본다. 등급 순서 자체는 weakestConfidence 쪽이 합성
    // 룰로 따로 고정하므로 여기서 중복해서 보지 않는다.
    expect(
      line.rules.some(({ confidence }) => confidence === 'transcribed'),
    ).toBe(true)
    expect(line.rules.map(({ key }) => key)).toContain('markup.rate')
    expect(line.confidence).toBe('transcribed')
    expect(hasUnverified([line])).toBe(true)
  })

  it('counts a transcribed rule as unverified, the same as inferred', () => {
    // glTF は行を持たず ruleHits を直に持つので、内訳書・印刷と glb は
    // この関数を共に引く。判定は「stated でない」だ — 「原文に値が無い」
    // (inferred) だけを数えると、検討待ち分が黙って通る (ADR-015・ADR-023)。
    expect(hasUnverifiedRules([{ confidence: 'transcribed' }])).toBe(true)
    expect(hasUnverifiedRules([{ confidence: 'inferred' }])).toBe(true)
    expect(hasUnverifiedRules([{ confidence: 'stated' }])).toBe(false)
    expect(hasUnverifiedRules([])).toBe(false)
  })

  it('takes the weakest confidence of the row, never the strongest', () => {
    // 한 행이라도 약한 근거를 쓰면 그 행 전체가 그만큼만 확실하다.
    // 강한 쪽으로 반올림하면 「전사 대기」가 「검토 완료」로 보인다.
    const rule = (confidence: 'stated' | 'transcribed' | 'inferred') => ({
      key: `probe.${confidence}`,
      label: confidence,
      expr: '',
      conditions: {},
      value: 1,
      unit: 'mm',
      source: {
        short: 'probe',
        doc: 'probe',
        edition: null,
        publisher: 'probe',
        url: null,
        section: null,
        page: 1,
      },
      confidence,
      note: '',
    })

    expect(weakestConfidence([])).toBe('stated')
    expect(weakestConfidence([rule('stated')])).toBe('stated')
    expect(weakestConfidence([rule('stated'), rule('transcribed')])).toBe(
      'transcribed',
    )
    expect(
      weakestConfidence([rule('stated'), rule('transcribed'), rule('inferred')]),
    ).toBe('inferred')
    expect(weakestConfidence([rule('inferred'), rule('stated')])).toBe(
      'inferred',
    )
  })

  it('returns every inferred contribution once without collapsing variants', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const memberId = project.members[0].id
    // 折曲げ内法直径は径で変わる（表5.3.2）。主筋 D25 と帯筋 D13 が同じキーの
    // 別条件を引くので、キーだけで束ねると片方の行の根拠が消える。
    const bent = mainRebar(memberId, {
      ruleHits: [
        ...mainRebar(memberId).ruleHits,
        lookupRule(jpMlitRulePack, 'bend.inside-diameter', {
          grade: 'SD345',
          size: 'D25',
        }),
      ],
    })
    const hoop = hoopRebar(memberId)
    const lines = aggregateQuantity(
      project,
      [
        bent,
        {
          ...hoop,
          ruleHits: [
            ...hoop.ruleHits,
            lookupRule(jpMlitRulePack, 'bend.inside-diameter', {
              grade: 'SD345',
              size: 'D13',
            }),
          ],
        },
      ],
      jpMlitRulePack,
    )

    const unverified = unverifiedRules(lines)
    const inferred = inferredRules(lines)

    // 조회 조건이 다른 같은 key 는 서로 다른 행이다 — 하나로 접으면 D25 와 D13
    // 折曲げ内法直径 중 하나가 근거 목록에서 사라진다.
    // 조회 조건이 다른 같은 key 는 서로 다른 행이다 — 하나로 접으면 D25 와 D13
    // 折曲げ内法直径 중 하나가 근거 목록에서 사라진다.
    expect(unverified).toHaveLength(8)
    expect(new Set(unverified.map(ruleIdentity)).size).toBe(unverified.length)
    expect(
      unverified.filter(({ key }) => key === 'bend.inside-diameter'),
    ).toHaveLength(2)
    expect(unverified.every(({ confidence }) => confidence !== 'stated')).toBe(
      true,
    )

    // 「원문에 값이 아예 없는」 행은 이제 없다. ADR-023 은 그 유일한 예로 JIS
    // 単位質量을 들었는데, 같은 이유로 単位質量이 룰팩에서 빠지고 프로젝트
    // 입력이 됐기 때문이다(schema v6). 남은 8행은 전부 標準仕様書·積算基準에
    // 명시된 값이라 transcribed 다 — 즉 kg 행도 ▲가 아니라 △다.
    expect(inferred).toEqual([])
  })

  it('emits a 箇所 line beside the kg line and never mixes the two units', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const rebars = project.members.map(({ id }) =>
      mainRebar(id, { splice: splice() }),
    )

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const [mass] = massLines(lines)
    const [spliceLine] = spliceLines(lines)

    expect(lines).toHaveLength(2)
    // 質量行のすぐ後に来る — 内訳書で主筋と離れると別物に見える。
    expect(lines.map(({ unit }) => unit)).toEqual(['kg', '箇所'])
    expect(spliceLine).toMatchObject({
      id: '1階|C|C1|主筋|継手|重ね継手|1|12|1000',
      groupId: mass.groupId,
      role: '主筋',
      method: '重ね継手',
      // 1本あたり1か所 × 主筋12本 × 9部材
      countPerMember: 12,
      places: 9,
      totalCount: 108,
    })
    // 割増（1通則9)）は設計「数量」＝質量への規定なので箇所には掛からない。
    expect(spliceLine).not.toHaveProperty('requiredKg')
    expect(grandTotal(lines).designKg).toBe(mass.designKg)
    expect(storySubtotals(lines)[0].designKg).toBe(mass.designKg)
  })

  it('keeps 質量行 apart when only the 継手箇所数 differs', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members
    // ガス圧接は算入倍率が0で長さが増えないので、箇所数が違っても長さは同じに
    // なる。長さだけを鍵にすると2本が1行に併合され、その行の算出式と出典は
    // 片方についてしか事実でない。
    const lines = aggregateQuantity(
      project,
      [
        mainRebar(first.id, {
          formula: '1か所の算出式',
          splice: splice({ method: 'ガス圧接', countPerBar: 1, lengthMm: 0 }),
        }),
        mainRebar(second.id, {
          id: `${second.id}|main`,
          formula: '2か所の算出式',
          splice: splice({ method: 'ガス圧接', countPerBar: 2, lengthMm: 0 }),
        }),
      ],
      jpMlitRulePack,
    )

    expect(massLines(lines).map(({ formula }) => formula)).toEqual([
      '1か所の算出式',
      '2か所の算出式',
    ])
  })

  it('keeps runs of different length in separate 箇所 rows', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members
    // 5.0以上10.0未満はどちらも1か所なので、長さを鍵に入れないと同じ行に落ちる。
    // 束ねると算出式が先に処理された方の長さだけを語り、対照できなくなる。
    const lines = aggregateQuantity(
      project,
      [
        mainRebar(first.id, { length: 5200, splice: splice() }),
        mainRebar(second.id, {
          id: `${second.id}|main`,
          length: 9800,
          splice: splice({ formula: '9.8m の算出式' }),
        }),
      ],
      jpMlitRulePack,
    )

    expect(spliceLines(lines)).toHaveLength(2)
    expect(spliceLines(lines).map(({ formula }) => formula)).toEqual([
      '継手の算出式',
      '9.8m の算出式',
    ])
  })

  it('omits the 箇所 line when the clause counts no splice', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const lines = aggregateQuantity(
      project,
      [mainRebar(project.members[0].id, { splice: splice({ countPerBar: 0 }) })],
      jpMlitRulePack,
    )

    expect(spliceLines(lines)).toHaveLength(0)
  })

  it('separates 継手 rows by method and totals each one', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members
    const lines = aggregateQuantity(
      project,
      [
        mainRebar(first.id, { splice: splice() }),
        mainRebar(second.id, {
          splice: splice({ method: 'ガス圧接', lengthMm: 0 }),
        }),
      ],
      jpMlitRulePack,
    )

    expect(spliceLines(lines)).toHaveLength(2)
    expect(spliceTotals(lines)).toEqual([
      { method: '重ね継手', totalCount: 12 },
      { method: 'ガス圧接', totalCount: 12 },
    ])
  })

  it('provides flat story subtotals and a grand total without rounding', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
      { id: '2F', name: '2階', height: 3600 },
    ])
    const rebars = project.members.map(({ id }) => mainRebar(id))
    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)

    const subtotals = storySubtotals(lines)
    const total = grandTotal(lines)

    expect(subtotals).toHaveLength(2)
    expect(subtotals.map(({ storyName }) => storyName)).toEqual(['1階', '2階'])
    expect(total.designKg).toBe(
      sumKnown(subtotals.map(({ designKg }) => designKg)),
    )
    expect(total.requiredKg).toBe(
      sumKnown(subtotals.map(({ requiredKg }) => requiredKg)),
    )
  })
})

describe('単位質量は利用者入力', () => {
  const stories: Story[] = [{ id: '1F', name: '1階', height: 4200 }]

  it('leaves the mass unknown until a 単位質量 is entered', () => {
    const project = projectWithStories(stories, {})
    const rebars = project.members.map(({ id }) => mainRebar(id))

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const [line] = massLines(lines)

    // 総延長までは規準（積算基準 1通則2)・7)）で出る。kg は JIS G 3112 の
    // 単位質量なしには出ない — 0 でも既定値でもなく「まだ分からない」だ。
    expect(line.totalLengthMm).toBe(108000)
    expect(line.unitMassKgPerM).toBeNull()
    expect(line.designKg).toBeNull()
    expect(line.requiredKg).toBeNull()
    expect(storySubtotals(lines)[0].designKg).toBeNull()
    expect(grandTotal(lines).designKg).toBeNull()
    expect(grandTotal(lines).requiredKg).toBeNull()
  })

  it('computes the mass from the 単位質量 the user entered', () => {
    const project = projectWithStories(stories)
    const rebars = project.members.map(({ id }) => mainRebar(id))

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const [line] = massLines(lines)

    // 108.000 m × 4 kg/m = 432 kg、所要数量は 1通則9) の4%割増
    expect(line.unitMassKgPerM).toBe(4)
    expect(line.designKg).toBe(432)
    expect(line.requiredKg).toBeCloseTo(449.28, 6)
  })

  // カットオフ筋は同じ部材から設計長さも本数も同じで折れ線だけ違う鉄筋を出す
  // ことがある。places は部材数で数えるので、1行に束ねると片方の本数がまるごと
  // 消えて過少計上になる — 黙って消えないことを固定する。
  it('keeps 加工形状 apart even when 設計長さ and 本数 match', () => {
    const project = projectWithStories(stories)
    const [member] = project.members
    const rebars = [
      mainRebar(member.id),
      mainRebar(member.id, {
        id: `${member.id}|main-bent`,
        points: [
          [0, 0, 0],
          [1000, 0, 0],
        ],
      }),
    ]

    const lines = massLines(aggregateQuantity(project, rebars, jpMlitRulePack))

    expect(lines).toHaveLength(2)
    expect(lines.map(({ totalLengthMm }) => totalLengthMm)).toEqual([
      12000, 12000,
    ])
  })

  it('keeps the subtotal unknown while any 径 is still missing', () => {
    // 入力済みの径だけ足した小計は、足りない径を隠したまま「合計」に見える。
    const project = projectWithStories(stories, { D25: 4 })
    const rebars = project.members.flatMap(({ id }) => [
      mainRebar(id),
      hoopRebar(id),
    ])

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const byRole = new Map(massLines(lines).map((line) => [line.role, line]))

    expect(byRole.get('主筋')?.designKg).toBe(432)
    expect(byRole.get('帯筋')?.designKg).toBeNull()
    expect(storySubtotals(lines)[0].designKg).toBeNull()
    expect(grandTotal(lines).designKg).toBeNull()
  })
})

/** BAR_SIZES に無い呼び名。型では起きないが、取り込んだ JSON からは入る。 */
const OUTSIDE_BAR_SIZES = 'D51' as BarSize

describe('sizeSubtotals', () => {
  const stories: Story[] = [
    { id: '1F', name: '1階', height: 4200 },
    { id: '2F', name: '2階', height: 3800 },
  ]

  it('sums 質量 by 径 across every 階 and 部材', () => {
    const project = projectWithStories(stories)
    const rebars = project.members.flatMap(({ id }) => [
      mainRebar(id),
      hoopRebar(id),
    ])

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const bySize = sizeSubtotals(lines)

    // 発注は径ごとに出すので、階も部材も跨いだ和が要る。行の出現順は
    // D25(主筋)→D13(帯筋) だが、表は BAR_SIZES の並び順で出る — 内訳書の
    // 径列は径の小さい順に読むものだからだ。
    expect(bySize.map(({ size }) => size)).toEqual(['D13', 'D25'])
    expect(sumKnown(bySize.map(({ designKg }) => designKg))).toBe(
      grandTotal(lines).designKg,
    )
    expect(sumKnown(bySize.map(({ requiredKg }) => requiredKg))).toBe(
      grandTotal(lines).requiredKg,
    )
  })

  it('keeps a 径 outside BAR_SIZES instead of dropping it from the table', () => {
    // 取り込んだ案件は他人が作った JSON だ — 目録に無い径が入り得る。
    // 黙って落とすと、この表の行の和が同じシートの下に出る合計と合わなくなる。
    const project = projectWithStories([stories[0]])
    const rebars = project.members.flatMap(({ id }) => [
      mainRebar(id),
      hoopRebar(id),
    ])
    const lines = aggregateQuantity(project, rebars, jpMlitRulePack).map(
      (line, index) =>
        index === 0 ? { ...line, size: OUTSIDE_BAR_SIZES } : line,
    )

    const bySize = sizeSubtotals(lines)

    expect(bySize.map(({ size }) => size)).toContain(OUTSIDE_BAR_SIZES)
    expect(sumKnown(bySize.map(({ designKg }) => designKg))).toBe(
      grandTotal(lines).designKg,
    )
  })

  it('keeps a 径 unknown while its 単位質量 is missing, without infecting the others', () => {
    // 径別集計は「どの径が発注できないか」を見せる表だ。D13 が欠けたせいで
    // D25 まで null になると、その情報が消える。
    const project = projectWithStories([stories[0]], { D25: 4 })
    const rebars = project.members.flatMap(({ id }) => [
      mainRebar(id),
      hoopRebar(id),
    ])

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    const bySize = new Map(
      sizeSubtotals(lines).map((subtotal) => [subtotal.size, subtotal]),
    )

    expect(bySize.get('D25')?.designKg).toBe(432)
    expect(bySize.get('D13')?.designKg).toBeNull()
  })

  it('leaves 継手 out — 箇所 は kg に足せない', () => {
    const project = projectWithStories([stories[0]])
    const rebars = project.members.map(({ id }) =>
      mainRebar(id, { splice: splice() }),
    )

    const lines = aggregateQuantity(project, rebars, jpMlitRulePack)

    const bySize = sizeSubtotals(lines)

    expect(bySize).toHaveLength(1)
    expect(bySize[0].size).toBe('D25')
    expect(bySize[0].designKg).toBe(432)
    expect(bySize[0].requiredKg).toBeCloseTo(449.28, 6)
  })
})
