# Phase 49 Independent Cross-Verification Verdict: REFUTE, Do Not Fix

**Repository:** `C:\Users\emper\mdtproject`  
**Branch:** `main`  
**Commit Under Attack:** `29ffe1b` (`feat(49-joint-review-defects): close the phase 48 review findings`)  
**Verifier:** Independent Cross-Verifier (Antigravity)  
**Target Path:** `C:\Users\emper\AppData\Local\Temp\claude\C--Users-emper-mdtproject\9bd6a2f4-e482-40db-8e1a-0dea24e47e8a\scratchpad\agy-phase49-verdict.md`  

---

## Executive Summary

Phase 49 intended to close six defects (C1–C6) reported by the Phase 48 review, with a step 0 refutation gate that judged C1–C6 as holding and C7 as refuted. The author concluded that C7 was refuted because an unmodified left-button drag in `OrbitControls` rotates the camera around its target and therefore never removes the joint from view. Consequently, step 4 skipped implementing C7.

This independent cross-verification finds that:
1. **The gate's refutation of C7 is flawed**: A left-button drag *does* pan if modifier keys (`Shift`, `Ctrl`, `Meta`) are held (`OrbitControls.js:1679-1685`), which pans the joint out of view and blinds all 5 sampled points. Furthermore, `fingerprintAfter` in `tests/e2e/uc25-joint-review.js:464-470` lacks a not-blind guard; any condition emptying tooltips (such as viewer unmounting or render failure) causes the oracle to falsely pass `cameraMoved`. Refuting C7 solely because a plain rotation didn't blind the points dismissed a real, reachable oracle hole.
2. **`noUnexpectedBrowserErrors` in uc25 can pass while errors occur**: The initial page session (`uc25-joint-review.js:483-496`) never installs diagnostics or collects errors. On every reload, `installBrowserDiagnostics` is installed *after* `domcontentloaded`, missing all script evaluation, chunk loading, and initial React hydration errors.
3. **Statements of the retracted cause ("z-fighting") still remain**: `phases/49-joint-review-defects/step4.md:37-38`, `phases/48-joint-review-ui/step8-report.json:660`, and `phases/48-joint-review-ui/index.json:83` continue to assert z-fighting as a fact despite prior retraction.
4. **Step 1 product changes (Claim B), unit tests (Claim C), and diff scope (Claim E) survive attack**.

---

## Claim A — The Gate's Verdicts Are Sound

### 1. Attack on C7 Refutation
`phases/49-joint-review-defects/step0-report.json:95-113` claims C7 is **refuted** on the grounds that:
> *"OrbitControls rotates the camera around the target, so the joint stays in the middle of the canvas however far it is dragged... A left drag cannot take the joint out of view; only a pan or a dolly could, and the script performs neither."*

This conclusion is incorrect for three reasons:
- **Left-drag pans with modifier keys in `OrbitControls`**: In `node_modules/three/examples/jsm/controls/OrbitControls.js:1677-1687`:
  ```javascript
  case MOUSE.ROTATE:
    if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
      if ( this.enablePan === false ) return;
      this._handleMouseDownPan( event );
      this.state = _STATE.PAN;
    }
  ```
  `src/components/viewer/Viewer3D.tsx:1969-1973` instantiates `OrbitControls` without disabling pan (`controls.enablePan` defaults to `true` per `OrbitControls.js:369`, and `controls.screenSpacePanning` defaults to `true` per `OrbitControls.js:377`). Thus, a left-button drag with `Shift`, `Ctrl`, or `Meta` is a supported left-drag path that pans the camera, readily moving the joint off-screen and blinding all sampled points.
- **The missing guard on `fingerprintAfter` is real and reachable**: As `step0-report.json:110` explicitly conceded, `fingerprintAfter` in `tests/e2e/uc25-joint-review.js:464-470` has no `not-blind` check. If the viewer unmounts, WebGL context is lost, or the tooltip element is removed during or after the drag, `cameraFingerprint` returns `[null, null, null, null, null]`, which differs from `fingerprintBefore` and causes `cameraMoved = true` to pass vacuously.
- **Flawed Gate Logic**: The gate refuted C7 because the specific hypothesis ("a pure rotation drag blinds the camera") failed under default orbit rotation. But by declaring C7 "refuted" and refusing to implement the guard in step 4 (`step4-report.json:58-63`), the session left an open hole in `uc25`'s camera oracle that silently passes if the viewer breaks.

### 2. C1 Correction Verification
In `phases/49-joint-review-defects/step0-report.json:26`, the report corrects the claim's example of 最上層柱:
- In `src/domain/model/sample-project.ts:21-24, 248-253`, `sampleStories` defines `1F` (height 4200) and `2F` (height 3600). Girders are generated for *both* `1F` and `2F` (`createGirders(id)`).
- In `src/domain/review/joint.ts:110-121`, `resolveJoint` looks for girders belonging to `story.id` that touch the column (`touchesColumn`). For column `2F-X2Y1` on the 2F story, touching 2F girders exist (`2F-G1-X1Y1-X`, etc.). Girders are found (`girders.length > 0`), so `resolveJoint` resolves to `{ status: 'joint', joint: ... }`.
- Thus, 最上層柱 is not an unsupported case. The true third unsupported case is `取り付く大梁なし` (a column with no touching girders). The report's correction on C1 is verified.

### 3. C5 Correction Verification
In `phases/49-joint-review-defects/step0-report.json:74`, the report corrects the spec's judgment method:
- The spec proposed verifying C5 by seeing whether the check remained true with nothing to check.
- In `dev-browser`'s underlying Playwright runner (`dev-browser/node_modules/playwright-core/lib/client/frame.js:198`), `page.waitForSelector` throws a `TimeoutError` when the target selector is not attached.
- The pre-fix script had `await page.waitForSelector(...)` immediately preceding `checks.jointCanvas = true`. An absent canvas would abort the script with an uncaught exception rather than silently setting `checks.jointCanvas = true`. The report's correction is verified.

### 4. Mutation Isolation
- C1: Tested all three unresolvable cases against a resolving column via component test.
- C2: Replaced rendered text with sentinel; 2037 tests passed. Clean isolation of zero coverage.
- C3: Replaced `<select>` `onChange` in `WorkPackageBoard.tsx` with a no-op; all 5 tests passed. Isolated zero UI interaction test coverage.
- C4: Mutated `packageReadiness` in `src/domain/review/readiness.ts` to return `準備完了（例外あり）` on the clean path. Both the tautological comparison and the substring match were demonstrated simultaneously.
- C5 & C6: Probed AST and evaluation semantics directly.

### Claim A Verdict
**REFUTED** (The refutation of C7 was invalid: left-drag panning via modifier keys was ignored, reachable failure modes that empty the tooltip were dismissed, and the missing guard on `fingerprintAfter` was improperly omitted from step 4).

---

## Claim B — The Step 1 Product Change Is Correct and Minimal

### 1. Creation Path Analysis
- In `src/components/review/ReviewPane.tsx:991-994`, `ReviewItemsSection` computes `draftJoint` via `resolveJoint(project, sel.memberId)` when a member is selected, or `{ status: 'unsupported', reason: '部材なし' }` when `sel.memberId === null`.
- `ReviewPane.tsx:1113-1122`: The "検討項目を追加" button is assigned `disabled={jointUnavailableReason !== null}` and renders `<p role="status" data-testid="review-items-joint-unavailable">`.
- `ReviewPane.tsx:996-999`: `openDraft` checks `if (columnMemberId === null || resolveJoint(project, columnMemberId).status !== 'joint') return`.
- The only other caller of `openDraft` is the finding-triggered effect at `ReviewPane.tsx:1016`. If a finding is clicked after selection moved to an unresolvable member, `openDraft` refuses and returns without opening `draft`.
- No other review item creation path exists in `src/`.
- In `src/components/review/WorkPackageBoard.tsx:126-128`, `{ kind: 'joint', columnMemberId: selection.memberId }` is constructed for `WorkPackage.targets` (when `viewerMode === 'joint'`), not `ReviewItem.targets`. This target is validated during readiness checks by `src/domain/review/validity.ts:51-58` (`elementRefTargets`), which assigns unresolvable joints to `missing`, blocking the package with `'対象部材なし'` (`readiness.ts:85`).

### 2. Member-Kind Judgment
`ReviewPane.tsx` does not inspect `member.kind`, `section.shape`, or any domain member types. It queries `resolveJoint(project, memberId)` exclusively at lines 993 and 998.

### 3. Preserved Behavior for Resolving Columns
For resolving columns (e.g. `1F-X2Y1`), `jointUnavailableReason` is `null`, the button is enabled, no notice is shown, and `openDraft` proceeds. This is verified by `src/components/review/ReviewPane.test.tsx:744-766`.

### 4. Locale Keys and Parity Enforcement
- `src/locales/ja.json:442`: `"review.items.jointUnavailable": "接合部が成立しないため、この部材では検討項目を作成できません"`
- `src/locales/ko.json:442`: `"review.items.jointUnavailable": "접합부가 성립하지 않아 이 부재에서는 검토항목을 만들 수 없습니다"`
- `src/lib/i18n.test.ts:18-20` asserts:
  ```ts
  expect(Object.keys(ja).filter((key) => !(key in ko))).toEqual([])
  ```
  Both files define identical keys.

### Claim B Verdict
**SURVIVES**

---

## Claim C — The New Tests Are Falsifiable, Not Tautologies

### 1. Independence from Component Functions
In `src/components/review/WorkPackageBoard.test.tsx:129-131`, the readiness test does not import or invoke `packageReadiness`. It asserts:
```ts
expect(useAppStore.getState().review.packages[0]?.checklist[0]?.status).toBe('確認済')
expect(within(card).getByTestId('data-package-state')).toHaveTextContent(/^準備完了$/)
expect(within(card).queryByTestId('data-blocker')).toBeNull()
```
The expected value is specified independently by the test.

### 2. Exclusion of `準備完了（例外あり）` by `/^準備完了$/`
`@testing-library/jest-dom` implements `toHaveTextContent(regex)` using `regex.test(element.textContent)` (see `matchers.d.ts:402`). Because `/^準備完了$/` has `^` and `$` anchors, matching against `"準備完了（例外あり）"` evaluates to `false`. Substring matchers like `toHaveTextContent('準備完了')` matched both, but `/^準備完了$/` strictly excludes the exception state.

### 3. Stale-Notice Vacuous Pass Check
In `src/components/review/ReviewPane.test.tsx:768-803`:
- Target element is scoped to `within(screen.getByTestId(item.id))`, matching the `<article>` rendered by `ReviewPane.tsx:1158`.
- In the initial state (`itemValidity` = `有効`), `queryByText(notice)` asserts `toBeNull()`.
- After project update (`itemValidity` = `再検討必要`), `getByText(notice)` asserts `toBeInTheDocument()`. If the queried container did not render the notice, `getByText` would throw and fail the test. The test cannot pass vacuously.

### 4. WorkPackage Link-Select Test
In `WorkPackageBoard.test.tsx:137-157`:
- The test initializes the store with an empty packages list (`review: { ...emptyReviewState(), items: [item] }`).
- It opens the package creation form, adds a checklist row, selects the review item via the `<select>` element (`fireEvent.change(link, { target: { value: item.id } })`), and clicks save.
- The test asserts `review.packages[0]?.checklist[0]?.reviewItemIds` equals `[item.id]`.
- Because the package was not seeded in fixtures, the state was created exclusively by user interaction through the UI.

### Claim C Verdict
**SURVIVES**

---

## Claim D — UC25's New Checks Are Observations

### 1. Browser Diagnostics Blind Spots in `tests/e2e/uc25-joint-review.js`
- **Initial Page Session Dropped Entirely**: In lines 483-496:
  ```javascript
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  ...
  await page.setViewportSize({ width: 1440, height: 900 });
  await clearStore();
  await page.reload({ waitUntil: "domcontentloaded" });
  await installBrowserDiagnostics();
  ```
  During the initial `page.goto("http://localhost:3000")`, `installBrowserDiagnostics()` is **never called**, and `collectDiagnostics()` is **never called** before the reload at line 496. Any errors on the initial landing are dropped unobserved.
- **Late Installation on Every Reload**: At lines 496-497, 1137-1138, and 1184-1185, `installBrowserDiagnostics()` is called via `page.evaluate()` *after* `page.reload({ waitUntil: "domcontentloaded" })`. It is not an `addInitScript` / preload script. Any errors occurring during HTML script parsing, Next.js chunk execution, React component initialization, or React hydration prior to `domcontentloaded` fire *before* `window.addEventListener("error")` and `console.error` wrapping are installed. They are never recorded in `__uc25Diagnostics`.
- Consequently, `checks.noUnexpectedBrowserErrors` can be `true` while real browser errors occurred.

### 2. Superficial DOM Observations in `jointCanvas` and `findingFocus`
- **`checks.jointCanvas`** (`uc25-joint-review.js:524-529`): Evaluates canvas `aria-label`, CSS client dimensions (`canvasWidth > 0`, `canvasHeight > 0`), tab text, and column button attribute. It does not observe WebGL context validity, 3D render success, or whether any geometry was drawn.
- **`checks.findingFocus`** (`uc25-joint-review.js:834-840`): Only checks whether the React container attribute `data-review-focus="1"` changed from absent to present, plus canvas dimensions. It does not observe whether the camera animated to `focusTarget` (`Viewer3D.tsx:1360-1364`) or whether finding rebar highlighting was applied (`applyHighlight`).

### 3. Lingering Statements of Retracted "Z-Fighting" Cause
`step4-report.json:17` claims two comments in `uc25-joint-review.js` were corrected to remove the retracted z-fighting cause. However, statements asserting z-fighting as a fact remain in the repository:
- `phases/49-joint-review-defects/step4.md:37-38`:
  > *"접합부 장면은 겹친 철근 면의 z-fighting 때문에 같은 프레임을 두 번 그리지 못한다 — 실측 근거는 phases/48-joint-review-ui/step8-report.json#/desktop_host_run/repairs/1/measured에 있다."*
- `phases/48-joint-review-ui/step8-report.json:660`:
  > `"second_order_effect": "Coincident surfaces z-fight, so no frame of the joint is byte-reproducible."`
- `phases/48-joint-review-ui/index.json:83`:
  > `"...(the joint scene never renders two byte-identical frames because coincident rebar surfaces z-fight..."`

### Claim D Verdict
**REFUTED**

---

## Claim E — Scope

`git diff --name-only HEAD~1 HEAD` confirms that exactly 15 files were modified in commit `29ffe1b`:
- **Product Code (1 file)**: `src/components/review/ReviewPane.tsx` (lines 988-1000, 1113-1123)
- **Locales (2 files)**: `src/locales/ja.json` (line 442) and `src/locales/ko.json` (line 442)
- **Unit Tests (2 files)**: `src/components/review/ReviewPane.test.tsx`, `src/components/review/WorkPackageBoard.test.tsx`
- **E2E Tests & Docs (2 files)**: `tests/e2e/uc25-joint-review.js`, `tests/e2e/README.md`
- **Phase Reports & Metadata (8 files)**: `phases/index.json`, `phases/48-joint-review-ui/step8-report.json`, `phases/49-joint-review-defects/index.json`, `phases/49-joint-review-defects/step0-report.json` through `step4-report.json`

No modifications were made to any other product code in `src/domain/`, `src/lib/`, or `src/components/`.

### Claim E Verdict
**SURVIVES**

---

## Findings Outside the Five Claims

1. **`WorkPackageBoard.tsx` Lacks Joint Validation Guard**: `src/components/review/WorkPackageBoard.tsx:126-128` allows adding `{ kind: 'joint', columnMemberId: selection.memberId }` to a work package whenever `viewerMode === 'joint'`, without checking `resolveJoint(project, selection.memberId).status === 'joint'`. While `ReviewPane.tsx` was fixed to prevent invalid joint targets, `WorkPackageBoard.tsx` was left unguarded.
2. **Finding Selection Override in `ReviewPane.tsx:997`**: In `openDraft`, `const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null`. If a user selects column A while clicking "検討項目にする" on finding F belonging to column B, column A is targeted rather than the finding's member.
3. **Session Count Misstatement in `phases/49-joint-review-defects/index.json:40`**: The step 4 summary claims errors are accumulated across "all three page sessions". In reality, `tests/e2e/uc25-joint-review.js` executes 4 page sessions (1 initial `page.goto` at line 483, followed by 3 reloads at lines 496, 1137, and 1184). The initial session was omitted entirely.
4. **Diagnostics Accumulator Retention**: In `tests/e2e/uc25-joint-review.js:46-50`, `collectDiagnostics()` reads and appends errors from `window.__uc25Diagnostics` without clearing them in the page context, relying entirely on the subsequent `page.reload` to destroy the page window.
