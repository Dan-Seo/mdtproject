// UC-18: 開口部（数量積算基準 1通則8)）(ADR-028)
// 欠除の算術はゴールデンテストが見る。ここが見るのは実ブラウザでしか出ないもの —
// 平面で壁・床板を選ぶと開口部の入力が出るか、開口を足すと内訳の行が欠除量ごとに
// 割れるか、開口を横切った縦筋の継手が 2（５）壁1)② 但書で 0か所になるか、
// 床板の開口が平面に実寸で描かれるか、部材ビューと建物ビューが落ちずに描くか。
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

const rows = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
  );
const clickByText = (text) =>
  page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === label,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);

// ── ① 何も選ばないうちは開口部の入力が出ない ────────────────────────
const beforeSelect = await page.evaluate(() => ({
  hint: document.querySelector("[data-testid='opening-editor-hint']") !== null,
  editor: document.querySelector("[data-testid='opening-editor']") !== null,
}));
checks.hintBeforeSelection = beforeSelect.hint && !beforeSelect.editor;

// サンプルには内法の違う耐震壁が複数あるので、行数は絶対値ではなく差で見る。
// 質量の行と「箇所」の行は別に数える — 継手は行の型ごと別だからだ。
const verticalRows = async () => {
  const all = await rows();
  return {
    mass: all.filter((text) => text.includes("縦筋") && !text.includes("箇所")),
    splice: all.filter((text) => text.includes("縦筋") && text.includes("箇所")),
  };
};
const wallRowsBefore = await verticalRows();
checks.wallStartsWithMassAndSpliceRows =
  wallRowsBefore.mass.length > 0 && wallRowsBefore.splice.length > 0;

// ── ② 壁を選ぶと開口部を入力できる ────────────────────────────────
const wallHandle = await page.$("[aria-label^='W1 ']");
checks.wallInPlan = wallHandle !== null;
if (wallHandle) {
  const box = await wallHandle.boundingBox();
  await page.mouse.click(box.x + 5, box.y + box.height / 2);
  await page.waitForTimeout(400);
}
const afterSelect = await page.evaluate(() => {
  const editor = document.querySelector("[data-testid='opening-editor']");
  return {
    present: editor !== null,
    legend: editor?.querySelector("legend")?.textContent?.trim() ?? null,
  };
});
checks.editorAppearsForWall = afterSelect.present;
// 内法（柱面間 5200 × 階高−大梁せい 3450）を見出しに出す — 開口はこの中に入る。
checks.editorShowsClearSize =
  afterSelect.legend !== null &&
  afterSelect.legend.includes("5200") &&
  afterSelect.legend.includes("3450");

// ── ③ 開口を足すと内訳が欠除量ごとに割れる ────────────────────────
checks.addButtonFound = await clickByText("開口部を追加");
await page.waitForTimeout(500);

const wallRowsAfter = await verticalRows();
// 開口を入れた壁の縦筋だけが「欠ける本」と「欠けない本」に割れる — 質量の行が
// 1つ増える（前文「規格、形状、寸法等ごとに」）。
checks.verticalMassRowSplits =
  wallRowsAfter.mass.length === wallRowsBefore.mass.length + 1;
checks.deductionRowCitesClause = wallRowsAfter.mass.some((text) =>
  text.includes("1通則8)"),
);

// 既定の開口は内法の 1/3（1733×1150 ＝ 1.99㎡）なので 0.5㎡ を超えて欠除する。
const openingValues = await page.evaluate(() => {
  const value = (suffix) =>
    document.querySelector(`[aria-label$='${suffix}']`)?.value ?? null;
  return {
    width: value("1 内法幅"),
    height: value("1 内法高さ"),
    x: value("1 位置 X"),
    y: value("1 位置 Y"),
  };
});
checks.defaultOpeningFitsInside =
  Number(openingValues.x) + Number(openingValues.width) <= 5200 &&
  Number(openingValues.y) + Number(openingValues.height) <= 3450;

// ── ④ 開口を横切った縦筋の継手が 0か所になる (2（５）壁1)② 但書) ─────
// 断たれた本は開口部腰壁・垂れ壁の縦筋になるので継手の行が立たない —
// 質量の行が1つ増えたのに「箇所」の行は増えないことがその証拠である。
const spliceRows = wallRowsAfter.splice;
checks.openingVerticalHasNoSplice =
  spliceRows.length === wallRowsBefore.splice.length;

// ── ⑤ 0.5㎡以下に縮めると欠除が消える (1通則8) 但書) ────────────────
await page.evaluate(() => {
  const set = (suffix, value) => {
    const input = document.querySelector(`[aria-label$='${suffix}']`);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  set("1 内法幅", "700");
  set("1 内法高さ", "700");
});
await page.waitForTimeout(500);

const smallOpeningRows = await verticalRows();
const smallOpening = {
  ignoredShown: await page.evaluate(() =>
    document.body.textContent.includes("0.5㎡以下"),
  ),
  mass: smallOpeningRows.mass.length,
  splice: smallOpeningRows.splice.length,
};
checks.smallOpeningMarkedIgnored = smallOpening.ignoredShown;
// 但書で欠除しないので、開口がなかったときの行数に戻る。
checks.smallOpeningDeductsNothing =
  smallOpening.mass === wallRowsBefore.mass.length &&
  smallOpening.splice === wallRowsBefore.splice.length;

// ── ⑥ 告知が「欠除は計上・開口補強筋は未計上」を言う (R14) ───────────
const notice = await page.evaluate(() => {
  const el = document.querySelector("[data-testid='wall-opening-notice']");
  return el === null ? null : el.textContent.replace(/\s+/g, " ").trim();
});
checks.noticeShown = notice !== null;
checks.noticeNamesReinforcement =
  notice !== null && notice.includes("開口補強筋");
checks.noticeCitesClause = notice !== null && notice.includes("1通則8)");

// ── ⑦ 床板の開口が平面に実寸で描かれる ──────────────────────────────
const slabHandle = await page.$("[aria-label^='S1 ']");
if (slabHandle) {
  await slabHandle.click();
  await page.waitForTimeout(400);
}
checks.editorAppearsForSlab = await page.evaluate(
  () => document.querySelector("[data-testid='opening-editor']") !== null,
);
await clickByText("開口部を追加");
await page.waitForTimeout(500);

const slabOpening = await page.evaluate(() => {
  const rects = [
    ...document.querySelectorAll("svg rect[class*='opening']"),
  ].map((rect) => ({
    width: Number(rect.getAttribute("width")),
    height: Number(rect.getAttribute("height")),
  }));
  return rects;
});
// ベイは内法 5600×5600 の正方形なので、既定の開口も正方形に写る。
checks.slabOpeningDrawnInPlan = slabOpening.length === 1;
checks.slabOpeningKeepsProportion =
  slabOpening.length === 1 &&
  Math.abs(slabOpening[0].width - slabOpening[0].height) < 1;

// ── ⑧ 部材ビュー・建物ビューが落ちない ──────────────────────────────
const memberView = await page.evaluate(() => ({
  paneError:
    document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
  canvasLabel:
    document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
}));
checks.memberViewRenders = memberView.canvasLabel !== null;
checks.memberViewHasNoPaneError = memberView.paneError === null;

const buildingTab = await page.$(
  "[role='tab'][aria-label='建物'], button:has-text('建物')",
);
if (buildingTab) {
  await buildingTab.click();
  await page.waitForTimeout(700);
}
const building = await page.evaluate(() => ({
  paneError:
    document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
  canvasLabel:
    document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
}));
checks.buildingViewRenders = building.canvasLabel !== null;
checks.buildingViewHasNoPaneError = building.paneError === null;

console.log(
  JSON.stringify(
    {
      wallRowsBefore,
      wallRowsAfter,
      spliceRows,
      openingValues,
      smallOpening,
      notice,
      slabOpening,
      memberView,
      building,
      checks,
    },
    null,
    2,
  ),
);
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc18-opening.png")),
);

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
