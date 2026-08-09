// UC-6: 로케일 ja ↔ ko — UI만 번역, 도메인 용어는 일본어 원어 유지 (ADR-008)
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");

const probe = () =>
  page.evaluate(() => ({
    htmlLang: document.querySelector("[lang]")?.getAttribute("lang") ?? null,
    panes: [...document.querySelectorAll("section[aria-labelledby] h2")].map((h) => h.textContent.trim()),
    takeoffHeaders: [...document.querySelectorAll("[data-testid='takeoff-head'] th")].map((h) =>
      h.textContent.trim()
    ),
    // 도메인 용어는 번역되면 안 된다
    domainTerms: [...document.querySelectorAll("[data-testid^='quantity-line-'] td:first-child")].map((td) =>
      td.textContent.trim()
    ),
    groupLabels: [...document.querySelectorAll("[data-testid^='quantity-group-']")].map((r) =>
      r.textContent.trim()
    ),
    sectionHeaders: [...document.querySelectorAll("table th[scope='col']")]
      .map((h) => h.textContent.trim())
      .slice(0, 6),
    markup: document.querySelector("[class*='markupBadge']")?.textContent?.trim() ?? null,
    exportButton: document.querySelector("[class*='exportButton']")?.textContent?.trim() ?? null,
    warning: document.querySelector("[role='alert']")?.textContent?.trim() ?? null,
    footerSpans: [...document.querySelectorAll("footer span")].map((s) => s.textContent.trim()),
    shapeIconLabels: [...document.querySelectorAll("[class*='shapeIcon']")].map((s) =>
      s.getAttribute("aria-label")
    ),
  }));

const ja = await probe();
await page.click("button[aria-pressed='false']:has-text('한국어')");
const ko = await probe();

console.log(JSON.stringify({ ja, ko }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc6-locale-ko.png")));
