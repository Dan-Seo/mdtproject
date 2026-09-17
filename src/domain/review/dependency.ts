import type { GirderPosition, Member } from '../model/member'
import {
  findSection,
  girderRun,
  touchesColumn,
  type Project,
} from '../model/project'
import { MemberUnsupportedError } from '../model/unsupported'
import { supportColumnIds } from './joint'

const COLUMN = '\u67f1'
const GIRDER = '\u5927\u6881'
const WALL = '\u8010\u9707\u58c1'
const SLAB = '\u5e8a\u677f'

export type DependencyVia = '\u652f\u6301\u67f1' | '\u4e0a\u90e8\u5927\u6881' | '\u9023\u7d9a\u30b9\u30d1\u30f3' | '\u4e0a\u4e0b\u968e\u67f1'

export type Dependency =
  | { memberId: string; via: '\u652f\u6301\u67f1'; detail: string; reads: { shape: string; b: number; d: number } }
  | { memberId: string; via: '\u4e0a\u90e8\u5927\u6881'; detail: string; reads: { depth: number } }
  | { memberId: string; via: '\u9023\u7d9a\u30b9\u30d1\u30f3'; detail: string; reads: { sectionId: string; position: GirderPosition } }
  | { memberId: string; via: '\u4e0a\u4e0b\u968e\u67f1'; detail: string; reads: { exists: true } }

export type DependencyResolution =
  | { status: 'tracked'; dependencies: Dependency[]; missing: { via: DependencyVia; detail: string }[] }
  | { status: 'untracked'; reason: '\u4f9d\u5b58\u7d4c\u8def\u672a\u8ffd\u8de1\uff08\u8010\u9707\u58c1\u30fb\u5e8a\u677f\uff09' }

function isGirder(member: Member): member is Member & { kind: typeof GIRDER; position: GirderPosition } {
  return member.kind === GIRDER && 'axis' in member.position
}

function supportDependency(
  project: Project,
  memberId: string | null,
  end: '\u59cb\u7aef' | '\u7d42\u7aef',
  dependencies: Dependency[],
  missing: { via: DependencyVia; detail: string }[],
): void {
  if (memberId === null) {
    missing.push({ via: '\u652f\u6301\u67f1', detail: `${end} \u652f\u6301\u67f1\u306a\u3057` })
    return
  }
  const member = project.members.find(({ id }) => id === memberId)
  if (!member) {
    missing.push({ via: '\u652f\u6301\u67f1', detail: `${end} \u652f\u6301\u67f1\u306a\u3057` })
    return
  }
  const section = findSection(project, member.sectionId)
  if (section.kind !== COLUMN) throw new Error(`支持柱 member references a non-柱 section: ${member.id}`)
  if (dependencies.some((dependency) => dependency.memberId === memberId && dependency.via === '\u652f\u6301\u67f1')) return
  dependencies.push({
    memberId,
    via: '\u652f\u6301\u67f1',
    detail: `${end} \u652f\u6301\u67f1 ${memberId}`,
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
        via: '\u4e0a\u90e8\u5927\u6881',
        detail: `\u4e0a\u90e8\u5927\u6881 ${candidate.id}`,
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
        via: '\u4e0a\u4e0b\u968e\u67f1',
        detail: `\u4e0a\u4e0b\u968e\u67f1 ${column.id}`,
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
    return { status: 'untracked', reason: '\u4f9d\u5b58\u7d4c\u8def\u672a\u8ffd\u8de1\uff08\u8010\u9707\u58c1\u30fb\u5e8a\u677f\uff09' }
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
        via: '\u9023\u7d9a\u30b9\u30d1\u30f3',
        detail: `\u9023\u7d9a\u30b9\u30d1\u30f3 ${runMember.id}`,
        reads: { sectionId: runMember.sectionId, position: runMember.position },
      })
    }
    for (const runMember of runMembers) {
      const supportIds = supportColumnIds(project, runMember.id)
      supportDependency(project, supportIds.start, '\u59cb\u7aef', dependencies, missing)
      supportDependency(project, supportIds.end, '\u7d42\u7aef', dependencies, missing)
    }
  } else {
    return { status: 'tracked', dependencies, missing }
  }

  return { status: 'tracked', dependencies, missing }
}
