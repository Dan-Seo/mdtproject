# Phase 49-1 — Findings Table Filter: Independent Falsification

VERDICT: REFUTED

Reviewer: independent (did not author the plan, will not implement it).
Checkout: `632bead fix(49-joint-review-defects): close the cross-verification findings`.
Method: every `file#Lnnn` in the plan re-read at that line in this checkout; every selector in
`tests/e2e/uc25-joint-review.js`, `tests/e2e/uc25-perf.js`, `src/components/review/ReviewPane.test.tsx`
and `src/app/page.test.tsx` enumerated and checked against the proposed DOM. No file was edited except
this one. No build, test, or browser was run — where that limits a claim, it is said so explicitly.

The plan's headline claim (§4, plan L333–365) survives. Three other things do not.

---

## BLOCKERS

### B1. `tests/e2e/uc25-perf.js` does not appear anywhere in the plan, and the plan's design lands inside its measured budget

`tests/e2e/uc25-perf.js` exists and enforces a hard budget on exactly the render the plan is changing.

- `tests/e2e/uc25-perf.js:31-36` — `const BUDGET_MS = { joint_tab_ms: 1500, check_ms: 3000, compare_ms: 3000, tab_switch_ms: 500 }`.
- `tests/e2e/uc25-perf.js:127-136` — `measureCheck` times from clicking `検査を実行` until
  `waitSelector: "[data-testid='review-findings']"` is `present`.
- `tests/e2e/uc25-perf.js:253-255` — `budgetMet` requires **both** the sample project and the
  5階ストレス案件 to be within budget.
- `tests/e2e/uc25-perf.js:251` — `const stress5 = await measureProject(...)`, run against the fixture
  loaded at `:242-246` from `stress5.json` (the `scripts/perf/stress-fixture.ts 5` output named in
  `CLAUDE.md` 명령어).

The plan puts `extractAvailablePairs(project, result.findings)` in a `useMemo` that runs in the same
React commit that first mounts the table (plan L166-169), and `extractAvailablePairs` calls
`findingPairKey` → `barMemberRole`, which is a **linear scan of `project.members` per bar reference**
(plan L79: `project.members.find(({ id }) => id === ref.memberId)`), twice per finding (plan L90-92).
That is `O(findings × members)` added to the budgeted path. `timeUntil` settles on the selector being
*present* (`uc25-perf.js:80`), and React commits the filter bar and the table together, so the cost is
inside the measurement, not after it.

The plan's only performance statement is §7 Risk 2 (plan L572-578): it discusses `filterFindings` and
asserts "Filtering 698 in-memory JavaScript objects takes < 1ms". That claim (a) is unmeasured and
uncited, (b) is about the wrong function — `filterFindings` short-circuits in the default state and
never runs the member scan, while `extractAvailablePairs` runs the member scan *unconditionally on
every check*, and (c) is scoped to 698 findings on the sample project, not to the 5階 stress project
that `budgetMet` also gates.

This is the plan's own abandonment criterion for Risk 2 ("If profiling reveals filter state changes
exceed 16ms frame budget"), stated against a budget the plan did not know existed.

**Failure scenario:** `npx dev-browser --browser kijun --timeout 300 run tests/e2e/uc25-perf.js` on the
5階 fixture; `stress5.check_ms` exceeds 3000; `budgetMet === false`. The plan asserts "Zero changes to
`tests/e2e/uc25-joint-review.js`" (plan L554) and lists five `uc25-joint-review` checks (plan L557-561)
as the E2E surface — `uc25-perf.js` is not named once in 589 lines.

**Minimal fix:** (1) add `tests/e2e/uc25-perf.js` to §5 as a constraining artifact with its
`BUDGET_MS.check_ms` and its stress-fixture run; (2) build the member lookup once —
`const memberKinds = useMemo(() => new Map(project.members.map((m) => [m.id, m.kind])), [project])` —
and pass that map (not `project`) into `barMemberRole`/`findingPairKey`/`extractAvailablePairs`, making
them `O(findings)`; (3) make the step's AC an actual `uc25-perf.js` run reporting `check_ms` for both
projects against the recorded pre-change baseline, not a prose "< 1ms".

---

### B2. `filter.pairKey` survives a new `checkId` and can silently produce a zero-row table with no matching `<option>`

The plan leaves this unresolved *in the plan text itself*. Plan L165 is a bare comment:

```
// Reset or keep filter when result changes
```

followed by code that does neither. `filter` is `useState` in `ReviewCheckSection` (plan L163) and
`result` is separate `useState` (`src/components/review/ReviewPane.tsx:130`). Running the check again
replaces `result` and leaves `filter` untouched.

`filter.pairKey` is a free-form string (plan L27) whose legal values are derived from the *current*
findings (plan L99-105). After a re-run the option set changes. If the previously selected pair is not
in the new `availablePairs`:

- `<select value={filter.pairKey}>` (plan L223) has no matching `<option>` — the control renders with
  nothing selected while the user's mental model says a pair is chosen.
- `matchesFindingFilter` (plan L126-131) rejects every finding, so `<tbody>` renders **zero rows** with
  no explanation (see M2).

This is reachable in the product's normal flow, which is exactly the flow the E2E exercises: the check
is re-run with a different clearance basis at `tests/e2e/uc25-joint-review.js:796` and `:805`, producing
different findings and a different `checkId` (`:800`, `:809`). The E2E does not catch it only because
it never touches the filter — `pairKey` stays `'all'`. So this defect ships silently past every
existing check.

**Failure scenario:** run check → select `柱帯筋 × 柱帯筋` → enter a clearance basis → run check again.
Pair no longer present → table empty, select blank, no message, verdict/scope counts still showing
hundreds of findings directly above.

**Minimal fix:** decide and write down one of the two, and make it testable:
- reconcile on read — `const pairKey = availablePairs.includes(filter.pairKey) ? filter.pairKey : 'all'`,
  used for both `<select value>` and the filter call; or
- reset on new check — `key={result.checkId}` on the filter-bar+table subtree, so a new `checkId`
  remounts with `defaultFindingFilterState()`.

Add a component test that re-runs the check with an active `pairKey` absent from the new result and
asserts the table is not empty.

---

### B3. §1.1's architectural justification rests on a quotation that is not in `CLAUDE.md`

Plan L6:

> Following `CLAUDE.md` ("Pure domain logic stays out of components") and `ADR-049`, …

`grep -rn "Pure domain logic\|stays out of components" CLAUDE.md AGENTS.md docs/ phases/` returns
exactly one hit: plan L6 itself. The string does not exist in `CLAUDE.md`, `AGENTS.md`, or `docs/`.

The nearest real rule is `CLAUDE.md:17` — `CRITICAL: **`src/domain/`은 순수 TypeScript.** React, DOM,
three.js, Next.js를 import하지 않는다.` — which is a constraint on `src/domain/`, not a directive to
move view logic out of components. It does not support the plan's conclusion, because the plan places
the new module in `src/lib/review/`, not `src/domain/`.

This matters beyond pedantry in this repo specifically: `scripts/check-citations.py:78-85` only reads
`step*-report*.json`, so prose citations in `step*-plan.md` are **not** machine-checked. A fabricated
quote in a plan is load-bearing and invisible to tooling — it is the failure mode
`CLAUDE.md` 개발 프로세스 ②(「Claude가 직접 쓴 것은 codex가 검증한다 … 고치라고 하지 말고 반증하라」)
exists to catch.

**Minimal fix:** delete the quotation. State the actual justification, which is available and true:
`src/lib/review/geometry-check.ts` already lives in `src/lib/review/`, so a sibling `finding-filter.ts`
follows the existing placement; `ADR-049` 결정 5 (`docs/ADR.md:1074`) is the real authority for
"검토 UI는 `Project`의 断面·配筋 값을 바꾸지 않는다".

---

## MAJOR

### M1. The reset-button visibility predicate uses row count as a proxy for "a filter is active", and is wrong on the repo's own default check

Plan L251:

```jsx
{(filteredFindings.length !== result.findings.length || filter.pairKey !== 'all' || filter.hideExcluded) && (
```

The initial check (no clearance basis) produces findings of exactly two kinds. Evidence:
`phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table/kinds` is
`{"干渉候補": 106, "接触": 592}` (106 + 592 = 698), and
`tests/e2e/uc25-joint-review.js:772` asserts `!initialResult.findings.includes("あき不足候補")`.

So: deselect the `あき不足候補` chip on the initial check. `filter.kinds.size === 2 !== 3`, the
short-circuit in `filterFindings` is skipped, `findings.filter(...)` runs, and **698 rows remain**
because no finding has that kind. Now `filteredFindings.length === result.findings.length`,
`pairKey === 'all'`, `hideExcluded === false` → the predicate is `false` → **the reset button is hidden
while a chip is visibly `aria-pressed="false"`**. The user has an active filter and no affordance to
clear it.

It then compounds with B2: enter a clearance basis and re-run, `あき不足候補` findings now exist and are
silently suppressed by the still-active chip — which is the precise witness
`tests/e2e/uc25-joint-review.js:811-829` depends on (`evaluateClearanceOracle`, `expectedHoopPair`
`C1 / 帯筋 / D13 / #0`·`#1`).

**Fix:** the predicate must be structural, not count-based. Add to `finding-filter.ts`:
`export function isFilterActive(f: FindingFilterState): boolean { return f.pairKey !== 'all' || f.hideExcluded || f.kinds.size !== ALL_FINDING_KINDS.length }` and gate on that.

### M2. No empty state — and the plan's own §5.1 constraint forbids the obvious place to put one

The plan correctly derives (plan L394) that no placeholder row may enter `<tbody>`, because
`parseFindingRows` rejects malformed rows — confirmed at `tests/e2e/uc25-joint-review.js:257-263`
(`readFindingRows`) feeding `readFindingSnapshot` at `:265-268`.

Having derived the constraint, the plan never resolves it. §1.4 (plan L264-272) renders
`filteredFindings.map(...)` and nothing else, so `kinds = new Set()` — which §1.3's own comment
explicitly permits ("Empty set displays no rows", plan L20) and which the UI lets you reach by
deselecting all three chips — yields a table with a `<caption>` and an empty `<tbody>`, no message. Same
for a pair with no matches, and for the B2 stale-key case.

**Fix:** specify an empty-state element **outside** `[data-testid='review-findings']` (a sibling `<p
role="status">` after the table), rendered when `filteredFindings.length === 0 && result.findings.length > 0`,
with its own i18n key. It must be outside the table for the same reason the filter bar is.

### M3. Filter state is neither announced nor focus-safe

Question posed to the plan: how is filter state announced or reset. The plan answers neither.

- The count display (plan L246-250) is a plain `<span>`. Applying a filter changes row count from 698 to
  106 with **no** `role="status"` / `aria-live`, so a screen-reader user gets no confirmation that the
  chip press did anything. The pane already uses `role="status"` for this purpose elsewhere —
  `src/components/review/ReviewPane.tsx:1131` (`<p role="status" data-testid="review-items-joint-unavailable">`) —
  so the plan is also inconsistent with the surrounding code.
- The reset button is **conditionally rendered** (plan L251-259). Activating it by keyboard makes the
  predicate false, the button unmounts in the same commit, and focus falls to `<body>`. The keyboard
  user loses their place in a 698-row table.

**Fix:** wrap the count in `role="status"`; render the reset button unconditionally and use `disabled`
instead of unmounting.

### M4. A finding hidden by a filter leaves `reviewFocus` dangling; the plan is silent

`focusFinding` (`src/components/review/ReviewPane.tsx:199-215`) writes `setReviewFocus({...})` into the
store and flips `setViewerMode('joint')`. The E2E treats the resulting `[data-review-focus='1']` as
observable state (`tests/e2e/uc25-joint-review.js:883-887`, `:892`).

Focus a row, then apply a filter that hides it: the 3D viewer keeps highlighting two segments and the
labelled focus marker stays live, while no row in the table corresponds to it and the user has no way
back to it. The plan does not mention `reviewFocus`, `setReviewFocus`, or `data-review-focus` anywhere.
This is not hypothetical polish — "focus a finding, then narrow to its kind" is the intended workflow.

**Fix:** state the decision explicitly. Either keep the focus and mark it (e.g. the summary notes the
focused finding is hidden), or clear `reviewFocus` when the focused finding stops matching. Silence
here means codex will pick one arbitrarily.

### M5. The test plan never exercises row actions under an *active* filter — the exact defect class already found once in this feature

Plan §6.2 (L525-551) tests row **counts** under filters (`tbody tr` count decreases / restores) and
nothing else. It never asserts that with a filter active, clicking a row focuses *that* finding, or that
`検討項目にする` on a filtered row creates an item for *that* finding.

That is the defect class this phase already shipped once. `src/components/review/ReviewPane.test.tsx:805-808`:

```
// phase 49 追補 — 所見から作る項目は、その所見を出した検査の接合部を指す。
// 以前は sel.memberId が優先されたので、検査後に別の柱を選んでから
// 「検討項目にする」を押すと、B の接合部の所見を A の接合部に結びつけた項目が
// できていた(独立検証の指摘2)。
```

The underlying code is in fact safe — each `<tr>` closes over its own `finding`
(`src/components/review/ReviewPane.tsx:343-356`), so a filtered view cannot make the wrong row the
"first row" in the mis-targeting sense. But *safe and untested* is what `CLAUDE.md` 개발 프로세스 ③
rejects: 「검증 항목은 **틀렸을 때 실패하는 것**이어야 한다」. A row-count assertion does not fail if row
identity breaks.

**Fix:** add two tests — with `kinds = {接触}` active, (a) click the first visible row and assert
`reviewFocus.point` equals the midpoint of the first *接触* finding (not `expected.findings[0]`), and
(b) click its `検討項目にする` and assert `review.items[0].finding.id` is that finding's id.

### M6. `ALL_FINDING_KINDS` is a second, unsynchronised source of truth for the kind list

`src/components/review/ReviewPane.tsx:77` already has
`const CHECK_KINDS: FindingKind[] = ['干渉候補', 'あき不足候補', '接触']`, used to build exclusion scopes
at `:177`. The plan adds `ALL_FINDING_KINDS` with the identical three literals (plan L32-36) in a new
module. Neither is derived from the `FindingKind` union
(`src/domain/review/types.ts:48`), so adding a fourth kind silently desynchronises both, and
`filterFindings`' short-circuit (plan L146-153) would then stop short-circuiting in the default state —
quietly re-introducing per-render allocation in the path B1 measures.

**Fix:** export the existing constant from one place (move `CHECK_KINDS` into `finding-filter.ts` and
import it back into `ReviewPane.tsx`), and add a type-level exhaustiveness guard
(`Record<FindingKind, true>` keyed off the array) so a new kind fails to compile.

---

## MINOR

### m1. `readFindingRows` line numbers are off by one

Plan §5.1 heads the block "Lines 258–264" and numbers its quoted lines `258:` … `264:`. Actual:
`readFindingRows` begins at `tests/e2e/uc25-joint-review.js:257` and the arrow ends at `:263`. Every
line in that quoted block is one high. The quoted *content* is verbatim correct.

All other cited line numbers verified exact in this checkout:
`uc25-joint-review.js:248-253` ✓, `:760-780` ✓, `:815-829` (quoting `:824-825`) ✓, `:886` ✓,
`:920-933` ✓, `:939` ✓; `ReviewPane.test.tsx:167` ✓, `:198-201` ✓, `:209` ✓, `:276-278` ✓;
`i18n.test.ts:19` ✓ and `:50` ✓; `CLAUDE.md:20` ✓ (도메인 용어는 일본어 원어를 그대로 쓴다);
`phases/48-joint-review-ui/step8.md:14` ✓ and `:17` ✓. §5.2 labels one block "Lines 814–817" but quotes
through `:818` — content correct.

### m2. `106` is real but uncited; `698` is cited only by inference

Plan L536 asserts "count decreases from 698 to 106 (`干渉候補` count)" with no source. Both numbers are
verifiable — `phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table/kinds`
= `{"干渉候補": 106, "接触": 592}`, and 698 is corroborated at `ReviewPane.test.tsx:829` and
`phases/48-joint-review-ui/step8-correction.md:24`. Per `CLAUDE.md`
(「픽스처에는 출처 쪽·표를 함께 적을 것 — 사후 대조의 유일한 단서다」) the spec handed to codex should
carry that JSON pointer, not the bare integer. Note also that the 698/106 split holds for the
*no-clearance* run; §6.2 never says which run its component test performs, and the split differs once a
clearance basis is entered.

### m3. §3's "All user-facing strings go through `t(locale, ...)`" is contradicted by §1.4

Plan L319 states it; plan L213 renders `{kind}` raw. The *behaviour* is right — raw domain terms are the
established convention (`ReviewPane.tsx:349` `<td>{finding.kind}</td>`, `:280` `<option>{role}</option>`)
and `CLAUDE.md:20` forbids translating them. Only the blanket claim is false. Reword to "UI chrome goes
through `t()`; domain terms render raw per `CLAUDE.md:20`".

### m4. Nested `region` landmark

Plan L183 puts `role="region"` + `aria-label` on the filter bar `<div>`, inside
`<section aria-labelledby="review-check-title">` (`ReviewPane.tsx:218`) — an already-named `region`.
Every other grouping in this pane is a plain `<div>` + `<h3>` (`ReviewPane.tsx:307`, `:313`, `:319`,
`:330`). The inner `role="group"` on the chips (plan L188) already carries the needed semantics. Drop
the outer `role="region"`; keep `data-testid`.

### m5. `barMemberRole` swallows an unresolvable `memberId`

Plan L79-81: `const memberKind = member?.kind ?? ''` → an unknown member yields a pair key of the bare
role (`主筋`), silently colliding with nothing and matching nothing. Compare `formatBarRef`
(`ReviewPane.tsx:79-83`), which falls back to `ref.memberId` so the identity stays visible. Use the same
fallback.

---

## Claims I checked and could NOT refute

Recorded so the next reviewer does not redo this.

1. **The DOM-isolation claim holds (plan §4.3, L357-361).** I enumerated every selector in
   `tests/e2e/uc25-joint-review.js`, `tests/e2e/uc25-perf.js`, `src/components/review/ReviewPane.test.tsx`
   and `src/app/page.test.tsx`. Nothing reads a parent container's `textContent`/`innerText`, nothing
   derives row indices from a selector broader than `[data-testid='review-findings'] tbody tr`
   (`uc25-joint-review.js:259`), and nothing counts buttons/inputs/labels by a selector the filter bar
   would join. `src/app/page.test.tsx` does not reference the findings table at all.
2. **`readCheckResult.findings` stays byte-identical.** `uc25-joint-review.js:249` reads only
   `[data-testid='review-findings']`, which remains the `<table>` (`ReviewPane.tsx:335`). Placing the bar
   as a preceding sibling inside the unnamed `result !== null` wrapper (`ReviewPane.tsx:305`) leaves
   `caption` + `tbody` untouched, so `:925` / `:932` (`value.findings === findings1`) survive.
   `checks.checkStableAfterViewerPose` additionally re-enters through a remount that clears `result`
   (`:910-918`), so `defaultFindingFilterState()` is re-established before the comparison.
3. **`uc25-joint-review.js:784-787` survives.** It throws unless exactly one
   `input[aria-label='範囲']` exists. None of the proposed controls carry that label; the pair `<select>`
   uses `review.check.filter.pair`. The bar is on screen when this runs (the check ran at `:759`), so
   this was a genuine collision risk and it does not fire.
4. **`:has-text()` click targets survive.** Playwright `:has-text()` is substring; the new button texts
   (`干渉候補`, `あき不足候補`, `接触`, `フィルターを解除`) contain none of `検査を実行`, `検討項目にする`,
   `確認`, `確認を保存`, `追加`. Likewise `timeUntil` (`uc25-perf.js:65-69`) selects by
   `textContent.includes(clickText)` over `[data-testid='review-check'] button` and still resolves to
   `検査を実行`. RTL `getByRole('button', { name: '追加' })` (`ReviewPane.test.tsx:242`) is exact-match
   and runs before any check, when the bar is unmounted.
5. **i18n is as the plan describes, and the strings are right.** `src/locales/` contains exactly
   `ja.json` and `ko.json`; `Locale = 'ja' | 'ko'` (`src/lib/store.ts:23`); both files hold 506 keys.
   Parity is enforced **only** by `src/lib/i18n.test.ts:19` — `t()` takes `key: string`
   (`src/lib/i18n.ts:8`) with a runtime `?? key` fallback, so there is no type-level key union and no
   lint rule; the plan's §7 Risk 4 is accurate and no additional mechanism needs updating. The 7 keys are
   flat and collide with nothing (`review.check.filter.pair` and `review.check.filter.pair.all` coexist
   fine in a flat map). The Japanese is idiomatic for this codebase: `指摘` matches
   `review.check.findings` = `指摘一覧`; `ペア` matches `review.check.scope.pairs` = `検査ペア数`;
   `除外` matches `review.check.exclusions` = `除外`. The Korean follows the file's established split —
   UI chrome translated, domain terms left in Japanese (cf. `review.check.verdict.clash` ko = `干渉`) —
   which is what `i18n.test.ts:50-57` guards.
6. **Scope and purity hold.** Nothing in the plan touches `runGeometryCheck`, `CheckResult`, `checkId`,
   `verdict`, `unchecked`, or `scope`; `ADR-049` 결정 5 (`docs/ADR.md:1074`) is satisfied.
   `src/lib/review/` is the correct home — `geometry-check.ts`, `segment-distance.ts`, `joint-layout.ts`,
   `xray.ts` all live there — and nothing proposed belongs in `src/domain/`, whose `CLAUDE.md:17`
   constraint is about React/DOM imports, not about this. All four import paths in the proposed module
   resolve: `FindingKind` at `src/domain/review/types.ts:48`, `Project` at
   `src/domain/model/project.ts:100`, `RebarRole` at `src/domain/model/rebar.ts:4`, `BarRef`/`Finding` at
   `src/lib/review/geometry-check.ts:34,43`. `src/components/review/ReviewPane.module.css` exists.
7. **Row identity under active filters is sound** (though untested — see M5). Each `<tr>` closes over its
   own `finding` (`ReviewPane.tsx:343-356`), so no filtered view can hand `focusFinding` or `onCreateItem`
   the wrong object.
8. **`useState(defaultFindingFilterState)` (plan L163) is correct** as a lazy initialiser, and
   `setFilter(defaultFindingFilterState())` (plan L255) passes an object, not a function, so there is no
   updater-form ambiguity.
9. **The "20 checks" claim is right.** `tests/e2e/uc25-joint-review.js:63-83` declares 20 keys, first
   `jointCanvas`, last `statusVocabularyAndNotices`; `:1418` throws unless the count is 20.

## Not verified

- I did not run any test, build, or browser, so **B1 is an argument from the code path and the recorded
  budget, not a measurement.** I cannot state by how much `check_ms` would move, only that the plan
  placed unbounded per-member work inside a gated measurement it never acknowledged. The fix in B1
  removes the question rather than answering it.
- `phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table/kinds` is labelled
  `original_failure`. `phases/48-joint-review-ui/step8-correction.md:24` describes it as the preserved
  original run, and the 698 total agrees with `ReviewPane.test.tsx:829`, so I treat 106/592 as the
  no-clearance split — but I did not re-derive it from `runGeometryCheck`.
