# Independent Cross-Verification Verdict: Commit `51c68d6` (`feat-48-joint-review-ui`)

**Target Repository:** `C:\Users\emper\mdtproject`  
**Branch:** `feat-48-joint-review-ui`  
**Commit:** `51c68d63d814accae79b7b10f53d839c0f4bbf16`  
**Role:** Independent Cross-Verifier (Read-Only Refutation)  

---

## Executive Summary of Verdicts

| Claim | Topic | Verdict |
|---|---|---|
| **Claim 1** | "No product code changed in commit `51c68d6`" | **SURVIVES** |
| **Claim 2** | "A pixel-based camera oracle cannot work here" | **REFUTED** |
| **Claim 3** | "The replacement oracle is sound and falsifiable" | **REFUTED** |
| **Claim 4** | "The reported review findings are real" | **SURVIVES** |

---

## Detailed Evaluation and Evidence

### Claim 1 — "no product code changed"

#### Attack & Findings
1. Independent git inspection via `git diff 51c68d6^ 51c68d6 --name-only` confirms that commit `51c68d6` modifies exactly four files:
   - `phases/48-joint-review-ui/index.json`
   - `phases/48-joint-review-ui/step8-correction.md`
   - `phases/48-joint-review-ui/step8-report.json`
   - `tests/e2e/uc25-joint-review.js`
2. `git diff 51c68d6^ 51c68d6 -- src/` produces an empty diff (0 files touched under `src/`).
3. No product source files under `src/` differ between `main` and `feat-48-joint-review-ui` as a result of commit `51c68d6`. The commit is strictly confined to e2e test scripts and phase documentation.

#### Verdict
**SURVIVES**

---

### Claim 2 — "a pixel-based camera oracle cannot work here"

The report (`phases/48-joint-review-ui/step8-report.json:257-261`) claims that:
> *"the joint scene never renders two byte-identical frames... 11 consecutive captures produced 11 distinct hashes with no input between them... with the pointer held down (which excludes autoRotate)... Cause: Coincident rebar surfaces z-fight... The depth-test winner between coplanar surfaces is undefined per frame."*

#### Attack & Source Refutations

1. **GPU depth-test determinism vs. "undefined depth-test winner":**
   - In standard WebGL rendering with deterministic draw call ordering, rasterization and depth testing are strictly deterministic. Given identical vertex coordinates, model-view-projection matrices, viewport dimensions, and rasterization states, `gl.depthFunc` (whether `gl.LESS` or `gl.LEQUAL`) resolves identical results on every frame.
   - A GPU rasterizer does not inject random noise or flip coins per frame on static coplanar geometry. The claim that *"depth-test winner between coplanar surfaces is undefined per frame"* on an unmoving camera is a flawed premise. Two consecutive frames of static geometry can only produce distinct hashes if:
     - The camera or scene transforms are continuously mutating;
     - Shaders employ non-deterministic time-based uniforms; or
     - A temporal anti-aliasing (TAA) pass is jittering projection subpixels.
   - `src/components/viewer/Viewer3D.tsx:1953-1959` sets up standard Three.js `WebGLRenderer` with no TAA pass and no temporal shader noise. Therefore, pixel variation implies scene or camera mutation.

2. **"Pointer held down" does NOT stop camera motion (OrbitControls damping residue):**
   - Inspection of `node_modules/three/examples/jsm/controls/OrbitControls.js:700` confirms that `autoRotate` is guarded by:
     ```js
     if ( this.autoRotate && this.state === _STATE.NONE )
     ```
   - When a pointer is pressed down, `this.state` transitions from `_STATE.NONE` to `_STATE.ROTATE` (`OrbitControls.js:1693`), which prevents `autoRotate` from invoking `_rotateLeft`.
   - **However**, `Viewer3D.tsx:1970-1971` configures:
     ```ts
     controls.enableDamping = true
     controls.dampingFactor = CONTROLS_DAMPING // 0.08
     ```
   - In `OrbitControls.js:708-710, 790-796`:
     ```js
     if ( this.enableDamping ) {
       this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
       this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
     }
     // ...
     if ( this.enableDamping === true ) {
       this._sphericalDelta.theta *= ( 1 - this.dampingFactor );
       this._sphericalDelta.phi *= ( 1 - this.dampingFactor );
       this._panOffset.multiplyScalar( 1 - this.dampingFactor );
     }
     ```
   - Crucially, `_onPointerDown` (`OrbitControls.js:1645-1730`) **never clears `this._sphericalDelta`**.
   - If there was any prior rotation (or autoRotate accumulation), `this._sphericalDelta` is non-zero. Under damping decay (`*= 0.92` per frame), it takes dozens of frames for delta values to decay. During this entire interval, `this._spherical.theta` continues to change on every single frame, directly mutating `camera.position` (`OrbitControls.js:786`).
   - The camera was actively in motion during the captures.

3. **Active Tweens and Premature Probing:**
   - In `src/components/viewer/Viewer3D.tsx:101-102, 897, 2146-2156`, camera tweens run for `FLY_IN_DURATION_MS = 900` or `TRANSITION_DURATION_MS = 550`.
   - In the scratchpad test script `probe-raf.js:13` and `probe-s7.js:13`, captures were initiated after only `await sleep(800)`. At 800ms, the initial fly-in camera tween had not yet completed.

4. **Missing Observation:**
   - What observation would have distinguished camera motion from z-fighting? Logging `camera.matrixWorld.elements` or `camera.position.toArray()` and `controls.target.toArray()` between consecutive frames.
   - No such observation was made. The report measured only PNG string length and hash (`step8-report.json:258`), where PNG data length drifted from 389,454 to 395,986 bytes. A 6,500-byte drift in compressed PNG stream size is classic evidence of geometric translation/rotation across pixel grids, not stationary two-surface z-flicker.

#### Verdict
**REFUTED**

---

### Claim 3 — "the replacement oracle is sound and falsifiable"

The replacement oracle in `tests/e2e/uc25-joint-review.js:353-465` samples tooltips at 5 canvas points (`FINGERPRINT_POINTS`) before and after a mouse drag, requiring `fingerprintBefore === fingerprintRepeat`, at least one non-hidden rebar, and `fingerprintBefore !== fingerprintAfter`.

#### Attack & Failure Mode Analysis

1. **Passing while the camera did NOT move (False Positive):**
   - **Mechanism A (State mutation via `resetIdleTimer` click):**
     `perturbViewer` calls `resetIdleTimer(canvasBox)` (`tests/e2e/uc25-joint-review.js:427`). Lines 360-364 execute:
     ```js
     await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
     await page.mouse.down();
     await page.mouse.up();
     ```
     This dispatches a `click` event directly to `renderer.domElement`. In `src/components/viewer/Viewer3D.tsx:2097-2118`, `handleClick` raycasts against the canvas center:
     ```ts
     const { rowId } = hit.object.userData
     if (typeof rowId === 'string') {
       setHoverRowRef.current(rowId)
       capture('rebar_picked')
     }
     ```
     This triggers `useEffect` in `Viewer3D.tsx:2192-2198`, calling `rebuildScene(runtime, ...)`, which disposes and rebuilds all meshes in `runtime.pickableMeshes` and emits telemetry. The claim that the oracle *"changes no product state"* is false.
   - **Mechanism B (React state / RAF race condition):**
     `cameraFingerprint` sleeps only 120ms between points (`tests/e2e/uc25-joint-review.js:370`). In `Viewer3D.tsx:2075-2080, 2134-2144`, tooltip updates require `hoverDirty` -> RAF -> `updateTooltip` -> React state re-render. If a frame drops or React state update batches across 120ms, reading 1 reads a stale or hidden tooltip while reading 2 reads the rendered tooltip, producing a difference without camera movement.
   - **Mechanism C (Subpixel boundary raycasting):**
     Sampling points on the edge of thin cylindrical rebars (e.g. D13 at joint perspective) toggles hit/miss based on subpixel floating-point evaluation without any camera displacement.

2. **Failing while the camera DID move (False Blocker):**
   - **Mechanism A (Coarse schedule-row keying):**
     `tooltipFromHit` (`src/components/viewer/Viewer3D.tsx:995`) generates keys based solely on schedule row ID: `key: row:${line.id}`. The tooltip displays role, diameter, count, and length—**not hit coordinates**.
     Longitudinal rebars (such as column main bars D25 or beam top bars) extend across vast screen regions. If a camera drag shifts perspective but all 5 sampled points remain over any part of the same rebar schedule rows, `fingerprintBefore` and `fingerprintAfter` are identical. `tests/e2e/uc25-joint-review.js:455-459` throws a false blocker error:
     ```js
     throw new Error(`UC25 camera evidence blocker: the trusted drag left every sampled point on the same rebar...`)
     ```
   - **Mechanism B (Symmetric rotation):**
     Rotating a symmetrical column joint by 90° or 180° brings matching schedule rows under the exact same sample points, causing an identical fingerprint despite massive camera rotation.
   - **Mechanism C (Axial zoom):**
     Dolly zooming along the camera optical axis alters distance and perspective but preserves central raycast intersections, failing the difference check.

3. **Vacuous "Still Camera" Repeat Guard:**
   - In `Viewer3D.tsx:2076-2078`:
     ```ts
     const nextKey = next?.key ?? null
     if (tooltipKeyRef.current === nextKey) return
     tooltipKeyRef.current = nextKey
     setTooltip(next)
     ```
   - `tooltipKeyRef` suppresses React updates when the hit object shares the same key. If the camera drifts slowly (e.g. residual damping or autoRotate), the ray continues hitting the same rebar row. `fingerprintBefore` and `fingerprintRepeat` match perfectly, creating the false illusion of a stationary camera when the camera is in fact drifting.

4. **Flawed "Not Blind" Guard:**
   - `tests/e2e/uc25-joint-review.js:436` only requires `fingerprintBefore.some(...)` to be non-hidden. If 4 out of 5 points are empty background and only 1 point hits a rebar, the oracle is 80% blind.
   - Even worse: **there is no "not blind" guard on `fingerprintAfter`**. If a drag completely rotates the joint out of view into empty canvas space, all 5 points become `{ hidden: true, text: "" }`. Because this differs from `fingerprintBefore`, `cameraMoved` evaluates to `true` (line 454) and passes, despite the camera looking into void.

#### Verdict
**REFUTED**

---

### Claim 4 — "the reported review findings are real"

#### Item-by-Item Verification

1. **`ReviewPane.tsx` `openDraft` unconditionally builds `{ kind: 'joint' }` target:**
   - In `src/components/review/ReviewPane.tsx:988-992`:
     ```ts
     const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null
     const targets: ElementRef[] = columnMemberId === null
       ? []
       : [{ kind: 'joint', columnMemberId }]
     ```
   - If `sel.memberId` is a girder (`大梁`), circular column (`円形柱`), or top-storey column without intersecting girders:
     - `src/domain/review/joint.ts:98, 105, 120` returns `{ status: 'unsupported', reason: ... }`.
     - `src/domain/review/validity.ts:53-55` pushes the target to `missing`.
     - `validity.ts:127-132, 156` sets `validity.state = '再検討必要'`.
     - `validity.ts:161-163` ensures `effectiveItemStatus` returns `'再検討必要'` regardless of user confirmation.
     - `src/domain/review/readiness.ts:112-114` permanently blocks any work package linking to this item with blocker `"前モデルの検討が残っている"`.
   - **Finding:** **HOLDS (Genuine product defect)**.

2. **`review.items.staleNotice` has zero test references:**
   - `rg -n "staleNotice" src/ tests/` reveals references only in:
     - `src/locales/ja.json:466`
     - `src/locales/ko.json:466`
     - `src/components/review/ReviewPane.tsx:1231`
   - Zero references exist in any test file under `src/` or `tests/`.
   - **Finding:** **HOLDS**.

3. **`WorkPackageBoard.test.tsx` never exercises checklist-to-review-item link `<select>`:**
   - `WorkPackageBoard.tsx:338-353` renders the link selector `<select aria-label="...関連する検討項目...">`.
   - In `src/components/review/WorkPackageBoard.test.tsx:102-134, 135-159`:
     - Test 1 only interacts with unlinked checklist items.
     - Test 2 manually injects `reviewItemIds: [item.id]` directly into fixture objects (line 142).
     - No test in `WorkPackageBoard.test.tsx` fires change events on this `<select>`.
   - **Finding:** **HOLDS**.

4. **Tautological assertion and substring matching in `WorkPackageBoard.test.tsx`:**
   - In `src/components/review/WorkPackageBoard.test.tsx:130-131`:
     ```ts
     const readiness = packageReadiness(pkg, state.review.items, currentModel())
     expect(within(card).getByTestId('data-package-state')).toHaveTextContent(readiness.state)
     ```
     The component renders `{readiness.state}` computed from `packageReadiness(...)` (`WorkPackageBoard.tsx:376, 390`). The test calls the identical function on identical inputs and asserts equality against its own result.
   - In line 132:
     ```ts
     expect(within(card).getByTestId('data-package-state')).toHaveTextContent('準備完了')
     ```
     Under `@testing-library/jest-dom`, `toHaveTextContent` performs substring matching. If `readiness.state` were `'準備完了（例外あり）'`, the assertion passes vacuously because `'準備完了（例外あり）'.includes('準備完了') === true`.
   - **Finding:** **HOLDS**.

5. **`tests/e2e/uc25-joint-review.js` diagnostic flaws and literal booleans:**
   - In `tests/e2e/uc25-joint-review.js:500` and `:790`:
     ```js
     checks.jointCanvas = true;
     // ...
     checks.findingFocus = true;
     ```
     Both checks are assigned hardcoded literal `true` values rather than evaluating condition predicates.
   - In lines 19-40 and 1273-1279, `window.__uc25Diagnostics` records `pageErrors` and `consoleErrors`. However, lines 1290-1296 compute pass/fail strictly from `checks`. Unhandled page errors and exceptions do not gate test success.
   - In lines 1072-1080:
     ```js
     schemaVersion: savedBundle.schemaVersion ?? null,
     storedSchemaVersion: storedCurrent.schemaVersion ?? null,
     // ...
     savedShape.schemaVersion === savedShape.storedSchemaVersion
     ```
     If `schemaVersion` is undefined on both objects, both sides evaluate to `null`, and `null === null` passes without verifying field existence or valid schema version format.
   - **Finding:** **HOLDS**.

#### Verdict
**SURVIVES**

---

## Final Verdict Summary

- **Claim 1:** **SURVIVES**
- **Claim 2:** **REFUTED**
- **Claim 3:** **REFUTED**
- **Claim 4:** **SURVIVES**
