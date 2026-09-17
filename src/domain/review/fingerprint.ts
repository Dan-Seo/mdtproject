import type { RuleEntry, RulePack, RuleHit } from '../rules/types'
import { findSection } from '../model/project'
import type { Project } from '../model/project'
import type { Rebar } from '../model/rebar'
import { ruleIdentity } from '../quantity'
import type { CheckExclusion, ClearanceBasis, ReviewFingerprints } from './types'
import { memberDependencies } from './dependency'

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export function hashString(text: string): string {
  // FNV-1a style non-cryptographic fingerprint; this is not a cryptographic hash.
  let first = 0x811c9dc5
  let second = 0x9e3779b1
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x01000193)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

export function rulepackFingerprint(pack: RulePack): string {
  const entries = pack.entries
    .map(({ key, conditions, value, unit, confidence, source }: RuleEntry) => ({
      key,
      conditions,
      value,
      unit,
      confidence,
      source,
    }))
    .sort((left, right) => {
      const byIdentity = ruleIdentity(left as RuleHit).localeCompare(ruleIdentity(right as RuleHit))
      return byIdentity !== 0 ? byIdentity : canonicalJson(left).localeCompare(canonicalJson(right))
    })
  return hashString(canonicalJson(entries))
}

export function checkConditionsFingerprint(settings: {
  clearance: ClearanceBasis | null
}, exclusions: CheckExclusion[]): string {
  const scopes = exclusions
    .map(({ scope }) => scope)
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
  return hashString(canonicalJson({
    clearance: settings.clearance
      ? { valueMm: settings.clearance.valueMm, scope: settings.clearance.scope }
      : null,
    exclusions: scopes,
  }))
}

function gridSpansAround(project: Project, member: Project['members'][number]): unknown {
  if ('axis' in member.position) {
    return {
      axis: member.position.axis,
      spanMm: member.position.axis === 'X'
        ? project.grid.xSpans[member.position.ix]
        : project.grid.ySpans[member.position.iy],
    }
  }
  return {
    x: [project.grid.xSpans[member.position.ix - 1], project.grid.xSpans[member.position.ix]]
      .filter((span): span is number => span !== undefined),
    y: [project.grid.ySpans[member.position.iy - 1], project.grid.ySpans[member.position.iy]]
      .filter((span): span is number => span !== undefined),
  }
}

export function memberInputs(project: Project, memberId: string): unknown {
  const member = project.members.find(({ id }) => id === memberId)
  if (!member) throw new Error(`Member not found: ${memberId}`)
  const section = findSection(project, member.sectionId)
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) throw new Error(`Story not found: ${member.storyId}`)
  const resolution = memberDependencies(project, memberId)
  return {
    member: {
      kind: member.kind,
      storyId: member.storyId,
      position: member.position,
      sectionId: member.sectionId,
      openings: member.openings ?? [],
    },
    section,
    story: { id: story.id, name: story.name, height: story.height },
    gridSpansAround: gridSpansAround(project, member),
    dependencies: resolution.status === 'untracked'
      ? 'untracked'
      : resolution.dependencies.map(({ memberId: dependencyId, via, reads }) => ({
          memberId: dependencyId,
          via,
          reads,
        })),
    missing: resolution.status === 'untracked' ? [] : resolution.missing,
  }
}

export function memberInputFingerprint(project: Project, memberId: string): string {
  return hashString(canonicalJson(memberInputs(project, memberId)))
}

export function memberResultFingerprint(memberId: string, rebars: Rebar[]): string {
  const result = rebars
    .filter((rebar) => rebar.memberId === memberId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rebar) => ({
      id: rebar.id,
      role: rebar.role,
      size: rebar.size,
      shape: rebar.shape,
      points: rebar.points,
      closed: rebar.closed,
      hookTails: rebar.hookTails,
      length: rebar.length,
      count: rebar.count,
      placement: rebar.placement,
      axisOffsetsMm: rebar.axisOffsetsMm,
      axisSlotStart: rebar.axisSlotStart,
      zones: rebar.zones,
      splice: rebar.splice
        ? {
            method: rebar.splice.method,
            countPerBar: rebar.splice.countPerBar,
            lengthMm: rebar.splice.lengthMm,
          }
        : null,
      ruleHits: rebar.ruleHits.map(({ key, conditions, value, unit, confidence }) => ({
        key,
        conditions,
        value,
        unit,
        confidence,
      })),
    }))
  return hashString(canonicalJson(result))
}

export function projectFingerprints(
  project: Project,
  rebars: Rebar[],
  unsupportedMemberIds: ReadonlySet<string>,
  pack: RulePack,
  checkVersion: number,
  checkConditions: string | null,
): ReviewFingerprints {
  return {
    rulepack: rulepackFingerprint(pack),
    checkVersion,
    checkConditions,
    members: Object.fromEntries(
      project.members.map((member) => [
        member.id,
        {
          input: memberInputFingerprint(project, member.id),
          result: unsupportedMemberIds.has(member.id)
            ? null
            : memberResultFingerprint(member.id, rebars),
        },
      ]),
    ),
  }
}
