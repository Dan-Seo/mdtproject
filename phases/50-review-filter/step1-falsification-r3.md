VERDICT: REFUTED

# Phase 49-1 — Findings Table Filter: Independent Falsification, Round 3

Reviewer: independent (did not author the plan, did not write round 1 or round 2, will not implement).
Checkout: `632bead fix(49-joint-review-defects): close the cross-verification findings` (`git log --oneline -3`
confirms this is HEAD).
Method: every `file#Lnnn` in the round-3 plan re-read at that line in this checkout. Round-1 and round-2
findings re-tested against the round-3 revision, not against the text they were written about. Findings
that round 2 already confirmed closed were not redone (they are listed at the end for continuity only).
No file edited except this one. No build, test, or browser run — every place that limits a claim is marked
in "Not verified".

**Headline.** R2-B1 is genuinely and soundly fixed; its prescribed test really does fail on the round-2
design. R2-B2 is *mostly* fixed — the lift is correct and the mutual destruction is gone — but the plan
specifies the `runCheck` guard **two different ways in two different sections**, and the two differ on a
path that is reachable in the normal flow and leaves `reviewFocus` dangling exactly as R2-B2 described.
That is R3-B1 below. Round 3 also prescribes one change that does not compile (R3-M1) and a performance
acceptance threshold that is tighter than the noise in its own cited baseline (R3-M3).

The byte-identity guarantee — the load-bearing claim — **still holds against the round-3 DOM**. I re-derived
it rather than inheriting it; see §"Byte identity re-verified".

---

## BLOCKERS

### R3-B1. The `runCheck` focus-clear guard is specified two different ways, and the stricter of the two leaves `reviewFocus` permanently dangling after a tab switch

The plan gives the guard four times, in two mutually incompatible forms:

- `phases/50-review-filter/step1-plan.md:212` — «when a check produces a new `checkId`
  (`result !== null && nextResult.checkId !== result.checkId`)»
- `phases/50-review-filter/step1-plan.md:252` (the code block codex will copy) —
  `if (result !== null && nextResult.checkId !== result.checkId) {`
- `phases/50-review-filter/step1-plan.md:509` (§2 "Files to be Touched") — «clear … when
  `nextResult.checkId !== result?.checkId`»
- `phases/50-review-filter/step1-plan.md:587` (§4.6) — «When `runCheck` produces a new `checkId`
  (`nextResult.checkId !== result?.checkId`) …»

`result !== null && a !== result.checkId` and `a !== result?.checkId` differ on exactly one input:
`result === null`. The optional-chaining form clears; the explicit-null-guard form does not. Risk 4's
mitigation 2 (`step1-plan.md:806`) states the unqualified rule — «`runCheck` explicitly clears
`setReviewFocus(null)` and `setFocusedFindingId(null)` **whenever a new `checkId` is produced**» — which
the L252 code does not implement.

This is not academic, because `result === null` is reached on a one-click path that the product's own E2E
walks:

1. Select 柱 A → `検査を実行` → `result` = A. `focusedFindingId` is `null`.
2. Click a finding row → `focusFinding` writes `setReviewFocus({...})` and `setViewerMode('joint')`
   (`src/components/review/ReviewPane.tsx:199-215`), `focusedFindingId` = F.
3. Switch to the 内訳書 tab. `ReviewPane` unmounts — `tests/e2e/uc25-joint-review.js:910-918` asserts
   exactly this (`checkIdMounted`/`findingsMounted` must both be false after
   `clickTakeoffTab(); clickReviewTab()`). `ReviewCheckSection`'s `useState` dies with it, so
   `focusedFindingId` → `null` and `result` → `null`.
   `reviewFocus` is **store** state (`src/lib/store.ts:42-46`, `:109`, `:153-154`) and survives; only
   `loadProject` clears it (`src/lib/store.ts:189`).
4. Switch back to 検討. Select 柱 B in the plan (reachable while the review pane is mounted —
   `src/components/review/ReviewPane.test.tsx:813` does exactly this, and the E2E clicks 柱 in the SVG).
5. `検査を実行`. In `runCheck`, `result === null` → **L252's guard is false** → `setReviewFocus(null)` is
   never called. `setResult(B)` runs; `<ReviewFindingsView key={checkId_B}>` mounts with
   `focusedFindingId === null`, so the M4 cleanup effect (`step1-plan.md:331-337`) is guarded off too.
6. `reviewFocus` still holds joint A's two segments and joint A's label.
   `src/components/viewer/Viewer3D.tsx:2220` renders it whenever `viewerMode === 'joint' && jointScene !== null`,
   and `:2343` sets `data-review-focus='1'`. The marker now points at bars that are not in the displayed
   joint. `checkId` is a hash of `{version, member fingerprints, checkConditions, regionMm}`
   (`src/lib/review/geometry-check.ts:397-402`), so pressing `検査を実行` again with nothing changed
   reproduces the same `checkId` and still does not clear it. Nothing in the UI can clear it short of
   loading a project.

That is R2-B2's failure mode verbatim, reached through the one branch the round-3 guard excludes. The plan
cannot be implemented "as written" because it does not say which of its two guards is the written one.

**Minimal fix:** adopt the optional-chaining form in the §1.4 code block — change
`step1-plan.md:252` to `if (nextResult.checkId !== result?.checkId) {` and `:212` to match `:509`/`:587`.
One operator; no other text changes.

**E2E safety of that fix, checked:** `data-review-focus` is read only at
`tests/e2e/uc25-joint-review.js:883-904`. `:883-884` requires `focusBefore === false` *before* the
Scenario-6 row click (nothing has set focus by then), `:887` waits for it *after* the click, and `:892`
re-reads it in the same evaluate. The Scenario-7 re-run at `:919` reads only `checkId`/`findings`/
`verdicts` (`readCheckResult`, `:245-255`) and never `data-review-focus`, so clearing focus there changes
no assertion. `src/components/review/ReviewPane.test.tsx:204-220` runs the check *before* the row click,
so the extra clear (of an already-null value) is inert.

---

## MAJOR

### R3-M1. §2 item 3's `CHECK_KINDS` → `ALL_FINDING_KINDS` replacement does not compile

`step1-plan.md:507`: «Remove local `const CHECK_KINDS` in `ReviewPane.tsx:77`, replace usages with
`ALL_FINDING_KINDS`.»

There is exactly one other usage. `src/components/review/ReviewPane.tsx:177` is `kinds: CHECK_KINDS,`
inside a `const exclusion: CheckExclusion = {…}` literal (`:172-181`), and
`src/domain/review/types.ts:96` types that field **mutably**: `kinds: FindingKind[]`.
The plan declares the replacement as `export const ALL_FINDING_KINDS: readonly FindingKind[]`
(`step1-plan.md:27-29`). `readonly FindingKind[]` is not assignable to `FindingKind[]`, and
`tsconfig.json:7` sets `"strict": true`, so `tsc` / `npm run build` fails on `ReviewPane.tsx:177`.

This matters beyond the compile error because of how codex is likely to "fix" it: the cheapest repair is
to widen `ALL_FINDING_KINDS` to a mutable `FindingKind[]`, which silently reintroduces the module-level
shared-array aliasing that `CHECK_KINDS` has today (every manually created `CheckExclusion` would hold the
same array instance, and that array is serialized into `review` and persisted —
`src/lib/hooks/useProjectPersistence.ts:56-59` autosaves on any `review` change). Today's behaviour is the
same, so it is not a regression, but the plan should not force the choice by accident.

**Fix:** write the call site explicitly in §2 item 3 — `kinds: [...ALL_FINDING_KINDS]` at
`ReviewPane.tsx:177` — and keep `ALL_FINDING_KINDS` `readonly`.

### R3-M2. Lifting `focusedFindingId` to `ReviewCheckSection` makes every finding-row click re-render the whole 698-row table; §1.4's "Choice Justification & Cost" claims the cost is only prop-passing

`step1-plan.md:214` states the cost in full: «The cost is passing `focusedFindingId` and
`setFocusedFindingId` across the component boundary.» That enumeration is incomplete.

Today `focusFinding` (`src/components/review/ReviewPane.tsx:199-215`) writes **only** to the zustand store
(`setReviewFocus`, `setViewerMode`). `ReviewCheckSection` subscribes to `project`, `review`, `sel.memberId`,
`locale`, `setReview`, `setReviewFocus`, `setViewerMode` (`ReviewPane.tsx:100-107`) — it subscribes to
neither `reviewFocus` nor `viewerMode`, and zustand compares selector output with `Object.is`. So a row
click today re-renders **nothing** in the findings table.

Under the plan, `focusFinding` additionally calls `setFocusedFindingId(finding.id)`
(`step1-plan.md:345`), which is `ReviewCheckSection` state (`step1-plan.md:239`). Every row click therefore
re-renders `ReviewCheckSection` and `ReviewFindingsView`, i.e. all `filteredFindings` rows. Each row calls
`formatBarRef` twice, and `formatBarRef` is still an unmemoised `project.members.find(…)` linear scan
(`src/components/review/ReviewPane.tsx:79-83`) — the very scan §1.3 removed from `barMemberRole` for B1.
On the 5-storey stress fixture (`scripts/perf/stress-fixture.ts:19` — `xSpanCount: 4, ySpanCount: 3,
storyCount: 5`) that is ~700 findings × 2 lookups × several hundred members per click, plus ~700 `<tr>`
reconciliations.

No gate fails: `tests/e2e/uc25-perf.js` measures `joint_tab_ms`, `check_ms`, `compare_ms`, `tab_switch_ms`
(`:31-36`) and never times a row click; `measureCheck` (`:127-136`) stops when
`[data-testid='review-findings']` is present, before any row click. So this is a real, unacknowledged
interaction-latency regression on the one interaction the feature exists to support, not a budget breach.

**Fix:** `focusedFindingId` is never read during render — it feeds only the cleanup effect
(`step1-plan.md:331-337`). Extract the row list into a `React.memo` child that does not receive it
(`<FindingsRows findings={filteredFindings} project review locale onCreateItem onFocus />`), so the focus
state update cannot re-render 698 rows. Alternatively state in §1.4 that the extra render is accepted and
why — but do not leave the cost paragraph claiming it is only prop-passing.

### R3-M3. §6.3's new regression threshold is tighter than the spread inside the baseline it cites, so it can fail with no regression

Round 2's R2-M2 asked for named baselines and a stated pass/fail rule. Round 3 supplies both, and the
numbers are correct: `phases/48-joint-review-ui/step9-report.json#/perf_browser/sample/check_ms` = **96**,
`#/perf_browser/stress5/check_ms` = **551**, conditions at `#/perf_browser/conditions`, and the
`spread_note` quotations (3034 ms `compare_ms`, 765 ms `tab_switch_ms`) are verbatim accurate. The AC is
now falsifiable in both halves. That part is closed.

What is not sound is the threshold. `step1-plan.md:774` sets «Fail if > 2× baseline (192 ms)» for
`sample.check_ms`. The baseline's own raw samples for that metric are
`#/perf_browser/raw_samples/sample/check` = `[88, 70, 231, 96]`; `measureProject` discards the warm-up and
takes the median of the remaining three (`tests/e2e/uc25-perf.js:206` — `check_ms: median3(check.slice(1))`,
i.e. median of `[70, 231, 96]` = 96). A **231 ms** sample exists inside the run that produced the 96 ms
baseline. A three-sample median drawn from a population containing a 2.4× outlier can land above 192 ms
with no code change at all. `stress5`'s 1102 ms threshold is safer (raw `[397, 230, 551, 572]`) but on the
same reasoning is not generous.

The conditions field also pins the baseline to a «Windows 11 desktop host»; §6.3 does not require the
comparison run to be on comparable hardware, so an absolute-millisecond threshold is being compared across
possibly different machines.

A gate that fires on noise gets waived, and a waived gate is the same as the unfalsifiable one round 2
rejected — the failure mode `CLAUDE.md` 개발 프로세스 ③ is about.

**Fix:** either raise the sample threshold above the baseline's own observed spread (e.g. fail if
`sample.check_ms > 300`, citing the 231 ms sample as the reason), or make the rule relative to a
*re-measured* pre-change baseline captured on the same host in the same session — and say in §6.3 that the
comparison is only valid on a host comparable to `#/perf_browser/conditions`.

---

## MINOR

### R3-m1. §6.2 item 2's `document.activeElement` assertion cannot fail in jsdom, and the plan does not say so

`step1-plan.md:728-732` lists, in order: «Verify `document.activeElement` is the reset button (focus does
NOT fall to `<body>`)», then the two structural assertions. The "What makes this test FAIL on the broken
design" paragraph (`step1-plan.md:735`) correctly names only the structural pair
(`expect(resetButton).not.toBeDisabled()` and `toHaveAttribute('aria-disabled', 'true')`), and those two
are genuine falsifiers — jest-dom is wired in (`vitest.ui.setup.test.ts:1`,
`package.json:37` `@testing-library/jest-dom@^7`), `toBeDisabled` reads the `disabled` attribute and not
`aria-disabled`, and the round-2 design sets `disabled` in both the default and post-activation states.
So R2-B1's test does have a real falsifier (see "Confirmed closed" item 1).

The `activeElement` assertion, however, is the one that names the property the user cares about and is the
one that cannot detect its absence: jsdom does not implement the HTML focus fixup rule, so it is green on
both designs. Worse, the plan does not say whether the test focuses the button first — `fireEvent.click`
does not move focus, so written naively the assertion fails *spuriously*
(`document.activeElement === document.body`), and written with `resetButton.focus()` first it passes
vacuously. Two plausible implementations, opposite outcomes, neither informative.

**Suggested wording:** prescribe `resetButton.focus()` then `fireEvent.keyDown(resetButton, { key: 'Enter' })`
(or `.click()`), and state that the `activeElement` assertion is a regression guard only — the real-browser
focus-fixup property is established structurally by the absence of the `disabled` attribute and is not
covered by any browser-level AC (§6.4 makes zero changes to `tests/e2e/uc25-joint-review.js`).

### R3-m2. §6.1 item 1 asks a runtime unit test to verify a compile-time property

`step1-plan.md:664-666`: «Verify `KIND_TABLE satisfies Record<FindingKind, true>` enforces handling of all
union members. Verify `ALL_FINDING_KINDS` derives directly from `Object.keys(KIND_TABLE)`.»

The `satisfies` guard itself is sound and is the correct idiom for this repo
(`src/components/viewer/palette.ts:5` is `} as const satisfies Record<RebarZone['kind'], string>` ✓, and
`FindingKind` is a three-member union at `src/domain/review/types.ts:48` ✓, so adding a fourth member makes
`KIND_TABLE` fail to compile and `ALL_FINDING_KINDS` cannot desynchronise). But no vitest assertion can
observe a type error. Codex will substitute something runtime-shaped — most likely a hard-coded
`toEqual(['干渉候補','あき不足候補','接触'])`, which is the hard-coded-oracle pattern R2-m3 just removed
from §6.2. Say instead that the guard is enforced by `tsc` / `npm run build` and drop it from §6.1, or
prescribe a type-level test (`expectTypeOf`) explicitly.

### R3-m3. §6.2 item 7 mis-states the filter state it sets up

`step1-plan.md:748`: «Click `干渉候補` chip to hide interference candidates (`kinds = new Set(['接触'])`).»
Deselecting one of three chips leaves `{あき不足候補, 接触}`, not `{接触}`. The test's *behaviour* is
unaffected — `あき不足候補` has zero occurrences on the initial check
(`phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table/kinds` =
`{"干渉候補": 106, "接触": 592}`, and `tests/e2e/uc25-joint-review.js:772` asserts the initial result contains
no `あき不足候補`) — but the parenthetical is wrong and the whole point of M1/`isFilterActive` was that
these two states are *not* the same thing.

### R3-m4. §1.3's "Vocabulary Bridge" rests on a sample-project naming convention presented as a general property

`step1-plan.md:76` («the section mark prefix (`G` = girder / 大梁, `C` = column / 柱) … immediately identify
the corresponding bar») is true of `createSampleProject` (`src/domain/model/sample-project.ts` marks are
`C1`, `G1`, `G2`, `W1`, `S1`) but `section.mark` is free-form user data rendered through
`sectionMarkLabel` (`src/domain/model/member.ts:382-386`), supplied by 断面一覧 editing and 断面リスト
import. A project whose girders are marked `B1` breaks the bridge. This is a rationale paragraph, not a
design defect — round 2's R2-M3 asked for the collapse to be *justified* and it now is, with accurate
`roleToLayer` citations (`src/lib/viewer/geometry.ts:78-85` ✓ five roles → `'main'`;
`:91-95` ✓ `腹筋` at `:92`, `縦筋` at `:94`, `return 'main'` at `:95`). Only point 4 overstates.

### R3-m5. §6.2 item 3 labels a non-falsifying assertion as falsifying

`step1-plan.md:719`: «**Falsifying assertions:** `expect(select.value).toBe('all')`: verifies dropdown reset
to `すべてのペア` on checkId change.» Against the *round-2* design this is green — the
`key={result.checkId}` remount already reset the filter there, which is exactly why R2-B2 was about
`reviewFocus` and not about the dropdown. The genuinely falsifying assertion in that test is
`expect(useAppStore.getState().reviewFocus).toBeNull()`, and the plan's own "What makes this test FAIL"
paragraph (`step1-plan.md:721`) says so correctly. `select.value` falsifies round-1's B2, not round-2's.
Relabel, or the next reviewer will treat a green `select.value` as evidence R2-B2 is closed.

### R3-m6. §6.2 item 6's second half is not executable as written

`step1-plan.md:745`: «Re-test: Focus a `接触` row -> deselect `干渉候補` chip -> `reviewFocus` remains set…».
By that point in the same test the `干渉候補` chip is already deselected (from the first half,
`step1-plan.md:743`), so there is nothing to deselect. The intended sequence needs a re-select step.
Behaviourally trivial; textually unexecutable.

---

## Byte identity re-verified against the round-3 DOM

This is the claim everything else rests on, so I re-derived it rather than inheriting round 1's finding.

The round-3 changes that touch the DOM are: the always-mounted `<span role="status" aria-live="polite">`
(`step1-plan.md:381-384`), the `<p data-testid="review-findings-empty">` without `role="status"`
(`step1-plan.md:425-428`), and the `aria-disabled` reset button (`step1-plan.md:385-395`). All three sit
**outside** `<table className={styles.table} data-testid="review-findings">` — the span and the button
inside the preceding `<div data-testid="review-findings-filter">`, the `<p>` as a following sibling.

- `tests/e2e/uc25-joint-review.js:245-255` (`readCheckResult`) reads
  `text("[data-testid='review-findings']")`; `:257-263` (`readFindingRows`) reads
  `[data-testid='review-findings'] tbody tr`. Both are scoped to the table. Scenario 7's
  `value.findings === findings1` (`:925`, `:932`) therefore still compares `caption` + `tbody` only. ✓
- The full set of `review-findings` references in the repo is
  `tests/e2e/uc25-joint-review.js:249,259,886,912,939`, `tests/e2e/uc25-perf.js:133`, and
  `src/components/review/ReviewPane.test.tsx:160,183,198,209,276,815`. RTL `getByTestId` is exact-match on
  the attribute value, so `review-findings-filter` and `review-findings-empty` do not match
  `review-findings`; the E2E selectors are `[data-testid='review-findings']`, also exact. No prefix or
  substring selector exists. ✓
- The empty `<p>` cannot enter `tbody`, so `parseFindingRow`'s 6-cell rule
  (`tests/e2e/uc25-joint-review.js:106-112`, throw at `:124-130`) is never reached with a placeholder row.
  Both cited ranges are exact in this checkout. ✓
- The single new `role="status"` node does not break `src/components/AppShell.test.tsx:90`
  (`getByRole('status')`, singular): the filter bar only exists after a check has run, which that test does
  not do. `tests/e2e/uc7-source-and-formula.js:53` takes the *first* `[role='status']` and
  `src/components/AppShell.tsx:121` precedes the review pane. The other `role="status"` nodes in the pane
  (`ReviewPane.tsx:818`, `:1131`, `WorkPackageBoard.tsx:311`) are conditional and already coexist. ✓
- `checks.statusVocabularyAndNotices` (`tests/e2e/uc25-joint-review.js:1360-1388`) counts
  `[data-review-verdict]` (3), `[data-review-status]` (1), `[data-package-state]` (1),
  `[data-blocker]` (≥1) and `[data-review-notice]` (1 each side). The filter bar adds none of those
  attributes, and none of the seven new strings contains `合格`/`安全`/`承認`/`施工可能`/`適合`. ✓
- i18n: `src/locales/ja.json` and `ko.json` are flat maps of 506 keys each with zero `ja`-only keys; the
  only existing key containing `filter` is `review.items.filterRecheck`. The 7 new
  `review.check.filter.*` keys collide with nothing, and `src/lib/i18n.test.ts:19` (parity) and `:50-57`
  (`domain.*` terms) are both quoted accurately, including R2-m12's correction that `:50-57` guards
  `domain.*` keys and not `FindingKind` values. ✓

**Conclusion: the byte-identity guarantee holds against the round-3 DOM.** It is not affected by R3-B1.

## Focus-path walk requested by the review brief

Assuming the L252 code block as literally written (the stricter guard):

| Path | End state of `reviewFocus` | Correct? |
| :--- | :--- | :--- |
| (a) focus a row → change clearance basis → re-run | `null` — `result !== null` and `checkId` moves (`checkConditionsFingerprint` feeds the hash, `src/lib/review/geometry-check.ts:400`) | ✓ |
| (b) focus a row → switch tab away and back | non-`null`, no table to match it (`result` is `null` per `tests/e2e/uc25-joint-review.js:910-918`) | Unchanged from today and **explicitly chosen** by the plan (`step1-plan.md:214`); not a regression, but §4.6's tab-navigation bullet (`:589`) discusses only `result` and never says `reviewFocus` is deliberately kept — worth one sentence |
| (c) focus a row → select a different 柱 → re-run | `null` (new member fingerprints + `regionMm` ⇒ new `checkId`, `geometry-check.ts:397-402`) — **provided `result` was non-`null`**; `null`-`result` variant is R3-B1 | ✓ only in the non-remounted variant |
| (d) focus a row → apply a filter that hides it | `null` via the effect at `step1-plan.md:331-337`; `focusedFindingId` now lives at `ReviewCheckSection` (`:239`) so it survives nothing that matters here, and the deps (`setReviewFocus` from zustand, `setFocusedFindingId` from `useState`) are both stable ⇒ no render loop | ✓ |
| (e) focus a row → navigate away (unmount) | non-`null`; same as (b). Cleared on 案件 load (`src/lib/store.ts:189`); never persisted (`useProjectPersistence.ts:56-59` saves `{project, review}` only) | Unchanged from today; deliberate |

So the mutual destruction of R2-B2 **is** resolved — the lift is correct and the two mechanisms no longer
answer the same question differently *about a mounted subtree*. What remains is the `result === null`
branch, R3-B1.

---

## Findings from earlier rounds I confirm are genuinely closed

Re-verified against the round-3 text and the code; do not redo these.

1. **R2-B1 (focus-safe reset) — closed, with a real falsifier.** `step1-plan.md:216-219` and the JSX at
   `:386-394` use `aria-disabled={!active}` with `onClick={() => { if (!active) return; … }}` and no
   `disabled` attribute, so the HTML focus fixup rule never applies. The prescribed assertions
   `expect(resetButton).not.toBeDisabled()` and `toHaveAttribute('aria-disabled', 'true')`
   (`step1-plan.md:730-732`, `:735`) both fail on the round-2 design — in the default state *and* after
   activation — and jest-dom's `toBeDisabled` reads the `disabled` attribute, not `aria-disabled`
   (`vitest.ui.setup.test.ts:1` wires it; `package.json:37`). Residual: R3-m1 only.
2. **R2-B2's mutual destruction — closed.** `focusedFindingId` is lifted to `ReviewCheckSection`
   (`step1-plan.md:239`), passed down as props (`:249-250`, `:288-289`), and `ReviewCheckSection` is not
   keyed, so it survives the `key={result.checkId}` remount. The M4 effect therefore sees a live id across
   a re-check. Residual: R3-B1 (the `result === null` branch) and R3-M2 (render cost).
3. **R2-M1 (exhaustiveness binding) — closed.** `step1-plan.md:22-30` derives `ALL_FINDING_KINDS` from
   `Object.keys(KIND_TABLE)` where `KIND_TABLE` is `as const satisfies Record<FindingKind, true>`. One
   declaration; adding a fourth `FindingKind` (`src/domain/review/types.ts:48`) fails to compile. The cited
   precedent `src/components/viewer/palette.ts:5` is exact. R2-m2's unused-binding warning disappears with
   it. Residual: R3-M1 (the call-site type) and R3-m2 (the "test" for it).
4. **R2-M2's baseline half — closed.** §5.2 (`step1-plan.md:617-621`) and §6.3 (`:771-774`) now carry
   96 ms / 551 ms with their JSON pointers, the conditions pointer, and the `spread_note` caveat. Every
   number checks out against `phases/48-joint-review-ui/step9-report.json`. The AC's baseline half can now
   fail. Residual: R3-M3 (the threshold is too tight, not that it is missing).
5. **R2-M3 (vocabulary rationale + mis-citation) — closed.** `step1-plan.md:72-77` replaces the fabricated
   `viewer.layer.main` with `roleToLayer` at `src/lib/viewer/geometry.ts:78-85` and `:91-95`, both exact,
   and explicitly records that `腹筋`/`縦筋` are deliberately not folded into `主筋`. Round 2 offered this
   as fix option (b) and the plan took it. Residual: R3-m4 (point 4 overstates).
6. **R2-m1 (orphaned `review.check.filter.title`) — closed.** §2 item 5 (`step1-plan.md:523`) and §3
   (`:545`) now say 7 keys; the table lists exactly the seven the JSX renders. No `.title`.
7. **R2-m3 (`ReviewPane.test.tsx:829` promoted to an assertion) — closed.** `step1-plan.md:632` now calls
   it «Explanatory comment … documenting 698 rows and explaining the 20000ms timeout on line 831» —
   which is exactly what `src/components/review/ReviewPane.test.tsx:829` and `:831` are. §6.2 item 1
   (`:671`) now derives the count from `directGeometryCheck().findings.length`, matching the file's own
   oracle convention at `ReviewPane.test.tsx:167` and `:200`.
8. **R2-m4 (`original_failure` cited as current fact) — closed.** `step1-plan.md:637` labels it «archived
   pre-fix failure observation documented in `phases/48-joint-review-ui/step8-correction.md`».
9. **R2-m5 (§4.6's "any new check run" conflation) — closed.** `step1-plan.md:587-589` now separates the
   three mechanisms explicitly: `checkId` changes ⇒ remount + explicit clear; same-input re-run ⇒ same
   `checkId`, filter persists (citing `tests/e2e/uc25-joint-review.js:924`, which is
   `value.checkId === checkId1` ✓); tab navigation ⇒ `ReviewPane` unmounts and `result` resets (citing
   `:908-918` ✓). §6.2 item 9 (`:756-758`) tests the persistence branch.
10. **R2-m6 (reconciliation disagreement) — closed.** `safePairKey` is computed once and fed to both
    `isFilterActive(effectiveFilter)` and `filterFindings(…, effectiveFilter, memberKinds, safePairKey)`
    (`step1-plan.md:318-328`). The count, the reset-button state and the rows can no longer disagree.
11. **R2-m7 (a literal pair name + a non-falsifying assertion) — closed.** §6.2 item 3 (`:715-716`) now
    derives the pair from the `<select>` options at runtime, and the "table is not empty" assertion is
    gone. Residual: R3-m5 (which of the remaining assertions actually falsifies).
12. **R2-m8 (unpinned collator) — closed.** `localeCompare(right, 'ja')` in both `findingPairKey`
    (`step1-plan.md:132`) and `extractAvailablePairs` (`:147`); §6.1 item 5 (`:687-689`) now asserts
    symmetry plus pinned collation rather than a host-dependent literal.
13. **R2-m9 (memo on `[project]`) — closed as specified.** `step1-plan.md:236` memoises on
    `[project.members]`. *Not verified:* I did not trace the `input[aria-label$='断面 b']` commit path to
    confirm it leaves `project.members` referentially unchanged; the claim is plausible
    (`ReviewPane.test.tsx:252-255` shows the section-only update shape) and the magnitude is negligible
    either way.
14. **R2-m10 (rows lose DOM focus on remount) — closed by acknowledgement.** `step1-plan.md:221-222` states
    the behaviour and why it is benign (activating `検査を実行` has already moved focus out of the table).
15. **R2-m11 (two citation ranges off by one element) — closed.** §5.1 now heads the block «Lines 106–112 &
    124–130»; `tests/e2e/uc25-joint-review.js:106` is `const parseFindingRow = (cells) => {`, `:107` is the
    6-cell rule, `:124` is `const parseFindingRows = …`, `:127` the throw — all exact. §5.2 now says
    `budgetMet` is at `:253-255`; `tests/e2e/uc25-perf.js:253-255` is the `Object.keys(BUDGET_MS).every(…)`
    expression ✓. `BUDGET_MS` at `:31-36` ✓ and `measureCheck` at `:127-136` ✓.
16. **R2-m12 (overstated i18n guard) — closed.** `step1-plan.md:543` now says `i18n.test.ts:50-57` tests
    `domain.*` translation keys and that `FindingKind` values are union literals rendered raw.
17. **Round-1 open ground 1 (empty `result.findings`) — closed.** The empty notice is now gated on
    `filteredFindings.length === 0` alone (`step1-plan.md:425`), so the `未対象` path
    (`src/lib/review/geometry-check.ts:246-256`) is covered.
18. **Round-1 open ground 2 (two live regions) — closed.** Only the count `<span role="status"
    aria-live="polite">` (`step1-plan.md:381`) is a live region; the `<p>` carries no `role`
    (`:425-427`). §6.2 item 5 (`:739-740`) asserts the singularity.
19. **Round-1 open ground 3 (`hideExcluded` default) — closed.** Default `false`
    (`step1-plan.md:52`, `:567`), with §6.2 item 8 (`:751-754`) exercising both the default-visible case and
    the toggle, and `src/components/review/ReviewPane.test.tsx:189-201` (cited accurately) left passing.
20. **Round-1 open ground 4 (tab order) — closed by specification.** `step1-plan.md:224-225` states the
    linear order, and it matches the JSX emission order at `:316-397`.
21. **Round-1 B3, B1(algorithmic), M1, M2, M5, m1, m3, m4, m5 and the nine unrefuted claims** — round 2
    confirmed these and nothing in round 3 disturbs them. `docs/ADR.md:1074` (ADR-049 결정 5) and
    `CLAUDE.md:24` are still quoted verbatim at `step1-plan.md:6` ✓; `ReviewPane.tsx:77` is still
    `const CHECK_KINDS: FindingKind[] = …` ✓; `ReviewPane.tsx:79-83` is still `formatBarRef` with the
    `ref.memberId` fallback at `:81` ✓; all types the new props need are exported
    (`src/lib/store.ts:23,26,30`, `src/domain/review/types.ts:137`, `src/lib/review/joint-layout.ts:22`) ✓.

---

## Not verified

- **No build, test, or browser was run.** R3-M1 is a type-assignability argument
  (`readonly FindingKind[]` → `FindingKind[]` under `tsconfig.json:7` `"strict": true`), not a `tsc` run.
  R3-M2's magnitude is an operation count from the code path, not a measurement — I claim only that a full
  table re-render is newly introduced on row click, not how many milliseconds it costs. R3-M3 is arithmetic
  over the recorded raw samples, not a re-measurement.
- **R3-B1 step 3–4** rests on `tests/e2e/uc25-joint-review.js:910-918` asserting the review pane's check
  result is gone after a tab round-trip. I did not read `AppShell`'s tab rendering to confirm *which*
  component unmounts; the E2E assertion is sufficient for the argument (`result` is `null` on re-entry)
  but I did not independently confirm that `ReviewCheckSection` rather than some inner wrapper is the one
  destroyed. If `ReviewCheckSection` somehow survived, `focusedFindingId` would survive with it and
  R3-B1 would not be reachable by that route — but `result` demonstrably does not survive, and `result`
  and `focusedFindingId` are siblings in the same component per `step1-plan.md:239` and
  `src/components/review/ReviewPane.tsx:130`.
- I did not re-derive the 698 / 106 / 592 split from `runGeometryCheck`; it is consistent across
  `phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table` and the comment at
  `src/components/review/ReviewPane.test.tsx:829`, as both prior rounds recorded.
- I did not count `createStressProject`'s members for R3-M2; `scripts/perf/stress-fixture.ts:19`
  (`xSpanCount: 4, ySpanCount: 3, storyCount: 5`) is the only input I read, and "several hundred" is an
  estimate from the grid, not a count.
- Areas the brief asked me to open and where I found **nothing to report**: state persistence across
  save/restore (`src/lib/hooks/useProjectPersistence.ts:24-60` stores `{project, review}` only — filter
  state is component-local and correctly does not survive a reload, and does not trigger spurious
  autosaves); the compare/baseline flow (`src/components/review/ReviewPane.tsx:760-830` — `review-compare`
  is a separate `<section>`, the filter touches none of its testids); the work-package flow
  (`src/components/review/WorkPackageBoard.tsx:311` — a different tab, unmounted while the filter exists);
  sorting (findings are ordered by `findingOrder` → `clearanceMm` → `id` at
  `src/lib/review/geometry-check.ts:393-395`, and `Array.prototype.filter` preserves that order — the plan
  adds no sort UI); and large-result rendering beyond R3-M2.
