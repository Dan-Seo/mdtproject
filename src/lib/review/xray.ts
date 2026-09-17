import type {
  MemberKind,
  ShearBarSize,
} from '@/domain/model/member'
import {
  findSection,
  memberGroupKey,
  storyNotFound,
  type Project,
} from '@/domain/model/project'
import type {
  Rebar,
  RebarRole,
  RebarShape,
  Vec3,
} from '@/domain/model/rebar'
import {
  quantityLineId,
  ruleIdentity,
  spliceLineId,
  type QuantityLine,
} from '@/domain/quantity'
import { rebarPlacements, roleToLayer } from '@/lib/viewer/geometry'
import { sourceLabel } from '@/lib/rule-source'
import type { RuleHit } from '@/domain/rules/types'

type RuleUseKind = '定着' | '継手' | 'かぶり' | '割付' | '周長' | 'その他'

export interface RuleUse {
  rule: RuleHit
  usedFor: RuleUseKind[]
  identity: string
  sourceLabel: string
}

export interface XRayView {
  member: { id: string; kind: MemberKind; mark: string; storyName: string }
  rebar: { id: string; role: RebarRole; size: ShearBarSize; shape: RebarShape }
  quantity: {
    lineIds: { mass: string | null; splice: string | null }
    designLengthMm: number
    designCount: number
    places: number | null
    spliceCountPerBar: number | null
  }
  shape:
    | {
        drawn: true
        drawnLengthMm: number
        placedCount: number
        positionCount: number | null
        differsFromDesign: { length: boolean; count: boolean }
      }
    | { drawn: false; reason: string }
  formula: string
  rules: RuleUse[]
  zones: {
    kind: '定着'
    ruleKey: string
    fromMm: number
    toMm: number
    lengthMm: number
    rule: RuleHit
  }[]
}

function pointDistance(from: Vec3, to: Vec3): number {
  return Math.hypot(
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  )
}

function drawnLengthMm(rebar: Rebar): number {
  let length = rebar.points
    .slice(1)
    .reduce(
      (total, point, index) => total + pointDistance(rebar.points[index], point),
      0,
    )

  if (rebar.closed && rebar.points.length > 1) {
    length += pointDistance(
      rebar.points[rebar.points.length - 1],
      rebar.points[0],
    )
  }

  if (rebar.hookTails !== undefined && rebar.points.length > 0) {
    length += rebar.hookTails.reduce(
      (total, tail) => total + pointDistance(rebar.points[0], tail),
      0,
    )
  }

  return length
}

function usedFor(key: string): RuleUseKind[] {
  if (key.startsWith('anchorage.')) return ['定着']
  if (key.startsWith('lap.') || key.startsWith('measure.splice.')) {
    return ['継手']
  }
  if (key.startsWith('cover.')) return ['かぶり']
  if (key.startsWith('measure.distribution.')) return ['割付']
  if (
    key.startsWith('measure.hoop.') ||
    key.startsWith('measure.width-tie.')
  ) {
    return ['周長']
  }
  return ['その他']
}

function lineIds(
  project: Project,
  rebar: Rebar,
): { mass: string; splice: string | null } {
  const member = project.members.find(({ id }) => id === rebar.memberId)
  if (!member) throw new Error(`Member not found: ${rebar.memberId}`)
  const groupId = memberGroupKey(project, member)

  return {
    mass: quantityLineId(groupId, rebar),
    splice: rebar.splice ? spliceLineId(groupId, rebar) : null,
  }
}

function shapeView(
  rebar: Rebar,
  section: Parameters<typeof rebarPlacements>[1],
): XRayView['shape'] {
  if (roleToLayer(rebar.role) === 'hidden') {
    return { drawn: false, reason: `${rebar.role} は3D形状なし (ADR-034)` }
  }

  try {
    const placedCount = rebarPlacements(rebar, section).length
    const drawnLength = drawnLengthMm(rebar)
    return {
      drawn: true,
      drawnLengthMm: drawnLength,
      placedCount,
      positionCount: rebar.placement?.positionCount ?? null,
      differsFromDesign: {
        length: drawnLength !== rebar.length,
        count: placedCount !== rebar.count,
      },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { drawn: false, reason: `${rebar.role}: ${reason}` }
  }
}

function zoneViews(rebar: Rebar): XRayView['zones'] {
  return (rebar.zones ?? []).map((zone) => {
    const rule = rebar.ruleHits.find(({ key }) => key === zone.ruleKey)
    if (!rule) {
      throw new Error(`Zone rule not found: ${zone.ruleKey}`)
    }

    return {
      kind: zone.kind,
      ruleKey: zone.ruleKey,
      fromMm: zone.pathFromMm,
      toMm: zone.pathToMm,
      lengthMm: zone.pathToMm - zone.pathFromMm,
      rule,
    }
  })
}

function findLine(lines: QuantityLine[], id: string | null): QuantityLine | null {
  if (id === null) return null
  return lines.find((line) => line.id === id) ?? null
}

export function xrayForRebar(
  rebar: Rebar,
  project: Project,
  lines: QuantityLine[],
): XRayView {
  const member = project.members.find(({ id }) => id === rebar.memberId)
  if (!member) throw new Error(`Member not found: ${rebar.memberId}`)
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) throw storyNotFound(member.storyId)
  const section = findSection(project, member.sectionId)
  const ids = lineIds(project, rebar)
  const massLine = findLine(lines, ids.mass)
  const spliceLine = findLine(lines, ids.splice)

  return {
    member: {
      id: member.id,
      kind: member.kind,
      mark: section.mark,
      storyName: story.name,
    },
    rebar: {
      id: rebar.id,
      role: rebar.role,
      size: rebar.size,
      shape: rebar.shape,
    },
    quantity: {
      lineIds: {
        mass: massLine?.id ?? null,
        splice: spliceLine?.id ?? null,
      },
      designLengthMm: rebar.length,
      designCount: rebar.count,
      places: massLine?.places ?? spliceLine?.places ?? null,
      spliceCountPerBar: rebar.splice?.countPerBar ?? null,
    },
    shape: shapeView(rebar, section),
    formula: rebar.formula,
    rules: rebar.ruleHits.map((rule) => ({
      rule,
      usedFor: usedFor(rule.key),
      identity: ruleIdentity(rule),
      sourceLabel: sourceLabel(rule),
    })),
    zones: zoneViews(rebar),
  }
}

export function xrayForRow(
  rowId: string,
  rebars: Rebar[],
  project: Project,
  lines: QuantityLine[],
): XRayView[] {
  const matched = new Map<string, Rebar>()

  for (const rebar of rebars) {
    const ids = lineIds(project, rebar)
    if (ids.mass !== rowId && ids.splice !== rowId) continue
    if (!matched.has(rebar.memberId)) matched.set(rebar.memberId, rebar)
  }

  return [...matched.values()].map((rebar) =>
    xrayForRebar(rebar, project, lines),
  )
}

export function rebarsUsingRule(rule: RuleHit, rebars: Rebar[]): Rebar[] {
  const identity = ruleIdentity(rule)
  return rebars.filter((rebar) =>
    rebar.ruleHits.some(
      (hit) => hit.value === rule.value && ruleIdentity(hit) === identity,
    ),
  )
}
