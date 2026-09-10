// UC-24: A drawing set stays a preview until its pages, reference elevation,
// range, and member-discard consent are explicitly chosen. The first phase
// keeps the whole PDF and must expose the grid conflict; the second selects
// only the four tsu drawing-set pages by their data-testid positions.
//
// dev-browser runs in QuickJS and cannot open workspace files. Before running
// this test, mirror both the PDF and the golden JSON into its sandbox with Node:
//   node -e "const fs=require('fs');const d=process.env.HOME+'/.dev-browser/tmp/';fs.writeFileSync(d+'uc24-dwg-tsu-kanritou.pdf.b64',fs.readFileSync('.cache/dwg-tsu-kanritou.pdf').toString('base64'));fs.writeFileSync(d+'uc24-tsu.json.b64',fs.readFileSync('tests/fixtures/drawing-set/expected/tsu.json').toString('base64'))"
// The sandbox copies are intentionally read through readFile below; neither
// fixture becomes a product input or a test-only browser global.
const pdfPath = ".cache/dwg-tsu-kanritou.pdf";
const goldenPath = "tests/fixtures/drawing-set/expected/tsu.json";
const pdfFixture = "uc24-dwg-tsu-kanritou.pdf.b64";
const goldenFixture = "uc24-tsu.json.b64";

let pdfBase64;
let golden;
try {
  [pdfBase64, golden] = await Promise.all([
    readFile(pdfFixture),
    readFile(goldenFixture).then((encoded) =>
      JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
    ),
  ]);
} catch (error) {
  throw new Error(
    `LOCAL FIXTURE MISSING: ${pdfPath} / ${goldenPath} — first mirror both with Node: ` +
      `node -e "const fs=require('fs');const d=process.env.HOME+'/.dev-browser/tmp/';fs.writeFileSync(d+'${pdfFixture}',fs.readFileSync('${pdfPath}').toString('base64'));fs.writeFileSync(d+'${goldenFixture}',fs.readFileSync('${goldenPath}').toString('base64'))" ` +
      `(${String(error)})`,
  );
}

const page = await browser.getPage("kijun");
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
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

await page.setInputFiles("[data-testid='drawing-set-files']", {
  name: "dwg-tsu-kanritou.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(pdfBase64, "base64"),
});
await page.waitForSelector("[data-testid='drawing-set-page-29']", {
  timeout: 120000,
});

const fullSet = await page.evaluate(() => ({
  pageCount: document.querySelectorAll("[data-testid^='drawing-set-page-']:not(input)")
    .length,
  conflictText:
    document.querySelector("[data-testid='drawing-set-conflicts']")?.textContent ?? "",
  applyDisabled: document.querySelector("[data-testid='drawing-set-apply']")?.disabled ?? false,
}));

// The fixture's selected source pages are PDF pages 16, 20, 21, and 22, whose
// zero-based UI positions are stable only in this test fixture. Page selection
// deliberately uses the page testids rather than filename/page-number product
// logic.
const selectedPages = new Set([15, 19, 20, 21]);
for (let index = 0; index < 30; index += 1) {
  if (!selectedPages.has(index)) {
    await page.click(`[data-testid='drawing-set-page-include-${index}']`);
  }
}

// The p16 杭伏図 is deliberately unmatched. Exclude that block through its
// checkbox, leaving the p20 2階伏図 to receive its automatic Story suggestion.
await page.click("[data-testid='drawing-set-block-include-15-0']");

const referenceTestId = "drawing-set-reference";
const expectedReference = "dwg-tsu-kanritou.pdf#21#0";
await page.selectOption(`[data-testid='${referenceTestId}']`, expectedReference);
await page.selectOption("[data-testid='drawing-set-level-top']", "0");
await page.selectOption("[data-testid='drawing-set-level-bottom']", "5");

const selected = await page.evaluate((referenceValue) => {
  const blockKey = "dwg-tsu-kanritou.pdf#20#0";
  const reference = document.querySelector("[data-testid='drawing-set-reference']");
  const top = document.querySelector("[data-testid='drawing-set-level-top']");
  const bottom = document.querySelector("[data-testid='drawing-set-level-bottom']");
  const block = document.querySelector(
    `[data-testid='drawing-set-block-story-${blockKey}']`,
  );
  return {
    reference: reference?.value ?? "",
    top: top?.value ?? "",
    bottom: bottom?.value ?? "",
    blockPresent: block !== null,
    blockValue: block?.value ?? "",
    applyEnabled: !(document.querySelector("[data-testid='drawing-set-apply']")?.disabled ?? true),
    discardBeforeApply:
      document.querySelector("[data-testid='drawing-set-discard-members']") !== null,
    referenceMatches: reference?.value === referenceValue,
  };
}, expectedReference);

await page.click("[data-testid='drawing-set-apply']");
await page.waitForSelector("[data-testid='drawing-set-result']");
const refusal = await page.evaluate(() => ({
  discardVisible:
    document.querySelector("[data-testid='drawing-set-discard-members']") !== null,
  result: document.querySelector("[data-testid='drawing-set-result']")?.textContent ?? "",
}));

await page.click("[data-testid='drawing-set-discard-members']");
await page.click("[data-testid='drawing-set-apply']");
await page.waitForFunction(
  () => document.querySelectorAll("input[data-testid^='span-x-']").length > 0,
);
const applied = await page.evaluate(() => ({
  spans: [...document.querySelectorAll("input[data-testid^='span-x-']")].map(
    (input) => Number(input.value),
  ),
  result: document.querySelector("[data-testid='drawing-set-result']")?.textContent ?? "",
}));

const checks = {
  fullPdfHasThirtyPages: fullSet.pageCount === 30,
  fullPdfReportsGridConflict:
    fullSet.conflictText.includes("通り芯不一致") && fullSet.applyDisabled,
  referenceUsesSourcePageIndex: selected.referenceMatches,
  rangeUsesNumericLevelIndexes: selected.top === "0" && selected.bottom === "5",
  p20BlockStoryUsesSourcePageIndexKey: selected.blockPresent,
  p20BlockHasAutomaticStory: selected.blockValue !== "",
  applyIsReadyAfterMembershipAndRange: selected.applyEnabled,
  discardIsNotShownBeforeRefusal: !selected.discardBeforeApply,
  discardIsShownOnlyAfterMemberRefusal:
    refusal.discardVisible &&
    refusal.result.includes("部材があるため階を置き換えられません"),
  appliedXSpansMatchTsuGolden:
    JSON.stringify(applied.spans) === JSON.stringify(golden.grid.xSpansMm),
};

console.log(JSON.stringify({ fullSet, selected, refusal, applied, checks }, null, 2));
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc24-drawing-set.png")),
);

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
