# Step8 — Scenario 7 camera evidence oracle: DESIGN v2 (post-measurement revision)

Status: **design only**. No repository file was edited; no build, test, vitest, lint or browser
was run to produce this document. Every number below is either read from source at HEAD
`3e632fb` (plus the uncommitted `tests/e2e/` working tree), read from a preserved measurement
artifact, or derived arithmetically from those two. Derivations are shown so they can be
checked without rerunning anything.

Author: design owner (Claude). Per `CLAUDE.md` 개발 프로세스 ②, this document is Claude-authored
and must be **independently falsified by a different agent before it is implemented**; the
implementer must not be its reviewer.

Supersedes: `.git/phase48-run/step8-camera-design.md` §4.5 (quiescence gate), §4.6 (window
budget / re-arm), §4.7 steps 1-4 (trial sequence). Everything else in v1 — canvas identity,
non-blank gate, trusted-pointer log, ROI obstruction check, dual channel, anti-fitting rule —
is **kept**.

Scope: `tests/e2e/uc25-joint-review.js` and `tests/e2e/README.md` only, plus one invocation
parameter (§3.4) that is not a repository file. No `src/`, product, rulepack, fixture or store
change. `phases/48-joint-review-ui/step8.md` still needs no amendment — its Scenario 7 text
prescribes the *interaction* and the *invariance*, never the capture mechanism.

---

## 0. One-paragraph conclusion

Quiescence is the wrong premise, and the measurement proves it for the protocol v1 used. But
the fix is **not** to relax the oracle — it is to change the *statistic*. v1 compared each frame
to a **stale baseline**; over the multi-second gap that the sandbox's CDP latency forces between
the baseline and the measurement, ambient auto-rotate had accumulated enough displacement to
change half the ROI. Compared **frame-to-frame instead**, the ambient signal has a hard,
derivable ceiling that holds *unconditionally* — auto-rotate on or off, damping residual or not:
**the camera can advance by at most `A = 2π·autoRotateSpeed/3600 = 8.7266e-4 rad` per rendered
frame from ambient causes alone**, because OrbitControls' damping is lossless and can never
apply more per frame than was added per frame. That is ≤ 0.37 CSS px of image displacement. The
commanded drag's own residual applies 0.0628, 0.0578, 0.0532 rad on the three frames after
pointer-up — **72×, 66× and 61× the ambient ceiling**. The oracle therefore becomes a matched
two-arm differential on a *displacement* statistic whose margin is derived from OrbitControls'
rotate gain and the camera's focal length in pixels, and never from an observed run. As a
by-product the entire 8 s auto-rotate budget, the re-arm machinery and `BASELINE_NOT_QUIESCENT`
disappear: they existed only to protect a stale baseline that no longer exists.

Scenario 7 does **not** require a product decision. It does require **one non-repository
decision** — the dev-browser `--timeout`, because the script already spends ~146 s before the
camera oracle starts (§3.5), and no camera design of any cost fits in what remains.

---

## 1. Why quiescence is unreachable here

### 1.1 What was measured

`.git/phase48-run/probe8q-1789743263477586628/probe8-quiescence.log`, a read-only probe against
a production build:

| Fact | Value | Line |
|---|---|---|
| ROI | 169×45 device px; canvas rect 843.8125×223.796875 CSS px; `dpr 1` | `PROBE8Q INSTALL` |
| Idle settle (4 bit-identical consecutive frames, 240-frame budget) | `settled:false, framesUsed:240` | `PROBE8Q IDLE_SETTLE` |
| Settle after a click (same criterion, same budget) | `settled:false, framesUsed:240` | `PROBE8Q CLICK_SETTLE` |
| Frame intervals | 296, 295, 227, 290, 379, 221, 295 ms → mean 286.1 ms = **3.50 fps** | `PROBE8Q FRAME_INTERVAL_MS` |
| Non-blank | `zeroAlphaFraction: 0`, `distinct` 765-788 on every frame | `PROBE8Q IDLE_FRAMES` |

The settle criterion is `probe8-quiescence.js:86-97`: advance one `requestAnimationFrame` at a
time, resolve `settled:true` the moment `k=4` consecutive reads share a hash, else resolve
`settled:false` at the frame budget. Because the scan is continuous, `settled:false` at 240
means **no 4-frame bit-identical run existed anywhere in those 240 frames** — including the
early frames of the post-click window, while auto-rotate was still suppressed.

A second, independent frame-rate measurement exists inside the failing `uc25` run itself
(`.git/phase48-run/browser-step8-1789741669817773193/uc25-joint-review.log`, the
`BASELINE_NOT_QUIESCENT` payload): three consecutive captured frames at
`t = 146421.2 / 147300.5 / 148129.0 ms` → intervals **879.3 and 828.5 ms = 1.17 fps**. The
difference from the probe's 3.50 fps is the instrument, not the app: the probe read a
169×45 = 7,605-px ROI, `uc25` reads candidate C2 = 0.30w×0.35h = 253×78 = 19,734 px (2.59× the
pixels) through a per-pixel `Set` + `Map` (`uc25-joint-review.js:495-519`). Pixel ratio 2.59,
interval ratio 2.98. **The oracle is currently the dominant cost of a rendered frame**, which is
both a budget problem (§3) and a fixable one (§5.2).

### 1.2 Why the canvas never goes still — read from source

- `Viewer3D.tsx:2157-2159` sets `controls.autoRotate = true` whenever `runtime.cameraTween ===
  null && performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS` (`:105` = 8000).
- `Viewer3D.tsx:2040-2042` resets `runtime.lastInteractionAt` on the OrbitControls `'start'`
  event, dispatched on pointer-down (`OrbitControls.js:1729`). So a click buys exactly 8000 ms
  of **wall-clock** suppression.
- `Viewer3D.tsx:1970-1971` sets `enableDamping = true`, `dampingFactor = CONTROLS_DAMPING`
  (`:92` = 0.08). `OrbitControls.js:707-710` applies `_sphericalDelta · d` to `_spherical`, and
  `:792-793` decays `_sphericalDelta *= (1 − d)` — **per `update()` call**, i.e. per rendered
  frame, never per unit of time.
- `Viewer3D.tsx:2160` calls `controls.update()` with no argument, so
  `_getAutoRotationAngle(null)` (`OrbitControls.js:923-935`) returns
  `A = 2π/60/60 · autoRotateSpeed` **per frame**, not per second.

The consequence is a units mismatch, and it is the whole story:

> **The suppression window is counted in milliseconds; the decay that has to happen inside it is
> counted in frames.** At 60 fps the 8000 ms window is 480 frames. At the measured 3.50 fps it is
> 28 frames. At `uc25`'s measured 1.17 fps it is 9 frames.

How many frames of decay are needed? The residual at the instant auto-rotate is suppressed is at
most `A/d = 8.7266e-4 / 0.08 = 0.0109083 rad` (§2.2 proves the bound). Bit-identity requires the
per-frame image displacement to round to zero everywhere in the ROI on the rasteriser's
sub-pixel grid; `antialias: true` (`Viewer3D.tsx:1949`) means a sub-pixel geometry shift changes
MSAA coverage on every edge it crosses, and the ROI carries ~770-3,700 distinct colours, i.e. it
is dense with antialiased edges. With Chromium's 1/16-px raster grid the target is a per-frame
displacement < 0.031 CSS px ⇒ azimuth < 7.4e-5 rad ⇒ residual < 9.2e-4 rad, reached after
`ln(0.0109083/9.2e-4)/ln(1/0.92) = 29.7 ≈ **30 frames**`. With a 1/256-px grid, **55 frames**.
If the true floor is not the raster grid but the float round-trip in
`_spherical.setFromVector3(_v)` → `_v.setFromSpherical(_spherical)` that `update()` performs
every frame (`OrbitControls.js:697/781-786`), the answer is **never** — that round-trip runs
unconditionally, with zero delta, forever, and is not proven to have a fixed point.

So: 30-55 frames needed, 9-28 frames available. That is why `CLICK_SETTLE` returned
`settled:false`, and it is a property of the environment's frame rate, not of the product.

### 1.3 Is there a test-side action that makes it reachable?

**Yes, mechanically — and it is rejected on cost, not on impossibility.** I state it exactly
because the brief asks for it.

**Protocol Q (re-armed settle).** A zero-displacement pointer-down is *inert with respect to the
residual*: `_onMouseDown` sets `state = ROTATE` and `_rotateStart`, and a zero-delta
`_handleMouseMoveRotate` calls `_rotateLeft(0)`/`_rotateUp(0)`
(`OrbitControls.js:1105-1111`) — it adds nothing to `_sphericalDelta`. But it *does* reset
`lastInteractionAt` (`Viewer3D.tsx:2042`), and the damping block is not gated on `state`, so the
residual keeps decaying. Therefore: fire an inert pointer-down/up on the canvas every < 8000 ms
while counting rendered frames, until either 4 consecutive frames are bit-identical or a frame
budget of 60 is exhausted.

**Cost.** 60 frames × 0.286 s (probe rate) = **17.2 s per window**, plus 3 re-arm clicks.
At `uc25`'s measured 0.853 s/frame it is **51.2 s per window**, plus 7 re-arm clicks. A
quiescence oracle needs at minimum a quiesced baseline **and** a quiesced no-drag control — two
windows — so 34-102 s per `perturbViewer` call, and `perturbViewer` is called at two sites
(`uc25-joint-review.js:1109`, `:1314`) ⇒ **69-205 s added**. Against a script that already
consumes ~146 s before Scenario 7 (§3.5), this is not affordable at any timeout the project
would accept.

**And the premise is unproven.** The 240-frame measurement refutes quiescence *within a single
8 s window*; it does not test Protocol Q, and it is equally consistent with the float-round-trip
floor of §1.2, under which Protocol Q never terminates and simply burns its 60-frame budget.
Spending 205 s to find that out is not a design; it is a gamble.

**Conclusion: quiescence is abandoned as a premise.** Not because it is unreachable in
principle, but because reaching it costs more than the whole script's budget and may not
terminate. The oracle below does not need it.

### 1.4 What the 0.52-0.56 "ambient diff" actually measured

This matters, because the brief names it as the crux. The three frames in the
`BASELINE_NOT_QUIESCENT` payload carry `msSinceLastPointerDown` 3492.3 / 4371.6 / 5200.1 and
`diffFractionVsBaseline` 0.527 / 0.556 / 0.545. Their baseline was **not** the immediately
preceding frame: `captureFrames` stores the baseline only after a window resolves
(`uc25-joint-review.js:548-550`), and `runCaptureWindow` re-armed
(`:625-634`), so those three frames were compared against the last frame of the *previous*
window pass, roughly 3.5-5 s and 4-6 rendered frames earlier.

So **0.52-0.56 is ambient accumulated over ~4-6 rendered frames, not ambient per frame.** Four
to six frames of ambient is at most `6 × 8.7266e-4 = 5.2e-3 rad`, which is ~2.2 CSS px of image
displacement (§2.3). A ~2 px shift changing >50 % of a rebar-dense ROI is entirely ordinary —
thin high-contrast features decorrelate almost immediately.

Two conclusions follow, and they drive the whole redesign:

1. **Diff-fraction saturates far too early to carry a margin.** It reaches 0.55 at ~2 px and
   ~0.99 at a real drag. There is no derivable mapping from displacement to diff-fraction —
   it depends entirely on the scene's spatial frequency — so **no margin expressed in
   diff-fraction units can be derived from physics.** v1's `MOTION_MIN_DIFF_FRACTION = 0.02`
   was honestly labelled a flicker floor, not a margin; it stays a flicker floor here.
2. **The stale baseline, not the ambient motion, was the defect.** Compare consecutive frames
   and the ambient term collapses from 5.2e-3 rad to ≤ 8.7266e-4 rad — and, crucially, to a
   bound that no longer depends on how long the sandbox's CDP round-trips take.

---

## 2. The differential oracle

### 2.1 Shape

Two arms, run in this order, inside `perturbViewer`, after the unchanged `断面カット` block:

| | **Arm C — control** | **Arm D — drag** |
|---|---|---|
| Opening | `pointerdown` at **P1** | `pointerdown` at **P0** |
| Moves | `MOVE_STEPS` pointermoves, all at **P1** (zero displacement) | `MOVE_STEPS` pointermoves stepping **P0 → P1** |
| Closing | `pointerup` at P1 | `pointerup` at P1 |
| Park | identical | identical |
| Frames captured | `CONTROL_FRAMES = 5` | `DRAG_FRAMES = 3` |
| Channel B | 1 screenshot before, 1 after | 1 screenshot after |

The arms are identical in element, ROI, capture primitive, park protocol, pointer choreography
and move count. **The only difference is the pointermove coordinates.** Arm C terminates its
click at P1, exactly where the drag's click lands, so the ray-pick highlight confound
(`Viewer3D.tsx:2097-2108` → `setHoverRowRef` → `applyHighlight` `:2256-2260`) is reproduced in
the control rather than assumed away. This *replaces* v1's two separate no-drag controls at P0
and P1 with one arm — strictly fewer pointer interactions than the current implementation
performs, so no new exposure for the downstream first-row actions of Scenario 8.

Arm C runs **first** and gets **more** frames than Arm D. Its ambient exposure is therefore an
upper bound on Arm D's (§2.2 shows the per-frame ambient bound is arm-independent, so ordering is
belt-and-braces rather than load-bearing).

Both arms open with a trusted pointer-down, which is still required for one reason only: it sets
`runtime.cameraTween = null` (`Viewer3D.tsx:2041`), killing any Scenario-6 focus tween
(`TRANSITION_DURATION_MS = 550`, `:102`) that would otherwise be a *non-ambient* camera motion
outside the bound of §2.2. The 8 s budget, the `WINDOW_BUDGET_MS` check and the re-arm loop are
**deleted** — §2.2 is why they are no longer needed.

### 2.2 The ambient ceiling — derived, unconditional

Per frame, `Viewer3D.tsx:2160` calls `controls.update()`. Inside `update()`, with
`s = |_sphericalDelta.theta|` at entry and `d = dampingFactor = 0.08`:

```
if (autoRotate && state === NONE)  s ← s + A          OrbitControls.js:700-702, 944-948
_spherical.theta += s · d            (applied)         OrbitControls.js:707-710
s ← s · (1 − d)                                        OrbitControls.js:790-795
A = 2π / 60 / 60 · autoRotateSpeed = 2π·0.5/3600 = 8.72665e-4 rad   OrbitControls.js:923-935
```

Fixed point of `s ← (s + A)(1 − d)` is `s* = A(1 − d)/d = 0.0100356 rad`, approached monotonically
from below. Therefore, for any frame with no pointer-driven delta:

> **applied ≤ (s* + A)·d = A(1 − d) + A·d = A = 8.72665e-4 rad.**

This bound holds **whether auto-rotate is on or off**: with it on, the steady state applies
exactly `A` per frame (damping is lossless — it redistributes, never amplifies); with it off,
the residual is at most `s* < A/d` and applies at most `s*·d < A`. It holds for the very first
frame after a long auto-rotate run, and for every frame after that. It does **not** hold after a
real drag — but a real drag is the commanded signal, and it happens only in Arm D.

> **Ambient total remaining azimuth after suppression ≤ A/d = 0.0109083 rad** (damping eventually
> applies the whole residual). Used in §1.2 only.

`_getAutoRotationAngle` feeds `_rotateLeft` (`OrbitControls.js:702`, `:944-948`), which touches
`_sphericalDelta.theta` only. **Ambient never changes `phi`.** Before Arm D there is no drag, so
`_sphericalDelta.phi === 0` exactly; camera tweens set `camera.position` directly
(`Viewer3D.tsx:2150-2153`) and never write `_sphericalDelta`.

### 2.3 Converting radians to pixels — camera geometry

`CAMERA_FOV_DEGREES = 38` (`src/lib/viewer/geometry.ts:69`, used at `Viewer3D.tsx:1944`);
canvas CSS height `H = 223.797` (probe `INSTALL`); `dpr = 1` and
`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` (`Viewer3D.tsx:1953`), so 1 device px =
1 CSS px in this environment (and the thresholds below are multiplied by `min(dpr, 2)` in code so
this is asserted, not assumed).

```
f  = H / (2·tan(fov/2)) = 223.797 / (2·tan 19°) = 223.797 / 0.688656 = 325.0 px/rad
```

`f` is the screen displacement per radian for scene content projecting near the view centre.
For content at the horizontal frustum edge the gain is larger by the horizontal half-tangent
`(W/2)/f = 421.9/325.0 = 1.298`, giving a worst-case **422 px/rad**. Use 422 for ambient (upper
bound, conservative) and 325 for the command (lower bound, conservative).

| Quantity | radians | CSS px |
|---|---|---|
| **Ambient per frame (ceiling)** | ≤ 8.72665e-4 | **≤ 0.368** |
| Ambient total after suppression | ≤ 0.0109083 | ≤ 4.60 |

### 2.4 The commanded signal — derived from the drag, not from a run

`DRAG_DX_CSS = -40`, `DRAG_DY_CSS = -12` (unchanged from the current implementation), delivered
as `MOVE_STEPS = 8` interpolated moves. OrbitControls' rotate gain
(`OrbitControls.js:1105-1111`; `rotateSpeed = 1` default; `element.clientHeight = 224`):

```
Δθ per CSS px of pointer travel = 2π / 224                     = 0.0280500 rad
per move (dx/8 = 5 px)          δ = 5 · 0.0280500             = 0.1402500 rad
```

Each pointermove calls `update()` (`OrbitControls.js:1113`), so the residual at pointer-up is

```
s₈ = δ·(1−d)·(1 − (1−d)⁸)/d = 0.14025 · 0.92 · 0.486784 / 0.08 = 0.785085 rad
```

and the applied azimuth on the three frames after pointer-up is `s₈·d·(1−d)^(n−1)`:

| frame after pointer-up | applied (rad) | image px (×325) | × ambient ceiling (8.72665e-4) |
|---|---|---|---|
| 1 | 0.062807 | **20.4** | 71.9× |
| 2 | 0.057783 | **18.8** | 66.2× |
| 3 | 0.053160 | **17.3** | 60.9× |

The *inter-frame* shifts the oracle actually measures are the pairs (1→2) and (2→3): **18.8 px**
and **17.3 px**. Nothing in this table comes from an observed run; it is `AUTO_ROTATE_SPEED`,
`CONTROLS_DAMPING`, `CAMERA_FOV_DEGREES`, the canvas rect and the commanded `DRAG_DX_CSS`.

### 2.5 The statistic: inter-frame image displacement

Diff-fraction cannot carry a derived margin (§1.4). Displacement can. Per captured frame, the
in-page `readRoi` additionally produces a **column profile**

```
prof[c] = Σ_rows (r + g + b)        // one extra accumulate in the existing per-pixel loop
```

a real-valued, antialiasing-tolerant signal of length `sw`. Between consecutive frames of the
same arm, estimate the integer horizontal shift by normalised SAD over the overlap:

```
bestShift(a, b, K):                                   // K = SHIFT_SEARCH_PX
  â = (a − mean a) / meanAbsDev a                      // scale/offset invariant
  b̂ = likewise
  for k in [−K, +K]:  sad[k] = Σ_overlap |â[c] − b̂[c+k]| / overlapLength
  return { k: argmin sad, sadAtK: min sad, sadAt0: sad[0] }
```

Cost: one extra accumulator pass already fused into the existing pixel loop, then
`(2K+1)·sw = 97 × 169 ≈ 16k` float ops per frame pair — negligible next to `readPixels`.

Why a profile and not per-pixel matching: under MSAA a 0.3-px shift produces *new blended
colours* that exist nowhere in the previous frame, so any exact-colour tolerant match degenerates
to the raw diff. A row-summed profile degrades smoothly and is the only cheap statistic that
survives antialiasing.

### 2.6 Thresholds — both endpoints derived, nothing fitted

All expressed in CSS px and multiplied by `min(dpr, 2)` before comparison with a device-px shift.

| Constant | Value | Derivation |
|---|---|---|
| `SHIFT_MAX_CONTROL_PX` | **2** | ambient per-frame ceiling 0.368 px (§2.3) → nearest integer 0; +1 for integer-search rounding; +1 slack. **5.4× above the physical ceiling.** |
| `SHIFT_MIN_PX` | **4** | 2× the control ceiling; **10.9×** the physical ambient ceiling (0.368 px) and **4.3× below** the derived minimum commanded inter-frame shift (17.3 px, §2.4). Strictly between two derived bounds. |
| `SHIFT_SEARCH_PX` | **48** | must exceed the largest expected inter-frame shift (20.4 px) with margin and stay below ⅓ of the ROI width (169/3 = 56). |
| `MOTION_MIN_DIFF_FRACTION` | 0.02 | unchanged; a flicker floor, explicitly **not** a margin. |
| `NONBLANK_MIN_DISTINCT` / `NONBLANK_MAX_MODAL_FRACTION` | 32 / 0.98 | unchanged from v1 §4.5; cleared-buffer physics. |

### 2.7 The gates

Every captured frame in **both** arms must pass the existing non-blank gate → `BLANK_FRAME`.
Then, in order:

```
G1  ARM_MISMATCH        Arm C and Arm D logged the same number of trusted pointermoves with
                        (buttons & 1), and the same frame count contract (|C| ≥ |D|).
                        Asserted from the pointer log, not assumed from the API.
G2  PROFILE_DEGENERATE  every frame's profile meanAbsDev > 0  (a flat profile makes bestShift
                        meaningless; the ROI obstruction + non-blank gates should already
                        prevent it, this makes it loud).
G3  CONTROL_MOVED       for every consecutive pair in Arm C:
                        |bestShift| ≤ SHIFT_MAX_CONTROL_PX   — the ambient meter.
G4  SHIFT_BELOW_FLOOR   for every consecutive pair in Arm D:
                        |bestShift| ≥ SHIFT_MIN_PX           — the physics margin.
G5  MOTION_NOT_DOMINANT min over Arm D frames of diffFractionVsPrev
                        >  max over Arm C frames of diffFractionVsPrev
                        — ordering, robust to any failure of the shift estimator.
G6  MOTION_BELOW_FLOOR  max over Arm D of diffFractionVsPrev ≥ MOTION_MIN_DIFF_FRACTION.
G7  CHANNEL_DISAGREEMENT  Channel-B screenshot after Arm D differs (FNV-1a byte hash) from the
                        one before Arm C, and s1.bytes > 1024 → SCREENSHOT_SUSPECT_BLANK.
G8  POINTER_NOT_DELIVERED  unchanged from the current implementation, plus the drag's
                        pointerdown (review finding D6).
```

`cameraMoved` is the conjunction of G1-G8, computed — not the literal `true` the current code
returns (review finding D7).

### 2.8 The crux: why a large ambient cannot produce a false accept

Three independent reasons, in increasing order of strength:

1. **The ambient ceiling is per-frame and unconditional (§2.2).** "Ambient happens to be large"
   is not a state the system can enter: `applied ≤ A` every frame, always, with no pointer input.
   The 0.52-0.56 figure was never a per-frame ambient (§1.4). For G4 to be satisfied by ambient
   alone, `A` would have to exceed 4 CSS px/frame, i.e. `autoRotateSpeed` would have to be
   **≈ 44× larger** than `Viewer3D.tsx:106` sets it. That is a product change, and it would break
   G3 first.
2. **Arm C is the meter, and it fails closed.** If ambient ever *were* large — an unforeseen
   animation, a resize loop, a tween that survived the pointer-down — Arm C's inter-frame shift
   would exceed `SHIFT_MAX_CONTROL_PX` and the run would stop at G3 with `CONTROL_MOVED` and the
   full per-frame record. Arm C runs first, with more frames, on the same element, ROI, and
   choreography. There is no path in which ambient is small in Arm C and large in Arm D: the
   bound of §2.2 is arm-independent, and any arm-specific perturbation that could break it
   (a tween) is killed by the pointer-down that opens *both* arms.
3. **Saturation fails closed.** If ambient were large enough to saturate diff-fraction, G5's
   `min(D) > max(C)` becomes unsatisfiable and the run refuses. Saturation can only cost a
   refusal; it can never manufacture an accept. This is the property v1 lacked, because v1
   compared against a stale baseline whose age was set by CDP latency rather than by the design.

And one more, structural: G4 and G5 measure *different things* (displacement vs. change
fraction) with *different failure modes* (correlation loss vs. saturation). A false accept needs
both to be wrong in the same direction at the same time; a single-channel error produces a
refusal.

### 2.9 Honest statement of relative strength

A quiescence oracle, if attainable, would be **strictly stronger**: a bit-identical baseline
proves ambient is exactly zero, rather than bounded. This design is weaker in exactly that
respect, and I will not pretend otherwise. What it substitutes is (a) a derived, unconditional
per-frame ceiling on the thing quiescence was trying to eliminate, and (b) a matched control arm
that *measures* the thing rather than assuming it. It is the strongest oracle available in an
environment where the premise of the stronger one costs 69-205 s and may not terminate.

---

## 3. Budget arithmetic

### 3.1 Inputs

- Frame interval, instrument-dominated: **0.853 s** measured in-run at ROI 253×78
  (§1.1); **0.286 s** measured by the probe at ROI 169×45. Design target: shrink the ROI to
  169×45 and remove the per-pixel `Set`/`Map` (§5.2) ⇒ plan at **0.40 s** (above the probe's
  worst observed 0.379 s) and give the unreduced **0.88 s** figure as the fallback column.
- Sandbox round-trip: **≈ 185 ms**. Derived: the failing run shows 3492 ms from pointer-down to
  the first captured frame; subtract ≤ 0.88 s of rAF wait ⇒ ≈ 2.6 s spread over the ~14 protocol
  round trips that `settleClick` + `parkPointer` + `captureFrames` issue
  (`uc25-joint-review.js:602-619`, `:594-600`, `:622`) ⇒ 2600/14 ≈ 185 ms.
- Round trips per arm after the reductions of §5.2: pointer choreography `move(steps:2)` + `down`
  + `up` = 4, one fused log+capture `evaluate` = 1, park `move` = 1 ⇒ **6** ⇒ **1.11 s**.

### 3.2 Per call site

| Phase | Round trips | Frames | @0.40 s/frame | @0.88 s/frame |
|---|---|---|---|---|
| Preflight (install, `selectRoi`, 1 gate frame, 1 screenshot) | 3 + 1 shot | 1 | 0.56 + 0.40 + 0.50 = **1.46 s** | 0.56 + 0.88 + 0.50 = **1.94 s** |
| Arm C (open + park + 1 pre-frame + 5 frames) | 6 | 6 | 1.11 + 2.40 = **3.51 s** | 1.11 + 5.28 = **6.39 s** |
| Arm D (open + park + 1 pre-frame + 3 frames + 1 screenshot) | 6 + 1 shot | 4 | 1.11 + 1.60 + 0.50 = **3.21 s** | 1.11 + 3.52 + 0.50 = **5.13 s** |
| Evaluate + teardown + record | 1 | — | **0.19 s** | **0.19 s** |
| **Total per `perturbViewer`** | | | **8.37 s** | **13.65 s** |

Two call sites (`uc25-joint-review.js:1109` Scenario 7, `:1314` Scenario 14):
**16.7 s** at 0.40 s/frame, **27.3 s** at 0.88 s/frame.

For comparison, the current implementation runs a preflight plus **four** windows of 3 frames
with a `settleClick` + `parkPointer` + `evaluate` before each, with up to 2 re-arms per window:
`4 × (2.6 + 3×0.88) = 21.0 s` best case per call site, up to `4 × 3 × 5.24 = 62.9 s` worst case.
The revision is **2.5-7.5× cheaper**.

### 3.3 No timing gate remains

Because `WINDOW_BUDGET_MS`, `MAX_REARMS` and `AUTOROTATE_WINDOW_EXCEEDED` are deleted (§2.2),
**no assertion in the revised oracle depends on wall-clock at all**. Arm C's last frame may land
4 s or 40 s after its pointer-down; the per-frame ambient bound is unchanged either way. The
numbers above are runtime planning, not correctness thresholds — which is precisely what makes
them safe to quote from measurement.

### 3.4 Does the whole script fit in 180 s? **No — and not because of the camera oracle.**

`page.reload` at `uc25-joint-review.js:793` is the last navigation before Scenario 7 (`:1109`);
the next is at `:1399`. So the `performance.now()` values in the captured frames are measured
from that reload. The failing run's first Scenario-7 baseline frame carries **`t = 146421.2 ms`**.

> **≈ 146 s of the 180 s budget is consumed before the camera oracle captures its first frame,
> and Scenarios 8-19 have not started.** A camera oracle costing *zero* would not fit.

The last two runs
(`browser-step8-1789740706691967820`, `browser-step8-1789742377975052996`) both end with
`Script timed out after 180s` on the line immediately following `UC25 CLEARANCE_ORACLE` —
consistent with this reading.

### 3.5 What must change

1. **Raise the invocation timeout to `--timeout 300`.** This is a dev-browser CLI parameter
   (`--timeout <SECONDS>`, "maximum script execution time"), not a repository file, not an
   assertion, and it is already the documented pattern for this project's heavy case:
   `tests/e2e/README.md:105` runs uc17 at `--timeout 300`. Estimated need: 146 s (pre-S7,
   measured) + 17-28 s (camera, both call sites) + Scenarios 8-19 + two reloads. 300 s carries
   ≈ 110-120 s of headroom for the unmeasured tail. **This is required regardless of the camera
   design and is the one decision this document cannot make for the user**, because it lives in
   the step spec / runner invocation rather than in `tests/e2e/`.
2. **Shrink the ROI and remove the per-pixel `Set`/`Map`** (§5.2). Worth 0.88 → ~0.40 s per
   frame, i.e. ~10 s across both call sites, and it is the difference between the oracle costing
   17 s and 28 s.
3. **Measure the 146 s pre-Scenario-7 cost separately.** Out of scope for this revision; it is
   not caused by the camera oracle and must not be "fixed" inside it. Candidates worth a probe:
   the `waitUntil` polls with a 20 s default (`:179`), the 698-row `readFindingRows` at `:985`,
   and the clearance oracle's 24-witness scan. **Do not** cut assertions to buy time here.

If the user declines (1), then Scenario 7 cannot be demonstrated in this environment at any
camera-design cost, and that is a scheduling decision, not an engineering one.

---

## 4. Negative controls — each passes only when the oracle refuses

A scratch probe (`.git/phase48-run/probe8-negatives.js`, **outside the repository**, not one of
the 19 checks, and it must not modify `uc25-joint-review.js`) duplicates the helper source and
runs these. Recorded in `step8-report.json#/camera_oracle/negative_controls`.

| # | Setup | Required refusal |
|---|---|---|
| 1 | Arm D with `P1 === P0` (no displacement) | `SHIFT_BELOW_FLOOR` — **no-drag must not pass as motion** |
| 2 | Arm D with the entire pointer choreography skipped, after ≥ 8 s idle so auto-rotate is provably ON | `POINTER_NOT_DELIVERED`, and with G8 stubbed out, `SHIFT_BELOW_FLOOR` — **ambient-only must not pass** |
| 3 | Arm D choreography dispatched as untrusted `new PointerEvent(...)` via `dispatchEvent` | `POINTER_NOT_DELIVERED` (`isTrusted === false`) — **undelivered/synthetic pointer must not pass** |
| 4 | `readRoi` called from a plain task instead of inside the rAF callback (reproduces the original v1 defect exactly) | `BLANK_FRAME` — **a blank frame must not pass** |
| 5 | `installCameraProbe('存在しないラベル')` | `JOINT_CANVAS_NOT_FOUND` — must **not** fall back to `canvas` |
| 6 | Inject a decoy `<canvas>` first in document order (probe-only DOM), resolve with the joint label | resolver pins the **labelled** node; record `canvasCount: 2` — regression for the old `"canvas[aria-label=…], canvas"` selector |
| 7 | Run the drag on the decoy canvas while the probe is pinned to the joint canvas | `POINTER_NOT_DELIVERED` — **a wrong canvas must not pass** |
| 8 | ROI overridden to a 2×2 uniform background patch | `BLANK_FRAME` (modal fraction) and/or `PROFILE_DEGENERATE` |
| 9 | Arm C given an *injected* profile shift of 6 px (probe-only: shift the captured buffer before the estimator) | `CONTROL_MOVED` — **the ambient meter must be load-bearing** |
| 10 | `bestShift` fed (a) two identical profiles and (b) a profile and a copy translated by a known `k` | returns `0` and `k`. **Estimator self-check — pure arithmetic, no browser needed.** |

Control 10 is the cheapest and strongest, because it validates the one genuinely new component
without a build or a browser. It can run as a scratch Node/QuickJS snippet in the probe. If the
user is willing to widen scope by one file, the better home is a vitest unit test under `tests/`
(the estimator is pure and `src/` is untouched) — **flagged as a scope decision, not taken here.**

"The full run went green" is **not** evidence that the oracle works. Only §4 and the in-run Arm C
are.

---

## 5. Minimal diff brief against the CURRENT working tree

Line numbers are the working-tree `tests/e2e/uc25-joint-review.js` (1611 lines).

### 5.1 Unchanged — do not touch

| Region | Why it stays |
|---|---|
| `loadJsonObject` `:316-322` | falsification BLOCKER 3 fix (base64) is correct and load-bearing |
| `installCameraProbe` canvas resolution + failure codes `:341-364` | single-branch selector, no fallback — keep exactly |
| pointer log + capture-phase listeners `:373-397` | the delivery evidence channel; keep |
| `selectRoi` obstruction logic `:399-455` | `elementsFromPoint` (BLOCKER 1 fix) stays; only the candidate *rectangles* change (§5.2) |
| `readRoi` framebuffer save / bind `null` / restore `:459-478` | correct and read-only wrt the renderer |
| `captureFrames` rAF-chaining `:541-556` | one sample = one rendered frame; the whole point |
| `teardown` `:562-572` | unchanged |
| `captureScreenshotRoi` `:574-592` | FNV-1a byte hash (BLOCKER 2 fix); IHDR assertion stays |
| `perturbViewer` clip block `:663-681` | supplies `clipMoved`; untouched |
| Scenario 7 assertions `:1109-1139` | `checkId === checkId1`, findings, verdicts, remount — **verbatim** |
| Scenario 14 assertions `:1307-1355` | **verbatim** |
| 19-check contract `:1252-1254` region | untouched |

### 5.2 Changed

| # | Location | Change | Size |
|---|---|---|---|
| C1 | constants `:329-338` | delete `STABLE_FRAMES`, `WINDOW_BUDGET_MS`, `MAX_REARMS`; add `CONTROL_FRAMES=5`, `DRAG_FRAMES=3`, `MOVE_STEPS=8`, `SHIFT_SEARCH_PX=48`, `SHIFT_MIN_PX=4`, `SHIFT_MAX_CONTROL_PX=2`. Keep the rest. | ~8 lines |
| C2 | `installCameraProbe` `:365-368` | `BACKING_STORE_MISMATCH` also checks height (review D4) | 3 lines |
| C3 | `selectRoi` candidate table `:400-407` | candidates become 0.20w × 0.20h (≈169×45 device px, matching the probe's measured-fast size): C1 `x .40 y .30`, C2 `x .55 y .35`, C3 `x .40 y .52`. Obstruction logic untouched. | ~6 lines |
| C4 | `readRoi` `:495-539` | replace the per-pixel `Set` + `Map` with a preallocated `Uint32Array(4096)` histogram over a 12-bit quantised colour key (quantisation can only *lower* `distinctColors`, so the ≥32 gate stays conservative); accumulate `prof[c] += r+g+b` in the same loop; diff against `prevPixels` (double-buffered) instead of `baselinePixels`; return `profile` and `diffFractionVsPrev`. | ~35 lines |
| C5 | new in-page helper, after `readRoi` | `bestShift(a, b, K)` per §2.5 — pure arithmetic, no DOM, no GL | ~20 lines |
| C6 | delete `setBaseline` `:558-560` | unused after C4 | −3 lines |
| C7 | `parkPointer` `:594-600` | assert the park point is outside the pinned canvas rect → `PARK_INSIDE_CANVAS` (review D3); drop the blind `waitForTimeout(100)` | ~5 lines |
| C8 | `settleClick` `:602-619` → `runArm({from, to, moves, frames})` | one function performing open + choreography + delivery assertion + park + capture; Arm C passes `to === from`, Arm D passes `to === P1`. Absorbs the drag's own delivery assertion at `:729-740`, adding the missing `pointerdown` check (review D6). | ~40 lines, net ~−10 |
| C9 | **delete** `runCaptureWindow` `:621-659` | the re-arm loop, the budget check, the bit-identity branch and `BASELINE_NOT_QUIESCENT` all go. Its non-blank gate moves into `runArm`. | −39 lines |
| C10 | `perturbViewer` steps 1-4 `:694-762` | replaced by: preflight → `s0 = screenshot` → Arm C → Arm D → `s1 = screenshot` → gates G1-G8 (§2.7) | ~45 lines replacing ~69 |
| C11 | evidence record `:766-781` | emit `UC25 CAMERA_ORACLE` on **failure as well as success** — wrap the gate block in try/catch and attach the full record to the thrown message (review D2, the single most important review finding); record the *parsed* IHDR rather than the expectation (review D5); `cameraMoved` computed, not literal (review D7) | ~15 lines |
| C12 | `tests/e2e/README.md` (uncommitted block) | rewrite: quiescence is not asserted; the oracle is a matched two-arm differential with a derived per-frame ambient ceiling; correct the `elementsFromPoint` over-claim and the pointer-coordinate over-claim (review D8) | ~8 lines |

Failure codes: keep `JOINT_CANVAS_NOT_FOUND`, `CANVAS_AMBIGUOUS`, `BACKING_STORE_MISMATCH`,
`GL_CONTEXT_UNAVAILABLE`, `ROI_OBSTRUCTED`, `ROI_OUT_OF_BOUNDS`, `SCREENSHOT_BYTES_UNAVAILABLE`,
`SCREENSHOT_SCALE_MISMATCH`, `SCREENSHOT_SUSPECT_BLANK`, `BLANK_FRAME`, `POINTER_NOT_DELIVERED`,
`CONTROL_MOVED`, `MOTION_BELOW_FLOOR`, `CHANNEL_DISAGREEMENT`.
Delete `BASELINE_NOT_QUIESCENT`, `AUTOROTATE_WINDOW_EXCEEDED`, `MOTION_NOT_PERSISTENT`,
`NO_MOTION_AFTER_DRAG`. Add `ARM_MISMATCH`, `SHIFT_BELOW_FLOOR`, `MOTION_NOT_DOMINANT`,
`PROFILE_DEGENERATE`, `PARK_INSIDE_CANVAS`.

Net: roughly **−55 / +135 lines** against the current working tree. The v1 machinery that is
deleted (windows, budgets, re-arms, bit-identity) is larger than the machinery that replaces it.

### 5.3 What is *not* weakened, explicitly

- Scenario 7 keeps `checkId === checkId1 && findings === findings1 &&
  JSON.stringify(verdicts) === JSON.stringify(verdicts1)` and the remount assertion, verbatim.
- `checks.checkStableAfterViewerPose` keeps `viewerPerturbation.clipMoved &&
  viewerPerturbation.cameraMoved` as conjuncts — and `cameraMoved` becomes *less* tautological
  than today, because it is computed from G1-G8 rather than hard-coded `true`.
- Scenario 14 is unchanged and keeps its own `cameraMoved` conjunct.
- The 19-check contract is untouched.
- Downstream first-row actions (Scenario 8 onward) see **fewer** canvas clicks than today (two
  arms instead of a baseline click + two control clicks + the drag).
- The non-blank gate, the canvas-identity assertion, the pointer-delivery log and the named
  failure codes are all retained; the readPixels channel that the measurement proved alive is
  untouched.

---

## 6. What I am not sure about, and what would settle it

| # | Uncertainty | Consequence if I am wrong | Evidence that settles it |
|---|---|---|---|
| U1 | **Does Arm C's inter-frame `bestShift` really land in [−2, +2]?** §2.3 derives a 0.368 px ceiling, but the estimator sees antialiasing noise, not pure translation. | Scenario 7 refuses forever at G3 — safe, but unrunnable. | Extend `probe8-quiescence.js` (already has the frame loop, `:64-84`) to report `bestShift` for 20 consecutive idle frames with auto-rotate ON, and 20 after a click. ~20 s of probe. **Run this before implementing.** |
| U2 | **Does Arm D's post-drag `bestShift` track the derived 17-20 px?** A 1.12 rad total rotation changes perspective and brings new geometry into frame; the column profile may decorrelate between consecutive frames even though the camera plainly moved. | Refusal at G4 — safe, but unrunnable. Fallback would be to reduce `DRAG_DX_CSS` (an *input*, so reducing it weakens nothing) until the inter-frame shift sits in a correlating band; §2.4's formula gives 0.51 image px per CSS px of drag at frame 1, so `dx = 24` ⇒ 12.2 px. | Same probe, using its existing `DRAG_SETTLE` phase (`probe8-quiescence.js:131`) with the shift statistic added. Report `bestShift`, `sadAtK` and `sadAt0` for both `dx = 40` and `dx = 24`. |
| U3 | **Is the frame cost `readPixels` size or the JS histogram?** §3.1 plans at 0.40 s/frame on the assumption that a 169×45 ROI plus a typed-array histogram restores the probe's 0.286 s. | The oracle costs 27 s instead of 17 s across both call sites. Does not affect correctness (§3.3), only the timeout headroom. | Probe with ROI at 169×45 and 253×78 × histogram on/off; four conditions, ~15 s. |
| U4 | **`dpr` is 1 here** (probe `INSTALL`). If the harness ever runs at dpr 2, device px ≠ CSS px and every threshold in §2.6 doubles. | Silent factor-2 error in both directions. | Mitigated in design, not left to chance: the thresholds are multiplied by `min(dpr, 2)` in code (matching `Viewer3D.tsx:1953`) and `dpr` is recorded in the evidence record. No further evidence needed. |
| U5 | **The irreducible non-quiescence floor** — is it MSAA sub-pixel coverage, or the unconditional Cartesian→spherical→Cartesian round-trip in `update()` (`OrbitControls.js:697`, `:781-786`)? §1.2 treats both as candidates. | Only affects whether Protocol Q (§1.3) would ever terminate. It does not affect this design, which no longer needs quiescence. | A probe that logs the camera position each frame with zero input. **There is no way to do this without a product change**: `__kijunViewerRuntime` (`Viewer3D.tsx:2010-2021`) exposes renderer info, frame timestamps, rebuild stats and the tween target — **not the camera pose** — and it is installed only when `process.env.NODE_ENV !== 'production'` (`:2009`), so it does not exist in the `npm run build` artifact the e2e runs against. Leave unresolved. |
| U6 | **Does Playwright's `mouse.move(x, y, {steps: n})` dispatch `n` moves when start === end?** Arm C's matching depends on it. | Arm C would log fewer moves than Arm D and the arms would not be matched. | Not left to trust: **G1 (`ARM_MISMATCH`) asserts the logged move counts are equal**, from the capture-phase pointer log. If Chromium coalesces, the run says so by name instead of quietly comparing unmatched arms. |
| U7 | **The 146 s pre-Scenario-7 cost** (§3.4) is measured but unattributed. | If it grows, even `--timeout 300` stops being enough. | A timing probe that logs `performance.now()` at each scenario boundary. Cheap, but **out of scope for this revision** — do not let it become an excuse to trim assertions. |
| U8 | **Whether `viewerPose` offers a cheaper state-level oracle.** It is written to the store on the OrbitControls `'end'` event (`Viewer3D.tsx:2022+`, `src/lib/store.ts:40`,`:107`,`:148`), but it is read only by `ReviewPane.tsx:969`/`:1030` when composing a review item — and Scenario 7 must not create one, since Scenarios 7 and 14 assert review state is unchanged. There is no DOM attribute or production test hook exposing it. | A pose oracle would be simpler and immune to every pixel concern, but exposing it is a **product change** (a `data-` attribute or a production-safe hook) and therefore the user's decision, not mine. | Flagged for the user, not adopted. If the user prefers it, say so and this design is superseded by a much smaller one. |

Two of these — **U1 and U2** — are gating. They cost one ~35 s read-only probe run and they
decide whether the thresholds of §2.6 are usable as written. **Run that probe before
implementing.** If U1 or U2 comes back wrong, the response is to adjust the *commanded input*
(`DRAG_DX_CSS`) or the *estimator*, never the derived thresholds — those come from
`AUTO_ROTATE_SPEED`, `CONTROLS_DAMPING` and `CAMERA_FOV_DEGREES`, and moving them to fit an
observation is exactly the failure mode the anti-fitting rule exists to prevent.

---

## 7. Boundary

Design only. Not Step8 acceptance. Not a product-defect finding — continuous motion after 8 s
idle is the documented auto-rotate behaviour and damping is a deliberate feature. Not approval
of any implementation: per `CLAUDE.md` 개발 프로세스 ②, this document must be independently
falsified by an agent that did not write it and will not implement it, and the implementer must
not be its reviewer.
