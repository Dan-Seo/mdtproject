import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { toSkeletonCandidate } from '@/lib/import/stb/candidates'
import { applyStbGrid, applyStbStories } from '@/lib/import/stb/apply'
import type {
  StbSkeletonApplyRefusal,
  StbSkeletonApplyResult,
  StbDocument,
  StbGridCandidate,
  StbSkeletonCandidate,
} from '@/lib/import/stb/types'
import type { Project } from '@/domain/model/project'

const documentDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/document',
)
const appliedDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/applied',
)

const fixtureFiles = [
  'mini.json',
  'dotnet-sample1.json',
  'diffchecker-filea.json',
  'hoaryfox-sample.json',
  'diffchecker-mini210.json',
] as const

interface AppliedFixture {
  _derivedFrom: string
  grid: {
    applied: boolean
    refusal: StbSkeletonApplyRefusal | null
    value: {
      xSpans: number[]
      ySpans: number[]
      xLabels: string[]
      yLabels: string[]
    } | null
  }
  stories: {
    applied: boolean
    refusal: StbSkeletonApplyRefusal | null
    value: { id: string; name: string; height: number }[] | null
  }
}

interface RefusedFixture {
  applied: boolean
  refusal: StbSkeletonApplyRefusal | null
  value: null
}

function readJson<T>(directory: string, file: string): T {
  return JSON.parse(
    readFileSync(resolve(directory, file), 'utf8'),
  ) as T
}

function withoutPrivateKeys<T>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !key.startsWith('_'),
    ),
  ) as T
}

function candidateFor(file: (typeof fixtureFiles)[number]): StbSkeletonCandidate {
  return toSkeletonCandidate(
    withoutPrivateKeys(
      readJson<StbDocument>(documentDirectory, file),
    ),
  )
}

function resultShape(
  result: StbSkeletonApplyResult,
): RefusedFixture {
  return {
    applied: result.applied,
    refusal: result.refusal ?? null,
    value: null,
  }
}

const emptyProject: Project = {
  schemaVersion: 11,
  name: '사용자가 정한 案件名',
  grid: {
    xSpans: [6000, 6000],
    ySpans: [5000],
    xLabels: ['기존X1', '기존X2', '기존X3'],
    yLabels: ['기존Y1', '기존Y2'],
  },
  stories: [{ id: 'existing-story', name: '기존층', height: 3000 }],
  sections: [],
  members: [],
  notes: { 'existing-line': '보존할 메모' },
  unitMass: { D10: 0.56 },
}

const projectWithMember: Project = {
  ...emptyProject,
  members: [
    {
      id: 'member-1',
      kind: '柱',
      memberClass: '躯体',
      sectionId: 'section-1',
      storyId: 'existing-story',
      position: { ix: 0, iy: 0 },
    },
  ],
}

function relabelCandidate(
  candidate: StbSkeletonCandidate,
  labels: { x: string[]; y: string[] },
): StbSkeletonCandidate {
  return {
    ...candidate,
    grids: candidate.grids.map((grid) => ({
      ...grid,
      axes:
        grid.direction === 'X'
          ? labels.x.map((label) => ({ label }))
          : labels.y.map((label) => ({ label })),
    })),
  }
}

function gridCandidate(
  candidate: StbSkeletonCandidate,
): { x: StbGridCandidate; y: StbGridCandidate } {
  const x = candidate.grids.find(({ direction }) => direction === 'X')
  const y = candidate.grids.find(({ direction }) => direction === 'Y')
  if (x === undefined || y === undefined) {
    throw new Error('test candidate does not contain both grid directions')
  }
  return { x, y }
}

describe('ST-Bridge candidate application fixtures', () => {
  for (const file of fixtureFiles) {
    it(`${file} matches its independently derived applied fixture`, () => {
      const candidate = candidateFor(file)
      const expected = readJson<AppliedFixture>(appliedDirectory, file)

      const gridResult = applyStbGrid(emptyProject, candidate)
      const storiesResult = applyStbStories(emptyProject, candidate)
      const grid = gridResult.applied
        ? {
            applied: true,
            refusal: null,
            value: gridResult.project.grid,
          }
        : resultShape(gridResult)
      const stories = storiesResult.applied
        ? {
            applied: true,
            refusal: null,
            value: storiesResult.project.stories,
          }
        : resultShape(storiesResult)

      expect(expected._derivedFrom).toBe(
        `tests/fixtures/stb-import/expected/${file}`,
      )
      expect(grid).toEqual(expected.grid)
      expect(stories).toEqual(expected.stories)
    })
  }
})

describe('applyStbGrid', () => {
  it('rejects missing or non-unique X/Y candidates without touching the project', () => {
    const candidate = candidateFor('mini.json')
    const missingDirection = {
      ...candidate,
      grids: candidate.grids.filter(({ direction }) => direction === 'X'),
    }
    const duplicateDirection = {
      ...candidate,
      grids: [...candidate.grids, candidate.grids[0]!],
    }

    for (const invalid of [missingDirection, duplicateDirection]) {
      const result = applyStbGrid(projectWithMember, invalid)
      expect(result.applied).toBe(false)
      expect(result.refusal).toBe('通り芯候補なし')
      expect(result.project).toBe(projectWithMember)
    }
  })

  it('rejects a changed grid while members exist, preserving the original reference', () => {
    const result = applyStbGrid(projectWithMember, candidateFor('dotnet-sample1.json'))

    expect(result).toEqual({
      project: projectWithMember,
      applied: false,
      refusal: '部材あり通り芯置換不可',
    })
    expect(result.project).toBe(projectWithMember)
  })

  it('keeps members when only labels change on an otherwise equal grid', () => {
    const candidate = relabelCandidate(candidateFor('mini.json'), {
      x: ['X-A', 'X-B', 'X-C'],
      y: ['Y-A', 'Y-B'],
    })
    const result = applyStbGrid(projectWithMember, candidate)

    expect(result.applied).toBe(true)
    expect(result.project.members).toBe(projectWithMember.members)
    expect(result.project.stories).toBe(projectWithMember.stories)
    expect(result.project.grid).toEqual({
      xSpans: [6000, 6000],
      ySpans: [5000],
      xLabels: ['X-A', 'X-B', 'X-C'],
      yLabels: ['Y-A', 'Y-B'],
    })
    expect(result.project.grid.xSpans).not.toBe(candidate.grids[0]!.spansMm)
    expect(result.project.grid.ySpans).not.toBe(candidate.grids[1]!.spansMm)
  })

  it('discards members only when explicitly requested and preserves unrelated project data', () => {
    const candidate = candidateFor('dotnet-sample1.json')
    const before = {
      stories: projectWithMember.stories,
      sections: projectWithMember.sections,
      notes: projectWithMember.notes,
      unitMass: projectWithMember.unitMass,
      name: projectWithMember.name,
      schemaVersion: projectWithMember.schemaVersion,
    }
    const result = applyStbGrid(projectWithMember, candidate, {
      discardMembers: true,
    })

    expect(result.applied).toBe(true)
    expect(result.project.members).toEqual([])
    expect(result.project.stories).toBe(before.stories)
    expect(result.project.sections).toBe(before.sections)
    expect(result.project.notes).toBe(before.notes)
    expect(result.project.unitMass).toBe(before.unitMass)
    expect(result.project.name).toBe(before.name)
    expect(result.project.schemaVersion).toBe(before.schemaVersion)
    expect(JSON.parse(JSON.stringify(result.project))).toEqual(result.project)
  })
})

describe('applyStbStories', () => {
  it('rejects an empty story candidate without touching the project', () => {
    const candidate = candidateFor('mini.json')
    const result = applyStbStories(projectWithMember, {
      ...candidate,
      stories: [],
    })

    expect(result).toEqual({
      project: projectWithMember,
      applied: false,
      refusal: '階候補なし',
    })
    expect(result.project).toBe(projectWithMember)
  })

  it('rejects story replacement while members exist, preserving the original reference', () => {
    const result = applyStbStories(
      projectWithMember,
      candidateFor('dotnet-sample1.json'),
    )

    expect(result).toEqual({
      project: projectWithMember,
      applied: false,
      refusal: '部材あり階置換不可',
    })
    expect(result.project).toBe(projectWithMember)
  })

  it('applies the real candidate from bottom to top and leaves the grid unchanged', () => {
    const candidate = candidateFor('dotnet-sample1.json')
    const result = applyStbStories(emptyProject, candidate)

    expect(result.applied).toBe(true)
    expect(result.project.grid).toBe(emptyProject.grid)
    expect(result.project.stories).toEqual([
      { id: 'story-1', name: '1FL', height: 5000 },
      { id: 'story-2', name: '2FL', height: 4200 },
    ])
    expect(result.project.stories[0]?.name).toBe('1FL')
    expect(result.project.name).toBe(emptyProject.name)
    expect(result.project.sections).toBe(emptyProject.sections)
    expect(result.project.notes).toBe(emptyProject.notes)
    expect(JSON.parse(JSON.stringify(result.project))).toEqual(result.project)
  })

  it('does not block approval merely because the candidate carries an issue', () => {
    const candidate: StbSkeletonCandidate = {
      ...candidateFor('mini.json'),
      issues: ['通り芯位置と節点の不一致'],
    }

    expect(applyStbGrid(emptyProject, candidate).applied).toBe(true)
    expect(applyStbStories(emptyProject, candidate).applied).toBe(true)
  })

  it('does not share the candidate story array with the applied project', () => {
    const candidate = candidateFor('mini.json')
    const result = applyStbStories(emptyProject, candidate)

    expect(result.project.stories).not.toBe(candidate.stories)
    expect(result.project.stories[0]).not.toBe(candidate.stories[0])
  })
})

describe('application result invariants', () => {
  it('maps exactly one X and one Y grid without assuming their input order', () => {
    const candidate = candidateFor('mini.json')
    const shuffled = { ...candidate, grids: [...candidate.grids].reverse() }
    const result = applyStbGrid(emptyProject, shuffled)

    const { x, y } = gridCandidate(shuffled)
    expect(result.project.grid.xSpans).toEqual(x.spansMm)
    expect(result.project.grid.ySpans).toEqual(y.spansMm)
    expect(result.project.grid.xLabels).toEqual(x.axes.map(({ label }) => label))
    expect(result.project.grid.yLabels).toEqual(y.axes.map(({ label }) => label))
  })
})
