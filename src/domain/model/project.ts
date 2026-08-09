import type {
  ColumnPosition,
  GirderPosition,
  Member,
  Section,
} from './member'

export const PROJECT_SCHEMA_VERSION = 1

export interface Grid {
  xSpans: number[]
  ySpans: number[]
}

export interface Story {
  id: string
  name: string
  height: number
}

export interface Project {
  schemaVersion: number
  name: string
  grid: Grid
  stories: Story[]
  sections: Section[]
  members: Member[]
  /** 내역서 備考. QuantityLine.id를 키로 쓴다. 값이 없는 행은 키 자체가 없다. */
  notes?: Record<string, string>
}

export function gridPointCount(grid: Grid): { nx: number; ny: number } {
  return {
    nx: grid.xSpans.length + 1,
    ny: grid.ySpans.length + 1,
  }
}

export function gridPoint(
  grid: Grid,
  ix: number,
  iy: number,
): { x: number; y: number } {
  const { nx, ny } = gridPointCount(grid)

  if (
    !Number.isInteger(ix) ||
    !Number.isInteger(iy) ||
    ix < 0 ||
    ix >= nx ||
    iy < 0 ||
    iy >= ny
  ) {
    throw new RangeError(`Grid point index out of range: (${ix}, ${iy})`)
  }

  return {
    x: grid.xSpans.slice(0, ix).reduce((sum, span) => sum + span, 0),
    y: grid.ySpans.slice(0, iy).reduce((sum, span) => sum + span, 0),
  }
}

/** 층 바닥의 누적 표고(mm). stories 배열 순서대로 아래층 height를 누적한다. */
export function storyElevation(stories: Story[], storyId: string): number {
  const index = stories.findIndex(({ id }) => id === storyId)

  if (index < 0) {
    throw new Error(`Story not found: ${storyId}`)
  }

  return stories.slice(0, index).reduce((sum, story) => sum + story.height, 0)
}

export function findSection(project: Project, sectionId: string): Section {
  const section = project.sections.find(({ id }) => id === sectionId)

  if (!section) {
    throw new Error(`Section not found: ${sectionId}`)
  }

  return section
}

export function memberGroupKey(project: Project, member: Member): string {
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) {
    throw new Error(`Story not found: ${member.storyId}`)
  }

  const section = findSection(project, member.sectionId)
  if (section.kind !== member.kind) {
    throw new Error(
      `Member and section kinds do not match: ${member.id} (${member.kind}/${section.kind})`,
    )
  }

  const memberCode = member.kind === '柱' ? 'C' : 'G'
  return `${story.name}|${memberCode}|${section.mark}`
}

function isColumnPosition(
  position: ColumnPosition | GirderPosition,
): position is ColumnPosition {
  return !('axis' in position)
}

function isGirderPosition(
  position: ColumnPosition | GirderPosition,
): position is GirderPosition {
  return 'axis' in position
}

function touchesColumn(
  girder: GirderPosition,
  column: ColumnPosition,
): boolean {
  if (girder.axis === 'X') {
    return (
      girder.iy === column.iy &&
      (girder.ix === column.ix || girder.ix + 1 === column.ix)
    )
  }

  return (
    girder.ix === column.ix &&
    (girder.iy === column.iy || girder.iy + 1 === column.iy)
  )
}

export function beamDepthAbove(project: Project, member: Member): number {
  if (member.kind !== '柱' || !isColumnPosition(member.position)) {
    throw new Error(`beamDepthAbove requires a 柱: ${member.id}`)
  }

  const depths = project.members
    .filter(
      (candidate) =>
        candidate.kind === '大梁' &&
        candidate.storyId === member.storyId &&
        isGirderPosition(candidate.position) &&
        touchesColumn(candidate.position, member.position),
    )
    .map((girder) => {
      const section = findSection(project, girder.sectionId)
      if (section.kind !== '大梁') {
        throw new Error(
          `大梁 member references a non-大梁 section: ${girder.id}`,
        )
      }
      return section.depth
    })

  if (depths.length === 0) {
    throw new Error(`No touching 大梁 found above 柱: ${member.id}`)
  }

  return Math.max(...depths)
}

export function setNote(
  project: Project,
  lineId: string,
  note: string,
): Project {
  const notes = { ...project.notes }

  if (note === '') delete notes[lineId]
  else notes[lineId] = note

  return { ...project, notes }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project)
}

export function deserializeProject(json: string): Project {
  const parsed: unknown = JSON.parse(json)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('schemaVersion' in parsed) ||
    parsed.schemaVersion !== PROJECT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Project schemaVersion; expected ${PROJECT_SCHEMA_VERSION}`,
    )
  }

  return parsed as Project
}
