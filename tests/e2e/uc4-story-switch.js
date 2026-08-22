// UC-4: 층 전환 (1階 ↔ 2階) — 平面은 해당 층만, 数量은 두 층 모두
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
await page.waitForSelector("canvas");

const probe = () =>
  page.evaluate(() => ({
    activeTab: [...document.querySelectorAll("[role='tab']")]
      .filter((b) => b.getAttribute("aria-selected") === "true")
      .map((b) => b.textContent.trim()),
    planLabel: document.querySelector("svg[role='img']")?.getAttribute("aria-label") ?? null,
    planMemberCount: document.querySelectorAll("svg g[role='button']").length,
    takeoffStories: [...document.querySelectorAll("[data-testid^='story-subtotal-']")].map((r) =>
      r.getAttribute("data-testid").replace("story-subtotal-", "")
    ),
  }));

const first = await probe();
await page.click("[role='tab']:nth-of-type(2)");
const second = await probe();

// 2階에서 柱 선택 → 3D 갱신, 1階 탭으로 되돌아가지 않아야 함
const label = await page.evaluate(() => {
  const g = [...document.querySelectorAll("svg g[role='button']")].find((el) =>
    el.getAttribute("aria-label").startsWith("C1")
  );
  return g ? g.getAttribute("aria-label") : null;
});
await page.click(`svg g[role='button'][aria-label='${label}'] rect`);
const afterSelect = await page.evaluate(() => ({
  activeTab: [...document.querySelectorAll("[role='tab']")]
    .filter((b) => b.getAttribute("aria-selected") === "true")
    .map((b) => b.textContent.trim()),
  viewerMemberId: document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
  selectedGroup: [...document.querySelectorAll("[data-testid^='quantity-group-'][aria-selected='true']")].map(
    (r) => r.textContent.trim()
  ),
}));

console.log(JSON.stringify({ first, second, clicked: label, afterSelect }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc4-story-2f.png")));
