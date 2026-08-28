import type { Project } from '@/domain/model/project'

import type {
  StbGridCandidate,
  StbSkeletonCandidate,
  StbSkeletonApplyResult,
} from './types'

function sameNumbers(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function sameStrings(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right

  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function gridFor(
  grids: StbGridCandidate[],
  direction: StbGridCandidate['direction'],
): StbGridCandidate | undefined {
  const matching = grids.filter((grid) => grid.direction === direction)
  return matching.length === 1 ? matching[0] : undefined
}

function gridValue(
  xGrid: StbGridCandidate,
  yGrid: StbGridCandidate,
): Project['grid'] {
  return {
    xSpans: [...xGrid.spansMm],
    ySpans: [...yGrid.spansMm],
    xLabels: xGrid.axes.map(({ label }) => label),
    yLabels: yGrid.axes.map(({ label }) => label),
  }
}

function sameGridSpans(
  project: Project,
  nextGrid: Project['grid'],
): boolean {
  return (
    sameNumbers(project.grid.xSpans, nextGrid.xSpans) &&
    sameNumbers(project.grid.ySpans, nextGrid.ySpans)
  )
}

function sameGrid(project: Project, nextGrid: Project['grid']): boolean {
  return (
    sameGridSpans(project, nextGrid) &&
    sameStrings(project.grid.xLabels, nextGrid.xLabels) &&
    sameStrings(project.grid.yLabels, nextGrid.yLabels)
  )
}

function sameStories(
  left: Project['stories'],
  right: Project['stories'],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (story, index) =>
        story.id === right[index]?.id &&
        story.name === right[index]?.name &&
        story.height === right[index]?.height,
    )
  )
}

export function applyStbGrid(
  project: Project,
  candidate: StbSkeletonCandidate,
  options: { discardMembers?: boolean } = {},
): StbSkeletonApplyResult {
  const xGrid = gridFor(candidate.grids, 'X')
  const yGrid = gridFor(candidate.grids, 'Y')
  if (xGrid === undefined || yGrid === undefined) {
    return {
      project,
      applied: false,
      refusal: '通り芯候補なし',
    }
  }

  const nextGrid = gridValue(xGrid, yGrid)
  const spansMatch = sameGridSpans(project, nextGrid)
  if (sameGrid(project, nextGrid)) {
    return { project, applied: false }
  }

  if (
    !spansMatch &&
    project.members.length > 0 &&
    options.discardMembers !== true
  ) {
    return {
      project,
      applied: false,
      refusal: '部材あり通り芯置換不可',
    }
  }

  return {
    project: {
      ...project,
      grid: nextGrid,
      ...(spansMatch ? {} : { members: [] }),
    },
    applied: true,
  }
}

export function applyStbStories(
  project: Project,
  candidate: StbSkeletonCandidate,
  options: { discardMembers?: boolean } = {},
): StbSkeletonApplyResult {
  if (candidate.stories.length === 0) {
    return {
      project,
      applied: false,
      refusal: '階候補なし',
    }
  }

  if (project.members.length > 0 && options.discardMembers !== true) {
    return {
      project,
      applied: false,
      refusal: '部材あり階置換不可',
    }
  }

  const stories = candidate.stories.map((story, index) => ({
    id: `story-${index + 1}`,
    name: story.name,
    height: story.heightMm,
  }))

  if (project.members.length === 0 && sameStories(project.stories, stories)) {
    return { project, applied: false }
  }

  return {
    project: {
      ...project,
      stories,
      members: [],
    },
    applied: true,
  }
}
