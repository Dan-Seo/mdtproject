# Step8 — Scenario 7 camera evidence oracle: DESIGN

Status: **design only**. No repository file was edited, no test/build/browser was run to
produce this document. Everything below is either (a) read from source at HEAD `3e632fb`,
(b) read from a preserved artifact of an earlier run, or (c) explicitly labelled as a
hypothesis that the design must make *fail loudly* rather than assume.

Author: design/architecture owner (Claude). Per `CLAUDE.md` 개발 프로세스 ②, this document is
Claude-authored and therefore must be **independently falsified by a different agent before
it is implemented**; the implementer must not be its reviewer.

Scope of the repair: `tests/e2e/uc25-joint-review.js` and `tests/e2e/README.md` only.
**`phases/48-joint-review-ui/step8.md` needs no amendment** — its Scenario 7 text
(「断面カット 이동＋카메라 드래그 후 「検査を実行」 → `checkId === checkId1` …」) prescribes the
*interaction* and the *invariance*, never the capture mechanism. The defect is entirely in
the test's instrument.

---

## 0. One-paragraph conclusion

The Scenario 7 failure is a **test-side evidence-channel defect**, not a demonstrated
product defect. The channel (`canvas.toDataURL()` called from an ordinary evaluate task on a
renderer created with `preserveDrawingBuffer` defaulted to `false`) cannot observe the
rendered frame at all, and the "two equal frames" gate that was supposed to exclude ambient
animation is vacuous precisely when the channel is dead. The replacement keeps both Scenario
7 assertions exactly as they are and rebuilds only the instrument: a per-rendered-frame ROI
capture with a mandatory non-blank gate on **every** frame, an asserted joint-canvas
identity with no fallback, two matched **no-drag controls at both commanded endpoints**, a
trusted-pointer delivery log, and a second independent capture channel (compositor
screenshot) that must agree. Ambient motion is not assumed away: it is arranged so that it
can only *fail* the run, never pass it.

---

## 1. Root-cause analysis (with citations)

### 1.1 Drawing-buffer preservation — the readback is out of frame

- `src/components/viewer/Viewer3D.tsx:1949` —
  `const renderer = new THREE.WebGLRenderer({ antialias: true })`. No
  `preserveDrawingBuffer` key, so the WebGL context attribute defaults to `false`.
- Observed, run `.git/phase48-run/browser-step8-1789665896533303664/probe8-camera.log`
  (`CAMERA_PROBE`): the single canvas reports
  `attributes.preserveDrawingBuffer: false`, `alpha: true`, `premultipliedAlpha: true`.
- `tests/e2e/uc25-joint-review.js:327-346` (`readCanvasFrame`) calls
  `canvas.toDataURL("image/png")` from a plain `page.evaluate` task — i.e. outside the
  frame's rendering phase, after the compositor has consumed (and, with
  `preserveDrawingBuffer:false`, is free to discard) the drawing buffer.
- Observed consequence, same log: `cameraFrameBefore` and `cameraFrameAfter` are
  byte-identical — `{width:843,height:223,dataLength:6230,hash:1242121689}` — while the
  compositor screenshots of the same moments differ.
- `dataLength 6230` for 843×223 px is *consistent with* a uniform (cleared) image, but the
  preserved pack contains **no proof** that the readback was blank, and this design does not
  claim it was. It only requires that the replacement channel prove non-blankness on every
  frame it accepts (§4.5).

**Root cause 1: the evidence channel reads a buffer that is not guaranteed to hold the
rendered frame, and nothing in the test asserted that what it read was a picture of
anything.**

### 1.2 The animation / auto-rotate / damping loop

Installed three.js is `0.185.1` (`package.json:31`, `node_modules/three/package.json`).

- `Viewer3D.tsx:2133-2166` — `renderFrame` runs on `window.requestAnimationFrame`, calls
  `controls.update()` (`:2160`) and `renderer.render(scene, camera)` (`:2161`) **every
  frame unconditionally**, then re-registers itself (`:2164`).
- `Viewer3D.tsx:1970-1972` — `controls.enableDamping = true`,
  `controls.dampingFactor = CONTROLS_DAMPING` (`= 0.08`, `:92`),
  `controls.autoRotateSpeed = AUTO_ROTATE_SPEED` (`= 0.5`, `:106`).
- `Viewer3D.tsx:2157-2159` — `controls.autoRotate` is set true iff there is no camera tween
  **and** `performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS` (`= 8000`,
  `:105`).
- `Viewer3D.tsx:2039-2043` — the OrbitControls `'start'` listener sets
  `runtime.cameraTween = null` and `runtime.lastInteractionAt = performance.now()`.
  `node_modules/three/examples/jsm/controls/OrbitControls.js:1729` (and `:1773`, `:1867`)
  dispatch `'start'` on pointer-down; `:1612` dispatches `'end'` on pointer-up. So **any**
  pointer-down on the canvas — including one with zero movement — resets the auto-rotate
  clock and kills a running tween. Ambient auto-rotation is therefore *controllable from the
  test through public trusted input only*.
- `OrbitControls.js:700-702` + `:923-931` — auto-rotation is applied only when
  `state === NONE`, and because `Viewer3D` calls `controls.update()` with **no** argument
  (`:2160`), `_getAutoRotationAngle(null)` returns `_twoPI / 60 / 60 * autoRotateSpeed`
  **per update call**, i.e. auto-rotate advances *per rendered frame*, not per wall-clock
  second.
- `OrbitControls.js:708-709` and `:792-795` — with damping, each `update()` applies
  `_sphericalDelta * dampingFactor` and then decays `_sphericalDelta *= (1 - dampingFactor)`.
  With `dampingFactor = 0.08` the residual after a drag decays as `0.92^n` **per frame**, and
  is never explicitly zeroed while damping is on. Post-drag drift is therefore frame-counted
  too.
- `Viewer3D.tsx:883-905` + `:2215-2240` — selecting a finding row (Scenario 6) starts a
  camera tween of `TRANSITION_DURATION_MS = 550` (`:102`; `FLY_IN_DURATION_MS = 900`, `:101`).
  That tween is still a candidate ambient motion at the moment Scenario 7 begins, and is
  killed by the first pointer-down (`:2041`).
- `tests/e2e/README.md` (uc17 note) records that **headless pages throttle
  `requestAnimationFrame` to roughly 1 Hz**. Combined with the two frame-counted mechanisms
  above, this is decisive: *a wall-clock-polled stability gate can sample the same rendered
  frame repeatedly and call it "stable"*, and a post-drag camera can still be drifting when
  the 8 s auto-rotate delay expires.

**Root cause 2: `waitForStableCanvasFrame` (`uc25-joint-review.js:348-375`) polls every
120 ms for at most 3000 ms and accepts "two equal samples". Under a dead readback it is
vacuous; under a live readback with ~1 Hz rAF it is still vacuous, because two samples
120 ms apart can be the same frame. The gate that was supposed to exclude damping and
auto-rotate excludes nothing.**

### 1.3 Canvas identity

- `Viewer3D.tsx:2274-2287` — a `useEffect` sets the canvas `aria-label` to
  `viewer.canvasJoint` when `viewerMode === 'joint'`. `src/locales/ja.json`:
  `viewer.canvasJoint = '接合部の配筋3D'`, `viewer.canvas = '選択部材の配筋3D'`,
  `viewer.canvasBuilding = '建物全体の3D'`.
- `uc25-joint-review.js:329` — the selector is
  `"canvas[aria-label='接合部の配筋3D'], canvas"`. A CSS selector list matches the **first
  element in document order matching any branch**, so the second branch silently absorbs any
  case where the labelled canvas is absent or not first. Nothing asserts which canvas was
  hashed.
- Observed in the failing run: there was in fact exactly **one** canvas, with the correct
  label `接合部の配筋3D`, rect `x 436.19, y 126.5, w 843.81, h 223.80`, viewport 1280×720.
  So identity was *accidentally* correct in that run — but it is not *asserted*, which is
  why the failure could not be attributed.

**Root cause 3: identity is a silent fallback, so the pass/fail of the camera assertion is
not attributable to the joint viewer.**

### 1.4 Pointer hit-target

- `uc25-joint-review.js:400-405` (`perturbViewer`) takes the drag box from
  `document.querySelector("canvas")` — again "first canvas in document order", independent of
  the (already loose) hashing selector. The two could diverge without any assertion firing.
- Observed in the failing run: `hitAtDrag: "CANVAS"` at the drag point — i.e. `elementFromPoint`
  at the commanded coordinates returned a canvas element. That is the *tag name only*; it is
  not asserted to be the same node that was hashed, and nothing asserts that the dispatched
  pointer events were actually delivered to it, were trusted, or carried the commanded
  endpoints.
- Two further hit-target facts that the current script never accounts for, both read from
  source:
  - `Viewer3D.tsx:2097-2118` — the canvas `click` handler ray-picks; a hit whose
    `userData.rowId` is a string calls `setHoverRowRef.current(rowId)`, which drives
    `applyHighlight` (`:2256-2260`) and therefore **changes rendered pixels**. A browser
    fires `click` on pointer-up even when the pointer moved, so *the drag's own click can
    change the picture for a reason that is not the camera*.
  - `Viewer3D.module.css:13-21, 49-57, 104-112, 194-214` — the canvas is `position:absolute;
    inset:0` inside `.viewer`, and `.meta`, `.clipControls` (top-right, `z-index:2`),
    `.legend` (bottom-left, `z-index:2`) and `.tooltip` (`z-index:3`, pointer-positioned)
    are DOM overlays **on top of the canvas rect**. Any screenshot-based ROI that is not
    proven overlay-free is measuring DOM, not the camera. (No CSS `transition`/`animation`
    exists in that module — grepped, zero matches — so overlays are static unless
    hover/focus/state changes them.)

**Root cause 4: neither the hashed element, the dragged element, the delivery of the input,
nor the "is this region actually the 3D picture" question was asserted.**

### 1.5 What is *not* established

The preserved diagnostic (`.git/phase48-run/step8-camera-diagnostic/step8-camera-pixel-analysis.json`)
shows compositor screenshots changing between `before` and a **no-drag `control`** taken
~200 ms later (canvas ROI 78,076 changed px; geometry ROI 39,854 of ~56,000 px). The cause
of that drift is **not established by any artifact in the pack**. Candidates that I could
*not* rule out by reading source: a camera tween or damping residual still in flight at that
instant; auto-rotate (only if >8 s had elapsed since the last pointer-down — not
demonstrated); or DOM overlays inside that ROI (`.legend` is bottom-left and the ROI
`[450,200,850,340]` maps to canvas-local `x∈[14,414], y∈[74,214]`, which plausibly
intersects it). I could rule out one thing: the review-focus marker is a static
`THREE.Group` with no per-frame animation (`Viewer3D.tsx:775-858`, `:2215-2221`).

The design below therefore **does not depend on knowing the cause**. It is built so that any
such drift produces a named failure with per-frame evidence rather than either a false pass
or an unattributable red.

---

## 2. Design goals and the one rule that orders them

1. The oracle may **only** fail when the camera did not demonstrably move; it must never
   pass because the instrument is broken, blank, aimed at the wrong element, or measuring
   ambient animation.
2. Every rejection must carry a **named code** and per-frame numbers, so the next person
   diagnoses rather than guesses.
3. Threshold selection may depend on *layout* and on the *physics of a cleared buffer*. It
   may **never** depend on the captured pixel values of the run being judged. (Anti-fitting
   rule; see §4.2 and §9.)

---

## 3. Why the obvious fix is rejected

Setting `preserveDrawingBuffer: true` at `Viewer3D.tsx:1949` would make the existing
`toDataURL` channel work. **Do not do it.**

- It is a `src/` product change, forbidden for Step8 by `step8.md` 금지사항 and by the
  desktop handoff ("No product core changes in Step8").
- It changes the product for every real user (an extra full-size buffer copy per frame and
  loss of some compositor fast paths) to satisfy a test. That is fitting the product to the
  oracle, which is the mirror image of fitting expected values to output.
- If anyone wants it anyway, it is a **product decision for the user** (ADR-level), not
  something to slip into an e2e repair.

---

## 4. The capture / oracle design

### 4.0 Shape

One test-owned in-page helper, installed and torn down by `perturbViewer`, plus the script's
Playwright side. Two independent capture channels that must agree:

| | Channel **A** (decision oracle) | Channel **B** (corroboration) |
|---|---|---|
| Source | `gl.readPixels` on the pinned canvas, executed **inside a `requestAnimationFrame` callback** | `page.screenshot({ clip, scale:'css', type:'png' })` — compositor, outside the page |
| Granularity | one sample = one rendered frame | one sample = one composited frame, separated by an asserted frame-tick advance |
| Sees DOM overlays | no (canvas drawing buffer only) | yes → ROI must be proven overlay-free |
| Provides | exact RGBA hash, non-blank statistics, diff fraction vs baseline | exact PNG byte hash + IHDR dimension binding |

Channel A is the decision oracle because it is immune to the overlay confound that Channel B
inherits, and because it is per-rendered-frame by construction. Channel B exists because a
single channel already fooled this project once; it is the user-facing composited path, and
its agreement is asserted.

### 4.1 Joint-canvas identity — asserted, no fallback

`resolveViewerCanvas(expectedLabel)` in-page:

1. `const all = [...document.querySelectorAll('canvas')]`. Record `all.length` and every
   `aria-label`.
2. If `expectedLabel !== null`: `const el = document.querySelector('canvas[aria-label="'+expectedLabel+'"]')`.
   **A single-branch selector. No `, canvas` fallback anywhere in the file.**
   `el === null` → throw `UC25 CAMERA JOINT_CANVAS_NOT_FOUND {labels:[…], count:n}`.
3. If `expectedLabel === null` (Scenario 14 — see §6.3): require `all.length === 1` and a
   non-empty `aria-label`; otherwise `CANVAS_AMBIGUOUS`. Record the observed label.
4. Pin the node: `window.__uc25Cam.canvas = el`. **Every** later operation — ROI hit-test,
   readPixels, screenshot clip, pointer-log target comparison — uses this exact node
   identity (`===`), never a re-query.
5. `const gl = el.getContext('webgl2') || el.getContext('webgl')`; `gl === null` →
   `GL_CONTEXT_UNAVAILABLE`. Record `gl.getContextAttributes()` and
   `{width: el.width, height: el.height, rect: el.getBoundingClientRect(), dpr: devicePixelRatio}`.
   Assert `el.width === Math.round(rect.width * Math.min(devicePixelRatio, 2))` (±1) —
   the backing-store rule set at `Viewer3D.tsx:1953`; mismatch → `BACKING_STORE_MISMATCH`.
   This is the concrete binding between CSS coordinates (where the pointer acts and where
   Channel B clips) and device pixels (where Channel A reads).

### 4.2 Fixed-geometry ROI, bound to canvas bounds and screenshot scale

One ROI, used by both channels.

Candidate rectangles are expressed as fractions of the **pinned canvas rect**, in a fixed
priority order, chosen so that the first candidates avoid the known overlay corners
(`.meta` top, `.clipControls` top-right, `.legend` bottom-left):

```
C1  x 0.30..0.70, y 0.45..0.85      (centre-low band)
C2  x 0.35..0.65, y 0.25..0.60      (centre band)
C3  x 0.45..0.75, y 0.55..0.90      (right-low band)
```

Selection procedure (`selectRoi`):

1. For each candidate in order, build the CSS rect from the pinned canvas rect and round to
   integers.
2. **Obstruction grid check**: sample a 5×5 grid plus the 4 corners, inset 1 px. Every
   sampled point must satisfy `document.elementFromPoint(x, y) === window.__uc25Cam.canvas`.
   (Park the pointer outside the canvas first so no tooltip exists — see §4.7.)
3. First candidate that passes is the ROI. Record which candidate index was used and the
   full grid result.
4. No candidate passes → throw `ROI_OBSTRUCTED` with, for each failing point, the obstructing
   element's `tagName`/`className`/`aria-label`. **Do not invent a fourth candidate at run
   time to get green.**

The selection consults **layout only** (`elementFromPoint`), never a captured pixel. That is
the anti-fitting boundary: the ROI cannot be moved in response to what the picture shows.

Derived forms:

- Channel A, device pixels:
  `sx = round((roi.x - rect.x) * canvas.width / rect.width)`, likewise `sw`;
  `sy_top = round((roi.y - rect.y) * canvas.height / rect.height)`, likewise `sh`;
  `readPixels` origin is bottom-left → `sy = canvas.height - sy_top - sh`.
  Assert `sx >= 0 && sy >= 0 && sx+sw <= canvas.width && sy+sh <= canvas.height`, else
  `ROI_OUT_OF_BOUNDS`.
- Channel B, CSS pixels: `clip = {x: roi.x, y: roi.y, width: roi.w, height: roi.h}` with
  `scale: 'css'` so that **1 CSS px = 1 image px regardless of DPR**. Parse the returned
  PNG's IHDR (big-endian `u32` at byte offsets 16 and 20) and assert it equals
  `round(roi.w) × round(roi.h)` (±1), else `SCREENSHOT_SCALE_MISMATCH`. This is the explicit
  binding of ROI to screenshot scale demanded by the brief; it is verified from the returned
  bytes, not assumed from the option.

### 4.3 Channel A capture primitive — one sample = one rendered frame

In-page, installed by the test (no product code touched):

```
captureFrames(n) -> Promise<Frame[]>            // Frame per §4.5
  step():
    requestAnimationFrame(() => {
      readRoi();                                 // see below
      if (frames.length < n) step(); else resolve(frames);
    })
```

Ordering argument (the one assumption in the design, and it is *gated*, not trusted):
`Viewer3D`'s loop re-registers itself at the end of its own callback
(`Viewer3D.tsx:2164`), so by the time any test code runs in a task, the viewer's callback for
the next frame is already queued ahead of ours; a callback we register from a task, or from
inside our own rAF callback, therefore runs **after** `renderer.render()` of that same frame
(`:2161`) and before the frame is composited. If that ordering is ever wrong, the read
returns a cleared buffer and the **non-blank gate of §4.5 rejects it** with `BLANK_FRAME`.
The assumption can only produce a loud failure, never a pass. I have not observed this
ordering in this app; the preflight (§4.7 step 0) is what establishes it.

`readRoi()` detail:

- save `gl.getParameter(gl.FRAMEBUFFER_BINDING)` and, on WebGL2, `READ_FRAMEBUFFER_BINDING`
  and `PIXEL_PACK_BUFFER_BINDING`; bind `null`; `gl.readPixels(sx, sy, sw, sh, gl.RGBA,
  gl.UNSIGNED_BYTE, buf)`; restore every saved binding. Read-only with respect to the
  product's renderer state.
- record `t = performance.now()`, `tick` (our own monotone frame counter, incremented in the
  same callback), and `msSinceLastPointerDown` from the pointer log (§4.4). The latter is the
  test-side twin of `runtime.lastInteractionAt` (`Viewer3D.tsx:2042`, set from the
  OrbitControls `'start'` dispatch at `OrbitControls.js:1729`) and is what makes the 8 s
  auto-rotate budget checkable (§4.6).

`n` consecutive rAF callbacks are `n` consecutive rendered frames **whatever the rAF rate is**.
This is what makes the design immune to the ~1 Hz headless throttling recorded in
`tests/e2e/README.md`; the throttling only changes how long a window takes, and that is
budget-checked, not silently absorbed.

### 4.4 Trusted pointer input, asserted hit target, commanded endpoints

At install time, attach **capture-phase, passive** listeners for `pointerdown`,
`pointermove`, `pointerup` on the pinned canvas, appending to a bounded log
(`{type, isTrusted, clientX, clientY, buttons, targetIsPinned: e.target === canvas, t}`).
They never call `preventDefault`/`stopPropagation`, so the viewer's own handlers and
OrbitControls are unaffected.

Input is driven only through the public Playwright mouse API (CDP-dispatched, hence
`isTrusted === true`): `page.mouse.move(x, y, {steps: 8})`, `.down()`, `.up()`.

After each interaction the script asserts, from the log:

- the `pointerdown` exists, `isTrusted === true`, `targetIsPinned === true`, and
  `|clientX − P0.x| <= 1 && |clientY − P0.y| <= 1`;
- for a drag: at least 4 `pointermove` entries with `buttons & 1`, whose last entry is within
  1 px of `P1`;
- exactly one `pointerup`, `isTrusted`, `targetIsPinned`, within 1 px of the commanded end
  point.

Any violation → `POINTER_NOT_DELIVERED` with the log. This permanently retires the
"maybe the drag never reached the viewer" hypothesis in either direction: if the input is not
delivered, the run says so by name instead of reporting "camera did not move".

Endpoints (commanded, not discovered):

- `P0 = rect.x + rect.w * 0.88`, `rect.y + rect.h * 0.88`
- `P1 = rect.x + rect.w * 0.88 − 40 CSS px`, `rect.y + rect.h * 0.88 − 12 CSS px`

Both are asserted inside the canvas rect and `elementFromPoint === pinned canvas`. The
40/12 px displacement is a *commanded input magnitude*, not an expected output: by
`OrbitControls.js` `_rotateLeft/_rotateUp` (azimuth `2π·dx/clientHeight`) a 40 px horizontal
drag on a 223 px-tall element is on the order of a radian of azimuth — chosen to be
unambiguous, and independent of what the picture then shows.

### 4.5 Non-blank gate — on EVERY captured frame, not a selected triple

Each Channel-A `Frame` carries:

```
{ tick, t, msSinceLastPointerDown,
  hash,                 // FNV-1a over the raw RGBA bytes of the ROI
  distinctColors,       // Set of packed RGBA, counted up to a cap of 4096
  modalFraction,        // share of the single most frequent packed colour
  zeroAlphaFraction,    // share of pixels with A === 0
  diffFractionVsBaseline // share of pixels differing from the stored baseline frame
}
```

A frame is **accepted** only if all three hold:

- `zeroAlphaFraction === 0`
- `distinctColors >= 32`
- `modalFraction <= 0.98`

Any captured frame in any window failing any of these → `BLANK_FRAME` with the frame record.
There is no "pick the good ones" path: the gate runs on every frame of the baseline window,
both control windows and the after-drag window.

Justification of the three numbers — all structural, none fitted:

- A cleared/undefined readback of an `alpha:true, premultipliedAlpha:true` context is
  transparent black: `zeroAlphaFraction = 1`, `distinctColors = 1`, `modalFraction = 1`.
  Each gate is therefore violated by an enormous margin in the failure case.
- The scene draws an opaque background (`scene.background = new THREE.Color(BACKGROUND_COLOR)`,
  `Viewer3D.tsx:1941`, `:96`), so a genuinely rendered frame has no `A === 0` pixels.
- For scale only, the preserved pixel analysis of a *real* rendered frame reports 7,677
  distinct colours in a 400×140 geometry ROI and 14,843 over the canvas ROI. 32 sits three
  orders of magnitude below the observed real value and 32× above the blank value. If a real
  frame ever fell below 32, the correct response is to investigate the renderer, **not** to
  lower the gate.

### 4.6 How ambient motion is neutralised — and what is left to fail loudly

Three mechanisms can move the picture without a commanded drag. Each is handled by a
mechanism that can only cause failure, never a pass:

1. **Camera tween** (`Viewer3D.tsx:883-905`, `:2215-2240`; 550 ms / 900 ms): killed by the
   first trusted pointer-down, because the OrbitControls `'start'` listener sets
   `runtime.cameraTween = null` (`:2040-2042`), and `'start'` is dispatched on pointer-down
   (`OrbitControls.js:1729`). The design's very first action is a zero-movement pointer-down
   at `P0`.
2. **Auto-rotate** (`Viewer3D.tsx:2157-2159`): active only when
   `now − lastInteractionAt > 8000`. Every pointer-down resets that clock. Each capture
   window is therefore opened by a pointer-down and must complete within a
   `WINDOW_BUDGET_MS = 6000` measured on the frame records' `msSinceLastPointerDown`
   (§4.3). If a window exceeds the budget it is **re-armed** — a zero-movement pointer-down
   at the *same, already-proven-inert* point, then the window restarts — at most twice;
   after that, `AUTOROTATE_WINDOW_EXCEEDED`. A re-arm cannot manufacture motion, because a
   zero-movement pointer-down produces no `_sphericalDelta`
   (`OrbitControls.js` rotate path is driven by pointer *move* deltas only).
   Belt and braces: even if auto-rotate did engage, consecutive frames would differ and the
   quiescence/control gates below would fail rather than pass.
3. **Damping residual** after a real drag (`OrbitControls.js:708-709`, `:792-795`;
   `0.92^n` per frame): this is *caused by the commanded drag*, so it is not a confound for
   the after-window. It is a confound only if the after-window demanded stability — which is
   why the after-window demands **persistence, not stability** (§4.7 step 4). Before the
   drag there is no residual, because the only prior interactions are zero-movement
   pointer-downs.

A fourth, non-camera source of pixel change is handled structurally: the drag's own `click`
can ray-pick a rebar and change the highlight (`Viewer3D.tsx:2097-2110` →
`setHoverRowRef` → `applyHighlight`, `:2256-2260`). This is why the no-drag control is run
**at both commanded endpoints** (§4.7 steps 2 and 3): if a click at `P0` or at `P1` changed
the picture, the control fails by name, so a pass cannot be explained by a click-induced
highlight change.

### 4.7 The trial sequence

All of this lives inside `perturbViewer`, after the existing clip (`断面カット`) manipulation,
which is unchanged and still supplies `clipMoved`.

- **Step 0 — preflight.** Resolve and pin the canvas (§4.1). Park the pointer outside the
  canvas (`page.mouse.move` to a viewport point asserted outside the canvas rect; this also
  fires `pointerleave` → `updateTooltip(null)`, `Viewer3D.tsx:2093-2096`). Select the ROI
  (§4.2). Capture 1 frame on each channel and run the §4.5 gate plus the Channel-B capability
  check: `typeof buf.length === 'number' && buf.length > 0` and a parseable PNG IHDR.
  Capability failure → `SCREENSHOT_BYTES_UNAVAILABLE`, and the step ends `error` — **there is
  no silent single-channel mode**. (Read, not observed: the sandbox's own Playwright client
  treats `page.screenshot()`'s result as a `Buffer`, calling `buffer.toString("base64")` and
  `jpegDimensions(buffer)` at `sandbox-client.js:5155-5180`, and `Buffer` in the QuickJS
  runtime is `class Buffer extends Uint8Array` (`daemon.bundle.mjs:6246`); every existing
  `tests/e2e/uc*.js` already does `saveScreenshot(await page.screenshot(), …)`. So the bytes
  are expected to be indexable — but the preflight is what establishes it.)
- **Step 1 — baseline / quiescence.** Zero-movement pointer-down+up at `P0`; assert delivery
  (§4.4); park the pointer; capture `STABLE_FRAMES = 3` consecutive frames on Channel A. All
  three must be accepted by §4.5 **and be bit-identical**. Not identical → `BASELINE_NOT_QUIESCENT`
  with the three frame records (this is the diagnosis hook for the unexplained drift of §1.5).
  Store the last frame's raw pixels as the in-page baseline and its hash as `H0`. Take one
  Channel-B screenshot → `S0`.
- **Step 2 — no-drag control at `P0`.** Repeat the zero-movement pointer-down+up at `P0`;
  park; capture 3 frames; **all must equal `H0` exactly** and pass §4.5. Take a Channel-B
  screenshot; its bytes must equal `S0` exactly. Any inequality → `CONTROL_MOVED` with
  `diffFractionVsBaseline` per frame.
- **Step 3 — no-drag control at `P1`.** Identical to step 2 but at the drag's *end* point.
  Same requirement. This is what makes a later "the picture changed" attributable to the
  commanded displacement rather than to the click that terminates the drag.
- **Step 4 — commanded drag.** `move(P0, steps:8)` → `down()` → `move(P1, steps:8)` →
  `up()`; assert delivery and endpoints (§4.4); park the pointer; capture
  `AFTER_FRAMES = 3` consecutive frames on Channel A and one Channel-B screenshot `S1`.
  Requirements:
  - every after-frame passes §4.5 (`BLANK_FRAME` otherwise);
  - **every** after-frame's hash `!== H0` (`MOTION_NOT_PERSISTENT` otherwise) — persistence
    without demanding stability, which is what makes the gate survivable while damping is
    still decaying;
  - the **first** after-frame already differs (`NO_MOTION_AFTER_DRAG` otherwise);
  - `max(diffFractionVsBaseline) >= MOTION_MIN_DIFF_FRACTION = 0.02`
    (`MOTION_BELOW_FLOOR` otherwise) — a floor against a one-pixel flicker counting as a
    camera move. For scale only: the preserved analysis of a real drag shows ~99 % of the
    geometry ROI changing, so 0.02 is a floor, not a tuned value;
  - `S1 !== S0` bytewise, and `S1.length > 1024` (`CHANNEL_DISAGREEMENT` /
    `SCREENSHOT_SUSPECT_BLANK` otherwise).
  `cameraMoved` is true only if Channel A **and** Channel B both report change and every gate
  above passed.
- **Step 5 — teardown.** Remove the listeners, delete `window.__uc25Cam`, free the baseline
  buffer. Emit the evidence record; if `cameraMoved` is false, `throw` as today, with the
  named code and the full record in the message.

### 4.8 Evidence record

One console line, mirroring the existing `UC25 CLEARANCE_ORACLE` convention
(`uc25-joint-review.js:745`):

```
UC25 CAMERA_ORACLE {
  callSite: "scenario7" | "scenario14",
  canvas: { expectedLabel, observedLabel, canvasCount, labels[], rect, backingStore,
            dpr, contextAttributes },
  roi: { candidateIndex, cssRect, devicePxRect, gridSamples, pngIhdr },
  channels: { a: "gl.readPixels@rAF", b: "page.screenshot clip+scale:css" },
  windows: { baseline:[Frame,Frame,Frame], controlP0:[…], controlP1:[…], afterDrag:[…] },
  screenshots: { s0Hash, s0Bytes, s1Hash, s1Bytes },
  pointer: { p0, p1, log[], allTrusted, allOnPinnedCanvas },
  budgets: { windowBudgetMs: 6000, autoRotateDelayMs: 8000, rearmCount },
  verdict: { cameraMoved, code: null | "<FAILURE_CODE>", maxDiffFraction }
}
```

`step8-report.json` gains `camera_oracle` with this record for both call sites, and
`paths_verified` gains `tests/e2e/uc25-joint-review.js` and `tests/e2e/README.md` (already
present) — per `scripts/check-citations.py`, anything the report leans on must be declared.

### 4.9 Failure codes (complete)

`JOINT_CANVAS_NOT_FOUND`, `CANVAS_AMBIGUOUS`, `BACKING_STORE_MISMATCH`,
`GL_CONTEXT_UNAVAILABLE`, `ROI_OBSTRUCTED`, `ROI_OUT_OF_BOUNDS`,
`SCREENSHOT_BYTES_UNAVAILABLE`, `SCREENSHOT_SCALE_MISMATCH`, `SCREENSHOT_SUSPECT_BLANK`,
`BLANK_FRAME`, `BASELINE_NOT_QUIESCENT`, `CONTROL_MOVED`, `POINTER_NOT_DELIVERED`,
`AUTOROTATE_WINDOW_EXCEEDED`, `NO_MOTION_AFTER_DRAG`, `MOTION_NOT_PERSISTENT`,
`MOTION_BELOW_FLOOR`, `CHANNEL_DISAGREEMENT`.

---

## 5. Falsification plan

### 5.1 In-run (structural) falsification

The no-drag controls at `P0` **and** `P1` (§4.7 steps 2-3) are inside the real run. If the
oracle would call ambient animation, a click-induced highlight change, a DOM overlay repaint
or a blank readback "motion", those windows report it and the run fails. The oracle cannot
pass without first demonstrating, in the same session and by the same method, that *not*
dragging produces no change.

### 5.2 Out-of-run negative controls

A scratch probe — **new file under `tests/e2e/` used only for oracle validation, never part
of the 19 checks, and it must not modify `uc25-joint-review.js`** — imports/duplicates the
same helper source and runs these. Each probe **passes only when the oracle refuses**, and
each must be recorded in `step8-report.json#/camera_oracle/negative_controls`:

| # | Setup | Required outcome |
|---|---|---|
| 1 | Drag phase with `P1 === P0` (no displacement) | `NO_MOTION_AFTER_DRAG` — a no-drag must not pass as motion |
| 2 | `resolveViewerCanvas('存在しないラベル')` | `JOINT_CANVAS_NOT_FOUND` — must **not** fall back to `canvas` |
| 3 | Inject a decoy `<canvas>` as the first element in document order (test-only DOM in the probe), then resolve with the joint label | resolver pins the *labelled* canvas; `canvas.count` recorded as 2; this is the direct regression for `uc25-joint-review.js:329` |
| 4 | Drag on the decoy canvas while the oracle is pinned to the joint canvas | `POINTER_NOT_DELIVERED` — a drag on a non-joint canvas must not pass |
| 5 | Call the ROI read **outside** the rAF callback (reproduces the original defect exactly) | `BLANK_FRAME` — a blank frame must not pass |
| 6 | Idle >8 s with no pointer-down, then run the baseline window | `BASELINE_NOT_QUIESCENT` or `AUTOROTATE_WINDOW_EXCEEDED` — ambient rotation must never be reported as motion |
| 7 | Place the Channel-B clip over a static DOM region outside the canvas and run the full sequence | `CHANNEL_DISAGREEMENT` — the ROI binding must be load-bearing |
| 8 | Force `modalFraction` high by reading a 2×2 ROI of uniform background (ROI override in the probe only) | `BLANK_FRAME` — the non-blank gate must not be satisfiable by a degenerate region |

A probe that produces the *wrong* code, or no failure at all, invalidates the oracle. In that
case the correct action is to fix the oracle — **not** to relax `uc25`.

### 5.3 What is explicitly not a falsification

"The full run went green" is not evidence that the oracle works. Only §5.1 + §5.2 are.

---

## 6. Preserved semantics — nothing is weakened

### 6.1 Scenario 7 keeps both assertions, verbatim

`uc25-joint-review.js:766-780` is **unchanged**:

```js
const stableResult = await waitUntil("check stability after viewer-only changes",
  readCheckResult,
  (value) => value.checkId === checkId1 && value.findings === findings1 &&
             JSON.stringify(value.verdicts) === JSON.stringify(verdicts1));
checks.checkStableAfterViewerPose =
  viewerPerturbation.clipMoved && viewerPerturbation.cameraMoved &&
  stableResult.checkId === checkId1 && stableResult.findings === findings1 &&
  JSON.stringify(stableResult.verdicts) === JSON.stringify(verdicts1);
```

So the scenario still asserts **camera change AND check-result invariance**
(`checkId === checkId1`, findings table text identical, all three verdict lines identical).
The remount assertion at `:760-765` is unchanged. `perturbViewer` still `throw`s when the
camera does not demonstrably move; the only change is that the throw now carries a named
code and per-frame evidence.

### 6.2 What `cameraMoved` means, before and after

| | before | after |
|---|---|---|
| element | first `canvas` in document order (unasserted) | the canvas whose `aria-label` is `接合部の配筋3D`, asserted, pinned by node identity |
| pixels | `toDataURL` from a task, possibly a cleared buffer, never proven non-blank | ROI of the drawing buffer read inside the frame, non-blank-gated on every frame, corroborated by the compositor |
| ambient exclusion | two equal wall-clock samples (vacuous) | two matched no-drag controls at both endpoints + frame-counted windows + an 8 s budget |
| input | dispatched, delivery unasserted | trusted, delivery and endpoints asserted |

Strictly stronger in every column. No assertion is removed, loosened, or made conditional.

### 6.3 Both call sites

`perturbViewer` is called twice: Scenario 7 (`:754`) and Scenario 14 (`:959`), and both feed
`… .clipMoved && … .cameraMoved` into a check. Signature becomes
`perturbViewer({ callSite, expectedCanvasLabel })`:

- Scenario 7 passes `'接合部の配筋3D'` — the scenario's premise is the joint viewer, so a
  missing joint canvas must fail.
- Scenario 14 passes `null` — its subject is "display edits do not change review/package
  state", and pinning the viewer mode there would add a requirement Step8 never specified.
  Identity is still fully asserted via the `CANVAS_AMBIGUOUS` path (exactly one canvas, a
  non-empty label, pinned by node identity, hit-target asserted), and the observed label is
  recorded. **No silent fallback exists on either path.**

### 6.4 Not touched

`src/**` (in particular `Viewer3D.tsx` — no `preserveDrawingBuffer`), `src/rulepack/**`,
`src/domain/**`, any fixture, any store, `phases/48-joint-review-ui/step8.md`, the 19 `checks`
keys and the `Object.keys(checks).length !== 19` throw, Scenario 5's
`evaluateClearanceOracle` and its thresholds, every downstream first-row action
(`:786`, `:959`), Scenario 14's stability expression.

---

## 7. The two items carried over from `step8-report.json#/independent_correction_review`

### 7.1 Low-arm liveness (Opus recommendation) — mandatory, one assertion

Problem as recorded: the low arm asserts only `checkId !== checkId0` plus the absence of the
`C1/帯筋/D13/#0,#1` row class. If `fill`/blur silently failed, the clearance basis stays
`null`, the low arm passes vacuously, and the demonstration degrades from "86 vs 88" to
"null vs 88".

Source-backed closure: `src/lib/review/geometry-check.ts:255-261` computes
`clearance: clearance === null ? NOT_ENOUGH : …` where
`NOT_ENOUGH = '判断不可（あき基準未入力）'` (`:120`), and the early no-target return uses
`'検査対象なし'` (`:249`). `src/components/review/ReviewPane.tsx:306` renders that axis as
`<p data-review-verdict="clearance">`. So the clearance verdict text is an exact,
attribute-addressable witness that a non-null basis reached the engine.

Add, immediately after `lowResult` is obtained (`uc25-joint-review.js:~665`):

```js
const lowClearanceVerdict = await page.evaluate(() =>
  document.querySelector("[data-review-verdict='clearance']")?.textContent
    ?.replace(/\s+/g, " ").trim() ?? "");
const lowBasisReachedEngine =
  !lowClearanceVerdict.includes("判断不可（あき基準未入力）") &&
  !lowClearanceVerdict.includes("検査対象なし");
if (!lowBasisReachedEngine) {
  throw new Error(`UC25 low clearance basis did not reach the engine: ${JSON.stringify(
    { lowClearanceVerdict, lowMm: clearanceLowMm, checkId: lowResult.checkId })}`);
}
```

and fold `lowBasisReachedEngine` into `checks.clearanceRecheckFindings`, and
`lowClearanceVerdict` into the `UC25 CLEARANCE_ORACLE` record.

Note the assertion is deliberately **"not 判断不可 and not 検査対象なし"**, not
"`あき不足候補なし（検査条件内）`": `step8.md` Scenario 5 explicitly does not constrain
insufficiency rows outside the C1 `#0/#1` class, so at `low = g − 1` the clearance axis is
legitimately allowed to read `あき不足候補あり` because of some *other* pair. Demanding
`なし` would be an over-constraint invented by the test. This is a strengthening (a new
liveness requirement), never a relaxation. The same one-liner may optionally be applied to
the high arm; the low arm is the one the review named.

### 7.2 `parseFindingRows` spurious-failure surface at Scenario 4 — remove the surface, keep the coverage

`uc25-joint-review.js:102-107` throws on any row with fewer than six cells or an unparsable
bar reference. At `:643` it is applied to the **entire ~700-row** null-basis table
(`observed_table` in the preserved report: 698 rows) while the only thing consumed is
`initialRows.length` → `observations.initialFindingRowCount`. That is a hard-failure surface
on the most fragile step of the run for zero assertion value.

Change `:643` to:

```js
const initialRows = await readFindingRows();
observations.initialFindingRowCount = initialRows.length;
```

Nothing else changes. `parseFindingRows` stays exactly as it is and stays load-bearing where
it matters — `readFindingSnapshot` (`:242-246`) still strict-parses the low and high tables,
which is where the oracle reads pair labels, gap text, basis and exclusion text. So the DOM
shape is still verified twice per run; only the redundant 700-row parse whose result is
discarded is dropped. Scenario 4's text-level assertions
(`!initialResult.findings.includes("あき不足候補")` etc., `:635-639`) are untouched.

---

## 8. Implementation brief

Target file: `tests/e2e/uc25-joint-review.js`. Secondary: `tests/e2e/README.md`,
`phases/48-joint-review-ui/step8-report.json`, a new `step8-camera-correction.md` recording
the bounded amendment and its independent validation (same shape as `step8-correction.md`).

### 8.1 Remove

- `readCanvasFrame` (`:327-346`) — the dead `toDataURL` channel, including the
  `"canvas[aria-label='接合部の配筋3D'], canvas"` selector list.
- `waitForStableCanvasFrame` (`:348-375`) — the vacuous wall-clock stability gate.
- `canvasFrameChanged` (`:377-382`).

These are instruments, not assertions. Their removal is justified in §1.1-§1.2 and their
replacements are strictly stronger (§6.2). Record this reasoning in the correction file.

### 8.2 Add (test-side only)

1. `installCameraProbe({ expectedCanvasLabel })` — one `page.evaluate` that creates
   `window.__uc25Cam` with: the pinned canvas + GL context (§4.1), the frame ticker, the
   capture-phase pointer log (§4.4), `captureFrames(n)` (§4.3), `readRoi`, `setBaseline`,
   `frameStats` (§4.5), `selectRoi` (§4.2) and `teardown`. Everything is created and
   destroyed by the test; nothing reads or writes product state.
2. `captureScreenshotRoi(roi)` on the script side — `page.screenshot({clip, scale:'css',
   type:'png'})`, FNV-1a over the bytes, IHDR parse and dimension assertion (§4.2), byte
   length recorded.
3. `parkPointer()` — `page.mouse.move` to a viewport point asserted outside the canvas rect;
   assert no visible tooltip before every Channel-B capture.
4. `settleClick(point)` — `move(steps:8)` + `down()` + `up()` with the delivery assertions of
   §4.4.
5. `runCaptureWindow({ name, frames, requireEqualTo })` — the frame-counted window with the
   §4.5 gate, the `WINDOW_BUDGET_MS` check and the bounded re-arm.
6. `perturbViewer({ callSite, expectedCanvasLabel })` — rewritten body per §4.7. The clip
   (`断面カット`) block at `:385-399` is kept **exactly as is**. The return value keeps its
   existing shape `{clipBefore, clipAfter, clipMoved, cameraMoved, …}` and gains the evidence
   record; the existing throw-on-`!cameraMoved` is kept and gains the failure code.
7. Call-site updates at `:754` (`{callSite:'scenario7', expectedCanvasLabel:'接合部の配筋3D'}`)
   and `:959` (`{callSite:'scenario14', expectedCanvasLabel:null}`).
8. `console.log("UC25 CAMERA_ORACLE " + JSON.stringify(record))` per call site (§4.8).
9. §7.1 low-arm liveness assertion; §7.2 Scenario-4 parse removal.
10. `tests/e2e/README.md`: extend the uc25 subsection with a "camera evidence oracle" block
    stating the channel, the identity rule, the two endpoint controls, the non-blank gate,
    the 8 s auto-rotate budget and the failure codes — in the same register as the existing
    clearance-oracle block (which is the precedent for documenting an oracle's facts).

### 8.3 Constants (single `const` block, named, with the source of each)

```
STABLE_FRAMES = 3            // consecutive rendered frames per window
AFTER_FRAMES = 3
WINDOW_BUDGET_MS = 6000      // < AUTO_ROTATE_DELAY_MS 8000, Viewer3D.tsx:105
MAX_REARMS = 2
MOTION_MIN_DIFF_FRACTION = 0.02
NONBLANK_MIN_DISTINCT = 32
NONBLANK_MAX_MODAL_FRACTION = 0.98
DRAG_DX_CSS = -40, DRAG_DY_CSS = -12
POINTER_TOLERANCE_PX = 1
```

### 8.4 Do NOT

- Do not touch `src/**`, `src/rulepack/**`, `src/domain/**`, any fixture, any store, or
  `next.config.ts`. In particular **do not add `preserveDrawingBuffer: true`** (§3).
- Do not change `phases/48-joint-review-ui/step8.md` — no spec change is required (§0).
- Do not weaken, delete or make conditional any existing assertion, including
  `checks.checkStableAfterViewerPose`, the remount throw, the 19-key throw, Scenario 5's
  oracle, Scenario 14's stability expression, or the downstream first-row actions.
- Do not add a tolerance to the control windows to make them pass. If a control is not
  bit-identical, stop and report `BASELINE_NOT_QUIESCENT`/`CONTROL_MOVED` with the frame
  records. A tolerance may be introduced only with a stated cause and independent review.
- Do not choose the ROI, the endpoints or any threshold by looking at captured pixels
  (§2 rule 3).
- Do not run the negative-control probe file as part of the 19 checks, and do not leave any
  decoy-canvas DOM injection inside `uc25-joint-review.js`.
- Do not add `--headless` beyond what `step8.md` documents; if the host has no display,
  record the deviation in the report rather than changing the command silently
  (this was already flagged as an execution deviation by the independent review).
- Do not claim browser acceptance from static or Node-harness execution of the helpers.

### 8.5 Order of work

1. Independent falsification of **this document** by an agent that will not implement it.
2. Implement §8.1-§8.3 with the negative-control probe (§5.2) written **first** and shown to
   produce the required refusal codes.
3. `npm run build` → `npx next start -p 3000` → `npx dev-browser --browser kijun --timeout 180
   run tests/e2e/uc25-joint-review.js` (build before server, per `CLAUDE.md` and
   `tests/e2e/README.md`).
4. Then the seven regressions, `npx vitest run && npx tsc --noEmit && npm run lint`, the
   screenshot, and the report update with `camera_oracle` + `negative_controls`.
5. `python scripts/check-citations.py phases/48-joint-review-ui/step8-report*.json`.

---

## 9. Open risks, and what would invalidate this design

1. **rAF-ordering assumption (§4.3).** If a test-registered rAF callback does not run after
   `renderer.render()` in the same frame, Channel A reads a cleared buffer. *Consequence:*
   `BLANK_FRAME`, never a false pass. *Invalidates:* the choice of Channel A as the decision
   oracle — the fallback would be to promote Channel B to the decision role, which then
   requires the ROI obstruction guard to carry the full weight. Negative control #5 is the
   detector.
2. **Channel B byte availability.** Concluded from reading `sandbox-client.js:5155-5180` and
   `daemon.bundle.mjs:6246`, plus the universal `saveScreenshot(await page.screenshot(), …)`
   usage across `tests/e2e/uc*.js`. **Not observed.** If `page.screenshot()` does not return
   indexable bytes in the QuickJS sandbox, the preflight fails loudly
   (`SCREENSHOT_BYTES_UNAVAILABLE`) and the two-channel requirement must be renegotiated with
   the reviewer — not silently dropped.
3. **The unexplained no-drag drift of §1.5 may reappear.** If `BASELINE_NOT_QUIESCENT` or
   `CONTROL_MOVED` fires with all other gates green, then something in the joint scene *does*
   animate per frame without input. That is a **new finding**, and the per-frame records
   (hashes, `diffFractionVsBaseline`, `msSinceLastPointerDown`) are the diagnosis. It must not
   be papered over with a tolerance; it becomes a separately authorised investigation.
4. **The endpoints may ray-pick geometry.** Then control #2 or #3 fails by name. The
   legitimate response is to move the commanded endpoints to a documented alternative and
   record the change (a setup fix decided by *layout*, not by the measurement outcome). The
   response is **not** to drop the endpoint controls.
5. **Window budget vs ~1 Hz throttling.** Three frames per window at ~1 Hz is ~3 s against a
   6 s budget; two re-arms are allowed. If the rate drops below ~0.5 Hz the run reports
   `AUTOROTATE_WINDOW_EXCEEDED` rather than guessing. If that becomes chronic, the correct
   fix is to raise `MAX_REARMS` (re-arms are provably inert), not to weaken a gate.
6. **Predicted next blocker, outside the camera scope — record it, decide separately.**
   `uc25-joint-review.js:316-323` (`loadJsonObject`) calls
   `Buffer.from(JSON.stringify(value), "utf8")`. In the installed dev-browser 0.2.9 QuickJS
   runtime, `Buffer.from(string, enc)` throws `"QuickJS Buffer only supports base64 string
   input"` for any `enc !== "base64"` (`daemon.bundle.mjs:6265-6272`), and **every other**
   `tests/e2e/uc*.js` uses `Buffer.from(…, "base64")` (uc12, uc17, uc22, uc23, uc24). uc25
   has never executed past Scenario 7, so this path has never run. If that reading is right,
   Scenarios 15/17/18 will throw as soon as the camera gate is fixed. The test-side,
   non-weakening repair is to build the base64 in-page (`page.evaluate` + `btoa`/`TextEncoder`)
   and pass `Buffer.from(b64, "base64")` to `setInputFiles`. **This is a reading of the
   installed runtime, not an observation**, and it is a separate decision from the camera
   repair: fold it into the same test-side pass or file it, but do not discover it at hour
   three of the next full run.
7. **Nothing here establishes a product defect.** If, after this oracle is in place and its
   negative controls pass, a trusted drag still produces no pixel change with non-blank
   frames, correct identity, delivered trusted input and stable controls, *then* the
   classification flips to a product-side suspect — and that is a separate, authorised
   diagnosis, not a Step8 patch.

**No product decision by the user is required to implement this design.** The only decisions
left open are (6) above — whether the `Buffer.from(…, "utf8")` repair rides along in the same
test-side pass — and, if and only if risk (7) materialises, whether to authorise a
product-side investigation.
