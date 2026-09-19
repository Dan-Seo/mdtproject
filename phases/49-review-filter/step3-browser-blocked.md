# Phase 49 step 3 — browser verification: blocked on host capability, not on this change

## Verdict

`tests/e2e/uc25-joint-review.js` **cannot complete on the Jetson host**, with or without the
Phase 49 filter. Browser acceptance for this branch must run on the desktop host, exactly as
Phase 48 step 8 did.

This is a host limit. It is not evidence for or against the filter change.

## Evidence

Two runs of the same resource-capped unit (`MemoryMax=2G`, `CPUQuota=150%`), same script,
same production build path (`npm run build` → `next start -p 3000` → headless dev-browser).

| run | tree | script timeout | result | receipt |
|---|---|---|---|---|
| 1 | `feat-49-findings-filter` @ `d24d3fa` | 300 s | timed out at 300 s | `.git/phase48-run/browser-p49-step8-1789785380985865075/` |
| 2 | **`main` @ `632bead`, no Phase 49 changes** | 900 s | **timed out at 903 s** | `.git/phase48-run/browser-p49-step8-1789785900147265793/` |

Run 2 is the control. `git status --porcelain` showed no tracked modifications; the only
untracked entries were pre-existing phase-48 harness logs. The baseline fails the same way the
branch does, three times over the budget that passes elsewhere.

Both runs reached the same point and emitted the same oracle lines before dying:

```
UC25 CLEARANCE_ORACLE {"derivation":{"pitchMm":100,"diameterMm":13,"gapMm":87},
  "thresholds":{"lowMm":86,"highMm":88},
  "predicate":{"lowForbiddenCount":0,"highWitnessCount":24}}
UC25 CAMERA_ORACLE {"coverageBefore":4,"coverageAfter":5,"points":5}
```

So the clearance oracle and the camera oracle both **pass** on the Jetson. What does not finish
is the remainder of the script.

## Why the desktop host is the right runner

`phases/48-joint-review-ui/step8-report.json#/desktop_host_run` records that Phase 48's browser
acceptance was reached on «desktop (Windows 11), separate machine from the Jetson run recorded
above», with `uc25 exit_code 0, checks_true 19, consecutive_green_runs 2` at `--timeout 300`.
The same report carries `"runtime_acceptance": "PASS_DESKTOP_HOST"`.

The 300 s budget that is comfortable on the desktop is not reachable on the Jetson: run 2 shows
the Jetson needs more than 900 s and still does not finish. The Jetson is the orchestration host,
not the browser-acceptance host.

## What has been verified for this branch, and what has not

**Verified** (see `phases/49-review-filter/step2-review.md` for the full list):

- `npm run typecheck` exit 0; `npm run lint` exit 0 (2 pre-existing warnings, both untouched here);
  `npm test` **2046 passed / 4 skipped**, 118 files.
- Independent review verdict PASS, with the byte-identity guarantee re-derived from the diff:
  `filterFindings` returns the original array reference (`finding-filter.ts:164-166`), and the
  filter bar, table and empty notice are siblings, so `[data-testid='review-findings']` — an exact
  attribute match used by `readCheckResult` and `readFindingRows` — sees an unchanged subtree.
- The three MINORs closed after review, one of them confirmed by mutation: replacing the
  reconciliation branch with `const effectiveFilter = filter` fails the new reference-identity
  test in `finding-filter.test.ts` and nothing else.

**Not verified**: real-browser behaviour of this branch. Specifically Scenario 7's
`findings === findings1` identity check against a live DOM, and the seven regression scripts
(`uc1, uc2, uc3, uc7, uc9, uc10, uc15`), none of which ran — the harness aborts on the first
failing script.

Green host gates are evidence, not proof. This branch is **not** browser-accepted.

## What the desktop host should run

From `feat-49-findings-filter` at `d24d3fa`:

```
npm ci
npm run build
npx next start -p 3000
npx dev-browser --browser kijun --timeout 300 run tests/e2e/uc25-joint-review.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc1-initial-load.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc2-plan-selection.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc3-section-edit-recalc.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc7-source-and-formula.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc9-building-view.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc10-viewer-features.js
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc15-revisit.js
npx dev-browser stop
```

Acceptance is **not** `exit_code 0`. It is: all 19 `checks` keys true in the uc25 output, all seven
regression scripts exit 0, and — the point of this change — the uc25 findings table identical to
its pre-change content in the default filter state.

`tests/e2e/uc25-perf.js` should also run (budgets 1500/3000/3000/500 ms). It was never executed on
the Jetson either; the phase-48 harness had it hard-blocked behind a placeholder, which this branch
removed in `.git/phase48-run/browser-host49.py` but did not get to exercise.
