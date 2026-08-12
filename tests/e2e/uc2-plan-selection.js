// UC-2: 平面에서 柱 선택 → 断面一覧 / 3D / 数量 연동
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas"); // 하이드레이션 완료 신호

const webgl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return { available: false };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    available: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
});
console.log("WEBGL " + JSON.stringify(webgl));

const probe = () =>
  page.evaluate(() => ({
    viewerMemberId: document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
    viewerEmptyMsg: [...document.querySelectorAll("div")].some((d) => d.textContent === "配筋データなし"),
    selectedSectionRow:
      [...document.querySelectorAll("[data-testid^='section-row-']")]
        .filter((r) => r.getAttribute("aria-selected") === "true")
        .map((r) => r.getAttribute("data-testid")),
    selectedGroupRow: [...document.querySelectorAll("[data-testid^='quantity-group-']")]
      .filter((r) => r.getAttribute("aria-selected") === "true")
      .map((r) => r.textContent.trim()),
    selectedPlanMember: [...document.querySelectorAll("svg g[role='button']")]
      .filter((g) => g.getAttribute("aria-pressed") === "true")
      .map((g) => g.getAttribute("aria-label")),
    canvas: document.querySelectorAll("canvas").length,
  }));

const before = await probe();

// 平面의 첫 柱(C1) 클릭
const columnLabel = await page.evaluate(() => {
  const g = [...document.querySelectorAll("svg g[role='button']")].find((el) =>
    el.getAttribute("aria-label").startsWith("C1")
  );
  return g ? g.getAttribute("aria-label") : null;
});
// 그룹 bbox 중심은 라벨 텍스트 쪽으로 치우쳐 大梁 히트영역과 겹치므로 rect를 직접 친다
await page.click(`svg g[role='button'][aria-label='${columnLabel}'] rect`);
await page.waitForSelector("[data-testid^='quantity-group-'][aria-selected='true']");

const afterColumn = await probe();

// 大梁(G1) 클릭 — 単一スパンは配筋が出る。連続スパンなら未対応表示に戻る
const girderLabel = await page.evaluate(() => {
  const g = [...document.querySelectorAll("svg g[role='button']")].find((el) =>
    el.getAttribute("aria-label").startsWith("G1")
  );
  return g ? g.getAttribute("aria-label") : null;
});
// 수평 <line>은 bbox 높이가 0이라 Playwright가 invisible로 판정 → force로 좌표 클릭
await page.click(`svg g[role='button'][aria-label='${girderLabel}'] line[class*='girderHitArea']`, {
  force: true,
});
const afterGirder = await probe();

console.log(
  JSON.stringify({ clicked: { columnLabel, girderLabel }, before, afterColumn, afterGirder }, null, 2)
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc2-girder-selected.png")));
