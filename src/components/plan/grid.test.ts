import { describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'

import { spanCoordinates, updateProjectSpans } from './grid'

describe('spanCoordinates', () => {
  it('creates three X grid points from two 6000 spans', () => {
    expect(spanCoordinates([6000, 6000])).toEqual([0, 6000, 12000])
  })
})

describe('updateProjectSpans', () => {
  it('regenerates 柱 and 大梁 when an X span is added', () => {
    const project = createSampleProject()

    const updated = updateProjectSpans(project, 'x', [6000, 6000, 6000])
    const firstStoryMembers = updated.members.filter(
      ({ storyId }) => storyId === '1F',
    )

    expect(updated.grid.xSpans).toEqual([6000, 6000, 6000])
    expect(
      firstStoryMembers.filter(({ kind }) => kind === '柱'),
    ).toHaveLength(12)
    expect(
      firstStoryMembers.filter(({ kind }) => kind === '大梁'),
    ).toHaveLength(17)
  })

  it('keeps section assignments for members that remain on the grid', () => {
    const project = createSampleProject()
    const existing = project.members.find(
      ({ id }) => id === '1F-G2-X1Y2-X',
    )

    const updated = updateProjectSpans(project, 'x', [6000, 6000, 6000])

    expect(updated.members).toContainEqual(existing)
  })
})
