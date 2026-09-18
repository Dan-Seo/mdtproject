VERDICT: REFUTED

Reviewer: Independent Reviewer (Gemini 3.8 Flash High). Did not write the document and will not implement it.
Reviewed document: `.git/phase48-run/step8-camera-design.md` (Scenario 7 camera-evidence oracle repair design, commit `3e632fb`).
Target files inspected: `tests/e2e/uc25-joint-review.js`, `src/components/viewer/Viewer3D.tsx`, `src/components/viewer/Viewer3D.module.css`, `node_modules/three/examples/jsm/controls/OrbitControls.js`, `tests/e2e/README.md`, `phases/48-joint-review-ui/step8.md`, `~/.dev-browser/daemon.mjs`, `~/.dev-browser/sandbox-client.js`.

---

## Executive Summary

The design in `.git/phase48-run/step8-camera-design.md` presents a sophisticated two-channel architecture (Channel A in-frame WebGL `readPixels` + Channel B compositor screenshot corroboration) with rigorous defenses against ambient motion, buffer clearing, and unasserted canvas targets.

However, the design **must not be implemented as written** due to three **BLOCKER** defects:
1. **Flawed overlay obstruction detection**: The ROI selection mechanism uses `document.elementFromPoint(x, y)` to prove candidate ROIs are "overlay-free" (§4.2 lines 261-263). By CSSOM View specification, `elementFromPoint` ignores elements with `pointer-events: none;`. In `src/components/viewer/Viewer3D.module.css:115` and `:33`, `.legend` and `.meta` are explicitly styled with `pointer-events: none;`. As a result, candidate C1 (which overlaps `.legend`) will silently pass the check, invalidating Channel B's overlay-free invariant.
2. **Buffer object identity comparison ambiguity in no-drag controls**: In §4.7 (lines 460, 478), Channel-B screenshots are required to match `S0` exactly. `page.screenshot()` returns distinct `Buffer` (Uint8Array) instances. Literal JavaScript reference comparison (`S_control === S0` or `S1 !== S0`) will always fail no-drag controls or trivially pass drag assertions.
3. **Omission of fatal QuickJS `Buffer.from(..., "utf8")` blocker from implementation brief**: In §9.6 (Risk 6), the design identifies that `Buffer.from(JSON.stringify(value), "utf8")` at `tests/e2e/uc25-joint-review.js:320` causes an immediate exception in the installed `~/.dev-browser/daemon.mjs:6270` (`"QuickJS Buffer only supports base64 string input"`). However, §8.2 leaves this unaddressed as an "open risk". Following §8 as written guarantees that the mandatory 19-check test suite required by `phases/48-joint-review-ui/step8.md` crashes at Scenario 15.

---

## Specific Evaluation Criteria

### 1. Does it derive any expected value from observed output? (Forbidden)
**Assessment: COMPLIANT (No violation).**
- All thresholds in §8.3 (`NONBLANK_MIN_DISTINCT = 32`, `NONBLANK_MAX_MODAL_FRACTION = 0.98`, `MOTION_MIN_DIFF_FRACTION = 0.02`) are structurally derived from the physics of cleared WebGL buffers vs. rendered scenes, not fitted to the run being judged (§2 rule 3, §4.5 lines 387-398).
- Commanded displacement (`DRAG_DX_CSS = -40, DRAG_DY_CSS = -12`) is an input magnitude (~1 rad azimuth on a 223px canvas per OrbitControls math), not an observed output.
- ROI candidate bounds and endpoints are fixed fractions of layout.

### 2. Does it weaken/delete/bypass any existing assertion?
**Assessment: COMPLIANT (No weakening).**
- Scenario 7 assertions at `tests/e2e/uc25-joint-review.js:766-780` are preserved verbatim (§6.1). Both camera-change AND check-result invariance (`checkId === checkId1 && findings === findings1 && JSON.stringify(verdicts) === JSON.stringify(verdicts1)`) remain mandatory.
- Remount assertion at `uc25-joint-review.js:760-765` is preserved.
- The 19-check contract at `uc25-joint-review.js:1252-1254` is strictly preserved.
- §7.1 adds a new liveness assertion for low clearance basis. §7.2 drops only a redundant parse on the unasserted 700-row table while retaining strict parsing at `readFindingSnapshot` (`:242-246`).

### 3. Does it require src/product/rulepack/fixture changes?
**Assessment: COMPLIANT (No violation).**
- The design strictly confines all modifications to `tests/e2e/uc25-joint-review.js`, `tests/e2e/README.md`, and report artifacts (§8.4).
- It explicitly rejects adding `preserveDrawingBuffer: true` to `src/components/viewer/Viewer3D.tsx:1949` (§3).

### 4. Can its oracle PASS when the camera did NOT move?
**Assessment: COMPLIANT (Cannot false-pass).**
- **Auto-rotate**: `WINDOW_BUDGET_MS = 6000` is strictly less than `AUTO_ROTATE_DELAY_MS = 8000` (`Viewer3D.tsx:105`). Every window begins with a `pointerdown`, triggering OrbitControls `'start'` (`OrbitControls.js:1729`) and resetting `runtime.lastInteractionAt = performance.now()` (`Viewer3D.tsx:2042`). Even if auto-rotate engaged, baseline/control windows would differ, causing `BASELINE_NOT_QUIESCENT` or `CONTROL_MOVED` (rejection, not false-pass).
- **Damping**: No drag occurs prior to the control windows; zero-movement clicks generate 0 `_sphericalDelta`. Post-drag damping decays naturally and is compatible with the after-window's persistence requirement (`AFTER_FRAMES = 3`, all `!== H0`).
- **rAF throttling**: Headless ~1 Hz throttling (`tests/e2e/README.md:104-107`) is accommodated by counting rAF callbacks rather than polling wall-clock time.
- **Blank/cleared buffers**: The non-blank gate (`zeroAlphaFraction === 0`, `distinctColors >= 32`, `modalFraction <= 0.98`) runs on every frame of every window. A cleared buffer has `zeroAlphaFraction = 1` and fails with `BLANK_FRAME`.
- **Wrong canvas**: Canvas identity is pinned by single-branch selector with no fallback (`canvas[aria-label='接合部の配筋3D']`); pointer events assert `targetIsPinned === true`.
- **Undelivered pointer**: Dispatched CDP mouse events are verified via passive capture-phase listeners for `isTrusted === true`, `targetIsPinned === true`, coordinates within 1px, and move counts.

### 5. Spot-check of file:line citations
**Assessment: 12 citations spot-checked; 1 wrong file name, 4 slight line-range discrepancies.**
- `Viewer3D.tsx:1949` — `const renderer = new THREE.WebGLRenderer({ antialias: true })` (Exact match, line 1949)
- `package.json:31` — `"three": "^0.185.1"` (Exact match, line 31)
- `Viewer3D.tsx:1970-1972` — `controls.enableDamping = true`, `dampingFactor = CONTROLS_DAMPING`, `autoRotateSpeed = AUTO_ROTATE_SPEED` (Exact match, lines 1970-1972)
- `src/lib/review/geometry-check.ts:120` — `NOT_ENOUGH = '判断不可（あき基準未入力）'` (Exact match, line 120)
- `src/lib/review/geometry-check.ts:255-261` — `verdictFor` clearance verdict logic (Exact match, lines 255-261)
- `src/components/review/ReviewPane.tsx:306` — `<p data-testid="review-verdict" data-review-verdict="clearance">` (Exact match, line 306)
- `tests/e2e/uc25-joint-review.js:766-780` — Scenario 7 assertion block (Exact match, lines 766-780)
- `node_modules/three/examples/jsm/controls/OrbitControls.js:1729` — `this.dispatchEvent( _startEvent )` (Exact match, line 1729)
- `node_modules/three/examples/jsm/controls/OrbitControls.js:1612` — `this.dispatchEvent( _endEvent )` (Exact match, line 1612)
- `daemon.bundle.mjs:6246` and `:6265-6272` — **WRONG FILE NAME**. File on disk is `~/.dev-browser/daemon.mjs`.
- `OrbitControls.js:923-931` — Span discrepancy (actual function spans lines 923-935).
- `Viewer3D.tsx:883-905` — Span discrepancy (actual function spans lines 880-908).
- `Viewer3D.tsx:2274-2287` — Span discrepancy (actual effect spans lines 2274-2288).
- `tests/e2e/uc25-joint-review.js:348-375` — Span discrepancy (actual function spans lines 348-377).

### 6. Availability of claimed dev-browser API surface
**Assessment: Available in Playwright 1.58.2, but implementation details require correction.**
- In-frame `gl.readPixels` inside rAF callback is supported by WebGL in Chromium.
- `page.screenshot({ clip, scale: 'css', type: 'png' })` is supported in installed `playwright-core 1.58.2` (`screenshotter.js:264`, `crPage.js:216`).
- CDP mouse input via `page.mouse.move`, `.down()`, `.up()` generates trusted events (`isTrusted: true`).
- However, `document.elementFromPoint` cannot be used to prove overlay obstruction due to `pointer-events: none;`.

---

## Numbered Findings

### Finding 1 — BLOCKER: `document.elementFromPoint` is blind to `pointer-events: none` overlays (`.legend` and `.meta`), causing false overlay-free certification
- **Evidence**:
  - `step8-camera-design.md:261-263`:
    ```
    2. Obstruction grid check: sample a 5×5 grid plus the 4 corners, inset 1 px.
       Every sampled point must satisfy document.elementFromPoint(x, y) === window.__uc25Cam.canvas.
    ```
  - `src/components/viewer/Viewer3D.module.css:104-119`:
    ```css
    .legend {
      position: absolute;
      bottom: var(--space-xs);
      left: var(--space-xs);
      z-index: 2;
      ...
      pointer-events: none;
    }
    ```
  - `src/components/viewer/Viewer3D.module.css:23-36`:
    ```css
    .meta {
      ...
      pointer-events: none;
    }
    ```
  - W3C CSSOM View specification: `document.elementFromPoint(x, y)` ignores any element where computed `pointer-events` is `none`, returning the first element beneath it that participates in hit-testing (here, the `<canvas>`).
  - Candidate C1 (`x 0.30..0.70, y 0.45..0.85`, lines 252-255) on a 223px-tall canvas spans from y=100.7px to y=190.2px (within 33.6px of the bottom edge). The `.legend` overlay in the joint review contains multiple chips (`Viewer3D.tsx:2409-2448`) and spans 50-80px in height, overlapping the lower bounds of candidate C1.
  - Because `elementFromPoint` ignores `.legend`, `selectRoi` will falsely conclude candidate C1 is unobstructed. Channel B screenshots will capture `.legend` DOM pixels, directly violating the design requirement that Channel B ROI must be "proven overlay-free" (§4.0 line 213, §1.4 line 147-148).
- **Minimal Change to Fix**:
  In `selectRoi`, replace the `elementFromPoint` check with:
  1. Use `document.elementsFromPoint(x, y)` (plural), which returns all DOM elements at the given coordinates regardless of `pointer-events`. Assert that no returned element is inside `.viewer` other than the `<canvas>`, OR
  2. Perform an explicit bounding-box intersection check between candidate rects and the bounding client rects of `.meta`, `.legend`, `.clipControls`, and `.tooltip`.
  3. Reorder candidate evaluation order to test candidate C2 (`x 0.35..0.65, y 0.25..0.60`, centre band) first, as C2 lies comfortably between top `.meta` (~32px) and bottom `.legend` (~60px).

---

### Finding 2 — BLOCKER: In-memory Buffer reference comparison in no-drag and drag screenshot gates
- **Evidence**:
  - `step8-camera-design.md:460`: `Take a Channel-B screenshot; its bytes must equal S0 exactly. Any inequality → CONTROL_MOVED`
  - `step8-camera-design.md:478`: `S1 !== S0 bytewise, and S1.length > 1024 (CHANNEL_DISAGREEMENT ... otherwise)`
  - `~/.dev-browser/sandbox-client.js:11483` returns `result.binary`, which is an instance of `Buffer` (inheriting from `Uint8Array`).
  - In JavaScript, `screenshot === S0` or `screenshot !== S0` performs reference identity comparison. Two consecutive `page.screenshot()` calls produce distinct Buffer instances in memory (`bufA === bufB` is `false`).
  - If implemented literally as `s !== S0` in Step 2/3, `CONTROL_MOVED` will unconditionally throw even when the image is byte-identical. Conversely, `S1 !== S0` in Step 4 would trivially pass without checking byte differences.
- **Minimal Change to Fix**:
  In `tests/e2e/uc25-joint-review.js`, implement `captureScreenshotRoi` to compute an FNV-1a hash over the returned Buffer bytes (or compare `Buffer.compare(bufA, bufB) === 0` / buffer element equality). All comparison gates must compare `s.hash === s0.hash` and `s1.hash !== s0.hash`.

---

### Finding 3 — BLOCKER: Omission of fatal `Buffer.from(..., "utf8")` repair from normative implementation brief (§8.2)
- **Evidence**:
  - `step8-camera-design.md:802-814` (§9.6):
    ```markdown
    uc25-joint-review.js:316-323 (loadJsonObject) calls Buffer.from(JSON.stringify(value), "utf8").
    In the installed dev-browser 0.2.9 QuickJS runtime, Buffer.from(string, enc) throws
    "QuickJS Buffer only supports base64 string input" for any enc !== "base64" (daemon.bundle.mjs:6265-6272)...
    Scenarios 15/17/18 will throw as soon as the camera gate is fixed.
    ```
  - `~/.dev-browser/daemon.mjs:6268-6272`:
    ```javascript
    if (typeof value === "string") {
      if (encodingOrOffset !== undefined && encodingOrOffset !== "base64") {
        throw new Error("QuickJS Buffer only supports base64 string input");
      }
      return new Buffer(__decodeBase64(value));
    }
    ```
  - `tests/e2e/uc25-joint-review.js:320`:
    ```javascript
    buffer: Buffer.from(JSON.stringify(value), "utf8"),
    ```
  - `phases/48-joint-review-ui/step8.md:41-43`: Acceptance Criteria requires all 19 checks in `uc25-joint-review.js` to pass.
  - In §8.2, the design omits the repair for `uc25-joint-review.js:320`, leaving it as an uncommitted optional decision in §8.5/§9.6 ("decide separately").
  - An implementer strictly adhering to §8.1-§8.4 will leave line 320 untouched. The test run will fail at Scenario 15, preventing Step 8 completion.
- **Minimal Change to Fix**:
  Include the repair of `tests/e2e/uc25-joint-review.js:320` in §8.2: convert JSON to base64 via `page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify(value)))))` (or standard UTF-8 base64 encoding helper) and pass `Buffer.from(b64, "base64")`.

---

### Finding 4 — MAJOR: Nonexistent file name cited for dev-browser daemon
- **Evidence**:
  - `step8-camera-design.md:449`: cites `daemon.bundle.mjs:6246`
  - `step8-camera-design.md:806`: cites `daemon.bundle.mjs:6265-6272`
  - Inspection of `/home/jetsonseo/.dev-browser/`:
    `daemon.mjs` exists (size 220,677 bytes). `daemon.bundle.mjs` does not exist.
  - Line numbers in the citation (6246 for Buffer definition, 6268-6272 for base64 check) match `daemon.mjs` exactly. The filename prefix was mistakenly given as `daemon.bundle.mjs`.

---

### Finding 5 — MAJOR: Citation span discrepancies across product and test files
- **Evidence**:
  - `step8-camera-design.md:82` cites `OrbitControls.js:923-931` (`_getAutoRotationAngle`). The function actually spans lines 923-935 in `node_modules/three/examples/jsm/controls/OrbitControls.js`.
  - `step8-camera-design.md:92` cites `Viewer3D.tsx:883-905` (`startCameraTween`). The function definition actually begins at line 880 and ends at line 908 in `src/components/viewer/Viewer3D.tsx`.
  - `step8-camera-design.md:110` cites `Viewer3D.tsx:2274-2287`. The `useEffect` setting `aria-label` actually spans lines 2274-2288.
  - `step8-camera-design.md:102` cites `tests/e2e/uc25-joint-review.js:348-375`. `waitForStableCanvasFrame` actually spans lines 348-377.

---

### Finding 6 — MINOR: Ambiguous `distinctColors` type specification in `Frame` object
- **Evidence**:
  - `step8-camera-design.md:370`: `distinctColors, // Set of packed RGBA, counted up to a cap of 4096`
  - `step8-camera-design.md:380`: `distinctColors >= 32`
  - `Frame` is returned from `page.evaluate()` across the CDP boundary. In JavaScript, `JSON.stringify(new Set())` serializes to `{}`. If an implementation populates `distinctColors` as a `Set` instance rather than an integer count, `frame.distinctColors >= 32` evaluates to `false` in the Node/QuickJS runner.
  - The implementer must ensure `distinctColors` is an integer (`set.size` or numeric counter).

---

### Finding 7 — MINOR: Scope creep in §7.2 (`parseFindingRows` removal at Scenario 4)
- **Evidence**:
  - `step8-camera-design.md:658-679` (§7.2) targets `tests/e2e/uc25-joint-review.js:643`, removing `parseFindingRows` from the null-basis table.
  - While line 643's output is only used for `observations.initialFindingRowCount` and `parseFindingRows` is still tested on lines 243-246, this edit is unrelated to the Scenario 7 camera evidence defect.
  - The implementer must be aware that this modification touches Scenario 4 observations rather than Scenario 7 or 14.

---

## Instructions for Implementer

When implementing the Step 8 repair based on `step8-camera-design.md`, the implementer must:
1. **Honour BLOCKER 1**: Do NOT rely on `elementFromPoint` alone for `selectRoi`. Use `document.elementsFromPoint(x, y)` or explicit bounding-box intersection checks against `.legend`, `.meta`, `.clipControls`, and `.tooltip`. Prioritize Candidate C2 (`y: 0.25..0.60`).
2. **Honour BLOCKER 2**: Compare Channel B screenshots using FNV-1a byte hashes (`s.hash === s0.hash` for controls, `s1.hash !== s0.hash` for drag) rather than reference identity.
3. **Honour BLOCKER 3**: Include the `tests/e2e/uc25-joint-review.js:320` fix in `loadJsonObject` (convert UTF-8 string to base64 in-page, pass `Buffer.from(b64, "base64")`) so Scenarios 15/17/18 do not crash in dev-browser.
4. **Honour MINOR 1**: Ensure `distinctColors` in the `Frame` object is an integer count (`size`), not a `Set`.
