import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type Fixture = {
  version: string
  encoding: string
  axisGroups: Array<{
    groupName?: string
    angle?: string
    axes: Array<{ name?: string; distance?: string }>
  }>
  stories: Array<{ name?: string; height?: string; kind?: string }>
  nodes: unknown[]
}

const fixtureDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/document',
)

const expected = {
  // 출처: step0-report.json > axes > dotnet-sample1.stb
  'dotnet-sample1.json': {
    version: '2.0.1',
    encoding: 'utf-8',
    axisGroups: [
      { groupName: 'Y', angle: '0.0', names: ['Y1', 'Y2', 'Y3'], distances: ['0.0', '6000.0', '12000.0'] },
      { groupName: 'X', angle: '270.0', names: ['X1', 'X2', 'X3'], distances: ['0.0', '6000.0', '12000.0'] },
    ],
    stories: [
      ['1FL', '0.0', 'GENERAL'],
      ['2FL', '5000.0', 'GENERAL'],
      ['RFL', '9200.0', 'ROOF'],
    ],
    nodes: 50,
  },
  // 출처: step0-report.json > axes > diffchecker-filea.stb
  'diffchecker-filea.json': {
    version: '2.0.2',
    encoding: 'shift_jis',
    axisGroups: [
      { groupName: 'Y', angle: '0.0', names: ['Y0', 'Y1', 'Y1a', 'Y2', 'Y2a', 'Y3', 'Y3a', 'Y4', 'Y5'], distances: ['0.0', '1000.0', '4200.0', '7400.0', '10600.0', '13800.0', '17000.0', '20200.0', '21200.0'] },
      { groupName: 'X', angle: '270.0', names: ['X0', 'X1', 'X1a', 'X2', 'X2a', 'X3', 'X4'], distances: ['0.0', '1000.0', '3000.0', '5000.0', '9400.0', '13800.0', '14800.0'] },
    ],
    stories: [
      ['1FL', '200.0', 'GENERAL'],
      ['2FL', '4700.0', 'GENERAL'],
      ['3FL', '8700.0', 'GENERAL'],
      ['RFL', '12700.0', 'PENTHOUSE'],
      ['PHRFL', '16500.0', 'ROOF'],
    ],
    nodes: 166,
  },
  // 출처: step0-report.json > axes > hoaryfox-sample.stb
  'hoaryfox-sample.json': {
    version: '2.0.2',
    encoding: 'utf-8',
    axisGroups: [
      { groupName: 'X', angle: '270', names: ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7'], distances: ['0', '3600', '7200', '10800', '14400', '18000', '21600'] },
      { groupName: 'Y', angle: '0', names: ['Y1', 'Y2', 'Y3'], distances: ['0', '10800', '14400'] },
    ],
    stories: [
      ['1F', '0', 'GENERAL'],
      ['2F', '4000', 'GENERAL'],
      ['3F', '8000', 'GENERAL'],
      ['4F', '12000', 'GENERAL'],
      ['5F', '16000', 'GENERAL'],
      ['RF', '20000', 'GENERAL'],
    ],
    nodes: 126,
  },
  // 출처: step0-report.json > axes > diffchecker-mini210.stb
  'diffchecker-mini210.json': {
    version: '2.1.0',
    encoding: 'utf-8',
    axisGroups: [],
    stories: [['1FL', '0', 'GENERAL']],
    nodes: 2,
  },
} as const

function fixture(file: string): Fixture {
  return JSON.parse(
    readFileSync(resolve(fixtureDirectory, file), 'utf8'),
  ) as Fixture
}

function storyTuples(document: Fixture): Array<[string | undefined, string | undefined, string | undefined]> {
  return document.stories.map((story) => [story.name, story.height, story.kind])
}

describe('committed ST-Bridge document IR fixtures', () => {
  for (const [file, facts] of Object.entries(expected)) {
    it(`${file} matches the step 0 skeleton measurements`, () => {
      const document = fixture(file)

      expect(document.version).toBe(facts.version)
      expect(document.encoding).toBe(facts.encoding)
      expect(document.axisGroups).toHaveLength(facts.axisGroups.length)
      expect(
        document.axisGroups.map((group) => ({
          groupName: group.groupName,
          angle: group.angle,
          axisCount: group.axes.length,
        })),
      ).toEqual(
        facts.axisGroups.map(({ groupName, angle, names }) => ({
          groupName,
          angle,
          axisCount: names.length,
        })),
      )

      for (const [index, group] of facts.axisGroups.entries()) {
        expect(document.axisGroups[index]?.axes.map((axis) => axis.name)).toEqual(
          group.names,
        )
        expect(
          document.axisGroups[index]?.axes.map((axis) => axis.distance),
        ).toEqual(group.distances)
      }

      expect(storyTuples(document)).toEqual(facts.stories)
      expect(document.stories).toHaveLength(facts.stories.length)
      expect(document.nodes).toHaveLength(facts.nodes)
    })
  }

  it('keeps the 2.1.0 mini corpus empty of axes and with one story', () => {
    const document = fixture('diffchecker-mini210.json')

    expect(document.axisGroups).toEqual([])
    expect(document.stories).toHaveLength(1)
  })
})
