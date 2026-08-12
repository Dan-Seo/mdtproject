import { describe, expect, it } from 'vitest'

import { beamDepthAbove, gridPointCount } from './project'
import { createSampleProject } from './sample-project'

function expectPureJson(value: unknown): void {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return
  }

  expect(typeof value).not.toBe('undefined')
  expect(typeof value).not.toBe('function')
  expect(typeof value).toBe('object')

  if (Array.isArray(value)) {
    value.forEach(expectPureJson)
    return
  }

  expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
  Object.values(value as Record<string, unknown>).forEach(expectPureJson)
}

describe('createSampleProject', () => {
  it('matches the M3a 2×3, two-story section-list example', () => {
    const project = createSampleProject()

    expect(project.grid).toEqual({
      xSpans: [6000],
      ySpans: [6000, 6000],
    })
    expect(project.stories).toEqual([
      { id: '1F', name: '1階', height: 4200 },
      { id: '2F', name: '2階', height: 3600 },
    ])
    expect(project.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: '柱',
          mark: 'C1',
          b: 800,
          d: 800,
          fc: 24,
          grade: 'SD345',
          main: { size: 'D25', count: 12 },
          hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
        }),
        expect.objectContaining({
          kind: '大梁',
          mark: 'G1',
          b: 400,
          depth: 750,
          fc: 24,
          grade: 'SD345',
        }),
        expect.objectContaining({
          kind: '大梁',
          mark: 'G2',
          b: 400,
          depth: 700,
          fc: 24,
          grade: 'SD345',
        }),
      ]),
    )
  })

  it('derives the 柱 and 大梁 counts per story from the grid', () => {
    const project = createSampleProject()
    const { nx, ny } = gridPointCount(project.grid)
    const columnCount = nx * ny
    const girderCount = (nx - 1) * ny + nx * (ny - 1)

    for (const story of project.stories) {
      const storyMembers = project.members.filter(
        ({ storyId }) => storyId === story.id,
      )

      expect(storyMembers.filter(({ kind }) => kind === '柱')).toHaveLength(
        columnCount,
      )
      expect(storyMembers.filter(({ kind }) => kind === '大梁')).toHaveLength(
        girderCount,
      )
    }
  })

  it('looks up different 大梁せい values from the section list', () => {
    const project = createSampleProject()
    const cornerColumn = project.members.find(
      ({ id }) => id === '1F-X1Y1',
    )!
    const centerColumn = project.members.find(
      ({ id }) => id === '1F-X2Y2',
    )!

    expect(beamDepthAbove(project, cornerColumn)).toBe(750)
    expect(beamDepthAbove(project, centerColumn)).toBe(700)
  })

  it('is composed only of plain JSON-compatible values', () => {
    const project = createSampleProject()

    expect(() => JSON.stringify(project)).not.toThrow()
    expectPureJson(project)
  })
})
