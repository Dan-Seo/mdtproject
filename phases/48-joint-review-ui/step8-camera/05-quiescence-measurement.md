# Step8 quiescence measurement — observed, not inferred

Source: `.git/phase48-run/probe8q-1789743263477586628/` (read-only probe, production build
`npm run build` exit 0, headless dev-browser, Jetson host). The probe asserts nothing about the
product; it measures frame behaviour of the joint canvas. Product code was not modified.

## What was measured

| Phase | Result |
|---|---|
| ROI | `{x:338,y:90,w:169,h:45}`, canvas 843.8x223.8 CSS px, dpr 1 |
| Idle settle (4 equal consecutive frames, budget 240 frames) | **NOT settled** after 240 frames |
| Idle frame hashes | 8 consecutive frames, 8 distinct hashes |
| Frame intervals | 296, 295, 227, 290, 379, 221, 295 ms |
| Click settle (budget 240 frames) | **NOT settled** after 240 frames |
| Non-blank | `zeroAlphaFraction: 0`, `distinct` 765-788 on every frame — the readback channel is alive and reading real pixels |

The probe then hit the 180 s script timeout; the drag and post-8 s phases did not report.

## What this establishes

1. **The in-frame `readPixels` channel works.** Every frame is non-blank with ~770 distinct
   colours. The original `toDataURL` defect is genuinely fixed — this is the first time the test
   harness has observed real pixel content from this canvas.

2. **The rendering rate here is ~3.4 fps, not 60 fps** (mean interval ~286 ms). Every
   frame-counted budget in the design was sized for a normal frame rate.

3. **The joint canvas does not reach bit-identical quiescence** in this environment, neither when
   untouched nor after a settling click, within 240 frames (~70 s).

## Why (read from source, consistent with the measurement)

- `src/components/viewer/Viewer3D.tsx:2157-2159` enables `controls.autoRotate` whenever
  `performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS` (`:105` = 8000 ms) and no
  camera tween is running. The probe's idle phase ran ~100 s after the last interaction, so
  auto-rotate was continuously ON — the scene is *supposed* to be moving there.
- `runtime.lastInteractionAt` is refreshed at `:2042` on the controls `start` event, so a click
  does suppress new auto-rotation for 8 s.
- But `controls.enableDamping = true` (`:1970`) with `dampingFactor = CONTROLS_DAMPING` (`:1971`)
  decays the accumulated `sphericalDelta` by a constant factor **per `update()` call**, i.e. per
  rendered frame — not per unit of wall-clock time. OrbitControls stops changing the camera only
  once the residual falls under its `EPS`.
- Consequence: after auto-rotate has been running, the residual needs on the order of 10^2 frames
  to decay below EPS. At ~3.4 fps that is tens of seconds, far outside the 3-frame /
  6000 ms window the implementation used.

## Consequence for the oracle design

A **quiescence-based** oracle ("prove the canvas is still, then drag, then prove it changed") is
not reachable in this environment at an acceptable cost. `BASELINE_NOT_QUIESCENT` in the
`gates2` run (frames showed `diffFractionVsBaseline` 0.527 / 0.556 / 0.545) was therefore a
correct refusal by a correct instrument — the premise it was asked to establish does not hold
here.

This does **not** demonstrate a product defect: continuous motion after 8 s idle is the
documented auto-rotate behaviour, and damping is a deliberate feature.

What is still open, and must be settled by an independently reviewed design revision rather than
assumed: an oracle that distinguishes **commanded** camera motion from **ambient** motion without
requiring stillness. The obvious candidate is a *differential* comparison — the same frame budget,
same park conditions, with and without the commanded drag, requiring the drag arm to exceed the
no-drag control by a margin — but that is a design change and has not been validated. It must not
be implemented before independent falsification.

## Boundary

Measurement only. Not Step8 acceptance, not a product-defect finding, and not approval of any
replacement oracle.
