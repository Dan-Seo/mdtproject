# Verdict: C7 Guard Attack Analysis

Evaluation of uncommitted changes to `tests/e2e/uc25-joint-review.js` (lines 402-404, 450, 468-491) under the criteria specified in `brief-v1-c7guard.md`.

---

## Claim 1: The after-guard closes the hole.

### Attack Analysis

The uncommitted change introduces `resolvesToRebar` and guards `fingerprintAfter`:
```javascript
// tests/e2e/uc25-joint-review.js:402-403
const resolvesToRebar = (reading) =>
  reading !== null && reading.hidden !== true && reading.text !== "";

// tests/e2e/uc25-joint-review.js:474-478
if (!fingerprintAfter.some(resolvesToRebar)) {
  throw new Error(
    `UC25 camera evidence blocker: no sampled point resolves to a rebar after the drag, so the camera is looking at nothing: ${JSON.stringify({ fingerprintBefore, fingerprintAfter })}`,
  );
}
```

The claim is that this guard closes the hole where the camera looks at "nothing" and passes. However, multiple failure modes survive this guard where the oracle still passes while looking at nothing useful or displaying invalid/stale state:

1. **One point resolving out of five (80% blind passing):**
   `fingerprintAfter.some(resolvesToRebar)` requires only $\ge 1$ point out of 5 to resolve. If a camera pan/tilt throws the joint 80% out of view such that 4 out of 5 sample points (`FINGERPRINT_POINTS`, `tests/e2e/uc25-joint-review.js:370`) land on empty background space (`{ hidden: true, text: "" }`), and only 1 single sample point grazes the outermost boundary of a rebar, `some(resolvesToRebar)` returns `true`.
   Under `changedPoints` (`tests/e2e/uc25-joint-review.js:481-486`), the 4 points that resolved to rebars in `fingerprintBefore` and now read `{ hidden: true, text: "" }` satisfy `resolvesToRebar(before) || resolvesToRebar(after)`. Therefore, all 4 points are included in `changedPoints`, yielding `changedPoints.length === 4 > 0` and `cameraMoved = true`. The oracle certifies that the camera moved and has valid view, despite 80% of the sampling grid pointing at void.

2. **A tooltip that is present but stale (Frozen Renderer / Stalled Event Loop):**
   In `src/components/viewer/Viewer3D.tsx:2081-2092`, `handlePointerMove` sets `hoverDirty = true`, but the raycast and tooltip update (`updateTooltip(tooltipFromHit(...))`) only execute within `renderFrame` (`src/components/viewer/Viewer3D.tsx:2134-2144`).
   If the WebGL animation frame loop halts or stutters (e.g. unhandled error in `renderFrame`, WebGL context loss, or CPU event starvation during `sleep(120)` in `tests/e2e/uc25-joint-review.js:387`), `updateTooltip` is never called.
   The DOM element `<div role="tooltip">` (`src/components/viewer/Viewer3D.tsx:2455`) remains in the DOM with `hidden={false}` and the text of the last successfully hovered rebar.
   When `cameraFingerprint` (`tests/e2e/uc25-joint-review.js:383-399`) subsequently polls all 5 points, each call to `document.querySelector("[role='tooltip']")` returns the exact same stale DOM element with `hidden: false` and valid text.
   Consequently:
   - `fingerprintAfter.some(resolvesToRebar)` evaluates to `true` across all 5 points.
   - If `fingerprintBefore` contained distinct rebar lines across points (e.g. main bar vs hoop), those differing indices satisfy `JSON.stringify(before) !== JSON.stringify(after)` and `resolvesToRebar`.
   - `cameraMoved` evaluates to `true`, declaring a successful camera move on a completely frozen viewer displaying stale DOM state.

3. **`resolvesToRebar` checking `reading.hidden !== true` rather than `=== false`:**
   In `tests/e2e/uc25-joint-review.js:402-403`, `reading.hidden !== true` uses negative matching against `true`. If a reading object has `hidden: undefined` or omits the property, `undefined !== true` evaluates to `true`. While `cameraFingerprint` currently maps `tip.hidden === true` to a boolean (`tests/e2e/uc25-joint-review.js:393`), `resolvesToRebar` is structurally non-strict and treats any non-boolean `hidden` value (e.g. `undefined`, `null`, `0`) as non-hidden.

4. **A tooltip that renders for something that is not a rebar:**
   In `src/components/viewer/Viewer3D.tsx:2503-2509`, when `tooltip?.kind === 'building'`, the tooltip renders `<dt>部材 id</dt><dd>...</dd><dt>符号</dt><dd>C1</dd>`.
   `resolvesToRebar` (`tests/e2e/uc25-joint-review.js:402-403`) only checks `reading !== null && reading.hidden !== true && reading.text !== ""`. It performs no check for rebar domain attributes (such as `役割`, `径`, `D13`, `主筋`, `帯筋`). Any non-rebar tooltip rendering non-empty text passes `resolvesToRebar`.

Because the oracle can still pass while the camera is looking at void across 80% of its sampling area, or when the viewer is frozen with a stale tooltip, the after-guard fails to close the hole.

### Verdict
**REFUTED**

---

## Claim 2: `changedPoints` is the right narrowing.

### Attack Analysis

The uncommitted code defines `changedPoints`:
```javascript
// tests/e2e/uc25-joint-review.js:479-486
// "Different" is not enough either: what has to have changed is which bar sits
// under a point, not merely that some point stopped reading one.
const changedPoints = fingerprintBefore
  .map((before, index) => ({ index, before, after: fingerprintAfter[index] }))
  .filter(({ before, after }) =>
    JSON.stringify(before) !== JSON.stringify(after) &&
    (resolvesToRebar(before) || resolvesToRebar(after)));
```

1. **Logical contradiction between code and specification:**
   The comment explicitly claims:
   `what has to have changed is which bar sits under a point, not merely that some point stopped reading one.`
   However, the code uses logical OR: `(resolvesToRebar(before) || resolvesToRebar(after))`.
   If a point previously read a rebar (`resolvesToRebar(before) === true`) and now reads hidden (`resolvesToRebar(after) === false`), the expression evaluates to `true`.
   The code explicitly counts points that "merely stopped reading one". To match the comment's stated assertion, the condition would have had to require logical AND: `resolvesToRebar(before) && resolvesToRebar(after)`.

2. **Concrete Pair A: Satisfies the rule WITHOUT the camera having moved:**
   Let the camera remain completely stationary ($CameraPosition_1 = CameraPosition_0, ControlsTarget_1 = ControlsTarget_0$).
   - `fingerprintBefore`:
     - Point 0: `{ hidden: false, text: "役割 主筋 径 D25 設計本数 12 設計長さ 4000 mm" }`
     - Point 1: `{ hidden: false, text: "役割 帯筋 径 D10 設計本数 24 設計長さ 2200 mm" }`
     - Points 2-4: `{ hidden: true, text: "" }`
   - With the camera completely stationary, a rebar visibility layer is toggled, or the cut plane slices through a bar, or hover state is evicted, turning Point 0 hidden while Point 1 remains visible:
   - `fingerprintAfter`:
     - Point 0: `{ hidden: true, text: "" }`
     - Point 1: `{ hidden: false, text: "役割 帯筋 径 D10 設計本数 24 設計長さ 2200 mm" }`
     - Points 2-4: `{ hidden: true, text: "" }`
   - Evaluation:
     - `fingerprintAfter.some(resolvesToRebar)`: Point 1 resolves -> `true`.
     - At index 0: `JSON.stringify(before) !== JSON.stringify(after)` is `true`. `resolvesToRebar(before) || resolvesToRebar(after)` is `true` (since `resolvesToRebar(before)` is `true`).
     - `changedPoints.length === 1 > 0` -> `cameraMoved = true`.
   - Result: Passes as a camera movement even though the camera did not move at all.

3. **Concrete Pair B: Camera moved significantly, but NOT satisfied (False Blocker):**
   - **Pair B1 (Translation or rotation along uniform rebar geometry):**
     In a column joint review, the longitudinal column bars (`主筋`, schedule row `1階|C|C1|主筋`) occupy the entire central region of the joint.
     `FINGERPRINT_POINTS` (`tests/e2e/uc25-joint-review.js:370`) are clustered around the center: `[0.3, 0.35]`, `[0.45, 0.5]`, `[0.55, 0.45]`, `[0.65, 0.6]`, `[0.4, 0.65]`.
     All 5 points land on `1階|C|C1|主筋`.
     - `fingerprintBefore`: all 5 points read `{ hidden: false, text: "役割 主筋 径 D25 設計本数 12 設計長さ 4000 mm" }`.
     The camera undergoes a significant orbit (e.g. 20°) or pan (e.g. 200 mm) along the column.
     Because the column is large and centered, all 5 points still intersect bars from schedule row `1階|C|C1|主筋`.
     - `fingerprintAfter`: all 5 points read `{ hidden: false, text: "役割 主筋 径 D25 設計本数 12 設計長さ 4000 mm" }`.
     - Evaluation:
       - For all indices $0 \le i \le 4$: `JSON.stringify(before) === JSON.stringify(after)`.
       - `changedPoints.length === 0` -> `cameraMoved = false`.
       - `tests/e2e/uc25-joint-review.js:488-490` throws:
         `UC25 camera evidence blocker: the trusted drag left every sampled point on the same rebar: ...`
     - Result: Substantial camera movement occurred, but `changedPoints` triggers a false blocker error.

   - **Pair B2 (Symmetrical 180° rotation):**
     In a cruciform joint with symmetric opposing girders (e.g. East and West share identical schedule row `1階|G|G1|上端筋`), an orbit of 180° points the camera in the opposite direction.
     Sample points that hit the East girder before now hit the West girder after.
     Because `tooltipFromHit` (`src/components/viewer/Viewer3D.tsx:995`) keys on `row:${line.id}`, both girders produce identical tooltip text.
     Every sampled point has `JSON.stringify(before) === JSON.stringify(after)`.
     `changedPoints.length === 0`, and the check throws a false blocker.

### Verdict
**REFUTED**

---

## Claim 3: The comment's factual claims are right.

### Attack Analysis

The comment states:
```javascript
// tests/e2e/uc25-joint-review.js:470-473
// A left drag with Shift, Ctrl or
// Meta held pans instead of rotating (OrbitControls MOUSE.ROTATE branch, and
// Viewer3D leaves enablePan at its default), which can take the joint off
// screen; so can the viewer unmounting or the tooltip going away.
```

1. **OrbitControls `MOUSE.ROTATE` modifier handling:**
   In `node_modules/three/examples/jsm/controls/OrbitControls.js`:
   - Line 358:
     ```javascript
     this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
     ```
   - Lines 1644-1647:
     ```javascript
     case 0:
         mouseAction = this.mouseButtons.LEFT;
         break;
     ```
   - Lines 1677-1686:
     ```javascript
     case MOUSE.ROTATE:
         if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
             if ( this.enablePan === false ) return;
             this._handleMouseDownPan( event );
             this.state = _STATE.PAN;
         } else {
             if ( this.enableRotate === false ) return;
             this._handleMouseDownRotate( event );
             this.state = _STATE.ROTATE;
         }
         break;
     ```
   Left-click (`button === 0`) maps to `this.mouseButtons.LEFT`, which defaults to `MOUSE.ROTATE`. When `event.ctrlKey || event.metaKey || event.shiftKey` is true, execution branches directly to `this._handleMouseDownPan(event)` and sets `this.state = _STATE.PAN`.

2. **`Viewer3D` leaves `enablePan` at its default:**
   In `node_modules/three/examples/jsm/controls/OrbitControls.js:271`:
   ```javascript
   this.enablePan = true;
   ```
   The default of `enablePan` in `OrbitControls` is `true`.
   In `src/components/viewer/Viewer3D.tsx:1969-1973`:
   ```tsx
   const controls = new OrbitControls(camera, renderer.domElement)
   controls.enableDamping = true
   controls.dampingFactor = CONTROLS_DAMPING
   controls.autoRotateSpeed = AUTO_ROTATE_SPEED
   ```
   `Viewer3D.tsx` does not set or reference `enablePan` anywhere. It remains at its Three.js default of `true`.

Every factual assertion in the comment regarding OrbitControls button mapping, modifier key branching to panning, and Viewer3D's default `enablePan` configuration is accurate.

### Verdict
**SURVIVES**

---

## Claim 4: The guard cannot break the passing run.

### Attack Analysis

The script's own drag (`tests/e2e/uc25-joint-review.js:456-465`) performs:
```javascript
await page.mouse.move(canvasBox.x + canvasBox.width * 0.48, canvasBox.y + canvasBox.height * 0.48);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.57, canvasBox.y + canvasBox.height * 0.53);
await page.mouse.up();
```
No modifier keys (`shift`, `ctrl`, `meta`) are passed.

We analyze whether any of the following factors can cause the new guard to fail a legitimate passing run that the old version tolerated:

1. **`resetIdleTimer` click (`tests/e2e/uc25-joint-review.js:377-381`):**
   `resetIdleTimer` clicks $(0.5, 0.5)$ prior to capturing `fingerprintBefore` (`tests/e2e/uc25-joint-review.js:441-443`). Any hover or selection side effects (e.g. `Viewer3D.tsx:2104-2105`) settle before `fingerprintBefore` and `fingerprintRepeat` are compared at line 444. This does not alter post-drag behavior.

2. **Auto-rotation delay (`AUTO_ROTATE_DELAY_MS`):**
   In `src/components/viewer/Viewer3D.tsx:105`, `AUTO_ROTATE_DELAY_MS = 8000` (8 seconds).
   Interaction during the drag fires `controls.start`, resetting `runtime.lastInteractionAt` (`src/components/viewer/Viewer3D.tsx:2040-2043`). Capturing `fingerprintAfter` (5 points $\times$ 120 ms sleep = 600 ms) finishes in under 1 second, well within the 8-second auto-rotate threshold. Auto-rotation does not activate during sampling.

3. **Tooltip dedupe key (`tooltipKeyRef` in `src/components/viewer/Viewer3D.tsx:1813, 2075-2080`):**
   `updateTooltip` skips updating React state only when `tooltipKeyRef.current === nextKey`. When a point moves between background void and rebar geometry, `nextKey` transitions between `null` and `row:${id}`, updating `tooltipKeyRef.current` and React state predictably.

4. **Cut plane position:**
   Adjusting the cut plane (`tests/e2e/uc25-joint-review.js:421-424`) occurs before `fingerprintBefore`. Moreover, Three.js raycasting in `pickVisible` (`src/components/viewer/Viewer3D.tsx:963-965`) operates on CPU geometries without clipping plane culling, as confirmed in `src/components/viewer/Viewer3D.test.tsx:893-904`.

5. **Comparison between Old Guard and New Guard on Legitimate Runs:**
   In a legitimate Scenario 7 run on joint 1F-X2Y1 (`tests/e2e/uc25-joint-review.js:866`):
   - As recorded in `phases/49-joint-review-defects/step0-report.json:101-105`, left-button drag rotates around `controls.target`, keeping the joint centered in the canvas. Sample points near the center (`[0.45, 0.5]` and `[0.55, 0.45]`) consistently hit rebar geometry (0 to 2 blind points observed across 14 drags; 0 instances of 5 blind points). Thus, `fingerprintAfter.some(resolvesToRebar)` always evaluates to `true`.
   - The camera rotation shifts rebar projections, causing 1 or more sampled points to change readings between rebar schedule rows or between rebar and void.
   - For every differing point between `fingerprintBefore` and `fingerprintAfter` produced by a camera rotation, at least one of the readings resolves to a rebar (`resolvesToRebar(before) || resolvesToRebar(after)` is `true`).
   - The only scenario where the old check (`JSON.stringify(fingerprintBefore) !== JSON.stringify(fingerprintAfter)`) passed while the new check fails is when ALL differences occur exclusively between non-rebar readings (e.g. `null` vs `{ hidden: true, text: "" }`). Because the tooltip element `<div role="tooltip">` remains mounted in the DOM throughout the run, no such spurious DOM toggle occurs in a normal run.
   - Therefore, any legitimate run that passed the old check will pass the new guard.

### Verdict
**SURVIVES**
