// UC-25: joint review end-to-end flow.
//
// This script is intentionally a browser-only QuickJS script.  It uses the
// dev-browser page/evaluate/setInputFiles contract; it does not use Node fs,
// process, or module imports.  The production server must already be running
// at http://localhost:3000.
const page = await browser.getPage("kijun");

const installBrowserDiagnostics = () =>
  page.evaluate(() => {
    const stringify = (value) => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const diagnostics = { pageErrors: [], consoleErrors: [] };
    window.__uc25Diagnostics = diagnostics;
    window.addEventListener("error", (event) => {
      diagnostics.pageErrors.push({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      diagnostics.pageErrors.push({
        type: "unhandledrejection",
        reason: stringify(event.reason),
      });
    });
    const originalConsoleError = console.error.bind(console);
    console.error = (...args) => {
      diagnostics.consoleErrors.push(args.map(stringify).join(" "));
      originalConsoleError(...args);
    };
  });

// installBrowserDiagnostics はリロードのたびに新しい入れ物を作る。捨てる前に
// 読んで繋いでおかないと、最後のページ区間より前のエラーは誰も見ないままになる。
const collectedDiagnostics = { pageErrors: [], consoleErrors: [] };
const collectDiagnostics = async () => {
  const current = await page.evaluate(() => window.__uc25Diagnostics ?? null);
  if (current === null) return;
  collectedDiagnostics.pageErrors.push(...current.pageErrors);
  collectedDiagnostics.consoleErrors.push(...current.consoleErrors);
};

// ここに無いものは全部失敗にする。既知の無害な項目が出たらここに理由付きで足す。
const ALLOWED_BROWSER_ERRORS = [];

const checks = {
  jointCanvas: false,
  noUnexpectedBrowserErrors: false,
  reviewJointTwoGirdersAndReference: false,
  xrayDesignShapeAndSource: false,
  initialCheckFindings: false,
  clearanceRecheckFindings: false,
  findingFocus: false,
  checkStableAfterViewerPose: false,
  reviewItemConfirmed: false,
  packageReady: false,
  baselineCaptured: false,
  sectionEditCommitted: false,
  comparisonShowsImpactAndRecheck: false,
  packageBlockedByModelChange: false,
  displayStateStableAfterUiEdits: false,
  reviewBundleRoundTrip: false,
  autosaveReviewPersistence: false,
  legacyFileLoadsWithoutReview: false,
  incompatibleReviewRejectedWithoutMutation: false,
  statusVocabularyAndNotices: false,
};

const observations = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeFindingText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const parseFindingBarRef = (value) => {
  const parts = normalizeFindingText(value).split("/").map((part) => part.trim());
  if (parts.length !== 4) return null;
  const barMatch = /^#(\d+)$/.exec(parts[3]);
  if (barMatch === null) return null;
  const barIndex = Number(barMatch[1]);
  if (!Number.isInteger(barIndex)) return null;
  return {
    member: parts[0],
    role: parts[1],
    size: parts[2],
    barIndex,
  };
};

const parseFindingRow = (cells) => {
  if (!Array.isArray(cells) || cells.length < 6) return null;
  const a = parseFindingBarRef(cells[1]);
  const b = parseFindingBarRef(cells[2]);
  const gapText = normalizeFindingText(cells[3]);
  const gapMm = Number.parseFloat(gapText);
  if (a === null || b === null || !Number.isFinite(gapMm)) return null;
  return {
    kind: normalizeFindingText(cells[0]),
    a,
    b,
    gapText,
    gapMm,
    basis: normalizeFindingText(cells[4]),
    exclusionText: normalizeFindingText(cells[5]),
  };
};

const parseFindingRows = (rawRows) => rawRows.map((rawRow) => {
  const row = parseFindingRow(rawRow.cells);
  if (row === null) {
    throw new Error(`UC25 malformed finding row ${rawRow.index}`);
  }
  return row;
});

// PURE ORACLE HELPER BEGIN
const evaluateClearanceOracle = (input) => {
  const value = input ?? {};
  const isFiniteNumber = (candidate) => typeof candidate === "number" && Number.isFinite(candidate);
  const sameRef = (left, right) => left !== null && left !== undefined &&
    right !== null && right !== undefined &&
    left.member === right.member &&
    left.role === right.role &&
    left.size === right.size &&
    left.barIndex === right.barIndex;
  const hasUnorderedPair = (row, pair) => row !== null &&
    Array.isArray(pair) && pair.length === 2 &&
    ((sameRef(row.a, pair[0]) && sameRef(row.b, pair[1])) ||
      (sameRef(row.a, pair[1]) && sameRef(row.b, pair[0])));

  if (!isFiniteNumber(value.gapMm) || value.gapMm <= 1) {
    return { ok: false, reason: "derived gap must be finite and greater than one" };
  }
  if (!isFiniteNumber(value.lowMm) || !isFiniteNumber(value.highMm) ||
      value.lowMm !== value.gapMm - 1 || value.highMm !== value.gapMm + 1) {
    return { ok: false, reason: "thresholds are not derived from the gap" };
  }
  if (typeof value.initialCheckId !== "string" || value.initialCheckId === "" ||
      typeof value.lowCheckId !== "string" || value.lowCheckId === "" ||
      typeof value.highCheckId !== "string" || value.highCheckId === "") {
    return { ok: false, reason: "a check ID is missing" };
  }
  if (value.lowCheckId === value.initialCheckId ||
      value.highCheckId === value.initialCheckId ||
      value.highCheckId === value.lowCheckId) {
    return { ok: false, reason: "check IDs did not change across runs" };
  }
  if (!Array.isArray(value.pair) || value.pair.length !== 2 ||
      typeof value.scope !== "string" || value.scope.trim() === "" ||
      !Array.isArray(value.lowRows) || !Array.isArray(value.highRows)) {
    return { ok: false, reason: "oracle inputs are incomplete" };
  }

  const forbiddenLowRows = value.lowRows.filter((row) =>
    row?.kind === "あき不足候補" && hasUnorderedPair(row, value.pair));
  if (forbiddenLowRows.length > 0) {
    return { ok: false, reason: "low run contains the forbidden clearance pair" };
  }

  const expectedGapText = value.gapMm.toFixed(1);
  const escapedHigh = String(value.highMm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highValuePattern = new RegExp(`(^|[^0-9.])${escapedHigh}mm([^0-9.]|$)`);
  const highWitnesses = value.highRows.filter((row) => {
    if (row?.kind !== "あき不足候補" || !hasUnorderedPair(row, value.pair)) return false;
    if (row.gapText !== expectedGapText || row.gapMm !== Number(expectedGapText)) return false;
    if (!(row.gapMm > 0 && row.gapMm < value.highMm)) return false;
    const basis = typeof row.basis === "string" ? row.basis : "";
    if (!basis.includes("利用者入力") ||
        !highValuePattern.test(basis) ||
        !basis.includes(value.scope)) return false;
    return typeof row.exclusionText === "string" && row.exclusionText === "";
  });
  if (highWitnesses.length === 0) {
    return { ok: false, reason: "high run has no unexcluded matching witness" };
  }
  return {
    ok: true,
    witness: highWitnesses[0],
    lowForbiddenCount: forbiddenLowRows.length,
    highWitnessCount: highWitnesses.length,
  };
};
// PURE ORACLE HELPER END

const waitUntil = async (name, read, predicate, timeout = 20000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await read();
    if (predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`UC25 TIMEOUT ${name}: ${JSON.stringify(last)}`);
};

const clearStore = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("kijun");
        request.onsuccess = resolve;
        request.onerror = resolve;
        request.onblocked = resolve;
      }),
  );

const land = async () => {
  await page.waitForSelector("[data-testid='grand-total']");
  await page.waitForSelector("canvas");
};

const clickReviewTab = async () => {
  await page.click("[aria-label='内訳書切替'] [role='tab']:has-text('検討')");
  await page.waitForSelector("[data-testid='review-joint']");
};

const clickWorkTab = async () => {
  await page.click("[aria-label='内訳書切替'] [role='tab']:has-text('作業')");
  await page.waitForSelector("[data-testid='work-packages']");
};

const clickTakeoffTab = async () => {
  await page.click("[aria-label='内訳書切替'] [role='tab']:has-text('内訳書')");
  await page.waitForSelector("[data-testid='grand-total']");
};

const readCheckResult = () =>
  page.evaluate(() => {
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      checkId: text("[data-testid='review-check-id']"),
      findings: text("[data-testid='review-findings']"),
      verdicts: [...document.querySelectorAll("[data-review-verdict]")].map((node) =>
        node.textContent.replace(/\s+/g, " ").trim(),
      ),
      unchecked: text("[data-testid='review-unchecked']"),
    };
  });

const readFindingRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid='review-findings'] tbody tr")].map((row, index) => ({
      index,
      cells: [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
    })),
  );

const readFindingSnapshot = async () => ({
  ...(await readCheckResult()),
  rows: parseFindingRows(await readFindingRows()),
});

const readReviewCards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='review-item-']")].map((card) => ({
      id: card.getAttribute("data-testid"),
      status: card.querySelector("[data-review-status]")?.textContent?.trim() ?? "",
      statusAttribute: card.querySelector("[data-review-status]")?.getAttribute("data-review-status") ?? null,
      text: card.textContent.replace(/\s+/g, " ").trim(),
      reasonCount: card.querySelectorAll("ul li").length,
    })),
  );

const readPackageCards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='work-package-card-']")].map((card) => ({
      id: card.getAttribute("data-testid"),
      state: card.querySelector("[data-package-state]")?.textContent?.trim() ?? "",
      stateAttribute: card.querySelector("[data-package-state]")?.getAttribute("data-package-state") ?? null,
      blockers: [...card.querySelectorAll("[data-blocker]")].map((node) =>
        node.textContent.replace(/\s+/g, " ").trim(),
      ),
      text: card.textContent.replace(/\s+/g, " ").trim(),
    })),
  );

const readStoredBundle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("kijun", 1);
        open.onupgradeneeded = () => {
          try {
            open.transaction.abort();
          } catch {
            // The request will report the aborted open through onerror.
          }
        };
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          let transaction;
          try {
            transaction = open.result.transaction("project", "readonly");
          } catch {
            open.result.close();
            resolve(null);
            return;
          }
          let current = null;
          let review = null;
          const currentRequest = transaction.objectStore("project").get("current");
          const reviewRequest = transaction.objectStore("project").get("review");
          currentRequest.onsuccess = () => {
            current = typeof currentRequest.result === "string" ? currentRequest.result : null;
          };
          reviewRequest.onsuccess = () => {
            review = typeof reviewRequest.result === "string" ? reviewRequest.result : null;
          };
          transaction.oncomplete = () => {
            open.result.close();
            resolve({ current, review });
          };
          transaction.onerror = () => {
            open.result.close();
            resolve(null);
          };
        };
      }),
  );

// The QuickJS `Buffer` only accepts base64 input, which is why every other
// scenario in this directory passes `Buffer.from(x, "base64")`.  The saved 案件
// JSON carries Japanese text, so `btoa` alone is not enough — encode UTF-8
// first, in the page, which has both `TextEncoder` and `btoa`.
const loadJsonObject = async (value, name) => {
  const base64 = await page.evaluate((text) => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }, JSON.stringify(value));
  await page.setInputFiles("input[type='file'][accept*='json']", {
    name,
    mimeType: "application/json",
    buffer: Buffer.from(base64, "base64"),
  });
};

// The camera evidence cannot be pixels.  Measured on this build at the
// Scenario 7 close-up: eleven consecutive captures, eleven distinct hashes, with
// no input between them, with the pointer held down, and with the cut plane at
// its maximum.  No two frames of this scene were ever byte-identical, so frame
// equality can never settle and frame difference proves nothing.
//
// **Why the frames differ is not established.**  An earlier revision of this
// comment blamed z-fighting between coincident rebar surfaces.  An independent
// cross-verification refuted that as fitted after the fact: no camera position
// was ever logged, so a slowly moving camera was never ruled out by observation.
// The measurement above stands; the cause is open.  See
// phases/48-joint-review-ui/step8-cross-verification-antigravity.md.
//
// Ask the product instead.  The viewer's tooltip is produced by a raycast
// against the real geometry (Viewer3D handlePointerMove -> tooltipFromHit), so
// which bar sits under a fixed screen point is exact arithmetic on the camera,
// with no rasterisation in it.  Hovering reads that; it does not click, so it
// picks nothing and changes no product state.
const JOINT_CANVAS = "canvas[aria-label='接合部の配筋3D']";

const FINGERPRINT_POINTS = [[0.3, 0.35], [0.45, 0.5], [0.55, 0.45], [0.65, 0.6], [0.4, 0.65]];

// A press with no movement is trusted input with no rotation in it.  It exists
// only to reset the viewer's idle timer: Viewer3D turns auto-rotation on eight
// seconds after the last OrbitControls 'start'
// (AUTO_ROTATE_DELAY_MS), and a camera that drifts on its own would make the
// fingerprint differ without any drag.
const resetIdleTimer = async (box) => {
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.up();
};

const cameraFingerprint = async (box) => {
  const readings = [];
  for (const [fx, fy] of FINGERPRINT_POINTS) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await sleep(120);
    readings.push(
      await page.evaluate(() => {
        const tip = document.querySelector("[role='tooltip']");
        if (tip === null) return null;
        return {
          hidden: tip.hidden === true,
          text: (tip.textContent ?? "").replace(/\s+/g, " ").trim(),
        };
      }),
    );
  }
  return readings;
};

const CLIP_TOGGLE = "[aria-label='断面カット'] button:nth-of-type(1)";

const perturbViewer = async () => {
  // Move the cut before measuring the camera, which is the order Scenario 7
  // describes anyway.  That ordering was originally chosen for a reason that no
  // longer holds — the oracle here no longer compares rendered frames, so frame
  // repeatability is not a requirement of it, and the explanation once given for
  // that repeatability (z-fighting between coincident surfaces) was refuted.
  // The order is kept because the scenario prescribes it.
  const clipFacts = await page.evaluate(() => {
    const input = document.querySelector("input[aria-label='切断位置']");
    if (!input) return null;
    return { value: input.value, min: input.min, max: input.max };
  });
  if (clipFacts === null) throw new Error("UC25 missing clip position input");
  const clipBefore = clipFacts.value;
  await page.click(CLIP_TOGGLE);
  await page.focus("input[aria-label='切断位置']");
  const clipKey = Number(clipBefore) >= Number(clipFacts.max) ? "ArrowLeft" : "ArrowRight";
  await page.keyboard.press(clipKey);
  const clipAfter = await page.evaluate(
    () => document.querySelector("input[aria-label='切断位置']")?.value ?? null,
  );

  const canvasBox = await page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, JOINT_CANVAS);
  if (canvasBox === null) throw new Error("UC25 missing viewer canvas for camera drag");

  // Auto-rotation would move the camera without a drag, so reset the idle timer
  // first, then read the same screen points twice.  Two identical readings are
  // the gate that the fingerprint is a property of the camera and not of the
  // clock; without them a later difference would prove nothing.
  await resetIdleTimer(canvasBox);
  const fingerprintBefore = await cameraFingerprint(canvasBox);
  const fingerprintRepeat = await cameraFingerprint(canvasBox);
  if (JSON.stringify(fingerprintBefore) !== JSON.stringify(fingerprintRepeat)) {
    throw new Error(
      `UC25 camera evidence blocker: the scene changed under a still camera, so a later difference would not be the drag: ${JSON.stringify({ fingerprintBefore, fingerprintRepeat })}`,
    );
  }
  // A fingerprint that reads nothing anywhere cannot detect a camera move.
  if (!fingerprintBefore.some((reading) => reading !== null && !reading.hidden && reading.text !== "")) {
    throw new Error(
      `UC25 camera evidence blocker: no sampled point resolves to a rebar, so the camera oracle is blind: ${JSON.stringify(fingerprintBefore)}`,
    );
  }

  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.48,
    canvasBox.y + canvasBox.height * 0.48,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.57,
    canvasBox.y + canvasBox.height * 0.53,
  );
  await page.mouse.up();

  const fingerprintAfter = await cameraFingerprint(canvasBox);
  const cameraMoved = JSON.stringify(fingerprintBefore) !== JSON.stringify(fingerprintAfter);
  if (!cameraMoved) {
    throw new Error(
      `UC25 camera evidence blocker: the trusted drag left every sampled point on the same rebar: ${JSON.stringify({ fingerprintBefore, fingerprintAfter })}`,
    );
  }
  return {
    clipBefore,
    clipAfter,
    clipMoved: clipBefore !== clipAfter,
    cameraMoved,
    fingerprintBefore,
    fingerprintAfter,
  };
};

// Each scenario owns its IndexedDB starting point.  The first landing is only
// a handle on the database; the reload is the sample-project starting point.
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });

// Scenario 7 and 14 sample fixed fractions of the canvas and require a rebar
// under them, so the canvas has to be big enough for the joint to cover those
// points.  The window is therefore a declared fixture of this scenario rather
// than an assumption about the host, and it is restored at the end so the other
// scripts sharing this browser are unaffected.
const hostViewport = await page.evaluate(() => ({
  width: window.innerWidth,
  height: window.innerHeight,
}));
await page.setViewportSize({ width: 1440, height: 900 });
await clearStore();
await page.reload({ waitUntil: "domcontentloaded" });
await installBrowserDiagnostics();
await land();

// 1. Select the specified sample 柱 and enter the 接合部 viewer.
const columnLabel = await page.evaluate(() =>
  [...document.querySelectorAll("svg g[role='button']")]
    .map((node) => node.getAttribute("aria-label"))
    .find((label) => label?.includes("1F-X2Y1")) ?? null,
);
if (columnLabel === null) throw new Error("UC25 sample 柱 1F-X2Y1 is not exposed by the plan DOM");
await page.click("svg g[role='button'][aria-label*='1F-X2Y1']", { force: true });
await page.waitForSelector("svg g[role='button'][aria-label*='1F-X2Y1'][aria-pressed='true']");
await page.click("[aria-label='表示切替'] [role='tab']:has-text('接合部')");
await page.waitForSelector("canvas[aria-label='接合部の配筋3D']");
// 直前の waitForSelector が投げるからこの行は true でよい、とは書かない。
// checks はそれ自体が観察値でなければ記録として何も意味しない(phase 48 の C5)。
const jointViewerFacts = await page.evaluate((selector) => {
  const canvas = document.querySelector(selector);
  const tab = document.querySelector("[aria-label='表示切替'] [role='tab'][aria-selected='true']");
  const column = document.querySelector("svg g[role='button'][aria-pressed='true']");
  return {
    canvasLabel: canvas === null ? null : canvas.getAttribute("aria-label"),
    canvasWidth: canvas === null ? 0 : canvas.clientWidth,
    canvasHeight: canvas === null ? 0 : canvas.clientHeight,
    selectedTab: tab === null ? null : (tab.textContent ?? "").trim(),
    selectedColumn: column === null ? null : column.getAttribute("aria-label"),
  };
}, JOINT_CANVAS);
checks.jointCanvas =
  jointViewerFacts.canvasLabel === "接合部の配筋3D" &&
  jointViewerFacts.canvasWidth > 0 &&
  jointViewerFacts.canvasHeight > 0 &&
  jointViewerFacts.selectedTab === "接合部" &&
  (jointViewerFacts.selectedColumn ?? "").includes("1F-X2Y1");
observations.jointViewer = jointViewerFacts;
observations.columnLabel = columnLabel;

// 2. The selected column has exactly G1 and G2, and the reference list is visible.
await clickReviewTab();
const jointFacts = await page.evaluate(() => {
  const section = document.querySelector("[data-testid='review-joint']");
  const directList = section?.querySelector("ul");
  const beams = directList
    ? [...directList.querySelectorAll("li")].map((node) => node.textContent.trim())
    : [];
  const text = section?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return {
    beams,
    text,
    hasReference: text.includes("参考表示（検討対象外）"),
  };
});
checks.reviewJointTwoGirdersAndReference =
  jointFacts.beams.length === 2 &&
  jointFacts.beams.some((value) => value.includes("G1")) &&
  jointFacts.beams.some((value) => value.includes("G2")) &&
  jointFacts.hasReference;
observations.jointFacts = jointFacts;

// 3. Hover a 柱 主筋 quantity row and inspect the separate X-Ray columns/source link.
await clickTakeoffTab();
const clearanceFixtureControls = await page.evaluate(() => {
  const readUnique = (selector, name) => {
    const controls = [...document.querySelectorAll(selector)];
    if (controls.length !== 1) {
      throw new Error(`UC25 ${name} control count is ${controls.length}, expected one`);
    }
    return controls[0];
  };
  const sizeControl = readUnique("select[aria-label='C1 帯筋 径']", "C1 hoop size");
  const pitchControl = readUnique("input[aria-label='C1 帯筋 ピッチ']", "C1 hoop pitch");
  return {
    size: sizeControl.value,
    pitchText: pitchControl.value,
    pitchMm: Number(pitchControl.value),
  };
});
if (clearanceFixtureControls.size !== "D13" ||
    clearanceFixtureControls.pitchMm !== 100 ||
    clearanceFixtureControls.pitchText.trim() !== "100") {
  throw new Error(
    `UC25 synthetic fixture drift: ${JSON.stringify(clearanceFixtureControls)}`,
  );
}
const nominalDiameterMm = (designation) => {
  const match = /^D(\d+(?:\.\d+)?)$/.exec(String(designation).trim());
  if (match === null) throw new Error(`UC25 unsupported nominal designation: ${designation}`);
  const diameter = Number(match[1]);
  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`UC25 invalid nominal diameter: ${designation}`);
  }
  return diameter;
};
const clearancePitchMm = clearanceFixtureControls.pitchMm;
const clearanceDiameterMm = nominalDiameterMm(clearanceFixtureControls.size);
const clearanceGapMm = clearancePitchMm - clearanceDiameterMm;
if (!Number.isFinite(clearancePitchMm) || !Number.isFinite(clearanceDiameterMm) ||
    !Number.isFinite(clearanceGapMm) || clearanceGapMm <= 1) {
  throw new Error(
    `UC25 invalid synthetic clearance derivation: ${JSON.stringify({
      clearancePitchMm,
      clearanceDiameterMm,
      clearanceGapMm,
    })}`,
  );
}
await page.keyboard.press("Tab");
const focusedTab = await page.evaluate(() => {
  const reviewTab = [...document.querySelectorAll("[aria-label='内訳書切替'] [role='tab']")]
    .find((tab) => tab.textContent?.trim() === "検討");
  return {
    text: document.activeElement?.textContent?.trim() ?? null,
    role: document.activeElement?.getAttribute("role") ?? null,
    activeIsReviewTab: reviewTab !== undefined && document.activeElement === reviewTab,
    connected: reviewTab?.isConnected ?? false,
  };
});
if (!focusedTab.activeIsReviewTab || !focusedTab.connected) {
  throw new Error(`UC25 review tab is not the active focused element: ${JSON.stringify(focusedTab)}`);
}
const quantityRowPoint = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")].find((candidate) => {
    const text = candidate.textContent ?? "";
    return text.includes("柱") && text.includes("主筋");
  });
  if (!row) return null;
  row.scrollIntoView({ block: "center" });
  const rect = row.getBoundingClientRect();
  return {
    testId: row.getAttribute("data-testid"),
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
});
if (quantityRowPoint === null) throw new Error("UC25 could not find a 柱 主筋 quantity row");
// The row is wider than its pane, so its own centre is not necessarily a
// visible point: on a narrow window it lands outside the viewport, no
// mouseenter fires, and the X-Ray wait below times out against an empty pane.
// page.hover() targets the visible part of the element, whatever the window
// size, so this scenario does not depend on the host's window width.
await page.hover(`[data-testid="${quantityRowPoint.testId}"]`);
const beforeEnter = await page.evaluate(() => {
  const reviewTab = [...document.querySelectorAll("[aria-label='内訳書切替'] [role='tab']")]
    .find((tab) => tab.textContent?.trim() === "検討");
  return {
    active: document.activeElement?.textContent?.trim() ?? null,
    activeIsReviewTab: reviewTab !== undefined && document.activeElement === reviewTab,
    takeoff: document.querySelector('[data-testid="grand-total"]') !== null,
    reviewJoint: document.querySelector('[data-testid="review-joint"]') !== null,
    xray: document.querySelector('[data-testid="review-xray"]') !== null,
  };
});
if (!beforeEnter.activeIsReviewTab || !beforeEnter.takeoff || beforeEnter.reviewJoint || beforeEnter.xray) {
  throw new Error(`UC25 focused-tab pre-Enter state is invalid: ${JSON.stringify(beforeEnter)}`);
}
await page.keyboard.press("Enter");
await page.waitForSelector('[data-testid="review-joint"]');
const afterEnter = await page.evaluate(() => {
  const reviewTab = [...document.querySelectorAll("[aria-label='内訳書切替'] [role='tab']")]
    .find((tab) => tab.textContent?.trim() === "検討");
  const pane = document.querySelector('[data-testid="review-joint"]');
  return {
    paneMounted: pane !== null,
    active: document.activeElement?.textContent?.trim() ?? null,
    activeIsReviewTab: reviewTab !== undefined && document.activeElement === reviewTab,
  };
});
if (!afterEnter.paneMounted || !afterEnter.activeIsReviewTab) {
  throw new Error(`UC25 focused-tab Enter did not mount the review pane: ${JSON.stringify(afterEnter)}`);
}
const xrayFacts = await waitUntil(
  "X-Ray hover",
  () =>
    page.evaluate(() => {
      const section = document.querySelector("[data-testid='review-xray']");
      const text = section?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const sources = section ? [...section.querySelectorAll("a[href]")] : [];
      return {
        text,
        cards: section?.querySelectorAll("article").length ?? 0,
        sourceLinks: sources.length,
        sourcesClickable: sources.every((link) => getComputedStyle(link).pointerEvents !== "none"),
      };
    }),
  (value) => value.cards > 0,
);
checks.xrayDesignShapeAndSource =
  xrayFacts.text.includes("設計（数量積算基準）") &&
  xrayFacts.text.includes("形状（3D）") &&
  xrayFacts.text.includes("一致しない") &&
  xrayFacts.sourceLinks > 0 &&
  xrayFacts.sourcesClickable;
observations.quantityRowPoint = quantityRowPoint;
observations.focusedTab = focusedTab;
observations.xrayActivation = { beforeEnter, afterEnter };
observations.xrayFacts = xrayFacts;

// 4. Run without a clearance basis and retain the exact first result.
await clickReviewTab();
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
const initialResult = await waitUntil(
  "initial geometry check",
  readCheckResult,
  (value) => value.checkId !== "" && value.findings.includes("干渉候補"),
);
const initialClearanceUndecidable = initialResult.verdicts.some((value) =>
  value.includes("判断不可（あき基準未入力）"),
);
checks.initialCheckFindings =
  initialResult.verdicts.length === 3 &&
  initialClearanceUndecidable &&
  initialResult.unchecked.includes("継手位置") &&
  !initialResult.findings.includes("あき不足候補");
const checkId0 = initialResult.checkId;
const findings0 = initialResult.findings;
const verdicts0 = initialResult.verdicts;
const initialRows = parseFindingRows(await readFindingRows());
observations.checkId0 = checkId0;
observations.findings0 = findings0;
observations.verdicts0 = verdicts0;
observations.initialFindingRowCount = initialRows.length;

// 5. Use only the ordinary clearance control with independently derived fixture thresholds.
const clearanceScopeFacts = await page.evaluate(() => {
  const controls = [...document.querySelectorAll("input[aria-label='範囲']")];
  if (controls.length !== 1) {
    throw new Error(`UC25 clearance scope control count is ${controls.length}, expected one`);
  }
  return { value: controls[0].value };
});
const clearanceScope = clearanceScopeFacts.value.trim();
if (clearanceScope === "") throw new Error("UC25 clearance scope is not visible");

const clearanceLowMm = clearanceGapMm - 1;
await page.fill("input[aria-label='鉄筋のあき（利用者入力）']", String(clearanceLowMm));
await page.click("[data-testid='review-check'] h2");
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
const lowResult = await waitUntil(
  "low clearance geometry check",
  readFindingSnapshot,
  (value) => value.checkId !== "" && value.checkId !== checkId0,
);
const clearanceHighMm = clearanceGapMm + 1;
await page.fill("input[aria-label='鉄筋のあき（利用者入力）']", String(clearanceHighMm));
await page.click("[data-testid='review-check'] h2");
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
const highResult = await waitUntil(
  "high clearance geometry check",
  readFindingSnapshot,
  (value) => value.checkId !== "" && value.checkId !== checkId0 && value.checkId !== lowResult.checkId,
);
const expectedHoopPair = [
  { member: "C1", role: "帯筋", size: "D13", barIndex: 0 },
  { member: "C1", role: "帯筋", size: "D13", barIndex: 1 },
];
const clearanceOracle = evaluateClearanceOracle({
  initialCheckId: checkId0,
  lowCheckId: lowResult.checkId,
  highCheckId: highResult.checkId,
  gapMm: clearanceGapMm,
  lowMm: clearanceLowMm,
  highMm: clearanceHighMm,
  scope: clearanceScope,
  pair: expectedHoopPair,
  lowRows: lowResult.rows,
  highRows: highResult.rows,
});
if (!clearanceOracle.ok) {
  throw new Error(`UC25 clearance oracle failed: ${JSON.stringify(clearanceOracle)}`);
}
// The high run is the existing second result; all downstream row actions remain first-row actions.
const secondResult = highResult;
const checkId1 = secondResult.checkId;
const findings1 = secondResult.findings;
const verdicts1 = secondResult.verdicts;
checks.clearanceRecheckFindings =
  checkId1 !== checkId0 &&
  findings1.includes("あき不足候補") &&
  findings1.includes("利用者入力") &&
  clearanceOracle.ok;
const clearanceOracleEvidence = {
  fixture: {
    sizeControl: clearanceFixtureControls.size,
    pitchControl: clearanceFixtureControls.pitchText,
    syntheticFact: true,
  },
  derivation: {
    pitchMm: clearancePitchMm,
    diameterMm: clearanceDiameterMm,
    gapMm: clearanceGapMm,
  },
  thresholds: { lowMm: clearanceLowMm, highMm: clearanceHighMm },
  scope: clearanceScope,
  pairLabels: expectedHoopPair.map((ref) => `${ref.member} / ${ref.role} / ${ref.size} / #${ref.barIndex}`),
  witness: {
    kind: clearanceOracle.witness.kind,
    a: clearanceOracle.witness.a,
    b: clearanceOracle.witness.b,
    gapText: clearanceOracle.witness.gapText,
    basis: clearanceOracle.witness.basis,
    exclusionText: clearanceOracle.witness.exclusionText,
  },
  checkIds: { initial: checkId0, low: lowResult.checkId, high: checkId1 },
  predicate: {
    lowForbiddenCount: clearanceOracle.lowForbiddenCount,
    highWitnessCount: clearanceOracle.highWitnessCount,
  },
};
observations.clearanceFixture = {
  ...clearanceFixtureControls,
  diameterMm: clearanceDiameterMm,
  gapMm: clearanceGapMm,
};
observations.clearanceOracle = clearanceOracleEvidence;
observations.clearanceInput = clearanceHighMm;
observations.checkId1 = checkId1;
observations.findings1 = findings1;
observations.verdicts1 = verdicts1;
console.log("UC25 CLEARANCE_ORACLE " + JSON.stringify(clearanceOracleEvidence));

// 6. A finding row focuses the joint viewer.
// 焦点が「行を押したから付いた」ことを示すには、押す前に付いていなかったことも
// 見ておく必要がある。後だけ見ると、初めから付いていた場合と区別できない。
const focusBefore = await page.evaluate(
  () => document.querySelector("[data-review-focus='1']") !== null,
);
await page.click("[data-testid='review-findings'] tbody tr:nth-of-type(1)", { force: true });
await page.waitForSelector("[data-review-focus='1']");
await page.waitForSelector("canvas[aria-label='接合部の配筋3D']");
const findingFocusFacts = await page.evaluate((selector) => {
  const canvas = document.querySelector(selector);
  return {
    focused: document.querySelector("[data-review-focus='1']") !== null,
    canvasLabel: canvas === null ? null : canvas.getAttribute("aria-label"),
    canvasWidth: canvas === null ? 0 : canvas.clientWidth,
    canvasHeight: canvas === null ? 0 : canvas.clientHeight,
  };
}, JOINT_CANVAS);
checks.findingFocus =
  focusBefore === false &&
  findingFocusFacts.focused === true &&
  findingFocusFacts.canvasLabel === "接合部の配筋3D" &&
  findingFocusFacts.canvasWidth > 0 &&
  findingFocusFacts.canvasHeight > 0;
observations.findingFocus = { focusBefore, ...findingFocusFacts };

// 7. Negative case: clip movement and a real camera drag must not rerun the check.
const viewerPerturbation = await perturbViewer();
await clickTakeoffTab();
await clickReviewTab();
const remountedCheckState = await page.evaluate(() => ({
  checkIdMounted: document.querySelector("[data-testid='review-check-id']") !== null,
  findingsMounted: document.querySelector("[data-testid='review-findings']") !== null,
}));
if (remountedCheckState.checkIdMounted || remountedCheckState.findingsMounted) {
  throw new Error(
    `UC25 check result was not cleared by ReviewPane remount: ${JSON.stringify(remountedCheckState)}`,
  );
}
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
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
observations.viewerPerturbation = viewerPerturbation;
observations.remountedCheckState = remountedCheckState;
observations.stableResult = stableResult;

// 8. Turn the first finding into one review item and confirm it with a local by.
await page.click("[data-testid='review-findings'] tbody tr:nth-of-type(1) button:has-text('検討項目にする')");
await page.waitForSelector("[data-testid='review-items'] input[aria-label='タイトル']");
await page.click("[data-testid='review-items'] form button[type='submit']");
const itemCreated = await waitUntil(
  "review item creation",
  readReviewCards,
  (cards) => cards.length === 1 && cards[0].statusAttribute === "未確認",
);
await page.click("[data-testid^='review-item-'] button:has-text('確認')");
await page.fill("input[aria-label='確認者（ローカル入力・本人認証ではない）']", "UC25 reviewer");
await page.click("[data-testid^='review-item-'] button:has-text('確認を保存')");
const confirmedCards = await waitUntil(
  "review item confirmation",
  readReviewCards,
  (cards) => cards.length === 1 && cards[0].statusAttribute === "確認済",
);
checks.reviewItemConfirmed =
  itemCreated.length === 1 &&
  itemCreated[0].statusAttribute === "未確認" &&
  confirmedCards.length === 1 &&
  confirmedCards[0].statusAttribute === "確認済";
observations.itemId = confirmedCards[0]?.id ?? null;

// 9. Create one linked, required work package and confirm its checklist item.
await clickWorkTab();
await page.click("button:has-text('作業パッケージを追加')");
const packageForm = "[data-testid='work-package-form']";
await page.fill(`${packageForm} label:has-text('作業パッケージ名') input`, "UC25 joint review");
await page.fill(`${packageForm} label:has-text('担当者') input`, "UC25 reviewer");
await page.click(`${packageForm} button:has-text('現在の選択を追加')`);
await page.click(`${packageForm} button:has-text('チェックリスト項目を追加')`);
await page.fill("input[aria-label='チェックリスト項目 1']", "Review the selected joint");
const reviewItemOption = await page.evaluate(() =>
  [...document.querySelectorAll("select[aria-label='関連する検討項目 1'] option")]
    .find((option) => option.value !== "")?.value ?? null,
);
if (reviewItemOption === null) throw new Error("UC25 work package form did not expose the review item option");
await page.selectOption("select[aria-label='関連する検討項目 1']", reviewItemOption);
const selectedReviewItemId = await page.evaluate(
  () => document.querySelector("select[aria-label='関連する検討項目 1']")?.value ?? null,
);
if (selectedReviewItemId !== reviewItemOption) {
  throw new Error("UC25 work package form did not retain the selected review item");
}
await page.click(`${packageForm} button[type='submit']`);
const packageCards = await waitUntil(
  "work package creation",
  readPackageCards,
  (cards) => cards.length === 1,
);
const packageCardId = packageCards[0].id;
if (packageCardId === null) throw new Error("UC25 work package card has no data-testid");
const packageCard = `[data-testid='${packageCardId}']`;
const packageCardFacts = await page.evaluate((selector) => {
  const card = document.querySelector(selector);
  return {
    target: card?.textContent?.includes("1F-X2Y1") ?? false,
    required: card?.textContent?.includes("必須") ?? false,
  };
}, packageCard);
const packageDraftFacts = {
  ...packageCardFacts,
  linkedItem: selectedReviewItemId === reviewItemOption,
};
// This checklist entry is linked. WorkPackageBoard only opens the confirmer
// form for an unlinked entry; a linked status change commits immediately.
await page.selectOption(`${packageCard} select[aria-label='チェックリスト状態']`, "確認済");
const readyPackageCards = await waitUntil(
  "work package readiness",
  readPackageCards,
  (cards) => cards.length === 1 && cards[0].stateAttribute === "準備完了",
);
checks.packageReady =
  packageDraftFacts.target &&
  packageDraftFacts.required &&
  packageDraftFacts.linkedItem &&
  readyPackageCards[0].stateAttribute === "準備完了";
observations.packageId = packageCardId;
observations.packageDraftFacts = {
  ...packageDraftFacts,
  selectedReviewItemId,
};

// 10. Fix a labeled baseline.
await clickReviewTab();
const baselineLabel = "UC25 baseline before section edit";
await page.fill("input[aria-label='基準案ラベル']", baselineLabel);
await page.click("button:has-text('現在案を基準案として固定')");
const baselineFacts = await waitUntil(
  "baseline capture",
  () =>
    page.evaluate(() => ({
      text: document.querySelector("[data-testid='review-compare']")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      label: document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? "",
    })),
  (value) => value.label === baselineLabel,
);
checks.baselineCaptured = baselineFacts.label === baselineLabel;
observations.baselineLabel = baselineLabel;

// 11. Change the actual SectionTable C1 b field from its sample value.
const sectionBefore = await page.evaluate(
  () => document.querySelector("input[aria-label='C1 断面 b']")?.value ?? null,
);
await page.fill("input[aria-label='C1 断面 b']", "900");
const sectionAfter = await waitUntil(
  "C1 b edit",
  () => page.evaluate(() => document.querySelector("input[aria-label='C1 断面 b']")?.value ?? null),
  (value) => value === "900",
);
checks.sectionEditCommitted = sectionBefore === "800" && sectionAfter === "900";
observations.sectionB = { before: sectionBefore, after: sectionAfter };

// 12. Compare, recheck the item, and verify the recheck-only filter retains it.
const impactFacts = await waitUntil(
  "compare impact after section edit",
  () =>
    page.evaluate(() => {
      const members = document.querySelectorAll("[data-testid='review-compare-members'] tbody tr");
      const compareText = document.querySelector("[data-testid='review-compare']")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const card = document.querySelector("[data-testid^='review-item-']");
      const status = card?.querySelector("[data-review-status]");
      return {
        memberCount: members.length,
        compareText,
        hasSupportColumnPath: compareText.includes("支持柱"),
        itemStatus: status?.getAttribute("data-review-status") ?? null,
        itemReasonCount: card?.querySelectorAll("ul li").length ?? 0,
      };
    }),
  (value) =>
    value.memberCount >= 1 &&
    value.hasSupportColumnPath &&
    value.itemStatus === "再検討必要" &&
    value.itemReasonCount >= 1,
);
await page.click("[data-testid='review-items'] input[type='checkbox']");
const filteredItemCount = await waitUntil(
  "recheck-only item filter",
  () => page.evaluate(() => document.querySelectorAll("[data-testid^='review-item-']").length),
  (value) => value === 1,
);
checks.comparisonShowsImpactAndRecheck =
  impactFacts.memberCount >= 1 &&
  impactFacts.hasSupportColumnPath &&
  impactFacts.itemStatus === "再検討必要" &&
  impactFacts.itemReasonCount >= 1 &&
  filteredItemCount === 1;
observations.impactFacts = impactFacts;
observations.filteredItemCount = filteredItemCount;

// 13. The linked package is now blocked by the stale review item.
await clickWorkTab();
const blockedPackageFacts = await waitUntil(
  "package stale blocker",
  readPackageCards,
  (cards) =>
    cards.length === 1 &&
    cards[0].stateAttribute === "準備未完" &&
    cards[0].blockers.some((value) => value.includes("前モデルの検討が残っている")),
);
checks.packageBlockedByModelChange =
  blockedPackageFacts[0].stateAttribute === "準備未完" &&
  blockedPackageFacts[0].blockers.some((value) => value.includes("前モデルの検討が残っている"));
observations.blockedPackageFacts = blockedPackageFacts;

// 14. Negative case: clip/camera/note display edits do not change review or package state.
await clickReviewTab();
const beforeDisplay = {
  cards: await readReviewCards(),
};
await clickWorkTab();
const beforeDisplayPackages = await readPackageCards();
const displayPerturbation = await perturbViewer();
await clickTakeoffTab();
const noteLabel = await page.evaluate(
  () => document.querySelector("input[aria-label$=' 備考']")?.getAttribute("aria-label") ?? null,
);
if (noteLabel === null) throw new Error("UC25 could not find a quantity note input");
await page.fill(`input[aria-label='${noteLabel}']`, "UC25 display-only note");
const editedNote = await waitUntil(
  "quantity note edit",
  () => page.evaluate((selector) => document.querySelector(selector)?.value ?? null, `input[aria-label='${noteLabel}']`),
  (value) => value === "UC25 display-only note",
);
await clickReviewTab();
const afterDisplay = await readReviewCards();
await clickWorkTab();
const afterDisplayPackages = await readPackageCards();
const displayStateStable =
  beforeDisplay.cards.length === afterDisplay.length &&
  beforeDisplay.cards.every((before, index) =>
    before.statusAttribute === afterDisplay[index]?.statusAttribute &&
    before.status === afterDisplay[index]?.status,
  ) &&
  beforeDisplayPackages.length === afterDisplayPackages.length &&
  beforeDisplayPackages.every((before, index) =>
    before.stateAttribute === afterDisplayPackages[index]?.stateAttribute &&
    before.state === afterDisplayPackages[index]?.state,
  );
checks.displayStateStableAfterUiEdits =
  displayPerturbation.clipMoved &&
  displayPerturbation.cameraMoved &&
  editedNote === "UC25 display-only note" &&
  displayStateStable;
observations.displayEdits = {
  displayPerturbation,
  noteLabel,
  editedNote,
  beforeReview: beforeDisplay.cards,
  afterReview: afterDisplay,
  beforePackages: beforeDisplayPackages,
  afterPackages: afterDisplayPackages,
};

// 15. Save the complete review bundle, check its shape, and import the same JSON.
const storedBeforeSave = await waitUntil(
  "stored bundle before export",
  readStoredBundle,
  (value) => value !== null && value.current !== null,
);
const storedCurrent = JSON.parse(storedBeforeSave.current);
await page.evaluate(() => {
  window.__uc25SavedBlob = null;
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__uc25SavedBlob = blob;
    return originalCreateObjectURL(blob);
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__uc25SavedDownload = { filename: this.download, clicked: true };
      return;
    }
    return originalClick.call(this);
  };
});
await page.click("button:has-text('案件を保存')");
await page.waitForFunction(() => window.__uc25SavedBlob !== null, { timeout: 20000 });
const savedJson = await page.evaluate(async () => window.__uc25SavedBlob.text());
const savedBundle = JSON.parse(savedJson);
const savedShape = {
  items: savedBundle.review?.items?.length ?? null,
  packages: savedBundle.review?.packages?.length ?? null,
  baseline: savedBundle.review?.baseline?.label ?? null,
  reviewSchemaVersion: savedBundle.review?.reviewSchemaVersion ?? null,
  schemaVersion: savedBundle.schemaVersion ?? null,
  storedSchemaVersion: storedCurrent.schemaVersion ?? null,
};
const savedShapeValid =
  savedShape.items === 1 &&
  savedShape.packages === 1 &&
  savedShape.baseline === baselineLabel &&
  savedShape.reviewSchemaVersion === 1 &&
  savedShape.schemaVersion !== null &&
  savedShape.storedSchemaVersion !== null &&
  savedShape.schemaVersion === savedShape.storedSchemaVersion;

await collectDiagnostics();
await clearStore();
await page.reload({ waitUntil: "domcontentloaded" });
await installBrowserDiagnostics();
await land();
await loadJsonObject(savedBundle, "uc25-saved-review.json");
await clickReviewTab();
const roundTripReview = await waitUntil(
  "review bundle round trip",
  readReviewCards,
  (cards) => cards.length === 1 && cards[0].statusAttribute === "再検討必要",
);
const roundTripBaseline = await page.evaluate(
  () => document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? null,
);
await clickWorkTab();
const roundTripPackages = await waitUntil(
  "work package round trip",
  readPackageCards,
  (cards) => cards.length === 1 && cards[0].stateAttribute === "準備未完",
);
checks.reviewBundleRoundTrip =
  savedShapeValid &&
  roundTripReview.length === 1 &&
  roundTripReview[0].statusAttribute === "再検討必要" &&
  roundTripBaseline === baselineLabel &&
  roundTripPackages.length === 1 &&
  roundTripPackages[0].stateAttribute === "準備未完";
observations.savedShape = savedShape;
observations.roundTrip = {
  review: roundTripReview,
  baseline: roundTripBaseline,
  packages: roundTripPackages,
};

// 16. The imported review is also persisted in IndexedDB and survives reload.
const autosavedBundle = await waitUntil(
  "review autosave",
  readStoredBundle,
  (value) => {
    if (value === null || value.review === null) return false;
    try {
      return JSON.parse(value.review).items.length === 1;
    } catch {
      return false;
    }
  },
);
await collectDiagnostics();
await page.reload({ waitUntil: "domcontentloaded" });
await installBrowserDiagnostics();
await land();
await clickReviewTab();
const autosaveReview = await waitUntil(
  "review after autosave reload",
  readReviewCards,
  (cards) => cards.length === 1 && cards[0].statusAttribute === "再検討必要",
);
const autosaveBaseline = await page.evaluate(
  () => document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? null,
);
await clickWorkTab();
const autosavePackages = await waitUntil(
  "package after autosave reload",
  readPackageCards,
  (cards) => cards.length === 1 && cards[0].stateAttribute === "準備未完",
);
checks.autosaveReviewPersistence =
  autosavedBundle !== null &&
  autosaveReview.length === 1 &&
  autosaveReview[0].statusAttribute === "再検討必要" &&
  autosaveBaseline === baselineLabel &&
  autosavePackages.length === 1 &&
  autosavePackages[0].stateAttribute === "準備未完";
observations.autosave = {
  storedReview: JSON.parse(autosavedBundle.review),
  review: autosaveReview,
  baseline: autosaveBaseline,
  packages: autosavePackages,
};

// 17. Negative case: the legacy project JSON has no review key.
const legacyBundle = JSON.parse(savedJson);
delete legacyBundle.review;
await loadJsonObject(legacyBundle, "uc25-legacy-project.json");
await clickReviewTab();
const legacyReview = await waitUntil(
  "legacy file review reset",
  readReviewCards,
  (cards) => cards.length === 0,
);
const legacyBaseline = await page.evaluate(
  () => document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? null,
);
await clickWorkTab();
const legacyPackages = await waitUntil(
  "legacy file package reset",
  readPackageCards,
  (cards) => cards.length === 0,
);
await clickTakeoffTab();
const legacyTakeoffFacts = await page.evaluate(() => ({
  lines: document.querySelectorAll("[data-testid^='quantity-line-']").length,
  headerAlert: document.querySelector("header [role='alert']")?.textContent?.trim() ?? null,
}));
checks.legacyFileLoadsWithoutReview =
  legacyReview.length === 0 &&
  legacyPackages.length === 0 &&
  legacyBaseline === null &&
  legacyTakeoffFacts.lines > 0 &&
  legacyTakeoffFacts.headerAlert === null;
observations.legacy = { review: legacyReview, baseline: legacyBaseline, packages: legacyPackages, takeoff: legacyTakeoffFacts };

// 18. Negative case: an unsupported review schema rejects the file without mutation.
await clickReviewTab();
const beforeIncompatible = await page.evaluate(() => ({
  projectName: document.querySelector("header div[class*='projectName']")?.textContent?.trim() ?? null,
  itemCount: document.querySelectorAll("[data-testid^='review-item-']").length,
  packageCount: 0,
  baseline: document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? null,
}));
await clickWorkTab();
beforeIncompatible.packageCount = (await readPackageCards()).length;
const incompatibleBundle = JSON.parse(savedJson);
incompatibleBundle.review.reviewSchemaVersion = 2;
await loadJsonObject(incompatibleBundle, "uc25-incompatible-review.json");
await page.waitForSelector("header [role='alert']");
const afterIncompatible = await page.evaluate(() => ({
  alert: document.querySelector("header [role='alert']")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
  projectName: document.querySelector("header div[class*='projectName']")?.textContent?.trim() ?? null,
}));
await clickReviewTab();
const afterIncompatibleReview = {
  itemCount: (await readReviewCards()).length,
  baseline: await page.evaluate(
    () => document.querySelector("[data-testid='review-compare'] dd")?.textContent?.trim() ?? null,
  ),
};
await clickWorkTab();
const afterIncompatiblePackages = (await readPackageCards()).length;
checks.incompatibleReviewRejectedWithoutMutation =
  afterIncompatible.alert?.includes("読み込めませんでした") === true &&
  afterIncompatible.projectName === beforeIncompatible.projectName &&
  afterIncompatibleReview.itemCount === beforeIncompatible.itemCount &&
  afterIncompatibleReview.baseline === beforeIncompatible.baseline &&
  afterIncompatiblePackages === beforeIncompatible.packageCount;
observations.incompatible = {
  before: beforeIncompatible,
  after: {
    ...afterIncompatible,
    review: afterIncompatibleReview,
    packageCount: afterIncompatiblePackages,
  },
};

// Restore the valid saved bundle so step 19 checks all four data-* families in
// their real tab-local DOMs after the negative import cases.
await loadJsonObject(savedBundle, "uc25-final-valid-review.json");
await clickReviewTab();
await page.waitForSelector("[data-testid^='review-item-']");
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
await page.waitForSelector("[data-testid='review-verdict']");
const reviewVocabulary = await page.evaluate(() => ({
  verdicts: [...document.querySelectorAll("[data-review-verdict]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
  statuses: [...document.querySelectorAll("[data-review-status]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
  notices: [...document.querySelectorAll("[data-review-notice]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
}));
await clickWorkTab();
await page.waitForSelector("[data-testid^='work-package-card-']");
const workVocabulary = await page.evaluate(() => ({
  packageStates: [...document.querySelectorAll("[data-package-state]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
  blockers: [...document.querySelectorAll("[data-blocker]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
  notices: [...document.querySelectorAll("[data-review-notice]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
}));
const forbiddenVocabulary = ["合格", "安全", "承認", "施工可能", "適合"];
const stateTexts = [
  ...reviewVocabulary.verdicts,
  ...reviewVocabulary.statuses,
  ...workVocabulary.packageStates,
  ...workVocabulary.blockers,
];
checks.statusVocabularyAndNotices =
  reviewVocabulary.verdicts.length === 3 &&
  reviewVocabulary.statuses.length === 1 &&
  workVocabulary.packageStates.length === 1 &&
  workVocabulary.blockers.length >= 1 &&
  stateTexts.every((value) => forbiddenVocabulary.every((word) => !value.includes(word))) &&
  reviewVocabulary.notices.length === 1 &&
  workVocabulary.notices.length === 1 &&
  reviewVocabulary.notices[0].includes("構造安全") &&
  workVocabulary.notices[0].includes("準備完了");
observations.vocabulary = { review: reviewVocabulary, work: workVocabulary, forbiddenVocabulary };

await collectDiagnostics();
const browserErrorTexts = [
  ...collectedDiagnostics.pageErrors.map((entry) => JSON.stringify(entry)),
  ...collectedDiagnostics.consoleErrors,
];
const unexpectedBrowserErrors = browserErrorTexts.filter(
  (text) => !ALLOWED_BROWSER_ERRORS.some((allowed) => text.includes(allowed)),
);
checks.noUnexpectedBrowserErrors = unexpectedBrowserErrors.length === 0;
observations.browserDiagnostics = {
  ...collectedDiagnostics,
  allowed: ALLOWED_BROWSER_ERRORS,
  unexpected: unexpectedBrowserErrors,
};

await clickReviewTab();
const screenshot = await saveScreenshot(await page.screenshot(), "uc25-joint-review.png");
// Hand the shared browser back at the size it was found at.
await page.setViewportSize(hostViewport);
observations.screenshot = screenshot;
console.log(JSON.stringify({ checks, observations }, null, 2));
console.log(JSON.stringify(checks));
console.log("SHOT " + screenshot);

const failed = Object.entries(checks)
  .filter(([, ok]) => ok !== true)
  .map(([name]) => name);
if (Object.keys(checks).length !== 20) {
  throw new Error(`UC25 expected twenty checks, found ${Object.keys(checks).length}`);
}
if (failed.length > 0) throw new Error("UC25 FAILED CHECKS: " + failed.join(", "));
console.log("UC25 ALL CHECKS PASSED");
