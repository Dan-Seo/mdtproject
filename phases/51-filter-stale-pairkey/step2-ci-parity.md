# Phase 51 — local reproduction of the CI verify job

## Why this exists

`review.yml` guards every job with `if: ${{ !github.event.pull_request.draft }}`, so a draft PR
runs **no** CI: `gate`, `review`, `scope` and `verify` all report `skipping`. Keeping these PRs in
draft to stay clear of the auto-merge gate therefore also switched off lint, typecheck, test and
build. This document is the substitute evidence, produced by running the `verify` job's own command
list on the Jetson.

It is a **local reproduction, not CI**. The runner differs (Jetson vs `ubuntu-latest`), and the
deterministic checks that CI owns end-to-end — auto-approve/auto-merge gating on a real PR event —
cannot be exercised here at all.

## Results, branch `feat-51-filter-stale-pairkey` @ `7e4e01f`

Commands taken verbatim from `.github/workflows/review.yml` job `verify`.

| step | exit | note |
|---|---|---|
| `npm run lint` | 0 | established 2-warning baseline, no third |
| `npm run typecheck` | 0 | |
| `npm test` | **1** | 1 failed / 2047 passed / 4 skipped — see below |
| `npm run test:ci-scripts` | 0 | the auto-approve/merge scripts' own tests |
| `python -m pytest scripts/ -q` | 0 | **133 passed** — merge-gate failure modes |
| `npm run build` | 0 | |
| `node scripts/perf/blocking-graph.mjs` | 0 | `ok: /page の遮断経路 6 個を読んだ。three は無い` |

The last three had never been run on this host before; CI is their only other home, and CI has been
skipping. All three are clean.

## The one failure is the host, proven by control

```
× targets the checked joint, not the current selection, when an item comes from a finding 21292ms
Error: Test timed out in 20000ms
```

A timeout, not a failed assertion. The test is not ours: `git log -S` attributes it to
`632bead fix(49-joint-review-defects): …`, and it is present on `main`.

**Control run — unmodified `main` @ `632bead`, same host, same session:**

```
Test Files  1 failed | 116 passed | 2 skipped (119)
     Tests  2 failed | 2014 passed | 4 skipped (2020)

FAIL  ReviewPane.test.tsx > creates findings and plain review items with scoped snapshots
      Error: Test timed out in 5000ms.
FAIL  ReviewPane.test.tsx > targets the checked joint, not the current selection, …
      Error: Test timed out in 20000ms.
```

`main` fails the same test, **plus one more**. So the branch is not the cause; if anything the
branch runs cleaner than the control on this host, because the phase-50 tests carry explicit
`}, 20000)` timeouts that the older tests lack.

Corroborating measurement from earlier in the session: the same test took **9827 ms** when it
passed. It took 21292 ms here, after the host had been running builds and suites back to back. The
desktop host ran the full suite green at `2032 tests` for phase 48
(`phases/48-joint-review-ui/step8-report.json#/desktop_host_run`), and again during phase 50's
acceptance.

**Not concluded:** that this test is safe. It is timeout-fragile on slow hardware and has no
explicit timeout of its own, unlike its neighbour at `ReviewPane.test.tsx:831`. That is a
pre-existing property of `main`, not something this branch introduced, and fixing it belongs to
whoever owns phase 49's tests.

## What this does not cover

- **`review` job** — the LLM review that posts the gate marker. Never ran on either PR.
- **`scope` / `gate`** — marker publication and the auto-approve/auto-merge verdict. These are
  `pull_request`-event machinery and cannot be reproduced locally at all.
- **Browser acceptance for phase 51.** `uc25-joint-review.js` does not complete on this host
  (a control run of unmodified `main` at a 900 s budget timed out at 903 s). PR #78's branch has
  desktop acceptance; PR #79's one-line change does not.
- CI's runner, Node version and cache behaviour differ from this host in ways not measured.

## The standing decision

Taking these PRs out of draft would run CI — and would also arm `gate`, which auto-approves and
auto-merges on a `merge` verdict without a human. That trade is the user's call, not mine, so both
PRs stay draft and this document stands in for the missing evidence.
