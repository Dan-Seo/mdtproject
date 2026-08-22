// UC-14: 日本固有詳細 幅止め筋·腹筋 (M3c)
// 유닛테스트가 보는 것(設計長さ·設計本数의 조문 대조)은 골든테스트가 이미 본다.
// 여기서는 실 브라우저에서만 드러나는 것 — 断面一覧에서 실제로 고를 수 있는가,
// 内訳에 행이 서는가, 「なし」인 断面이 조용히 계상되지 않는가, 3D가 성립하는가 — 만 본다.
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
// 自動保存 (M4) が前の筋書きの編集を復元する。どの筋書きもサンプル案件から
// 始めたいので、最初の着地で記録を消してから読み直す。
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("kijun");
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    }),
);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

// ── ① 断面一覧에 열이 서고, 大梁만 입력을 받는다 ────────────────────
const table = await page.evaluate(() => {
  const headers = [...document.querySelectorAll("table thead th")].map((th) =>
    th.textContent.trim(),
  );
  const label = (aria) => document.querySelector(`[aria-label='${aria}']`);
  return {
    headers,
    g1WidthTieSize: label("G1 幅止め筋 径")?.value ?? null,
    g1WidthTiePitch: label("G1 幅止め筋 ピッチ")?.value ?? null,
    g1SideBarSize: label("G1 腹筋 径")?.value ?? null,
    g1SideBarCount: label("G1 腹筋 本数")?.value ?? null,
    g1SideBarTail: label("G1 腹筋 余長")?.value ?? null,
    g2WidthTieSize: label("G2 幅止め筋 径")?.value ?? null,
    // 柱には置かない配筋なので入力自体が無い。
    c1WidthTieSize: label("C1 幅止め筋 径")?.value ?? null,
  };
});

checks.headerPresent = table.headers.includes("幅止め筋 / 腹筋");
checks.girderInputsPresent =
  table.g1WidthTieSize === "D10" &&
  table.g1WidthTiePitch === "1000" &&
  table.g1SideBarSize === "D10" &&
  table.g1SideBarCount === "2" &&
  table.g1SideBarTail === "0";
// G2 は断面一覧に記載がない梁 — 「なし」のままで、製品が勝手に足さない。
checks.absentSectionStaysEmpty = table.g2WidthTieSize === "";
checks.columnHasNoInput = table.c1WidthTieSize === null;

// ── ② 内訳에 행이 서고 「なし」인 符号에는 안 선다 ──────────────────
const rowsOf = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) => ({
      id: r.getAttribute("data-testid"),
      text: r.textContent.replace(/\s+/g, " ").trim(),
    })),
  );
const rows = await rowsOf();
const widthTieRows = rows.filter((r) => r.text.includes("幅止め筋"));
const sideBarRows = rows.filter((r) => r.text.includes("腹筋"));

checks.widthTieRowPresent = widthTieRows.length > 0;
checks.sideBarRowPresent = sideBarRows.length > 0;
// G2 は幅止め筋なしなので、どの行も G2 を指さない。
checks.noRowForAbsentSection = ![...widthTieRows, ...sideBarRows].some((r) =>
  /\bG2\b/.test(r.text),
);
// 設計長さは断面の設計幅 400mm ＝ 0.400m。周長 2×(400＋750) と取り違えていない。
checks.widthTieLengthIsDesignWidth = widthTieRows.some((r) => /0\.400/.test(r.text));

// ── ③ 산출식이 근거와 「입력이라는 사실」을 밝힌다 ────────────────────
const formulaFor = async (role) => {
  const opened = await page.evaluate((needle) => {
    const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")].find((r) =>
      r.textContent.includes(needle),
    );
    if (!row) return false;
    row.click();
    return true;
  }, role);
  if (!opened) return null;
  await page.waitForTimeout(200);
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='formula-']")]
      .map((r) => r.textContent.replace(/\s+/g, " ").trim())
      .join(" || "),
  );
};

const widthTieFormula = await formulaFor("幅止め筋");
checks.widthTieFormulaCitesClause =
  widthTieFormula !== null && widthTieFormula.includes("1通則3)");

const sideBarFormula = await formulaFor("腹筋");
// 余長が規準値ではなく入力であることを、算出式が言い切っているか。
checks.sideBarFormulaDeclaresInput =
  sideBarFormula !== null &&
  sideBarFormula.includes("JASS 5") &&
  sideBarFormula.includes("断面一覧の入力");

// ── ④ ピッチを変えると本数が動く（派生状態が保存されていない） ────────
const widthTieRowText = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-testid^='quantity-line-']")]
        .map((r) => r.textContent.replace(/\s+/g, " ").trim())
        .find((t) => t.includes("幅止め筋")) ?? null,
  );
const beforePitch = await widthTieRowText();
await page.fill("input[aria-label='G1 幅止め筋 ピッチ']", "500");
await page.waitForTimeout(300);
const afterPitch = await widthTieRowText();
checks.pitchChangeRecalculates =
  beforePitch !== null && afterPitch !== null && beforePitch !== afterPitch;

// ── ⑤ 3D가 성립한다 ────────────────────────────────────────────────
const viewer = await page.evaluate(() => ({
  canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
  paneError: document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
}));
checks.viewerRenders = viewer.canvasLabel !== null;
checks.noPaneError = viewer.paneError === null;

console.log(
  JSON.stringify(
    {
      table,
      widthTieRows: widthTieRows.map((r) => r.text),
      sideBarRows: sideBarRows.map((r) => r.text),
      widthTieFormula,
      sideBarFormula,
      beforePitch,
      afterPitch,
      checks,
    },
    null,
    2,
  ),
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc14-m3c-details.png")));

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
