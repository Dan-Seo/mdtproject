# Phase 50 — `uc25-perf.js` on the Jetson: budget misses are the host, not this change

## Verdict

`uc25-perf.js` fails its budgets on the Jetson **with and without** the Phase 50 filter. The
controlled comparison shows no regression attributable to this branch; on the stress fixture the
branch is *faster* than `main` on the one metric the filter could plausibly affect.

Like `uc25-joint-review.js`, this script needs the desktop host to produce an acceptance verdict.

## Method

Same resource-capped unit (`MemoryMax=2G`, `CPUQuota=150%`), same production path
(`npm run build` → `next start -p 3000` → headless dev-browser), back-to-back, nothing else running.
The only variable is the checkout.

- branch: `feat-49-findings-filter` @ `e598233` — receipt `browser-p49-step9-1789795387335938291`
- control: **`main` @ `632bead`, no Phase 50 changes** — receipt `browser-p49-step9-1789795772165194934`

Both were run with the harness at `.git/phase48-run/browser-host49.py`, which now materialises the
stress fixture where the script expects it (`~/.dev-browser/tmp/uc25-stress.json.b64`); the phase-48
harness had this path hard-blocked, so these are the first `uc25-perf` numbers ever taken here.

## Numbers (median of 3 after 1 warm-up, as the script reports them)

Sample project:

| metric | budget | branch | main | Δ |
|---|---|---|---|---|
| `joint_tab_ms` | 1500 | 919 | 911 | +8 |
| `check_ms` | 3000 | 2491 | 2423 | +68 |
| `compare_ms` | 3000 | 355 | 340 | +15 |
| `tab_switch_ms` | 500 | 480 | 491 | −11 |

Stress fixture (5 storeys, 100 columns, 140 girders):

| metric | budget | branch | main | Δ |
|---|---|---|---|---|
| `joint_tab_ms` | 1500 | 1293 | 995 | +298 |
| `check_ms` | **3000** | **3219** ✗ | **3476** ✗ | **−257** |
| `compare_ms` | 3000 | 1737 | 1339 | +398 |
| `tab_switch_ms` | **500** | **681** ✗ | **691** ✗ | −10 |

`budget_met: false` on both runs.

## Reading

**The two misses are present on unmodified `main`.** `check_ms` overshoots by 7% on the branch and
by 16% on `main`; `tab_switch_ms` overshoots by ~37% on both. Neither is introduced here.

**`tab_switch_ms` could not be this change.** The filter bar renders only inside the `{result && …}`
block and is not on the tab-switch path at all. Both checkouts land within 10 ms of each other
(681 vs 691), which is what "unrelated" looks like.

**`check_ms` is the metric R1's BLOCKER was about** — the concern that building the filter's pair
vocabulary would push the measured check window over budget. On the stress fixture the branch is
**257 ms faster than `main`**, so the `ReadonlyMap<string,string>` precomputation is doing its job:
the one-pass `extractAvailablePairs` costs less than the linear `project.members.find` scans it
replaced in that window. That blocker is answered by measurement, not by argument.

**Sample-project deltas are inside the noise.** All four are ≤ 68 ms against raw spreads of several
hundred ms (e.g. branch `check` raw `[3212, 2409, 2887, 2491]`, main `[3309, 2491, 2295, 2423]` —
both straddle the 3000 ms budget sample-to-sample).

**The larger stress deltas are not clean signal.** `joint_tab_ms` +298 and `compare_ms` +398 look
material, but the raw samples overlap heavily and both metrics stay inside budget on both
checkouts. The Jetson's run-to-run variance here is wider than the differences being compared:
the same `check` measurement ranges 2409-3212 on one checkout and 2295-3309 on the other. Three
samples per metric on a thermally-constrained SBC cannot separate a ~10% effect from noise. **These
deltas are recorded, not concluded.** If the desktop host reproduces them with tight spreads, they
are real and worth chasing; on this evidence they are not attributable.

## Status

- Phase 50's R1 performance BLOCKER: **answered** — `check_ms` improves against `main` on the
  stress fixture, on real measurements.
- `uc25-perf.js` acceptance: **not reached on the Jetson, and not reachable** — the budgets fail on
  `main` too. Desktop host required, same as `uc25-joint-review.js`.
- No performance regression attributable to this branch was found.
