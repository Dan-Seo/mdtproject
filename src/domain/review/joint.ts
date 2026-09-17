import type {
  ColumnPosition,
  ColumnSection,
  GirderPosition,
  Member,
} from '../model/member'
import {
  findSection,
  girderRun,
  touchesColumn,
  type Project,
  type Story,
} from '../model/project'
import { MemberUnsupportedError } from '../model/unsupported'

const COLUMN = '\u67f1'
const GIRDER = '\u5927\u6881'

export interface JointGirder {
  member: Member
  section: Extract<ReturnType<typeof findSection>, { kind: typeof GIRDER }>
  end: '\u59cb\u7aef' | '\u7d42\u7aef'
}

export interface Joint {
  columnMemberId: string
  column: { member: Member; section: ColumnSection; story: Story }
  girders: JointGirder[]
  reference: { memberIds: string[] }
}

export type JointResolution =
  | { status: 'joint'; joint: Joint }
  | {
      status: 'unsupported'
      reason: '\u67f1\u3067\u306f\u306a\u3044' | '\u5186\u5f62\u67f1' | '\u53d6\u308a\u4ed8\u304f\u5927\u6881\u306a\u3057' | '\u90e8\u6750\u306a\u3057'
    }

function columnPosition(position: Member['position']): position is ColumnPosition {
  return !('axis' in position)
}

function girderPosition(position: Member['position']): position is GirderPosition {
  return 'axis' in position
}

function columnAt(
  project: Project,
  storyId: string,
  position: ColumnPosition,
): Member | undefined {
  return project.members.find(
    (candidate) =>
      candidate.kind === COLUMN &&
      candidate.storyId === storyId &&
      columnPosition(candidate.position) &&
      candidate.position.ix === position.ix &&
      candidate.position.iy === position.iy,
  )
}

function orderedGirders(girders: Member[]): Member[] {
  return [...girders].sort((left, right) => {
    if (!girderPosition(left.position) || !girderPosition(right.position)) return 0
    const axisOrder = left.position.axis === right.position.axis
      ? 0
      : left.position.axis === 'X'
        ? -1
        : 1
    if (axisOrder !== 0) return axisOrder
    const leftIndex = left.position.axis === 'X' ? left.position.ix : left.position.iy
    const rightIndex = right.position.axis === 'X' ? right.position.ix : right.position.iy
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.id.localeCompare(right.id)
  })
}

function endAtColumn(position: GirderPosition, column: ColumnPosition): JointGirder['end'] {
  return position.axis === 'X'
    ? position.ix === column.ix ? '\u59cb\u7aef' : '\u7d42\u7aef'
    : position.iy === column.iy ? '\u59cb\u7aef' : '\u7d42\u7aef'
}

function adjacentColumnIds(project: Project, member: Member): string[] {
  if (!columnPosition(member.position)) return []
  const level = project.stories.findIndex(({ id }) => id === member.storyId)
  if (level < 0) return []
  return [-1, 1]
    .map((offset) => project.stories[level + offset])
    .filter((story): story is Story => story !== undefined)
    .map((story) => columnAt(project, story.id, member.position as ColumnPosition)?.id)
    .filter((id): id is string => id !== undefined)
}

export function resolveJoint(project: Project, columnMemberId: string): JointResolution {
  const member = project.members.find(({ id }) => id === columnMemberId)
  if (!member) return { status: 'unsupported', reason: '\u90e8\u6750\u306a\u3057' }
  if (member.kind !== COLUMN || !columnPosition(member.position)) {
    return { status: 'unsupported', reason: '\u67f1\u3067\u306f\u306a\u3044' }
  }

  const section = findSection(project, member.sectionId)
  if (section.kind !== COLUMN) return { status: 'unsupported', reason: '\u67f1\u3067\u306f\u306a\u3044' }
  if (section.shape === '\u5186\u5f62') {
    return { status: 'unsupported', reason: '\u5186\u5f62\u67f1' }
  }
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) return { status: 'unsupported', reason: '\u90e8\u6750\u306a\u3057' }

  const girders = orderedGirders(
    project.members.filter(
      (candidate) =>
        candidate.kind === GIRDER &&
        candidate.storyId === story.id &&
        girderPosition(candidate.position) &&
        touchesColumn(candidate.position, member.position as ColumnPosition),
    ),
  )
  if (girders.length === 0) {
    return { status: 'unsupported', reason: '\u53d6\u308a\u4ed8\u304f\u5927\u6881\u306a\u3057' }
  }

  const jointGirders = girders.map((girder) => {
    const girderSection = findSection(project, girder.sectionId)
    if (girderSection.kind !== GIRDER || !girderPosition(girder.position)) {
      throw new Error(`大梁 member references a non-大梁 section: ${girder.id}`)
    }
    return {
      member: girder,
      section: girderSection,
      end: endAtColumn(girder.position, member.position as ColumnPosition),
    }
  })
  const jointIds = new Set([columnMemberId, ...jointGirders.map(({ member: item }) => item.id)])
  const referenceIds = adjacentColumnIds(project, member)
  for (const { member: girder } of jointGirders) {
    try {
      for (const runMember of girderRun(project, girder).members) {
        if (!jointIds.has(runMember.id)) referenceIds.push(runMember.id)
      }
    } catch (error) {
      if (!(error instanceof MemberUnsupportedError)) throw error
    }
  }

  return {
    status: 'joint',
    joint: {
      columnMemberId,
      column: { member, section, story },
      girders: jointGirders,
      reference: { memberIds: [...new Set(referenceIds)] },
    },
  }
}

export function jointMemberIds(joint: Joint): string[] {
  return [joint.columnMemberId, ...joint.girders.map(({ member }) => member.id)]
}

export function jointRebarMemberIds(project: Project, joint: Joint): string[] {
  const ids = jointMemberIds(joint)
  for (const { member } of joint.girders) {
    try {
      ids.push(girderRun(project, member).ownerId)
    } catch (error) {
      if (!(error instanceof MemberUnsupportedError)) throw error
    }
  }
  return [...new Set(ids)]
}

export function supportColumnIds(
  project: Project,
  girderMemberId: string,
): { start: string | null; end: string | null } {
  const member = project.members.find(({ id }) => id === girderMemberId)
  if (!member || member.kind !== GIRDER || !girderPosition(member.position)) {
    return { start: null, end: null }
  }
  const { position } = member
  const start: ColumnPosition = { ix: position.ix, iy: position.iy }
  const end: ColumnPosition = {
    ix: position.axis === 'X' ? position.ix + 1 : position.ix,
    iy: position.axis === 'Y' ? position.iy + 1 : position.iy,
  }
  return {
    start: columnAt(project, member.storyId, start)?.id ?? null,
    end: columnAt(project, member.storyId, end)?.id ?? null,
  }
}
