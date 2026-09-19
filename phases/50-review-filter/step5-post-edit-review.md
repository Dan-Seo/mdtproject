VERDICT: PASS

# Phase 50 step 5 — independent review of the post-review edits

Reviewer: Claude Code (Opus 5), acting as independent reviewer. I wrote none of this work and
fixed none of it.
Reviewed: `feat-49-findings-filter` @ `c08c1e3`, with the post-review edits amended into `d24d3fa`.
Constraints honoured: no build, no test, no browser run. Every claim below cites a file and line I
read; anything I could not establish by reading is in "not verified".

**Verdict rationale.** The three post-review edits landed exactly as described, are correct, broke
no caller, and the three tests added with them are falsifiable — one of them catches a mutation
that nothing else in the suite catches. The byte-identity guarantee still holds after the edits:
`filterFindings` still returns the original array reference and the `review-findings` subtree is
still untouched. No BLOCKER, no MAJOR. Ten MINORs follow, all non-blocking; six are in phase
documents rather than in code. Browser acceptance on the desktop host is the remaining gate.

---

## Findings

### 1. MINOR — `index.json` step 1 states the identity guarantee without its scope

`phases/50-review-filter/index.json` step 1 summary:

> 既定状態は現行DOMと観測上同一で、filterFindings は元配列の参照を返す。

As written this is false. In the default state the DOM gains a whole `<div
data-testid="review-findings-filter">` (`src/components/review/ReviewPane.tsx:226-307`) and, when
the check yields zero findings, a `<p data-testid="review-findings-empty">`
(`ReviewPane.tsx:325-328`). What is actually identical is the `[data-testid='review-findings']`
subtree — which is how the plan states it (`phases/50-review-filter/step1-plan.md:613-620`:
"Preservation of `[data-testid='review-findings']` DOM Boundary"). The `d24d3fa` commit body
carries the same unscoped sentence ("Default state is observationally identical to the previous
DOM"), though it immediately qualifies it.

The claim that matters is true; its summary in the ledger is not. Reword to name the table subtree.

### 2. MINOR — `step2-review.md` misattributes both lint warnings; `index.json` is right and the review artefact is wrong

`step2-review.md` finding 1 says the unused `matchesFindingFilter` import "is the second of the two
lint warnings the orchestrator flagged"; finding 3 says the dead `FindingKind` import "is the first
of the two lint warnings".

The repo has a documented pre-existing 2-warning baseline that predates this branch:
`phases/48-joint-review-ui/step6-report.json:82` ("passed with 2 warnings"),
`step7-report.json:70` ("passed with 2 **pre-existing** warnings"), `step8-report.json:336`
("✖ 2 problems (0 errors, 2 warnings)"), and — decisively —
`phases/49-joint-review-defects/step1-report.json:50`: "2 warnings, both pre-existing on HEAD
(verified by stashing this file and re-running)".

So `index.json`'s `host_gates.lint` (`{"warnings": 2, "note": "両方とも既存のもので本変更とは無関係"}`)
matches the established baseline, and `step2-review.md`'s attribution is unsupported. If those two
imports had produced warnings, the pre-edit count would have been four, not two.

Consequence: two of the three post-review edits were partly justified by "this also clears the lint
warning", and that justification is wrong. The edits remain correct on their own merits (see
"verified"). No code change is implied; the review artefact carries a factual error.

### 3. MINOR — `"gate": true` on step 3 is inert and does not match the documented gate semantics

`phases/50-review-filter/index.json` step 3 carries `"kind": "verify"`, `"gate": true`, and
`"status": "blocked"`, and step 4 is `"completed"`.

`CLAUDE.md` defines `gate: true` for a step-0 verification step whose **refutation** (`refuted`, not
`error`, not `blocked`) blocks the following steps and sets the top index to `refuted`. Here the
flag sits on step 3 of 4, the status is `blocked` (correct — the step could not run, it was not
refuted), and step 4 ran to completion after it. The flag therefore enforces nothing and describes
nothing that happened. It is harmless only because no harness read this file.

`blocked` itself is the honest status and `blocked_on: "desktop host browser run"` is accurate.
Drop `gate: true`, or move the gate to the step that actually gates.

### 4. MINOR — the phase ran entirely outside the codex harness

`phases/50-review-filter/` contains `index.json` and eight `.md` files and nothing else: no
`step*.md` step specification, no `step{N}-report.json`, no `step{N}-invoke.json`, no
`step{N}-codex.stdout.log`/`.stderr.log`. `index.json` records `authored_by:
"gemini-3.8-flash-high (implementation)"`, i.e. implementation by a model invoked outside
`scripts/execute.py`.

`CLAUDE.md` 개발 프로세스, first CRITICAL bullet: 「**코드 구현은 codex 하네스가 한다.** …구현
요청을 받으면 `phases/index.json`의 다음 phase 디렉터리를 만들어 사양을 쓰고 `python
scripts/execute.py <phase-dir>`로 넘길 것」, with direct editing reserved for harness `blocked`/`error`
hand-off or explicit user instruction. I cannot see whether the user gave that instruction, so I
record the departure without assigning fault. The same bullet is the reason the rule exists — it
notes 173 commits went out off-harness once the rule was absent from the docs.

### 5. MINOR — `index.json` marked step 2 `completed` before anyone independently reviewed the post-review edits

`index.json` step 2 is `"status": "completed"` and its summary asserts 「照合分岐の修正は変異で確認済み」.
That mutation check is a self-report by the party that made the edit. `CLAUDE.md` 개발 프로세스:
「**검증은 교차로 한다 — 만든 쪽이 자기 것을 승인하지 않는다.**」 and 「`index.json`의 `completed`와
스텝 summary는 **자기 보고**다」.

This document is the missing cross-check, and it clears the edits. Recorded so the gap is visible
in the ledger rather than erased by the fact that it turned out fine.

### 6. MINOR — the phase-50 documents still say "Phase 49"

`c08c1e3` renamed the directory but not the prose:
`phases/50-review-filter/step1-plan.md:1` ("Phase 50-1"), `step1-falsification.md:1`,
`step1-falsification-r2.md:3`, `-r3.md:3`, `-r4.md:3`, `step2-review.md:3` ("Phase 50 step 2"),
`step3-browser-blocked.md:1`, `step4-perf-jetson.md:1`. The three commit subjects are also
`feat(49)`/`docs(49)`.

Cosmetic only: I grepped the whole working tree (excluding `.git`, `node_modules`, `.next`) for the
string `49-review-filter` and found zero occurrences, so no path reference is dangling. The
branch name `feat-49-findings-filter` is likewise only a label.

### 7. MINOR — `step2-review.md`'s finding 5 (stale `pairKey`) is more reachable than it could establish, and remains open

`src/components/review/ReviewPane.tsx:181`, `:298-302`.

`step2-review.md` left this conditional because it could not show that `project.members` changes
while `result.checkId` — and therefore the `key` at `ReviewPane.tsx:574` — stays fixed. It does:
`PlanImport` and `StbImport` are rendered in `planActions` (`src/app/page.tsx:39-45`), the left
pane, which is mounted regardless of which takeoff tab is active. So a user on the 検討 tab can
import or load a different project without unmounting `ReviewFindingsView`. `memberKinds`
(`ReviewPane.tsx:367-370`) then recomputes against the new members, `availablePairs` changes
wholesale, `safePairKey` falls back to `'all'`, `active` becomes `false`, and the reset button's
`if (!active) return` (`:300`) makes the stale `filter.pairKey` unclearable. If the old key ever
reappears in `availablePairs`, the pair filter silently re-applies.

Still MINOR, for two reasons I confirmed: the visible state is self-consistent throughout (the
select shows `all`, the count shows `N / N`), and the underlying hazard — a `result` left over from
a previous project — is pre-existing on `main`, which renders the same stale table. The tab switch
route is closed: `src/app/page.tsx:56` mounts `<ReviewPane />` only on the 検討 tab, so leaving the
tab unmounts it and destroys both `result` and the filter state.

The minimal fix step2 proposed (drop the `if (!active) return` guard) still applies. Not blocking.

### 8. MINOR — `key={result.checkId}` turns a re-check from keyed reconciliation into a full teardown, and no document says so

`src/components/review/ReviewPane.tsx:574`.

On `main` a second 検査を実行 reconciled the existing `<tbody>` rows in place, keyed by
`finding.id` — many of which are stable across runs, since `findingId(kind, a, b)`
(`src/lib/review/geometry-check.ts:153`) is content-derived. With the `key` on
`ReviewFindingsView`, every re-check with a changed `checkId` unmounts and rebuilds all N rows.
That is a deliberate design choice (it is what resets the filter, and `ReviewPane.test.tsx:936` is
its falsifying test), but it is a per-re-check cost that neither `step1-plan.md`'s performance
section nor `step2-review.md`'s timeout argument mentions — the latter argues only that per-row
work is unchanged and that `memo` strictly removes work.

It is very probably already covered by measurement, which is why this is MINOR and not more:
`timeUntil` (`tests/e2e/uc25-perf.js:62-92`) calls `target.click()` synchronously and React 18
flushes discrete click events before `dispatchEvent` returns, so the whole check-and-render lands
inside the elapsed window. That is also the reason `check_ms` reads in the seconds
(`step4-perf-jetson.md`) despite a `wait: "present"` predicate that is already satisfied on
iterations 2+ — which means `step2-review.md`'s "not verified" item 4 ("it may not be capturing the
render cost at all") appears empirically unfounded. On the stress fixture the branch measured
3219 ms against main's 3476 ms, i.e. the teardown did not cost more than what it replaced.

Worth one sentence in the plan so the trade-off is on the record.

### 9. MINOR — a presentation-layer constant now feeds a persisted domain value

`src/components/review/ReviewPane.tsx:427` replaced the local `const CHECK_KINDS: FindingKind[] =
['干渉候補', 'あき不足候補', '接触']` with `[...ALL_FINDING_KINDS]`, where `ALL_FINDING_KINDS` is
`Object.keys(KIND_TABLE)` from the filter module (`src/lib/review/finding-filter.ts:14-16`). That
array is written into `CheckExclusion.scope.kinds` (`src/domain/review/types.ts:96`), which is part
of `ReviewState` and is persisted under the `review` key (ADR-049 decision 1).

Behaviour today is identical, and I verified both halves of that: `KIND_TABLE`'s insertion order
(`finding-filter.ts:8-10`) matches the deleted literal exactly, and order cannot matter anyway
because the only consumer is `scope.kinds.includes(kind)` (`src/lib/review/geometry-check.ts:278`).
The concern is directional coupling, not a present defect: a future change to `KIND_TABLE` made for
the filter's benefit would change what gets written into saved exclusions. Cheap to decouple by
keeping the domain literal; not worth blocking on.

### 10. MINOR — one decorative assertion in the new component tests

`src/components/review/ReviewPane.test.tsx:898-900`:

```ts
// Verify clicking reset button while aria-disabled="true" is a no-op
fireEvent.click(resetButton)
expect(resetButton).toHaveAttribute('aria-disabled', 'true')
```

Delete the guard at `ReviewPane.tsx:300` (`if (!active) return`) and this assertion still passes:
the click then calls `setFilter(defaultFindingFilterState())` while the state is already default, so
nothing observable changes. I could not construct a mutation this pair of lines catches.

The enclosing test is not decorative — its earlier assertions do pin real behaviour (see "verified",
item 4). Only these two lines are inert. Note also that the guard at `:300` is what closes finding 7
if it is ever removed, so the pair is worth keeping and giving a real oracle (e.g. assert the select
value and chip `aria-pressed` are unchanged after the no-op click on a *stale-pairKey* fixture).

---

## verified

**The three post-review edits landed as described and are correct.**

1. **`effectivePairKey` made required.** `src/lib/review/finding-filter.ts:123-128` — the parameter
   carries no default. The only production caller is `filterFindings`
   (`finding-filter.ts:168-170`), which always passes it explicitly, and it passes the *right*
   thing: `effectiveFilter.pairKey === effectivePairKey` holds by construction at `:161-163`, so
   the predicate's `filter` and its fourth argument can never disagree. I grepped the whole of
   `src/` and `tests/` for every exported symbol of the module: outside `finding-filter.*` the only
   consumers are `ReviewPane.tsx:55-61, 176, 186, 189, 236, 427`, and `matchesFindingFilter` is not
   among them. **No caller was left passing the wrong thing.** The parameter default that *remains*
   — `filterFindings`'s own `effectivePairKey: string = filter.pairKey` at `:159` — is a different
   function and is genuinely exercised: `finding-filter.test.ts:112, 208, 215, 230, 254` all call it
   with three arguments, and mutating that default to `'all'` makes `:254` fail.
2. **Dead `FindingKind` import removed.** Present at `ReviewPane.tsx:24` on `main`; `grep -n
   FindingKind` over `d24d3fa:src/components/review/ReviewPane.tsx` returns nothing. Its sole
   consumer, `CHECK_KINDS`, was deleted in the same diff and its call site now reads
   `[...ALL_FINDING_KINDS]` (`:427`).
3. **Three tests added, and their names match what they assert** — with one wording caveat.
   - `finding-filter.test.ts:273-283` — reference identity through the reconciliation branch.
     Under the orchestrator's mutation (`const effectiveFilter = filter`),
     `isFilterActive({pairKey: <real pair>})` is `true` (`:44-51`), the function falls through to
     `findings.filter(...)`, and returns a fresh `[f1]` — `toBe(findings)` fails. Genuinely
     falsifying, and it catches a mutation that `:257-268` (which uses `toEqual`) does not. The test
     *name* says "stale pairKey", but the fixture uses f1's **real** pair key overridden to `'all'`
     by the caller. That choice is what makes the mutation visible as a reference break rather than
     a content break, so the fixture is right and only the label is loose.
   - `finding-filter.test.ts:294-302` — the predicate honours its fourth argument. Mutate `:140-144`
     to read `filter.pairKey` instead of `effectivePairKey` and the second assertion
     (`'no-such-pair'` → `false`) fails. This is the only test in the repo that can catch that
     mutation: inside `filterFindings` the two values are always equal, so the substitution is
     invisible there.
   - `finding-filter.test.ts:304-317` — kind and `hideExcluded` rejection. Deleting `:130-132`
     fails the first assertion; deleting `:135-137` fails the last.

**Priority 1 — the byte-identity guarantee still holds after the edits.**

- `finding-filter.ts:164-166` returns `findings` itself. Pinned by `toBe` at
  `finding-filter.test.ts:113` and now also at `:282`.
- The default state reaches it: `defaultFindingFilterState()` gives `pairKey: 'all'` (`:31-37`);
  `availablePairs.includes('all')` is false so `safePairKey === 'all'` (`ReviewPane.tsx:181`);
  `effectiveFilter === filter` (`:182-185`); `isFilterActive` returns `false`; `filteredFindings`
  **is** `result.findings`. I checked that no generated pair key can collide with the literal
  `'all'`: `barMemberRole` (`finding-filter.ts:84-85`) always concatenates a non-empty role suffix.
- The table subtree is unchanged. `<table className={styles.table} data-testid="review-findings">`
  at `ReviewPane.tsx:310`, `<caption>` at `:311`, and `FindingsTableBody` (`:109-142`) reproduce the
  old inline JSX cell for cell — same `<tr key={finding.id} tabIndex={0} onClick onKeyDown>`, the
  same seven `<td>` with the same expressions. The filter bar (`:226`) and the empty notice
  (`:325-328`) are siblings, not descendants.
- **I re-derived the E2E selector analysis rather than inheriting it.**
  `tests/e2e/uc25-joint-review.js:249` and `:259` use `[data-testid='review-findings']`, an exact
  attribute match that cannot match `review-findings-filter` or `review-findings-empty`. The
  negative assertion at `:772` (`!initialResult.findings.includes("あき不足候補")`) is scoped to that
  table's `textContent`, so the chip that renders that exact literal is out of reach. I listed every
  `page.click`/`page.fill` in both uc25 scripts: none targets the filter bar, and `:1075`'s
  `[data-testid='review-items'] input[type='checkbox']` is scoped away from the new
  `hideExcluded` checkbox.
- **`uc25-perf.js`'s click target is unambiguous.** `timeUntil` (`:62-92`) picks the *first*
  `[data-testid='review-check'] button` whose `textContent` **contains** `"検査を実行"` — a substring
  match over a node set that now includes the four new buttons. None of 干渉候補 / あき不足候補 /
  接触 / フィルターを解除 contains that substring, so the target is unchanged.

**ADR-049 decision 6 is honoured — the filter cannot hide the un-checked list or the verdicts.**
`review-verdict` (`ReviewPane.tsx:547-549`), `review-unchecked` (`:553-554`) and the scope counts
(`:560-565`) all read from `result`, not from `filteredFindings`, and all render *above*
`<ReviewFindingsView>`. So the 「検査しないもの」 disclosure required by ADR-049 decision 6
(「보이지 않는 미검사가 검사 통과로 읽히는 것을 막는다」) survives any filter state, and a filtered-empty
table always sits below unfiltered nonzero verdict counts plus the `0 / N件` live region at `:291-294`.
This was the one place I expected to find a real defect and did not.

**Other repository rules — compliant.** `src/domain/` is untouched (the new module is under
`src/lib/`, and imports from `@/domain/…` are type-only). No 규준 numeral appears in the diff. No
network path is added. Domain terms stay in Japanese in both locales — `ko.json:441-447` translates
only the UI chrome, while the chip labels render `{kind}` raw (`ReviewPane.tsx:256`), per ADR-008.
No derived state enters the store: the filter is component-local `useState` (`:173`), so it cannot
reach `Project` or `ReviewState`, and `src/app/page.tsx:56` unmounts `ReviewPane` off the 検討 tab,
which answers the save-reload question — neither the filter nor `result` can survive into a saved
file.

**The `memo` optimisation is real, not just asserted.** `step1-plan.md:216` justifies
`FindingsTableBody` + `memo` by claiming a row click updates focus without re-rendering 698 `<tr>`s.
I traced the prop identities: on a row click, `setFocusedFindingId` re-renders `ReviewCheckSection`
but **not** `ReviewPane`, so the `onCreateItem` prop — `requestItem`, recreated on every `ReviewPane`
render at `:1497-1510` and never memoised — keeps its identity across that update. `onFocus` is a
`useCallback` with stable deps (`:203-222`), `filteredFindings` is a `useMemo` with unchanged deps,
and `ReviewCheckSection` subscribes to store *actions*, not to `reviewFocus` or `viewerMode`, so
`setReviewFocus`/`setViewerMode` in the same handler do not bust it either. The memo holds.

**Falsifiability of the nine `Finding Filter` tests (priority 4).** One concrete catching mutation
each; all nine are falsifiable.

| test (`ReviewPane.test.tsx`) | mutation it catches |
|---|---|
| `:834` default bar | `aria-disabled={!active}` → `{active}` at `:298`; or move the bar after the table (`compareDocumentPosition` at `:843`) |
| `:868` focus-safe reset | `aria-disabled={!active}` → `disabled={!active}`: React disables the button, focus leaves it, `document.activeElement` at `:895` fails. This is the test's whole point. (See finding 10 for the two inert trailing lines.) |
| `:903` reset on new `checkId` | delete `key={result.checkId}` (`:574`) → `newSelect.value` stays the chosen pair, `:934` fails; or delete the focus-clear guard at `:448-451` → `:930` fails |
| `:941` empty notice | add `role="status"` to `:326` → `getByRole('status')` at `:965` throws on two matches, and `:962` fails |
| `:974` single live region | same mutation → `:990` fails |
| `:993` focus cleanup | delete the `useEffect` at `:193-199` → `:1008` fails; make it unconditional → `:1023` fails. Both directions pinned — the strongest of the nine |
| `:1026` row actions under filter | have `FindingsTableBody` index the unfiltered array instead of iterating `findings` (`:121`) → `savedItem.finding.findingId` at `:1061` mismatches. Oracle is exact: `finding.midpoint` **is** `midpoint(pa, pb)` (`geometry-check.ts:351, 385-386`), which is what `focusFinding` recomputes at `:209-216` |
| `:1064` hideExcluded | `finding.excludedBy !== null` → `=== null` at `finding-filter.ts:135` → `:1080` fails |
| `:1083` persistence on identical inputs | key the view on anything per-render → chips reset, `:1100-1101` fail |

**The `}, 20000)` timeouts (priority 5).** Nine added, all in the new block; `main` has exactly one
(`grep -c "}, 20000)"`: 10 on the branch, 1 on `main`). The test file diff is `274 0` — purely
additive, single hunk `@@ -829,4 +829,278 @@` — so no pre-existing assertion or timeout was
touched. I found one render-path cost `step2-review.md`'s structural argument missed (the `key`
teardown, finding 8), but it is not per-row, does not apply to the first check in a test, and the
only measurement that exists puts the branch ahead of `main` on the stress fixture.

**`index.json` claims I could check, and that hold.** All ten artefact paths exist. `status:
"in-progress"` is consistent with step 3 `blocked`. Step 2's 「MINOR 5件…うち3件を閉じた」 matches
`step2-review.md` (five findings; 1, 2 and 3 closed; 4 and 5 open — finding 7 above is number 5).
`vitest.tests: 2046` is internally consistent with `step2-review.md`'s "full 2043-test suite" plus
the three added tests, which also tells me the gates were run **after** the post-review edits, not
before. Step 3's and step 4's summaries match `step3-browser-blocked.md` and `step4-perf-jetson.md`
line for line on every number I spot-checked (903 s vs 300 s; 3219 vs 3476; 681 vs 691; the two
budget misses present on `main`; the +298/+398 stress deltas recorded but not concluded).

---

## not verified

1. **Anything requiring execution.** No build, test, lint or browser run, per the constraints. The
   green `host_gates` in `index.json` are a self-report I could not reproduce.
2. **That `const effectiveFilter = filter` fails *only* the new identity test.** I confirmed it
   fails `finding-filter.test.ts:273-283` and that `:257-268` survives it (`toEqual`, not `toBe`).
   The claim that **nothing else** in 2046 tests fails is a claim about a full run I did not make.
3. **The actual lint warning texts.** I established the 2-warning baseline from four prior phase
   reports, one of them verified by stashing. I did not run `eslint` and cannot name the two
   warnings, so finding 2 rests on the count and the baseline, not on their identity.
4. **Real-browser behaviour.** Scenario 7's `findings === findings1` against a live DOM, the 19 uc25
   checks, and the seven regression scripts have not run on this branch anywhere. My selector work
   above is static analysis. This is the outstanding gate and `step3-browser-blocked.md` names the
   right runner and the right command list.
5. **Whether the user directed the off-harness workflow** (finding 4) or the authorship recorded in
   `index.json`'s `authored_by` fields. Not observable from the repository.
6. **Screen-reader behaviour** of the `aria-disabled` reset button and the `aria-live="polite"`
   count. jsdom asserts attributes, which is the right proxy, not the same claim.
7. **Perf deltas' significance.** `step4-perf-jetson.md` itself declines to conclude on the
   `joint_tab` +298 ms and `compare` +398 ms stress deltas, and I have no basis to go further. My
   reading in finding 8 that React 18 flushes the discrete click synchronously — and that `check_ms`
   therefore does contain the render — is derived from the measured magnitudes, not from a trace.
