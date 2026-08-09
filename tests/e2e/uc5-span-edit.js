// UC-5: スパン 편집 → 柱 개수·箇所 증감, 마지막 1개면 삭제 버튼 disabled
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");

const probe = () =>
  page.evaluate(() => ({
    xSpans: [...document.querySelectorAll("input[aria-label^='Xスパン']")].map((i) => i.value),
    ySpans: [...document.querySelectorAll("input[aria-label^='Yスパン']")].map((i) => i.value),
    removeDisabled: [...document.querySelectorAll("button[aria-label*='スパン'][aria-label*='削除']")].map(
      (b) => ({ label: b.getAttribute("aria-label"), disabled: b.disabled })
    ),
    planColumns: [...document.querySelectorAll("svg g[role='button']")].filter((g) =>
      g.getAttribute("aria-label").startsWith("C1")
    ).length,
    groups: [...document.querySelectorAll("[data-testid^='quantity-group-']")].map((r) =>
      r.textContent.trim()
    ),
    grandTotal: [...document.querySelector("[data-testid='grand-total']").querySelectorAll("td")].map((c) =>
      c.textContent.trim()
    ),
  }));

const base = await probe();

await page.click("button:has-text('Xスパンを追加')");
const afterAdd = await probe();

// 스팬 하나 제거 → 원상 복귀
await page.click("button[aria-label='Xスパン 1を削除']");
const afterRemove = await probe();

// X스팬을 1개만 남을 때까지 제거 → 삭제 버튼 disabled 확인
await page.click("button[aria-label='Xスパン 1を削除']");
const afterMin = await probe();

console.log(JSON.stringify({ base, afterAdd, afterRemove, afterMin }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc5-spans.png")));
