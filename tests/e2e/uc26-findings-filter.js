// UC-26: 所見表のフィルター (phase 50)。
//
// uc25 はフィルターバーに一度も触れない — フィルターが描画に失敗していても uc25 は同じだけ緑になる。
// この筋書きは「既定状態では現行と同一」と「絞り込みは実際に効いている」の両方を、本物のブラウザで
// 実測する。phase 50 step 6 はこれと同じ観察をセッション外のスクリプトで一度だけ取ったが、
// リポジトリに残らなかったので回帰を誰も見張れなかった。
//
// browser-only QuickJS script. dev-browser の page/evaluate 契約のみを使う。
// 本番サーバが http://localhost:3000 で動いていること。
const page = await browser.getPage("kijun");

const checks = {
  defaultStateIsFullTable: false,
  kindChipNarrowsAndRemovesOnlyThatKind: false,
  resetRestoresTableExactly: false,
  pairSelectNarrows: false,
  hideExcludedIsHonoured: false,
  emptyNoticeOutsideTableWhenNothingMatches: false,
  filterBarOutsideFindingsTable: false,
  noUnexpectedBrowserErrors: false,
};

const observations = {};
const ALLOWED_BROWSER_ERRORS = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    window.__uc26Diagnostics = diagnostics;
    window.addEventListener("error", (event) => {
      diagnostics.pageErrors.push({ message: event.message, filename: event.filename });
    });
    window.addEventListener("unhandledrejection", (event) => {
      diagnostics.pageErrors.push({ type: "unhandledrejection", reason: stringify(event.reason) });
    });
    const originalConsoleError = console.error.bind(console);
    console.error = (...args) => {
      diagnostics.consoleErrors.push(args.map(stringify).join(" "));
      originalConsoleError(...args);
    };
  });

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

const waitUntil = async (name, read, predicate, timeout = 20000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await read();
    if (predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`UC26 TIMEOUT ${name}: ${JSON.stringify(last)}`);
};

// 自動保存 (IndexedDB) は前の走行を持ち越す。消してから始めないと一度目だけ通る筋書きになる。
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await clearStore();
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await clearStore();
await page.reload({ waitUntil: "domcontentloaded" });
await installBrowserDiagnostics();
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const hostViewport = await page.evaluate(() => ({
  width: window.innerWidth,
  height: window.innerHeight,
}));
await page.setViewportSize({ width: 1440, height: 900 });

// uc25 と同じ標本 柱 を使う。ここが変わると下の期待件数の出どころも変わる。
await page.click("svg g[role='button'][aria-label*='1F-X2Y1']", { force: true });
await page.waitForSelector("svg g[role='button'][aria-label*='1F-X2Y1'][aria-pressed='true']");
await page.click("[aria-label='内訳書切替'] [role='tab']:has-text('検討')");
await page.waitForSelector("[data-testid='review-joint']");
await page.click("[data-testid='review-check'] button:has-text('検査を実行')");
await page.waitForSelector("[data-testid='review-findings-filter']");

// ---- 読み取り ----

const readFilterState = () =>
  page.evaluate(() => {
    const bar = document.querySelector("[data-testid='review-findings-filter']");
    const table = document.querySelector("[data-testid='review-findings']");
    const empty = document.querySelector("[data-testid='review-findings-empty']");
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])];
    const chips = [...(bar?.querySelectorAll("[role='group'] button") ?? [])].map((node) => ({
      label: (node.textContent ?? "").trim(),
      pressed: node.getAttribute("aria-pressed") === "true",
    }));
    const select = bar?.querySelector("select") ?? null;
    const resetButton = [...(bar?.querySelectorAll("button") ?? [])].find(
      (node) => (node.textContent ?? "").trim() === "フィルターを解除",
    );
    const checkbox = bar?.querySelector("input[type='checkbox']") ?? null;
    return {
      barPresent: bar !== null,
      // 指摘区分の列は 2 番目。uc25 の parseFindingRow と同じ並びを前提にする。
      kindsInTable: [
        ...new Set(rows.map((row) => (row.querySelectorAll("td")[1]?.textContent ?? "").trim())),
      ].sort(),
      rowCount: rows.length,
      tableText: (table?.textContent ?? "").replace(/\s+/g, " ").trim(),
      summary: (bar?.querySelector("[role='status']")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      chips,
      pairOptions: select === null ? [] : [...select.options].map((option) => option.value),
      pairValue: select === null ? null : select.value,
      resetDisabled: resetButton?.getAttribute("aria-disabled") ?? null,
      hideExcludedChecked: checkbox === null ? null : checkbox.checked,
      emptyPresent: empty !== null,
      // 空表示が表の中にあると uc25 の readFindingRows が 6 セル規則で落ちる。
      emptyInsideTable: empty === null ? false : table !== null && table.contains(empty),
      barInsideTable: bar === null ? null : table !== null && table.contains(bar),
    };
  });

const clickChip = (label) =>
  page.evaluate((text) => {
    const bar = document.querySelector("[data-testid='review-findings-filter']");
    const button = [...(bar?.querySelectorAll("[role='group'] button") ?? [])].find(
      (node) => (node.textContent ?? "").trim() === text,
    );
    if (!button) throw new Error("UC26 chip not found: " + text);
    button.click();
  }, label);

const clickReset = () =>
  page.evaluate(() => {
    const bar = document.querySelector("[data-testid='review-findings-filter']");
    const button = [...(bar?.querySelectorAll("button") ?? [])].find(
      (node) => (node.textContent ?? "").trim() === "フィルターを解除",
    );
    if (!button) throw new Error("UC26 reset button not found");
    button.click();
  });

const selectPair = (value) =>
  page.evaluate((pair) => {
    const select = document
      .querySelector("[data-testid='review-findings-filter']")
      ?.querySelector("select");
    if (!select) throw new Error("UC26 pair select not found");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    ).set;
    setter.call(select, pair);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);

const toggleHideExcluded = () =>
  page.evaluate(() => {
    const checkbox = document
      .querySelector("[data-testid='review-findings-filter']")
      ?.querySelector("input[type='checkbox']");
    if (!checkbox) throw new Error("UC26 hideExcluded checkbox not found");
    checkbox.click();
  });

// ---- 1. 既定状態 ----

const baseline = await waitUntil(
  "baseline",
  readFilterState,
  (value) => value.barPresent && value.rowCount > 0,
);
observations.baseline = { ...baseline, tableText: `${baseline.tableText.length} chars` };

checks.defaultStateIsFullTable =
  baseline.chips.length === 3 &&
  baseline.chips.every((chip) => chip.pressed) &&
  baseline.pairValue === "all" &&
  baseline.hideExcludedChecked === false &&
  baseline.resetDisabled === "true" &&
  baseline.emptyPresent === false &&
  baseline.summary === `${baseline.rowCount} / ${baseline.rowCount}件`;

// バーと空表示が表の中にあると uc25 の表読み取りが壊れる。ここで明示的に否定する。
checks.filterBarOutsideFindingsTable = baseline.barInsideTable === false;

// ---- 2. 区分チップは実際に絞り、その区分だけを消す ----

const removedKind = baseline.kindsInTable[0];
if (removedKind === undefined) throw new Error("UC26 baseline table has no kind column values");
const keptKinds = baseline.kindsInTable.filter((kind) => kind !== removedKind);
if (keptKinds.length === 0) {
  throw new Error(`UC26 sample check produced only one kind (${removedKind}); cannot narrow`);
}

await clickChip(removedKind);
const narrowed = await waitUntil(
  "narrowed",
  readFilterState,
  (value) => value.rowCount !== baseline.rowCount || value.emptyPresent,
);
observations.narrowed = { ...narrowed, tableText: `${narrowed.tableText.length} chars` };

checks.kindChipNarrowsAndRemovesOnlyThatKind =
  narrowed.rowCount > 0 &&
  narrowed.rowCount < baseline.rowCount &&
  !narrowed.kindsInTable.includes(removedKind) &&
  keptKinds.every((kind) => narrowed.kindsInTable.includes(kind)) &&
  narrowed.resetDisabled === "false" &&
  narrowed.summary === `${narrowed.rowCount} / ${baseline.rowCount}件`;

// ---- 3. 解除は表を元どおりに戻す ----

await clickReset();
const afterReset = await waitUntil(
  "afterReset",
  readFilterState,
  (value) => value.rowCount === baseline.rowCount,
);
observations.afterReset = { rowCount: afterReset.rowCount, summary: afterReset.summary };

checks.resetRestoresTableExactly =
  afterReset.tableText === baseline.tableText &&
  afterReset.rowCount === baseline.rowCount &&
  afterReset.resetDisabled === "true" &&
  afterReset.chips.every((chip) => chip.pressed) &&
  afterReset.pairValue === "all";

// ---- 4. ペア選択 ----

const pair = baseline.pairOptions.find((option) => option !== "all");
if (pair === undefined) throw new Error("UC26 pair select offers no concrete pair");
await selectPair(pair);
const byPair = await waitUntil(
  "byPair",
  readFilterState,
  (value) => value.pairValue === pair && value.rowCount !== baseline.rowCount,
);
observations.byPair = { pair, rowCount: byPair.rowCount, summary: byPair.summary };

checks.pairSelectNarrows =
  byPair.rowCount > 0 &&
  byPair.rowCount < baseline.rowCount &&
  byPair.summary === `${byPair.rowCount} / ${baseline.rowCount}件`;

await clickReset();
await waitUntil("resetAfterPair", readFilterState, (value) => value.rowCount === baseline.rowCount);

// ---- 5. 除外の非表示 ----
// 標本に除外がなければ件数は動かないのが正しい。動かないことを観察し、
// 除外があるときだけ「厳密に減る」を要求する。どちらの枝も表明を持つ。

const excludedCount = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("[data-testid='review-findings'] tbody tr")];
  // 除外理由の列は最終セル。空でない行が除外済み。
  return rows.filter((row) => {
    const cells = row.querySelectorAll("td");
    return (cells[cells.length - 1]?.textContent ?? "").trim() !== "";
  }).length;
});
await toggleHideExcluded();
const hidden = await waitUntil(
  "hideExcluded",
  readFilterState,
  (value) => value.hideExcludedChecked === true,
);
observations.hideExcluded = { excludedCount, rowCount: hidden.rowCount };

checks.hideExcludedIsHonoured =
  excludedCount > 0
    ? hidden.rowCount === baseline.rowCount - excludedCount
    : hidden.rowCount === baseline.rowCount;

await clickReset();
await waitUntil("resetAfterHide", readFilterState, (value) => value.rowCount === baseline.rowCount);

// ---- 6. すべての区分を外すと空表示が表の外に出る ----

for (const kind of baseline.chips.map((chip) => chip.label)) {
  await clickChip(kind);
}
const emptied = await waitUntil("emptied", readFilterState, (value) => value.rowCount === 0);
observations.emptied = {
  rowCount: emptied.rowCount,
  summary: emptied.summary,
  emptyPresent: emptied.emptyPresent,
  emptyInsideTable: emptied.emptyInsideTable,
};

checks.emptyNoticeOutsideTableWhenNothingMatches =
  emptied.rowCount === 0 &&
  emptied.emptyPresent === true &&
  emptied.emptyInsideTable === false &&
  emptied.summary === `0 / ${baseline.rowCount}件`;

await clickReset();
await waitUntil("resetAtEnd", readFilterState, (value) => value.rowCount === baseline.rowCount);

// ---- 7. ブラウザ診断 ----

const diagnostics = await page.evaluate(() => {
  const store = window.__uc26Diagnostics ?? null;
  if (store === null) return { pageErrors: [], consoleErrors: [] };
  return { pageErrors: [...store.pageErrors], consoleErrors: [...store.consoleErrors] };
});
const unexpectedBrowserErrors = [
  ...diagnostics.pageErrors.map((entry) => JSON.stringify(entry)),
  ...diagnostics.consoleErrors,
].filter((entry) => !ALLOWED_BROWSER_ERRORS.some((allowed) => entry.includes(allowed)));
checks.noUnexpectedBrowserErrors = unexpectedBrowserErrors.length === 0;
observations.browserDiagnostics = { ...diagnostics, unexpected: unexpectedBrowserErrors };

const screenshot = await saveScreenshot(await page.screenshot(), "uc26-findings-filter.png");
await page.setViewportSize(hostViewport);
observations.screenshot = screenshot;

console.log(JSON.stringify({ checks, observations }, null, 2));
console.log(JSON.stringify(checks));
console.log("SHOT " + screenshot);

const failed = Object.entries(checks)
  .filter(([, ok]) => ok !== true)
  .map(([name]) => name);
if (Object.keys(checks).length !== 8) {
  throw new Error(`UC26 expected eight checks, found ${Object.keys(checks).length}`);
}
if (failed.length > 0) throw new Error("UC26 FAILED CHECKS: " + failed.join(", "));
console.log("UC26 ALL CHECKS PASSED");
