VERDICT: REFUTED

# Phase 50-1 — Findings Table Filter: Independent Falsification, Round 4 (final gate)

Reviewer: independent (did not author the plan, did not write rounds 1–3, will not implement).
Checkout: `632bead fix(49-joint-review-defects): close the cross-verification findings` (`git log --oneline -3`
confirms HEAD).
Scope, per the brief: the consequences of R3-B1's fix; whether the round-3 fixes landed and are sound;
a duplicate-specification sweep; and the material the revision added (819 → 876 lines). The byte-identity
guarantee and R2-B2's mounted-subtree resolution were **not** redone (round 3 re-derived both), and round 3's
"confirmed closed" list was not redone. No file edited except this one. No build, test or browser run —
everything I could not verify is named in "Not verified".

**Headline.** R3-B1's fix is correct and its consequences are safe: I re-walked (a)–(e) under
`nextResult.checkId !== result?.checkId` and the one newly-reachable clear (`result === null`) can never
destroy a live focus, only a stale one. R3-M1, R3-M3 and R3-m3…m6 are genuinely closed. R3-M2 was closed the
strong way (`React.memo`) and the memo really does hold — I traced all eight props to a stable source.

What is left is one defect, and it is the *same shape* as R3-B1: §6.2 item 2 prescribes the keyboard
activation of the reset button two ways in one sentence, and the first of the two cannot make the
assertion that follows it pass. That is R4-B1. It is a one-clause edit; everything else below is
non-blocking.

---

## BLOCKER

### R4-B1. §6.2 item 2 gives two activation methods for the reset button; the first one cannot pass, and the plausible repair for it changes shipped code

`phases/50-review-filter/step1-plan.md:765`:
> Trigger activation via keyboard: `fireEvent.keyDown(resetButton, { key: 'Enter' })` (or click).

`:766` (the very next line) then asserts the reset actually happened:
> Verify `resetButton.getAttribute('aria-disabled')` is `"true"`.

`:761` established the pre-state as `aria-disabled="false"` (a chip was deselected at `:760`), so `:766`
only passes if the click handler ran and called `setFilter(defaultFindingFilterState())`.

The reset button as specified carries **only** `onClick` — `step1-plan.md:481-491`:
```tsx
<button type="button" className={styles.filterResetButton} aria-disabled={!active}
  onClick={() => { if (!active) return; setFilter(defaultFindingFilterState()) }}>
```
jsdom does not implement the activation behaviour of keyboard events: a dispatched `keydown` on a
`<button>` does not synthesize a `click`, so `onClick` never runs, `filter` is unchanged, `active` stays
`true`, and `:766` reads `"false"`. The repo already encodes this knowledge — the finding rows need an
explicit handler for exactly this reason (`src/components/review/ReviewPane.tsx:347`
`onKeyDown={(event) => { if (event.key === 'Enter') focusFinding(finding) }}`, reproduced at
`step1-plan.md:330`), while the reset button deliberately has none because a native `<button>` is
activated by Enter/Space by the browser.

Why this is not merely a red test. A coding agent that takes the first-listed method has three exits:
switch to `.click()` (correct, and offered in the same parenthesis); **add an `onKeyDown` handler to the
reset button** to make the test go green — a change to shipped JSX that appears nowhere in §1.4 or §2; or
delete the `aria-disabled === "true"` post-activation assertion — which removes precisely the falsifier
round 3 confirmed as the one thing that fails on the round-2 design
(`step1-falsification-r3.md:316-322`). The plan does not say which of its two methods is the written one.
That is R3-B1's failure mode transplanted into the acceptance criteria.

The surrounding remediation for R3-m1 is otherwise correct and I am not reopening it: `:763-764` do
prescribe `resetButton.focus()` first, and `:772` correctly states that the `activeElement` assertion is a
regression guard only because jsdom lacks the focus-fixup rule. The defect is confined to the activation
verb.

**Minimal fix:** replace `step1-plan.md:765` with
> - Trigger activation: `fireEvent.click(resetButton)`. (jsdom does not synthesize a click from a
>   `keyDown`; the reset button intentionally has no `onKeyDown`, because a native `<button>` is activated
>   by Enter/Space in a real browser.)

One line; delete the `keyDown` alternative. No other text changes.

---

## MAJOR

### R4-M1. The code the R3-M2 fix introduced references `React` and `useCallback`, neither of which is importable in `ReviewPane.tsx` as written, and §2 does not list the imports to add

This arrived with the revision, so it is unreviewed by rounds 1–3.

- `step1-plan.md:309` — `const FindingsTableBody = React.memo(function FindingsTableBody({…})`
- `step1-plan.md:549` — §2 item 3 repeats it: «row rendering in memoised `FindingsTableBody` (`React.memo`)»
- `step1-plan.md:388` — `const focusFinding = useCallback(…)`

`src/components/review/ReviewPane.tsx:3` is the file's only `react` import:
`import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'` — no default/namespace
`React`, and no `useCallback`. `grep -rn "React\." src/` returns **zero hits repo-wide**, and
`grep -rn "useCallback\|memo(" src/ --include=*.tsx` likewise returns zero — this codebase has no precedent
for either. `tsconfig.json` sets `"jsx": "preserve"` and does not set `allowUmdGlobalAccess`, so `React` in
a module file is the UMD-global error TS2686 (`@types/react` declares `export as namespace React`), not a
resolvable name. `npm run build` fails on `step1-plan.md:309` as written.

The same omission covers the type names the new prop interfaces need. `step1-plan.md:284-307` uses
`ReviewState`, `JointLayout`, `Locale`, `ViewerMode` and `AppState`. Round 3 confirmed all five are
*exported* (`src/domain/review/types.ts:137`, `src/lib/review/joint-layout.ts:22`, `src/lib/store.ts:23,26,30`)
— correct — but none of the five is currently *imported* into `ReviewPane.tsx` (`ReviewPane.tsx:20-28`
imports `Baseline, CheckExclusion, ElementRef, FindingKind, ClearanceBasis, RecordedFinding, ReviewItem`
only; `ViewerMode`/`Locale` appear in the file exclusively as inferred zustand selector results, e.g. `:107`).
§2 item 3 (`:544-553`) enumerates the file's changes and lists only the six `@/lib/review/finding-filter`
imports.

Unlike R3-M1, there is no harmful cheap repair here — `import { memo, useCallback } from 'react'` plus the
five `import type` additions is the only sensible resolution, and a compile error is self-announcing. So
this is MAJOR (prescribed code does not compile, the same class round 3 rated MAJOR for R3-M1) but
**non-blocking**.

**Fix:** in `step1-plan.md:309` write `const FindingsTableBody = memo(function FindingsTableBody(…)`, and
add to §2 item 3: «Extend the `react` import at `ReviewPane.tsx:3` with `memo` and `useCallback`; add
`import type { ReviewState } from '@/domain/review/types'`, `JointLayout` from `@/lib/review/joint-layout`,
and `Locale, ViewerMode, AppState` from `@/lib/store`.»

---

## MINOR (non-blocking)

### R4-m1. §2 item 7 says the default chip state is «unpressed»; §6.2 item 1 and the JSX say pressed

`step1-plan.md:568` — «Default **unpressed**/all-visible state renders full row count dynamically derived
from `directGeometryCheck().findings.length`».
`step1-plan.md:754` — «Verify kind chips have `aria-pressed="true"`.»
The JSX is unambiguous and agrees with §6.2: `:423` `const pressed = filter.kinds.has(kind)` with
`:429` `aria-pressed={pressed}`, and `defaultFindingFilterState()` seeds `kinds` with all three
(`:47`). A test written from `:568` would assert `aria-pressed="false"` and fail. Same rule, two
statements, one wrong. Suggested edit: «Default all-selected / all-visible state …».

### R4-m2. §6.2 item 3's setup can be read as selecting `all`, which makes both of that test's dropdown assertions vacuous

`step1-plan.md:774` — «Dynamically select the first available pair from `select` options
(`availablePairs[0]`)»; `:775` — «Assert `select.value === availablePairs[0]`».
The `<select>`'s **first option is `all`** (`:456`), and the pair options follow (`:457-461`). An agent
that reads "first … from `select` options" literally takes `options[0].value === 'all'`; then `:775`
passes trivially and the post-re-run `expect(select.value).toBe('all')` at `:781` passes without the
remount having reset anything. That re-creates exactly the non-falsifying-assertion problem R2-m7 removed
and R3-m5 relabelled. Suggested edit: «select `select.options[1].value` (the first entry after
`すべてのペア`); assert it is not `'all'`, then assert `select.value` equals it».

### R4-m3. §6.1 item 1's `expectTypeOf` check is tautological

`step1-plan.md:716` — «Can be type-tested via
`expectTypeOf<typeof ALL_FINDING_KINDS>().toEqualTypeOf<readonly FindingKind[]>()`».
`ALL_FINDING_KINDS` is declared with that exact annotation at `:28`
(`export const ALL_FINDING_KINDS: readonly FindingKind[] = …`), so the assertion restates the annotation
and holds no matter what `KIND_TABLE` contains — it cannot observe a desynchronised table. The bullet's
preceding sentence is the correct account («strictly enforced by `tsc` / `npm run build`»); the
`satisfies` clause at `:26` is the real guard. Offering this as a type test invites a reader to treat a
green run as evidence of exhaustiveness. Suggested edit: drop the `expectTypeOf` sentence, or replace it
with a check that can fail, e.g. `expectTypeOf<keyof typeof KIND_TABLE>().toEqualTypeOf<FindingKind>()`.

### R4-m4. §6.2 item 7 presents the archived 106/592 split as the live setup, while §5.4 labels the same pointer as archived

`step1-plan.md:708` (§5.4) — «`{"干渉候補": 106, "接触": 592}` (**archived pre-fix failure observation**
documented in `phases/48-joint-review-ui/step8-correction.md` …)» — this is R2-m4's correction, correctly
applied.
`step1-plan.md:801` (§6.2 item 7) — «Run initial check (106 `干渉候補`, 592 `接触`, total 698 per
`step8-report.json#/original_failure/observed_table/kinds`)», and `:802` «only 592 `接触` rows remain
visible». Same pointer, two characterisations. The test's actual assertions (`:803`, `:804`) derive from
the findings at runtime and do not depend on the numbers, so nothing breaks — but a reader following §6.2
alone will treat an archived failure observation as a current fact, which is what R2-m4 was about.
Suggested edit: append «(archived observation; the test derives the visible rows at runtime)».

---

## Part 1 — R3-B1's fix: consequences under the new guard

The guard is now `nextResult.checkId !== result?.checkId` in all six places (textual consistency taken as
given per the brief). Re-walking round 3's paths under it:

| Path | End state of `reviewFocus` | Change vs round 3 | Correct? |
| :--- | :--- | :--- | :--- |
| (a) focus a row → change clearance basis → re-run | `null` (`result` non-`null`, `checkConditions` feeds the hash — `src/lib/review/geometry-check.ts:400`) | none | ✓ |
| (b) focus a row → switch tab away and back | survives the unmount (store state, `src/lib/store.ts:42-46`,`:154`), **then cleared by the next `検査を実行`** because `result === null` | **this is the fix**: the previously permanent dangle now ends at the next check | ✓ |
| (c) focus a row → select a different 柱 → re-run | `null` in both variants — the non-remounted one via `result.checkId`, the `result === null` one via `result?.checkId` | R3-B1's branch now closed | ✓ |
| (d) focus a row → apply a filter that hides it | `null` via the effect at `:380-385`; deps (`setReviewFocus` from zustand, `setFocusedFindingId` from `useState`) are stable ⇒ no loop | none | ✓ |
| (e) focus a row → navigate away (unmount) | as (b); also cleared on 案件 load (`src/lib/store.ts:189`) | improved with (b) | ✓ |

**Does the extra clear destroy anything that should have survived?** No. The newly-reachable branch is
exactly `result === null`, and within a single mount `reviewFocus` can only be set from a findings row
(`focusFinding` is reachable only from `<tr>`s, which render only when `result !== null` — `:260`,
`:496-508`; `setReviewFocus` has exactly one production call site, `src/components/review/ReviewPane.tsx:205`,
confirmed by `grep -rn setReviewFocus src/`). So when `result === null`, any non-`null` `reviewFocus`
necessarily belongs to a *previous* mount and points at bars that are not in the joint about to be
displayed — precisely the value R2-B2 wanted gone. The remaining sub-case is `reviewFocus` already `null`
(first check of a session), where the call is inert.

**The inert call is also side-effect-free.** `setReviewFocus(null)` (`store.ts:153-154`) publishes a new
root state object, but no component subscribes without a selector
(`grep -rn "useAppStore()" src/` → 0 hits) and the only `useAppStore.subscribe` is
`src/lib/hooks/useProjectPersistence.ts:56-57`, which autosaves **only** when
`project !== previous.project || review !== previous.review`. So no spurious IndexedDB write per check
click. Selector consumers (`Viewer3D.tsx:1837`) compare with `Object.is` and see `null → null`.

**E2E safety of the more-frequent clear — re-confirmed at the source.** `data-review-focus` is read in the
whole repo at exactly three places, all inside Scenario 6: `tests/e2e/uc25-joint-review.js:884`
(`focusBefore`, before the row click), `:887` (`waitForSelector` after the click at `:886`) and `:892`
(re-read in the same `evaluate`). The Scenario-7 re-run at `:919` comes *after* all three, and
`readCheckResult` (`:243-255`) reads only `checkId`, `findings`, `verdicts`, `unchecked` — never the focus
attribute. `awk 'NR>919 && /接合部の配筋3D/'` over the file returns nothing, so no later scenario waits on
the joint canvas either, and Scenario 8's row action (`:939`) is focus-independent. Under the new guard the
`:919` click does clear the marker Scenario 6 set — and no assertion observes it. ✓

`src/components/review/ReviewPane.test.tsx:204-220` runs the check at `:207` **before** the row click at
`:209`, so the extra clear fires against an already-`null` value and the focus assertions at `:211-219` are
untouched. Sweeping the rest of the file, all six `検査を実行` clicks (`:157`, `:182`, `:197`, `:207`,
`:265`, `:275`) occur before any row click in their test, so none of them depends on a pre-existing
`reviewFocus` surviving a check. ✓

`tests/e2e/uc25-perf.js` never clicks a row at all — its single `review-findings` reference is the wait
selector at `:133` — so the guard is invisible to the perf gate. ✓

---

## Part 2 — did the round-3 fixes land, and are they sound?

**R3-M1 — real.** `step1-plan.md:14` and `:546` now prescribe `kinds: [...ALL_FINDING_KINDS]` at
`ReviewPane.tsx:177` and keep `ALL_FINDING_KINDS` `readonly` (`:28`). The spread produces a fresh mutable
`FindingKind[]`, assignable to `src/domain/review/types.ts:96` (`kinds: FindingKind[]`), so the compile
error is gone and the module-level aliasing round 3 warned about is avoided — each manual exclusion gets
its own array. Additionally verified, because it was not in round 3's argument: `Object.keys` preserves
insertion order for non-integer keys, so `['干渉候補','あき不足候補','接触']` is byte-identical to today's
`CHECK_KINDS` (`ReviewPane.tsx:77`); since `exclusions` feed `checkConditionsFingerprint`
(`geometry-check.ts:400`), an order change would have moved every `checkId` and broken
`tests/e2e/uc25-joint-review.js:924`. It does not.

**R3-M2 — real, and closed the strong way.** The plan took the memoisation option, not the
cost-confession option (`:214`, `:309-344`, `:387-408`, `:549`). The claim «row clicks … without
re-rendering the 698 `<tr>` elements» is true only if every `FindingsTableBody` prop is referentially
stable across a `focusedFindingId`-only update; I traced all eight:
- `findings` ← `filteredFindings` `useMemo([result.findings, effectiveFilter, memberKinds, safePairKey])`
  (`:374-377`); `effectiveFilter` `useMemo([filter, safePairKey])` (`:368-371`); `safePairKey` is a string
  compared by value (`:367`); `availablePairs` `useMemo([memberKinds, result.findings])` (`:361-364`). Stable.
- `memberKinds` ← `useMemo([project.members])` (`:232-235`) — survives the parent's own re-render. Stable.
- `project`, `review`, `locale` ← zustand selectors (`ReviewPane.tsx:101-104`). Stable.
- `checkId`, `jointColumnMemberId` ← primitives off `result`. Stable.
- `onCreateItem` ← `requestItem`, defined in **`ReviewPane`** (`ReviewPane.tsx:1271`, passed at `:1290`).
  A `useState` update inside `ReviewCheckSection` does not re-render its parent, so the prop keeps its
  identity. (Worth noting because `ReviewCheckSection`'s default parameter `onCreateItem = () => {}` at
  `ReviewPane.tsx:100` *would* mint a new function each render — it is never reached, since `ReviewPane`
  always passes `requestItem`.) Stable.
- `onFocus` ← `focusFinding` `useCallback([layout, project, setFocusedFindingId, setReviewFocus, setViewerMode])`
  (`:388-408`); `layout` `useMemo` (`ReviewPane.tsx:114-124`) over `currentSnapshot.*`, which is memoised in
  `src/lib/hooks/useReviewModel.ts:62-65` over `useTakeoff()`, itself `useMemo([project])`
  (`src/lib/hooks/useTakeoff.ts:73-77`); `joint` from `useMemo([project, memberId])`
  (`ReviewPane.tsx:109-113`); the two zustand setters and the `useState` setter are stable by construction. Stable.
So `React.memo`'s shallow compare holds and the paragraph at `:214` is now honest. (`ReviewCheckSection`
itself still re-renders on a row click — verdicts, scope lists, the exclusion form — which the plan does
not mention; that is bounded work, not the 698-row scan R3-M2 was about, so I am not raising it.) The only
residue is R4-M1, the import.
I also checked the thing the revision quietly rewrote: `FindingsTableBody`'s JSX (`:320-343`) reproduces
`ReviewPane.tsx:337-358` cell-for-cell — same seven `<td>`s in the same order with the same expressions,
same `key`/`tabIndex`/`onClick`/`onKeyDown`, `styles.excluded` span unchanged. This matters because round 3
verified byte identity against a DOM in which the table body had *not* been re-typed; `readFindingRows`
(`uc25-joint-review.js:257-263`) and `parseFindingRow`'s ≥6-cell rule (`:106-112`, throw at `:124-130`)
read those cells. No drift. ✓

**R3-M3 — real, and the arithmetic holds against the cited baseline.** Checked every figure against
`phases/48-joint-review-ui/step9-report.json`: `#/perf_browser/raw_samples/sample/check` = `[88,70,231,96]`,
warm-up discarded by `median3(check.slice(1))` (`tests/e2e/uc25-perf.js:206`), median of `[70,231,96]` = 96
= `#/perf_browser/sample/check_ms` ✓; `stress5` raw `[397,230,551,572]`, median of `[230,551,572]` = 551 ✓.
231/96 = 2.406 ✓ (`:691`, `:827`); 350/96 = 3.646 → «3.65×» ✓; 1200/551 = 2.178 → «2.18×» ✓. The
`conditions` and `spread_note` quotations (`:693`, `:694`) are verbatim, including 3034 vs 3000 and 765 vs
500. Soundness: both thresholds now sit **above every raw sample ever recorded for that metric** (350 > 231;
1200 > 572), so a 3-sample median cannot reach them without at least two samples worse than anything
observed — the "fires on noise" objection is answered rather than deferred. The host-comparability caveat
R3-M3 asked for is present and stated twice, consistently (`:698`, `:830`). `BUDGET_MS` (`uc25-perf.js:31-36`),
`measureCheck` (`:127-136`) and `budgetMet` (`:253-255`) are all cited at the right lines.

**R3-m1 — addressed except for the activation verb.** `:763-764` prescribe `resetButton.focus()` first,
and `:772` states plainly that jsdom lacks the focus-fixup rule and that the `activeElement` assertion is a
regression guard while the real property is established structurally by `not.toBeDisabled()`. That is
exactly what R3-m1 asked for. The residue is R4-B1.

**R3-m2 — addressed.** `:716` now attributes the guard to `tsc`/`npm run build` and the runtime bullets
(`:718-719`) check only that `ALL_FINDING_KINDS` derives from `Object.keys(KIND_TABLE)` and holds the three
literals. The hard-coded triple is acceptable here in a way R2-m3's 698 was not — it is the definition of a
three-member union at `src/domain/review/types.ts:48`, not a derived quantity — and the `satisfies`
precedent `src/components/viewer/palette.ts:5` is exact (`} as const satisfies Record<RebarZone['kind'], string>`).
Residue: R4-m3, the tautological `expectTypeOf`.

**R3-m3 — real.** `:802` now reads `kinds = new Set(['あき不足候補', '接触'])` and spells out the
0-occurrence consequence. Residue: R4-m4, the citation framing.

**R3-m4 — real.** `:76` no longer claims a general `G`/`C` prefix property; it now says section marks are
user-defined, cites `sectionMarkLabel` at `src/domain/model/member.ts:382-386` (exact — the function spans
those lines), and rests the bridge on `member.kind` + normalized role group, which is a real invariant
(`MemberKind` is closed: `src/domain/model/member.ts:90,205,277,355`).

**R3-m5 — real.** `:778-779` label `expect(useAppStore.getState().reviewFocus).toBeNull()` as the
«Genuinely falsifying assertion for R2-B2 focus reset», and `select.value` is demoted to
«Invariance / state reset assertions» (`:780-782`). Residue: R4-m2, the setup that can make those
assertions vacuous.

**R3-m6 — real.** `:797` inserts «Re-select `干渉候補` chip (restoring all kind chips to selected state)»
before the second half, so the sequence is executable. Also checked that the rows it names exist and are in
the order it assumes: `findingOrder` gives `CLASH` 0 (`src/lib/review/geometry-check.ts:242-243`) and the
sort is kind → clearance → id (`:393-395`), so `findings[0].kind === '干渉候補'` — §6.2 items 6 and 7 both
name the right rows.

**Round 3's requested sentence about path (b) — added.** `:628` now says `reviewFocus` is deliberately
preserved across tab navigation «until explicitly cleared by `runCheck` on a new check or by project
reload (`src/lib/store.ts:189`)», which is accurate under the new guard.

---

## Part 3 — duplicate-specification sweep

Every rule I could find stated more than once, mechanically compared:

| Rule | Where stated | Agree? |
| :--- | :--- | :--- |
| focus-clear guard | `:212`, `:252`, `:548`, `:626`, `:779`, `:869` | ✓ (given per brief) |
| perf thresholds 350 / 1200 | `:696-697`, `:826-829`, Risk 2 `:856` | ✓ |
| budget `check_ms <= 3000` | `:69`, `:699`, `:822-823`, `:851` | ✓ |
| baselines 96 / 551 | `:691-692`, `:826`, `:828`, `:851` | ✓ |
| host-comparability caveat | `:698`, `:830` | ✓ |
| 7 i18n keys | `:560`, `:563`, `:584`, `:875`; table `:588-594` = exactly the 7 `t()` call sites (`:419,450/452,456,472,479,490,513`) | ✓ |
| `hideExcluded` default `false` | `:49`, `:574`, `:606`, `:703`, `:756` | ✓ |
| empty notice: outside table, no `role="status"`, gated on `filteredFindings.length === 0` | `:224`, `:511-515`, `:552`, `:573`, `:615`, `:787` | ✓ |
| single live region (count span) | `:223`, `:477`, `:788`, `:791` | ✓ |
| reset button: `aria-disabled`, no `disabled`, early-return | `:216-218`, `:481-491`, `:551`, `:557`, `:570`, `:757`, `:759`, `:771` | ✓ |
| `key={result.checkId}` remount | `:206`, `:265`, `:549`, `:626`, `:861` | ✓ |
| `memberKinds` memo on `[project.members]` | `:209`, `:234`, `:547`, `:853` | ✓ |
| collation pinned to `'ja'` | `:132`, `:148`, `:529`, `:738` | ✓ |
| `safePairKey` fed to both `isFilterActive` and `filterFindings` | `:220-221`, `:367-377`, `:862` | ✓ |
| tab order | `:228` vs JSX emission order `:417 → :451 → :467 → :481 → :496` | ✓ |
| CSS class list | §2 item 4 `:556` names 9 classes = the 9 `styles.*` the new JSX uses (`.table`/`.excluded` pre-exist) | ✓ |
| default row count oracle derived, not hardcoded | `:568`, `:702`, `:755` | ✓ |
| **chip default state** | `:568` «unpressed» vs `:754` «`aria-pressed="true"`» vs `:423` | ✗ **R4-m1** |
| **106/592 provenance** | `:708` «archived» vs `:801-802` stated as live | ✗ **R4-m4** |
| **reset-button activation method** | `:765` `keyDown` vs `:765` «(or click)» vs `:481-491` (onClick only) | ✗ **R4-B1** |

---

## Part 4 — what the revision added

The growth is concentrated in five places, all of which I reviewed above rather than inheriting:
`FindingsTableBody` + its props interface and the `useCallback` `focusFinding` (`:298-344`, `:387-408`,
the R3-M2 fix — sound, modulo R4-M1); the rewritten cost paragraph (`:214` — now true); the threshold
arithmetic (`:695-698`, `:825-830` — verified); the jsdom/`activeElement` note and keyboard steps
(`:762-772` — R4-B1); and the smaller R3-m2…m6 edits (`:76`, `:628`, `:716-719`, `:778-783`, `:796-799`,
`:802`). I found no added text that contradicts retained text apart from the three rows marked ✗ above.

---

## Cleared for implementation

Positively verified in this round, at the source:

1. **R3-B1's fix is consequence-safe.** The `result === null` branch cannot hold a live focus (only
   `ReviewPane.tsx:205` writes `reviewFocus`, reachable only from rendered rows), so the extra clear only
   ever destroys a stale cross-joint marker. Paths (a)–(e) re-walked; (b) and (e) improve, (a)/(c)/(d) unchanged.
2. **The extra clear is invisible to every gate.** `data-review-focus` is read only at
   `uc25-joint-review.js:884/887/892`, all before the Scenario-7 re-run at `:919`; nothing after `:919`
   reads it or waits on the joint canvas; `ReviewPane.test.tsx:204-220` checks before it clicks; all six
   `検査を実行` clicks in the unit tests precede their row clicks; `uc25-perf.js` never clicks a row.
3. **The inert clear costs nothing.** No selector-less store subscriber exists; the one
   `useAppStore.subscribe` (`useProjectPersistence.ts:56-57`) guards on `project`/`review` identity, so no
   autosave is triggered.
4. **R3-M1 is genuinely closed**, including the part round 3 did not check: `Object.keys` insertion order
   keeps the exclusion `kinds` array byte-equal to today's, so `checkConditionsFingerprint` and every
   `checkId` are unmoved.
5. **R3-M2 is genuinely closed the strong way** — all eight memo props traced to stable sources through
   `useReviewModel`/`useTakeoff`; and the newly re-typed `FindingsTableBody` markup is cell-for-cell
   identical to `ReviewPane.tsx:337-358`, so the E2E row parser and the byte-identity boundary are untouched
   by the revision.
6. **R3-M3's numbers and arithmetic check out** against `step9-report.json`, and both thresholds now clear
   every recorded raw sample.
7. **R3-m3, m4, m5, m6 are closed**; R3-m1 and R3-m2 are closed except for the residues named as R4-B1 and R4-m3.
8. **Type-level spot checks on the new module all pass by inspection:** `BarRef.role` is `RebarRole`
   (`geometry-check.ts:37`) so `normalizeRoleGroup(ref.role)` type-checks and all five `switch` cases are
   real union members (`roleToLayer` uses the identical five at `src/lib/viewer/geometry.ts:78-85`);
   `Finding.excludedBy: string | null` (`:55`); `jointRef: { columnMemberId: string }` (`:97`);
   `new Map(project.members.map((m) => [m.id, m.kind]))` infers a tuple through the `Map` constructor's
   contextual type, with in-repo precedent at `src/domain/review/readiness.ts:79`, and
   `Map<string, MemberKind>` is assignable to `ReadonlyMap<string, string>`.
9. **i18n is safe:** `t(locale, key: string)` is untyped over a flat map with a key-itself fallback
   (`src/lib/i18n.ts:6-10`), so `review.check.filter.pair` and `review.check.filter.pair.all` cannot
   collide; `src/lib/i18n.test.ts:19` (parity) and `:50-57` (`domain.*`) are quoted accurately.
10. **Every `file:line` citation I checked resolves**: `uc25-joint-review.js:106-112`, `:124-130`,
    `:248-255`, `:257-263`, `:760-773`, `:776-780`, `:784-787`, `:815-829`, `:886`, `:920-933`;
    `uc25-perf.js:31-36`, `:127-136`, `:206`, `:253-255`; `ReviewPane.test.tsx:167`, `:189-201`, `:209`,
    `:829`/`:831`; `types.ts:48`, `:96`; `palette.ts:5`; `viewer/geometry.ts:78-85`, `:91-95`;
    `member.ts:382-386`; `store.ts:189`.

**One blocker stands between this plan and a clean gate, and it is a one-clause edit to
`step1-plan.md:765`.** Apply R4-B1's fix (and, cheaply, R4-M1 and the four MINORs) and the plan is
implementable as written.

---

## Not verified

- **No build, test or browser was run** (per the brief). R4-M1 is a name-resolution argument (TS2686 for a
  UMD global in a module file, given `tsconfig.json` has no `allowUmdGlobalAccess` and `src/` contains zero
  `React.` usages), not a `tsc` run. The two `as` casts the new module needs
  (`Object.keys(KIND_TABLE) as readonly FindingKind[]` at `:28`, `findings as Finding[]` at `:197`) I judge
  legal only via TypeScript's *comparability* rule, not assignability; I found **no
  `Object.keys(...) as ...` precedent in this repo** to confirm the first by example, so treat it as
  reasoned, not observed. If it errors, the repair is inert (annotate `KIND_TABLE`'s keys or cast through
  `as unknown`).
- R4-B1 rests on jsdom not implementing keyboard activation behaviour for `<button>`. I did not run the
  test; the corroborating in-repo evidence is that the finding rows need an explicit Enter handler
  (`ReviewPane.tsx:347`) and that `fireEvent` (not `userEvent`) is this file's convention.
- Byte identity and R2-B2's mounted-subtree resolution were **excluded by the brief** and not re-derived;
  I confirmed only that the revision's new table markup does not disturb the former.
- Round 3's "confirmed closed" list (items 1–21) was not redone.
- I did not re-derive the 698 / 106 / 592 split from `runGeometryCheck`, and I did not measure R3-M2's
  render cost — I verified that the `React.memo` holds (prop stability), not how many milliseconds it saves.
- R3-M2's fix leaves `ReviewCheckSection` re-rendering its non-table JSX on every row click; I did not
  quantify that and do not raise it, since the plan's claim is scoped to the `<tr>` elements.
