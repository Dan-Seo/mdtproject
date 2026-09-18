VERDICT: REFUTED

# Independent Falsification Review of Design v3 (`09-camera-design-v3.md`)

Reviewer: Independent Falsification Agent (DeepMind / Antigravity).
Review subject: `.git/phase48-run/night/09-camera-design-v3.md` (Design v3 for Scenario 7 camera evidence oracle in `tests/e2e/uc25-joint-review.js`).
Repository context at HEAD `3e632fb`.
Rules: Read-only evaluation of source and preserved artifacts; no test, build, or browser execution; cite every claim with `file:line`.

---

## Executive Summary

Design v3 achieves a brilliant and mathematically rigorous breakthrough in §§1–3:
1. It correctly discovers that an `OrbitControls` azimuth change is an orbit about `controls.target` (a projection fixed point) rather than a pan about the optical center, proving that the horizontal translation model in v2 was physically false and explaining why `bestShift.k = 0` and `sadAtK ≡ sadAt0` were observed across all 32 probe pairs.
2. It correctly proves that no pixel-only statistic admits a derived lower bound from camera constants alone without unprincipled assumptions on scene spatial gradients.
3. It correctly refutes the two-arm ratio test, identifying among other flaws the severe pointer-driven rebar highlight confound (`Viewer3D.tsx:2097-2118`).

**However, Design v3 is REFUTED because its central recommendation — Option 1a (reading `viewerPose` under `next dev` with no `src/` changes) — is architecturally flawed and will fail 100% of the time in execution:**
- **`viewerPose` in `useAppStore` is an event-driven snapshot written ONLY on controls `'end'` and tween completion (`Viewer3D.tsx:2044`, `:2154`). It does NOT update during continuous rendering, auto-rotation, or damping.** Consequently, `poseBefore` read at the start of Arm C is stale by seconds (in Scenario 7) or minutes (in Scenario 14), causing Gate G4 (`CONTROL_MOVED`) to evaluate multi-second or multi-minute auto-rotation against an $N_C$ of 1–2 frames, failing immediately.
- **The frame timestamp ring buffer (`Viewer3D.tsx:2008`, `:2162-2163`) saturates at 300 entries after ~88 seconds.** By Scenario 7 (which starts at $t \approx 146.4$ s), `length === 300`. v3's proposed assertion `assert length < 300` (uncertainty V3, line 667) will immediately abort the run.
- **Switching `uc25` to `next dev` silently strips production-build E2E coverage from all 18 other scenarios** and introduces the severe `.next` chunk corruption hazard documented in `tests/e2e/README.md:108-111`.

Option 1a is fundamentally unsound. The only robust path forward is **Option 1b** (adding a live camera pose accessor directly to `__kijunViewerRuntime` in `Viewer3D.tsx`), which repairs all blockers while preserving the derived radian physics and keeping `uc25` on the production build.

---

## Evaluation of v3's Central Claims

### 1. The Projection Re-Derivation (§1) — CONFIRMED
- **OrbitControls fixed point**: In `node_modules/three/examples/jsm/controls/OrbitControls.js:690-788`, camera motion rotates `position` around `this.target` while maintaining `this.object.lookAt(this.target)`. Under perspective projection with camera frame looking along $-Z$, the target coordinates in camera space are $(0, 0, -r)$, projecting to $(0, 0)$ (the principal point). Because the target is on the rotation axis and the camera continuously re-aims at it, the target's image coordinates are invariant under azimuth rotation. The fixed-point claim is **mathematically exact**.
- **First-order flow field equations (1) and (2)**: v3 derives $\Delta x = \alpha [ f\sin\phi(r/D - 1) - y\cos\phi - (x^2/f)\sin\phi ]$ and $\Delta y = \alpha [ x\cos\phi - (xy/f)\sin\phi ]$. This derivation is completely verified. Setting $D = r$ and $x = y = 0$ yields $\Delta x = \Delta y = 0$.
- **Absence of $f\alpha$ translation**: In a camera panning about its own optical center, $\Delta x \approx f\alpha$ uniformly across all depths. In an orbit about the target, the uniform term is $f\sin\phi(r/D - 1)$, which vanishes identically at the joint target depth ($D = r$) and reverses sign across it. v2's assumption of a 17–20 px translation was based entirely on importing a camera-yaw pan formula into an orbit controller.
- **Explanation of probe observations**: Over the pinned ROI ($169 \times 45$ at $(338, 67)$ device px, centered horizontally within $0.59$ px of the optical axis; `Viewer3D.tsx:92`, `:106`, `src/lib/viewer/geometry.ts:69`, `:71`), the commanded mean translation is $\le 0.85$ px and ambient is $\le 0.012$ px. Because both are strictly sub-pixel ($< 1$ px), an integer column profile shift search (`bestShift`) can only ever return $k = 0$. This fully and correctly explains why `bestShift.k = 0` and `sadAtK ≡ sadAt0` occurred in all 32 probe pairs in `.git/phase48-run/night/08-u1u2-result.md`.

### 2. The Impossibility Claim (§2) — CONFIRMED
- **Mathematical asymmetry**: As v3 §2.3 states, for small displacements $|\Delta| \lesssim 1$ px, $|I_{n+1} - I_n| \le \|\nabla I\|_\infty \|\Delta\|$. This Lipschitz upper bound can be bounded within a frame. However, a lower bound ("large camera motion implies large pixel change") requires a strictly positive lower bound on the projection of the spatial gradient $\nabla I$ along the displacement field.
- **Scene-dependency**: If an ROI contains uniform patches, horizontal bands (where $\partial I / \partial x = 0$), or periodic textures matching the displacement (such as the rebar array with pitch 100 mm; `tests/e2e/README.md: C1 帯筋 ピッチ 100`), the photometric change can be arbitrarily close to zero despite large camera motion.
- **Candidate closure (§2.4)**: All six candidate photometric statistics (`bestShift`, parabolic sub-pixel shift, polynomial warp fitting, normalized SAD / diff-fraction, gradient-normalized residual $R/G$, and rotational cross-correlation) were examined. None can establish a derived lower bound from `AUTO_ROTATE_SPEED`, `CONTROLS_DAMPING`, `CAMERA_FOV_DEGREES`, and canvas dimensions alone. v3's impossibility claim is sound.

### 3. The Ratio Test Rejection (§3) — CONFIRMED
v3 rejects requiring $S_{\text{drag}} / S_{\text{control}} \ge \rho$ on four grounds, all of which are verified:
- **(a) Scale straddling**: Ambient displacement spread ($\le 0.030$ px) and commanded displacement spread ($\approx 2.16$ px) straddle the 1 px raster sampling scale, violating first-order homogeneity.
- **(b) Ray-pick highlight confound (`Viewer3D.tsx:2097-2118`, `:2263-2266`, `:910-926`)**: In the drag arm, pointerup dispatches a DOM `click` at $P_1$. `handleClick` calls `pickVisible`. If a rebar mesh is hit, it invokes `setHoverRowRef.current(rowId)`, which triggers the React effect calling `applyHighlight(runtime, hoverRowId)`. This replaces the rebar mesh material with `highlightMaterial` (`HIGHLIGHT_COLOR = 0xf54e00`, bright orange, line 94) across the entire picked rebar. This massive scene change occurs independently of whether the camera moved, completely invalidating photometric differential tests.
- **(c) Degenerate zero control**: In `tests/e2e/uc25-joint-review.js:538-554`, if two reads straddle a dropped frame or unrendered interval, $S_{\text{control}} = 0$, leading to $S_{\text{drag}} / 0 = \infty \ge \rho$ (unconditional false accept). Guarding this requires an arbitrary, fitted floor on $S_{\text{control}}$.
- **(d) Non-monotonicity**: Verified via SAD saturation and spatial periodicity of rebar placement.

### 4. Option 1a and Radian Bounds (§4, §5, §6) — REFUTED
While the radian mechanics of OrbitControls damping ($8\delta - s_8 = 0.336883$ rad, $s_8 = 0.785116$ rad, $A = 8.72665 \times 10^{-4}$ rad) are mathematically correct, **Option 1a is fundamentally flawed**:
- `viewerPose` in `useAppStore` does not provide live camera pose; it is a stale snapshot from previous user gestures.
- The frame timestamp buffer saturates at 300 entries, invalidating v3's frame-count assumptions and causing V3's proposed assertion to fail.
- Moving `uc25` to `next dev` strips production-build guarantees from 18 other scenarios and creates build-cache pollution hazards.
*(Detailed in Findings 1, 2, and 3 below).*

### 5. Assertion Preservation and Scope (§5) — CONFIRMED (subject to fixing Findings 1 & 2)
- Scenario 7's core assertions (`checkId === checkId1`, `findings === findings1`, verdict identity, and ReviewPane remount check; `uc25-joint-review.js:1112-1135`) are preserved verbatim.
- Scenario 14 assertions (`uc25-joint-review.js:1341-1345`) are preserved verbatim.
- `cameraMoved` in the working tree (`uc25-joint-review.js:785`) was hard-coded to literal `true`. Making it computed from gates G1–G10 restores a lost contract gate rather than weakening it.
- Deleting `runCaptureWindow` and `BASELINE_NOT_QUIESCENT` is a correction of an unreachable physical premise (stillness in a continuous animation system), not an assertion cut.
- C5's frame-to-frame diff (`diffFractionVsPrev ≥ MOTION_MIN_DIFF_FRACTION`) tests single-frame displacement rather than accumulated displacement from a stale baseline, which is mathematically stricter.

### 6. Freedom from Fitted Constants — CONFIRMED
Every angle and frame constant in §5.3 is derived from named constants (`AUTO_ROTATE_SPEED = 0.5`, `CONTROLS_DAMPING = 0.08`, `CAMERA_FOV_DEGREES = 38`, `DRAG_DX_CSS = -40`, `MOVE_STEPS = 8`). No numbers were fitted from probe observations.

---

## Numbered Findings

### Finding 1 [BLOCKER]: `viewerPose` in `useAppStore` is an event-driven snapshot, not a live camera pose; Option 1a causes G4 (`CONTROL_MOVED`) to fail in Scenario 7 and Scenario 14.

- **Severity**: BLOCKER
- **Location**: `src/lib/store.ts:40`, `:107`, `:147-149`; `src/components/viewer/Viewer3D.tsx:2024-2044`, `:2153-2155`; `09-camera-design-v3.md:44-48`, `:480`, `:503`, `:581-584`.
- **Evidence**:
  In `src/components/viewer/Viewer3D.tsx`:
  ```typescript
  2024: const captureViewerPose = () => {
  2025:   setViewerPoseRef.current({
  2026:     position: [camera.position.x / MILLIMETRES_TO_SCENE, ...],
  2027:     target: [controls.target.x / MILLIMETRES_TO_SCENE, ...],
  2028:   })
  2029: }
  ...
  2044: controls.addEventListener('end', captureViewerPose)
  ...
  2153: if (progress >= 1) {
  2154:   runtime.cameraTween = null
  2155:   captureViewerPose()
  2156: }
  ```
  `captureViewerPose` is hooked **only** to OrbitControls `'end'` (line 2044) and camera tween completion (line 2154).
  In the animation frame loop (`Viewer3D.tsx:2133-2165`):
  ```typescript
  2157: controls.autoRotate =
  2158:   runtime.cameraTween === null &&
  2159:   performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS
  2160: controls.update()
  2161: renderer.render(scene, camera)
  ```
  `controls.update()` rotates the camera continuously during auto-rotation and damping, but `captureViewerPose()` is **never called** during `renderFrame`.
  Consequently, `useAppStore.getState().viewerPose` is **completely frozen** between user interactions.

  Now consider Option 1a's execution in `perturbViewer`:
  1. In **Scenario 7**: Scenario 6 completes with a focus tween, which calls `captureViewerPose()`. Then preflight, clip block, and screenshot capture execute (`uc25:663-692`), taking several seconds. During this time, auto-rotate spins the camera in Three.js, but `viewerPose` in `__kijunStore` remains frozen at the post-tween pose.
  2. When Arm C starts (§4.2, §5.2 C7), it reads `poseBefore = window.__kijunStore.getState().viewerPose` (the stale post-tween pose from seconds ago).
  3. Arm C dispatches `move/down/up` at $P_1$. On `pointerup`, OrbitControls fires `'end'` (`OrbitControls.js:1612`), calling `captureViewerPose()` and updating `viewerPose` to the current live camera position.
  4. Arm C reads `poseAfter = window.__kijunStore.getState().viewerPose`.
  5. The measured delta $|\Delta \theta_C|$ reflects the camera rotation accumulated across the entire preflight duration (several seconds $\approx 10\text{–}20 \cdot A$).
  6. However, $N_C$ is measured only across Arm C (1–2 frames).
  7. Gate G4 (`CONTROL_MOVED: |Δθ_C| ≤ N_C · A`, line 503) evaluates $15 A \le 2 A$, which **fails immediately**.
  8. In **Scenario 14**: Scenarios 8 through 13 run between Scenario 7 and Scenario 14 without touching the 3D viewer. Auto-rotate runs for 30–60+ seconds. When Scenario 14 runs `perturbViewer`, Arm C's `poseBefore` is the pose from Scenario 7! The click in Arm C updates `viewerPose` to current time. $|\Delta \theta_C|$ is tens of radians, while $N_C \approx 2$. Gate G4 fails 100% of the time.
- **Minimal change that fixes it**:
  Do not read `viewerPose` from `__kijunStore`. Instead, expose a live camera pose accessor directly on `__kijunViewerRuntime`:
  ```typescript
  // Viewer3D.tsx:2010
  getCameraPose: () => ({
    position: [camera.position.x / MILLIMETRES_TO_SCENE, camera.position.y / MILLIMETRES_TO_SCENE, camera.position.z / MILLIMETRES_TO_SCENE],
    target: [controls.target.x / MILLIMETRES_TO_SCENE, controls.target.y / MILLIMETRES_TO_SCENE, controls.target.z / MILLIMETRES_TO_SCENE],
  }),
  ```
  This queries the Three.js camera and controls objects directly at the exact instant `poseBefore` and `poseAfter` are requested, completely eliminating staleness. (This is Option 1b).

---

### Finding 2 [BLOCKER]: The frame timestamp ring buffer saturates at 300 entries; v3's proposed assertion `assert length < 300` will fail immediately at Scenario 7.

- **Severity**: BLOCKER
- **Location**: `src/components/viewer/Viewer3D.tsx:2008`, `:2162-2163`; `09-camera-design-v3.md:481`, `:667`.
- **Evidence**:
  In `src/components/viewer/Viewer3D.tsx`:
  ```typescript
  2008: const frameTimestamps: number[] = []
  ...
  2162: frameTimestamps.push(performance.now())
  2163: if (frameTimestamps.length > 300) frameTimestamps.shift()
  ```
  `frameTimestamps` is an array that shifts when its length exceeds 300.
  At the measured render rate of ~3.4 fps, 300 frames take $300 / 3.4 \approx 88.2$ seconds.
  As measured in v3 §4.3 (line 434):
  `146.4 s elapses between the page.reload at uc25:793 and the first captured Scenario-7 frame`.
  Therefore, by the time Scenario 7 is reached, `frameTimestamps.length` is **already 300** and remains at 300 indefinitely.

  In v3 §7 line 667 (Uncertainty V3), v3 states:
  > `Mitigated in design: G3 refuses at N >= 193, well below 300. Assert length < 300 and name it.`

  If the test asserts `length < 300`, **it will throw and fail on the first run of Scenario 7**.
  Furthermore, if C3 (`readFrameCount`, line 481) calculates $N$ from `.length` delta, it sees $\Delta \text{length} = 300 - 300 = 0$, leading to $N = 0$ and $N \cdot A = 0$, causing G4 to fail on any nonzero ambient drift.
- **Minimal change that fixes it**:
  Do not check or rely on `frameTimestamps.length`. Instead, `getFrameTimestamps()` must return the timestamps array, and the test must measure $N$ by filtering timestamps that fall within the arm's wall-clock interval $[t_{\text{start}}, t_{\text{end}}]$:
  ```javascript
  const nFrames = timestamps.filter(t => t >= tStart && t <= tEnd).length;
  ```
  Because an arm takes 1–3 seconds ($< 15$ frames), all frames spanned by the arm are guaranteed to be present within the 300-entry ring buffer (~88s history). Ensure the test asserts that $t_{\text{start}} \ge \text{timestamps}[0]$ (verifying the window did not drop off the back of the ring buffer).

---

### Finding 3 [MAJOR]: Switching `uc25` to `next dev` violates the production E2E testing contract and introduces `.next` chunk corruption hazards.

- **Severity**: MAJOR
- **Location**: `tests/e2e/README.md:95-117`; `09-camera-design-v3.md:580`, `:600-607`.
- **Evidence**:
  1. `tests/e2e/README.md:95-99` explicitly documents:
     > `### uc17만 next dev가 필요하다`
     > `계측 훅 __kijunViewerRuntime·__kijunStore는 process.env.NODE_ENV !== 'production'에서만 노출된다 ... 나머지 시나리오는 next start(프로덕션 빌드)로 돌린다.`
  2. `uc17` is an internal stress/telemetry script (`tests/e2e/uc17-stress-building.js`) designed to inspect internal Three.js counters (`triangles`, `calls`, `rebuildStats`).
  3. In contrast, `uc25` is the primary end-to-end user journey test for Phase 48, asserting 19 functional user scenarios including IndexedDB autosave/restore, Excel/JSON import/export, and takeoff calculation invariants.
  4. Moving `uc25` to `next dev` removes production-build verification (minification, tree-shaking, production chunk splitting, React production mode) for all 18 other scenarios.
  5. `tests/e2e/README.md:108-111` warns:
     > `dev 서버와 next start를 같은 트리에서 동시에 띄우지 말 것. 같은 .next를 공유해 dev가 프로덕션 청크를 덮어쓰고, 그러면 지연 로드되는 청크(exceljs)만 404가 나서 uc8이 조용히 실패한다.`
  Option 1a forces this risk onto regular E2E execution simply to avoid a 6-line production accessor.

---

### Finding 4 [MAJOR]: Arm C single-interaction choreography fails to settle auto-rotate / damping residual before measurement.

- **Severity**: MAJOR
- **Location**: `src/components/viewer/Viewer3D.tsx:2040-2042`, `:2157-2159`; `09-camera-design-v3.md:421`, `:485`, `:503`.
- **Evidence**:
  In `Viewer3D.tsx`:
  - Auto-rotate activates when `performance.now() - runtime.lastInteractionAt > 8000` ms (line 2159).
  - `lastInteractionAt` is reset only on OrbitControls `'start'` event (line 2040).
  - Damping decays `_sphericalDelta` by $(1 - d)$ per frame (line 792 of `OrbitControls.js`).
  At the moment Arm C begins, auto-rotate has been running during preflight ($> 8000$ ms idle), so `_sphericalDelta.theta` carries an active auto-rotation velocity.
  v3 §5.2 C7 specifies Arm C as a single interaction:
  `runArm({from: P1, to: P1, moves: 0})` with `poseBefore` taken immediately before pointerdown.
  Between `poseBefore` and pointerdown, residual rotation is actively ticking.
  In v2 §1.3, an initial settling click was recognized as necessary to suppress auto-rotate and allow damping to decay. v3 removed the settling click, leaving Arm C exposed to residual damping from the preflight auto-rotation.
- **Minimal change that fixes it**:
  Arm C must either perform an initial settling pointerdown/up to reset `lastInteractionAt` before recording `poseBefore`, or the ambient ceiling formula in G4 must include the maximum possible damping residual: $A/d = 8.72665 \times 10^{-4} / 0.08 = 0.0109$ rad.

---

### Finding 5 [MINOR]: `azimuthOf` helper must specify coordinate signs consistent with Three.js `Spherical`.

- **Severity**: MINOR
- **Location**: `09-camera-design-v3.md:482` (`C4`).
- **Evidence**:
  v3 C4 defines `azimuthOf({position, target})` as `Math.atan2(px - tx, pz - tz)`.
  In Three.js `Spherical.setFromVector3(v)` where $v = \text{position} - \text{target}$, $\theta = \text{atan2}(v.x, v.z)$.
  This matches when world up is $+Y$.
  However, in `deltaAngle(a, b) = Math.atan2(Math.sin(b - a), Math.cos(b - a))`, the sign of `b - a` must be verified against the direction of `DRAG_DX_CSS`:
  In `OrbitControls.js:1109`, dragging left ($\Delta x < 0$) calls `_rotateLeft(negative)`, which adds to `_sphericalDelta.theta` (`_sphericalDelta.theta -= angle`), causing $\theta$ to **increase**.
  The sign convention in unit tests must explicitly assert that `deltaAngle(poseBefore, poseAfter) > 0` for a negative $dx$ drag.

---

## Recommendation on Options 1a and 1b

### Option 1a is REJECTED as Unsound.
Option 1a was recommended by v3 under the premise that `viewerPose` already exists and exposes what is needed with no `src/` changes.
As proven in **Finding 1**, this premise is false. `viewerPose` is an event snapshot updated only when OrbitControls ends a gesture or a tween finishes. It does not update during auto-rotation or damping. Reading it under Option 1a produces completely stale poses, causing G4 to fail immediately in Scenario 7 and Scenario 14. Furthermore, as shown in **Finding 2** and **Finding 3**, Option 1a breaks on ring buffer saturation and degrades the repo's production test contract.

### Option 1b is RECOMMENDED with Necessary Corrections.
Option 1b resolves every single blocker:
1. **True live pose**: Adding `getCameraPose: () => ({ position: camera.position.toArray(), target: controls.target.toArray() })` directly to `__kijunViewerRuntime` in `Viewer3D.tsx` (~6 lines) queries the live Three.js camera and controls objects at the exact millisecond `readPose()` is called. It completely fixes Finding 1.
2. **Keeps `uc25` on the production build**: Unlike `__kijunStore` (which holds full drawing and takeoff state), `getCameraPose` exposes only six numbers describing camera orientation. It contains zero domain or proprietary drawing data and complies fully with ADR-005. Installing `getCameraPose` unconditionally in `Viewer3D.tsx` allows `uc25` to run against `next start` (production), preserving full production E2E coverage for all 19 scenarios and eliminating `.next` cache pollution.
3. **Sound frame counting**: Using window filtering on `getFrameTimestamps()` within the arm interval $[t_{\text{start}}, t_{\text{end}}]$ eliminates Finding 2's ring-buffer saturation bug.
4. **All derived physics from v3 are preserved**: The derived ambient ceiling ($N \cdot A$), commanded floor ($8\delta - s_8 - N \cdot A = 0.336883 - N \cdot A$), polar invariance (G6), and target invariance (G7) remain 100% mathematically valid and derived entirely from named constants with $\ge 10\times$ margin.

**Verdict: Adopt Option 1b.**
