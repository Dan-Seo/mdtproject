VERDICT: NOT_REFUTED

Reviewer: independent agent (not the design author, will not implement).
Reviewed: `.git/phase48-run/step8-camera-design.md` at HEAD `3e632fb`.
Method: read every cited source file at the line numbers claimed; verified the dev-browser sandbox API surface against the installed `~/.dev-browser/` runtime; checked every criterion in the brief.

---

## 1. Does it derive any expected value from observed output? (forbidden)

**Finding 1 — MINOR: No violation found.**

The design explicitly forbids it (§2 rule 3, §4.2 anti-fitting boundary). ROI selection uses `elementFromPoint` (layout), not pixel content. Thresholds (`NONBLANK_MIN_DISTINCT = 32`, `NONBLANK_MAX_MODAL_FRACTION = 0.98`, `MOTION_MIN_DIFF_FRACTION = 0.02`) are derived from structural arguments about cleared buffers vs. rendered scenes, not from observed values of the run being judged. The design cites observed pixel-analysis numbers (7,677 distinct colours, ~99% diff fraction) only "for scale only" and explicitly says the thresholds sit orders of magnitude from them.

No violation of the anti-fitting rule was found.

---

## 2. Does it weaken/delete/bypass any existing assertion?

**Finding 2 — MINOR: No weakening found.**

- Scenario 7 assertions at [`uc25-joint-review.js:766-780`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L766-L780) are explicitly preserved verbatim (§6.1). Verified: the design does not alter `checkId === checkId1`, `findings === findings1`, or `JSON.stringify(verdicts)`.
- The `cameraMoved` requirement is strictly **strengthened** (§6.2 table): element identity pinned, non-blank gate on every frame, two no-drag controls, trusted pointer delivery asserted.
- The 19-check throw at [`:1252`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L1252) is not touched.
- §7.1 (low-arm liveness) adds a new assertion; §7.2 removes a redundant 700-row parse but keeps `parseFindingRows` load-bearing at the two places that consume its output ([`:243-246`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L243-L246) via `readFindingSnapshot`).

No existing assertion is weakened, deleted, or bypassed.

---

## 3. Does it require src/product/rulepack/fixture changes?

**Finding 3 — MINOR: No violation found.**

The design explicitly prohibits `src/**` changes (§3, §8.4) and confines itself to `tests/e2e/uc25-joint-review.js`, `tests/e2e/README.md`, and report artifacts. It specifically rejects `preserveDrawingBuffer: true` as a forbidden product change (§3). [`step8.md` 금지사항](file:///home/jetsonseo/projects/mdtproject/phases/48-joint-review-ui/step8.md#L49-L53): "컴포넌트 코드를 고치지 마라(e2e 스텝)." — compatible.

---

## 4. Can its oracle PASS when the camera did NOT move?

This is the central question. I attempted to construct a scenario for each mechanism:

**Finding 4 — MINOR: Auto-rotate cannot cause a false pass.**

The design's `WINDOW_BUDGET_MS = 6000 < AUTO_ROTATE_DELAY_MS = 8000` ([`Viewer3D.tsx:105`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx#L105)), combined with the pointer-down opening each window, means auto-rotate cannot engage during a capture window. Verified: `controls.autoRotate` is set at [`Viewer3D.tsx:2157-2159`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx#L2157-L2159), gated on `performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS`. The `'start'` listener at [`:2040-2042`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx#L2040-L2042) resets `lastInteractionAt`. The listener is dispatched on pointer-down at [`OrbitControls.js:1729`](file:///home/jetsonseo/projects/mdtproject/node_modules/three/examples/jsm/controls/OrbitControls.js#L1729). If a window exceeds budget, the re-arm mechanism fires a zero-movement pointer-down, which is provably inert (no `_sphericalDelta` generated — rotate deltas come from pointer *move* in OrbitControls).

Even if auto-rotate did engage, it would cause consecutive frames to differ in the baseline/control windows, triggering `BASELINE_NOT_QUIESCENT` or `CONTROL_MOVED`, **not** a false pass.

**Finding 5 — MINOR: Damping cannot cause a false pass.**

Post-drag damping (`0.92^n` per frame, [`OrbitControls.js:792-793`](file:///home/jetsonseo/projects/mdtproject/node_modules/three/examples/jsm/controls/OrbitControls.js#L792-L793)) is only present after a real drag with movement. Before the drag, the only interactions are zero-movement pointer-downs, which produce no `_sphericalDelta`. After the drag, the after-window demands only **persistence** (every after-frame ≠ baseline), not stability. Damping drift after a drag is compatible with persistence: it makes successive frames differ from baseline, which passes the gate. A damping residual in the **control** windows would fail the bit-identity requirement, but since no prior drag has occurred before the controls, there is no residual.

**Finding 6 — MINOR: rAF throttling cannot cause a false pass.**

Under ~1 Hz headless rAF ([`README.md:104-107`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/README.md#L104-L107)), the design's capture windows are frame-counted (3 consecutive rAF callbacks), not wall-clock-polled. Two consecutive rAF callbacks are two consecutive rendered frames regardless of the rAF rate. The old `waitForStableCanvasFrame` polled every 120 ms and was vacuous under 1 Hz — the replacement eliminates this.

**Finding 7 — MINOR: Blank/cleared buffer cannot cause a false pass.**

Every captured frame is individually non-blank-gated (§4.5): `zeroAlphaFraction === 0`, `distinctColors >= 32`, `modalFraction <= 0.98`. A cleared buffer (`alpha:true, premultipliedAlpha:true`) has `zeroAlphaFraction = 1` and fails. Verified: the scene uses an opaque background ([`Viewer3D.tsx:1941`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx#L1941), `scene.background = new THREE.Color(BACKGROUND_COLOR)`), so a rendered frame has no `A === 0` pixels. The gate runs on **every** frame of every window. The rAF ordering assumption is explicitly gated: if wrong, the read returns blank and `BLANK_FRAME` fires.

**Finding 8 — MINOR: Wrong canvas cannot cause a false pass.**

The fallback selector `"canvas[aria-label='接合部の配筋3D'], canvas"` at [`uc25-joint-review.js:329`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L329) is being removed (§8.1). The replacement uses a single-branch selector with no fallback (§4.1) and pins by node identity. Mismatch → `JOINT_CANVAS_NOT_FOUND`. The pointer hit-target is asserted against the pinned node (`targetIsPinned`).

**Finding 9 — MINOR: Undelivered pointer cannot cause a false pass.**

Pointer delivery is asserted via capture-phase listeners (§4.4): `isTrusted`, `targetIsPinned`, and endpoint coordinates within 1 px. Failure → `POINTER_NOT_DELIVERED`. The existing test has no such assertion.

**Finding 10 — MINOR: Click-induced highlight cannot cause a false pass.**

No-drag controls at both `P0` and `P1` (§4.7 steps 2-3) test for pixel change after a click at each endpoint. If a click triggers `setHoverRowRef` via the ray-pick handler at [`Viewer3D.tsx:2097-2108`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx#L2097-L2108) and changes pixels, `CONTROL_MOVED` fires.

**Conclusion for criterion 4:** I could not construct a scenario where the oracle passes when the camera did not move. Every candidate mechanism either cannot engage (auto-rotate budget, no prior drag for damping), is gated by a control that fails rather than passes (blank gate, control windows), or is structurally excluded (pinned canvas, asserted delivery).

---

## 5. Spot-check of file:line citations

I verified 12 citations against the checkout. Results:

| # | Design citation | Actual content at that line | Correct? |
|---|---|---|---|
| 1 | `Viewer3D.tsx:1949` — `new THREE.WebGLRenderer({ antialias: true })` | Line 1949: `const renderer = new THREE.WebGLRenderer({ antialias: true })` | ✅ |
| 2 | `Viewer3D.tsx:1970-1972` — `enableDamping`, `dampingFactor`, `autoRotateSpeed` | Lines 1970-1972: exact match | ✅ |
| 3 | `Viewer3D.tsx:2157-2159` — `controls.autoRotate` conditional | Lines 2157-2159: exact match | ✅ |
| 4 | `Viewer3D.tsx:2040-2042` — `'start'` listener | Lines 2040-2042: `runtime.cameraTween = null`, `runtime.lastInteractionAt = performance.now()` | ✅ |
| 5 | `Viewer3D.tsx:2161` — `renderer.render(scene, camera)` | Line 2161: exact match | ✅ |
| 6 | `Viewer3D.tsx:2164` — `animationFrame = window.requestAnimationFrame(renderFrame)` | Line 2164: exact match | ✅ |
| 7 | `OrbitControls.js:1729` — `dispatchEvent(_startEvent)` on pointer-down | Line 1729: exact match | ✅ |
| 8 | `OrbitControls.js:1612` — `dispatchEvent(_endEvent)` on pointer-up | Line 1612: exact match | ✅ |
| 9 | `OrbitControls.js:700-702` — auto-rotate guarded by `state === NONE` | Lines 700-702: exact match | ✅ |
| 10 | `OrbitControls.js:923-931` — `_getAutoRotationAngle` | Lines 923-935: the function spans 923-935 not 923-931 | ⚠️ minor |
| 11 | `OrbitControls.js:708-709` — damping application | Lines 708-709: exact match | ✅ |
| 12 | `OrbitControls.js:792-795` — damping decay | Lines 792-795: exact match, includes pan offset decay at 795 | ✅ |
| 13 | `uc25-joint-review.js:327-346` — `readCanvasFrame` | Lines 327-346: exact match | ✅ |
| 14 | `uc25-joint-review.js:348-375` — `waitForStableCanvasFrame` | Lines 348-377 (the function is 348-377 not 348-375) | ⚠️ minor |
| 15 | `uc25-joint-review.js:766-780` — Scenario 7 assertions | Lines 766-780: exact match | ✅ |
| 16 | `Viewer3D.tsx:883-905` — `startCameraTween` | Lines 880-908 (`startCameraTween` function) — the design says 883-905, actual function spans 880-908; the body cited (camera tween, TRANSITION_DURATION_MS) is at 880+ | ⚠️ minor |
| 17 | `Viewer3D.tsx:2274-2287` — canvas aria-label `useEffect` | Lines 2274-2288 — actual span is 2274-2288, design says 2274-2287 | ⚠️ minor |
| 18 | `geometry-check.ts:255-261` — clearance verdict | Lines 255-261: exact match (the `verdictFor` function with `clearance === null ? NOT_ENOUGH`) | ✅ |
| 19 | `geometry-check.ts:120` — `NOT_ENOUGH` constant | Line 120: exact match | ✅ |
| 20 | `geometry-check.ts:249` — `clearance: NO_TARGET` | Line 249: exact match | ✅ |
| 21 | `ReviewPane.tsx:306` — `data-review-verdict="clearance"` | Line 306: exact match | ✅ |
| 22 | `Viewer3D.module.css:13-21` — `.canvas` positioning | Lines 13-21: exact match | ✅ |
| 23 | `Viewer3D.module.css:194-214` — `.tooltip` positioning, `z-index:3` | Lines 194-214: exact match | ✅ |

**Finding 11 — MINOR: Four citations have end-line offsets of 2-4 lines.** `OrbitControls.js:923-931` (actual: 923-935), `uc25-joint-review.js:348-375` (actual: 348-377), `Viewer3D.tsx:883-905` (actual: 880-908), `Viewer3D.tsx:2274-2287` (actual: 2274-2288). All four contain the claimed content at the claimed start lines; the end-line is slightly short. None misidentify the content.

No citation was found to point to the wrong content.

---

## 6. Is the claimed dev-browser API surface actually available?

### 6.1 `gl.readPixels` inside a rAF callback (Channel A)

**Finding 12 — MINOR: Available.**

`gl.readPixels` is a standard WebGL API. The design reads from the default framebuffer (binding `null`) after `renderer.render()` within the same rAF batch. With `preserveDrawingBuffer: false`, the spec says buffer contents are undefined only after the compositing step, which occurs after all rAF callbacks complete. Reading within the rAF batch is valid. The non-blank gate (§4.5) is the safety net if the ordering assumption fails.

No custom render target is used by [`Viewer3D.tsx`](file:///home/jetsonseo/projects/mdtproject/src/components/viewer/Viewer3D.tsx) (verified: zero matches for `renderTarget` in the file). The only framebuffer writes are to the default framebuffer via `renderer.render(scene, camera)`.

### 6.2 `page.screenshot({ clip, scale: 'css', type: 'png' })` (Channel B)

**Finding 13 — MAJOR: The `type: 'png'` option requires verification against sandbox exposure.**

The `page` object in the QuickJS sandbox is the Playwright `Page` object returned by `connection.getObjectWithKnownName(guid)` ([`daemon.mjs:6385-6398`](file:///home/jetsonseo/.dev-browser/daemon.mjs#L6385-L6398)), which is the Playwright client `Page` class from [`sandbox-client.js:11464`](file:///home/jetsonseo/.dev-browser/sandbox-client.js#L11464-L11484). This `Page.screenshot()` method:

- Accepts `clip`, `scale`, and `type` — these are passed through to the Playwright protocol channel ([`:11466-11479`](file:///home/jetsonseo/.dev-browser/sandbox-client.js#L11466-L11479)).
- Returns `result.binary` — a `Buffer` (QuickJS polyfill, extends `Uint8Array`, constructed via `Buffer.from(base64, "base64")` by `tBinary` at [`sandbox-client.js:339-343`](file:///home/jetsonseo/.dev-browser/sandbox-client.js#L339-L343)).
- The installed Playwright is version **1.58.2** — `scale: 'css'` is supported (added in Playwright 1.20.0; confirmed at [`screenshotter.js:264`](file:///home/jetsonseo/.dev-browser/node_modules/playwright-core/lib/server/screenshotter.js#L264), [`crPage.js:216`](file:///home/jetsonseo/.dev-browser/node_modules/playwright-core/lib/server/chromium/crPage.js#L216)).
- `type: 'png'` is supported by Playwright (it's the default).
- `clip` is a standard Playwright screenshot option.

The returned Buffer is byte-indexable, so IHDR parsing (`buf[offset]`) and FNV-1a hashing work. The existing tests confirm `page.screenshot()` returns a Buffer: [`uc25-joint-review.js:1243`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L1243) does `await saveScreenshot(await page.screenshot(), ...)` which calls `encodeHostFilePayload(buffer)` at [`daemon.mjs:6401-6410`](file:///home/jetsonseo/.dev-browser/daemon.mjs#L6401-L6410), which checks `ArrayBuffer.isView(value)` — a `Buffer` passes this.

**However**, the existing tests all call `page.screenshot()` without `clip` or `type` arguments. No test in this codebase has ever called `page.screenshot({ clip: {...} })`. While the Playwright API supports it and the sandbox passes all options through, **this is an untested code path in this specific sandbox integration**. The design's preflight (§4.7 step 0) capability check mitigates this: it takes a screenshot with the full options and verifies the result before proceeding. This is not a blocker because the preflight catches capability failures with `SCREENSHOT_BYTES_UNAVAILABLE`.

Downgraded from MAJOR to **acceptable risk with mitigation**, given the preflight. The design's explicit "there is no silent single-channel mode" policy means a broken screenshot path cannot produce a false pass.

### 6.3 Trusted pointer input via `page.mouse`

**Finding 14 — MINOR: Available.**

`page.mouse.move()`, `.down()`, `.up()` are standard Playwright APIs used extensively in the existing tests. The CDP-dispatched events are `isTrusted === true` in Chromium. The existing [`uc25-joint-review.js:415-429`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L415-L429) already uses this exact API for camera drag. The `steps: 8` option for interpolation is a standard Playwright `move` option.

### 6.4 `page.mouse.move(x, y, { steps: 8 })`

**Finding 15 — MINOR: Available.** Standard Playwright API. Existing code at [`uc25-joint-review.js:415`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L415) doesn't use `steps`, but it's a documented Playwright option. Not a concern.

---

## Additional findings

**Finding 16 — MAJOR: The `readPixels` → `readRoi()` saves and restores `READ_FRAMEBUFFER_BINDING` on WebGL2, but the design does not specify whether it restores the `PACK_*` pixel store parameters.**

The design (§4.3 `readRoi()` detail) says: "save `gl.getParameter(gl.FRAMEBUFFER_BINDING)` and, on WebGL2, `READ_FRAMEBUFFER_BINDING` and `PIXEL_PACK_BUFFER_BINDING`; bind `null`; `gl.readPixels(…)`; restore every saved binding." However, `readPixels` is also affected by `PACK_ALIGNMENT`, `PACK_ROW_LENGTH` (WebGL2), and `PACK_SKIP_PIXELS`/`PACK_SKIP_ROWS` (WebGL2). If three.js or a post-processing pass has changed any of these from their defaults, `readPixels` could read garbage.

However: three.js's `WebGLRenderer` does not change `PACK_*` parameters (they are not part of normal rendering). The defaults (`PACK_ALIGNMENT = 4`, others = 0) are what `readPixels` expects for a contiguous RGBA buffer. This is a theoretical concern, not a practical one in this codebase.

Not a blocker. The design could note that pack parameters are assumed to be at defaults, but this is standard practice for WebGL `readPixels` usage.

**Finding 17 — MINOR: The design's drag endpoints (`P0` at 0.88/0.88, displacement -40/-12 CSS px) are hardcoded, not the same as the current code's endpoints (0.48/0.48 → 0.57/0.53).**

The current test at [`uc25-joint-review.js:420-428`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L420-L428) uses `0.48/0.48 → 0.57/0.53`. The design moves to `P0 = 0.88/0.88`, `P1 = P0 - 40px/12px`. This is a deliberate change documented at §4.4: "the 40/12 px displacement is a commanded input magnitude" chosen to be "unambiguous" (~1 radian of azimuth on a 223px element). The new endpoints are in the bottom-right corner to avoid overlay obstruction (`.meta` top, `.legend` bottom-left). This is a design decision, not an error.

**Finding 18 — MINOR: §7.2 says `uc25-joint-review.js:643` calls `parseFindingRows` on the "entire ~700-row null-basis table", but `:643` reads:**

```js
const initialRows = parseFindingRows(await readFindingRows());
```

This is at line 643 of the current file. The design proposes changing this to:
```js
const initialRows = await readFindingRows();
observations.initialFindingRowCount = initialRows.length;
```

Verified: line 643 does call `parseFindingRows(await readFindingRows())`, and only `initialRows.length` is consumed (at line 647 for `observations.initialFindingRowCount`). The rows themselves are never used. §7.2 is correct.

**Finding 19 — MINOR: The design's three.js version claim (`0.185.1`) is confirmed.** [`package.json`](file:///home/jetsonseo/projects/mdtproject/node_modules/three/package.json) version is `0.185.1`. ✅

**Finding 20 — MINOR: `Buffer.from(JSON.stringify(value), "utf8")` at [`uc25-joint-review.js:320`](file:///home/jetsonseo/projects/mdtproject/tests/e2e/uc25-joint-review.js#L320) — the design's §9.6 predicted blocker is confirmed.** The QuickJS Buffer polyfill at [`daemon.mjs:6268-6270`](file:///home/jetsonseo/.dev-browser/daemon.mjs#L6268-L6270) throws `"QuickJS Buffer only supports base64 string input"` when encoding is not `"base64"`. This is a real issue that will hit Scenarios 15/17/18 once uc25 gets past Scenario 7. However, this is outside the scope of the camera oracle design review.

---

## Summary

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | MINOR | No anti-fitting violation found | — |
| 2 | MINOR | No assertion weakening found | — |
| 3 | MINOR | No forbidden src changes | — |
| 4-10 | MINOR | Oracle cannot false-pass for any candidate mechanism | — |
| 11 | MINOR | Four citations have end-line offsets of 2-4 lines | Cosmetic; content correct |
| 12 | MINOR | `gl.readPixels` in rAF: valid per WebGL spec | Gated by non-blank gate |
| 13 | MAJOR | `page.screenshot({clip})` never exercised in this sandbox | Mitigated by preflight capability check |
| 16 | MAJOR | `readRoi()` does not specify WebGL2 `PACK_*` parameter restore | three.js does not alter them; theoretical risk only |
| 17 | MINOR | Drag endpoints changed from current code | Deliberate, documented |
| 18 | MINOR | §7.2 parse removal is correctly targeted | — |
| 20 | MINOR | §9.6 Buffer.from("utf8") blocker is confirmed | Outside camera oracle scope |

No BLOCKER was found. Two MAJOR findings were identified, but both have explicit mitigation mechanisms in the design (preflight capability check for #13; default PACK parameters for #16). Neither can cause a false pass.

The design is thorough, internally consistent, and correctly cited. Its structural defenses (non-blank gate on every frame, no-drag controls at both endpoints, frame-counted windows, trusted pointer assertion, dual-channel agreement, no fallback selectors, preflight capability check) compose to make false passes constructively impossible rather than merely unlikely.
