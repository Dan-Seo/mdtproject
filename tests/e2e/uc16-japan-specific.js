// UC-16: 日本固有の形態・製品 — 高強度せん断補強筋 (ADR-025) と 円形柱 (ADR-026)。
// どちらも「規準に行を足さずに扱える」ことが要点なので、ここが見るのは
// 断面一覧の入力 → 内訳の数量 → 3D の3つが実ブラウザで通ることである。
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const hoopRow = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-testid^='quantity-line-']")]
        .find((r) => r.textContent.includes("帯筋"))
        ?.textContent.replace(/\s+/g, " ")
        .trim() ?? null,
  );

// ── ① 高強度せん断補強筋は帯筋にだけ選べる ──────────────────────
const options = await page.evaluate(() => {
  const opts = (label) => {
    const el = document.querySelector(`[aria-label='${label}']`);
    return el ? [...el.options].map((o) => o.value) : null;
  };
  return { hoop: opts("C1 帯筋 径"), main: opts("C1 主筋 径") };
});
checks.hoopOffersHighStrength =
  options.hoop !== null &&
  options.hoop.includes("K13") &&
  options.hoop.includes("S13");
// 主筋は定着・重ね継手を表5.3.4・表5.3.2 から径で引く。その表に高強度の行はない
checks.mainRejectsHighStrength =
  options.main !== null &&
  !options.main.includes("K13") &&
  !options.main.includes("S13");

const rectangular = await hoopRow();
// 矩形 800×800 → 周長 3200mm。径を変えても周長は変わらない (1通則2))
checks.rectangularPerimeter =
  rectangular !== null && rectangular.includes("3.200");

await page.selectOption("[aria-label='C1 帯筋 径']", "K13");
await page.waitForTimeout(500);

const highStrength = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")]
    .find((r) => r.textContent.includes("帯筋"));
  return {
    text: row?.textContent.replace(/\s+/g, " ").trim() ?? null,
    unitMassSizes: [
      ...document.querySelectorAll("[data-testid='unit-mass-input'] input"),
    ].map((i) => i.getAttribute("data-size")),
  };
});
checks.takeoffShowsHighStrength =
  highStrength.text !== null && highStrength.text.includes("K13");
checks.highStrengthKeepsPerimeter =
  highStrength.text !== null && highStrength.text.includes("3.200");
// D13 と K13 は呼び径が同じでも単位質量が別物なので、入力欄が別行で立つ
checks.unitMassRowIsSeparate =
  highStrength.unitMassSizes.includes("K13") &&
  highStrength.unitMassSizes.includes("D13");
// 単位質量が入るまで kg は出ない (JIS G 3112 未確保)
checks.massBlankUntilEntered =
  highStrength.text !== null && highStrength.text.includes("—");

await page.fill(
  "[data-testid='unit-mass-input'] input[data-size='K13']",
  "0.995",
);
await page.waitForTimeout(500);
const massed = await hoopRow();
checks.massAppearsAfterInput = massed !== null && !massed.includes("—");

// ── ② 円形柱 ────────────────────────────────────────────────
checks.shapeSelectExists =
  (await page.$("[aria-label='C1 断面形状']")) !== null;
await page.selectOption("[aria-label='C1 断面形状']", "円形");
await page.waitForTimeout(600);

const circular = await page.evaluate(() => {
  const label = (aria) => document.querySelector(`[aria-label='${aria}']`);
  const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")]
    .find((r) => r.textContent.includes("帯筋"));
  return {
    diameter: label("C1 断面 直径")?.value ?? null,
    // 円形で b・d を別々に出すと図面にない扁平断面を作れてしまう
    hasSeparateB: label("C1 断面 b") !== null,
    text: row?.textContent.replace(/\s+/g, " ").trim() ?? null,
    heading:
      [...document.querySelectorAll("[data-testid^='quantity-group-']")]
        .map((el) => el.textContent.replace(/\s+/g, " ").trim())
        .find((t) => t.includes("柱")) ?? null,
    paneError:
      document.querySelector("[data-testid='pane-error']")?.textContent ?? null,
    canvasLabel:
      document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
  };
});
checks.diameterInputShown = circular.diameter === "800";
checks.noSeparateBOnCircular = circular.hasSeparateB === false;
// π×800 ＝ 2513.27mm — 同じ 1通則2) の「周長」が円では円周になる
checks.circularPerimeter = circular.text !== null && circular.text.includes("2.513");
checks.circularHeading =
  circular.heading !== null &&
  circular.heading.includes("800φ") &&
  !circular.heading.includes("800×800");
checks.memberViewRenders = circular.canvasLabel !== null;
checks.memberViewHasNoPaneError = circular.paneError === null;

await page.fill("[aria-label='C1 断面 直径']", "600");
await page.waitForTimeout(600);
const at600 = await hoopRow();
// π×600 ＝ 1884.96mm
checks.diameterDrivesPerimeter = at600 !== null && at600.includes("1.885");

// ── ③ 建物ビューでも落ちない ──────────────────────────────────
const buildingTab = await page.$(
  "[role='tab'][aria-label='建物'], button:has-text('建物')",
);
if (buildingTab) {
  await buildingTab.click();
  await page.waitForTimeout(800);
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
    { options, rectangular, highStrength, massed, circular, at600, building, checks },
    null,
    2,
  ),
);
console.log(
  "SHOT " +
    (await saveScreenshot(await page.screenshot(), "uc16-japan-specific.png")),
);

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
