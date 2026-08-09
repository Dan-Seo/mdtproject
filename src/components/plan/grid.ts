import type {
  GirderPosition,
  Member,
  MemberKind,
} from '@/domain/model/member'
import {
  gridPointCount,
  type Grid,
  type Project,
} from '@/domain/model/project'

export type SpanAxis = 'x' | 'y'

export function spanCoordinates(spans: number[]): number[] {
  return spans.reduce<number[]>(
    (coordinates, span) => [
      ...coordinates,
      coordinates[coordinates.length - 1] + span,
    ],
    [0],
  )
}

function isGirder(member: Member): member is Member & {
  kind: '大梁'
  position: GirderPosition
} {
  return member.kind === '大梁' && 'axis' in member.position
}

function positionKey(member: Member): string {
  if (isGirder(member)) {
    const { axis, ix, iy } = member.position
    return `${member.storyId}|${member.kind}|${axis}|${ix}|${iy}`
  }

  return (
    `${member.storyId}|${member.kind}|` +
    `${member.position.ix}|${member.position.iy}`
  )
}

function defaultSectionId(project: Project, kind: MemberKind): string {
  const section = project.sections.find((candidate) => candidate.kind === kind)

  if (!section) {
    throw new Error(`A ${kind} section is required to generate grid members`)
  }

  return section.id
}

function girderLineSectionId(
  project: Project,
  storyId: string,
  axis: GirderPosition['axis'],
  ix: number,
  iy: number,
): string {
  const sameLine = project.members.find((member) => {
    if (
      !isGirder(member) ||
      member.storyId !== storyId ||
      member.position.axis !== axis
    ) {
      return false
    }

    return axis === 'X'
      ? member.position.iy === iy
      : member.position.ix === ix
  })

  return sameLine?.sectionId ?? defaultSectionId(project, '大梁')
}

export function generateGridMembers(project: Project, grid: Grid): Member[] {
  const { nx, ny } = gridPointCount(grid)
  const existing = new Map(
    project.members.map((member) => [positionKey(member), member]),
  )
  const columnSectionId = defaultSectionId(project, '柱')
  const members: Member[] = []

  for (const story of project.stories) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const key = `${story.id}|柱|${ix}|${iy}`
        members.push(
          existing.get(key) ?? {
            id: `${story.id}-X${ix + 1}Y${iy + 1}`,
            kind: '柱',
            memberClass: '躯体',
            sectionId: columnSectionId,
            storyId: story.id,
            position: { ix, iy },
          },
        )
      }
    }

    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx - 1; ix += 1) {
        const key = `${story.id}|大梁|X|${ix}|${iy}`
        members.push(
          existing.get(key) ?? {
            id: `${story.id}-G-X${ix + 1}Y${iy + 1}-X`,
            kind: '大梁',
            memberClass: '躯体',
            sectionId: girderLineSectionId(
              project,
              story.id,
              'X',
              ix,
              iy,
            ),
            storyId: story.id,
            position: { axis: 'X', ix, iy },
          },
        )
      }
    }

    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny - 1; iy += 1) {
        const key = `${story.id}|大梁|Y|${ix}|${iy}`
        members.push(
          existing.get(key) ?? {
            id: `${story.id}-G-X${ix + 1}Y${iy + 1}-Y`,
            kind: '大梁',
            memberClass: '躯体',
            sectionId: girderLineSectionId(
              project,
              story.id,
              'Y',
              ix,
              iy,
            ),
            storyId: story.id,
            position: { axis: 'Y', ix, iy },
          },
        )
      }
    }
  }

  return members
}

export function updateProjectSpans(
  project: Project,
  axis: SpanAxis,
  spans: number[],
): Project {
  if (
    spans.length === 0 ||
    spans.some((span) => !Number.isFinite(span) || span <= 0)
  ) {
    throw new RangeError(`${axis.toUpperCase()} spans must be positive numbers`)
  }

  const grid: Grid = {
    ...project.grid,
    [axis === 'x' ? 'xSpans' : 'ySpans']: [...spans],
  }

  return {
    ...project,
    grid,
    members: generateGridMembers(project, grid),
  }
}
