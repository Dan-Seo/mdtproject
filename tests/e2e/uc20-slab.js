// UC-20: 床板（スラブ） (ADR-028)
// 設計長さ・本数・継手箇所数の条文対照はゴールデンテストが見る。ここが見るのは
// 実ブラウザでしか出ないもの — 断面一覧で2方向×2面を入力できるか、内訳に4行が
// 立つか、単独床板と連続床板で継手の条文が入れ替わるか、平面で床板を選んでも
// 大梁・壁が選べたままか、部材ビューと建物ビューが落ちずに描くか。
const page = await browser.getPage("kijun");
// 自動保存 (IndexedDB) は前の走行を持ち越す。消してから始めないと、この筋書きは
// 「一度目だけ通る」ものになる — 再訪経路そのものを見る uc15 だけは自分で管理する。
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("kijun");
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    }),
);
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

// ── ① 断面一覧で床板の2方向×2面を入力できる ──────────────────────
const table = await page.evaluate(() => {
  const label = (aria) => document.querySelector(`[aria-label='${aria}']`);
  const value = (aria) => label(aria)?.value ?? null;
  return {
    thickness: value("S1 板厚 t"),
    xTop: [value("S1 X方向上端筋 径"), value("S1 X方向上端筋 ピッチ")],
    xBottom: [value("S1 X方向下端筋 径"), value("S1 X方向下端筋 ピッチ")],
    yTop: [value("S1 Y方向上端筋 径"), value("S1 Y方向上端筋 ピッチ")],
    yBottom: [value("S1 Y方向下端筋 径"), value("S1 Y方向下端筋 ピッチ")],
    finish: value("S1 仕上げ"),
    // 表5.3.6 の「スラブ、耐力壁以外の壁」行に屋内・屋外の区別はない (ADR-028)。
    hasExposure: label("S1 屋内外") !== null,
    // 床板は断面が板厚1つ。b×D の枠に押し込んでいないことの裏取り。
    hasSectionB: label("S1 断面 b") !== null,
    // 1通則3) が幅止筋の長さを与える部材の列挙に床板はない。
    hasWidthTie: label("S1 幅止め筋 径") !== null,
  };
});

checks.slabThicknessInput = table.thickness === "200";
checks.slabXInputs =
  table.xTop[0] === "D13" &&
  table.xTop[1] === "200" &&
  table.xBottom[0] === "D13" &&
  table.xBottom[1] === "200";
checks.slabYInputs =
  table.yTop[0] === "D13" &&
  table.yTop[1] === "200" &&
  table.yBottom[0] === "D13" &&
  table.yBottom[1] === "200";
checks.slabFinishInput = table.finish === "仕上げあり";
checks.noExposureOnSlab = table.hasExposure === false;
checks.noSectionDimensionOnSlab = table.hasSectionB === false;
checks.noWidthTieOnSlab = table.hasWidthTie === false;

// ── ② 内訳に4方向×面の行が立ち、床板のグループ見出しが t200 である ────
const rows = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) => ({
    id: r.getAttribute("data-testid"),
    text: r.textContent.replace(/\s+/g, " ").trim(),
  })),
);
const slabRoles = [
  "X方向上端筋",
  "X方向下端筋",
  "Y方向上端筋",
  "Y方向下端筋",
];
const roleRows = Object.fromEntries(
  slabRoles.map((role) => [role, rows.filter((r) => r.text.includes(role))]),
);

checks.allFourSlabRolesPresent = slabRoles.every(
  (role) => roleRows[role].length > 0,
);

const slabGroups = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='quantity-group-']")]
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter((text) => text.includes("床板")),
);
checks.slabGroupPresent = slabGroups.length > 0;
checks.slabSectionLabel =
  slabGroups.length > 0 && slabGroups.every((text) => text.includes("t200"));

// ── ③ 単独床板と連続床板で継手の条文が入れ替わる ─────────────────
// サンプルは Y方向に2ベイ連なるので、Y は 2（４）床板2) の区分表（1.5か所）、
// X は1ベイなので 1通則4) の長さ割りになる。
const spliceRows = rows.filter((r) => r.text.includes("箇所"));
const yContinuous = spliceRows.filter((r) => r.text.includes("Y方向"));
const xSingle = spliceRows.filter((r) => r.text.includes("X方向"));

checks.continuousSlabSplicePresent = yContinuous.length > 0;
// 内訳が出すのは1部材あたり ＝ 1本あたり箇所数 × 本数 なので、1.5か所 × 29本
// ＝ 43.5 になる。半端が残ること自体が 0.5 刻みの区分表を通った証拠だ。
checks.continuousSlabHalfPlace = yContinuous.some(
  (r) => r.text.includes("43.5") && r.text.includes("2（４）床板2)"),
);
// 単独床板の上端筋は 1通則4) に戻る — 条文が入れ替わっている。
checks.singleSlabUsesInterval = xSingle.some((r) =>
  r.text.includes("1通則4)"),
);
// 単独床板の下端筋は 5.9m で 6.0m に満たないので継手0か所 — 行が立たない。
checks.singleSlabBottomHasNoSplice = !xSingle.some((r) =>
  r.text.includes("X方向下端筋"),
);

// 算出式に条文が出る（出典表示は法的義務・ADR-003）。
const formulas = await page.evaluate(() => {
  const cells = [...document.querySelectorAll("[data-testid^='quantity-line-']")];
  const found = cells.find((cell) => cell.textContent.includes("Y方向下端筋"));
  if (!found) return null;
  const toggle = found.querySelector("button");
  if (toggle) toggle.click();
  return document.body.textContent;
});
checks.slabFormulaCitesClause =
  formulas !== null && formulas.includes("2（４）床板");

// ── ④ 開口部未計上の告知が床板も名指す (R14) ──────────────────────
const notice = await page.evaluate(() => {
  const el = document.querySelector("[data-testid='wall-opening-notice']");
  return el === null ? null : el.textContent.replace(/\s+/g, " ").trim();
});
checks.openingNoticeShown = notice !== null;
checks.openingNoticeNamesSlab = notice !== null && notice.includes("床板");
checks.openingNoticeCitesClause = notice !== null && notice.includes("1通則8)");

// ── ⑤ 平面で床板を選べ、大梁・壁も選べたままである ────────────────
const slabHandle = await page.$("[aria-label^='S1 ']");
checks.slabDrawnInPlan = slabHandle !== null;

let viewerMemberId = null;
let paneError = null;
if (slabHandle) {
  await slabHandle.click();
  await page.waitForTimeout(400);
  const selected = await page.evaluate(() => ({
    memberId:
      document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
    paneError:
      document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
    canvasLabel:
      document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
  }));
  viewerMemberId = selected.memberId;
  paneError = selected.paneError;
  checks.slabSelectionHasNoPaneError = selected.paneError === null;
  checks.slabViewerRenders = selected.canvasLabel !== null;
  checks.slabSelectedInViewer =
    viewerMemberId !== null && viewerMemberId.includes("S1");
}

// 床板の塗りが大梁・壁の掴める帯に載っていないこと。載せると平面から
// 大梁も壁も選べなくなる（壁で実際に起きた失敗と同じ形）。
const wallHandle = await page.$("[aria-label^='W1 ']");
let wallSelectedAfterSlab = null;
if (wallHandle) {
  const box = await wallHandle.boundingBox();
  await page.mouse.click(box.x + 5, box.y + box.height / 2);
  await page.waitForTimeout(400);
  wallSelectedAfterSlab = await page.evaluate(
    () =>
      document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
  );
}
checks.wallStillSelectableUnderSlab =
  wallSelectedAfterSlab !== null && wallSelectedAfterSlab.includes("W1");

// ── ⑥ 建物ビューでも落ちない ──────────────────────────────────────
const buildingTab = await page.$(
  "[role='tab'][aria-label='建物'], button:has-text('建物')",
);
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
      slabGroups,
      roleRows: Object.fromEntries(
        slabRoles.map((role) => [role, roleRows[role].map((r) => r.text)]),
      ),
      spliceRows: spliceRows.map((r) => r.text),
      notice,
      viewerMemberId,
      paneError,
      wallSelectedAfterSlab,
      building,
      checks,
    },
    null,
    2,
  ),
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc20-slab.png")));

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
