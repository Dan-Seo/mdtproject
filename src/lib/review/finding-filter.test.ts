import { describe, expect, expectTypeOf, it } from 'vitest'
import type { FindingKind } from '@/domain/review/types'
import type { BarRef, Finding } from './geometry-check'
import {
  ALL_FINDING_KINDS,
  barMemberRole,
  defaultFindingFilterState,
  extractAvailablePairs,
  filterFindings,
  findingPairKey,
  isFilterActive,
  matchesFindingFilter,
  normalizeRoleGroup,
  type FindingFilterState,
} from './finding-filter'

function makeBarRef(overrides: Partial<BarRef> = {}): BarRef {
  return {
    memberId: 'col-1',
    rebarId: 'reb-1',
    role: '主筋',
    size: 'D25',
    barIndex: 0,
    segmentIndex: 0,
    ...overrides,
  }
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    kind: '干渉候補',
    a: makeBarRef({ memberId: 'col-1', role: '主筋' }),
    b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
    clearanceMm: -5,
    closestPoints: [[0, 0, 0], [0, 0, 0]],
    midpoint: [0, 0, 0],
    basis: { kind: '幾何学的重なり' },
    excludedBy: null,
    ...overrides,
  }
}

describe('finding-filter', () => {
  const memberKinds = new Map<string, string>([
    ['col-1', '柱'],
    ['beam-1', '大梁'],
    ['wall-1', '壁'],
  ])

  describe('1. Compile-time Exhaustiveness & Mapping', () => {
    it('has ALL_FINDING_KINDS matching FindingKind union exhaustively', () => {
      expectTypeOf<(typeof ALL_FINDING_KINDS)[number]>().toEqualTypeOf<FindingKind>()
      expect(ALL_FINDING_KINDS).toHaveLength(3)
      expect(ALL_FINDING_KINDS).toContain('干渉候補')
      expect(ALL_FINDING_KINDS).toContain('あき不足候補')
      expect(ALL_FINDING_KINDS).toContain('接触')
    })
  })

  describe('2. Structural Active State (isFilterActive)', () => {
    it('returns false for default filter state', () => {
      const state = defaultFindingFilterState()
      expect(isFilterActive(state)).toBe(false)
    })

    it('returns true when a kind is deselected even if it has zero occurrences', () => {
      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(['干渉候補', '接触']),
        pairKey: 'all',
        hideExcluded: false,
      }
      expect(isFilterActive(state)).toBe(true)
    })

    it('returns true when pairKey is not "all"', () => {
      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: '柱主筋 × 大梁主筋',
        hideExcluded: false,
      }
      expect(isFilterActive(state)).toBe(true)
    })

    it('returns true when hideExcluded is true', () => {
      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: 'all',
        hideExcluded: true,
      }
      expect(isFilterActive(state)).toBe(true)
    })

    it('returns false when a stale pairKey is reconciled to "all"', () => {
      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: 'stale-non-existent-pair',
        hideExcluded: false,
      }
      const safePairKey = 'all'
      const effectiveFilter = { ...state, pairKey: safePairKey }
      expect(isFilterActive(effectiveFilter)).toBe(false)
    })
  })

  describe('3. Default State Passthrough', () => {
    it('returns the identical array reference in default filter state', () => {
      const findings = [
        makeFinding({ id: 'f1' }),
        makeFinding({ id: 'f2', kind: '接触' }),
      ]
      const result = filterFindings(findings, defaultFindingFilterState(), memberKinds)
      expect(result).toBe(findings)
    })
  })

  describe('4. Role Normalization & Unknown Member Fallback', () => {
    it('normalizes flexural longitudinal roles to 主筋', () => {
      expect(normalizeRoleGroup('上端筋')).toBe('主筋')
      expect(normalizeRoleGroup('下端筋')).toBe('主筋')
      expect(normalizeRoleGroup('上端カットオフ筋')).toBe('主筋')
      expect(normalizeRoleGroup('下端カットオフ筋')).toBe('主筋')
      expect(normalizeRoleGroup('主筋')).toBe('主筋')
    })

    it('preserves distinct roles for 腹筋, 縦筋, 帯筋, あばら筋', () => {
      expect(normalizeRoleGroup('腹筋')).toBe('腹筋')
      expect(normalizeRoleGroup('縦筋')).toBe('縦筋')
      expect(normalizeRoleGroup('帯筋')).toBe('帯筋')
      expect(normalizeRoleGroup('あばら筋')).toBe('あばら筋')
    })

    it('formats barMemberRole correctly for known members', () => {
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'col-1', role: '主筋' }))).toBe('柱主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'col-1', role: '帯筋' }))).toBe('柱帯筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: '上端筋' }))).toBe('大梁主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: '下端筋' }))).toBe('大梁主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: '上端カットオフ筋' }))).toBe('大梁主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: '下端カットオフ筋' }))).toBe('大梁主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: 'あばら筋' }))).toBe('大梁あばら筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'beam-1', role: '腹筋' }))).toBe('大梁腹筋')
    })

    it('falls back to ref.memberId when memberId is missing from memberKinds', () => {
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'unknown-col', role: '主筋' }))).toBe('unknown-col主筋')
      expect(barMemberRole(memberKinds, makeBarRef({ memberId: 'unknown-beam', role: '上端筋' }))).toBe('unknown-beam主筋')
    })
  })

  describe('5. Canonical Pair Key Generation, Symmetry & Deterministic Collation', () => {
    it('guarantees symmetry regardless of a and b ordering', () => {
      const findingAB = makeFinding({
        a: makeBarRef({ memberId: 'col-1', role: '主筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const findingBA = makeFinding({
        a: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
        b: makeBarRef({ memberId: 'col-1', role: '主筋' }),
      })
      const keyAB = findingPairKey(memberKinds, findingAB)
      const keyBA = findingPairKey(memberKinds, findingBA)
      expect(keyAB).toBe(keyBA)
    })

    it('sorts pair members canonically using pinned ja collation', () => {
      const finding = makeFinding({
        a: makeBarRef({ memberId: 'col-1', role: '主筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const expectedPair = ['柱主筋', '大梁主筋'].sort((l, r) => l.localeCompare(r, 'ja')).join(' × ')
      expect(findingPairKey(memberKinds, finding)).toBe(expectedPair)
    })
  })

  describe('6. Available Pairs Extraction', () => {
    it('extracts unique and ja-sorted available pairs', () => {
      const f1 = makeFinding({
        a: makeBarRef({ memberId: 'col-1', role: '主筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const f2 = makeFinding({
        a: makeBarRef({ memberId: 'col-1', role: '帯筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const f3 = makeFinding({
        a: makeBarRef({ memberId: 'beam-1', role: '下端筋' }),
        b: makeBarRef({ memberId: 'col-1', role: '主筋' }),
      }) // Same pair as f1
      const pairs = extractAvailablePairs(memberKinds, [f1, f2, f3])
      expect(pairs).toHaveLength(2)
      const sorted = [...pairs].sort((l, r) => l.localeCompare(r, 'ja'))
      expect(pairs).toEqual(sorted)
    })
  })

  describe('7. Kind Chip Filtering', () => {
    it('filters findings by selected kinds', () => {
      const fClash = makeFinding({ id: 'c1', kind: '干渉候補' })
      const fClearance = makeFinding({ id: 'cl1', kind: 'あき不足候補' })
      const fContact = makeFinding({ id: 'ct1', kind: '接触' })
      const findings = [fClash, fClearance, fContact]

      const clashOnlyState: FindingFilterState = {
        kinds: new Set<FindingKind>(['干渉候補']),
        pairKey: 'all',
        hideExcluded: false,
      }
      expect(filterFindings(findings, clashOnlyState, memberKinds)).toEqual([fClash])

      const emptyKindsState: FindingFilterState = {
        kinds: new Set<FindingKind>(),
        pairKey: 'all',
        hideExcluded: false,
      }
      expect(filterFindings(findings, emptyKindsState, memberKinds)).toEqual([])
    })
  })

  describe('8. Hide Excluded Filtering', () => {
    it('retains only non-excluded findings when hideExcluded is true', () => {
      const f1 = makeFinding({ id: 'f1', excludedBy: null })
      const f2 = makeFinding({ id: 'f2', excludedBy: 'ex-1' })
      const findings = [f1, f2]

      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: 'all',
        hideExcluded: true,
      }
      expect(filterFindings(findings, state, memberKinds)).toEqual([f1])
    })
  })

  describe('9. Pair Key Filtering & Reconciliation', () => {
    it('filters findings by pair key', () => {
      const f1 = makeFinding({
        id: 'f1',
        a: makeBarRef({ memberId: 'col-1', role: '主筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const f2 = makeFinding({
        id: 'f2',
        a: makeBarRef({ memberId: 'col-1', role: '帯筋' }),
        b: makeBarRef({ memberId: 'beam-1', role: '上端筋' }),
      })
      const findings = [f1, f2]
      const pair1 = findingPairKey(memberKinds, f1)

      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: pair1,
        hideExcluded: false,
      }
      expect(filterFindings(findings, state, memberKinds)).toEqual([f1])
    })

    it('uses safePairKey to fall back to "all" without blanking rows when pairKey is absent', () => {
      const f1 = makeFinding({ id: 'f1' })
      const findings = [f1]

      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: 'non-existent-pair',
        hideExcluded: false,
      }
      const safePairKey = 'all'
      expect(filterFindings(findings, state, memberKinds, safePairKey)).toEqual([f1])
    })

    // step2 独立レビュー指摘2 — 照合分岐そのものを固定する。
    // effectivePairKey で 'all' に戻したとき、filterFindings は元の配列参照を返さねばならない。
    // const effectiveFilter = filter へ書き換えると、ここが新しい配列になって落ちる。
    it('returns the original array reference when a stale pairKey is reconciled to "all"', () => {
      const f1 = makeFinding({ id: 'f1' })
      const findings = [f1]
      const state: FindingFilterState = {
        kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
        pairKey: findingPairKey(memberKinds, f1),
        hideExcluded: false,
      }

      expect(filterFindings(findings, state, memberKinds, 'all')).toBe(findings)
    })
  })

  // step2 独立レビュー指摘1 — 述語を直接呼び、既定引数に頼らない経路を固定する。
  describe('matchesFindingFilter (direct)', () => {
    const allKinds = (): FindingFilterState => ({
      kinds: new Set<FindingKind>(ALL_FINDING_KINDS),
      pairKey: 'all',
      hideExcluded: false,
    })

    it('honours the effectivePairKey argument rather than filter.pairKey', () => {
      const finding = makeFinding()
      const realPair = findingPairKey(memberKinds, finding)
      const state: FindingFilterState = { ...allKinds(), pairKey: realPair }

      expect(matchesFindingFilter(finding, state, memberKinds, realPair)).toBe(true)
      expect(matchesFindingFilter(finding, state, memberKinds, 'no-such-pair')).toBe(false)
      expect(matchesFindingFilter(finding, state, memberKinds, 'all')).toBe(true)
    })

    it('rejects a deselected kind and an excluded finding under hideExcluded', () => {
      const finding = makeFinding({ kind: '接触' })
      const withoutContact: FindingFilterState = {
        ...allKinds(),
        kinds: new Set<FindingKind>(['干渉候補', 'あき不足候補']),
      }
      expect(matchesFindingFilter(finding, withoutContact, memberKinds, 'all')).toBe(false)

      const excluded = makeFinding({ excludedBy: 'rule-1' })
      expect(matchesFindingFilter(excluded, allKinds(), memberKinds, 'all')).toBe(true)
      expect(
        matchesFindingFilter(excluded, { ...allKinds(), hideExcluded: true }, memberKinds, 'all'),
      ).toBe(false)
    })
  })
})
