# Step8 camera oracle — decision required

Status: **BLOCKED on one user decision.** Everything that can be settled by evidence has been
settled. Nothing is implemented pending this decision; the working tree still holds the v1
implementation (uncommitted), and no product file has been changed.

## How we got here (each step has an artifact)

| # | Artifact | Result |
|---|---|---|
| 1 | `step8-camera-design.md` (Opus 5) | v1 design: in-frame `readPixels` + quiescence + drag |
| 2 | `night/01-design-falsification.md` (Gemini 3.8 Flash High) | **REFUTED** — 3 BLOCKERs (overlay guard blind to `pointer-events:none`; Buffer identity comparison; unaddressed QuickJS `utf8` crash) |
| 3 | `night/01b-design-falsification-opus46.md` (Claude Opus 4.6) | second opinion, NOT_REFUTED |
| 4 | `night/02-implement.log` (Antigravity, Gemini 3.1 Pro) | v1 implemented with all BLOCKER fixes |
| 5 | `night/03-implementation-review.md` (Opus 5) | **HOLD** — `arguments` in an arrow fn crashes at the first `settleClick`; the ROI obstruction predicate was dead |
| 6 | 4 real browser runs + 3 repair cycles | failure point moved forward each time; ended at `BASELINE_NOT_QUIESCENT`, then timeout |
| 7 | `night/06-quiescence-measurement.md` (probe) | `readPixels` channel **proven live** (every frame non-blank, ~770 colours). Canvas **never** quiesces: 240 frames idle, 240 after a click. Auto-rotate at 8 s (`Viewer3D.tsx:2157-2159`) + damping decaying **per frame** (`:1970`, `:92`) at ~3.4 fps |
| 8 | `night/07-camera-design-v2.md` (Opus 5) | quiescence abandoned; two-arm differential on column-profile translation; margin derived ~70x |
| 9 | `night/08-u1u2-result.md` (probe) | U1 **confirmed** (ambient shift = 0 px, 22 pairs). U2 **REFUTED** — commanded drag also 0 px, at `dx=-40` and `dx=-24`. Estimator self-check passed (recovers a known 11 px translation exactly) |
| 10 | `night/09-camera-design-v3.md` (Opus 5) | explains it: an orbit fixes the target's projection, so the transform is **not a translation** — v2 imported a *pan* formula. Proves no pixel-only statistic admits a derived lower bound. Refuses to pick a threshold from the probe's gap |
| 11 | `night/10-v3-falsification.md` (Gemini 3.8 Flash High) | **REFUTED** — v3's own recommendation (Option 1a) is unsound |

## What is now established

- The **original defect is genuinely fixed**: the test can see real rendered pixels. That was the
  whole Scenario 7 blocker at the start.
- **Pixels alone cannot carry a derived camera threshold here.** Lipschitz bounds the pixel
  response to small motion from above; nothing bounds the response to large motion from below
  without a positive lower bound on the scene's spatial gradient, which is not among the named
  constants. Confirmed independently.
- The honest remaining choice is about **what the test is allowed to observe**, not about finding a
  cleverer pixel statistic.

## The decision

### Option 1a — run uc25 under `next dev`, no `src/` change. **REJECTED by independent review.**

v3 recommended this because `viewerPose` already exists in the store and `__kijunStore` is already
exposed under dev. The falsification proved the premise false:

- `captureViewerPose` is hooked **only** to OrbitControls `'end'` (`Viewer3D.tsx:2044`) and tween
  completion (`:2154`). It is **never** called in the render loop, so `viewerPose` is frozen
  between gestures while auto-rotate keeps turning the camera.
- Consequence: in Scenario 14 the "before" pose would be the one captured back in Scenario 7 —
  tens of radians stale — and the ambient gate fails 100% of the time.
- Two further objections: the frame-timestamp ring saturates at 300 (`Viewer3D.tsx:2163`), and
  moving uc25 to dev drops production-build coverage for its other 18 checks, against the repo's
  own documented rule that only uc17 needs dev (`tests/e2e/README.md:95-99`) and its warning about
  sharing `.next` between dev and `next start` (`:108-111`).

### Option 1b — add a live camera-pose accessor to the viewer runtime. **RECOMMENDED by both.**

```ts
// Viewer3D.tsx, in the existing __kijunViewerRuntime hook
getCameraPose: () => ({
  position: [camera.position.x / MILLIMETRES_TO_SCENE, …],
  target:   [controls.target.x / MILLIMETRES_TO_SCENE, …],
}),
```

- Reads the **live** Three.js objects at the instant asked — fixes the staleness blocker outright.
- Both gate endpoints become derived, in radians, from named constants:
  ambient ceiling `|Δθ| ≤ N·A` with `A = 2π·AUTO_ROTATE_SPEED/3600`; commanded floor
  `|Δθ| ≥ 0.336883 − N·A`. Margin ≥10x. No pixel threshold anywhere.
- Costs **zero** `readPixels` frames for the camera assertion.
- uc25 stays on the production build; no `.next` hazard; no timeout growth beyond the `--timeout`
  increase that is needed regardless.
- Six floats describing where the camera is: no drawing or takeoff data, so the reasoning behind
  the existing `NODE_ENV` guard on `__kijunStore` (`store.ts:195-196`, "전체 상태라 프로덕션에 내놓지
  않는다") does not extend to it.

**Why this needs you:** it is a `src/` change, and Step8's standing constraint is *no product core
changes*. That constraint is yours to lift or keep. It is not a behaviour change — the accessor is
observation-only — but it is still product code.

### Option 2 — pick a pixel threshold from the observed gap. **Refused by design.**

`sadAt0` did separate the arms in the probe (ambient max 0.0198, drag min 0.0340), so 0.025 would
pass today. This is exactly the SPEC_DEFECT that started Step8 — fitting an expected value to
observed output — and it is also reachably wrong: a stalled render gives 0 and an unconditional
accept, and a pointer-driven highlight change gives a large value with a frozen camera. Not
designed, not implemented.

### Option 3 — change what Scenario 7 asserts. **Listed only for completeness.**

Would require explicitly relaxing a constraint you set. Not recommended; no design written.

## Corrections that apply to Option 1b before implementation

From `night/10-v3-falsification.md`, all to be honoured if 1b is chosen:

1. **Finding 2** — count frames by filtering `getFrameTimestamps()` to the arm's time window, not
   by array length; the ring saturates at 300.
2. **Finding 4** — Arm C must either perform a settling press before `poseBefore`, or the ambient
   ceiling must include the damping residual `A/d = 0.0109` rad. Pick one and state which.
3. **Finding 5** — pin the azimuth sign convention against `OrbitControls`' `_rotateLeft`, with a
   unit assertion that a negative `dx` drag yields a positive `Δθ`.
4. v3's own open item **V2** — confirm a zero-displacement press still fires `'end'`; if 1b is
   chosen this stops being load-bearing, since the pose is read live rather than on the event.

## Boundary

No implementation, no commit, no push, no PR, no merge. Step8 remains `error`. The v1
implementation in the working tree is superseded and must not be presented as a candidate.
