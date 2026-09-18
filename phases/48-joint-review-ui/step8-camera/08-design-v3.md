# Step8 — Scenario 7 camera evidence oracle: DESIGN v3 (post-U2-refutation)

Status: **design only**. No repository file was edited; no build, test, vitest, lint or browser
was run to produce this document. Every number is read from source at HEAD `3e632fb` (plus the
uncommitted `tests/e2e/` working tree), read from a preserved probe artifact, or derived
arithmetically from those two. Derivations are shown so they can be checked without rerunning
anything.

Supersedes `07-camera-design-v2.md` §2.3, §2.4, §2.5, §2.6, §2.8 and §3.1 entirely. Keeps v2 §1
(quiescence is unreachable and abandoned), §1.4 (diff-fraction saturates and carries no margin),
and every v1 element v2 kept: canvas identity, non-blank gate, trusted-pointer log, ROI
obstruction check, dual channel, anti-fitting rule.

Author: design owner (Claude). Per `CLAUDE.md` 개발 프로세스 ②, this document must be
independently falsified by a different agent before anything is implemented, and the implementer
must not be its reviewer.

Boundary: design only. Not Step8 acceptance. Not a product-defect finding. Not approval of any
implementation. **§6 ends in a decision for the user, not in an adopted oracle.**

---

## 0. One-paragraph conclusion

The translation model failed for a reason that is structural, not incidental: an OrbitControls
azimuth change is an **orbit about the controls target**, which in a perspective projection
*fixes the target's projection* and induces a depth-dependent shear plus an in-plane roll plus a
quadratic term — it does not slide the image. v2 §2.3 used `f·Δθ`, which is the displacement law
for a camera **yawing about its own optical centre**; for an orbit the corresponding coefficient
is `f·sinφ·(r/D − 1)`, which is **exactly zero at the target's depth**. Re-derived correctly, the
predicted mean horizontal translation of the pinned ROI under the commanded drag is **≤ 0.85 px,
not 17–20 px**, and the predicted ambient value is **≤ 0.012 px** — so `bestShift = 0` in both
arms is the *derivation's own prediction*, and U2 did not refute the estimator or the physics, it
refuted v2's projection law. Carrying that forward: the commanded and ambient displacement fields
straddle the 1-px sampling scale (0.03 px vs 2.2 px), so **no single linearisation covers both
arms**, and therefore no ratio between two photometric arms follows from the ratio of applied
angles. More fundamentally, converting a displacement field into a scalar pixel statistic
requires the scene's spatial gradient and its depth field, neither of which is among
`AUTO_ROTATE_SPEED`, `CONTROLS_DAMPING`, `CAMERA_FOV_DEGREES`, the canvas rect or `DRAG_DX_CSS`.
Lipschitz arguments yield **upper** bounds on pixel change from small camera motion; they never
yield a **lower** bound on pixel change from large camera motion. The oracle needs exactly that
lower bound. **So the honest answer to the brief's §6 is yes: no test-side pixel oracle admits a
derived floor, and §6 presents the options rather than inventing one.** The recommended option is
not the product change v2 flagged as U8 — it is cheaper: `viewerPose` **already exists in the
store and is already written on every OrbitControls `end` event**, and `window.__kijunStore`
already exposes it under `next dev`, for which this repo already has a documented single-scenario
precedent (`uc17`). Read as azimuth, both endpoints are derived from the named constants alone,
with a ≥ 10× margin and no pixel physics anywhere.

---

## 1. Why the translation model failed — from the geometry, not as a guess

### 1.1 What an OrbitControls azimuth change actually is

`OrbitControls` stores the camera **relative to `controls.target`** in spherical coordinates and,
every `update()`, recomputes `camera.position = target + v(_spherical)` and re-aims the camera at
the target (`OrbitControls.js:697`, `:781-786`). `_rotateLeft` writes `_sphericalDelta.theta`
only (`:702`, `:944-948`). Therefore an azimuth change is a **rigid rotation of the camera frame
about the world-vertical axis through the target** — equivalently, in the camera's own frame, a
rigid rotation of the entire scene about that axis.

Two consequences follow immediately and both are fatal to a translation model:

1. **The target's projection is a fixed point.** The target is on the rotation axis, so it does
   not move in world space; the camera still looks at it; so it lands on the same pixel before
   and after. An image transform with a fixed point is not a translation.
2. **The transform is not a function of image position alone.** Points at different depths move
   differently, because the rotation moves them through different arcs relative to the camera.

v2 assumed the opposite of both.

### 1.2 The first-order image flow field of an orbit — derived

Camera frame: `X` right, `Y` up, `Z` toward the viewer; the camera looks along `−Z`; the target
sits at `T_cam = (0, 0, −r)` where `r = |camera.position − target|`. Let `φ` be the polar angle
between the orbit axis (world up, `e_y`) and the target→camera direction. OrbitControls builds
the camera basis with `X ⟂ e_y`, so in camera coordinates

```
e_y|cam = (0, sin φ, cos φ)
```

For a scene point `P` with camera-space coordinates `(X, Y, Z)`, write `p = P − T_cam =
(X, Y, Z + r)`. A rotation by a small angle `α` about the axis `e_y` through `T` displaces it by
`δp = α (e_y × p)`:

```
e_y × p = ( sinφ·(Z+r) − Y·cosφ ,  X·cosφ ,  −X·sinφ )
```

With depth `D = −Z > 0` and the pinhole projection `x = f·X/D`, `y = f·Y/D`, propagating both the
transverse displacement and the depth change `δD = −δZ = α·X·sinφ` gives, to first order:

```
Δx = α · [ f·sinφ·(r/D − 1)   −   y·cosφ   −   (x²/f)·sinφ ]        (1)
Δy = α · [        x·cosφ      −   (x·y/f)·sinφ            ]         (2)
                    ^depth        ^roll        ^quadratic
```

(Check: at `φ = 90°` this reduces to `Δx = α[f(r/D − 1) − x²/f]`, `Δy = −α·x·y/f`, which is the
level-camera orbit, and the target `x = y = 0, D = r` gives `Δx = Δy = 0` as §1.1 requires.)

Read the three terms:

- **Depth term `α·f·sinφ·(r/D − 1)`.** This is the only term that is uniform over the image — and
  it is *not* a constant, because `D` is per-pixel. It vanishes identically at the target's depth
  and changes sign across it. A column profile sums over rows with *different* `D`, so this term
  smears the profile rather than sliding it.
- **Roll term `−α·y·cosφ` (with `+α·x·cosφ` in `y`).** Together these are an **in-plane image
  rotation** by `α·cosφ` about the principal point. A rotation is not a translation; over an ROI
  of height `h` it contributes a horizontal *shear* of `α·h·cosφ`.
- **Quadratic term `−α·sinφ·x²/f`.** Zero on the optical axis, growing outward. A stretch, not a
  translation.

**There is no `f·α` term anywhere in (1).** That term exists only for a camera that rotates about
its own optical centre (a pan): there, `x' = f·tan(atan(x/f) + α) ≈ x + α(f + x²/f)`, whose
leading term *is* `f·α` and *is* uniform at all depths. v2 §2.3 wrote "`f` is the screen
displacement per radian for scene content projecting near the view centre" — true for a pan,
false for an orbit. **That single substitution is the whole of the v2 error.** The arithmetic
built on it (§2.4's 17.3/18.8/20.4 px) is internally correct and externally meaningless.

### 1.3 A translation model cannot be rescued by moving the ROI

One might hope an off-axis ROI would recover a coherent translation from the quadratic term. It
cannot, and this is derivable rather than empirical. Over an ROI of width `w` centred at `x`, the
quadratic term's mean is `α·sinφ·x²/f` and its variation across the ROI is
`|d/dx| · w = 2α·sinφ·|x|·w/f`. The ratio

```
variation / mean = 2w / |x|
```

is ≥ 1 for any `|x| ≤ 2w`, and reaching a "coherent" 4:1 (variation ≤ ¼ of the shift) needs
`|x| ≥ 8w = 8 × 169 = 1352 px` — more than three times the canvas half-width (`421.9 px`). **For
every ROI that fits in this canvas, the intra-ROI variation of the orbit's horizontal
displacement is at least ≈ 0.8× its mean.** Translation is the wrong model *everywhere in this
viewport*, not just at the ROI that was probed. And the depth term, which the above ignores, only
makes it worse.

### 1.4 The numbers at the pinned ROI — and they predict `k = 0`

Inputs, all read from source or from the probe `INSTALL` line, none from an observed shift:

| Symbol | Value | Source |
|---|---|---|
| `A` (ambient per frame) | `2π·0.5/3600 = 8.72665e-4 rad` | `AUTO_ROTATE_SPEED = 0.5` (`Viewer3D.tsx:106`), `OrbitControls.js:923-935` |
| `d` | `0.08` | `CONTROLS_DAMPING` (`Viewer3D.tsx:92`) |
| `f` | `223.796875 / (2·tan 19°) = 324.98 px/rad` | `CAMERA_FOV_DEGREES = 38` (`geometry.ts:69`), canvas rect (probe `INSTALL`) |
| `cos φ`, `sin φ` | `0.34/|[0.72,0.34,0.86]| = 0.29010`, `0.95697` | `CAMERA_DIRECTION` (`geometry.ts:71`) |
| ROI | `169×45` device px at `(338, 67)`, `dpr 1` | probe `INSTALL` |
| principal point | `(421.906, 111.898)` | canvas rect / 2 |
| ROI centre offset | `x̄ = +0.59`, `|ȳ| = 22.40`; half-extents `84.5 × 22.5` | arithmetic on the two rows above |
| `δ` per pointermove | `2π·(40/8)/224 = 0.1402498 rad` | `DRAG_DX_CSS = −40`, `MOVE_STEPS = 8`, `clientHeight = 224`, `OrbitControls.js:1105-1111` |
| `s₈` at pointer-up | `δ(1−d)(1−(1−d)⁸)/d = 0.785116 rad` | damping recursion, `OrbitControls.js:707-710`, `:790-795` |
| `α₁` (applied, frame 1 after pointer-up) | `s₈·d = 0.0628093 rad` | same |

Note `x̄ = 0.59 px`: **the ROI is horizontally centred on the optical axis to within one pixel.**
That is not a lucky accident of this run — `selectRoi`'s candidate table (`uc25:400-407`) places
candidates near the canvas centre by construction.

Evaluating (1) over the ROI, separating the scene-independent terms (roll, quadratic) from the
scene-dependent one (depth):

| Term | commanded, `α₁ = 0.0628093` | ambient, `α = A = 8.72665e-4` |
|---|---|---|
| roll, mean `α·\|ȳ\|·cosφ` | **0.408 px** | **0.0057 px** |
| roll, spread across ROI height `α·45·cosφ` | 0.820 px | 0.0114 px |
| quadratic, mean `α·sinφ·⟨x²⟩/f`, `⟨x²⟩ = x̄² + w²/12 = 2380` | **0.440 px** | **0.0061 px** |
| quadratic, max `α·sinφ·x²_max/f`, `x²_max = 7241` | 1.339 px | 0.0186 px |
| depth, `α·f·sinφ·(r/D − 1)` | `19.53 · (r/D − 1)` px | `0.2714 · (r/D − 1)` px |

The two scene-independent terms carry **opposite signs** in (1), so their means partly cancel;
taking the worst case (no cancellation) the commanded mean translation is bounded by
`0.408 + 0.440 = 0.85 px` and the ambient by `0.012 px`. The depth term's **mean** is ≈ 0 whenever
the ROI's depths straddle the target depth, which they do by construction — the ROI is centred on
the view, and the view is aimed at the joint.

> **Derived prediction: `bestShift.k = 0` in both arms. Measured: `k = 0` in all 22 ambient pairs
> and all 10 drag pairs.** The probe did not falsify the physics; it falsified v2's projection
> law, and the corrected law predicts the probe's output without a single fitted quantity.

What *does* change is the **spread**, i.e. the warp: commanded `0.820 + 1.339 = 2.16 px` of
scene-independent shear/stretch plus up to `19.53·|r/D − 1|` px of depth shear, against ambient
`0.030 px` plus `0.271·|r/D − 1|`. That is the residual the probe saw as `sadAtK` rising from
~0.016 to ~0.05, and as `distinct` moving 426–445 → 305–377. **The camera moved; the image warped;
it did not translate.** Every one of those three statements is now derived.

### 1.5 Two corollaries that matter downstream

1. **`sadAtK ≡ sadAt0` in every one of the 32 probe pairs.** That is not a coincidence or a
   degenerate estimator — it is what (1) predicts. With the mean translation below half a pixel in
   both arms, the integer-shift search can only ever select `k = 0`, so the "best shift" residual
   and the zero-shift residual are the same number. The shift search is therefore **dead code**
   for this viewport: it spends `(2K+1)·sw ≈ 16k` operations per pair to return a constant.
2. **The one place the orbit *does* produce a large uniform image motion is exactly where the
   test cannot look**: content far from the target depth (`|r/D − 1|` large). That is unbounded,
   scene-dependent, and (see §2.2) not derivable after a focus tween.

---

## 2. Is there a statistic with a derivable ambient ceiling *and* a derivable commanded value?

### 2.1 What the named constants actually determine

From `AUTO_ROTATE_SPEED`, `CONTROLS_DAMPING`, `CAMERA_FOV_DEGREES`, the canvas rect and
`DRAG_DX_CSS`, exactly these are derivable:

- **In radians** — everything. Ambient applied azimuth per frame `≤ A = 8.72665e-4` (v2 §2.2's
  fixed-point argument survives untouched: it is about the damping recursion, not about
  projection). Commanded azimuth added `8δ = 1.121999 rad`, applied by pointer-up
  `8δ − s₈ = 0.336883 rad`, applied per frame after pointer-up `s₈·d·(1−d)^{n−1}` =
  0.0628093 / 0.0577846 / 0.0531618 rad. Commanded polar change (from `DRAG_DY_CSS = −12`) added
  `2π·1.5/224·8 = 0.336600 rad`, applied by pointer-up `0.101065 rad`. Ratio commanded : ambient
  per frame = **72.0×**.
- **In pixels** — only the *scene-independent* part of the flow field (roll + quadratic), i.e.
  §1.4's middle rows. That part is **sub-pixel even at full command** (≤ 0.85 px mean,
  ≤ 2.16 px spread).
- **Not derivable in pixels** — the depth term, which is the only part that could produce a
  supra-pixel uniform motion. It needs `r/D` per pixel.

### 2.2 Why `r/D` is not derivable here

`fitCamera` (`geometry.ts:1189-1222`) sets `distance = max over bounding-box corners of
[ dot(rel, cameraZ) + CAMERA_FRAME_MARGIN·projectedRadius / tan(fov/2) ]`. For a roughly isotropic
bounds of half-extent `ρ`, that gives `r ≥ ρ + 1.08ρ/0.344328 = 4.137ρ`, hence
`r/D ∈ [0.805, 1.319]`, i.e. `|r/D − 1| ≤ 0.319` — a genuinely derived bound, worth
`≤ 6.23 px` of commanded depth shear and `≤ 0.087 px` of ambient.

**But it does not apply to the camera Scenario 7 actually has.** Scenario 6 focuses the joint, and
the focus tween re-fits the camera to the *joint's* bounds (`Viewer3D.tsx:2146-2155`,
`lerpCameraFit`) while the scene still contains the surrounding 柱·大梁 geometry. Content then sits
at depths far from the new, much smaller `r`, and `|r/D − 1|` is bounded only by the near plane —
which the test cannot read. So even the **ambient pixel ceiling** is not derivable for the state
under test. The 0.368 px of v2 §2.3, and the 0.012 px of §1.4 above, are both *scene-independent
partial* ceilings, not total ones.

### 2.3 The structural asymmetry: upper bounds are derivable, lower bounds are not

Every candidate statistic is photometric — it reads pixels. The map from a camera pose change to
a pixel change factors as

```
camera angle α  --(geometry, §1.2)-->  displacement field Δ(x,y;D)  --(scene)-->  pixel change
                    derivable                                          NOT derivable
```

The second arrow is where it dies, and it dies asymmetrically:

- **Upper bound (derivable in principle).** For `|Δ| ≲ 1 px`, `|I_{n+1} − I_n| ≤ |Δ| · |∂I/∂x|`,
  and `|∂I/∂x|` can be *measured inside the same frame*. So "small camera motion ⇒ small pixel
  change" is a Lipschitz statement with a measurable constant. This is the shape of a **control**
  gate.
- **Lower bound (not derivable, ever).** "Large camera motion ⇒ large pixel change" requires a
  **positive lower bound on the scene's spatial gradient along the flow direction**. There is no
  such bound: a uniform ROI gives zero change under any camera motion; an ROI whose structure runs
  parallel to the flow gives zero change under a shear along it; a **periodic** ROI gives a
  residual that *dips back toward zero* at displacements matching its period — and this ROI is a
  rebar array whose 帯筋 pitch is a fixture fact (`tests/e2e/README.md`: `C1 帯筋 ピッチ 100`,
  `D13`). This is the shape of the **drag** gate, and it cannot be built.

The existing gates do not close the gap. `NONBLANK_MIN_DISTINCT = 32` and
`NONBLANK_MAX_MODAL_FRACTION = 0.98` bound the ROI's *colour diversity*; they say nothing about
the *arrangement*, which is what a displacement statistic reads. An ROI of 32 colours in
horizontal bands passes both gates and is invariant under horizontal shear.

### 2.4 Candidate statistics, each closed out

| Candidate | Ambient ceiling derivable? | Commanded floor derivable? | Why it fails |
|---|---|---|---|
| integer column-profile shift (`bestShift`, v2 §2.5) | yes (`k = 0`) | **no** — §1.4 derives the commanded shift as ≤ 0.85 px, i.e. **also `k = 0`** | the statistic is identically 0 in both arms; it is not merely underpowered, it has no signal to carry |
| sub-pixel shift (parabolic interpolation of the SAD minimum) | no | no | must resolve 0.03 px vs 0.85 px through 8-bit MSAA coverage; the resolution floor is the scene's noise, not a constant |
| fit `Δx(x) = a + b·x + c·x²` and recover `α = −c·f/sinφ` | in radians, yes | in radians, yes | the fit's residual is dominated by the **unmodelled depth term**, which is per-pixel and of larger magnitude (up to 19.53·\|r/D−1\| px vs 1.34 px quadratic). The fit error is not bounded by anything derivable |
| normalised SAD (`sadAtK`) / diff-fraction | partially (Lipschitz, §2.3) | **no** | needs a gradient lower bound; also saturates (v2 §1.4) |
| gradient-normalised residual `R/G` (px units) | yes for `\|Δ\| ≲ 1 px` | **no** | the linearisation is valid only on the ambient side; see §3(a) |
| in-plane image rotation angle (recover `α·cosφ` from a rotational cross-correlation) | yes | yes *in radians* | the commanded roll is `α·cosφ = 0.0182 rad` = 1.04°; over a 169×45 ROI that is a 0.82 px shear — sub-pixel again, same resolution floor |

**Verdict on question 2: no.** No pixel statistic has both endpoints derivable. The ceiling is
derivable in radians and (partially) in pixels; the floor is derivable in radians and **not at all
in pixels**. Since the oracle's job is precisely to assert the floor, the answer that matters is
negative.

---

## 3. The two-arm ratio test

Proposal under test: require `S_drag / S_control ≥ ρ`, with `ρ` derived from the ratio of applied
angles (`≈ 60–72×`), `S` a photometric statistic, both arms measured in the same run.

The brief is right that a ratio between two arms of the same run is not, in itself, a fitted
constant. The problem is upstream of that.

### (a) Is the ratio bound derived? **No — and it is derivably violated.**

`S_drag/S_control = α_drag/α_control` follows **only if `S` is homogeneous of degree 1 in `α`**,
i.e. `S(α) = c·α` with the *same* `c` at both ends. `c` is the image's mean absolute spatial
gradient along the flow direction — a scene quantity, not one of the five named constants. It
cancels in the ratio only if both arms sit in the **same linear regime**, and linearity of a
residual in `α` holds only while the displacement is small against the sampling scale.

From §1.4, derived and with nothing from an observed run:

```
ambient displacement field at the ROI:   mean ≤ 0.012 px,  spread ≤ 0.030 px
commanded displacement field at the ROI: mean ≤ 0.85  px,  spread ≤ 2.16  px
pixel pitch:                             1 px
```

**The two arms sit on opposite sides of the sampling scale** (`0.030 < 1 < 2.16`). No single
linearisation covers both, so `c` does not cancel, so the ratio bound does not follow from the
angle ratio. This is a derivation, not an observation.

It is worth stating what the observed data then implies, *as a consistency check only and not as a
source of any constant*: the derived ratio is ≥ 60×, the observed `sadAt0` ratio is
`0.034/0.0198 = 1.7×` to `0.082/0.011 = 7×`. A prediction wrong by a factor of 10–40 is not a
threshold that needs adjusting; it is a premise that has failed. Lowering `ρ` to the observed 1.7×
would be fitting, and is refused.

### (b) Can a large ambient excursion satisfy the ratio? **The control arm is not the exposure — the drag arm is.**

In the control arm, a large ambient excursion *inflates the denominator* and the ratio falls
below `ρ` → refusal. Safe, and this is the case v2 §2.8 argued.

The exposure is the opposite one, and v2 did not consider it: **a large pixel change in the drag
arm from a cause that is not camera motion.** `A` bounds OrbitControls' ambient azimuth; it bounds
nothing else. Concretely, in the working tree the drag arm's `pointerup` at P1 produces a `click`
on the canvas, `handleClick` (`Viewer3D.tsx:2096-2113`) ray-picks, and on a rebar hit calls
`setHoverRow(rowId)` → `applyHighlight` (`:2265`) → a **material change on a whole rebar mesh**.
That is a scene change of arbitrary pixel magnitude, occurring in the drag arm, driven by the
pointer rather than by the camera. A frozen camera with a live pick would still produce it. The
tooltip (`handlePointerMove`, `:2081-2091`) is a second such channel — it is DOM, so it misses
Channel A but lands squarely in Channel B's screenshot. React re-renders and the IndexedDB
autosave are two more.

v2 §2.1 claimed Arm C "reproduces the ray-pick highlight confound" by ending its click at P1. It
reproduces it only under the null: with a frozen camera both arms click P1 and pick the same row,
so the confound cancels. With a *partially* live camera — a pose that changed for any reason
between the two clicks — the two arms pick different rows and the confound does not cancel. The
ratio test cannot tell that apart from camera motion, because it measures pixels, not pose.

### (c) What if the control arm reads ≈ 0? **Unconditional accept. This alone disqualifies it.**

`S_control = 0` is reachable without any defect: the probe's `readRoi` runs inside *its own*
`requestAnimationFrame` callback, which is a different callback from the viewer's render loop
(`Viewer3D.tsx:2160-2165`). If the two probe reads land either side of a frame the viewer did not
render — and at the measured 3.4 fps, with a 210–300 ms readback stall inside the callback, a
missed render is ordinary — the two reads return **bit-identical buffers** and `S_control = 0`.
Then `S_drag / 0 = ∞ ≥ ρ` and the run accepts whatever the drag arm produced, including noise.

Guarding this needs a positive floor on `S_control`, i.e. exactly the underivable lower bound of
§2.3, i.e. a fitted constant. There is no sound repair.

### (d) Is the statistic monotone in camera displacement? **No, in three independent ways.**

1. **Not well-posed.** "Camera displacement" is not a scalar here: (1) is a *field* with three
   terms of different spatial shape, and the depth term's magnitude depends on the scene. Two
   different `α` with different depth distributions produce incomparable fields.
2. **Saturation.** `S` is a residual, bounded above; by construction of v2's mean-absolute-deviation
   normalisation, `sadAtK ≤ 2` for any pair of profiles. Beyond decorrelation `S` is flat in `α`.
3. **Periodicity — non-monotone in the dangerous direction.** The ROI is a rebar array
   (帯筋 pitch 100 mm, `D13`). A horizontal displacement matching the projected pitch drives the
   residual back down. So a *larger* camera move can yield a *smaller* `S`, producing a refusal
   where an accept was correct — and, symmetrically, there is no `S` value from which a lower
   bound on the move can be inferred.

### Verdict on question 3: the ratio test cannot be made sound.

(a) refutes the bound's derivation, (c) gives an unconditional false-accept path with no repair
that is not a fitted constant, and (b) identifies a false-accept channel that any pixel-only
statistic shares. (d) removes the last hope of repairing it with a monotone reparameterisation.

### 3.1 The one nonparametric variant, and why it is still not enough

For completeness, since it is the only version with any derivable error rate: v2's G5 —
`min over Arm D > max over Arm C` — is a one-sided rank test. Under an exchangeability null its
exact false-accept probability is `1/C(n_C + n_D, n_D)`: `1/56 = 1.8 %` at v2's 5 + 3 frames,
`1/1287 = 0.078 %` at 8 + 5. That is a derived number containing no fitted threshold, and it is
worth recording as an **auxiliary** observation.

It is not an oracle, for two reasons that are not fixable inside the test:

- The exchangeability null is **false** under precisely the failure mode of §3(b): the drag arm
  carries pointer-driven, non-camera pixel change that the control arm does not. The nominal
  1.8 % is then not the true false-accept rate, and the true rate is not derivable.
- Even under a true null it bounds a **statistical** claim ("these two samples differ"), never the
  **causal** claim Scenario 7 asserts ("the camera moved"). Rank ordering cannot separate camera
  motion from highlight, tooltip, re-render or autosave.

---

## 4. Budget

### 4.1 What the probe changed about the cost model

U3 refutes v2 §3.1 on attribution: per-frame `readPixels` cost is **210–300 ms** (max observed
373 ms), **insensitive to ROI size** (169×45 vs 253×78) and **insensitive to the histogram**.
Shrinking the ROI (v2 C3) and replacing the `Set`/`Map` (v2 C4) buy nothing. v2's planning figure
of 0.40 s/frame is unsupported and is withdrawn.

The in-run figure remains **0.853 s/frame** (`uc25` `BASELINE_NOT_QUIESCENT` payload,
`t = 146421.2 / 147300.5 / 148129.0`). The 0.29 → 0.85 s gap is **not explained** by ROI size or
histogram (U3), and not by CDP payload either — `captureFrames` already strips `rawPixels` before
resolving (`uc25:548`). The most likely remaining cause is that the readback stalls until the GL
pipeline drains, and Scenario 7's scene (post-focus, review marker present) is heavier than the
probe's. **That is a hypothesis, not a measurement**, so the budget below carries both columns and
plans on the pessimistic one.

Round-trip cost: v2 §3.1's ≈ 185 ms/round-trip is retained; it was derived from the failing run
and is unaffected by U1/U2/U3.

### 4.2 Scenario 7 cost, for the design recommended in §6

Per `perturbViewer` call site, with the pose channel carrying the camera assertion and the pixel
channel retained for the gates it already has (non-blank, flicker floor, Channel-B agreement):

| Phase | Round trips | Frames | @0.30 s/frame | @0.85 s/frame |
|---|---|---|---|---|
| clip block (unchanged, `uc25:663-681`) | 4 | — | 0.74 s | 0.74 s |
| preflight: install, `selectRoi`, park | 3 | — | 0.56 s | 0.56 s |
| preflight frame + screenshot `s0` | — | 1 | 0.30 + 0.50 = 0.80 s | 0.85 + 0.50 = 1.35 s |
| Arm C: pose read, move/down/up, pose read, frame-count read | 6 | 0 | 1.11 s | 1.11 s |
| Arm D: pose read, move/down/move/up, pose read, frame-count read | 7 | 0 | 1.30 s | 1.30 s |
| post-drag frames (non-blank + flicker floor + channel B) | — | 3 | 0.90 s | 2.55 s |
| screenshot `s1`, teardown, record | 1 | — | 0.69 s | 0.69 s |
| **per call site** | | | **6.10 s** | **8.30 s** |
| **both call sites** (`uc25:1109`, `:1314`) | | | **12.2 s** | **16.6 s** |

For comparison the current working tree runs 4 windows × 3 frames with up to 2 re-arms each:
`4 × (2.6 + 3×0.853) = 20.6 s` best case per site, `62.9 s` worst — so the revision is **2.5–7.5×
cheaper**, the same ratio v2 claimed, now on a defensible per-frame figure.

### 4.3 Does the script fit? **Not in 180 s. Probably in 300 s, but that is not provable yet.**

- `146.4 s` elapses between the `page.reload` at `uc25:793` and the first captured Scenario-7
  frame — measured, `performance.now()` in the failing run's payload.
- The last two runs both died with `Script timed out after 180s` on the line after
  `UC25 CLEARANCE_ORACLE`, i.e. **before Scenario 7 completed**. 180 s is definitively
  insufficient and would be even with a zero-cost camera oracle.
- At `--timeout 300`: `300 − 146 − 17 = 137 s` remain for Scenarios 8–19 and two reloads.
- **Scenarios 8–19 have never been reached in any preserved run, so their cost is unmeasured.**
  I cannot assert 300 s is sufficient. I assert only that it is necessary, that it is the
  documented precedent for this project's heavy case (`tests/e2e/README.md:105`, uc17 at
  `--timeout 300`), and that if it still times out inside Scenarios 8–19 the response is a further
  timeout raise, **never an assertion cut**.
- **If §6 Option 1a is chosen, add headroom.** Running against `next dev` serves unminified,
  on-demand-compiled chunks; the 146 s pre-Scenario-7 figure was measured against a production
  build and will grow. `--timeout 420` is the safer request; the exact number should come from one
  timing run, not from this document.

---

## 5. Minimal diff brief against the CURRENT working tree

Line numbers are the working-tree `tests/e2e/uc25-joint-review.js` (1611 lines). The brief below
is for §6 Option 1a — **the test-side diff is byte-identical for Option 1b**, which differs only
by a `src/` addition and by keeping the production build.

### 5.1 Unchanged — do not touch

| Region | Why it stays |
|---|---|
| `loadJsonObject` `:316-322` | base64 fix, load-bearing |
| `installCameraProbe` canvas resolution + failure codes `:340-397` | single-branch `aria-label` selector, no fallback; capture-phase pointer log |
| `selectRoi` `:398-455` | `elementsFromPoint` obstruction check; candidate rectangles now stay as they are — U3 says shrinking buys nothing |
| `readRoi` framebuffer save/bind/restore `:461-478` | correct and read-only wrt the renderer |
| `captureFrames` rAF chaining `:538-554` | one sample = one rendered frame |
| `teardown` `:559-568` | unchanged |
| `captureScreenshotRoi` `:574-592` | FNV-1a byte hash, IHDR assertion |
| `parkPointer` `:594-600` | unchanged |
| `perturbViewer` clip block `:663-681` | supplies `clipMoved` |
| Scenario 7 assertions `:1109-1139` | `checkId === checkId1`, findings, verdicts, remount — **verbatim** |
| Scenario 14 assertions `:1307-1355` | **verbatim** |
| 19-check contract | untouched |

### 5.2 Changed

| # | Location | Change | Size |
|---|---|---|---|
| C1 | constants `:329-338` | delete `STABLE_FRAMES`, `WINDOW_BUDGET_MS`, `MAX_REARMS`; add `AMBIENT_RAD_PER_FRAME = 2*Math.PI*0.5/3600`, `DAMPING = 0.08`, `MOVE_STEPS = 8`, `POST_DRAG_FRAMES = 3`. Keep `MOTION_MIN_DIFF_FRACTION`, both `NONBLANK_*`, `DRAG_*`, `POINTER_TOLERANCE_PX`. **No px threshold is introduced.** | ~6 lines |
| C2 | new helper `readPose()` | `window.__kijunStore.getState().viewerPose` → `{position, target}`; throw `POSE_HOOK_ABSENT` if `__kijunStore` is undefined (this is the dev-build guard, and it must be **loud**, never a fallback); throw `POSE_NOT_CAPTURED` if `viewerPose === null` | ~10 lines |
| C3 | new helper `readFrameCount()` | `window.__kijunViewerRuntime.getFrameTimestamps().length` + the last timestamp; used to bound `N`, the rendered frames spanned by an arm. Note the 300-entry ring (`Viewer3D.tsx:2163`) — if it saturates, use the timestamp span ÷ the minimum observed interval and fail closed via C7's gate | ~8 lines |
| C4 | new pure helper `azimuthOf({position, target})` | `Math.atan2(px − tx, pz − tz)`; and `deltaAngle(a, b) = Math.atan2(Math.sin(b−a), Math.cos(b−a))` for wrap-safe differencing. Pure arithmetic, unit-testable without a browser | ~6 lines |
| C5 | `readRoi` `:495-537` | diff against a double-buffered `prevPixels` instead of `baselinePixels`; return `diffFractionVsPrev`. **Frame-to-frame is strictly stricter than the stale baseline at the same `MOTION_MIN_DIFF_FRACTION`, so this is not a weakening.** Drop nothing else | ~8 lines |
| C6 | delete `setBaseline` `:556-558` | unused after C5 | −3 lines |
| C7 | `settleClick` `:602-619` → `runArm({from, to, moves, frames})` | open + choreography + the existing trusted-pointer delivery assertion + park + optional capture; Arm C passes `to === from`, Arm D passes `to === P1`. Absorbs the drag's delivery assertion at `:729-740` and adds the missing `pointerdown` check. Records `poseBefore`, `poseAfter`, `framesSpanned` | ~45 lines, net ≈ −5 |
| C8 | **delete** `runCaptureWindow` `:621-659` | the re-arm loop, `WINDOW_BUDGET_MS`, the bit-identity branch and `BASELINE_NOT_QUIESCENT` all go (v2 §1 — quiescence is unreachable). Its non-blank gate moves into `runArm` | −39 lines |
| C9 | `perturbViewer` steps 1–4 `:694-762` | replaced by: preflight → `s0` → Arm C → Arm D → `s1` → gates §5.3 | ~50 lines replacing ~69 |
| C10 | evidence record `:766-781` | emit `UC25 CAMERA_ORACLE` **on failure as well as success** (wrap in try/catch, attach the record to the thrown message); record the *parsed* IHDR; `cameraMoved` **computed**, not the literal `true` at `:776`/`:785` | ~15 lines |
| C11 | `tests/e2e/README.md` (uncommitted block) | rewrite the camera paragraph: quiescence is not asserted; the camera assertion is a pose delta in radians with a derived ambient ceiling; the pixel channels remain as non-blank/flicker/agreement gates and carry **no** camera threshold; add uc25 to the "`next dev` needed" note beside uc17 | ~10 lines |

### 5.3 The gate set

Every frame in both arms keeps the existing non-blank gate → `BLANK_FRAME`. Then:

```
G1  POSE_HOOK_ABSENT      __kijunStore / __kijunViewerRuntime missing → refuse loudly.
                          Never degrade to a pixel-only verdict.
G2  ARM_MISMATCH          Arm C and Arm D logged equal counts of trusted pointermoves with
                          (buttons & 1) — from the capture-phase log, not from the API.
G3  AMBIENT_WINDOW_TOO_LONG
                          N_D · A  <  (8δ − s₈)/2 = 0.16844 rad, i.e. N_D < 193 frames.
                          Derived; makes G5's floor positive. Fail-closed.
G4  CONTROL_MOVED         |Δθ_C| ≤ N_C · A.            DERIVED ambient ceiling.
G5  CAMERA_DID_NOT_MOVE   |Δθ_D| ≥ (8δ − s₈) − N_D·A = 0.336883 − N_D·8.72665e-4 rad.
                          DERIVED commanded floor. At a 10 s arm (N_D ≈ 35) the floor is
                          0.3063 rad and the margin over the ambient ceiling is 10.0×.
G6  POLAR_DID_NOT_MOVE    |Δφ_D| ≥ 0.101065 · (1 − N_D·A/0.336883)  — second independent
                          derived channel from DRAG_DY_CSS; ambient never writes phi
                          (OrbitControls.js:702, :944-948), so its ceiling is 0 + float drift.
G7  TARGET_MOVED          |Δtarget| = 0 in both arms — left-drag rotates, never pans.
G8  POINTER_NOT_DELIVERED unchanged, plus the drag's pointerdown.
G9  MOTION_BELOW_FLOOR    max over Arm D of diffFractionVsPrev ≥ MOTION_MIN_DIFF_FRACTION.
                          Unchanged constant, explicitly a flicker floor and NOT a margin.
G10 CHANNEL_DISAGREEMENT / SCREENSHOT_SUSPECT_BLANK   unchanged.
```

`cameraMoved = G1 ∧ … ∧ G10`, computed. Note what G4–G7 are: **four derived gates where the
working tree has none**, since `cameraMoved` is currently the literal `true` (`:776`, `:785`).

Failure codes: keep `JOINT_CANVAS_NOT_FOUND`, `CANVAS_AMBIGUOUS`, `BACKING_STORE_MISMATCH`,
`GL_CONTEXT_UNAVAILABLE`, `ROI_OBSTRUCTED`, `ROI_OUT_OF_BOUNDS`, `SCREENSHOT_BYTES_UNAVAILABLE`,
`SCREENSHOT_SCALE_MISMATCH`, `SCREENSHOT_SUSPECT_BLANK`, `BLANK_FRAME`, `POINTER_NOT_DELIVERED`,
`CONTROL_MOVED`, `MOTION_BELOW_FLOOR`, `CHANNEL_DISAGREEMENT`. Delete `BASELINE_NOT_QUIESCENT`,
`AUTOROTATE_WINDOW_EXCEEDED`, `MOTION_NOT_PERSISTENT`, `NO_MOTION_AFTER_DRAG`. Add
`POSE_HOOK_ABSENT`, `POSE_NOT_CAPTURED`, `ARM_MISMATCH`, `AMBIENT_WINDOW_TOO_LONG`,
`CAMERA_DID_NOT_MOVE`, `POLAR_DID_NOT_MOVE`, `TARGET_MOVED`.

Net ≈ **−50 / +130** lines. **No `bestShift`, no column profile, no shift constants** — §1.4
shows they would be identically zero in both arms.

### 5.4 What is explicitly not weakened

- Scenario 7 keeps `checkId === checkId1 && findings === findings1 &&
  JSON.stringify(verdicts) === JSON.stringify(verdicts1)` and the remount assertion, verbatim.
- `checks.checkStableAfterViewerPose` keeps `clipMoved && cameraMoved`; `cameraMoved` becomes
  **strictly less tautological** — today it is hard-coded `true`.
- Scenario 14 unchanged, keeps its own `cameraMoved` conjunct.
- 19-check contract untouched; downstream first-row actions see **fewer** canvas clicks than today
  (two arms, against today's baseline click + two control clicks + the drag).
- readPixels channel, canvas-identity assertion, non-blank gate, pointer-delivery log and the
  named failure codes all retained. `MOTION_MIN_DIFF_FRACTION` retained at the same value against
  a **stricter** comparand (C5).

### 5.5 Negative controls — each passes only when the oracle refuses

A scratch probe outside the repository, not one of the 19 checks, recorded in
`step8-report.json#/camera_oracle/negative_controls`.

| # | Setup | Required refusal |
|---|---|---|
| 1 | Arm D with `P1 === P0` | `CAMERA_DID_NOT_MOVE` — no-drag must not pass as motion |
| 2 | Arm D choreography skipped entirely after ≥ 8 s idle (auto-rotate provably ON) | `POINTER_NOT_DELIVERED`; with G8 stubbed, `CAMERA_DID_NOT_MOVE` — ambient must not pass |
| 3 | Arm D dispatched as untrusted `new PointerEvent(...)` | `POINTER_NOT_DELIVERED` |
| 4 | `installCameraProbe('存在しないラベル')` | `JOINT_CANVAS_NOT_FOUND` — must not fall back to `canvas` |
| 5 | decoy `<canvas>` first in document order | resolver pins the labelled node; `canvasCount: 2` recorded |
| 6 | drag performed on the decoy canvas | `POINTER_NOT_DELIVERED` |
| 7 | `readRoi` called from a plain task instead of inside the rAF callback | `BLANK_FRAME` |
| 8 | `__kijunStore` deleted from `window` before the arms | `POSE_HOOK_ABSENT` — **must not silently fall back to a pixel verdict** |
| 9 | Arm C given an injected pose delta of `200·A` rad | `CONTROL_MOVED` — the ambient meter must be load-bearing |
| 10 | `azimuthOf`/`deltaAngle` fed a known pose pair including one that wraps ±π | returns the known angle. Pure arithmetic, no browser |

"The full run went green" is **not** evidence that the oracle works. Only §5.5 and the in-run
Arm C are.

---

## 6. The honest answer, and the decision that is yours

**No test-side oracle that reads only pixels admits derived thresholds here.** §2.3 gives the
reason in one line: Lipschitz bounds the pixel response to *small* camera motion from above, and
nothing bounds the pixel response to *large* camera motion from below, because that would require
a positive lower bound on the scene's spatial gradient along the flow direction — which is not
among the named constants and cannot be imposed by any gate the test can write. §1.4 sharpens it
for this specific viewport: the commanded drag's derived image signal is a **2 px warp with a
sub-pixel mean**, only ~70× the ambient warp, with the 1 px sampling scale sitting between them.
There is no room in that for a derived floor.

I am not going to invent one. Here are the options.

### Option 1a — read the camera pose under `next dev`. **Recommended.** No `src/` change.

`viewerPose` **already exists**: `src/lib/store.ts:40, :107, :147-149`, written by
`captureViewerPose` on every OrbitControls `end` event (`Viewer3D.tsx:2043`) and on tween
completion (`:2153`). `window.__kijunStore` **already exposes** the store (`store.ts:196-199`) and
`window.__kijunViewerRuntime.getFrameTimestamps()` already counts rendered frames
(`Viewer3D.tsx:2007-2018`, `:2162`). Both are gated on `NODE_ENV !== 'production'`.

Both endpoints become derived, in radians, with no projection and no scene:

```
ambient ceiling (Arm C):   |Δθ| ≤ N·A,  A = 8.72665e-4 rad/frame      (§2.1)
commanded floor (Arm D):   |Δθ| ≥ 8δ − s₈ − N·A = 0.336883 − N·A rad  (§2.1)
margin at a 10 s arm:      10.0×;  the gate is meaningless only past N = 386 frames ≈ 110 s,
                           and G3 refuses long before that
```

Ambient touches `theta` only, so `phi` and the target give two more derived invariants (G6, G7).
Cost: **zero readPixels frames for the camera assertion** — four CDP round trips per arm.

The price, stated plainly: **uc25 would then run against `next dev` rather than the production
build.** Its other 18 checks stop covering the minified, `NODE_ENV=production` artifact. Against
that: the repo already accepts this trade for exactly one scenario — `tests/e2e/README.md`
"uc17만 `next dev`가 필요하다", at `--timeout 300` — the viewer's production path stays covered by
uc1/uc9/uc10 on `next start`, and the pre-Scenario-7 cost will grow on dev (§4.3, budget
`--timeout 420`). The build-ordering hazard in `CLAUDE.md` applies: `rm -rf .next && npm run build`
before returning the tree to the production scenarios.

**This is a runbook/invocation decision of the same class as the `--timeout` change v2 already put
to you — not a repository-file decision and not a product change.** It is yours to make.

### Option 1b — expose camera pose in production (v2's U8). Keeps uc25 on the production build.

Add `getCameraPose: () => ({position, target})` to the `__kijunViewerRuntime` hook and install
that one accessor unconditionally, or write a `data-camera-azimuth` attribute on the canvas.
Test-side diff is **identical to §5** — only G1's guard changes.

One correction to v2's framing of this option: the existing `NODE_ENV` guard is justified in the
source as "도면 데이터가 든 전체 상태라 프로덕션에 내놓지 않는다" (`store.ts:195-196`) — that reasoning
is about **drawing data**, and applies to `__kijunStore`, not to six floats describing where the
camera is. A pose-only production accessor carries no drawing data and does not touch ADR-005's
no-server-transmission rule. It is still a `src/` edit, still outside the constraints you set for
this document, and still your call.

Cost if you pick it: ~6 lines in `Viewer3D.tsx`, no dev-server move, no timeout growth beyond
§4.3's 300 s, and uc25 keeps its production-build coverage. This is the better option on every
axis **except** that it is a product change.

### Option 2 — keep a pixel oracle with a threshold chosen from the probe's gap.

`sadAt0` separated the arms in this sample (ambient max 0.0198, drag min 0.0340). Picking 0.025
would work today. **I refuse to design this.** It is the exact SPEC_DEFECT that started Step8, it
is forbidden by v2 §6 and by the anti-fitting rule, and §3(b)/(c) show it is not merely
unprincipled but reachably wrong: a stalled render gives `S = 0` and an unconditional accept, and
a pointer-driven highlight change gives a large `S` with a frozen camera.

### Option 3 — change what Scenario 7 asserts.

Downgrade `cameraMoved` to `cameraInteractionDelivered` (trusted pointer log + non-blank +
flicker floor — all already in the working tree, all derived or explicitly labelled as floors) and
drop the claim that the camera pose changed. Honest, cheap, needs no hook and no dev server.

But it **weakens an existing Scenario 7 assertion**, which your constraints forbid. I list it only
so the option set is complete; taking it requires you to relax that constraint explicitly.

### Option 4 — accept §3.1's rank ordering as the camera evidence.

Derived false-accept rate `1/C(n_C+n_D, n_D)`, no fitted constant. Rejected as an oracle in §3.1:
its null is false under the confound of §3(b), and it bounds a statistical claim rather than the
causal one Scenario 7 makes. Suitable as a recorded auxiliary observation, not as `cameraMoved`.

### My recommendation

**1a if you will move uc25 to `next dev`; 1b if you will not.** Both give four derived camera
gates where the working tree has a hard-coded `true`, both cost less wall-clock than the current
implementation, and neither requires a single number chosen from an observed run. If you want
neither, the truthful position is Option 3 with your constraint explicitly relaxed — and I would
rather hand you that than a threshold in a gap.

---

## 7. What I am not sure about

| # | Uncertainty | Consequence if wrong | What settles it |
|---|---|---|---|
| V1 | **`φ` at Scenario 7.** §1.4 uses `cos φ = 0.2901` from `CAMERA_DIRECTION`, but Scenario 6's focus tween may leave a different polar angle. | The roll/quadratic split shifts; the *conclusion* does not — both terms stay sub-pixel for any `φ`, since `cos φ ≤ 1` and the quadratic term is `φ`-independent up to `sin φ ≤ 1`. | Nothing needed for the conclusion. Under Option 1a it becomes directly observable. |
| V2 | **`viewerPose` is written on `end` for a zero-displacement press.** `_onPointerUp` dispatches `_endEvent` whenever the pointer count reaches 0 (`OrbitControls.js:1612`), and `_startEvent` fires on pointerdown when `state !== NONE` (`:1729`); a left press sets `state = ROTATE` regardless of movement. I read this as unconditional, but I have not executed it. | Arm C would produce no pose sample and the run refuses at `POSE_NOT_CAPTURED` — safe, but unrunnable. | One `evaluate` that presses and reads `viewerPose`; ~5 s. **Run before implementing.** |
| V3 | **The 300-entry `frameTimestamps` ring** (`Viewer3D.tsx:2163`) saturates at ~86 s of arm time, after which `N` is undercounted — which makes G4's ceiling *too tight* (fail-closed) and G5's floor *too loose* (fail-open). | A silently weakened G5 in very long arms. | Mitigated in design: G3 refuses at `N ≥ 193`, well below 300. Assert `length < 300` and name it. |
| V4 | ~~**Scenario 14's canvas** (`expectedCanvasLabel: null`, `uc25:1314`). `viewerPose` is store-global; if two Viewer3D instances could be mounted at once, the pose delta would not be attributable.~~ **Resolved while writing this document**: `Viewer3D` is rendered exactly once, as the `viewer` slot of `AppShell` (`src/app/page.tsx:26-27`, `:48`), and that is its only render site in `src/`. One instance, one `controls`, one writer of `viewerPose`. Both call sites read the same pose unambiguously. | — | — |
| V5 | **The 0.29 → 0.85 s/frame gap** (§4.1) is unexplained. My scene-weight hypothesis is untested. | Budget only, never correctness — no gate in §5.3 reads wall-clock. | A probe that captures frames at the Scenario 7 camera state rather than at landing. Out of scope. |
| V6 | **Scenarios 8–19 have never been reached**, so `--timeout 300`/`420` is necessary but not provably sufficient (§4.3). | Another timeout raise. | One instrumented run once the oracle runs at all. |
| V7 | **`dpr` is 1 here.** Irrelevant to Option 1a/1b — the pose channel is in radians and has no pixel units anywhere. | None. | Superseded; v2's U4 no longer applies to the camera assertion. |

**V2 is the only gating uncertainty left, and it costs ~5 s.** V4 is closed (single mount site). V1, V3 and V7 are closed by the design. V5 and V6 are budget, not correctness.

---

## 8. Boundary

Design only. Not Step8 acceptance. Not a product-defect finding — continuous motion after 8 s idle
is the documented auto-rotate behaviour and damping is a deliberate feature. Not approval of any
implementation: per `CLAUDE.md` 개발 프로세스 ②, this document must be independently falsified by an
agent that did not write it and will not implement it, and the implementer must not be its
reviewer. **§6 ends in a decision for the user; nothing in §5 should be built before that decision
is made.**
