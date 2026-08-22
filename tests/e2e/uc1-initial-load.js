// UC-1: 초기 로딩 관통 — 4패널 · M1 경고 · 출처 고지 · 総計 ≠ 0
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
// 数量 표는 SSR HTML에도 있다. 캔버스는 하이드레이션 후에만 생기므로 이걸 기다려야 한다.
await page.waitForSelector("canvas");

const result = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
  const panes = [...document.querySelectorAll("section[aria-labelledby]")].map(
    (s) => s.querySelector("h2")?.textContent?.trim()
  );
  const totalRow = document.querySelector("[data-testid='grand-total']");
  const cells = totalRow ? [...totalRow.querySelectorAll("td")].map((c) => c.textContent.trim()) : [];
  const stories = [...document.querySelectorAll("[data-testid^='story-subtotal-']")].map((r) => ({
    id: r.getAttribute("data-testid"),
    cells: [...r.querySelectorAll("td")].map((c) => c.textContent.trim()),
  }));
  const groups = [...document.querySelectorAll("[data-testid^='quantity-group-']")].map((r) =>
    r.textContent.trim()
  );
  return {
    title: document.title,
    panes,
    warning: text("[role='alert']"),
    footer: text("footer"),
    grandTotal: cells,
    stories,
    groupCount: groups.length,
    groups: groups.slice(0, 10),
    canvasCount: document.querySelectorAll("canvas").length,
    viewerEmptyMsg: [...document.querySelectorAll("div")].some((d) => d.textContent === "配筋データなし"),
    lineRows: document.querySelectorAll("[data-testid^='quantity-line-']").length,
    sectionRows: [...document.querySelectorAll("[data-testid^='section-row-']")].map((r) =>
      r.getAttribute("data-testid")
    ),
    planMembers: document.querySelectorAll("svg g[role='button']").length,
    storyTabs: [...document.querySelectorAll("[role='tab']")].map((b) => ({
      name: b.textContent.trim(),
      selected: b.getAttribute("aria-selected"),
    })),
    localeButtons: [...document.querySelectorAll("[aria-label='Language'] button")].map((b) => ({
      name: b.textContent.trim(),
      pressed: b.getAttribute("aria-pressed"),
    })),
  };
});

console.log(JSON.stringify(result, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc1-initial.png")));
