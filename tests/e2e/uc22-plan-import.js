// UC-22: 伏図·軸組図 PDF에서 형상(通り芯·부재 배치·階高)을 읽고, 승인해야만
// 案件에 들어간다 (ADR-030). 断面リスト 취입(uc12)과 같은 규약이되 가드가 하나 더
// 있다 — 格子 index는 스팬 배열에 매여 있어서, 通り芯을 바꾸면 손대지 않은 층의
// 부재가 조용히 다른 자리로 옮겨간다. 그래서 다른 층에 부재가 있으면 통째로
// 거부하고, 거부를 한 번 보여준 뒤에만 「다른 층을 버린다」는 동의 칸을 낸다.
const pdfPath = ".cache/dwg-yokohama.pdf";
const sandboxFixture = "uc22-dwg-yokohama.pdf.b64";
let pdfBase64;
try {
  // dev-browser는 QuickJS에서 호스트 경로를 직접 열 수 없다. AC 실행 전에 로컬
  // .cache PDF를 격리 temp에 base64로 미러링하며, 없으면 첫머리에서 명시적으로 실패한다.
  pdfBase64 = await readFile(sandboxFixture);
} catch (error) {
  throw new Error(
    `LOCAL FIXTURE MISSING: ${pdfPath} — 먼저 실행: ` +
      `base64 -w0 ${pdfPath} > ~/.dev-browser/tmp/${sandboxFixture} ` +
      `(재현 절차: tests/fixtures/section-import/SOURCES.md) (${String(error)})`,
  );
}

const page = await browser.getPage("kijun");
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

// 案件의 通り芯은 DOM에서 읽는다 — 스팬 입력칸의 aria-label이 「Xスパン 1」이다.
// 테스트만을 위한 전역 훅을 제품에 심지 않는다 (다른 UC와 같은 규약).
const readSpans = () =>
  page.evaluate(() => {
    const spans = (axis) =>
      [...document.querySelectorAll(`input[aria-label^='${axis}スパン ']`)]
        .map((input) => input.value)
        .join(",");
    return { x: spans("X"), y: spans("Y") };
  });

const beforeGrid = await readSpans();

await page.setInputFiles("[data-testid='plan-import-file']", {
  name: "dwg-yokohama.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(pdfBase64, "base64"),
});
await page.waitForSelector("[data-testid='plan-import-grid-X']", {
  timeout: 120000,
});

const read = await page.evaluate(() => {
  const text = (testId) =>
    document.querySelector(`[data-testid='${testId}']`)?.textContent ?? "";
  return {
    // 通り芯: 라벨과 스팬이 도면 그대로
    gridX: text("plan-import-grid-X"),
    gridY: text("plan-import-grid-Y"),
    // 軸組図: 階高와 레벨 라벨 (같은 높이의 둘은 둘 다 남는다)
    elevation: text("plan-import-elevation-0"),
    // 伏図 한 장마다 블록 — 이 PDF는 5장이다(杭·基礎·1階床·2階床·R階床)
    blockTitles: [...document.querySelectorAll("strong")]
      .map((node) => node.textContent.trim())
      .filter((label) => label.includes("伏図")),
  };
});

// 반영은 「2階床伏図」 블록으로 한다 — index가 아니라 제목으로 고른다.
// 0번은 杭伏図이고 그 符号(P51 등)은 제품의 부재가 아니라 아무것도 안 들어간다.
const targetApply = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll("[data-testid^='plan-import-apply-']")];
  const index = blocks.findIndex((button) =>
    button.closest("div")?.textContent.includes("2階床伏図"),
  );
  return index < 0 ? null : blocks[index].getAttribute("data-testid");
});
if (!targetApply) throw new Error("2階床伏図 블록을 찾지 못했다");

// 1) 승인 전에는 案件이 바뀌지 않는다
const untouched = await readSpans();

// 2) 첫 반영은 거부된다 — 샘플 案件에 다른 층 부재가 있다
await page.click(`[data-testid='${targetApply}']`);
await page.waitForSelector("[data-testid='plan-import-result']");
const refusedPanel = await page.evaluate(() => ({
  message:
    document.querySelector("[data-testid='plan-import-result']")?.textContent ??
    "",
  consentOffered:
    document.querySelector("[data-testid='plan-import-discard']") !== null,
}));
const refused = { ...refusedPanel, spans: await readSpans() };

// 3) 동의하면 들어간다
await page.click("[data-testid='plan-import-discard']");
await page.click(`[data-testid='${targetApply}']`);
await page.waitForTimeout(500);
const appliedPanel = await page.evaluate(() => ({
  // 断面一覧에 없는 符号은 지어내지 않고 사유를 말한다
  result:
    document.querySelector("[data-testid='plan-import-result']")?.textContent ??
    "",
  grandTotal:
    document.querySelector("[data-testid='grand-total']")?.textContent ?? null,
  paneFailures: [...document.querySelectorAll("[role='alert']")].map(
    (node) => node.textContent,
  ),
}));
const applied = { ...appliedPanel, spans: await readSpans() };

// 4) 階高를 案件의 階로 넣는다 — 어느 레벨이 階인지는 사람이 고른다.
// 中央棟1FL(index 3)에서 中央棟RCL(index 1)까지 → 1階 4480·2階 4100.
// パラペット(1400)와 基礎(2690)는 階가 아니므로 범위 밖이다
await page.selectOption("[data-testid='plan-import-level-top-0']", "1");
await page.selectOption("[data-testid='plan-import-level-bottom-0']", "3");
await page.click("[data-testid='plan-import-apply-elevation-0']");
await page.waitForSelector("[data-testid='plan-import-elevation-result-0']");
const storyRefused = await page.evaluate(() => ({
  message:
    document.querySelector("[data-testid='plan-import-elevation-result-0']")
      ?.textContent ?? "",
  consentOffered:
    document.querySelector("[data-testid='plan-import-discard-members-0']") !==
    null,
}));
if (storyRefused.consentOffered) {
  await page.click("[data-testid='plan-import-discard-members-0']");
  await page.click("[data-testid='plan-import-apply-elevation-0']");
  await page.waitForTimeout(500);
}
// 階 이름은 層 탭(role=tab)에서 읽는다 — 스팬과 같이 DOM이 유일한 창구다.
// 뷰어 탭(部材·建物)도 role=tab이라 목록에는 그것들도 섞인다 — 개수가 아니라
// 「도면에서 온 이름이 거기 있는가」를 본다
const stories = await page.evaluate(() =>
  [...document.querySelectorAll("[role='tab']")].map((node) =>
    node.textContent.trim(),
  ),
);

const checks = {
  gridXLabelsRead:
    read.gridX.includes("bX1") && read.gridX.includes("cX1"),
  gridXSpansRead: read.gridX.includes("8700") && read.gridX.includes("1200"),
  gridYSpansRead: read.gridY.includes("10000"),
  allPlanBlocksRead: read.blockTitles.length === 5,
  elevationHeightsRead: read.elevation.includes("4480"),
  // 같은 높이의 라벨 둘은 둘 다 보인다 — 어느 쪽이 階인지 제품이 고르지 않는다
  elevationAmbiguousLevelsKept:
    read.elevation.includes("中央棟1FL") && read.elevation.includes("基準GL"),
  untouchedBeforeApproval:
    untouched.x === beforeGrid.x && untouched.y === beforeGrid.y,
  firstApplyRefused:
    refused.spans.x === beforeGrid.x && refused.spans.y === beforeGrid.y,
  consentOfferedAfterRefusal: refused.consentOffered === true,
  gridAppliedAfterConsent:
    applied.spans.x === "8700,8700,1200" &&
    applied.spans.y === "5000,6000,10000,6000,5000",
  // 샘플 案件의 断面一覧에는 이 도면의 符号이 없다 — 지어내지 않고 사유를 말한다
  missingSectionsReported:
    applied.result.includes("C51") && applied.result.includes("断面一覧"),
  // 部材가 0본이 되어도 화면은 선다 — 割増는 引く 대상이 없을 뿐 오류가 아니다
  takeoffStillRenders: applied.grandTotal !== null,
  noPaneFailure: applied.paneFailures.length === 0,
  // 階高: 고른 범위(1FL→RCL)의 두 칸만 階가 된다. パラペット·基礎는 범위 밖이다.
  // 이 시점에는 앞의 通り芯 반영이 이미 부재를 비웠으므로 거부가 나지 않는다 —
  // 부재가 남아 있을 때의 거부는 단위 테스트가 고정한다
  storiesApplied: storyRefused.message.includes("2"),
  // 이름은 그 階의 바닥이 되는 레벨의 원문 그대로다 — 지어내지 않고,
  // 같은 높이의 라벨 둘은 둘 다 남는다
  storiesNamedFromDrawing:
    stories.includes("中央棟1FL／基準GL") && stories.includes("2FL"),
};

console.log(JSON.stringify({ read, refused, applied, storyRefused, stories, checks }, null, 2));
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc22-plan-import.png")),
);

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
