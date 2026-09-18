# U1/U2 gating probe result — the estimator must change, not the thresholds

Source: `.git/phase48-run/probe8q-1789744190598751067/probe8-shift.log`
(read-only probe, production build, headless dev-browser, ROI 169x45 device px, dpr 1).
Nothing was asserted about the product; no product state was changed.

## Estimator self-check — PASSES (negative control 10 of design v2 §5.2)

| Input | Result |
|---|---|
| identical profiles | `k = 0`, `sadAtK = 0` |
| profile translated by 11 | `k = 11`, `sadAtK = 7.9e-16`, `sadAt0 = 1.467` |
| flat profile | `degenerate = true` |

The `bestShift` implementation is correct arithmetic. It recovers a known translation exactly.

## U1 — ambient arm: **CONFIRMED**

Auto-rotate ON, 12 consecutive frames, and after a click, 12 consecutive frames:
**every inter-frame `bestShift.k = 0`.** Design v2 §2.6 sets `SHIFT_MAX_CONTROL_PX = 2`;
the measured ambient shift is 0, comfortably inside it. The derived 0.368 px per-frame
ambient ceiling is consistent with the measurement.

## U2 — commanded-drag arm: **REFUTED**

Design v2 §2.4 derives an inter-frame shift of **17.3–20.4 px** after pointer-up.
Measured, for both commanded inputs:

| Arm | inter-frame `k` |
|---|---|
| drag `dx = -40, dy = -12` | 0, 0, 0, 0, 0 |
| drag `dx = -24, dy = -8` | 0, 0, 0, 0, 0 |

**The camera plainly moved** — the ROI hash changes every frame and `distinct` swings
305→347 (ambient holds 426–445) — but the column profile does **not translate**.

Why, stated as a hypothesis to be checked rather than a conclusion: an OrbitControls azimuth
change is a *rotation about the target*, which in a perspective projection deforms the image
(parallax, new geometry entering frame, foreshortening) rather than sliding it. A
column-profile translation model is therefore the wrong model for this interaction. The
17.3–20.4 px figure was derived as if the image translated; the derivation's arithmetic is
fine, its premise is not.

## The statistic that *did* separate the arms — and why it must not simply be adopted

`sadAtK` (normalised SAD at the best shift, i.e. residual profile dissimilarity):

| Arm | frames | min | max |
|---|---|---|---|
| ambient, auto-rotate ON | 11 pairs | 0.0128 | **0.0198** |
| drag `dx = -40` | 5 pairs | **0.0340** | 0.0787 |
| drag `dx = -24` | 5 pairs | **0.0418** | 0.0818 |

Ambient max 0.0198 < drag min 0.0340; the arms do not overlap in this sample.

**This is an observed separation, not a derived one.** Choosing a threshold in the gap
(e.g. 0.025) would be fitting an expected value to observed output — precisely the failure the
anti-fitting rule forbids, and the same mistake that produced the original Step8 SPEC_DEFECT.
Design v2 §6 states the correct response itself: *"If U1 or U2 comes back wrong, the response
is to adjust the commanded input or the estimator, never the derived thresholds."*

## What the next design revision must answer

1. Is there a statistic whose ambient ceiling can be **derived** from `AUTO_ROTATE_SPEED`,
   `CONTROLS_DAMPING`, `CAMERA_FOV_DEGREES` and the canvas rect — under a *rotation* model, not
   a translation model — and whose commanded value is derived from `DRAG_DX_CSS`? Candidates
   worth deriving rather than guessing: per-frame angular displacement expressed as a bound on
   maximum per-pixel change; a two-sided comparison where the drag arm must exceed the control
   arm by a factor that follows from the ratio of applied angles (≈60–70x, §2.3/§2.4), which is
   a *ratio between two measured arms in the same run*, not a fitted constant.
2. If the honest answer is that no statistic admits a derived threshold, say so, and name the
   remaining options — including the product-side option (exposing camera pose for test
   observation) that design v2 §6 U8 already flagged as the user's decision.

## Cost measurements (U3)

Per-frame `readPixels` + profile cost is ~210–300 ms and is **insensitive** to ROI size
(169x45 vs 253x78) and to the colour histogram: big+histogram 207–289 ms, small without
histogram 211–288 ms. The cost is the GPU readback stall, not the JS. Shrinking the ROI will
not buy frame-rate headroom.

## Boundary

Measurement only. Not Step8 acceptance, not a product-defect finding, and not approval of any
oracle. U1 confirmed, U2 refuted, estimator self-check passed.
