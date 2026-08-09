import { describe, expect, it } from 'vitest'

import type { ColumnSection, Member } from '../model/member'
import type { Project, Story } from '../model/project'
import type { Rebar } from '../model/rebar'
import { jpMlitRulePack } from '../../rulepack'
import {
  aggregateQuantity,
  grandTotal,
  hasInferred,
  inferredRules,
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
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100 },
}

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
    schemaVersion: 1,
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
    rules: [
      'cover.minimum',
      'anchorage.L2',
      'lap.L1',
      'rounding.length',
    ],
    formula: '主筋の算出式',
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
    rules: ['cover.minimum', 'bend.hook135', 'rounding.length'],
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
      id: '1階|C|C1|主筋',
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

  it('throws when lengthMm differs inside the same group and role', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members

    expect(() =>
      aggregateQuantity(
        project,
        [mainRebar(first.id), mainRebar(second.id, { length: 1010 })],
        jpMlitRulePack,
      ),
    ).toThrow(/length/i)
  })

  it('throws when countPerMember differs inside the same group and role', () => {
    const project = projectWithStories([
      { id: '1F', name: '1階', height: 4200 },
    ])
    const [first, second] = project.members

    expect(() =>
      aggregateQuantity(
        project,
        [mainRebar(first.id), mainRebar(second.id, { count: 16 })],
        jpMlitRulePack,
      ),
    ).toThrow(/count/i)
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
