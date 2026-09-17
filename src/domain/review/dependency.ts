import type { GirderPosition, Member } from '../model/member'
import {
  findSection,
  girderRun,
  touchesColumn,
  type Project,
} from '../model/project'
import { MemberUnsupportedError } from '../model/unsupported'
import { supportColumnIds } from './joint'

const COLUMN = '柱'
const GIRDER = '大梁'
const WALL = '耐震壁'
const SLAB = '床板'

export type DependencyVia = '支持柱' | '上部大梁' | '連続スパン' | '上下階柱'

export type Dependency =
  | { memberId: string; via: '支持柱'; detail: string; reads: { shape: string; b: number; d: number } }
  | { memberId: string; via: '上部大梁'; detail: string; reads: { depth: number } }
  | { memberId: string; via: '連続スパン'; detail: string; reads: { sectionId: string; position: GirderPosition } }
  | { memberId: string; via: '上下階柱'; detail: string; reads: { exists: true } }

export type DependencyResolution =
  | { status: 'tracked'; dependencies: Dependency[]; missing: { via: DependencyVia; detail: string }[] }
  | { status: 'untracked'; reason: '依存経路未追跡（耐震壁・床板）' }

function isGirder(member: Member): member is Member & { kind: typeof GIRDER; position: GirderPosition } {
  return member.kind === GIRDER && 'axis' in member.position
}

function supportDependency(
  project: Project,
  memberId: string | null,
  end: '始端' | '終端',
  dependencies: Dependency[],
  missing: { via: DependencyVia; detail: string }[],
): void {
  if (memberId === null) {
    missing.push({ via: '支持柱', detail: `${end} 支持柱なし` })
    return
  }
  const member = project.members.find(({ id }) => id === memberId)
  if (!member) {
    missing.push({ via: '支持柱', detail: `${end} 支持柱なし` })
    return
  }
  const section = findSection(project, member.sectionId)
  if (section.kind !== COLUMN) throw new Error(`支持柱 member references a non-柱 section: ${member.id}`)
  if (dependencies.some((dependency) => dependency.memberId === memberId && dependency.via === '支持柱')) return
  dependencies.push({
    memberId,
    via: '支持柱',
    detail: `${end} 支持柱 ${memberId}`,
    reads: { shape: section.shape, b: section.b, d: section.d },
  })
}

function columnDependencies(project: Project, member: Member): Dependency[] {
  const dependencies: Dependency[] = []
  if (!('axis' in member.position)) {
    for (const candidate of project.members) {
      if (
        candidate.kind !== GIRDER ||
        candidate.storyId !== member.storyId ||
        !('axis' in candidate.position) ||
        !touchesColumn(candidate.position, member.position)
      ) continue
      const section = findSection(project, candidate.sectionId)
      if (section.kind !== GIRDER) throw new Error(`大梁 member references a non-大梁 section: ${candidate.id}`)
      dependencies.push({
        memberId: candidate.id,
        via: '上部大梁',
        detail: `上部大梁 ${candidate.id}`,
        reads: { depth: section.depth },
      })
    }
  }
  const level = project.stories.findIndex(({ id }) => id === member.storyId)
  if (level < 0 || 'axis' in member.position) return dependencies
  for (const story of [-1, 1].map((offset) => project.stories[level + offset])) {
    if (!story) continue
    const column = project.members.find(
      (candidate) =>
        candidate.kind === COLUMN && candidate.storyId === story.id &&
        !('axis' in candidate.position) &&
        candidate.position.ix === member.position.ix &&
        candidate.position.iy === member.position.iy,
    )
    if (column) {
      dependencies.push({
        memberId: column.id,
        via: '上下階柱',
        detail: `上下階柱 ${column.id}`,
        reads: { exists: true },
      })
    }
  }
  return dependencies
}

export function memberDependencies(project: Project, memberId: string): DependencyResolution {
  const member = project.members.find(({ id }) => id === memberId)
  if (!member) throw new Error(`Member not found: ${memberId}`)
  if (member.kind === WALL || member.kind === SLAB) {
    return { status: 'untracked', reason: '依存経路未追跡（耐震壁・床板）' }
  }

  const dependencies: Dependency[] = []
  const missing: { via: DependencyVia; detail: string }[] = []
  if (member.kind === COLUMN) {
    dependencies.push(...columnDependencies(project, member))
  } else if (isGirder(member)) {
    let runMembers: Member[] = [member]
    try {
      runMembers = girderRun(project, member).members
    } catch (error) {
      if (!(error instanceof MemberUnsupportedError)) throw error
    }
    for (const runMember of runMembers) {
      if (runMember.id === member.id) continue
      if (!isGirder(runMember)) throw new Error(`大梁 run contains a non-大梁 member: ${runMember.id}`)
      dependencies.push({
        memberId: runMember.id,
        via: '連続スパン',
        detail: `連続スパン ${runMember.id}`,
        reads: { sectionId: runMember.sectionId, position: runMember.position },
      })
    }
    for (const runMember of runMembers) {
      const supportIds = supportColumnIds(project, runMember.id)
      supportDependency(project, supportIds.start, '始端', dependencies, missing)
      supportDependency(project, supportIds.end, '終端', dependencies, missing)
    }
  } else {
    return { status: 'tracked', dependencies, missing }
  }

  return { status: 'tracked', dependencies, missing }
}
