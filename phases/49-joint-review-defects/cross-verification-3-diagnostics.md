# Verdict: Refutation Analysis of `uc25` Browser Diagnostics Check

**Target Repository:** `C:\Users\emper\mdtproject`  
**Branch:** `main`  
**Target Code:** Commit `29ffe1b` (`tests/e2e/uc25-joint-review.js`) plus uncommitted working tree diff (`git diff tests/e2e/uc25-joint-review.js`)  
**Role:** Independent Cross-Verifier (Read-Only Refutation)  
**Target Verdict Path:** `C:\Users\emper\AppData\Local\Temp\claude\C--Users-emper-mdtproject\9bd6a2f4-e482-40db-8e1a-0dea24e47e8a\scratchpad\v2-diagnostics-verdict.md`  

---

## Executive Summary of Verdicts

| Claim | Subject | Verdict | Summary |
|---|---|---|---|
| **Claim 1** | Every page session that the script drives is drained | **REFUTED** | The script drives 4 page sessions (1 `goto` + 3 `reload`s), not 3. Session 1 is never watched or drained. In Session 2, `collectDiagnostics()` runs before `clearStore()`, discarding errors unread upon reload. In Session 4, post-drain actions are uncollected. |
| **Claim 2** | The check can fail the run | **SURVIVES** | The check genuinely fails the run on normal execution when unexpected errors occur (via line 1380 throw). However, it is an end-of-run oracle: if an earlier scenario throws, the assignment is unreachable, and no diagnostics are reported. |
| **Claim 3** | What it does catch is worth catching | **REFUTED** | In practice, it catches almost nothing of real product regressions. Client product code in `src/` has zero `console.error` calls. Fatal errors crash earlier steps before reaching this check. Telemetry errors use `console.warn` (ignored). What remains is third-party noise or silent async rejections. |
| **Claim 4** | The accumulator cannot double-count or lose entries | **REFUTED** | `collectDiagnostics` does not clear in-page arrays on read. Calling it multiple times in one session duplicates all entries. Errors during `clearStore()` or post-drain actions are lost unread, as are all errors if an earlier step throws. |

---

## Contrast with Author's Stated Limits

In `phases/49-joint-review-defects/step4-report.json:78-83`, the author acknowledged four known limits:
1. *Unwatched first session:* Noted as predating step 4 (`tests/e2e/uc25-joint-review.js:500`).
2. *Document creation race:* Diagnostics hook runs after `domcontentloaded`, missing early script errors.
3. *Pre-captured `console.error`:* References held prior to hook registration bypass capture.
4. *Empty allowlist:* `ALLOWED_BROWSER_ERRORS` fails on any captured item.

**What the author's report missed:**
- **Falsified session count:** The author's summary in `phases/49-joint-review-defects/index.json:11` claimed errors are *"accumulated across all three page sessions"*. In reality, the script drives **four** page sessions.
- **Premature drainage in Session 2:** In `tests/e2e/uc25-joint-review.js:1157-1159`, `collectDiagnostics()` is called *before* `clearStore()`. Any error produced during database deletion is purged by reload unread.
- **Unmonitored post-drain activity in Session 4:** `collectDiagnostics()` runs at line 1350, but lines 1365–1368 continue driving page interactions (tab switching and viewport resizing) with zero error observation.
- **Failure blindness (absence of `try...finally`):** If any earlier scenario throws, the entire diagnostics check is bypassed; errors that caused or accompanied the failure are never evaluated.
- **Non-idempotent accumulator:** `collectDiagnostics()` copies entries additively without clearing the in-page array (lines 45–50). Multiple calls in the same session duplicate all entries.
- **Product architecture reality:** In `src/`, client code contains 0 calls to `console.error`. Telemetry warns via `console.warn` (`src/lib/telemetry.ts:241, 296`), which is ignored by the hook.

---

## Detailed Evaluation of Claims

### Claim 1 — "Every page session that the script drives is drained"

#### 1. Enumeration of Page Sessions
Tracking every navigation in `tests/e2e/uc25-joint-review.js`:

1. **Page Session 1 (Initial Landing):**
   - **Start:** `tests/e2e/uc25-joint-review.js:505`:
     ```javascript
     await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
     ```
   - **Operations:** Viewport configuration (`line 516`) and store clearing (`line 517`).
   - **End:** Terminated by `page.reload` at `line 518`.
   - **Diagnostics Status:** `installBrowserDiagnostics()` is **never called**. `collectDiagnostics()` is **never called**. This session is completely unmonitored and undrained.

2. **Page Session 2 (Baseline & Scenario Execution):**
   - **Start:** `tests/e2e/uc25-joint-review.js:518`:
     ```javascript
     await page.reload({ waitUntil: "domcontentloaded" });
     await installBrowserDiagnostics(); // line 519
     ```
   - **Operations:** Scenarios 1 through 15 (columns, girders, clearance check, section edit, bundle round-trip).
   - **Drain:** `tests/e2e/uc25-joint-review.js:1157`:
     ```javascript
     await collectDiagnostics();
     await clearStore(); // line 1158
     await page.reload({ waitUntil: "domcontentloaded" }); // line 1159
     ```
   - **End:** Terminated by reload at `line 1159`.

3. **Page Session 3 (Autosave & Persistence):**
   - **Start:** `tests/e2e/uc25-joint-review.js:1159`:
     ```javascript
     await page.reload({ waitUntil: "domcontentloaded" });
     await installBrowserDiagnostics(); // line 1160
     ```
   - **Operations:** Scenarios 15–16 (load bundle, verify autosave persistence).
   - **Drain:** `tests/e2e/uc25-joint-review.js:1205`:
     ```javascript
     await collectDiagnostics();
     await page.reload({ waitUntil: "domcontentloaded" }); // line 1206
     ```
   - **End:** Terminated by reload at `line 1206`.

4. **Page Session 4 (Legacy, Schema Rejection, Vocabulary & Verification):**
   - **Start:** `tests/e2e/uc25-joint-review.js:1206`:
     ```javascript
     await page.reload({ waitUntil: "domcontentloaded" });
     await installBrowserDiagnostics(); // line 1207
     ```
   - **Operations:** Scenarios 16–19 (legacy file import, incompatible schema rejection, status vocabulary).
   - **Drain:** `tests/e2e/uc25-joint-review.js:1350`:
     ```javascript
     await collectDiagnostics();
     ```
   - **Post-Drain Operations:** `tests/e2e/uc25-joint-review.js:1365-1368`:
     ```javascript
     await clickReviewTab();
     const screenshot = await saveScreenshot(await page.screenshot(), "uc25-joint-review.png");
     await page.setViewportSize(hostViewport);
     ```
   - **End:** Script terminates at `line 1381`.

#### 2. Discarded and Misplaced Collections
- **The True Session Count is 4, not 3:** The author's summary in `phases/49-joint-review-defects/index.json:11` asserts *"accumulated across all three page sessions"*. This miscounts the navigations; the script executes 1 `page.goto` and 3 `page.reload` calls, creating 4 distinct page sessions. Session 1 is completely discarded unread.
- **Session 2 Tail Discarded Unread:** In `tests/e2e/uc25-joint-review.js:1157-1159`:
  ```javascript
  1157: await collectDiagnostics();
  1158: await clearStore();
  1159: await page.reload({ waitUntil: "domcontentloaded" });
  ```
  `collectDiagnostics()` is placed **before** `clearStore()`. `clearStore()` executes `indexedDB.deleteDatabase("kijun")` inside a `page.evaluate` promise (`lines 204-213`). Any console error, unhandled rejection, or error event emitted by the browser during database deletion is recorded into `window.__uc25Diagnostics` *after* line 1157. The reload at line 1159 destroys the window object, discarding those diagnostics unread.
- **Session 4 Tail Discarded Unread:** In `tests/e2e/uc25-joint-review.js:1350-1368`, `collectDiagnostics()` runs at line 1350, after which `clickReviewTab()` (`line 1365`) and `setViewportSize()` (`line 1368`) trigger React re-renders and window resize handlers. Any error emitted during these final steps is trapped in `window.__uc25Diagnostics` and never collected or checked.

#### Verdict
**REFUTED**

---

### Claim 2 — "The check can fail the run"

#### 1. Tracing the Check to `UC25 FAILED CHECKS`
1. In `tests/e2e/uc25-joint-review.js:55-57`, `checks.noUnexpectedBrowserErrors` is initialized to `false`:
   ```javascript
   const checks = {
     jointCanvas: false,
     noUnexpectedBrowserErrors: false,
     ...
   };
   ```
2. In `tests/e2e/uc25-joint-review.js:1350-1358`, diagnostics are drained and evaluated:
   ```javascript
   await collectDiagnostics();
   const browserErrorTexts = [
     ...collectedDiagnostics.pageErrors.map((entry) => JSON.stringify(entry)),
     ...collectedDiagnostics.consoleErrors,
   ];
   const unexpectedBrowserErrors = browserErrorTexts.filter(
     (text) => !ALLOWED_BROWSER_ERRORS.some((allowed) => text.includes(allowed)),
   );
   checks.noUnexpectedBrowserErrors = unexpectedBrowserErrors.length === 0;
   ```
3. In `tests/e2e/uc25-joint-review.js:1374-1380`, the runner evaluates failure:
   ```javascript
   const failed = Object.entries(checks)
     .filter(([, ok]) => ok !== true)
     .map(([name]) => name);
   if (Object.keys(checks).length !== 20) {
     throw new Error(`UC25 expected twenty checks, found ${Object.keys(checks).length}`);
   }
   if (failed.length > 0) throw new Error("UC25 FAILED CHECKS: " + failed.join(", "));
   ```
4. If `unexpectedBrowserErrors.length > 0`, `checks.noUnexpectedBrowserErrors` evaluates to `false`. `failed` includes `"noUnexpectedBrowserErrors"`, and line 1380 throws:
   `Error: UC25 FAILED CHECKS: noUnexpectedBrowserErrors`.
   This path was verified in falsifiability mutation 2 (`phases/49-joint-review-defects/step4-report.json:44-48`).

#### 2. Reachability When an Earlier Scenario Throws
The test script runs top-level asynchronous statements without a global `try...catch` or `try...finally` block.
- If an earlier scenario throws (for example, `waitUntil` timeout at `line 201`: `throw new Error(\`UC25 TIMEOUT ${name}: ...\`)`, `waitForSelector` timeout, or camera blocker throw at `line 451, 475, 487`), Node/QuickJS aborts execution immediately.
- Lines 1350–1381 are never reached.
- **Value recorded:** In-memory `checks.noUnexpectedBrowserErrors` remains at its initial value `false` (`line 57`).
- **Does anything notice?** **No.** Neither `console.log(JSON.stringify({ checks }))` (`lines 1370-1371`) nor `UC25 FAILED CHECKS` (`line 1380`) executes. The process terminates with the unhandled scenario error. Any browser diagnostics accumulated prior to the crash are abandoned unread.

#### 3. Verdict Judgment
The claim states: *"The check can fail the run."*
On the normal execution path where the preceding scenarios complete, the check genuinely functions as an oracle and fails the run via `UC25 FAILED CHECKS: noUnexpectedBrowserErrors`. It is not dead code or a dummy boolean. It survives our attack on that ground, though with the severe structural finding that it is an end-of-run oracle rendered unreachable if any preceding step fails.

#### Verdict
**SURVIVES**

---

### Claim 3 — "What it does catch is worth catching"

#### 1. What the Diagnostics Check Misses
1. **All Fatal Application Errors:** If a component fails to render, throws during mounting, or crashes state management, required DOM elements disappear. The script times out at `waitForSelector` or `waitUntil` and crashes. Because there is no `try...finally`, `checks.noUnexpectedBrowserErrors` is never evaluated.
2. **Session 1 Errors:** Any crash during initial page load (`http://localhost:3000`), viewport configuration, or initial IndexedDB purge (`lines 505–518`) is missed because the hook is not yet installed.
3. **Pre-`domcontentloaded` Script & Hydration Errors:** Because `installBrowserDiagnostics()` is evaluated after `page.reload({ waitUntil: "domcontentloaded" })` (`line 519, 1160, 1207`), parse-time script errors and synchronous chunk load failures occurring during HTML parsing precede hook installation.
4. **Database Reset Errors:** As shown in Claim 1, errors during `clearStore()` (`line 1158`) are purged by reload before collection.
5. **Post-Collection Operations:** UI actions at lines 1365–1368 execute unmonitored.
6. **All `console.warn` Outputs:** Interception is strictly confined to `window.onerror`, `unhandledrejection`, and `console.error` (`lines 21–39`).

#### 2. What It Could Catch vs. What Exists in the Codebase
To be caught by this check, an error must:
- Occur during the monitored portions of Sessions 2, 3, or 4;
- Emit to `console.error`, `window.onerror`, or `unhandledrejection`;
- **Not** prevent any of the 19 UI scenarios from passing all DOM selectors, text assertions, card counts, and camera movements.

Let us examine what real code in `src/` emits such errors:
1. **Client-side `console.error` calls:**
   A codebase search via `rg -n "console\.error" src/` reveals exactly **one** occurrence in the entire repository:
   - `src/app/api/oncall/alert/route.ts:194`:
     ```typescript
     console.error(`oncall: 보상 삭제 실패 ${refName} — 재전송이 duplicate로 먹힌다`)
     ```
     This is a Next.js server route, running in Node.js on the server, not in the browser. In browser client code (`src/components/`, `src/domain/`, `src/lib/`, `src/rulepack/`), **there are zero calls to `console.error`**.
2. **Telemetry & Background Logging:**
   `src/lib/telemetry.ts:241, 296` logs errors and load failures using `console.warn`:
   ```typescript
   console.warn('PostHog telemetry failed to load — disabled for this session', error)
   ```
   `installBrowserDiagnostics` does not hook `console.warn`. Telemetry failures bypass the check completely.
3. **Production Next.js / React Runtime:**
   `uc25-joint-review.js` runs against a production build (`npm run build && next start`, `step4-report.json:28`). In production, React does not emit development warnings to `console.error`. If a component render throws, it unmounts and breaks DOM assertions, failing earlier scenarios.
4. **Three.js WebGL Errors:**
   WebGL shader compilation or context errors either crash rendering (failing `checks.jointCanvas` at line 528) or emit warnings to `console.warn`.

#### 3. Practical Value
The honest answer is that in this codebase and architecture, **this check catches almost nothing of real product regressions**. Real bugs break UI state (caught by the other 19 checks) or crash scenarios (bypassing this check). The only errors it can catch are harmless third-party library console noise or unhandled rejections in detached async tasks that do not affect the UI—and with `ALLOWED_BROWSER_ERRORS = []` (`line 53`), any benign third-party log will create a false positive.

#### Verdict
**REFUTED**

---

### Claim 4 — "The accumulator cannot double-count or lose entries"

#### 1. Double-Counting Vulnerability
In `tests/e2e/uc25-joint-review.js:44-50`:
```javascript
const collectedDiagnostics = { pageErrors: [], consoleErrors: [] };
const collectDiagnostics = async () => {
  const current = await page.evaluate(() => window.__uc25Diagnostics ?? null);
  if (current === null) return;
  collectedDiagnostics.pageErrors.push(...current.pageErrors);
  collectedDiagnostics.consoleErrors.push(...current.consoleErrors);
};
```
Notice that `collectDiagnostics`:
1. Reads `window.__uc25Diagnostics` from the page;
2. Appends entries into `collectedDiagnostics` via `.push(...)`;
3. **Never mutates or clears `window.__uc25Diagnostics` in the browser**.

**Sequence producing double-counting:**
If `collectDiagnostics()` is invoked more than once within the same page session (e.g., if a developer adds an intermediate check in Scenario 5 and another at Scenario 10, or calls it before and after a specific action), the second call reads the exact same array from `window.__uc25Diagnostics` and pushes all entries into `collectedDiagnostics` a second time.
- If error $E_1$ occurs, call 1 results in `collectedDiagnostics = [E_1]`.
- Later in the same session, call 2 pushes $E_1$ again, resulting in `collectedDiagnostics = [E_1, E_1]`.
Because the accumulator is a non-destructive read paired with an additive append, it is inherently non-idempotent within a page session.

#### 2. Entry Loss Sequences
Entries are lost under multiple concrete sequences:

1. **Sequence 1: Inter-Operation Window (Lines 1157–1159)**
   - `line 1157`: `await collectDiagnostics()` drains current errors.
   - `line 1158`: `await clearStore()` executes `indexedDB.deleteDatabase("kijun")` in the page (`lines 204-213`).
   - If an error or rejection occurs during `clearStore()`, it is pushed to `window.__uc25Diagnostics`.
   - `line 1159`: `await page.reload(...)` reloads the page.
   - **Result:** `window.__uc25Diagnostics` is garbage collected by the browser navigation. The error is **lost forever**.

2. **Sequence 2: Post-Drain Operations (Lines 1350–1368)**
   - `line 1350`: `await collectDiagnostics()` executes final collection.
   - `line 1358`: `checks.noUnexpectedBrowserErrors` is evaluated.
   - `lines 1365–1368`: `clickReviewTab()`, `page.screenshot()`, and `setViewportSize()` run in the browser.
   - **Result:** Any error triggered by tab clicking or viewport resizing is appended to `window.__uc25Diagnostics`, but `collectDiagnostics()` is never called again. The error is **lost unread**.

3. **Sequence 3: Scenario Failure Abort**
   - An error in the application causes an element wait to time out at Scenario 8.
   - The test script crashes with an unhandled exception.
   - **Result:** `collectDiagnostics()` is never called. All errors logged up to the crash point are **lost unread**.

4. **Sequence 4: Diagnostic Re-Registration Overwrite**
   - In `tests/e2e/uc25-joint-review.js:9-20`:
     ```javascript
     const diagnostics = { pageErrors: [], consoleErrors: [] };
     window.__uc25Diagnostics = diagnostics;
     ```
   - If `installBrowserDiagnostics()` is ever called twice within the same page session without a reload, it overwrites `window.__uc25Diagnostics` with an empty object, instantly destroying all previously accumulated errors.

#### Verdict
**REFUTED**

---

## Final Verdict Summary

- **Claim 1:** **REFUTED** — 4 page sessions exist; Session 1 is unwatched, Session 2 tail is discarded during `clearStore()`, Session 4 tail is uncollected.
- **Claim 2:** **SURVIVES** — The check genuinely fails the run on normal completion when unexpected errors occur, though it is blind to failures that crash earlier scenarios.
- **Claim 3:** **REFUTED** — Catches almost nothing of real product regression; client code has zero `console.error` calls, telemetry uses `console.warn`, and fatal errors crash earlier checks.
- **Claim 4:** **REFUTED** — Non-clearing read creates duplicate entries on multiple calls; inter-operation windows and unhandled throws drop entries unread.
