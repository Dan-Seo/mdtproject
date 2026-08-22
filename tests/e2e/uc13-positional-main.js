// 位置別 主筋: 端部欄·止め位置 입력이 未対応 판정과 数量까지 실제로 도는지.
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const fieldsExist = await page.evaluate(() => ({
  endTop: document.querySelector("[aria-label='G1 端部 主筋 上 本数']") !== null,
  endBottom: document.querySelector("[aria-label='G1 端部 主筋 下 本数']") !== null,
  cutoff: document.querySelector("[aria-label='G1 主筋 止め位置']") !== null,
  columnHasNoEnd: document.querySelector("[aria-label='C1 端部 主筋 上 本数']") === null,
}));

const rowCountBefore = await page.evaluate(
  () => document.querySelectorAll("[data-testid^='quantity-line-']").length,
);

// 端部만 늘리고 止め位置는 비워 둔다 — 条文が設計図書に委ねた値なので製品は止まる
await page.fill("[aria-label='G1 端部 主筋 上 本数']", "7");
await page.waitForSelector("[data-testid='unsupported-plan']", { timeout: 15000 });
const blocked = await page.evaluate(() => ({
  plan: document.querySelector("[data-testid='unsupported-plan']")?.textContent.trim() ?? null,
  rows: document.querySelectorAll("[data-testid^='quantity-line-']").length,
}));

// 止め位置를 넣으면 追加主筋이 数量에 나온다
await page.fill("[aria-label='G1 主筋 止め位置']", "1200");
await page.waitForFunction(
  () => document.querySelector("[data-testid='unsupported-plan']") === null,
  { timeout: 15000 },
);
const applied = await page.evaluate(() => ({
  rows: document.querySelectorAll("[data-testid^='quantity-line-']").length,
  hasEndZone: document.body.textContent.includes("端部"),
  canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
  paneFailures: [...document.querySelectorAll("[role='alert']")].map((n) => n.textContent.trim()),
}));

const checks = {
  endFieldsRendered: fieldsExist.endTop && fieldsExist.endBottom && fieldsExist.cutoff,
  columnHasNoEndField: fieldsExist.columnHasNoEnd === true,
  missingCutoffBlocksMember: blocked.plan !== null && blocked.plan.includes("止め位置"),
  blockedMemberDroppedFromTakeoff: blocked.rows < rowCountBefore,
  cutoffRestoresTakeoff: applied.rows > blocked.rows,
  partialBarListed: applied.hasEndZone === true,
  viewerStillRenders: applied.canvasLabel === "選択部材の配筋3D",
  noPaneFailure: applied.paneFailures.length === 0,
};
console.log(JSON.stringify({ fieldsExist, rowCountBefore, blocked, applied, checks }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc13-positional-main.png")));
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([n]) => n);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
