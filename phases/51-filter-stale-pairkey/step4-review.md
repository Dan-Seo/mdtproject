VERDICT: PASS

# Phase 51 step 4 — independent review of step 3 (`19cce2a..HEAD`, branch `feat-51-filter-stale-pairkey`)

Reviewed `git diff 25dbdaa..HEAD`. Under `src/` the change is exactly two files:
`src/components/review/ReviewPane.tsx` (1 line) and `src/components/review/ReviewPane.test.tsx`
(+41/−2). Everything else is `phases/51-filter-stale-pairkey/**` and `phases/index.json`.
Step 1, step 2 and `phases/50-review-filter/**` were not re-reviewed.

No command was run beyond `git`, `grep`, `sed`, `awk` and file reads. No build, no test, no browser —
per the round's constraint. See "not verified".

**The MAJOR is closed.** The stale state is now both clearable and perceivable, the default state is
bit-for-bit untouched, and the mutation record is genuine. Five MINORs follow; none block browser
acceptance.

---

## Findings

### 1. MINOR — the remedy signposts the stale state; it does not remove the silent re-application path

`src/components/review/ReviewPane.tsx:186` makes the reset button light up, but it writes nothing.
`filter.pairKey === P` still survives in state, and step3-review.md finding 1's step 4 —
"load the first 案件 back → P returns to `availablePairs` (`ReviewPane.tsx:180`) → the pair filter
re-applies with no user action" — is still reachable for any user who does not press the newly lit
button. The only signal is the button's own `opacity` (`ReviewPane.module.css:167-178`); no text
appears, the select still reads `all` (`:263`), and the count still reads `N / N件` (`:291-294`).

This is not an implementation defect: `step3.md` §直すもの mandated this exact expression, the
previous reviewer derived it independently and judged it sufficient ("stale な状態が利用者から見える"),
and `step3.md` §禁止事項 forbids the alternative (an effect that clears `filter.pairKey`). Recording it
so the residual is not lost: the harm is mitigated and made repairable, not eliminated. If a future
phase wants it eliminated, the fix is a state write, not a second derived flag — and it belongs in a
phase that can re-argue the no-effect decision.

### 2. MINOR — `mutations.failing_test` is singular, but the run that produced the output was name-filtered

`phases/51-filter-stale-pairkey/step3-report.json#/mutations/0/failing_test` names one test, and
`#/validation/restored_mutation_test` shows the command carried
`--testNamePattern='exposes reset when the displayed pair key is stale'`. The pasted trailer
(`Tests  1 failed | 36 skipped (37)`) confirms 36 of 37 were filtered out, so the run cannot support
an exclusivity claim. With the mutation applied and no filter, `ReviewPane.test.tsx:933`
(`clears a stale pair key after loading another project`) fails as well — it asserts
`aria-disabled === 'false'` in the same stale state. The report never writes the word "only", so this
is framing, not a false statement. Nothing to fix in code; worth knowing if the number is quoted later.

### 3. MINOR — finding 7's repair closes one of four post-click assertions; the other three keep the same blind spot

`ReviewPane.test.tsx:1000-1001` now re-queries `screen.getByTestId('review-findings')` after the click
at `:998`. That is exactly what step3-review.md finding 7 asked for and exactly what `step3.md` §テスト3
ordered. But `chips` (captured `:985-989`, asserted `:1002`) and `resetButton` (captured `:984`,
asserted `:1004-1005`) are still the pre-click nodes. On a remount those three assertions read
detached DOM whose values happen to be the defaults — the identical vacuity finding 7 named, on the
identical test. Faithful to spec, incompletely repaired as a class. Minimal improvement if picked up:
re-query all four inside the post-click block.

### 4. MINOR — the new test's `getByRole('status')` is an implicit uniqueness bet on joint resolution

`ReviewPane.test.tsx:975` calls the unscoped `screen.getByRole('status')` *after* `loadProject`.
`ReviewPane` renders `ReviewItemsSection` alongside `ReviewCheckSection` (`ReviewPane.tsx:1511-1516`),
and that section emits a second `role="status"` whenever `jointUnavailableReason !== null`
(`ReviewPane.tsx:1355-1358`), which would make the query throw "found multiple elements".

It does not throw today, and I traced why rather than assuming it: `loadProject` recomputes the
selection via `initialSelection` (`src/lib/store.ts:178-184`) to the first `柱` of the *new* project —
an `alternate-*` id that exists — and `resolveJoint` returns `'joint'` for any sample column, because
it only requires `girders.length > 0` (`src/domain/review/joint.ts:112-118`) and `createGirders`
emits an X-girder at every `iy` and a Y-girder at every `ix`
(`src/domain/model/sample-project.ts:206-238`). So `jointUnavailableReason` stays `null`. The bet is
sound but undeclared; `within(screen.getByTestId('review-findings-filter')).getByRole('status')` would
make it explicit. Note that three tests in this same file *do* render the second status
(`ReviewPane.test.tsx:726-742`), so the collision is not hypothetical, only currently unreached.

### 5. MINOR — two step-3-review findings remain open, both outside `step3.md`'s scope

- Finding 3: `ReviewPane.test.tsx:898` still reads `// Verify clicking reset button while
  aria-disabled="true" is a no-op`, describing the `if (!active) return` guard that step 1 deleted.
  Unchanged by this diff. `step3.md` did not ask for it.
- Finding 8: `phases/index.json` still ends without a trailing newline (`tail -c` shows the file
  terminating at `}`), and step 3 modified that file without restoring it.

Also cosmetic: `step3-report.json#/default_state_unchanged` mixes a Korean fragment into a Japanese
sentence ("`filterFindings は変更하지 않았고`"). Harmless; the phase's reporting language is otherwise JA.

---

## Judgements against the seven questions

**1. Does it close the MAJOR?** Yes. Walking the scenario against the real component: the subtree
does survive `loadProject` — `setResult` has exactly one call site, `runCheck` at
`ReviewPane.tsx:451` (verified by grep: the only three hits are `:366`, `:379`, `:451`), and the key
is `result.checkId` (`:573`), so no remount occurs and `filter.pairKey` persists. `memberKinds`
(`:366-369`) is rebuilt from the new `project.members`, the findings still carry the old member ids,
so `barMemberRole` falls back to the raw id (`finding-filter.ts:84`) and every entry of
`availablePairs` changes. `safePairKey` therefore drops to `'all'` (`:180`), `filter.pairKey !==
safePairKey` is true, and `active` becomes `true` (`:186`) → `aria-disabled="false"` (`:298`) →
`.filterResetButton[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed }`
(`ReviewPane.module.css:175-178`) no longer matches, so the button visibly brightens and regains
`cursor: pointer` (`:167-173`). The ARIA contract is simultaneously repaired: the control that now
responds no longer announces itself as disabled.

Remaining path where `filter.pairKey` is neither applied nor visible nor clearable: **none.** Whenever
it is not applied (`filter.pairKey !== safePairKey`) it is by construction signalled and clearable —
the same inequality drives both. See finding 1 for the residual that *is* left: it is signalled but
not explained, so an inattentive user can still walk into the re-application.

**2. Is `active` correct in every state?** Enumerated at `ReviewPane.tsx:186`:

| state | `filter.pairKey` | `safePairKey` | `active` | needed |
|---|---|---|---|---|
| genuine default | `'all'` | `'all'` | `false` | `false` ✔ |
| ordinary active filter (pair present) | `P ∈ availablePairs` | `P` | `true` | `true` ✔ |
| stale pair key alone | `P ∉ availablePairs` | `'all'` | `true` | `true` ✔ |
| stale key + deselected kind chip | `P ∉` | `'all'` | `true` | `true` ✔ |
| `hideExcluded` on + stale key | `P ∉` | `'all'` | `true` | `true` ✔ |
| first render, no check yet | — | — | not evaluated | ✔ |
| frame after `loadProject`, `availablePairs` empty | `'all'` / `P` | `'all'` | `false` / `true` | ✔ |

Two non-obvious points I checked rather than assumed. (a) The default row cannot false-positive:
`availablePairs.includes('all')` is always `false` because `extractAvailablePairs` only emits keys
built by `findingPairKey`, which always joins on `' × '` (`finding-filter.ts:100,108-117`) — so when
`filter.pairKey === 'all'`, `safePairKey` is assigned `'all'` by the fallback and the two are equal.
(b) The "first render" row is not a state at all: `ReviewFindingsView` renders only inside
`{result !== null && (…)}` (`ReviewPane.tsx:573-587`), so before a check the expression does not exist.

Consumers of `active`: `grep -n "active" src/components/review/ReviewPane.tsx` returns exactly two
lines — the definition at `:186` and `aria-disabled={!active}` at `:298`. Nothing else reads it, so
`active` disagreeing with `isFilterActive(effectiveFilter)` in the stale state cannot leak anywhere
but that one attribute. In particular the table, the count, the select and the chips all read
`filteredFindings` / `effectiveFilter` / `filter`, never `active`.

**3. Byte-identity preserved?** Yes, on two independent grounds. (a) `filterFindings` and its
reference-identity early return (`src/lib/review/finding-filter.ts:164-166`) are byte-identical —
`git diff 25dbdaa..HEAD --stat` lists no file under `src/lib/`, and the call site at
`ReviewPane.tsx:188-191` still passes `effectiveFilter`, which the diff does not touch. `active` is
not an input to it. (b) `active` reaches only `ReviewPane.tsx:298`, which sits in
`div.filterSummary` (`:289`) inside `div[data-testid="review-findings-filter"]` (`:227-230`). That
div closes at `:305`; `<table data-testid="review-findings">` opens at `:307`. The attribute is
therefore outside the guarded subtree entirely. And in the default state `active === false` exactly
as before, so even the filter bar's markup is unchanged — the diff is observable only in states that
were previously mislabelled.

**4. Are the test changes honest?** Yes. The diff contains three hunks and no deletions of assertions.
The single authorised inversion is `ReviewPane.test.tsx:933` (`'true'` → `'false'`), carrying the
required why-comment at `:932` ("stale な pairKey を利用者が直せる唯一の入口なので…"), which is what
`step3.md` §テスト1 demanded. I diffed the remaining `aria-disabled` assertions in the file:
`:863`, `:876`, `:892`, `:900`, `:996`, `:1004` all still read `'true'` and all are default-state or
post-reset assertions — none weakened. `:968`'s `not.toBeDisabled()` pin on the absent HTML `disabled`
attribute survives (`:1005`). No test was deleted; the file goes from 34 to 35 `it(` statements.

The new test `exposes reset when the displayed pair key is stale` (`:945-978`) does assert the
pre-click state, all three items: `aria-disabled === 'false'` (`:973`), `select.value === 'all'`
(`:974`), and the full count `N / N件` (`:975-977`). It never clicks, so it cannot launder the
assertion through a reset. It also builds its stale state from a fresh `select.options[1].value`
(`:951`) rather than a hard-coded pair, and proves the filter was really applied first
(`:955-957`, rows `< expected.findings.length`), so it cannot pass vacuously on a filter that never
engaged.

Mutations it catches — three, not one:
- revert `:186` to `isFilterActive(effectiveFilter)` → `:973` fails (the recorded one);
- make `safePairKey` return `filter.pairKey` unconditionally (`:180`) → `:974` fails, because the
  select would display the departed pair;
- pass the raw `filter` instead of `effectiveFilter` to `filterFindings` (`:188-191`) → `:975` fails,
  because the count would read `0 / N件`.

Note also that `:974` is quietly remount-proof by accident: it asserts on the `select` captured at
`:949`, and a remount would leave that detached node holding `originalPair`, not `'all'` — so the
assertion fails loudly instead of passing vacuously. That is the opposite of finding 3's problem.

**5. The mutation record.** It reads as genuine Vitest/jest-dom output, and I checked it against the
file rather than against my memory of the format. Three independent corroborations:
- The code frame in `step3-report.json#/mutations/0/observed` reproduces lines 971–975 of
  `ReviewPane.test.tsx` character-for-character, including the `…` truncation of line 972 at the
  terminal width, and the caret column `973:27` lands on the `t` of `toHaveAttribute` (6 spaces +
  `expect(resetButton)` = 25 chars, `.` at 26, `t` at 27) — which is where Vitest points.
- The `// element.getAttribute("aria-disabled") === "false"` trailer on the first line is jest-dom's
  own echo format, not something a paraphraser reconstructs.
- `Tests  1 failed | 36 skipped (37)` reconciles exactly with the file: 34 statically-written `it(`
  calls plus the templated `it()` at `:728` inside the 3-case loop over `unresolvableSelections`
  (`:690-724`) = 37. A fabricated total would have had to guess that the loop contributes 3.

The claim is consistent with the test as written — reverting `:186` makes `active` false in the stale
state, which is precisely `:973`'s assertion. Scope caveat in finding 2.

**6. The remount repair.** Repaired at `ReviewPane.test.tsx:1000-1001`, and it does close the hole
finding 7 named: the row-count assertion now runs against the live DOM, so a remount that reset the
table could no longer be masked by the detached node's retained rows. Partial by class — see
finding 3 for the three sibling assertions that still use pre-click captures.

**7. Scope.** Clean. `git diff --stat 25dbdaa..HEAD` lists 8 files: `phases/index.json`, six files
under `phases/51-filter-stale-pairkey/`, and exactly the two permitted `src/` files. No
`src/lib/review/finding-filter.ts`, no `tests/e2e/**`, no `src/lib/store.ts`, no
`src/lib/review/geometry-check.ts`, nothing under `src/components/viewer/`. The working tree is clean
at HEAD, so the diff is what is on the branch. `step3.md`'s prohibition on adding `onKeyDown` to the
reset button and `role="status"` to the empty notice is respected — `ReviewPane.tsx:296-304` has only
`onClick`, and `:314-318` has no role.

**8. Anything nobody looked at.** Three things, all named above, none blocking: the `getByRole('status')`
uniqueness bet (finding 4, which nobody has traced before because the previous review did not have a
test that queried it after `loadProject`); the fact that the mutation run was name-filtered
(finding 2); and the two carried-over step-3-review findings (finding 5). I also specifically checked
one thing the prompt did not ask about and found it clean: whether `active` could be true while the
reset click is a no-op in a way that would make the lit button lie. It cannot produce a *wrong*
result — in the stale state the click genuinely changes state (`filter.pairKey: P → 'all'`) — but the
only visible consequence is the button dimming again, since select, count and table already show the
normalised view. That is thin feedback, and it is the same observation as finding 1 from the other end.

---

## Verified (positively confirmed at the source)

- The diff under `src/` is two files and nothing else — `git diff --stat 25dbdaa..HEAD`; working tree
  clean (`git status --porcelain` empty).
- `active` has exactly two mentions in `ReviewPane.tsx` — the definition `:186` and
  `aria-disabled={!active}` `:298`. No other consumer exists.
- `active === false` in the genuine default, because `availablePairs` can never contain `'all'`
  (`finding-filter.ts:100,108-117`) so `safePairKey === filter.pairKey === 'all'`.
- The table `[data-testid='review-findings']` opens at `ReviewPane.tsx:307`, after the filter bar div
  closes at `:305`; `active` cannot reach it.
- `filterFindings`' original-array-reference return (`finding-filter.ts:164-166`) is untouched, and
  its call site still receives `effectiveFilter` (`ReviewPane.tsx:188-191`).
- The reset button's visual state is really keyed on the attribute:
  `ReviewPane.module.css:175-178` dims only `[aria-disabled='true']`.
- `setResult` has a single call site (`ReviewPane.tsx:451`, inside `runCheck`) and the subtree key is
  `result.checkId` (`:573`) — so the `loadProject` scenario keeps the view mounted, as step3.md claims.
- `memberKinds` is rebuilt from the live `project.members` (`:366-369`), which is the mechanism that
  makes the pair key go stale.
- `ReviewFindingsView` is gated on `result !== null` (`:573-587`), so "first render before any check"
  is not a state `active` can be wrong in.
- `loadProject` reassigns `sel` via `initialSelection` (`src/lib/store.ts:178-184`) to a valid member
  of the new project, and `resolveJoint` succeeds for any sample column
  (`src/domain/review/joint.ts:112-118` with `src/domain/model/sample-project.ts:206-238`) — so the
  new test's unscoped `getByRole('status')` resolves uniquely.
- The test file's total of 37 Vitest cases (34 literal + 3 from the loop at `:690-728`) matches the
  count in the pasted mutation output.
- Only `ReviewPane.test.tsx:933` was inverted; `:863`, `:876`, `:892`, `:900`, `:996`, `:1004` still
  assert `'true'`, and `:1005` still pins the absent `disabled` attribute.

## Not verified

- **Nothing was executed.** No `npx vitest run`, no `tsc --noEmit`, no `npm run lint`, no
  `npm run build`, no browser — the round's constraint forbids it and this host cannot finish them.
  Every behavioural statement above is read from source, not observed.
- Consequently `step3-report.json#/validation` is unchecked: the 118 files / 2049 tests figure, the
  "3 files / 45 tests" review-suite run, the 393 golden tests, and "lint passed with the existing
  2 warnings" are all taken on the harness's word. The report's *internal* consistency I did check
  (see question 5); its *external* truth I did not.
- That the new test at `:945-978` passes is reasoned, not run. The one step I could not close by
  reading alone is whether `expected.findings.length` from `directGeometryCheck()` equals the
  component's `result.findings.length` at assertion time — it should, since both come from the same
  original project and `result` is component state untouched by `loadProject`, but the actual number
  was never produced.
- The desktop hash-identity of the default-state `[data-testid='review-findings']` subtree against
  `main` (`phases/50-review-filter/step6-desktop-acceptance.md`) was not re-measured. I confirmed by
  reading that `active` is `false` in the default state and never reaches that subtree, which is the
  argument that the hash cannot have moved — but the hash itself is from the prior phase's record.
- The known host-flaky test named in `step3.md` (`targets the checked joint, not the current
  selection…`, `ReviewPane.test.tsx:809`) — the report says it did not fire this run; unverifiable here.
- I did not re-review step 1, step 2, or `phases/50-review-filter/**`, per the round's scope.
