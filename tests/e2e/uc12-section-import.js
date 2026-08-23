// UC-12: 断面リスト PDF를 브라우저 로컬에서 추출하고, 행 단위 승인으로만 반영한다.
// 반영 단위는 (符号, 階)다 — C51 2階는 완전 후보라 반영되고, G51 R階는 端部
// 主筋이 좌우로 달라(外端 8-D25／内端 13-D25) 빈칸이므로 신규 符号로는 반영이
// 막혀야 한다 (R13).
// C51 1階의 帯筋 S13은 高強度せん断補強筋이라 값으로 들어오고 (ADR-026),
// C56의 断面 600φ도 円形柱로 들어온다 (ADR-027) — 둘 다 빈칸이 아니다.
const pdfPath = ".cache/dwg-yokohama.pdf";
const sandboxFixture = "uc12-dwg-yokohama.pdf.b64";
const ojkkPdfPath = ".cache/dwg-ojkk-zumen6.pdf";
const ojkkSandboxFixture = "uc12-dwg-ojkk.pdf.b64";
let pdfBase64;
let ojkkPdfBase64;
try {
  // dev-browser는 QuickJS에서 호스트 경로를 직접 열 수 없다. AC 실행 전에 로컬
  // .cache PDF를 격리 temp에 base64로 미러링하며, 없으면 첫머리에서 명시적으로 실패한다.
  pdfBase64 = await readFile(sandboxFixture);
  ojkkPdfBase64 = await readFile(ojkkSandboxFixture);
} catch (error) {
  throw new Error(
    `LOCAL FIXTURE MISSING: ${pdfPath} / ${ojkkPdfPath} — 먼저 실행: ` +
      `base64 -w0 ${pdfPath} > ~/.dev-browser/tmp/${sandboxFixture}; ` +
      `base64 -w0 ${ojkkPdfPath} > ~/.dev-browser/tmp/${ojkkSandboxFixture} ` +
      `(재현 절차: tests/fixtures/section-import/SOURCES.md) (${String(error)})`,
  );
}

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

await page.setInputFiles("[data-testid='section-import-file']", {
  name: "dwg-yokohama.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(pdfBase64, "base64"),
});
await page.waitForSelector("[data-testid='section-import-candidate-C51-2階']", {
  timeout: 120000,
});

const before = await page.evaluate(() => {
  const outOfScope = document.querySelector("[data-testid='section-import-out-of-scope']");
  const b51 = outOfScope?.querySelector("[data-testid='section-import-candidate-B51-none']");
  const c51First = document.querySelector("[data-testid='section-import-candidate-C51-1階']");
  const c56 = document.querySelector("[data-testid='section-import-candidate-C56-2階']");
  const g51Roof = document.querySelector("[data-testid='section-import-candidate-G51-R階']");
  const g51Apply = g51Roof
    ? [...g51Roof.querySelectorAll("button")].find((button) => button.textContent.trim() === "反映")
    : null;
  return {
    c51ExistsInTable: document.querySelector("[data-testid='section-row-section-C51-2階']") !== null,
    b51VisibleInOutOfScope: b51 !== null,
    b51HasApply: b51
      ? [...b51.querySelectorAll("button")].some((button) => button.textContent.trim() === "反映")
      : null,
    // 불완전 후보(端部 主筋 좌우 상이)는 신규 符号로 반영 불가여야 한다
    g51ApplyDisabled: g51Apply ? g51Apply.disabled : null,
    // 高強度せん断補強筋·円形柱는 빈칸이 아니라 값으로 들어온다
    highStrengthHoopParsed: c51First?.textContent.includes("帯筋 S13@100") ?? false,
    highStrengthRawGone: (c51First?.textContent.includes("S13-@100") ?? true) === false,
    circularParsed: c56?.textContent.includes("断面 600φ") ?? false,
    // 端部가 좌우로 다른 大梁은 취입하지 않고 사유와 원문을 남긴다 (R13)
    g51RoofRawShown: g51Roof?.textContent.includes("13-D25") ?? false,
    g51RoofReasonShown:
      g51Roof?.textContent.includes("どちらが始端かを決められない") ?? false,
  };
});

const c51Apply = page.locator(
  "[data-testid='section-import-candidate-C51-2階'] button:nth-of-type(1)",
);
await c51Apply.focus();
await page.keyboard.press("Tab");
const tabTarget = await page.evaluate(() => document.activeElement?.textContent.trim() ?? null);
await page.keyboard.press("Shift+Tab");
const shiftTabTarget = await page.evaluate(
  () => document.activeElement?.textContent.trim() ?? null,
);
await page.keyboard.press("Enter");
await page.waitForSelector("[data-testid='section-row-section-C51-2階']");

const after = await page.evaluate(() => {
  const value = (label) => document.querySelector(`[aria-label='${label}']`)?.value ?? null;
  // 符号에는 階를 넣지 않는다 — 표시 라벨만 「符号(階)」로 합성된다
  const markInput = document.querySelector("[aria-label='C51(2階) 符号']");
  return {
    markValue: markInput ? markInput.value : null,
    b: value("C51(2階) 断面 b"),
    d: value("C51(2階) 断面 d"),
    mainCount: value("C51(2階) 主筋 本数"),
    mainSize: value("C51(2階) 主筋 径"),
    hoopSize: value("C51(2階) 帯筋 径"),
    hoopPitch: value("C51(2階) 帯筋 ピッチ"),
    grandTotal: document.querySelector("[data-testid='grand-total']")?.textContent.trim() ?? null,
    canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
    paneFailures: [...document.querySelectorAll("[role='alert']")].map((node) =>
      node.textContent.trim(),
    ),
  };
});

// ojkk의 G1(RF)을 샘플 G1에 겹쳐, 반영된 腹筋이 실제 Member를 통해 内訳書·3D까지
// 관통하는지 본다. Section의 階 표기는 취입 매칭 키이고 Member의 sectionId는 그대로다.
await page.evaluate(() => {
  const store = window.__kijunStore;
  if (!store) throw new Error("development store bridge is unavailable");
  store.getState().updateProject((project) => ({
    ...project,
    sections: project.sections.map((section) => {
      if (section.kind !== "大梁" || section.mark !== "G1") return section;
      const next = { ...section, storyLabel: "RF" };
      delete next.sideBar;
      delete next.widthTie;
      return next;
    }),
  }));
});
await page.setInputFiles("[data-testid='section-import-file']", {
  name: "dwg-ojkk-zumen6.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(ojkkPdfBase64, "base64"),
});
await page.waitForSelector("[data-testid='section-import-candidate-G1-RF']", {
  timeout: 120000,
});
const ojkkBefore = await page.evaluate(() => {
  const row = document.querySelector("[data-testid='section-import-candidate-G1-RF']");
  return {
    sideBarParsed: row?.textContent.includes("腹筋 2-D10") ?? false,
    widthTieParsed: row?.textContent.includes("幅止め筋 D10@1000") ?? false,
    sideBarAbsentFromTakeoff: ![...document.querySelectorAll("[data-testid^='quantity-line-']")]
      .some((node) => node.textContent.includes("腹筋")),
  };
});
await page.locator(
  "[data-testid='section-import-candidate-G1-RF'] button:nth-of-type(1)",
).click();
await page.waitForFunction(
  () => document.querySelector("[aria-label='G1(RF) 腹筋 径']")?.value === "D10",
);
const ojkkAfter = await page.evaluate(() => {
  const value = (label) => document.querySelector(`[aria-label='${label}']`)?.value ?? null;
  return {
    sideBarSize: value("G1(RF) 腹筋 径"),
    sideBarCount: value("G1(RF) 腹筋 本数"),
    sideBarExtraLength: value("G1(RF) 腹筋 余長"),
    widthTieSize: value("G1(RF) 幅止め筋 径"),
    widthTiePitch: value("G1(RF) 幅止め筋 ピッチ"),
    sideBarInTakeoff: [...document.querySelectorAll("[data-testid^='quantity-line-']")]
      .some((node) => node.textContent.includes("腹筋")),
    canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
    paneFailures: [...document.querySelectorAll("[role='alert']")].map((node) =>
      node.textContent.trim(),
    ),
  };
});

const checks = {
  approvalWasRequired: before.c51ExistsInTable === false,
  outOfScopeListed: before.b51VisibleInOutOfScope === true,
  outOfScopeHasNoApply: before.b51HasApply === false,
  incompleteNewMarkBlocked: before.g51ApplyDisabled === true,
  incompleteRawShown: before.g51RoofRawShown === true,
  highStrengthHoopParsed: before.highStrengthHoopParsed === true,
  highStrengthRawGone: before.highStrengthRawGone === true,
  circularParsed: before.circularParsed === true,
  asymmetricEndRawShown: before.g51RoofRawShown === true,
  asymmetricEndReasonShown: before.g51RoofReasonShown === true,
  tabReachesIgnore: tabTarget === "無視",
  shiftTabReturnsToApply: shiftTabTarget === "反映",
  markKeepsStoryOut: after.markValue === "C51",
  dimensionApplied: after.b === "800" && after.d === "800",
  mainApplied: after.mainCount === "18" && after.mainSize === "D25",
  hoopApplied: after.hoopSize === "D13" && after.hoopPitch === "100",
  takeoffStillRenders: after.grandTotal !== null,
  viewerStillRenders: after.canvasLabel === "選択部材の配筋3D",
  noPaneFailure: after.paneFailures.length === 0,
  ojkkSideBarParsed: ojkkBefore.sideBarParsed === true,
  ojkkWidthTieParsed: ojkkBefore.widthTieParsed === true,
  sideBarWasAbsentBeforeApply: ojkkBefore.sideBarAbsentFromTakeoff === true,
  sideBarApplied:
    ojkkAfter.sideBarSize === "D10" &&
    ojkkAfter.sideBarCount === "2" &&
    ojkkAfter.sideBarExtraLength === "0",
  widthTieApplied:
    ojkkAfter.widthTieSize === "D10" && ojkkAfter.widthTiePitch === "1000",
  importedSideBarInTakeoff: ojkkAfter.sideBarInTakeoff === true,
  viewerSurvivesGirderDetailApply: ojkkAfter.canvasLabel === "選択部材の配筋3D",
  noPaneFailureAfterGirderDetailApply: ojkkAfter.paneFailures.length === 0,
};

console.log(JSON.stringify({ before, after, ojkkBefore, ojkkAfter, checks }, null, 2));
console.log(
  "SHOT " +
    (await saveScreenshot(await page.screenshot(), "uc12-section-import.png")),
);

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
