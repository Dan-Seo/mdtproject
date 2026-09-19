import type { FindingKind } from '@/domain/review/types'
import type { RebarRole } from '@/domain/model/rebar'
import type { BarRef, Finding } from './geometry-check'

// Single source of truth: exhaustively checked against FindingKind union.
// Adding or removing a member from FindingKind causes a compile error here.
const KIND_TABLE = {
  干渉候補: true,
  あき不足候補: true,
  接触: true,
} as const satisfies Record<FindingKind, true>

// If tsc rejects it, annotate KIND_TABLE's keys or cast through `as unknown` — an inert repair, not a design change.
export const ALL_FINDING_KINDS: readonly FindingKind[] = Object.keys(
  KIND_TABLE,
) as readonly FindingKind[]

export interface FindingFilterState {
  /** Selected finding kinds to display. Empty set displays no rows. */
  kinds: ReadonlySet<FindingKind>
  /**
   * Member/role pair identifier.
   * 'all' indicates no pair filtering.
   * Otherwise, canonical formatted string (e.g. '柱主筋 × 大梁主筋').
   */
  pairKey: string
  /** When true, findings with excludedBy !== null are omitted. */
  hideExcluded: boolean
}

export function defaultFindingFilterState(): FindingFilterState {
  return {
    kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
    pairKey: 'all',
    hideExcluded: false,
  }
}

/**
 * Structural check for active filters (resolving M1, R2-m6).
 * Does NOT rely on row count comparisons, avoiding false negatives on checks
 * where certain kinds (e.g. 'あき不足候補') have zero occurrences.
 */
export function isFilterActive(filter: FindingFilterState): boolean {
  return (
    filter.pairKey !== 'all' ||
    filter.hideExcluded ||
    filter.kinds.size !== ALL_FINDING_KINDS.length ||
    !ALL_FINDING_KINDS.every((kind) => filter.kinds.has(kind))
  )
}

/**
 * Normalizes a bar's role into its architectural group for joint analysis:
 * Longitudinal flexural reinforcement roles ('上端筋', '下端筋', '上端カットオフ筋', '下端カットオフ筋', '主筋')
 * map to '主筋' (aligning with flexural main steel in roleToLayer in src/lib/viewer/geometry.ts:78-85).
 * Note: '腹筋' (girder side/skin rebar) and '縦筋' (wall vertical rebar) are deliberately NOT folded into '主筋';
 * keeping them distinct preserves actionable diagnostics for web bar clearance.
 */
export function normalizeRoleGroup(role: RebarRole): string {
  switch (role) {
    case '上端筋':
    case '下端筋':
    case '上端カットオフ筋':
    case '下端カットオフ筋':
    case '主筋':
      return '主筋'
    default:
      return role
  }
}

/**
 * Returns the member-kind and role category label for a bar reference,
 * e.g., '柱主筋', '柱帯筋', '大梁主筋', '大梁あばら筋'.
 *
 * Uses memberKinds map for O(1) lookup (B1).
 * Falls back to ref.memberId if member is not found in map (m5, matching ReviewPane.tsx:81).
 */
export function barMemberRole(
  memberKinds: ReadonlyMap<string, string>,
  ref: BarRef,
): string {
  const memberKind = memberKinds.get(ref.memberId) ?? ref.memberId
  return `${memberKind}${normalizeRoleGroup(ref.role)}`
}

/**
 * Generates an unordered, canonically sorted pair key for a finding,
 * guaranteeing symmetry: findingPairKey(memberKinds, a, b) === findingPairKey(memberKinds, b, a).
 * Collator is pinned to 'ja' for deterministic collation across environments (R2-m8).
 * e.g., '柱主筋 × 大梁主筋'.
 */
export function findingPairKey(
  memberKinds: ReadonlyMap<string, string>,
  finding: Finding,
): string {
  const roleA = barMemberRole(memberKinds, finding.a)
  const roleB = barMemberRole(memberKinds, finding.b)
  return [roleA, roleB].sort((left, right) => left.localeCompare(right, 'ja')).join(' × ')
}

/**
 * Extracts all unique member/role pair keys present in the current check findings,
 * sorted with pinned 'ja' collation for stable dropdown options across environments (R2-m8).
 * O(findings) complexity with O(1) member lookup (B1).
 */
export function extractAvailablePairs(
  memberKinds: ReadonlyMap<string, string>,
  findings: readonly Finding[],
): string[] {
  const set = new Set<string>()
  for (const finding of findings) {
    set.add(findingPairKey(memberKinds, finding))
  }
  return Array.from(set).sort((left, right) => left.localeCompare(right, 'ja'))
}

/**
 * Evaluates whether a finding satisfies the active filter criteria.
 * Accepts effectivePairKey (reconciled safe pairKey) to prevent orphaned filters (B2, R2-m6).
 */
export function matchesFindingFilter(
  finding: Finding,
  filter: FindingFilterState,
  memberKinds: ReadonlyMap<string, string>,
  effectivePairKey: string,
): boolean {
  // 1. Kind chip filter
  if (!filter.kinds.has(finding.kind)) {
    return false
  }

  // 2. Hide excluded toggle
  if (filter.hideExcluded && finding.excludedBy !== null) {
    return false
  }

  // 3. Member/role pair selection
  if (effectivePairKey !== 'all') {
    const pair = findingPairKey(memberKinds, finding)
    if (pair !== effectivePairKey) {
      return false
    }
  }

  return true
}

/**
 * Filters the findings array according to the filter state.
 * Returns the original array reference if the filter is in its default state
 * to preserve reference identity and bypass unnecessary allocations.
 */
export function filterFindings(
  findings: readonly Finding[],
  filter: FindingFilterState,
  memberKinds: ReadonlyMap<string, string>,
  effectivePairKey: string = filter.pairKey,
): Finding[] {
  const effectiveFilter = filter.pairKey === effectivePairKey
    ? filter
    : { ...filter, pairKey: effectivePairKey }
  if (!isFilterActive(effectiveFilter)) {
    // If tsc rejects it, annotate or cast through `as unknown` — an inert repair, not a design change.
    return findings as Finding[]
  }
  return findings.filter((finding) =>
    matchesFindingFilter(finding, effectiveFilter, memberKinds, effectivePairKey),
  )
}
