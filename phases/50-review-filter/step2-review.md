VERDICT: PASS

# Phase 49 step 2 — independent review of the findings-table filter bar

Reviewer: Claude Code, acting as independent reviewer. I did not write this implementation.
Reviewed: uncommitted working tree on `feat-49-findings-filter` at `a88c588`.
Constraints honoured: no build, no test, no browser run. Every claim below is cited to a file and line I read.

Verdict rationale: the priority-1 byte-identity guarantee holds under direct inspection of the
diff and of the E2E selectors that depend on it; no existing assertion was deleted, loosened or
made vacuous; scope is clean; all six named plan-conformance items are satisfied. The five
findings below are all MINOR — four are test-coverage or dead-code issues that do not change
runtime behaviour, and one is a low-reachability state-hygiene wart. None of them would produce
a wrong row, a wrong count, or a broken E2E selector. This is safe to commit and take to browser
verification.

---

## Findings

### 1. MINOR — `matchesFindingFilter`'s default parameter is unreachable and untested

`src/lib/review/finding-filter.ts:127`

```ts
export function matchesFindingFilter(
  finding: Finding,
  filter: FindingFilterState,
  memberKinds: ReadonlyMap<string, string>,
  effectivePairKey: string = filter.pairKey,   // <- line 127
): boolean
```

The only in-repo caller is `filterFindings` (`finding-filter.ts:169`), which always passes the
fourth argument explicitly. `src/lib/review/finding-filter.test.ts:12` imports
`matchesFindingFilter` but never calls it — that is the second of the two lint warnings the
orchestrator flagged.

**Assessment of the orchestrator's concern (priority 5): the predicate itself is NOT untested.**
All three of its branches are exercised transitively through `filterFindings`:

| branch | line | covering test | mutation that the test catches |
|---|---|---|---|
| kind chip | `finding-filter.ts:130` | `finding-filter.test.ts:197-216` | invert `has`; drop the clause |
| hideExcluded | `finding-filter.ts:135` | `finding-filter.test.ts:220-231` | `!== null` → `=== null`; drop the clause |
| pair key | `finding-filter.ts:140-145` | `finding-filter.test.ts:235-255` | invert `!==`; drop the clause |

So the unused import is cosmetic, not a coverage hole in the predicate's logic.

**The one surface that genuinely is untested is the default parameter.** Requested mutation that
the suite would NOT catch:

> Change `finding-filter.ts:127` from `effectivePairKey: string = filter.pairKey` to
> `effectivePairKey: string = 'all'`.

No test calls `matchesFindingFilter` with three arguments, so nothing reaches the default.
Consequence if it ships: `matchesFindingFilter` is an exported symbol, so any future three-argument
caller would silently ignore `filter.pairKey` and return `true` for every pair — a filter that
looks applied and filters nothing.

**Minimal fix (optional, this is MINOR):** either delete the default and make the parameter
required — `filterFindings` already always supplies it — or add to
`finding-filter.test.ts` a three-argument call asserting the default honours `filter.pairKey`:

```ts
const state: FindingFilterState = { kinds: new Set(ALL_FINDING_KINDS), pairKey: 'no-such-pair', hideExcluded: false }
expect(matchesFindingFilter(makeFinding(), state, memberKinds)).toBe(false)
```

Making the parameter required is the stronger fix: it removes the untested surface rather than
testing it, and also clears the lint warning.

---

### 2. MINOR — the reconciliation branch in `filterFindings` is untested, and the mutation that removes it is a reference-identity break

`src/lib/review/finding-filter.ts:161-163`

```ts
const effectiveFilter = filter.pairKey === effectivePairKey
  ? filter
  : { ...filter, pairKey: effectivePairKey }
if (!isFilterActive(effectiveFilter)) {
  return findings as Finding[]
}
```

Mutation that the full 2043-test suite would NOT catch:

> Replace lines 161-163 with `const effectiveFilter = filter`.

Trace:

- `finding-filter.test.ts:107-114` (the identity test) uses `defaultFindingFilterState()`, where
  `filter.pairKey === effectivePairKey === 'all'`, so the branch is a no-op and the mutation is
  invisible.
- `finding-filter.test.ts:257-268` is the only test that drives `effectivePairKey !== filter.pairKey`.
  Under the mutation, `isFilterActive({pairKey: 'non-existent-pair', ...})` returns `true`
  (`finding-filter.ts:46`), so the function falls through to `findings.filter(...)`; each finding
  is then tested with `effectivePairKey === 'all'`, which skips the pair check
  (`finding-filter.ts:140`), so the result is still `[f1]`. The test asserts with `toEqual`
  (line 267), not `toBe`, so it passes.
- No `ReviewPane.test.tsx` test drives `safePairKey !== filter.pairKey` (see finding 5 for why that
  state is hard to reach), and none asserts array identity.

The code as written is correct — this is purely a test gap. But note what the surviving mutation
does: in the stale-pairKey case it returns an allocated copy instead of the original reference.
That is exactly the class of defect the priority-1 byte-identity guarantee exists to prevent, so
the branch that protects it should have a falsifying test.

**Minimal fix:** add one line to `finding-filter.test.ts:257-268`:

```ts
expect(filterFindings(findings, state, memberKinds, safePairKey)).toBe(findings)
```

This fails immediately under the mutation and passes on the current implementation.

---

### 3. MINOR — dead import `FindingKind` in `ReviewPane.tsx`

`src/components/review/ReviewPane.tsx:24`

`FindingKind` was used only by the deleted `const CHECK_KINDS: FindingKind[]` (removed in this
diff; its call site at `ReviewPane.tsx:428` now uses `[...ALL_FINDING_KINDS]`). Line 24 is the sole
remaining occurrence in the file — confirmed by grep: `FindingKind` appears exactly once.
This is the first of the two lint warnings.

**Minimal fix:** delete `FindingKind,` from the type import block at `ReviewPane.tsx:24`.

---

### 4. MINOR — the single-live-region test asserts a property of the fixture, not of the filter

`src/components/review/ReviewPane.test.tsx:979` and `:990`

```ts
const statuses = screen.getAllByRole('status')
expect(statuses).toHaveLength(1)
```

`screen` is document-scoped. `ReviewPane.tsx` contains two *other* `role="status"` nodes that this
change did not introduce:

- `src/components/review/ReviewPane.tsx:1045` — `<p role="status">{t(locale, 'review.compare.discardConfirm')}</p>` in `ReviewCompareSection`
- `src/components/review/ReviewPane.tsx:1358` — `<p role="status" data-testid="review-items-joint-unavailable">` in `ReviewItemsSection`

The assertion holds only because neither is rendered in this fixture's state. The plan's
requirement — that the *filter feature* contributes exactly one live region — is satisfied by the
implementation (`ReviewPane.tsx:292` is the only new `role="status"`), so this is not a
conformance failure. It is a test-robustness wart: an unrelated future change that makes the
discard-confirm paragraph render in this fixture would fail a filter test for a reason that has
nothing to do with filtering.

**Minimal fix (optional):** scope the query to the filter bar —
`within(screen.getByTestId('review-findings-filter')).getAllByRole('status')` — and separately
assert `queryByTestId('review-findings-empty')` carries no role, which lines 987-989 already do.

---

### 5. MINOR — a stale `filter.pairKey` is reconciled for display but never written back, and the reset button cannot clear it

`src/components/review/ReviewPane.tsx:182`, `:299-302`

```ts
const safePairKey = availablePairs.includes(filter.pairKey) ? filter.pairKey : 'all'   // :182
...
aria-disabled={!active}                                                                 // :299
onClick={() => { if (!active) return; setFilter(defaultFindingFilterState()) }}          // :301
```

If `availablePairs` stops containing the selected `filter.pairKey` while `ReviewFindingsView` is
mounted, `safePairKey` falls back to `'all'`, `effectiveFilter` (`:184-186`) reports inactive, and
`active` becomes `false`. The select shows `all` and the row count shows `N / N`, so the UI is
self-consistent — but `filter.pairKey` still holds the stale string in state, and the reset
button's `if (!active) return` guard means the user cannot clear it. If `availablePairs` later
re-contains that key, the pair filter silently re-applies with no user action.

Reachability is low and I did not confirm it end to end: it requires `memberKinds`
(`ReviewPane.tsx:367-370`, keyed on `project.members`) to change while `result` — and therefore
`result.checkId`, and therefore the `key` at `ReviewPane.tsx:575` — stays fixed. `setResult` has
exactly one call site (`ReviewPane.tsx:453`, inside `runCheck`; verified by grep), so `result` does
persist across project edits. Whether a member's `kind` is user-editable in a way that survives
without a re-run is something I could not establish from this diff alone.

Severity is MINOR because the visible state is always correct and the stale value is invisible.
**Minimal fix if you want it closed:** reconcile in state rather than only in render — drop the
`if (!active) return` guard at `:301` so reset always writes `defaultFindingFilterState()`, or add
an effect that calls `setFilter((p) => p.pairKey === safePairKey ? p : {...p, pairKey: safePairKey})`.

---

### Note (not a finding) — redundant clause in `isFilterActive`

`src/lib/review/finding-filter.ts:48-49`

```ts
filter.kinds.size !== ALL_FINDING_KINDS.length ||
!ALL_FINDING_KINDS.every((kind) => filter.kinds.has(kind))
```

Given `kinds: ReadonlySet<FindingKind>` (`:20`) and `FindingKind` being a closed three-member union
(`src/domain/review/types.ts:48`), `size === 3` implies all three members are present, so the
`every` clause is unreachable by type. Deleting it is a mutation no test catches, but it is also
behaviour-preserving. Harmless defensive code; recorded only so it is not mistaken for a coverage
hole later.

---

## What I positively verified

**Priority 1 — the byte-identity guarantee. Holds.**

- The short-circuit is real and reference-preserving: `finding-filter.ts:164-166` returns
  `findings` itself, not a copy. This is the single most important line in the change and it *is*
  covered by a falsifying test — `finding-filter.test.ts:113` uses `toBe`, so mutating the return
  to `[...findings]` fails immediately.
- In the component, the default state reaches that short-circuit: `defaultFindingFilterState()`
  (`finding-filter.ts:31-37`) gives `pairKey: 'all'`, so `safePairKey === 'all'`
  (`ReviewPane.tsx:182`), `effectiveFilter === filter` (`:184-186`), `isFilterActive` returns
  `false` (`finding-filter.ts:44-51`), and `filteredFindings === result.findings` by reference.
- **The filter bar is genuinely outside the table.** `ReviewPane.tsx:226-309` is a `<div
  data-testid="review-findings-filter">`; the `<table data-testid="review-findings">` opens at
  `:311`; the empty notice `<p data-testid="review-findings-empty">` is at `:327`. All three are
  siblings inside the fragment returned by `ReviewFindingsView`, which is placed at
  `ReviewPane.tsx:574-587` exactly where the old `<table>` stood. Neither new element is a
  descendant of the table.
- **The table's subtree is byte-identical.** I compared the old inline JSX (removed at
  `ReviewPane.tsx` old lines 335-359) against `FindingsTableBody` (`:110-146`) cell by cell: same
  `<caption>`, same `<tbody>`, same `<tr key={finding.id} tabIndex={0} onClick onKeyDown>`, the same
  seven `<td>` in the same order with the same expressions. The only change is that
  `onCreateItem(finding, result.checkId, result.jointRef.columnMemberId)` now reads those two values
  from props (`checkId`, `jointColumnMemberId`), passed at `:317-318` from the same sources. Row
  order is `filteredFindings.map`, which in the default state iterates the original array.
- **`uc25-joint-review.js` is safe.** `readCheckResult` (`tests/e2e/uc25-joint-review.js:243-254`)
  reads `text("[data-testid='review-findings']")` — an *exact* attribute match, so it does not
  match `review-findings-filter` or `review-findings-empty` — and takes `textContent` of the table
  only. `readFindingRows` (`:257-262`) selects `[data-testid='review-findings'] tbody tr`; no
  placeholder row was added to `tbody`, so the ≥6-cell requirement of `parseFindingRows` still holds.
- **Scenario 7's `findings === findings1` identity check** (`uc25-joint-review.js:925`, `:932`) is a
  string comparison of that table's `textContent`. It is preceded by a full ReviewPane unmount/remount
  (asserted at `:911-917`), so `ReviewFindingsView` mounts fresh with `defaultFindingFilterState()`.
  I traced the re-run at `:919`: `result` is `null`, so `nextResult.checkId !== result?.checkId`
  (`ReviewPane.tsx:449`) is `true` and focus is cleared — `checkId` is a deterministic hash of the
  canonical input (`src/lib/review/geometry-check.ts:397`), so `checkId === checkId1` still holds and
  the waitUntil predicate is satisfied.
- **The negative assertion at `uc25-joint-review.js:772`** — `!initialResult.findings.includes("あき不足候補")`
  — is the sharpest hazard in the whole change, because the kind chips render that exact literal as
  button text. It is safe precisely because the chips are outside the table and `readCheckResult`
  scopes to the table.
- I swept `tests/e2e/` for prefix/substring `data-testid` selectors that could newly collide: the
  only non-exact ones are `[data-testid^='review-item-']` (`:272`, `:947`, `:949`, `:1059`, `:1078`,
  `:1315`, `:1357`) and `review-compare*`. Neither matches the two new testids.
- `uc25-perf.js:127-136`: `measureCheck` filters by `clickText: "検査を実行"`, and none of the four
  new buttons carries that text (chips are the three kind labels; reset is `フィルターを解除`), so
  the click target is unchanged. The new buttons also sit later in document order than the existing
  ones, inside the `{result && ...}` block.

**Priority 2 — no weakened assertions. Confirmed.**
`git diff src/components/review/ReviewPane.test.tsx` is purely additive: the diffstat reports
274 insertions and 0 deletions, and the single hunk `@@ -829,4 +829,278 @@` appends a new
`describe('Finding Filter')` block at `ReviewPane.test.tsx:833` after the pre-existing final test.
No pre-existing assertion was deleted, relaxed, or had its expected value edited to match observed
behaviour. The nine `}, 20000)` timeouts were added by the orchestrator, not the implementer, and a
timeout is not an assertion.

The new tests use independent oracles rather than self-confirmation: `directGeometryCheck()` supplies
expected counts (`:836`, `:861`, `:1049`) and `expectedContactFindings[0].midpoint` supplies expected
focus coordinates (`:1060-1063`), so these would fail if the filter returned the wrong rows.

**Priority 3 — scope. Clean.**
`git status --porcelain` shows five modified files, all in the allowed set, plus two untracked
allowed files (`src/lib/review/finding-filter.ts`, `.test.ts`). Nothing under `tests/e2e/**`,
`geometry-check.ts`, `store.ts` or any viewer file is touched. The other untracked entries
(`.claude/settings.local.json`, the eight `phases/48-joint-review-ui/step[5-8]-*` harness logs) are
not attributable to this work: their mtimes are 2026-09-17 21:55 and 2026-09-18 00:54, whereas the
implementation files are 2026-09-19 11:13-11:15. They are pre-existing harness artefacts and should
simply be kept out of the commit.

**Priority 4 — plan conformance. All six named items satisfied.**

| plan item | location | status |
|---|---|---|
| guard is `nextResult.checkId !== result?.checkId` (optional-chaining form) | `ReviewPane.tsx:449` | exact match, single occurrence |
| `FindingsTableBody` wrapped in `memo` | `ReviewPane.tsx:110` | `memo(function FindingsTableBody({...}))`, `memo` imported at `:3` |
| `focusFinding` in `useCallback` | `ReviewPane.tsx:203-224` | deps `[layout, project, setFocusedFindingId, setReviewFocus, setViewerMode]`, all stable |
| reset button has **no** `onKeyDown` | `ReviewPane.tsx:296-305` | confirmed absent; `aria-disabled={!active}` at `:299`, no HTML `disabled` |
| empty notice has no `role="status"` | `ReviewPane.tsx:327` | confirmed absent |
| exactly one live region (from this feature) | `ReviewPane.tsx:292` | the only new `role="status"`; see finding 4 for the fixture caveat |
| seven i18n keys in both locales | `ja.json:441-447`, `ko.json:441-447` | all seven present in both, same key set, no duplicates |

Additional conformance I checked and found correct: `memberKinds` is memoised on `[project.members]`
not `[project]` (`ReviewPane.tsx:367-370`, plan line 211); `ReviewFindingsView` is keyed on
`result.checkId` (`:575`); `focusedFindingId` is lifted to `ReviewCheckSection` (`:373`); and all nine
CSS classes the plan enumerates exist in `ReviewPane.module.css:123-184`.

**Priority 6 — filter logic. Correct.**

- *Pair-key symmetry*: `findingPairKey` (`finding-filter.ts:94-101`) sorts the two role labels before
  joining, so the key is order-independent by construction. Tested at `finding-filter.test.ts:151-163`.
- *Unknown-member fallback*: `barMemberRole` (`:84`) uses `memberKinds.get(id) ?? ref.memberId`,
  matching the pre-existing `formatBarRef` convention. Tested at `finding-filter.test.ts:144-147`.
- *`hideExcluded` × kind selection*: the three checks in `matchesFindingFilter` (`:130`, `:135`, `:140`)
  are independent conjuncts, so they compose without interaction. Tested together implicitly and
  separately at tests 7-9.
- *Empty selection*: `kinds: new Set()` makes `isFilterActive` true via the size check (`:48`) and
  `matchesFindingFilter` reject everything at `:130`, yielding `[]` rather than "empty means no
  filter". Tested at `finding-filter.test.ts:210-215`.
- *Unknown kind*: cannot occur. `KIND_TABLE` (`:7-11`) is `as const satisfies Record<FindingKind, true>`,
  which rejects both a missing key and an excess key at compile time, so `ALL_FINDING_KINDS` cannot
  drift from the union at `src/domain/review/types.ts:48`. `expectTypeOf` pins it at
  `finding-filter.test.ts:53`. This is the strongest part of the design.
- `isFilterActive` is structural rather than count-based, so a check with zero `あき不足候補`
  findings still reports "active" when that chip is deselected (`finding-filter.test.ts:67-74`).

**The 20000ms timeouts: legitimate, not masking a regression.**
I could not measure, so this is a structural argument, not a measurement.

There is no mechanism in this diff by which the render path got slower *per row*. `FindingsTableBody`
(`ReviewPane.tsx:110-146`) performs byte-identical per-row work to the old inline JSX, including the
same two `formatBarRef` calls per row, each of which does a linear `project.members.find`
(`ReviewPane.tsx:87`) — that is the dominant cost of a 698-row render and it is untouched. The `memo`
wrapper strictly *removes* work: a row click now updates `focusedFindingId` without re-rendering the
698 `<tr>`s. The only work added to a full render is `extractAvailablePairs`
(`finding-filter.ts:108-117`), one pass over the findings, memoised on `[memberKinds, result.findings]`.

The duration difference is explained by what the tests do. The pre-existing heavy test
(`ReviewPane.test.tsx:831`, ~10s) runs one geometry check and one 698-row render plus item recreation.
The two slow new tests do strictly more: e.g. `:865` ("re-run with changed clearance") runs
`directGeometryCheck()` plus two in-component `runGeometryCheck` passes plus three large renders, and
`:906` ("empty notice") runs `directGeometryCheck()` plus a check plus four chip toggles, each forcing
a re-render. Two to three times the check-and-render work against a ~10s baseline lands at 15-17s.
A 1.5-1.7x multiple is consistent with the work; it is not the signature of a per-row slowdown, which
would have scaled the ~10s baseline test too — and that test's duration is unchanged.

---

## What I could NOT verify

1. **Anything requiring execution.** I ran no build, test, or browser, per the review constraints.
   Every behavioural claim above is derived from reading the diff and the E2E source. The green host
   gates are evidence, not proof.
2. **The E2E suite.** `uc25-joint-review.js` and `uc25-perf.js` have not run against this change. My
   analysis of `readCheckResult`, `readFindingRows`, Scenario 7's identity check, the `:772` negative
   assertion, and the `measureCheck` click target is static selector analysis only. Browser
   verification remains genuinely required, and it is the right next step.
3. **The actual per-test durations.** I did not observe the 15-17s figures; I reasoned about them from
   the operation counts in the test bodies. I recommend recording per-test durations in the step report
   (`vitest --reporter=json`) so the claim is backed by a number rather than an argument. Per
   `CLAUDE.md`, run that by file path with no Japanese in the command arguments.
4. **Perf budget headroom.** `check_ms` medians were 96ms (sample) and 551ms (stress5) against a
   3000ms budget in `phases/48-joint-review-ui/step9-report.json#/perf_browser`, so the added
   `extractAvailablePairs` pass has ample room. But I note two things I could not resolve statically:
   `compare_ms` already recorded an individual stress5 sample of 3034ms over its 3000ms budget
   (`#/perf_browser/individual_samples_over_budget/stress5`, survived only because the budget check at
   `uc25-perf.js:253` uses medians), and `measureCheck` waits on `wait: "present"` for a selector that
   is already present on iterations 2+, so it may not be capturing the render cost at all. Neither is
   caused by this change; both mean the perf numbers should be re-measured rather than assumed.
5. **Finding 5's reachability.** I established that `result` persists across project edits (`setResult`
   has one call site) but not whether a user can actually change a member's `kind` while a pair filter
   is active. The finding is written as conditional for that reason.
6. **Screen-reader behaviour.** The live-region and `aria-disabled` focus-retention decisions
   (`ReviewPane.tsx:292`, `:299`) are justified in the plan by NVDA/JAWS behaviour. jsdom cannot test
   that and I did not verify it; `ReviewPane.test.tsx:961-972` asserts DOM attributes, which is the
   right proxy but is not the same claim.
