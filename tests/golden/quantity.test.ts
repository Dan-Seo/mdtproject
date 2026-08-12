import { describe, expect, it } from 'vitest'

import type {
  BarSize,
  ColumnSection,
  Member,
  MemberClass,
} from '../../src/domain/model/member'
import {
  PROJECT_SCHEMA_VERSION,
  type Project,
} from '../../src/domain/model/project'
import type { Rebar } from '../../src/domain/model/rebar'
import { aggregateQuantity } from '../../src/domain/quantity'
import {
  coverConditions,
  lookupRule,
  lookupUnitMass,
} from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/quantity.json'

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
  main: { size: 'D25', count: 1 },
  hoop: { size: 'D13', pitch: 100 },
}

function projectFor(memberClasses: string[]): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: '割増ゴールデンテスト',
    grid: { xSpans: [6000], ySpans: [6000] },
    stories: [{ id: '1F', name: '1階', height: 4200 }],
    sections: [section],
    members: memberClasses.map((memberClass, index) => ({
      id: `1F-C${index + 1}`,
      kind: '柱',
      memberClass: memberClass as MemberClass,
      sectionId: section.id,
      storyId: '1F',
      position: { ix: index, iy: 0 },
    })),
  }
}

function rebarFor(member: Member, designKg: number, size: BarSize): Rebar {
  const unitMass = lookupUnitMass(jpMlitRulePack, size)
  const length = (designKg / unitMass.value) * 1000

  return {
    id: `${member.id}|main`,
    memberId: member.id,
    role: '主筋',
    size,
    shape: 'straight',
    points: [
      [0, 0, 0],
      [0, length, 0],
    ],
    closed: false,
    length,
    count: 1,
    ruleHits: [
      lookupRule(jpMlitRulePack, 'cover.minimum', coverConditions(section)),
    ],
    formula: 'ゴールデンテスト入力から設計数量を再現',
  }
}

describe('公共建築数量積算基準の所要数量', () => {
  it('applies the stated page 20 markup without domain rounding', () => {
    const project = projectFor([fixture.supported.memberClass])
    const line = aggregateQuantity(
      project,
      [
        rebarFor(
          project.members[0],
          fixture.supported.designKg,
          fixture.supported.size as BarSize,
        ),
      ],
      jpMlitRulePack,
    )[0]
    const markupRule = line.rules.find(({ key }) => key === 'markup.rate')

    expect(line.designKg).toBe(fixture.supported.designKg)
    expect(line.requiredKg).toBe(fixture.supported.requiredKg)
    expect(markupRule?.source.doc).toBe(fixture.source.doc)
    expect(markupRule?.source.edition).toBe(fixture.source.edition)
    expect(markupRule?.source.section).toBe(fixture.source.section)
    expect(markupRule?.source.page).toBe(fixture.source.page)
  })

  it('throws when an unsupported memberClass is mixed into aggregation', () => {
    const project = projectFor([
      fixture.supported.memberClass,
      fixture.unsupported.memberClass,
    ])
    const rebars = project.members.map((member) =>
      rebarFor(
        member,
        fixture.supported.designKg,
        fixture.supported.size as BarSize,
      ),
    )

    expect(() =>
      aggregateQuantity(project, rebars, jpMlitRulePack),
    ).toThrow()
  })
})
