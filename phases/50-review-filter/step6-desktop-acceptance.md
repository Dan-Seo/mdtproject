# Phase 50 step 6 — desktop-host browser acceptance: reached

## Verdict

Browser acceptance for `feat-49-findings-filter` is **reached on the desktop host**. This
discharges the `blocked_on: desktop host browser run` that step 3 recorded, and settles the
deltas step 4 deliberately left as "recorded, not concluded".

One thing step 3's acceptance list did not ask for turned out to matter more than the rest:
**`uc25-joint-review.js` never touches the filter bar.** A green uc25 is non-regression evidence
only — it would be exactly as green if the filter bar had failed to render. That gap is closed
below by a separate script, with the caveat that the script is not committed.

## Host and method

Desktop (Windows 11), Node v24.15.0, npm 11.12.1. The same machine as the phase-48
`desktop_host_run`, not the Jetson.

Order for every measurement, per `CLAUDE.md`: `rm -rf .next` → `npm run build` →
`npx next start -p 3000` → dev-browser. No `next dev` was ever running. After each build the
served HTML was checked to contain the new `.next/BUILD_ID` and a referenced chunk was fetched
for a 200, so no run could pass on a stale chunk.

| what | commit |
|---|---|
| branch under test | `b5687c5` (uc25, regressions, filter check, perf run #1) |
| branch under test | `4d80262` (perf run #2) |
| control | `main` @ `632bead` |

`4d80262` landed mid-session. `git diff --name-only b5687c5..4d80262 -- src tests` is **empty** —
the two commits renumber phase 49 to 50 and add documents, touching no code and no test. The
measurements taken at `b5687c5` therefore apply unchanged to the current head.

## What ran

| script | timeout | result |
|---|---|---|
| `uc25-joint-review.js` | 300 s | **exit 0, all 20 `checks` true** |
| `uc1-initial-load.js` | 180 s | exit 0 |
| `uc2-plan-selection.js` | 180 s | exit 0 |
| `uc3-section-edit-recalc.js` | 180 s | exit 0 |
| `uc7-source-and-formula.js` | 180 s | exit 0 |
| `uc9-building-view.js` | 180 s | exit 0 |
| `uc10-viewer-features.js` | 180 s | exit 0 |
| `uc15-revisit.js` | 180 s | exit 0 |
| `uc25-perf.js` | 300 s | exit 0, `budget_met: true` |

The script asserts its own count (`if (Object.keys(checks).length !== 20) throw`), so "20 checks"
is the script's assertion, not a tally taken by hand. Step 3 wrote "19"; the current script
carries 20.

## The default-filter identity, measured against `main`

Step 3 made this the point of the change: the findings table must be identical to its pre-change
content in the default filter state. Nothing inside uc25 can assert that, because uc25 has no
pre-change side. So `main` @ `632bead` was built and the **same** uc25 run against it —
the branch diff touches no file under `tests/`, so the script is byte-identical on both
checkouts and the app code is the only variable.

| observation | branch | main | |
|---|---|---|---|
| `findings0` | 40,522 chars | 40,522 chars | sha256 prefix equal |
| `findings1` | 121,966 chars | 121,966 chars | sha256 prefix equal |
| `initialFindingRowCount` | 698 | 698 | equal |
| `verdicts0`, `verdicts1` | — | — | equal |
| `filteredItemCount` | 1 | 1 | equal |
| `checks` keys / all true | 20 / yes | 20 / yes | equal |

The filter bar renders as a sibling of `[data-testid='review-findings']`, and `readCheckResult`
reads that table by an exact attribute match, so the added UI is outside what the assertion sees.
Identity holds by measurement, not by argument.

## The gap uc25 does not cover, and how it was closed

`grep -rln "review-findings-filter\|filterChip\|filter.reset" tests/e2e/` returns **no files**.
The feature this phase exists to add has no coverage in the e2e suite; `finding-filter.test.ts`
and `ReviewPane.test.tsx` cover it in vitest/jsdom, which is not a browser.

A throwaway script drove the real controls. Each assertion is written to fail if the filter does
nothing — narrowing must strictly reduce the row count *and* remove exactly the deselected kind,
reset must restore the table byte-for-byte, and the empty notice must not be inside the table.

| observation | value |
|---|---|
| baseline rows / summary | 698 / `698 / 698件` |
| kind chips, default | `干渉候補`, `あき不足候補`, `接触` — all `aria-pressed=true` |
| kinds actually in the table | `干渉候補`, `接触` |
| pair options | 4: `all`, `大梁主筋 × 大梁主筋`, `大梁主筋 × 柱主筋`, `柱主筋 × 柱帯筋` |
| deselect `干渉候補` | 698 → **592** rows; remaining kinds `['接触']`; summary `592 / 698件`; reset becomes enabled |
| reset | 698 rows, table text **identical to baseline** |
| pair `大梁主筋 × 大梁主筋` | **24** rows, summary `24 / 698件` |
| all kinds off | **0** rows, empty notice present, `emptyInsideTable: false`, summary `0 / 698件` |

All seven checks true.

**Limitation, stated plainly:** this script lives outside the repository (session scratchpad,
`uc49-filter.test.js`). It was not promoted to `tests/e2e/`, so **this section is not reproducible
from the repository alone** and nothing in CI will notice if the filter bar regresses. Promoting
it is a separate decision and was not taken here.

## Performance: the Jetson deltas do not reproduce

Three runs on the desktop, same production path. Two of them are the branch, taken at different
times from different builds, which gives a same-code yardstick for run-to-run spread.

Stress fixture (5 storeys):

| metric | budget | main | branch #2 | branch #1 | Jetson recorded |
|---|---|---|---|---|---|
| `joint_tab_ms` | 1500 | 163 | 168 | 154 | +298 |
| `check_ms` | 3000 | 610 | 620 | 586 | −257 |
| `compare_ms` | 3000 | 238 | 252 | 251 | +398 |
| `tab_switch_ms` | 500 | 75 | 79 | 81 | −10 |

Sample project:

| metric | budget | main | branch #2 | branch #1 |
|---|---|---|---|---|
| `joint_tab_ms` | 1500 | 45 | 44 | 44 |
| `check_ms` | 3000 | 444 | 419 | 419 |
| `compare_ms` | 3000 | 57 | 55 | 56 |
| `tab_switch_ms` | 500 | 36 | 34 | 35 |

`budget_met: true` on all three runs.

**The two Jetson budget misses were the host.** `check_ms` measured 3219 ms there against a
3000 ms budget; here it is 586-620 ms. `tab_switch_ms` measured 681 ms against 500 ms; here it is
75-81 ms. Step 4's reading was right.

**The large Jetson deltas do not survive.** `joint_tab` +298 ms becomes +5 ms and `compare`
+398 ms becomes +14 ms. Step 4 declined to conclude from them; that restraint was correct.

**One small effect does look real, and is recorded rather than dismissed.** On the stress fixture
`compare_ms` is `main` 238 against branch 251 and 252. The two branch runs were built separately
and taken at different times yet agree within 1 ms, and `main` sits below both rather than between
them. Raw post-warm-up samples: main `[240, 238, 237]`, branch #2 `[252, 261, 252]`, branch #1
`[251, 253, 243]`. That is roughly +5.5 % of the metric and **0.5 % of its 3000 ms budget**.
`tab_switch_ms` shows the same shape at +4 to +6 ms. Neither threatens a budget.

**Sampling limit.** `uc25-perf.js` fixes the statistic at median of 3 after 1 warm-up (`median3`
throws on any other count). With three samples per run, the direction of a ~5 % effect can be
stated because two independent branch runs agree, but its magnitude cannot be claimed precisely.

## What is still not verified

- **The filter e2e is not in the suite.** The only browser evidence for the feature is the
  uncommitted script above. Nothing guards it going forward.
- **Step 5's open MINORs are untouched** — including the stale `filter.pairKey` that survives
  loading a different project. No attempt was made to reproduce them in a browser.
- **`hideExcluded` was not exercised.** The checkbox was asserted present and unchecked in the
  default state, but never toggled; the kind chips and the pair select were.
- **This document was written by Claude and has had no independent verification.** Per
  `CLAUDE.md`, Claude's own writing is to be refuted by codex in a later verify step, not
  accepted because the author is confident. The measurements above are reproducible by rerunning
  the commands; the readings of them are not yet reviewed.
