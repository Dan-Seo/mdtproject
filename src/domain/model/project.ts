import type {
  ColumnSection,
  ColumnPosition,
  GirderPosition,
  Member,
  Section,
} from './member'
import {
  MemberUnsupportedError,
  type UnsupportedReason,
} from './unsupported'
import { coverConditions } from '../rules/lookup'

// v2 (2026-08-12): Section에 필수 필드 exposure·finish 추가 — v1 JSON은
// deserializeProject의 버전 게이트에서 명시적으로 거부된다 (영속 v1 데이터 없음).
// v3 (2026-08-12): GirderSection.stirrup에 필수 필드 startOffsetMm 추가. 規準에
// 없는 배치값을 룰팩에 가짜 출처로 넣는 대신 입력으로 받는다 (ADR-012).
export const PROJECT_SCHEMA_VERSION = 3

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

export type GirderSupport =
  | { supported: true }
  | { supported: false; reason: UnsupportedReason }

export function girderSupport(
  project: Project,
  member: Member,
): GirderSupport {
  if (member.kind !== '大梁' || !isGirderPosition(member.position)) {
    throw new Error(`girderSupport requires a 大梁: ${member.id}`)
  }

  const position = member.position
  const hasAdjacentGirder = project.members.some((candidate) => {
    if (
      candidate.kind !== '大梁' ||
      candidate.storyId !== member.storyId ||
      !isGirderPosition(candidate.position) ||
      candidate.position.axis !== position.axis
    ) {
      return false
    }

    if (position.axis === 'X') {
      return (
        candidate.position.iy === position.iy &&
        Math.abs(candidate.position.ix - position.ix) === 1
      )
    }

    return (
      candidate.position.ix === position.ix &&
      Math.abs(candidate.position.iy - position.iy) === 1
    )
  })

  return hasAdjacentGirder
    ? { supported: false, reason: '連続スパン' }
    : { supported: true }
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

export interface GirderSpan {
  axis: 'X' | 'Y'
  /** 그리드 교점 간 중심 스팬 (mm) */
  centerSpan: number
  /** 内法長さ (mm) — 양단 柱面 사이 */
  clear: number
  /** 시작 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  startFaceOffsetMm: number
  /** 끝 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  endFaceOffsetMm: number
  /** 정착 수용성 검사용 — 시작 柱의 축방향 전체 치수 (mm) */
  startSupportLengthAlongAxisMm: number
  /** 정착 수용성 검사용 — 끝 柱의 축방향 전체 치수 (mm) */
  endSupportLengthAlongAxisMm: number
  /** 지점 柱의 かぶり 조회 조건 — 端部条件은 大梁이 아니라 柱의 かぶり로 판정한다 */
  startSupportCover: Record<string, string | boolean>
  endSupportCover: Record<string, string | boolean>
}

function supportColumnSection(
  project: Project,
  girder: Member,
  ix: number,
  iy: number,
  end: 'start' | 'end',
): ColumnSection {
  const support = project.members.find(
    (candidate) =>
      candidate.kind === '柱' &&
      candidate.storyId === girder.storyId &&
      isColumnPosition(candidate.position) &&
      candidate.position.ix === ix &&
      candidate.position.iy === iy,
  )

  if (!support) {
    throw new Error(`Missing ${end} support 柱 for 大梁: ${girder.id}`)
  }

  const section = findSection(project, support.sectionId)
  if (section.kind !== '柱') {
    throw new Error(`柱 member references a non-柱 section: ${support.id}`)
  }

  return section
}

export function girderSpan(project: Project, member: Member): GirderSpan {
  if (member.kind !== '大梁' || !isGirderPosition(member.position)) {
    throw new Error(`girderSpan requires a 大梁: ${member.id}`)
  }

  const { axis, ix, iy } = member.position
  const endIx = axis === 'X' ? ix + 1 : ix
  const endIy = axis === 'Y' ? iy + 1 : iy
  const startPoint = gridPoint(project.grid, ix, iy)
  const endPoint = gridPoint(project.grid, endIx, endIy)
  const startSection = supportColumnSection(project, member, ix, iy, 'start')
  const endSection = supportColumnSection(
    project,
    member,
    endIx,
    endIy,
    'end',
  )
  const centerSpan =
    axis === 'X' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
  const startSupportLengthAlongAxisMm =
    axis === 'X' ? startSection.b : startSection.d
  const endSupportLengthAlongAxisMm =
    axis === 'X' ? endSection.b : endSection.d
  const startFaceOffsetMm = startSupportLengthAlongAxisMm / 2
  const endFaceOffsetMm = endSupportLengthAlongAxisMm / 2
  const clear = centerSpan - startFaceOffsetMm - endFaceOffsetMm

  if (clear <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `大梁 内法長さ must be positive: ${member.id} (${clear} mm)`,
    )
  }

  return {
    axis,
    centerSpan,
    clear,
    startFaceOffsetMm,
    endFaceOffsetMm,
    startSupportLengthAlongAxisMm,
    endSupportLengthAlongAxisMm,
    startSupportCover: coverConditions(startSection),
    endSupportCover: coverConditions(endSection),
  }
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
