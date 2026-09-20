VERDICT: PASS

# Phase 51 — independent review of `feat-51-filter-stale-pairkey` (PR #79)

Reviewed: `git diff feat-49-findings-filter..HEAD`. Under `src/` the change is exactly two files —
`src/components/review/ReviewPane.tsx` (1 deletion) and `src/components/review/ReviewPane.test.tsx`
(+68). Everything else is `phases/51-filter-stale-pairkey/**` and 6 lines of `phases/index.json`.
Nothing under `phases/50-review-filter/` appears in this diff, so PR #78's content was not
re-reviewed and was not touched.

No command was run beyond `git`, `grep`, `sed` and reads of `node_modules`. No build, no test, no
browser — see "not verified".

---

## Findings

### 1. MAJOR — the defect is only half closed; the silent re-application path survives

`src/components/review/ReviewPane.tsx:181` still drops a departed key to `'all'` for display only,
and `:186` still derives `active` from the *normalised* filter. The deleted guard made the stale key
unclearable; removing it makes the key clearable. It does not make the stale state **visible**, and
that is the half that produces the user-facing harm.

Failure scenario, unchanged by this commit:

1. run 検査, select pair P in the select at `ReviewPane.tsx:262-268`;
2. import another 案件 — `PlanImport.tsx:720` calls `loadProject`, and `PlanImport` sits in
   `planActions` (`src/app/page.tsx:42`) so it is mounted on the 検討 tab. `setResult` is reached
   only from `runCheck` (`ReviewPane.tsx:451`) and the subtree key is `result.checkId`
   (`ReviewPane.tsx:573`), so the view stays mounted and `filter.pairKey === P` survives;
3. the screen is now honest-looking: select reads `all`, count reads `N / N件`, and the reset button
   reads `aria-disabled="true"` (`ReviewPane.tsx:299`). **Nothing on screen asks the user to press
   reset, and the one control that would repair the state advertises that it has nothing to do.**
4. load the first 案件 back → P returns to `availablePairs` → the pair filter re-applies with no user
   action, and the findings table silently under-reports.

So the reachability of "findings silently hidden" is unchanged for any user who does not, for no
reason, press a dimmed button. `step1.md` names this harm verbatim in its 事実 section
("その鍵が後で `availablePairs` に戻ると、利用者が何もしていないのにペア絞り込みが復活する") but then scopes 直すもの to
clearability alone, and `step1-report.json#/chosen_fix` calls the chosen move "最小" without
disclosing the residual. `step1.md` itself offered the alternative that closes it
("`filter.pairKey` を `safePairKey` に寄せる effect で state 側を整える手もある"); the implementer chose the
narrower one, which is within spec.

This is not a regression — the branch is strictly better than its base — so it does not block
browser acceptance. It does mean **phase 51 should not be recorded as closing phase 50's MINOR in
full**.

Fix that closes findings 1 and 2 together, one expression, no effect, no extra state write:

```ts
// ReviewPane.tsx:186
const active = isFilterActive(effectiveFilter) || filter.pairKey !== safePairKey
```

Default state is untouched (`filter.pairKey === 'all' === safePairKey` ⇒ `active === false`), the
existing assertion at `ReviewPane.test.tsx:863` still holds, and in the stale state the button lights
up — which both restores the ARIA contract and makes the stale state discoverable. It requires
relaxing the new assertion at `ReviewPane.test.tsx:932`; see finding 4.

### 2. MINOR — `aria-disabled` now lies on activation

`ReviewPane.tsx:299-302`: the control announces "dimmed" and then acts. ARIA APG's contract for
`aria-disabled` is that the control is perceivable and focusable but **does not respond to
activation**; this now responds.

Asked to decide: **I would ship this over the previous behaviour, and I would prefer finding 1's
one-liner over both.** Reasoning, not preference:

- The previous state was "announced disabled, silently did nothing" — which in the stale case meant
  the state was unrepairable *for everyone*, sighted users included. Announcing disabled while being
  disabled is only honest if there is genuinely nothing to do, and here there was.
- The new state violates the contract, but the violation is inert: enumerate the states where
  `active === false` and the click is reachable, and there are exactly two — genuine default (click
  produces no observable change, verified in finding 5) and stale key (click produces a repair the
  user wants). There is no state where the dimmed button does something surprising or destructive.
- Phase 50's R2-B1 rejection of a real `disabled` attribute (focus escapes to `<body>`) is unaffected
  either way; `ReviewPane.test.tsx:968` pins it.

An inert contract violation beats an unrepairable state. But "make `active` honest" beats both, and
costs one `||`.

### 3. MINOR — stale comment left behind at the deletion site's nearest neighbour

`src/components/review/ReviewPane.test.tsx:898`:

```
// Verify clicking reset button while aria-disabled="true" is a no-op
```

This describes the `if (!active) return` guard that `2e6c034` deleted. The assertion below it still
passes, and the click is still a no-op *observably*, but the comment now asserts a mechanism the
source no longer has — the exact comment-rot a future reader would trust. `step1.md` forbade deleting
existing assertions, not existing comments; one word ("observably") would fix it.

### 4. MINOR — the new test pins the disputed ARIA state as contract

`ReviewPane.test.tsx:932` asserts `aria-disabled === 'true'` **in the stale state**. That is faithful
to `step1.md` ("`aria-disabled` の表示は今のまま"), but it converts finding 1/2's one-line remedy into a
test-breaking change for whoever picks it up next. Worth knowing before it is treated as a guarded
invariant rather than a transcription of this phase's scope.

### 5. MINOR — `step2-ci-parity.md` contains one factual error and two overstatements

Factual error. The document says of the failing test:

> "It is timeout-fragile on slow hardware and has no explicit timeout of its own, unlike its
> neighbour at `ReviewPane.test.tsx:831`."

`ReviewPane.test.tsx:809` opens `targets the checked joint, not the current selection, when an item
comes from a finding` and **`:831` is that same test's own closing `}, 20000)`**. It is not a
neighbour; it is the test. The document's own quoted error (`Test timed out in 20000ms`) contradicts
the sentence — the control run's *other* failure is the one at the 5000 ms default.

Overstatement A. "The one failure is the host, **proven by control**", and `index.json` step 2's
"host 由来と**確定**". What the control establishes is that the failure reproduces on unmodified `main`
on this host — i.e. **not introduced by this branch**. That is a sound and sufficient conclusion, and
it is the one the document should claim. "Host-caused" is a different proposition (a test genuinely
broken in `main`'s code would also reproduce on `main`), and a single run per side of a
load-dependent timeout cannot separate them. The 9827 ms → 21292 ms datum is supporting evidence, not
proof, and the document's own "Not concluded: that this test is safe" paragraph already concedes most
of this — the headline just outruns it.

Overstatement B. "if anything the branch runs cleaner than the control on this host, because the
phase-50 tests carry explicit `}, 20000)` timeouts that the older tests lack." Two problems: the test
that failed already has `}, 20000)` (above), so the stated mechanism does not apply to it; and the
branch **adds two more 698-row renders to the same file** (`ReviewPane.test.tsx:903`, `:944`, both
`}, 20000)`), which increases load on the very test that timed out. The document does not consider
its own change as a load contributor. With n=1 on each side, "runs cleaner" is not concludable in
either direction.

Everything else in the document is sound, and its scoping ("local reproduction, not CI"; the
`review`/`scope`/`gate` gaps; no phase-51 browser acceptance; the draft/auto-merge trade left to the
user) is honest and unusually complete.

### 6. MINOR — the report's `mutations.observed` is a paraphrase, not the run output

`step1-report.json#/mutations/0/observed` gives `"AssertionError: expected 'all' ... Received:
'大梁主筋 × 大梁主筋'"`. Vitest's `toBe` on `select.value` prints the receiver first
(`expected '大梁主筋 × 大梁主筋' to be 'all'`) and renders the diff as `- Expected / + Received`; the quoted
string is neither form. `step1.md` said 「**実際に戻して走らせた結果**を書け。予想を書くな」. The claim is almost
certainly true (see finding 8) but it was re-typed rather than pasted, which is the one thing the
instruction was written to prevent.

### 7. MINOR — test 2 asserts against a DOM node captured before the click

`ReviewPane.test.tsx:949` captures `findingsTable`, and `:964` calls `querySelectorAll` on that
capture after the click. If a mutation caused the findings subtree to remount, the detached old node
would still carry its 698 rows and the assertion would pass; `:966` would not catch it either, since
a remount resets `filter` to default and `select.value` would still read `'all'`. Not a plausible
mutation of *this* change, but the test is blind to it. Re-querying `screen.getByTestId` after the
click would close it.

### 8. MINOR — `phases/index.json` lost its trailing newline

`git diff feat-49-findings-filter..HEAD -- phases/index.json` ends with `\ No newline at end of
file`. Valid JSON, harmless, but it makes every future append to that file a two-line diff.

---

## Answers to the six questions, as findings do not cover them

**1. Does the fix close the defect?** Mechanically yes, practically half — finding 1. I enumerated
every write to `filter.pairKey` in the component: the select's `onChange` (`ReviewPane.tsx:265`), the
reset button (`:301`), and the `useState` initialiser (`:173`). The chip handler (`:242-251`) and the
hideExcluded handler (`:276`) both spread `...prev` and preserve `pairKey`. After the deletion there
is **no state in which `filter.pairKey` cannot be driven back to `'all'`**: reset is unconditional and
the button is always rendered whenever the filter bar is. The pre-fix trap — selecting `'all'` in the
select fires no `change` event because the select already *displays* `'all'` (`value={safePairKey}`,
`:264`) — is now routed around. Reachability: closed. Discoverability: not closed.

**2. What did removing the guard cost?** I traced each item asked about and the answer is: one wasted
render of `ReviewFindingsView`'s own JSX, and nothing else.

- *State write / re-render*: yes. `setFilter(defaultFindingFilterState())` allocates a fresh object
  and a fresh `Set` every click, so React never bails out; `ReviewFindingsView` re-renders once.
- *`filteredFindings` identity*: **stable**. `effectiveFilter` (`:182-185`) recomputes to the new
  object, so the `filteredFindings` memo (`:188-191`) re-runs — but with an inactive filter
  `filterFindings` returns the input array itself (`src/lib/review/finding-filter.ts:164-166`,
  `return findings as Finding[]`), i.e. `result.findings`, the same reference as before.
- *`reviewFocus` clearing (`:194-199`)*: **does not fire**. Its dep array is
  `[filteredFindings, focusedFindingId, setReviewFocus, setFocusedFindingId]` and `filteredFindings`
  is reference-identical per the previous bullet. This holds in the stale case too, since
  `isFilterActive(effectiveFilter)` is false there as well. No focus is lost by a no-op click.
- *The 698-row table*: **does not re-render**. `FindingsTableBody` is `memo` (`:106`) and every prop
  is stable across this update — `findings` (same ref), `project`/`review`/`locale`/`checkId`/
  `jointColumnMemberId`/`onCreateItem` (parent did not re-render), and `onFocus`, whose `useCallback`
  deps `[layout, project, setFocusedFindingId, setReviewFocus, setViewerMode]` (`:221`) are unchanged.
- *`key={result.checkId}` subtree (`:573`)*: untouched — `result` is not written by this path.
- *`role="status" aria-live="polite"` (`:294`)*: text is `{filteredFindings.length} / {result.findings.length}`
  and both are unchanged, so no spurious announcement.

Nothing observable is disturbed. The cost is a reconciliation of ~8 elements.

**3. Accessibility** — decided in finding 2. Ship this over the previous behaviour; prefer finding 1's
one-liner over both.

**4. Are the two tests real?** Yes, both, and the second is a genuine improvement on what it backfills.

- *`clears a stale pair key after loading another project`* (`:903-942`). It does **not** stop at
  `select.value === 'all'`. The load-bearing assertions are at `:938-941`, taken **after**
  `loadProject(originalProject)` at `:935` restores the key to `availablePairs` — exactly the
  "元の鍵が戻ったときに復活しない" that `step1.md` demanded. Mutation it catches: restore
  `if (!active) return` at `ReviewPane.tsx:300` — `filter.pairKey` survives the click, `safePairKey`
  re-resolves to the old pair, and `:938` fails. A second mutation it catches: change the handler to
  `setFilter(prev => ({ ...prev, kinds: new Set(ALL_FINDING_KINDS), hideExcluded: false }))` (reset
  everything *but* `pairKey`) — also fails at `:938`, where a `select.value`-only test would not.
  The staleness is really produced: `:920-923` re-ids every member, so the rebuilt `memberKinds`
  (`ReviewPane.tsx:410-413`, dep `[project.members]`) misses every `BarRef.memberId` in the retained
  `result`, `barMemberRole` falls through to `memberKinds.get(id) ?? ref.memberId`
  (`finding-filter.ts:88`), and `availablePairs` becomes a disjoint set of strings. `:928-929` pins
  that the view stayed mounted, which is the precondition the spec required.
- *`keeps the default filter state unchanged when reset is clicked`* (`:944-969`). Better than the two
  lines at `:898-900` it backfills, which had zero refutation power. Mutation it catches: make
  `defaultFindingFilterState()` return `kinds: new Set()` — `:964` drops to 0 rows and `:965` reads
  `['false','false','false']`. Second mutation it catches: add `disabled={!active}` to the reset
  button (the phase-50 R2-B1 regression) — `:968` fails, and I confirmed the matcher is the right one:
  jest-dom's `isElementDisabled` is `canElementBeDisabled(element) && element.hasAttribute('disabled')`
  at `node_modules/@testing-library/jest-dom/dist/matchers-3ed9c960.js:1336-1337`, i.e. it ignores
  `aria-disabled` and therefore tests the HTML attribute specifically. Third: change the handler to
  set `hideExcluded: true` — row count would not move (no exclusions in this fixture) but `:967`
  catches it via `aria-disabled` flipping to `'false'`. Its blind spot is finding 7.

**5. Scope and the harness record.** Scope is clean — only the two permitted files under `src/`. The
report's claims check out against the tree with one qualification:

| claim | verdict |
|---|---|
| `changed_files` | **true** — matches `git diff --stat` exactly |
| `tests_added` (2 names, paths, guarantees) | **true** — names match `:903` and `:944`; the guarantees describe what the assertions actually do |
| `mutations` — restoring the guard fails test 1 | **not re-run by me** (see "not verified"); the mechanism is sound and the arithmetic corroborates it, but the message is paraphrased — finding 6 |
| `validation.red` "36 tests中 35 passed, 1 failed" | **arithmetically consistent** — the file has 34 `it(` sites, one of which is templated inside a 3-case loop at `:727-728` (`ReviewPane.test.tsx:697,703,717`), so 33 + 3 = 36 runtime tests. The base had 32 sites ⇒ 34, so +2 is right. And "1 failed" implies test 2 passed at RED, which is correct — it is a guard, not a refutation |
| `default_state_unchanged` | **true but weak** — `src/lib/review/finding-filter.test.ts:107-114` does fix `expect(result).toBe(findings)`. It is a pre-existing test over an untouched file, so it is a "we did not touch it" argument rather than a measurement. The stronger statement, which the report does not make, is that the diff is a single deletion *inside an event handler* and therefore cannot alter render output at all |
| `paths_verified` (3 paths) | **true** — all three exist |
| `index.json` step 1 summary | **true** |

TDD order is real, not staged: `7f3d0e1` touches only the test file (+68), `2e6c034` touches only
`ReviewPane.tsx` (−1), and `git diff 7f3d0e1..HEAD -- src/components/review/ReviewPane.test.tsx` is
**empty** — the tests were not adjusted after the implementation landed.

**6. `step2-ci-parity.md`** — finding 5. The core inference ("not introduced by this branch") is
sound and well-evidenced; the headline ("proven", "host 由来と確定"), the timeout sentence, and "runs
cleaner" are not.

**7. Anything nobody looked at.** Three things, all named above and none blocking: the stale comment
at `:898` (finding 3); the fact that the new test now *pins* the ARIA state phase 50 and this review
both flagged (finding 4); and the possibility that this branch's own two 698-row tests contribute to
the timeout `step2-ci-parity.md` attributes to the host (finding 5B). I also checked and found
**nothing** wrong in three places worth recording as clean: `phases/50-review-filter/**` does not
appear in the diff at all; `tests/e2e/**`, `src/lib/review/finding-filter.ts`,
`src/lib/review/geometry-check.ts`, `src/lib/store.ts` and `src/components/viewer/**` are all
untouched, so every 禁止事項 in `step1.md` holds; and the reset button gained no `onKeyDown`.

---

## Verified (positively confirmed at the source)

- Diff under `src/` is exactly `ReviewPane.tsx` (−1) and `ReviewPane.test.tsx` (+68); no other `src/`
  file moved; no `tests/e2e/**`, `finding-filter.ts`, `geometry-check.ts`, `store.ts` or viewer file
  moved. `git diff feat-49-findings-filter..HEAD --stat`.
- The deleted line is `if (!active) return` inside the reset button's `onClick` at
  `ReviewPane.tsx:300`; the handler body is now `setFilter(defaultFindingFilterState())` and
  `aria-disabled={!active}` is unchanged at `:299`. No HTML `disabled` attribute was added.
- Complete enumeration of `filter.pairKey` writers: `ReviewPane.tsx:173`, `:265`, `:301`. Chips
  (`:242-251`) and hideExcluded (`:276`) preserve it.
- `filterFindings` returns the input array by reference in the inactive case —
  `src/lib/review/finding-filter.ts:164-166` — and `isFilterActive` is false for both the default and
  the normalised-stale filter (`:45-51`).
- The `reviewFocus` cleanup effect (`ReviewPane.tsx:194-199`) cannot fire on a no-op reset, because
  its `filteredFindings` dep is reference-stable through the update.
- `FindingsTableBody` is `memo` (`ReviewPane.tsx:106`) and all of its props are stable across a no-op
  reset, including `onFocus` (`useCallback` deps at `:221`).
- The scenario's reachability in the product: `PlanImport.tsx:720` → `loadProject`; `PlanImport` is in
  `planActions` at `src/app/page.tsx:42`, mounted regardless of `takeoffTab`; `ProjectActions.tsx:33`
  is a second entry. `loadProject` (`src/lib/store.ts:178-190`) replaces `project` and resets
  `review`/`sel`/`reviewFocus` but **does not touch `result`**, and `setResult` is reached only from
  `runCheck` (`ReviewPane.tsx:451`) while the subtree key is `result.checkId` (`:573`) — so the filter
  state survives the import.
- `directGeometryCheck()` is computed in both new tests before render and used as the row-count
  oracle, matching the pattern of the existing filter tests (`:835`, `:855-857`).
- jest-dom `toBeDisabled` ignores `aria-disabled`:
  `node_modules/@testing-library/jest-dom/dist/matchers-3ed9c960.js:1336-1337`.
- The failing test in `step2-ci-parity.md` spans `ReviewPane.test.tsx:809-831` and carries its own
  `}, 20000)` at `:831`.
- Test count arithmetic: 34 `it(` sites, 3-case loop at `:697/:703/:717`, 36 runtime tests; base had
  32 sites ⇒ 34.
- TDD commit order and test immutability after GREEN (`git diff 7f3d0e1..HEAD -- …test.tsx` empty).
- `finding-filter.test.ts:107-114` fixes the default-state array-reference passthrough with `toBe`.
- `phases/index.json` gained 6 lines and lost its trailing newline.

## Not verified

- **Nothing was executed.** Per the review constraints I ran no `vitest`, no `tsc`, no `lint`, no
  `build`, no browser. Every behavioural statement above is read from the source and the React
  semantics of `memo`/`useMemo`/`useEffect` dependency identity, not from a run.
- **`step1-report.json#/mutations`** — I could not re-run the guard restoration, so "restoring the
  guard fails `clears a stale pair key after loading another project`" is self-reported. The
  mechanism is sound and I could not construct a way for the test to pass with the guard in place
  (it would require `ReviewFindingsView` to remount, which `key={result.checkId}` forbids), but I did
  not observe the failure.
- **`select.options[1].value === '大梁主筋 × 大梁主筋'`** for the sample project. `availablePairs` is sorted
  with `localeCompare(…, 'ja')` (`finding-filter.ts:113`) over kanji strings; I cannot predict the
  collation order without running it, so I cannot confirm the specific pair named in the report — nor
  that `expect(filteredRows.length).toBeLessThan(…)` at `:915` holds for whatever `options[1]` is.
  If it does not, the test fails loudly rather than passing vacuously, so this is a robustness
  question, not a correctness hole.
- **`validation.acceptance`** (`tsc`, `lint` 2-warning baseline, 2048 tests, 393 golden) — not
  re-run. Note the benign divergence: `step1-report.json` records `npm test` fully green at
  2048 passed, `step2-ci-parity.md` records 2047 passed / 1 failed at the same totals. Consistent
  with the load-dependent timeout, not a contradiction.
- **`step2-ci-parity.md`'s control run** on `main @ 632bead` — I did not reproduce it, and with n=1
  per side I could not have distinguished host load from a real fault even if I had.
- **Browser acceptance.** `uc26-findings-filter.js` / `uc25-joint-review.js` were not run here and
  `step2-ci-parity.md` states `uc25` does not complete on this host. The desktop-host acceptance that
  PR #78 has does not extend to this commit.
- **Screen-reader behaviour.** Finding 2's decision is reasoned from the ARIA contract and the
  enumerated states, not from testing with NVDA/VoiceOver.
