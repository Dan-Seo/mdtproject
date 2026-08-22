import { describe, expect, it } from 'vitest'

import { gridPointCount } from './project'
import { createStressProject } from './stress-project'

describe('createStressProject', () => {
  it('builds a schema-valid project sized by the given grid and story count', () => {
    const project = createStressProject({
      xSpanCount: 3,
      ySpanCount: 2,
      storyCount: 2,
    })

    expect(project.schemaVersion).toBe(8)
    expect(project.stories).toHaveLength(2)
    expect(JSON.parse(JSON.stringify(project))).toEqual(project)
  })

  it('places one 柱 at every grid point on every story', () => {
    const xSpanCount = 4
    const ySpanCount = 3
    const storyCount = 2
    const project = createStressProject({ xSpanCount, ySpanCount, storyCount })
    const { nx, ny } = gridPointCount(project.grid)

    const columns = project.members.filter((member) => member.kind === '柱')

    expect(columns).toHaveLength(nx * ny * storyCount)
  })

  it('scales up without duplicate member ids', () => {
    const project = createStressProject({
      xSpanCount: 7,
      ySpanCount: 6,
      storyCount: 1,
    })

    const ids = new Set(project.members.map((member) => member.id))

    expect(ids.size).toBe(project.members.length)
  })
})
