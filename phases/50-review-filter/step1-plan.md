# Phase 50-1 — Findings Table Filter: Plan (Revised Design Only — Round 3 Revision)

## 1. Exact Component / State Shape & Filter Predicate Location

### 1.1 Architectural Boundary & Separation of Concerns
Following `docs/ADR.md` ADR-049 決定 5 (`docs/ADR.md:1074` — 「검토 UI는 `Project`의 断面·配筋 값을 바꾸지 않는다」) and `CLAUDE.md:24` (「검토 데이터(`src/domain/review`)는 `Project` 밖이며 数量·룰팩을 바꾸지 않는다」), filtering is strictly a **presentational view concern** (`Display-only`). It does not mutate `Project`, `runGeometryCheck`, `CheckResult`, `checkId`, `scope`, or any `verdict` property.

`src/lib/review/geometry-check.ts` (along with `segment-distance.ts`, `joint-layout.ts`, `xray.ts`) already lives in `src/lib/review/`. Placing pure filtering logic and types in a sibling module `src/lib/review/finding-filter.ts` adheres to existing module placement while keeping domain model and components decoupled:
- **Filter Logic & Helper Functions:** `src/lib/review/finding-filter.ts` (pure TypeScript, zero React/DOM imports)
- **Component & View Integration:** `src/components/review/ReviewPane.tsx` (`ReviewCheckSection`)
- **Styles:** `src/components/review/ReviewPane.module.css`

### 1.2 State Shape & Canonical Kinds (`FindingFilterState`)
To maintain a single source of truth across the codebase and guarantee compile-time exhaustiveness (resolving M6, R2-M1, and eliminating R2-m2), `ALL_FINDING_KINDS` is derived as a projection of a typed lookup table using TypeScript's `satisfies Record<FindingKind, true>` idiom (matching `src/components/viewer/palette.ts:5`). Existing `CHECK_KINDS` in `ReviewPane.tsx:77` is replaced by importing `ALL_FINDING_KINDS` (with `kinds: [...ALL_FINDING_KINDS]` at `ReviewPane.tsx:177` to satisfy mutable `FindingKind[]` on `CheckExclusion.scope.kinds`, resolving R3-M1).

```typescript
// src/lib/review/finding-filter.ts
import type { FindingKind } from '@/domain/review/types'

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
```

### 1.3 Pure Filter Predicate & Helper Functions
To satisfy performance constraints under `tests/e2e/uc25-perf.js` (`check_ms <= 3000`, resolving B1), member lookups are decoupled from `project.members.find` scans. All pair functions accept a precomputed `ReadonlyMap<string, string>` (mapping `memberId` to `member.kind`), turning lookups into `O(1)` operations.

#### Rationale for Kind + Role Group Coarse Axis (Addressing R2-M3, R3-m4)
In `formatBarRef` (`src/components/review/ReviewPane.tsx:79-83`), each table row renders specific section marks and raw roles, e.g. `G1 / 上端筋 / D25 / #0` and `C1 / 帯筋 / D13 / #1`. For filtering at a joint (接合部), collapsing to a coarser axis (`大梁主筋 × 柱帯筋`) is deliberately chosen because:
1. **Joint Inspection Scope:** Structural engineers inspect systemic interference across the joint as an architectural assembly (e.g., "Do framing girder main bars clash with column hoops?"). Keying pairs on raw section marks (`G1 / 上端筋 × C1 / 帯筋`, `G2 / 上端筋 × C1 / 帯筋`, etc.) would fragment the filter into dozens of micro-options across framing members, defeating high-level diagnosis.
2. **Longitudinal Flexural Reinforcement Alignment:** In `roleToLayer` (`src/lib/viewer/geometry.ts:78-85`), the five longitudinal flexural roles (`主筋`, `上端筋`, `下端筋`, `上端カットオフ筋`, `下端カットオフ筋`) are grouped under the `'main'` layer. `normalizeRoleGroup` maps these same roles to `'主筋'`.
3. **Deliberate Distinction for `腹筋` and `縦筋`:** While `roleToLayer` (`src/lib/viewer/geometry.ts:91-95`) maps `腹筋` (girder side/skin reinforcement) and `縦筋` (wall vertical reinforcement) to `'main'` for visual layer toggles, `normalizeRoleGroup` deliberately does **not** fold `腹筋` or `縦筋` into `'主筋'`. In joint review, side web reinforcement (`腹筋`) has distinct clearance tolerances and spacing requirements compared to primary bending steel; keeping them distinct (e.g., `大梁腹筋`) preserves actionable diagnostics.
4. **Vocabulary Bridge:** The dropdown option `大梁主筋` represents the category; the table rows display the concrete member instances (e.g. `G1 / 上端筋`, `G2 / 下端筋`). While section marks are user-defined (e.g. `C1`, `G1` in sample projects, or custom marks via `sectionMarkLabel` from `src/domain/model/member.ts:382-386`), the member's structural kind (`柱`, `大梁`) combined with the normalized role group provides an unambiguous category bridge connecting the high-level joint category in the dropdown to the specific member rebar details displayed in each row.

In `src/lib/review/finding-filter.ts`:

```typescript
// src/lib/review/finding-filter.ts
import type { RebarRole } from '@/domain/model/rebar'
import type { BarRef, Finding } from './geometry-check'

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
  effectivePairKey: string = filter.pairKey,
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
```

### 1.4 Component Structure in `ReviewCheckSection`
In `ReviewPane.tsx`, the findings filter, summary, table, and empty notice are encapsulated inside a subcomponent keyed by `result.checkId`: `<ReviewFindingsView key={result.checkId} ... />`.

This design resolves:
1. **B1 & R2-m9 (Performance & Dependency Tightening):** `memberKinds` is memoized on `[project.members]` (not `[project]`) at `ReviewCheckSection` level. Commits to 断面 `b` change `project.sections` while leaving `project.members` array reference unchanged, avoiding unnecessary `O(members)` map rebuilds inside `measureCompare`.
2. **R2-B2 & R3-B1 (Lifting Focus Bookkeeping & Explicit Check Reset):**
   - Focus tracking state (`focusedFindingId`) is lifted out of the remounting subtree and held in `ReviewCheckSection` (`const [focusedFindingId, setFocusedFindingId] = useState<string | null>(null)`).
   - In `runCheck`, when a check produces a new `checkId` (`nextResult.checkId !== result?.checkId`), `setReviewFocus(null)` and `setFocusedFindingId(null)` are called explicitly. This prevents dangling 3D highlights when clearance parameters or joint geometry change, including after tab navigation when `result` was `null` (resolving R3-B1).
   - Inside `ReviewFindingsView`, `focusedFindingId` and `setFocusedFindingId` are received as props. A reactive `useEffect` clears `reviewFocus` and `focusedFindingId` if the focused finding is hidden by filter changes within the current check.
   - **Choice Justification & Cost (Resolving R3-M2):** Lifting focus bookkeeping to the parent (`ReviewCheckSection`) causes `ReviewCheckSection` and `ReviewFindingsView` to re-render when `focusedFindingId` updates on row click. To prevent this state update from re-rendering the entire 698-row table and re-executing unmemoised `formatBarRef` scans on every click, the findings table rows are extracted into `<FindingsTableBody>` wrapped in `memo` (imported from `react`; this codebase has no `React.` namespace usage) (with `focusFinding` wrapped in `useCallback` with stable dependencies). Thus, row clicks update focus bookkeeping and run the reactive filter-cleanup `useEffect` without re-rendering the 698 `<tr>` elements. The cost is passing `focusedFindingId` and `setFocusedFindingId` across the component boundary and wrapping `FindingsTableBody` in `memo`. In `tests/e2e/uc25-perf.js`, `measureCheck` only measures up to the presence of `[data-testid='review-findings']` before any row click occurs, so row clicks do not affect `check_ms`.
3. **R2-B1 (Focus-Safe Reset via `aria-disabled`):**
   - The reset button is unconditionally rendered in the DOM without the HTML `disabled` attribute. Instead, disabled state is expressed via `aria-disabled={!active}`.
   - In `onClick`, if `!active`, the handler early-returns without modifying state.
   - Because `aria-disabled` elements remain focusable in the DOM, clearing the filter via keyboard (Enter/Space) leaves `document.activeElement` firmly on the reset button, completely avoiding the HTML focus fixup rule that blurs `disabled` buttons to `<body>`.
4. **R2-m6 (Consistent Reconciliation between `isFilterActive` and `filterFindings`):**
   - `safePairKey = availablePairs.includes(filter.pairKey) ? filter.pairKey : 'all'` is computed once.
   - An `effectiveFilter` containing `safePairKey` is passed to both `isFilterActive(effectiveFilter)` and `filterFindings(...)`. The active status, reset button state, count display, and row filter never disagree.
5. **M2 & Open Ground 1 & 2 (Accessible Empty State & Single Live Region):**
   - The count summary `<span role="status" aria-live="polite">` is always mounted in the DOM. Screen readers announce count changes (e.g. from 698 to 0) through this single, reliable live region.
   - The empty notice `<p className={styles.emptyNotice} data-testid="review-findings-empty">` is rendered outside the table whenever `filteredFindings.length === 0` (covering both empty filter matches and empty check results like `未対象`). It does **not** carry `role="status"`, eliminating dual announcements and inserted live region unreliability in NVDA/JAWS.
6. **R2-m10 (DOM Node Lifecycles on Re-check):**
   - When a check produces a new `checkId`, `<ReviewFindingsView>` unmounts and remounts, destroying previous `<tr>` elements. Because triggering `検査を実行` requires moving user focus to the check button (outside `ReviewFindingsView`), DOM focus is already on that button and is not dropped to `<body>`. Any active 3D review focus is explicitly reset by `runCheck`.
7. **Keyboard Order & Tab Order:**
   - Elements appear in logical linear tab order: kind chips (3 stops) -> pair select (1 stop) -> hide excluded checkbox (1 stop) -> reset button (1 stop) -> table rows (`tr[tabIndex=0]`).

```tsx
// Inside ReviewCheckSection in src/components/review/ReviewPane.tsx:
const memberKinds = useMemo(
  () => new Map(project.members.map((m) => [m.id, m.kind])),
  [project.members], // R2-m9: Tighter memoization on members array reference
)

// Focus bookkeeping lifted to parent (R2-B2)
const [focusedFindingId, setFocusedFindingId] = useState<string | null>(null)

const runCheck = () => {
  if (joint === null) return
  const nextResult = geometryCheck.runGeometryCheck({
    project,
    rebars: currentSnapshot.rebars,
    unsupportedMemberIds: currentSnapshot.unsupportedMemberIds,
    joint,
    settings: review.settings,
    exclusions: review.exclusions,
    fingerprints: current.fingerprints,
  })
  // Explicitly clear focus when a new checkId is produced (R2-B2, R3-B1)
  if (nextResult.checkId !== result?.checkId) {
    setReviewFocus(null)
    setFocusedFindingId(null)
  }
  setResult(nextResult)
}

// Inside ReviewCheckSection JSX:
{result !== null && (
  <div>
    <p data-testid="review-check-id">{t(locale, 'review.check.checkId')}: {result.checkId}</p>
    ... (verdict, unchecked, scope, tolerance unchanged) ...
    <ReviewFindingsView
      key={result.checkId}
      result={result}
      project={project}
      memberKinds={memberKinds}
      layout={layout}
      locale={locale}
      review={review}
      focusedFindingId={focusedFindingId}
      setFocusedFindingId={setFocusedFindingId}
      onCreateItem={onCreateItem}
      setReviewFocus={setReviewFocus}
      setViewerMode={setViewerMode}
    />
  </div>
)}
```

```tsx
// Helper Subcomponents inside src/components/review/ReviewPane.tsx:
interface ReviewFindingsViewProps {
  result: geometryCheck.CheckResult
  project: TakeoffSnapshot['project']
  memberKinds: ReadonlyMap<string, string>
  layout: JointLayout | null
  locale: Locale
  review: ReviewState
  focusedFindingId: string | null
  setFocusedFindingId: (id: string | null) => void
  onCreateItem: (finding: geometryCheck.Finding, checkId?: string, jointColumnMemberId?: string) => void
  setReviewFocus: (focus: AppState['reviewFocus']) => void
  setViewerMode: (mode: ViewerMode) => void
}

interface FindingsTableBodyProps {
  findings: readonly geometryCheck.Finding[]
  project: TakeoffSnapshot['project']
  review: ReviewState
  locale: Locale
  checkId: string
  jointColumnMemberId: string | undefined
  onCreateItem: (finding: geometryCheck.Finding, checkId?: string, jointColumnMemberId?: string) => void
  onFocus: (finding: geometryCheck.Finding) => void
}

const FindingsTableBody = memo(function FindingsTableBody({
  findings,
  project,
  review,
  locale,
  checkId,
  jointColumnMemberId,
  onCreateItem,
  onFocus,
}: FindingsTableBodyProps) {
  return (
    <tbody>
      {findings.map((finding) => {
        const exclusion = finding.excludedBy === null
          ? null
          : review.exclusions.find(({ id }) => id === finding.excludedBy)
        return (
          <tr
            key={finding.id}
            tabIndex={0}
            onClick={() => onFocus(finding)}
            onKeyDown={(event) => { if (event.key === 'Enter') onFocus(finding) }}
          >
            <td>{finding.kind}</td>
            <td>{formatBarRef(project, finding.a)}</td>
            <td>{formatBarRef(project, finding.b)}</td>
            <td>{finding.clearanceMm.toFixed(1)}</td>
            <td>{basisText(finding)}</td>
            <td>{exclusion === null || exclusion === undefined ? null : <span className={styles.excluded}>{t(locale, 'review.check.excluded')}: {exclusion.reason}</span>}</td>
            <td><button type="button" onClick={() => onCreateItem(finding, checkId, jointColumnMemberId)}>{t(locale, 'review.check.createItem')}</button></td>
          </tr>
        )
      })}
    </tbody>
  )
})

function ReviewFindingsView({
  result,
  project,
  memberKinds,
  layout,
  locale,
  review,
  focusedFindingId,
  setFocusedFindingId,
  onCreateItem,
  setReviewFocus,
  setViewerMode,
}: ReviewFindingsViewProps) {
  const [filter, setFilter] = useState<FindingFilterState>(defaultFindingFilterState)

  const availablePairs = useMemo(
    () => extractAvailablePairs(memberKinds, result.findings),
    [memberKinds, result.findings],
  )

  // Reconciliation: safePairKey computed once and shared with isFilterActive (R2-m6)
  const safePairKey = availablePairs.includes(filter.pairKey) ? filter.pairKey : 'all'
  const effectiveFilter = useMemo(
    () => (filter.pairKey === safePairKey ? filter : { ...filter, pairKey: safePairKey }),
    [filter, safePairKey],
  )
  const active = isFilterActive(effectiveFilter)

  const filteredFindings = useMemo(
    () => filterFindings(result.findings, effectiveFilter, memberKinds, safePairKey),
    [result.findings, effectiveFilter, memberKinds, safePairKey],
  )

  // Clean up reviewFocus if the focused finding is hidden by filter changes (M4, R2-B2)
  useEffect(() => {
    if (focusedFindingId !== null && !filteredFindings.some((f) => f.id === focusedFindingId)) {
      setReviewFocus(null)
      setFocusedFindingId(null)
    }
  }, [filteredFindings, focusedFindingId, setReviewFocus, setFocusedFindingId])

  // Memoized row focus handler: stable callback avoids re-rendering FindingsTableBody on row click (R3-M2)
  const focusFinding = useCallback(
    (finding: geometryCheck.Finding) => {
      if (layout === null) return
      const a = segmentFor(layout, finding.a)
      const b = segmentFor(layout, finding.b)
      if (a === null || b === null) return
      const [pa, pb] = finding.closestPoints
      setFocusedFindingId(finding.id)
      setReviewFocus({
        point: [
          (pa[0] + pb[0]) / 2,
          (pa[1] + pb[1]) / 2,
          (pa[2] + pb[2]) / 2,
        ],
        segments: [a, b],
        label: `${finding.kind}: ${formatBarRef(project, finding.a)} × ${formatBarRef(project, finding.b)}`,
      })
      setViewerMode('joint')
    },
    [layout, project, setFocusedFindingId, setReviewFocus, setViewerMode],
  )

  return (
    <>
      <div
        className={styles.findingsFilterBar}
        data-testid="review-findings-filter"
      >
        {/* 1. Kind Chips */}
        <div
          role="group"
          aria-label={t(locale, 'review.check.filter.kind')}
          className={styles.filterChips}
        >
          {ALL_FINDING_KINDS.map((kind) => {
            const pressed = filter.kinds.has(kind)
            return (
              <button
                key={kind}
                type="button"
                className={`${styles.filterChip} ${pressed ? styles.filterChipActive : ''}`}
                aria-pressed={pressed}
                onClick={() => {
                  setFilter((prev) => {
                    const nextKinds = new Set(prev.kinds)
                    if (nextKinds.has(kind)) {
                      nextKinds.delete(kind)
                    } else {
                      nextKinds.add(kind)
                    }
                    return { ...prev, kinds: nextKinds }
                  })
                }}
              >
                {kind}
              </button>
            )
          })}
        </div>

        {/* 2. Member / Role Pair Select */}
        <label className={styles.filterPairLabel}>
          {t(locale, 'review.check.filter.pair')}
          <select
            aria-label={t(locale, 'review.check.filter.pair')}
            value={safePairKey}
            onChange={(e) => setFilter((prev) => ({ ...prev, pairKey: e.target.value }))}
          >
            <option value="all">{t(locale, 'review.check.filter.pair.all')}</option>
            {availablePairs.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </label>

        {/* 3. Hide Excluded Toggle */}
        <label className={styles.filterCheckboxLabel}>
          <input
            type="checkbox"
            checked={filter.hideExcluded}
            onChange={(e) => setFilter((prev) => ({ ...prev, hideExcluded: e.target.checked }))}
          />
          {t(locale, 'review.check.filter.hideExcluded')}
        </label>

        {/* Count display & focus-safe reset button (R2-B1, M1, M3) */}
        <div className={styles.filterSummary}>
          <span role="status" aria-live="polite">
            {filteredFindings.length} / {result.findings.length}
            {t(locale, 'review.check.filter.itemsUnit')}
          </span>
          <button
            type="button"
            className={styles.filterResetButton}
            aria-disabled={!active}
            onClick={() => {
              if (!active) return
              setFilter(defaultFindingFilterState())
            }}
          >
            {t(locale, 'review.check.filter.reset')}
          </button>
        </div>
      </div>

      {/* Findings Table untouched testid and container */}
      <table className={styles.table} data-testid="review-findings">
        <caption>{t(locale, 'review.check.findings')}</caption>
        <FindingsTableBody
          findings={filteredFindings}
          project={project}
          review={review}
          locale={locale}
          checkId={result.checkId}
          jointColumnMemberId={result.jointRef.columnMemberId}
          onCreateItem={onCreateItem}
          onFocus={focusFinding}
        />
      </table>

      {/* Empty State outside review-findings table (M2, open ground 1 & 2) */}
      {filteredFindings.length === 0 && (
        <p className={styles.emptyNotice} data-testid="review-findings-empty">
          {t(locale, 'review.check.filter.empty')}
        </p>
      )}
    </>
  )
}
```

---

## 2. Files to be Touched & Changes in Each

1. **`src/lib/review/finding-filter.ts` (NEW)**
   - Define and export `FindingFilterState`, `ALL_FINDING_KINDS`, `defaultFindingFilterState`, `isFilterActive`.
   - Implement compile-time exhaustiveness projection `KIND_TABLE satisfies Record<FindingKind, true>` (R2-M1).
   - Implement pure functions accepting `memberKinds` map: `normalizeRoleGroup`, `barMemberRole`, `findingPairKey`, `extractAvailablePairs`, `matchesFindingFilter`, `filterFindings`.
   - Pin collation to `'ja'` in `findingPairKey` and `extractAvailablePairs` (R2-m8).
   - Zero React/DOM imports.

2. **`src/lib/review/finding-filter.test.ts` (NEW)**
   - Pure unit tests covering:
     - Compile-time exhaustiveness of `ALL_FINDING_KINDS` against `FindingKind`.
     - Default passthrough reference identity (`filterFindings(findings, defaultState, map) === findings`).
     - Structural filter active predicate (`isFilterActive`).
     - `barMemberRole` role grouping (`上端筋` / `下端筋` -> `主筋`) and unknown member fallback (m5).
     - Canonical pair key generation, symmetry (`a × b === b × a`), and deterministic Japanese collation (R2-m8).
     - `extractAvailablePairs` uniqueness and sorting with `memberKinds` map.
     - Kind filtering (single, multiple, empty set returning `[]`).
     - Hide excluded filtering (`excludedBy !== null`).
     - Pair key filtering and safe fallback when key is absent (`safePairKey`).

3. **`src/components/review/ReviewPane.tsx` (MODIFIED)**
   - Extend the `react` import at `ReviewPane.tsx:3` with `memo` and `useCallback`; add `import type { ReviewState } from '@/domain/review/types'`, `JointLayout` from `@/lib/review/joint-layout`, and `Locale, ViewerMode, AppState` from `@/lib/store`.
   - Import `ALL_FINDING_KINDS`, `defaultFindingFilterState`, `extractAvailablePairs`, `filterFindings`, `FindingFilterState`, `isFilterActive` from `@/lib/review/finding-filter`.
   - Remove local `const CHECK_KINDS` in `ReviewPane.tsx:77`; replace usage at `ReviewPane.tsx:177` with `kinds: [...ALL_FINDING_KINDS]` (copying into a mutable array to satisfy `CheckExclusion.scope.kinds: FindingKind[]` while keeping `ALL_FINDING_KINDS` typed as `readonly FindingKind[]`, resolving R3-M1).
   - Compute `memberKinds` Map via `useMemo` on `[project.members]` at `ReviewCheckSection` level (R2-m9).
   - Lift `focusedFindingId` state to `ReviewCheckSection`; explicitly clear `reviewFocus` and `focusedFindingId` in `runCheck` when `nextResult.checkId !== result?.checkId` (resolving R2-B2, R3-B1).
   - Extract `ReviewFindingsView` subcomponent keyed on `result.checkId`, with row rendering in memoised `FindingsTableBody` (`memo`) and `focusFinding` wrapped in `useCallback` to eliminate re-rendering 698 rows on row focus click (resolving R3-M2).
   - Render filter bar preceding `<table data-testid="review-findings">`.
   - Render reset button with `aria-disabled={!active}` keeping focus on keyboard activation (R2-B1).
   - Render `<p data-testid="review-findings-empty">` after the table when `filteredFindings.length === 0` without `role="status"` (open ground 1 & 2).
   - Track `focusedFindingId` and clear both `reviewFocus` and `focusedFindingId` if the focused finding is filtered out within the same check (M4).

4. **`src/components/review/ReviewPane.module.css` (MODIFIED)**
   - Add styles for `.findingsFilterBar`, `.filterChips`, `.filterChip`, `.filterChipActive`, `.filterPairLabel`, `.filterCheckboxLabel`, `.filterSummary`, `.filterResetButton`, `.emptyNotice`.
   - Style `.filterResetButton[aria-disabled='true']` with opacity and `cursor: not-allowed` without DOM focus loss (R2-B1).

5. **`src/locales/ja.json` (MODIFIED)**
   - Add 7 new i18n keys under `"review.check.filter.*"` (R2-m1: dropped unused `.title`).

6. **`src/locales/ko.json` (MODIFIED)**
   - Add matching Korean translations for all 7 keys.
   - Satisfies `src/lib/i18n.test.ts:19` parity test.

7. **`src/components/review/ReviewPane.test.tsx` (MODIFIED)**
   - Add unit and component tests verifying:
     - Default all-selected / all-visible state renders full row count dynamically derived from `directGeometryCheck().findings.length` (R2-m3).
     - Kind chips filtering and structural reset button state (M1).
     - Reset button preserves focus using `aria-disabled` and is not HTML-disabled (R2-B1, R3-m1).
     - Re-running check resets pair select to `'all'` and clears 3D `reviewFocus` (R2-B2, R3-B1, R3-m5).
     - Same-input check re-run preserves filter state under identical `checkId` (R2-m5).
     - Empty state rendered outside table without `role="status"` (M2, open ground 1 & 2).
     - Default exclusions remain visible by default (`hideExcluded` defaults to `false`, open ground 3).
     - `reviewFocus` cleanup when focused row is hidden by filter (M4, R3-m6).
     - Row actions under an active filter targeting the correct finding and item id (M5, R3-m3).

---

## 3. Full List of New i18n Keys and Text

UI chrome strings go through `t(locale, ...)`. Domain terms (`干渉候補`, `あき不足候補`, `接触`, `柱`, `大梁`, `主筋`) are preserved in original Japanese as mandated by `CLAUDE.md:20` (`i18n.test.ts:50-57` tests `domain.*` translation keys; `FindingKind` values are typed union literals rendered raw, R2-m12).

Total 7 new keys (dropped orphaned `review.check.filter.title`, R2-m1):

| Key | Japanese (`ja.json`) | Korean (`ko.json`) | Usage |
| :--- | :--- | :--- | :--- |
| `review.check.filter.kind` | `指摘区分` | `지적 구분` | `aria-label` on kind chips button group |
| `review.check.filter.pair` | `部材・役割ペア` | `부재・역할 페어` | Label for pair select dropdown |
| `review.check.filter.pair.all` | `すべてのペア` | `모든 페어` | First option in pair dropdown |
| `review.check.filter.hideExcluded` | `除外された指摘を非表示` | `제외된 지적 숨기기` | Label for hide excluded checkbox |
| `review.check.filter.itemsUnit` | `件` | `건` | Unit suffix in count display |
| `review.check.filter.reset` | `フィルターを解除` | `필터 초기화` | Button text to reset filters |
| `review.check.filter.empty` | `該当する指摘はありません` | `해당하는 지적이 없습니다` | Status text when filtered rows are 0 (M2) |

---

## 4. How the Default-Unfiltered Guarantee is Enforced

The falsification review explicitly confirmed that the default-unfiltered guarantee holds under the following mechanisms:

1. **Default State Initialization:**
   `defaultFindingFilterState()` initializes with:
   - `kinds`: `new Set(ALL_FINDING_KINDS)` (all 3 kinds included)
   - `pairKey`: `'all'` (all pairs included)
   - `hideExcluded`: `false` (excluded findings are visible, matching existing default exclusion display tested in `ReviewPane.test.tsx:189-201`)

2. **Array Passthrough & Reference Identity:**
   `filterFindings` bypasses allocation and returns the exact array reference whenever `!isFilterActive(effectiveFilter)`.
   In the default state, `filteredFindings === result.findings`. Row count, row order, element references, and child DOM nodes remain 100% identical.

3. **Preservation of `[data-testid='review-findings']` DOM Boundary:**
   - `<table className={styles.table} data-testid="review-findings">` retains its exact tag and `data-testid`.
   - The filter bar `<div data-testid="review-findings-filter">` is placed **outside and above** the table.
   - The empty notification `<p data-testid="review-findings-empty">` is placed **outside and below** the table.
   - Neither element is inside `caption`, `thead`, or `tbody`.
   - Therefore, `document.querySelector("[data-testid='review-findings']").textContent` reads only `caption` + `tbody tr`, preserving byte-identical findings snapshots in E2E Scenario 7 (`stableResult.findings === findings1`).

4. **Label Safety:**
   No filter element carries `aria-label='範囲'`, avoiding collision with `tests/e2e/uc25-joint-review.js:784-787`.

5. **Button Text Safety:**
   The new button texts (`干渉候補`, `あき不足候補`, `接触`, `フィルターを解除`) contain none of the substrings used by Playwright `:has-text()` selectors (`検査を実行`, `検討項目にする`, `確認`, `確認を保存`, `追加`).

6. **Reset and Invariance Rules across Check Runs (Resolving R2-m5, R3-B1, Round 3 Path b):**
   - **New Check Run with Parameter / Model Changes (`checkId` Changes):** When `runCheck` produces a new `checkId` (`nextResult.checkId !== result?.checkId`), `<ReviewFindingsView key={result.checkId}>` remounts with `defaultFindingFilterState()`, and `runCheck` explicitly clears `setReviewFocus(null)` and `setFocusedFindingId(null)`. This guarantees focus is reset even after tab navigation when `result` was `null` (resolving R3-B1).
   - **Same-Input Re-run (`checkId` Unchanged):** Re-running `検査を実行` with identical inputs returns the same content hash (`checkId2 === checkId1`, as asserted in `tests/e2e/uc25-joint-review.js:924`). The key does not change, React preserves the existing mounted instance, and active filter selections persist.
   - **Tab Navigation (Scenario 7 Remount):** When switching tabs away from `検討` to `内訳書` and back (`tests/e2e/uc25-joint-review.js:908-918`), `ReviewPane` unmounts entirely and `result` resets to `null`. Clicking `検査を実行` mounts `<ReviewFindingsView>` afresh in default state. Global store state `reviewFocus` is deliberately preserved across tab navigation (matching existing behaviour, where 3D inspection remains active while navigating panes), until explicitly cleared by `runCheck` on a new check or by project reload (`src/lib/store.ts:189`).

---

## 5. Existing Assertions Constraining the Design

### 5.1 `tests/e2e/uc25-joint-review.js`
- **Lines 106–112 & 124–130 (`parseFindingRow` & `parseFindingRows`, R2-m11 citation fix):**
  ```javascript
  106: const parseFindingRow = (cells) => {
  107:   if (!Array.isArray(cells) || cells.length < 6) return null;
  ...
  124: const parseFindingRows = (rawRows) => rawRows.map((rawRow) => {
  125:   const row = parseFindingRow(rawRow.cells);
  126:   if (row === null) {
  127:     throw new Error(`UC25 malformed finding row ${rawRow.index}`);
  ```
  *Constraint:* `parseFindingRow` requires every `tbody tr` to have at least 6 cells. No placeholder row (e.g. `<tr colSpan={7}>該当なし</tr>`) may enter `tbody`. Empty state must be an external sibling element (M2).

- **Lines 248–255 (`readCheckResult`):**
  Reads `checkId`, `findings` (textContent of `[data-testid='review-findings']`), `verdicts`, and `unchecked`. Filter controls must remain outside `review-findings`.

- **Lines 257–263 (`readFindingRows`):**
  Reads rows from `[data-testid='review-findings'] tbody tr`.

- **Lines 760–773 (Scenario 4 Initial Geometry Check):**
  Asserts verdicts, unchecked items, and findings in default check without clearance basis. Must not hide any findings by default.

- **Lines 776–780 (Scenario 4 Row Count Observation):**
  Records `observations.initialFindingRowCount = initialRows.length` (698 rows in sample project).

- **Lines 784–787 (Scenario 5 Clearance Scope Control Uniqueness):**
  Asserts exactly one `input[aria-label='範囲']` exists. No new control may use this label.

- **Lines 815–829 (Scenario 5 Clearance Oracle on `lowRows` and `highRows`):**
  High clearance run asserts `C1 / 帯筋 / D13 / #0` & `#1` (`あき不足候補`) are present in `tbody tr`.

- **Line 886 (Scenario 6 Finding Focus on First Row):**
  Clicks first row, asserts `[data-review-focus='1']`. Row 0 ordering must remain untouched in default state.

- **Lines 920–933 (Scenario 7 Stability Invariance after Viewer Pose):**
  Requires `value.findings === findings1` byte-identity after viewer perturbation and remount.

### 5.2 `tests/e2e/uc25-perf.js` (BLOCKER B1 & R2-M2 Constraints)
`tests/e2e/uc25-perf.js` enforces strict execution budgets on both the sample project and the 5-storey stress fixture:
- **Lines 31–36 (`BUDGET_MS`):**
  ```javascript
  const BUDGET_MS = {
    joint_tab_ms: 1500,
    check_ms: 3000,
    compare_ms: 3000,
    tab_switch_ms: 500,
  };
  ```
- **Lines 127–136 (`measureCheck`):**
  Measures elapsed time from clicking `検査を実行` until `[data-testid='review-findings']` is present in DOM.
- **Lines 253–255 (`budgetMet`, R2-m11 citation fix):**
  ```javascript
  const budgetMet = Object.keys(BUDGET_MS).every(
    (key) => sample[key] <= BUDGET_MS[key] && stress5[key] <= BUDGET_MS[key],
  );
  ```
- **Pre-Change Recorded Baselines (`phases/48-joint-review-ui/step9-report.json`, R2-M2, R3-M3):**
  - `sample.check_ms`: **96 ms** (`#/perf_browser/sample/check_ms`), median of raw samples `[70, 231, 96]` (`#/perf_browser/raw_samples/sample/check`, warmup 88 discarded). Notice the 231 ms sample inside this run (2.406× median).
  - `stress5.check_ms`: **551 ms** (`#/perf_browser/stress5/check_ms`), median of raw samples `[230, 551, 572]` (`#/perf_browser/raw_samples/stress5/check`, warmup 397 discarded).
  - Measured under conditions at `#/perf_browser/conditions` (production build `npm run build; npx next start -p 3000`, headless chromium 145, viewport 1440x900, median of 3 on Windows 11 desktop host).
  - Note: `#/perf_browser/spread_note` records known marginal measurements on individual samples (`compare_ms` at 3034 ms vs 3000 ms; `tab_switch_ms` at 765 ms vs 500 ms).
  - *Threshold Widening Arithmetic (resolving R3-M3):* A 3-sample median drawn from samples containing a 2.4× intra-run outlier (231 ms) can exceed a strict 2× baseline threshold (192 ms) purely through OS/browser scheduling noise with zero code regression. To accommodate this observed variance:
    - `sample.check_ms`: Fail if > 350 ms (3.65× baseline median, providing headroom above the 231 ms observed sample for multi-sample median jitter while remaining far below the 3000 ms budget).
    - `stress5.check_ms`: Fail if > 1200 ms (2.18× baseline median, providing headroom above the 572 ms observed sample while remaining far below the 3000 ms budget).
    - *Validity Condition:* Absolute comparison against these figures is valid only on a host comparable to `#/perf_browser/conditions`. On different hosts or CI runners, comparison must be made relative to a freshly re-measured pre-change baseline on the same machine in the same session.
- *Constraint:* `check_ms` must remain `<= 3000ms` and `budget_met === true`. Using precomputed `memberKinds` map (`O(members)`) constructed in `ReviewCheckSection` keeps work inside `measureCheck` strictly `O(findings)`.

### 5.3 `src/components/review/ReviewPane.test.tsx`
- **Line 167:** `expect(findings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)` (Oracle pattern for finding row count; tests must derive from `expected.findings.length`, not hardcode 698, R2-m3).
- **Lines 189–201:** `adds default exclusions without removing excluded findings` verifies excluded findings remain in table with `除外:` badge. `hideExcluded` must default to `false` (open ground 3).
- **Line 209:** Focus finding row targets `expected.findings[0]`.
- **Line 829 (R2-m3):** Explanatory comment (`// 検査を実行して 698 件の所見表を描き、そのうえで項目を作り直す分だけ重い。`) documenting 698 rows and explaining the 20000ms timeout on line 831.

### 5.4 `phases/48-joint-review-ui/step8-report.json` (m2 / R2-m4 citation)
- `#/original_failure/observed_table/kinds`: `{"干渉候補": 106, "接触": 592}` (archived pre-fix failure observation documented in `phases/48-joint-review-ui/step8-correction.md`; total 698 findings on initial check without clearance basis).

---

## 6. Test Plan

### 6.1 Pure Unit Tests (`src/lib/review/finding-filter.test.ts`)
1. **Compile-time Exhaustiveness & Mapping (R2-M1, R3-m2):**
   - Compile-time exhaustiveness: `KIND_TABLE satisfies Record<FindingKind, true>` is strictly enforced by `tsc` / `npm run build`. Adding a new member to `FindingKind` (`src/domain/review/types.ts:48`) without updating `KIND_TABLE` produces a TypeScript diagnostic and fails the build. Can be type-tested via `expectTypeOf<keyof typeof KIND_TABLE>().toEqualTypeOf<FindingKind>()`.
   - Runtime unit tests verify:
     - `ALL_FINDING_KINDS` derives directly from `Object.keys(KIND_TABLE)` and has length 3.
     - `ALL_FINDING_KINDS` contains `'干渉候補'`, `'あき不足候補'`, and `'接触'`.
2. **Structural Active State (`isFilterActive` — M1, R2-m6):**
   - Default state returns `false`.
   - Deselecting `あき不足候補` returns `true` even when findings have 0 occurrences.
   - Changing `pairKey !== 'all'` returns `true`.
   - Enabling `hideExcluded = true` returns `true`.
   - Stale pairKey reconciled to `'all'` returns `false` if kinds and hideExcluded are default.
3. **Default State Passthrough:**
   - Verify `filterFindings(findings, defaultFindingFilterState(), memberKinds)` returns the identical array reference.
4. **Role Normalization & Unknown Member Fallback (m5):**
   - Verify `barMemberRole` returns:
     - `柱主筋` for column `主筋`
     - `柱帯筋` for column `帯筋`
     - `大梁主筋` for girder flexural steel (`上端筋`, `下端筋`, `上端カットオフ筋`, `下端カットオフ筋`)
     - `大梁あばら筋` for girder `あばら筋`
     - `大梁腹筋` for girder `腹筋` (distinct from `主筋`, R2-M3)
   - Verify fallback: if `ref.memberId` is not in `memberKinds`, returns `${ref.memberId}${normalizeRoleGroup(ref.role)}`.
5. **Canonical Pair Key Generation, Symmetry & Deterministic Collation (R2-m8):**
   - Verify `findingPairKey(memberKinds, a, b) === findingPairKey(memberKinds, b, a)`.
   - Verify pair key sorting uses pinned Japanese collation (`localeCompare(right, 'ja')`).
6. **Available Pairs Extraction:**
   - Verify `extractAvailablePairs(memberKinds, findings)` returns sorted unique pair strings in `O(findings)` operations.
7. **Kind Chip Filtering:**
   - Filtering with `kinds = new Set(['干渉候補'])` retains only `干渉候補`.
   - Filtering with empty `kinds = new Set()` returns `[]`.
8. **Hide Excluded Filtering:**
   - `hideExcluded = true` retains only findings where `excludedBy === null`.
9. **Pair Key Filtering & Reconciliation (B2, R2-m6):**
   - Filtering with an active `pairKey` retains matching pairs.
   - If `pairKey` is not present in `availablePairs`, `safePairKey` evaluates to `'all'` without blanking rows.

### 6.2 Component Tests (`src/components/review/ReviewPane.test.tsx`)
1. **Default Rendering (R2-m3, open ground 3):**
   - Run geometry check.
   - Verify `review-findings-filter` renders above `review-findings`.
   - Verify kind chips have `aria-pressed="true"`.
   - Verify table row count equals `directGeometryCheck().findings.length` (dynamic oracle, not hardcoded 698).
   - Verify `hideExcluded` checkbox defaults to unchecked (`checked === false`).
   - Verify reset button has `aria-disabled="true"` and `disabled === false`.
2. **Focus-Safe Reset Button & Chips Interaction (R2-B1, M1, M3, R3-m1):**
   - Initial state: reset button has `aria-disabled="true"`.
   - Click `あき不足候補` chip -> `aria-pressed` becomes `"false"`. Row count unchanged (0 occurrences in initial check).
   - Verify reset button becomes `aria-disabled="false"` (structural check M1 succeeds).
   - Keyboard activate reset button:
     - Focus the reset button: `resetButton.focus()`.
     - Verify `document.activeElement === resetButton`.
     - Trigger activation: `fireEvent.click(resetButton)`. (jsdom does not synthesize a click from a `keyDown`; the reset button intentionally has no `onKeyDown`, because a native `<button>` is activated by Enter/Space in a real browser.)
     - Verify `resetButton.getAttribute('aria-disabled')` is `"true"`.
     - Verify `resetButton.disabled === false` (not HTML-disabled, preventing browser focus fixup).
     - Verify `document.activeElement === resetButton` (regression guard confirming handler does not blur or displace focus).
     - Verify clicking reset button while `aria-disabled="true"` is a no-op.
   - **What makes this test FAIL on the broken design:**
     - The broken design set HTML `disabled={!active}` without `aria-disabled`. Asserting `expect(resetButton).not.toBeDisabled()` and `expect(resetButton).toHaveAttribute('aria-disabled', 'true')` directly fails on the broken implementation in both default and post-activation states.
     - Note on `document.activeElement` in jsdom: jsdom does not implement the browser HTML focus fixup rule (which blurs disabled elements to `<body>`). Therefore, the activeElement check acts as a regression guard for the handler, while real-browser focus-fixup prevention is established structurally by the absence of the `disabled` attribute (verified by `not.toBeDisabled()`).
3. **Re-run Check Resets Filter State and Clears 3D Focus (BLOCKER B2, R2-B2, R3-B1, R3-m5):**
   - Run initial check. Dynamically select the first non-'all' pair from `select` options: select `select.options[1].value` (the first entry after `すべてのペア`, corresponding to `availablePairs[0]`).
   - Assert `select.options[1].value !== 'all'`, then assert `select.value === select.options[1].value`.
   - Click a finding row to focus it (`useAppStore.getState().reviewFocus !== null`).
   - Enter a clearance basis (26mm) and click `検査を実行` (producing new `checkId`).
   - **Genuinely falsifying assertion for R2-B2 focus reset:**
     - `expect(useAppStore.getState().reviewFocus).toBeNull()`: verifies 3D highlight is cleared when a new `checkId` is produced (`nextResult.checkId !== result?.checkId`).
   - **Invariance / state reset assertions:**
     - `expect(select.value).toBe('all')`: verifies dropdown reset to `すべてのペア` on checkId change (via component remount).
     - Table renders all findings from the new check (`expect(findings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)`).
   - **What makes this test FAIL on the broken design:** In the broken design, `focusedFindingId` reset to `null` inside `ReviewFindingsView` on remount without clearing the global store. `useAppStore.getState().reviewFocus` remained non-null with stale bar coordinates permanently, failing `expect(reviewFocus).toBeNull()`.
4. **Empty State Announcement & Single Live Region (M2, open ground 1 & 2):**
   - Deselect all three kind chips (`kinds = new Set()`).
   - Verify `[data-testid='review-findings'] tbody tr` has length 0.
   - Verify `<p data-testid="review-findings-empty">` displays `該当する指摘はありません` without `role="status"`.
   - Verify count summary `<span role="status" aria-live="polite">` displays `0 / <total>件`.
   - Re-select a chip -> empty notice is removed and matching rows render.
5. **Screen Reader Announcement Singularity (M3, open ground 2):**
   - Verify count summary is the sole live region (`role="status"`, `aria-live="polite"`). Empty notice has no `role="status"`.
6. **`reviewFocus` Cleanup on Filter Change within Same Check (M4, R2-B2, R3-m6):**
   - Run check, click first row (`干渉候補`) to focus finding.
   - Verify `reviewFocus` is set in store and `viewerMode === 'joint'`.
   - Deselect `干渉候補` chip -> verify `reviewFocus` becomes `null` and `focusedFindingId` becomes `null`.
   - Re-test with still-visible finding:
     - Re-select `干渉候補` chip (restoring all kind chips to selected state).
     - Click a `接触` row to focus it (verifying `reviewFocus` is set for that finding).
     - Deselect `干渉候補` chip -> verify `reviewFocus` remains set because the focused `接触` finding is still visible.
7. **Row Actions Under Active Filter (M5, R3-m3):**
   - Run initial check (106 `干渉候補`, 592 `接触`, total 698 per `step8-report.json#/original_failure/observed_table/kinds` — archived observation; runtime check result is authoritative, and the test derives visible rows dynamically).
   - Click `干渉候補` chip to hide interference candidates (`kinds = new Set(['あき不足候補', '接触'])`). With 0 `あき不足候補` occurrences, only `接触` rows remain visible (592 in archived observation; dynamically derived at runtime).
   - (a) Click first visible row: assert `reviewFocus.point` matches the midpoint of the first `接触` finding (not `expected.findings[0]`, which is `干渉候補`).
   - (b) Click `検討項目にする` on that first visible row: save item, assert `review.items[0].finding.id` matches that `接触` finding's id.
8. **Default Exclusions Display & `hideExcluded` Toggle (open ground 3):**
   - Add default exclusions (`既定の除外を追加`).
   - Run check. Verify excluded rows are visible with `除外:` badge (confirming `hideExcluded` defaults to `false` and `ReviewPane.test.tsx:189-201` passes).
   - Check `hideExcluded` checkbox -> verify excluded rows are hidden.
9. **Same-input Check Re-run Filter Persistence (R2-m5):**
   - Select a kind chip filter (e.g. only `干渉候補`).
   - Click `検査を実行` without modifying clearance or parameters (producing identical `checkId`).
   - Verify kind chip remains selected and table continues to display filtered findings.
10. **Existing Tests Invariance:**
    - All existing tests in `ReviewPane.test.tsx` pass without modification.

### 6.3 Performance Acceptance (`tests/e2e/uc25-perf.js` — BLOCKER B1, R2-M2, R3-M3)
Run the real-browser performance harness:
```bash
npx dev-browser --browser kijun --timeout 300 run tests/e2e/uc25-perf.js
```
Acceptance criteria:
- `sample.check_ms <= 3000` (BUDGET_MS.check_ms)
- `stress5.check_ms <= 3000` (BUDGET_MS.check_ms)
- `budget_met === true`
- **Regression Threshold against Recorded Baselines (`phases/48-joint-review-ui/step9-report.json`):**
  - `sample.check_ms`: Baseline **96 ms** (median of post-warmup samples `[70, 231, 96]`). Fail if `sample.check_ms > 350 ms`.
    - *Arithmetic & Justification:* Raw sample 231 ms is 2.406× the median. A threshold of 350 ms provides 3.65× baseline headroom, accommodating multi-sample median fluctuation on noisy hardware while staying far below the 3000 ms budget.
  - `stress5.check_ms`: Baseline **551 ms** (median of post-warmup samples `[230, 551, 572]`). Fail if `stress5.check_ms > 1200 ms`.
    - *Arithmetic & Justification:* Raw samples reach 572 ms. A threshold of 1200 ms provides 2.18× baseline headroom, accommodating intra-run variance while remaining well within the 3000 ms budget.
  - *Comparison Validity:* Valid on a host comparable to `#/perf_browser/conditions` (production build, Windows 11 desktop host / equivalent CPU). On different machines or CI runners, thresholds apply relative to a re-measured pre-change baseline on that same host in the same session.

### 6.4 E2E Invariance (`tests/e2e/uc25-joint-review.js`)
Zero changes to `tests/e2e/uc25-joint-review.js`. All 20 top-level checks must pass:
1. `checks.initialCheckFindings` (Scenario 4)
2. `checks.clearanceRecheckFindings` (Scenario 5)
3. `checks.findingFocus` (Scenario 6)
4. `checks.checkStableAfterViewerPose` (Scenario 7)
5. `checks.reviewItemConfirmed` (Scenario 8)
... through all 20 checks.

---

## 7. Risks & Abandonment Criteria

### Risk 1: Inadvertent DOM Contamination of `[data-testid='review-findings']`
- *Impact:* Placing controls or empty states inside `[data-testid='review-findings']` would pollute `text("[data-testid='review-findings']")`, failing Scenario 7 byte-identity assertions (`stableResult.findings === findings1`).
- *Mitigation:* The filter bar and empty state `<p>` are placed strictly outside the `<table>` as preceding and succeeding siblings. The table exclusively retains `data-testid="review-findings"`.
- *Abandonment Criterion:* If a design requirement insists on placing controls inside `<table>` or `<caption>`.

### Risk 2: Performance Gate and Execution Budget (`tests/e2e/uc25-perf.js`)
- *Impact:* `tests/e2e/uc25-perf.js` measures `check_ms <= 3000` against recorded baselines (96 ms sample / 551 ms stress5). An unoptimized `O(findings × members)` linear scan during mount would risk breaching the budget.
- *Mitigation:*
  1. `memberKinds` map is constructed once in `useMemo` on `[project.members]` (`O(members)`).
  2. `extractAvailablePairs` and `filterFindings` execute in `O(findings)` with `O(1)` map lookups.
  3. Default filter state short-circuits directly to the input array reference without allocation.
- *Abandonment Criterion:* If `stress5.check_ms` exceeds the 1200 ms threshold or the 3000ms budget under `tests/e2e/uc25-perf.js`.

### Risk 3: Stale Filter State Across Check Runs
- *Impact:* Re-running a check with different clearance or model inputs produces a new `checkId` and finding set. Stale filter criteria could orphan `pairKey` or suppress newly detected clearance findings.
- *Mitigation:*
  1. `<ReviewFindingsView>` is keyed by `result.checkId`, resetting state to default on each new check.
  2. Safe reconciliation on read (`safePairKey`) prevents orphaned dropdown values and synchronizes with `isFilterActive`.
- *Abandonment Criterion:* If requirements require retaining specific filter selections across check re-runs without a mechanism to inform the user of suppressed findings.

### Risk 4: Dangling 3D Review Focus on Filtered Rows or Check Re-runs (R2-B2, R3-B1)
- *Impact:* Focusing a finding and then applying a filter that hides it, or re-running a check with changed clearance, leaves 3D highlight segments and `[data-review-focus='1']` active with no corresponding row in the table.
- *Mitigation:*
  1. `focusedFindingId` bookkeeping is lifted to `ReviewCheckSection`.
  2. `runCheck` explicitly clears `setReviewFocus(null)` and `setFocusedFindingId(null)` whenever a new `checkId` is produced (`nextResult.checkId !== result?.checkId`).
  3. Reactive `useEffect` inside `ReviewFindingsView` clears `reviewFocus` and `focusedFindingId` whenever the focused finding is hidden by filter changes.
- *Abandonment Criterion:* If store architecture prevents clearing `reviewFocus` synchronously upon check invalidation.

### Risk 5: Locale Parity Breakage (`src/lib/i18n.test.ts`)
- *Impact:* Any key added to `ja.json` missing from `ko.json` immediately breaks `src/lib/i18n.test.ts:19`.
- *Mitigation:* All 7 keys defined in Section 3 are simultaneously added to both `ja.json` and `ko.json`.
- *Abandonment Criterion:* None; verified by `npm run test`.
