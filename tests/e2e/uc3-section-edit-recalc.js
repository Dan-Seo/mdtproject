// UC-3: 断面一覧 수정 → 数量 재계산 (파생 상태가 저장되지 않고 재계산되는지)
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const snapshot = () =>
  page.evaluate(() => {
    const total = document.querySelector("[data-testid='grand-total']");
    const rows = [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) => {
      const td = [...r.querySelectorAll("td")].map((c) => c.textContent.trim());
      return {
        role: td[0],
        size: td[1],
        lengthM: td[3],
        count: td[4],
        places: td[5],
        totalLengthM: td[6],
        designKg: td[8],
      };
    });
    return {
      designKg: total.querySelectorAll("td")[0].textContent.trim(),
      requiredKg: total.querySelectorAll("td")[1].textContent.trim(),
      rows: rows.slice(0, 2),
    };
  });

// 単位質量は JIS G 3112 の値で規準側になく、利用者入力だ。入れるまで質量列は
// 「—」のままなので、まず未入力の姿を撮ってから入力する。
const beforeUnitMass = await snapshot();

const sizes = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid='unit-mass-input'] input")].map(
    (input) => input.dataset.size,
  ),
);
for (const size of sizes) {
  await page.fill(`input[aria-label='${size} 単位質量']`, "1");
}

const base = await snapshot();

// 主筋 本数 12 → 16
await page.fill("input[aria-label='C1 主筋 本数']", "16");
const afterMain = await snapshot();

// 帯筋 ピッチ 100 → 200 (본수 감소해야 함)
await page.fill("input[aria-label='C1 帯筋 ピッチ']", "200");
const afterPitch = await snapshot();

// 断面 b 800 → 900 (かぶり 기준 배근 길이 증가)
await page.fill("input[aria-label='C1 断面 b']", "900");
const afterWidth = await snapshot();

console.log(
  JSON.stringify(
    { sizes, beforeUnitMass, base, afterMain, afterPitch, afterWidth },
    null,
    2,
  ),
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc3-section-edit.png")));
