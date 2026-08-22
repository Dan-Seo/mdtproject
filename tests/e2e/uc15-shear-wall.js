// UC-15: 耐震壁 (ADR-024)
// 設計長さ・本数の条文対照はゴールデンテストが見る。ここが見るのは実ブラウザでしか
// 出ないもの — 断面一覧で壁を入力できるか、内訳に縦筋・横筋の行が立つか、
// 開口部未計上の告知が常に出ているか、平面と 3D が壁を描いて選べるか。
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

// ── ① 断面一覧で壁を入力できる ────────────────────────────────────
const table = await page.evaluate(() => {
  const label = (aria) => document.querySelector(`[aria-label='${aria}']`);
  return {
    thickness: label("W1 壁厚 t")?.value ?? null,
    verticalSize: label("W1 縦筋 径")?.value ?? null,
    verticalPitch: label("W1 縦筋 ピッチ")?.value ?? null,
    horizontalSize: label("W1 横筋 径")?.value ?? null,
    horizontalPitch: label("W1 横筋 ピッチ")?.value ?? null,
    layers: label("W1 配筋層数")?.value ?? null,
    // 壁は b×D を持たない — 柱・大梁の枠を流用していないことの裏取り。
    hasGirderDepthInput: label("W1 断面 せい") !== null,
    // 幅止め筋は本数の条文が梁しか名指さないので壁には置かない (ADR-024)。
    hasWidthTieInput: label("W1 幅止め筋 径") !== null,
  };
});

checks.wallThicknessInput = table.thickness === "200";
checks.wallVerticalInput =
  table.verticalSize === "D13" && table.verticalPitch === "200";
checks.wallHorizontalInput =
  table.horizontalSize === "D13" && table.horizontalPitch === "200";
checks.wallLayersInput = table.layers === "2";
checks.noGirderDimensionOnWall = table.hasGirderDepthInput === false;
checks.noWidthTieOnWall = table.hasWidthTieInput === false;

// ── ② 内訳に縦筋・横筋の行が立つ ──────────────────────────────────
const rows = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) => ({
    id: r.getAttribute("data-testid"),
    text: r.textContent.replace(/\s+/g, " ").trim(),
  })),
);
const verticalRows = rows.filter((r) => r.text.includes("縦筋"));
const horizontalRows = rows.filter((r) => r.text.includes("横筋"));

checks.verticalRowPresent = verticalRows.length > 0;
checks.horizontalRowPresent = horizontalRows.length > 0;

// 断面の書き方は明細行ではなくグループ見出しが持つ。壁は厚さ1つなので
// 「t200」— b×D の枠に押し込んでいないことの裏取りである。
const wallGroups = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='quantity-group-']")]
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter((text) => text.includes("耐震壁")),
);
checks.wallGroupPresent = wallGroups.length > 0;
checks.wallSectionLabel =
  wallGroups.length > 0 && wallGroups.every((text) => text.includes("t200"));

// ── ③ 開口部未計上の告知が常に出る (R14) ──────────────────────────
const notice = await page.evaluate(() => {
  const el = document.querySelector("[data-testid='wall-opening-notice']");
  return el === null ? null : el.textContent.replace(/\s+/g, " ").trim();
});
checks.openingNoticeShown = notice !== null;
checks.openingNoticeCitesClause =
  notice !== null && notice.includes("1通則8)");

// ── ④ 平面で壁を選ぶと部材ビューが壁に切り替わる ──────────────────
const wallHandle = await page.$("[aria-label^='W1 ']");
checks.wallDrawnInPlan = wallHandle !== null;

let viewerMemberId = null;
let selectedRow = null;
let wallClickPoint = null;
if (wallHandle) {
  // 壁は通り芯の両側の面線で描かれるので、グループの**中心**は通り芯＝大梁の上だ。
  // Playwright の click() は要素中心を押すため大梁を掴んでしまう — 利用者が実際に
  // 押す場所（面線の上）を押す。大梁のヒット領域(片側9px)の外側であること自体が
  // 壁を選べる条件なので、ここはその条件の検証でもある。
  const box = await wallHandle.boundingBox();
  wallClickPoint = { x: box.x + 5, y: box.y + box.height / 2 };
  await page.mouse.click(wallClickPoint.x, wallClickPoint.y);
  await page.waitForTimeout(400);
  const selected = await page.evaluate(() => ({
    // ビューアの部材 id 表示には testid がないので、既存の e2e (uc9) と
    // 同じくクラス名で拾う。
    memberId:
      document
        .querySelector("[class*='memberId']")
        ?.textContent?.trim() ?? null,
    paneError:
      document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
    canvasLabel:
      document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
    groupRow: [
      ...document.querySelectorAll("[data-testid^='quantity-group-']"),
    ]
      .filter((el) => el.getAttribute("aria-selected") === "true")
      .map((el) => el.textContent.replace(/\s+/g, " ").trim()),
  }));
  viewerMemberId = selected.memberId;
  selectedRow = selected.groupRow;
  // 壁を選んで例外にならないこと自体が要点だ — 部材ビューの union に
  // 耐震壁を足さないと「大梁ではない」で throw する。
  checks.wallSelectionHasNoPaneError = selected.paneError === null;
  checks.wallViewerRenders = selected.canvasLabel !== null;
  checks.wallSelectedInViewer =
    viewerMemberId !== null && viewerMemberId.includes("W1");
}

// ── ⑤ 建物ビューでも落ちない ──────────────────────────────────────
const buildingTab = await page.$("[role='tab'][aria-label='建物'], button:has-text('建物')");
if (buildingTab) {
  await buildingTab.click();
  await page.waitForTimeout(600);
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
      table,
      verticalRows: verticalRows.map((r) => r.text),
      horizontalRows: horizontalRows.map((r) => r.text),
      wallGroups,
      notice,
      viewerMemberId,
      selectedRow,
      wallClickPoint,
      building,
      checks,
    },
    null,
    2,
  ),
);
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc15-shear-wall.png")),
);

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
