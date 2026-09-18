VERDICT: HOLD

# Step8 camera-evidence oracle — independent implementation review

Reviewer: independent reviewer (Opus 5). I did not write `.git/phase48-run/step8-camera-design.md`,
did not write `.git/phase48-run/night/01-design-falsification.md`, and did not write the
working-tree diff. I edited no file except this one. No build, test, vitest, lint or browser
was run.

Inputs read in full: `.git/phase48-run/step8-camera-design.md` (824 lines),
`.git/phase48-run/night/01-design-falsification.md`, `git diff -- tests/e2e/` (615 diff lines
over `tests/e2e/README.md` and `tests/e2e/uc25-joint-review.js`), plus the post-diff state of
`tests/e2e/uc25-joint-review.js`.

Corroborating sources I read directly (not taken from either document):
`src/components/viewer/Viewer3D.tsx`, `src/components/viewer/Viewer3D.module.css`,
`src/components/review/ReviewPane.tsx`, `.next/static/css/*.css` (built class names),
`~/.dev-browser/sandbox-client.js`,
`~/.dev-browser/node_modules/playwright-core/lib/generated/utilityScriptSource.js`,
`~/.dev-browser/node_modules/playwright-core/lib/server/screenshotter.js`, `eslint.config.mjs`.

**HOLD, not PASS.** Two defects make a real-browser run either crash before the oracle can
reach its first gate (Finding 1) or silently retire one of the two BLOCKERs the falsification
document raised (Finding 2). Executing as-is burns a full build+serve+180s browser cycle and
returns an unnamed `ReferenceError` rather than any of the 18 designed failure codes.

The good news is bounded: Findings 1 and 2 are each a one- to three-line fix, sections 3 and 4
below (PRESERVATION, SCOPE) are clean, and the three falsification BLOCKERs are otherwise
honoured. This is a HOLD on execution, not a rejection of the approach.

---

## 1. FIDELITY — does it match the design and honour every BLOCKER/MAJOR?

### 1.1 The three falsification BLOCKERs

| | Required | State |
|---|---|---|
| BLOCKER 1 — `elementFromPoint` blind to `pointer-events:none` | use `elementsFromPoint` or bbox intersection; try C2 first | API swapped and order changed (`:429`, `:405-406`) — **but the predicate is dead, see Finding 2** |
| BLOCKER 2 — Buffer reference comparison | FNV-1a byte hash, compare `.hash` | Honoured. `captureScreenshotRoi` returns `{hash, bytes}` (`:588`); all three gates compare `.hash` (`:712`, `:722`, `:759`) |
| BLOCKER 3 — `Buffer.from(…, "utf8")` in `loadJsonObject` | in-page base64 + `Buffer.from(b64,"base64")` | Honoured verbatim at `:320` |
| MINOR 1 — `distinctColors` must be an integer | `set.size`, not a `Set` | Honoured: `distinctColors: colors.size` (`:528`) |
| Finding 7 — `parseFindingRows` scope creep | implementer must be aware | Applied at `:985`; `.map()` preserves length so `observations.initialFindingRowCount` (`:989`) is numerically identical, and `parseFindingRows` stays load-bearing at `:245` |

### 1.2 Deviations from the design (beyond Findings 1–2)

All are listed here; the ones I consider worth acting on are re-stated with severity in §6.

- **D1 — the negative-control probe file (§5.2, §8.5 step 2) does not exist.** `git status --porcelain tests/e2e/` shows only `M README.md` and `M uc25-joint-review.js`; `ls tests/e2e/` shows no new file. The design required the eight probes written **first** and shown to produce the required refusal codes, and §5.3 states explicitly that "the full run went green" is *not* evidence the oracle works. Nothing in this diff validates the oracle's refusals. (MAJOR — process/fidelity, not a runtime crash.)
- **D2 — failure throws carry no evidence.** `:713` and `:723` are `throw new Error(JSON.stringify({ code: 'CONTROL_MOVED' }))` — no frames, no `diffFractionVsBaseline`, no screenshot hashes. `:750` `MOTION_NOT_PERSISTENT`, `:754` `NO_MOTION_AFTER_DRAG`, `:757` `MOTION_BELOW_FLOOR`, `:760` `CHANNEL_DISAGREEMENT` are likewise bare. Design §2 rule 2 and §4.7 step 2 required per-frame numbers on every rejection; `UC25 CAMERA_ORACLE` (`:779`) is emitted **only on success** (`:766`), so on failure the whole evidence record is lost. This defeats the stated purpose of the repair — §1.5/§9.3 name `CONTROL_MOVED` as *the* diagnosis hook for the unexplained no-drag drift, and that is exactly the throw with zero payload.
- **D3 — `parkPointer` asserts nothing.** Design §8.2 item 3 required "a viewport point **asserted** outside the canvas rect" and "assert no visible tooltip before every Channel-B capture". `:594-600` does neither. `Math.max(0, rect.x - 100)` silently clamps; if a layout ever put the canvas at `rect.x === 0 && rect.y === 0` the park point `(0,0)` is *inside* the canvas and no assertion notices.
- **D4 — `BACKING_STORE_MISMATCH` checks width only** (`:365-368`). Design §4.1 required the backing-store rule; height is unchecked, so a canvas correct in width and wrong in height passes.
- **D5 — `roi.pngIhdr` records the expectation, not the observation.** `:691` sets it from `Math.round(roi.cssRect.w/h)`; the preflight's `await captureScreenshotRoi(roi)` at `:690` discards the actually-parsed IHDR. The assertion itself is real (inside `captureScreenshotRoi`, `:583`), but the record's `pngIhdr` is a tautology.
- **D6 — the drag's `pointerdown` is never asserted.** Design §4.4 required `pointerdown` trusted / pinned / within 1 px. `:735-738` checks only `moves` and `up`. Partially covered in practice — `moves` requires `buttons & 1`, which cannot be true without a delivered down — so I rate this MINOR, not MAJOR. `settleClick` likewise never asserts "exactly one `pointerup`" (design §4.4).
- **D7 — `cameraMoved` is the literal `true`** at `:776` and `:785`. Every gate is an inline `throw`, so the value is unreachable-if-false and the existing `viewerPerturbation.cameraMoved` conjunct at `:1133` becomes a tautology. Behaviourally equivalent to the design (the throws *are* the gate) and **not a weakening** — the run still cannot reach that line without passing every gate — but it is a deviation from §4.7 step 5 / §8.2 item 6 ("the existing throw-on-`!cameraMoved` is kept"), and a reader of `checks.checkStableAfterViewerPose` can no longer see where the camera evidence enters.
- **D8 — `tests/e2e/README.md` over-claims.** The new block asserts "ROI는 `document.elementsFromPoint`를 이용해 오버레이가 없는 안전한 영역으로 설정된다". Per Finding 2 that guarantee does not hold. The README also asserts "마우스 조작은 … 타겟 좌표 정확성을 검증한다", which is true for `settleClick` and for the drag's `up`/last-`move`, but not for the drag's `down` (D6).

### 1.3 Honoured correctly (spot-verified against source, not taken on trust)

- `Math.min(dpr, 2)` at `:365` matches `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` at `src/components/viewer/Viewer3D.tsx:1953`. Correct binding.
- `[data-review-verdict='clearance']` (`:1011`) exists: `src/components/review/ReviewPane.tsx:306`. The §7.1 liveness assertion is correctly "not 判断不可 and not 検査対象なし" (`:1014-1016`), i.e. a strengthening, and is folded into the existing `checks.clearanceRecheckFindings` (`:1056`) rather than adding a 20th key. `lowClearanceVerdict` reaches the `UC25 CLEARANCE_ORACLE` record (`:1084`). `clearanceLowMm` is in scope (`:1002`).
- Single-branch canvas selector with no `, canvas` fallback (`:350`); `CANVAS_AMBIGUOUS` path for Scenario 14 (`:354-357`).
- Constants block (`:325-334`) matches §8.3 exactly, including `DRAG_DX_CSS = -40`, `DRAG_DY_CSS = -12`, `P0` at 0.88 (`:693`).
- `readRoi` saves and restores `FRAMEBUFFER_BINDING`, and on WebGL2 `READ_FRAMEBUFFER_BINDING` + `PIXEL_PACK_BUFFER_BINDING` (`:466-490`) — read-only w.r.t. the product renderer, as §4.3 required.
- No `preserveDrawingBuffer` added; `src/**` untouched (§3, §8.4). See §4.

---

## 2. FALSE ACCEPT / FALSE REJECT — adversarial scenarios

I take "false accept" to mean: every gate passes and `perturbViewer` returns, though the
camera pose did not change.

### 2.1 What genuinely closes

I tried and failed to break these, and record the reasoning so the next reviewer does not
redo it:

- **Blank readback.** `zeroAlphaFraction === 0 && distinctColors >= 32 && modalFraction <= 0.98` (`:641-643`) runs on every frame of every window *and* on the preflight frame (`:685-688`). A cleared `alpha:true` buffer gives `1 / 1 / 1` and fails all three. The original defect cannot recur silently.
- **rAF ordering.** `Viewer3D.renderFrame` re-registers itself at the end of its own callback, so a callback registered from a task (`:540-551`) or from inside our own callback lands after `renderer.render()` of the same frame. If that is ever wrong the read is blank → `BLANK_FRAME`. The assumption can only fail loudly. Verified against the loop shape in `Viewer3D.tsx`.
- **Auto-rotate.** `WINDOW_BUDGET_MS = 6000 < AUTO_ROTATE_DELAY_MS = 8000`; the budget is measured on `msSinceLastPointerDown` (`:493-494`, checked at `:626`), which is frame-derived, so the ~1 Hz headless rAF throttling cannot smuggle a longer window past it. Windows that overrun are re-armed with a provably inert zero-movement click, at most twice, then `AUTOROTATE_WINDOW_EXCEEDED`.
- **Damping.** No drag precedes the control windows, so there is no residual to confound them; the after-window demands persistence (`:749-751`), not stability, so a decaying residual cannot fail it either.
- **GL context identity.** `el.getContext('webgl2') || el.getContext('webgl')` (`:359`) returns the *existing* three.js context per the HTML spec — it cannot create a second, empty context on the same canvas. Correct.
- **Channel B clip frame of reference.** `playwright-core/lib/server/screenshotter.js:178` trims a non-`fullPage` clip against **`viewportSize`**, so the clip is viewport-relative and matches `getBoundingClientRect()`. Correct.
- **DOMRect serialization.** `canvasData.rect` is a live `DOMRect` returned across `page.evaluate`. I expected this to serialize as `{}` (every other test in `tests/e2e/` destructures the rect by hand — `uc9:61-62`, `uc10:136-137`), which would have made `p0.x` NaN. It does **not**: `utilityScriptSource.js` `innerSerialize` has an explicit `o.length === 0 && value.toJSON` fallback, and `DOMRectReadOnly.prototype.toJSON` exists, so `x/y/width/height` survive. Not a defect — recorded so it is not re-raised.

### 2.2 Residual false-accept surface — the drag's move path is the one uncontrolled interaction

**PLAUSIBLE, low probability, inherited from the design rather than introduced by the implementer.**

The two controls are *point clicks* at `P0` (`:708`) and `P1` (`:718`). The drag (`:729-733`)
is `move(P0, steps:8) → down() → move(P1, steps:8) → up()`. The only interaction the controls
do **not** replay is the button-down traversal `P0 → P1` across the canvas.

Concrete scenario: suppose OrbitControls rotation is inert for some reason (a future
`enableRotate` toggle, a modal overlay swallowing the rotate but not the pointer, a regression
in the `'start'` handler). `Viewer3D.tsx:2097-2118` ray-picks on canvas interaction and drives
`setHoverRowRef` → `applyHighlight` (`:2256-2260`), which recolours geometry — a whole rebar's
worth of pixels, comfortably above `MOTION_MIN_DIFF_FRACTION = 0.02`. If the viewer's hover
update is suppressed while `buttons & 1` and resolved once on `pointerup`, or if the traversal
leaves a sticky hover the point-clicks never produce, the after-window's frames differ from
`h0`, persist across all three, clear the 2 % floor, and Channel B agrees because Channel B
also photographs the canvas. **`cameraMoved` returns true with a frozen camera.**

Why it is only *plausible*: control P1 ends at the same coordinate with the same `click`, so
a hover that is a pure function of (final pointer position, camera pose) is already controlled.
Breaking it requires hover to be path-dependent or button-state-dependent. I did not read
`Viewer3D.tsx:2060-2120` closely enough to settle which it is, and I did not run anything.

Cheap closure, no new mechanism: add a fourth control that replays the drag's move path with
the button **up** (`move(P0, steps:8) → move(P1, steps:8)`, no `down`) and require equality to
`h0`. That converts the only uncontrolled interaction into a matched control.

Note also that Channel B is weaker corroboration than §4.0 claims: it photographs the same
canvas, so for any *non-camera canvas* change it agrees with Channel A by construction. Its
independence is real only against a dead readback and against the wrong element — which is
exactly why Finding 2 matters.

### 2.3 Hash-only control gate where an exact witness is already free

`readRoi` computes `diffFractionVsBaseline` (`:532`) for every control frame — an exact
per-pixel inequality count against the stored baseline. The control gate (`:647-653`) uses only
the 32-bit FNV hash. An FNV-1a/32 collision would let a genuinely changed control frame register
as unchanged, weakening the control that the whole oracle rests on. Probability ~2⁻³²; cost of
closing it is one added conjunct `f.diffFractionVsBaseline === 0`. Worth doing since the value
is already computed and transferred.

### 2.4 False-reject surfaces (fails though the camera did move)

These do not threaten soundness, but they decide whether the run is interpretable:

- **Byte-exact PNG equality for controls** (`:712`, `:722`) assumes Chromium's PNG encoder is
  bit-deterministic for identical pixels. If it is not, `CONTROL_MOVED` fires with an empty
  payload (D2) and the failure is uninterpretable. Channel A's hash gate already covers the
  canvas; Channel B's byte-exactness is the strictest and least-evidenced assertion in the diff.
- **`distinctColors >= 32` on the ROI, not the canvas.** C2 is `x 0.35..0.65, y 0.25..0.60`.
  If that band lands on flat `--viewer-background: #1b1a14` for this fixture's joint, every
  frame is `BLANK_FRAME` and the run reports a dead instrument on a live renderer. The design
  justified 32 against a *canvas-wide* observation (7,677 / 14,843 distinct colours), not
  against this ROI.
- **Re-arm does not re-park.** `runCaptureWindow` re-arms with `settleClick(p0)` (`:629`) and
  `continue`s straight into `captureFrames` without `parkPointer`. The pointer is left hovering
  on the canvas, so `.tooltip` (`Viewer3D.module.css:194`, `z-index:3`, pointer-positioned) can
  sit inside the Channel-B ROI and a hover highlight can sit inside the Channel-A ROI. Pushes
  toward `CONTROL_MOVED`, not toward a false pass.
- **Scenario 14's `CANVAS_AMBIGUOUS` is a new hard-failure surface.** `:1315` calls
  `perturbViewer` with `expectedCanvasLabel: null` while on the Work tab, and `:354` requires
  exactly one canvas with a non-empty `aria-label`. The old code only required "some canvas".
  Per the design's own §9.6, uc25 has never executed past Scenario 7, so **nothing has ever
  observed how many canvases the Work tab renders.** This is design-sanctioned (§6.3) and fails
  loudly, but it is an untested precondition on a scenario that has never run.

---

## 3. PRESERVATION — pre-existing assertions

All intact. Quoting the post-diff file:

**Scenario 7 camera + invariance, verbatim (`tests/e2e/uc25-joint-review.js:1122-1135`):**
```js
const stableResult = await waitUntil(
  "check stability after viewer-only changes",
  readCheckResult,
  (value) =>
    value.checkId === checkId1 &&
    value.findings === findings1 &&
    JSON.stringify(value.verdicts) === JSON.stringify(verdicts1),
);
checks.checkStableAfterViewerPose =
  viewerPerturbation.clipMoved &&
  viewerPerturbation.cameraMoved &&
  stableResult.checkId === checkId1 &&
  stableResult.findings === findings1 &&
  JSON.stringify(stableResult.verdicts) === JSON.stringify(verdicts1);
```
Unchanged by the diff (context-only hunk). Both conjuncts survive; see D7 for the caveat that
`cameraMoved` is now a literal.

**Remount throw (`:1112-1120`)** — unchanged:
```js
if (remountedCheckState.checkIdMounted || remountedCheckState.findingsMounted) {
  throw new Error(
    `UC25 check result was not cleared by ReviewPane remount: ${JSON.stringify(remountedCheckState)}`,
  );
}
```

**19-check contract (`:1607-1609`)** — unchanged, and `grep -c` over `checks.` assignments
returns exactly **19**. No key added, removed or renamed; `lowBasisReachedEngine` is folded into
the existing `checks.clearanceRecheckFindings` (`:1056`) rather than becoming a 20th key.
```js
if (Object.keys(checks).length !== 19) {
  throw new Error(`UC25 expected nineteen checks, found ${Object.keys(checks).length}`);
}
```

**Scenario 14 stability expression (`:1341-1345`)** — unchanged:
```js
checks.displayStateStableAfterUiEdits =
  displayPerturbation.clipMoved &&
  displayPerturbation.cameraMoved &&
  editedNote === "UC25 display-only note" &&
  displayStateStable;
```

**Downstream first-row actions** — the diff's only non-context hunks after `perturbViewer` are
the two call sites (`:1109`, `:1315`), the §7.1 liveness insert (`:1011-1020`), the
`clearanceRecheckFindings` conjunct (`:1056`), the `lowClearanceVerdict` record field (`:1084`),
and `:985`. Scenario 8's first-row → review-item flow and everything after it are untouched.

**Scenario 5's `evaluateClearanceOracle` and thresholds** — untouched. **`parseFindingRows`**
— body unchanged at `:102`, still strict-parsing both the low and high tables via
`readFindingSnapshot` (`:245`). Only the discarded 700-row parse at `:985` is dropped, and
`.map()` preserves length so `observations.initialFindingRowCount` (`:989`) is unchanged.

Nothing is weakened, deleted, loosened or made conditional. The new gates are strictly additive.

---

## 4. SCOPE — clean, no HOLD on this axis

`git diff --stat -- tests/e2e/`:
```
 tests/e2e/README.md            |   9 +
 tests/e2e/uc25-joint-review.js | 531 ++++++++++++++++++++++++++++++++++-------
 2 files changed, 452 insertions(+), 88 deletions(-)
```
`git status --porcelain` shows no other modified tracked file. Specifically:
`src/**` untouched (`Viewer3D.tsx:1949` still `new THREE.WebGLRenderer({ antialias: true })`,
no `preserveDrawingBuffer`), `src/rulepack/**`, `src/domain/**`, fixtures, stores,
`next.config.ts`, `phases/48-joint-review-ui/step8.md` — all untouched. No decoy-canvas DOM
injection was left in `uc25-joint-review.js`. **No product change. No automatic HOLD on scope.**

The remaining untracked entries (`phases/48-joint-review-ui/step*-codex.*.log`,
`step*-invoke.json`, `.claude/settings.local.json`) are harness artifacts, not product or test
code, and are expected to be dirty per `CLAUDE.md`.

`node --check tests/e2e/uc25-joint-review.js` — passes (this is a parse check only, run under
Node; it is not a browser acceptance claim). `eslint.config.mjs` scopes its custom rules to
`src/**`, so the diff's trailing whitespace and the `const {rawPixels, ...rest}` omit-pattern
should not trip `npm run lint`; I did not run it.

---

## 5. RUNTIME RISK — what throws in dev-browser

The two blockers are Findings 1 and 2 in §6. Remaining risks, none disqualifying:

- **R1 — `rawPixels` crosses the CDP boundary on every frame.** `readRoi` returns
  `rawPixels: buf` (`:534`), a `Uint8Array`. Playwright's serializer base64-encodes typed arrays
  (`utilityScriptSource.js`, `typedArrayConstructors` → `{ta:{b:…}}`), so for a ≈253×78 ROI that
  is ≈79 KB raw → ≈105 KB base64 **per frame**, ×3 frames ×4 windows ×2 call sites ≈ 2.5 MB of
  pure waste. The baseline is stored in-page (`:546`) and `rawPixels` is stripped on the Node
  side (`:658`), so nothing needs it over the wire. Delete it from the returned object and keep
  the buffer in a closure. Latent hazard: `_promiseAwareJsonValueNoThrow` **swallows**
  serialization failures and returns `undefined`, which would surface as
  `TypeError: Cannot read properties of undefined` at `:625` rather than a named code.
- **R2 — wall-clock budget.** Four windows × 3 frames at the ~1 Hz headless rAF rate recorded in
  `tests/e2e/README.md`, plus parks and screenshots, is ≈15 s per call site, ≈30 s for both,
  added to a 19-scenario run against `--timeout 180`. Tight but plausible; if the rate drops the
  test reports `AUTOROTATE_WINDOW_EXCEEDED` rather than hanging, which is the right failure.
- **R3 — clip rounding.** `roi.cssRect` carries fractional CSS coordinates into
  `page.screenshot({clip})` (`:578-580`); the IHDR assertion allows ±1 (`:585`). Chromium
  rounding of a fractional clip origin *plus* extent can differ by more than 1 px, which would
  fire `SCREENSHOT_SCALE_MISMATCH` on a healthy run. Rounding `cssRect` to integers in
  `selectRoi` before it reaches either channel removes the question.
- **R4 — `unescape` at `:320`** is a legacy Annex-B global. Present in Chromium; the call runs
  in the *page*, not in QuickJS, so it is fine. `TextEncoder`-based encoding would be less
  fragile, but this is not a defect.
- **R5 — thrown JSON is not parsed back.** Every in-page and Node-side gate throws
  `new Error(JSON.stringify({code…}))`. The failure code therefore reaches the operator only as
  a raw JSON string embedded in an `Error.message`, prefixed by Playwright's own
  `page.evaluate: Error: …` wrapper. Functional, but combined with D2 it means a failing run
  prints a code and nothing else.

---

## 6. Numbered findings

### Finding 1 — BLOCKER: `arguments` in an arrow function passed to `page.evaluate` throws `ReferenceError` on the first `settleClick`
`tests/e2e/uc25-joint-review.js:608`
```js
const log = await page.evaluate(() => window.__uc25Cam.log.slice(arguments[0]), p0LogIndex);
```
Arrow functions do not bind `arguments`; the lookup escapes to the enclosing lexical scope.
`utilityScriptSource.js` evaluates the function text with **`this.global.eval(expression)`** —
indirect eval, so the enclosing scope is the page's *global* scope, where `arguments` does not
exist. Confirmed by direct execution of the same shape:
```
$ node -e "globalThis.window={__x:{log:[1,2,3,4,5,6]}};
           globalThis.eval('(() => window.__x.log.slice(arguments[0]))')(2)"
THROWS: ReferenceError: arguments is not defined
```
`settleClick` is the very first thing Step 1 does (`:707`), and is also the re-arm path
(`:629`). **The oracle cannot reach a single gate.** Scenario 7 dies with an unnamed
`ReferenceError`, and Scenarios 8–19 never run.

The same file already has the correct form eleven lines further down, at `:734`:
```js
const log = await page.evaluate((idx) => window.__uc25Cam.log.slice(idx), p0LogIndex);
```
Fix: make `:608` identical to `:734`. One line.

### Finding 2 — BLOCKER: the ROI obstruction guard is dead — `.closest('.viewer')` can never match a CSS-Modules class, so falsification BLOCKER 1 is not actually honoured
`tests/e2e/uc25-joint-review.js:430`
```js
const obscuring = els.find(el => el !== window.__uc25Cam.canvas && el.closest('.viewer'));
```
`.viewer` is a CSS-Modules class — `src/components/viewer/Viewer3D.tsx:2342` renders
`className={styles.viewer}`, and `grep -rn ":global" src/components/viewer/` returns nothing.
The emitted class name is mangled; from this repo's own build output:
```
$ grep -ho "[A-Za-z0-9_-]*viewer[A-Za-z0-9_-]*" .next/static/css/*.css | sort -u
Viewer3D_viewer__rAjcR
```
`el.closest('.viewer')` therefore returns `null` for **every** element, `obscuring` is always
`undefined`, `passed` is always `true`, and the first candidate is accepted unconditionally.
The loop over `elementsFromPoint` runs and decides nothing. `ROI_OBSTRUCTED` (`:452`) is
unreachable, and `roi.gridSamples` (`:447`) records only a sample *count*, so the evidence
record cannot reveal the vacuity either.

The predicate is wrong in both directions, which is worth stating because the obvious fix is
also wrong: `elementsFromPoint` returns the hit element's **ancestors** too, and the `.viewer`
container is an ancestor of the canvas at every point inside it. Had the class name matched,
`obscuring` would have been truthy at every sample and *every* candidate would have failed with
`ROI_OBSTRUCTED`. Substituting `[class*="viewer"]` would produce exactly that always-obstructed
behaviour.

Correct predicate — reject only elements that are **not** the canvas and **not** an ancestor of
the canvas:
```js
const canvas = window.__uc25Cam.canvas;
const obscuring = els.find(el => el !== canvas && !el.contains(canvas));
```
`Node.contains` is true for ancestors and for the node itself, needs no class name, and is
immune to CSS-Modules hashing. The falsification document's alternative — an explicit
`getBoundingClientRect()` intersection test against `.meta`, `.clipControls`, `.legend`,
`.tooltip` resolved through `styles.*`-independent means — also works but is more code.

Severity note: with C2 (`x 0.35..0.65, y 0.25..0.60`) tried first, the practical overlap risk is
low — on the observed 843×223 canvas that band is `x 295..548, y 56..134`, while `.meta` sits at
`top: var(--space-xs)`, `.clipControls` is right-aligned at `x≈700..839`, and `.legend` is
bottom-left. So the run may well succeed by luck. But the guard the falsification document
demanded as a BLOCKER is not in force, the design's §4.0 "Channel B ROI must be **proven**
overlay-free" is unmet, negative control #7 that would have caught it was never written (D1),
and `tests/e2e/README.md` now documents a guarantee the code does not provide (D8). Shipping
this as "BLOCKER 1 honoured" is the failure mode `CLAUDE.md` 개발 프로세스 ③ exists to prevent.

### Finding 3 — MAJOR: no negative-control probe exists, so nothing validates the oracle's refusals
Design §5.2 and §8.5 step 2 required a scratch probe file under `tests/e2e/`, written **first**,
demonstrating all eight refusal codes; §5.3 states in terms that a green run is not evidence the
oracle works. `git status --porcelain tests/e2e/` shows only the two modified files. Of the 18
codes in §4.9, **`ROI_OBSTRUCTED` is provably unreachable** (Finding 2) and the rest are
unexercised. Without the probe, a green run demonstrates that the oracle does not crash — not
that it refuses. Recommend writing at minimum probes #1 (`P1 === P0` → `NO_MOTION_AFTER_DRAG`),
#2 (bad label → `JOINT_CANVAS_NOT_FOUND`, no fallback) and #5 (read outside rAF →
`BLANK_FRAME`) before the browser run, since those three cover the two root causes this repair
exists to close.

### Finding 4 — MAJOR: every failure throw discards the per-frame evidence the repair was built to produce
`tests/e2e/uc25-joint-review.js:713`, `:723`, `:750`, `:754`, `:757`, `:760`
```js
throw new Error(JSON.stringify({ code: 'CONTROL_MOVED' }));
```
`UC25 CAMERA_ORACLE` (`:779`) is emitted only after every gate passes, so a failing run prints a
bare code and nothing else. Design §2 rule 2 required named code **plus per-frame numbers**, and
§1.5/§9.3 name `CONTROL_MOVED` specifically as the diagnosis hook for the unexplained no-drag
drift (78,076 changed px in the preserved artifact) — the single most likely failure of this
run, and the one that will now arrive with zero data. Given that the preserved diagnostic makes
`CONTROL_MOVED` a live possibility, this converts a diagnosable red into another unattributable
one, which is the exact defect §1.3 diagnosed in the old instrument. Emit the partial record
(canvas, roi, pointer log, all windows captured so far) in the thrown message or on a
`console.log` before every throw.

### Finding 5 — MINOR: control gate uses a 32-bit hash when an exact per-pixel witness is already computed and transferred
`tests/e2e/uc25-joint-review.js:647-653`. `diffFractionVsBaseline` (`:532`) is an exact
inequality count against the baseline; the gate compares only `f.hash` (FNV-1a/32). Add
`|| f.diffFractionVsBaseline !== 0` to the control condition. Free, and it removes a ~2⁻³²
soundness hole in the control the whole oracle rests on.

### Finding 6 — MINOR: the drag's button-down move path is the only interaction no control replays
See §2.2. Both controls are point clicks; neither replays `P0 → P1` traversal. If the viewer's
hover/highlight (`Viewer3D.tsx:2097-2118` → `applyHighlight` `:2256-2260`) is path- or
button-state-dependent, a ≥2 % pixel delta with a frozen camera is conceivable and would be
credited to the camera. Closure is one more `runCaptureWindow` preceded by
`move(P0,{steps:8}) → move(P1,{steps:8})` with no `down()`, required equal to `h0`.

### Finding 7 — MINOR: `parkPointer` asserts neither "outside the canvas" nor "no tooltip", and re-arm skips it entirely
`tests/e2e/uc25-joint-review.js:594-600` and `:629`. Design §8.2 item 3 required both
assertions before every Channel-B capture. `Math.max(0, rect.x - 100)` silently clamps into the
canvas when `rect.x === 0 && rect.y === 0`. Separately, the re-arm path `settleClick(p0);
continue;` re-enters `captureFrames` with the pointer resting on the canvas, so a
pointer-positioned `.tooltip` (`Viewer3D.module.css:194`, `z-index:3`) or hover highlight can
sit inside the ROI. Both push toward false *reject*, not false accept.

### Finding 8 — MINOR: `rawPixels` is shipped across the CDP boundary for every frame and never used there
`tests/e2e/uc25-joint-review.js:534`, stripped at `:658`. ≈105 KB base64 per frame × 24 frames
per run. The baseline is already retained in-page (`:546`). Remove it from the return value.
Latent hazard: Playwright's `_promiseAwareJsonValueNoThrow` swallows serialization errors and
yields `undefined`, which would surface at `:625` as an untyped `TypeError` instead of a code.

### Finding 9 — MINOR (fidelity, non-blocking): D4/D5/D6/D7 as listed in §1.2
Width-only `BACKING_STORE_MISMATCH` (`:365`); `roi.pngIhdr` recording the expectation rather
than the parsed value (`:691`); no `pointerdown` assertion on the drag (`:735`) and no
"exactly one `pointerup`" check in `settleClick`; `cameraMoved` as a literal `true` (`:776`,
`:785`) making the `viewerPerturbation.cameraMoved` conjunct at `:1133` a tautology. None
weakens an existing assertion; all are deviations a reader of the design would not predict.

### Finding 10 — MINOR: `tests/e2e/README.md` documents a guarantee the code does not provide
The new block claims the ROI is set to an overlay-free region via `document.elementsFromPoint`.
Per Finding 2 the guard is inert. Either fix Finding 2 (preferred — then the sentence becomes
true) or soften the sentence. Also see D6 regarding the pointer-coordinate claim.

---

## 7. What would move this to PASS

Necessary: **Finding 1** (one line) and **Finding 2** (one line — swap the predicate to
`el !== canvas && !el.contains(canvas)`). With those two, the diff is safe to execute in a real
browser: the oracle reaches its gates, and a green result means the obstruction guard actually
ran.

Strongly recommended before spending the build+serve+180 s cycle, because they determine whether
a red is interpretable: **Finding 4** (emit the record on failure) and at least probes #1/#2/#5
from **Finding 3**. Without Finding 4, the most likely outcome — `CONTROL_MOVED`, given the
preserved 78,076-changed-px artifact — arrives with no evidence attached, and the cycle has to
be repeated.

Findings 5–10 are hardening and fidelity; none blocks execution.

PASS here would have meant only "safe to execute in a real browser". It does **not** and would
not have meant Step 8 is accepted: per `CLAUDE.md` 개발 프로세스 ③, acceptance additionally
requires the §5.2 negative controls to have produced their required refusal codes (Finding 3),
which no artifact in this working tree demonstrates.
