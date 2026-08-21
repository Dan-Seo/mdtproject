// UC-7: 산출 근거 — source chip / 등급 표시 ▲△ / 算出式 펼치기 (법적 의무 표시)
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");

const firstLineId = await page.evaluate(
  () => document.querySelector("[data-testid^='quantity-line-']").getAttribute("data-testid")
);

const before = await page.evaluate(() => ({
  formulaRows: document.querySelectorAll("[data-testid^='formula-']").length,
  chips: [...document.querySelectorAll("[class*='_sourceChip__']")].map((c) => ({
    text: c.textContent.trim(),
    tag: c.tagName,
    href: c.getAttribute("href"),
    disabled: c.getAttribute("aria-disabled"),
    title: c.getAttribute("title"),
  })),
  // ▲(원문에 값 없음)와 △(원문 명시·독립 검토 대기)를 갈라서 센다 (ADR-023).
  inferredMarks: [...document.querySelectorAll("[class*='inferredWarning']")].map((s) => ({
    text: s.textContent.trim(),
    ariaLabel: s.getAttribute("aria-label"),
    title: s.getAttribute("title"),
  })),
  transcribedMarks: [...document.querySelectorAll("[class*='transcribedWarning']")].map((s) => ({
    text: s.textContent.trim(),
    ariaLabel: s.getAttribute("aria-label"),
  })),
  banner: document.querySelector("[role='status']")?.textContent.trim() ?? null,
}));

await page.locator("[data-testid^='quantity-line-']").first().click();

const after = await page.evaluate(() => ({
  formulaRows: [...document.querySelectorAll("[data-testid^='formula-']")].map((r) => ({
    id: r.getAttribute("data-testid"),
    formula: r.textContent.trim(),
  })),
  // 펼침 상태는 행이 아니라 첫 칸의 컨트롤이 들고 있다 — role=row의 aria-expanded는
  // treegrid 안에서만 유효하다.
  expandedRows: [...document.querySelectorAll("[data-testid^='quantity-line-']:has(button[aria-expanded='true'])")].map(
    (r) => r.getAttribute("data-testid")
  ),
}));

console.log(JSON.stringify({ firstLineId, before, after }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc7-formula.png")));
