import { describe, expect, it } from 'vitest'

import type { ColumnSection, Member } from '../model/member'
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
  hasInferred,
  inferredRules,
  massLines,
  spliceLines,
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

function projectWithStories(stories: Story[]): Project {
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
      id: '1階|C|C1|主筋|1000|12',
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

  it('propagates an inferred contributing rule to the whole row', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const line = aggregateQuantity(
      project,
      [mainRebar(project.members[0].id)],
      jpMlitRulePack,
    )[0]

    expect(line.rules.some(({ confidence }) => confidence === 'inferred')).toBe(
      true,
    )
    expect(line.rules.map(({ key }) => key)).toContain('unit-mass.value')
    expect(line.rules.map(({ key }) => key)).toContain('markup.rate')
    expect(line.inferred).toBe(true)
    expect(hasInferred([line])).toBe(true)
  })

  it('returns every inferred contribution once without collapsing variants', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const memberId = project.members[0].id
    const lines = aggregateQuantity(
      project,
      [mainRebar(memberId), hoopRebar(memberId)],
      jpMlitRulePack,
    )

    const inferred = inferredRules(lines)
    const identities = inferred.map(ruleIdentity)

    expect(inferred).toHaveLength(7)
    expect(new Set(identities).size).toBe(inferred.length)
    expect(inferred.filter(({ key }) => key === 'unit-mass.value')).toHaveLength(
      2,
    )
    expect(inferred.every(({ confidence }) => confidence === 'inferred')).toBe(
      true,
    )
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
      subtotals.reduce((sum, subtotal) => sum + subtotal.designKg, 0),
    )
    expect(total.requiredKg).toBe(
      subtotals.reduce((sum, subtotal) => sum + subtotal.requiredKg, 0),
    )
  })
})
