// UC-23: ST-Bridge .stb에서 읽은 通り芯·階 후보를 화면에 제시하고,
// 사용자가 각각 승인한 뒤 平面 격자와 StoryTabs에 반영되는지 확인한다
// (ADR-043·ADR-044). 입력은 CI에도 있는 합성 UTF-8 fixture만 사용한다.
//
// dev-browser는 호스트 경로를 직접 읽지 못하므로 실행 전에 다음처럼 fixture를
// 샌드박스 파일로 미러링한다:
//   base64 -w0 tests/fixtures/stb-import/synthetic/mini-utf8.stb > ~/.dev-browser/tmp/uc23-mini-utf8.stb.b64

const fixturePath = "tests/fixtures/stb-import/synthetic/mini-utf8.stb";
const sandboxFixture = "uc23-mini-utf8.stb.b64";
let fixtureBase64;
try {
  fixtureBase64 = await readFile(sandboxFixture);
} catch (error) {
  throw new Error(
    `LOCAL FIXTURE MISSING: ${fixturePath} — 먼저 실행: ` +
      `base64 -w0 ${fixturePath} > ~/.dev-browser/tmp/${sandboxFixture} ` +
      `(${String(error)})`,
  );
}

const page = await browser.getPage("kijun");

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

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await clearStore();
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");

await page.setInputFiles("[data-testid='stb-import-file']", {
  name: "mini-utf8.stb",
  mimeType: "application/xml",
  buffer: Buffer.from(fixtureBase64, "base64"),
});
await page.waitForSelector("[data-testid='stb-import-grid-X']");
await page.waitForSelector("[data-testid='stb-import-stories']");
await page.waitForSelector("[data-testid='stb-import-unsupported']");

const candidate = await page.evaluate(() => {
  const text = (testId) =>
    document.querySelector(`[data-testid='${testId}']`)?.textContent ?? "";
  return {
    gridX: text("stb-import-grid-X"),
    gridY: text("stb-import-grid-Y"),
    stories: text("stb-import-stories"),
    unsupported: text("stb-import-unsupported"),
  };
});

const candidateChecks = {
  gridXLabels: ["X1", "X2", "X3"].every((label) => candidate.gridX.includes(label)),
  gridYLabels: ["Y1", "Y2"].every((label) => candidate.gridY.includes(label)),
  storyNames: candidate.stories.includes("1FL") && candidate.stories.includes("2FL"),
  unsupportedSlot: candidate.unsupported.length > 0,
};
const candidateFailures = Object.entries(candidateChecks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (candidateFailures.length) {
  throw new Error("FAILED CANDIDATE CHECKS: " + candidateFailures.join(", "));
}

const approve = async (buttonTestId, discardTestId, resultTestId) => {
  await page.click(`[data-testid='${buttonTestId}']`);
  await page.waitForSelector(`[data-testid='${resultTestId}']`);

  const discardOffered = await page.evaluate(
    (testId) => document.querySelector(`[data-testid='${testId}']`) !== null,
    discardTestId,
  );
  if (discardOffered) {
    await page.click(`[data-testid='${discardTestId}']`);
    await page.click(`[data-testid='${buttonTestId}']`);
  }
};

await approve(
  "stb-import-apply-grid",
  "stb-import-discard-grid",
  "stb-import-grid-result",
);
await page.waitForFunction(
  () =>
    document.querySelectorAll("[data-testid^='span-x-']").length === 2 &&
    document.querySelectorAll("[data-testid^='span-y-']").length === 1 &&
    [...document.querySelectorAll("[data-testid^='span-x-']")].every((input) =>
      input.getAttribute("aria-label")?.includes("X"),
    ),
);

const appliedGrid = await page.evaluate(() => ({
  xSpans: [...document.querySelectorAll("[data-testid^='span-x-']")].map(
    (input) => input.value,
  ),
  ySpans: [...document.querySelectorAll("[data-testid^='span-y-']")].map(
    (input) => input.value,
  ),
  xLabels: [...document.querySelectorAll("[data-testid^='span-x-']")].map(
    (input) => input.getAttribute("aria-label"),
  ),
  yLabels: [...document.querySelectorAll("[data-testid^='span-y-']")].map(
    (input) => input.getAttribute("aria-label"),
  ),
}));

await approve(
  "stb-import-apply-stories",
  "stb-import-discard-stories",
  "stb-import-stories-result",
);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("[role='tablist']")].some((list) => {
      const labels = [...list.querySelectorAll("[role='tab']")].map((tab) =>
        tab.textContent.trim(),
      );
      return labels.length === 2 && labels.includes("1FL") && labels.includes("2FL");
    }),
);

const applied = await page.evaluate(() => {
  const storyTabs = [...document.querySelectorAll("[role='tablist']")]
    .map((list) => [...list.querySelectorAll("[role='tab']")].map((tab) => tab.textContent.trim()))
    .find((labels) => labels.length === 2 && labels.includes("1FL") && labels.includes("2FL"));
  return {
    storyTabs: storyTabs ?? [],
    unsupportedVisible:
      document.querySelector("[data-testid='stb-import-unsupported']") !== null,
    issuesVisible:
      document.querySelector("[data-testid='stb-import-issues']") !== null,
  };
});

const checks = {
  candidateVisible: candidateChecks.gridXLabels && candidateChecks.gridYLabels,
  candidateStoriesVisible: candidateChecks.storyNames,
  unsupportedSlotVisible: candidateChecks.unsupportedSlot && applied.unsupportedVisible,
  gridIsThreeByTwo:
    appliedGrid.xSpans.length === 2 &&
    appliedGrid.ySpans.length === 1 &&
    appliedGrid.xLabels.join(",") === "X1-X2,X2-X3" &&
    appliedGrid.yLabels.join(",") === "Y1-Y2",
  storiesApplied: applied.storyTabs.join(",") === "1FL,2FL",
  noticesRemainVisible: applied.issuesVisible || applied.unsupportedVisible,
};

console.log(JSON.stringify({ candidate, appliedGrid, applied, checks }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc23-stb-import.png")));

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
