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

/**
 * 柱主筋の端部条件 (R7)。
 *
 * 층간 접합부에는 이음이 **한 번만** 있어야 한다. 예전에는 모든 층이
 * 「階高 ＋ 定着 ＋ 継手」를 받아 접합부가 아래층의 継手와 위층의 定着으로
 * 두 번 계상됐다. 접합부의 継手는 **위층 부재가 부담**하고, 定着은 스택의
 * 양 끝(기초·최상단)에만 붙는다.
 *
 * 스택 순서는 `stories` 배열 순서를 그대로 신뢰한다 — Story에 레벨 값이 없다.
 * 조문이 아니라 관행에 따른 배분이므로 이 규칙 자체는 검증되지 않은 전제다.
 */
export interface ColumnEnds {
  bottom: '定着' | '継手'
  top: '定着' | 'なし'
}

export function columnEnds(project: Project, member: Member): ColumnEnds {
  const { position } = member

  if (member.kind !== '柱' || !isColumnPosition(position)) {
    throw new Error(`columnEnds requires a 柱: ${member.id}`)
  }

  const level = project.stories.findIndex(({ id }) => id === member.storyId)
  if (level < 0) {
    throw new Error(`Story not found: ${member.storyId}`)
  }

  const hasColumnAtLevel = (candidateLevel: number): boolean => {
    const story = project.stories[candidateLevel]
    if (story === undefined) return false

    return project.members.some(
      (candidate) =>
        candidate.kind === '柱' &&
        candidate.storyId === story.id &&
        isColumnPosition(candidate.position) &&
        candidate.position.ix === position.ix &&
        candidate.position.iy === position.iy,
    )
  }

  return {
    bottom: hasColumnAtLevel(level - 1) ? '継手' : '定着',
    top: hasColumnAtLevel(level + 1) ? 'なし' : '定着',
  }
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
