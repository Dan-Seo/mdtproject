// UC-13: カットオフ筋과 継手方式 (M3b 마감)
// 유닛테스트가 보는 것(길이 조립·본수 배분)은 여기서 다시 보지 않는다. 실 브라우저
// 에서만 드러나는 것 — 断面一覧의 새 입력칸이 실제로 물량을 바꾸는가, カットオフ筋이
// 内訳·3D·고지에 함께 나타나는가 — 만 본다.
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

const rowTexts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
  );

// ── ① 입력칸이 있다 ───────────────────────────────────────────────
const inputs = await page.evaluate(() => ({
  spliceMethod: document.querySelector("select[aria-label='G1 継手方式']")?.value ?? null,
  endCount: document.querySelector("input[aria-label='G1 主筋 上 端部 本数']")?.value ?? null,
  centerCount: document.querySelector("input[aria-label='G1 主筋 上 中央 本数']")?.value ?? null,
  cutoff: document.querySelector("input[aria-label='G1 カットオフ位置']")?.value ?? null,
}));
checks.spliceMethodSelectable = inputs.spliceMethod === "重ね継手";
checks.positionCountsEditable = inputs.endCount === "4" && inputs.centerCount === "4";
checks.cutoffPositionEditable = inputs.cutoff === "1500";

// 端部と中央が同数のあいだはカットオフ筋も告知も出ない
const before = await rowTexts();
checks.noCutoffRowBefore = before.every((t) => !/カットオフ筋/.test(t));
checks.noCutoffNoticeBefore =
  (await page.evaluate(
    () => document.querySelector("[data-testid='cutoff-anchorage-notice']") !== null,
  )) === false;
// 継手는 이미 계상되고 있다 — 連続 2スパン 13,200 ＋ 継手 2か所×1,000 ＝ 15,200
//   (折曲げ定着 全長은 5.3.4(5)(ｲ)(a) 의 直線定着 L1 1,000. R7③-1 이전에는 800 이었다)
checks.continuousLengthWithSplice = before.some((t) => /上端筋.*D25\s*15\.200/.test(t));

// ── ② 端部 本数를 올리면 カットオフ筋이 선다 ─────────────────────
await page.fill("input[aria-label='G1 主筋 上 端部 本数']", "6");
await page.waitForTimeout(400);

const after = await rowTexts();
// 外側支点: 折曲げ定着 全長 1,000 ＋ カットオフ位置 1,500 ＝ 2,500 을 両端에 2本씩 ＝ 4本
checks.outerCutoffRow = after.some((t) => /上端カットオフ筋.*D25\s*2\.500/.test(t));
// 中間支点: カットオフ位置 1,500×2 ＋ 中間柱せい 800 ＝ 3,800 (定着 없음)
checks.interiorCutoffRow = after.some((t) => /上端カットオフ筋.*D25\s*3\.800/.test(t));
// 通し筋은 중앙 本数 그대로 4本이고 길이는 변하지 않는다 (単一 스팬 8,200)
checks.throughRowUnchanged = after.some((t) => /上端筋.*D25\s*8\.200/.test(t));
checks.cutoffNoticeShown = await page.evaluate(() => {
  const notice = document.querySelector("[data-testid='cutoff-anchorage-notice']");
  return notice !== null && notice.textContent.includes("定着");
});

// ── ③ 산출식이 근거를 밝힌다 ─────────────────────────────────────
const expanded = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")].find((r) =>
    /上端カットオフ筋/.test(r.textContent),
  );
  if (!row) return false;
  row.click();
  return true;
});
await page.waitForTimeout(250);

const formulas = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='formula-']")].map((r) =>
    r.textContent.replace(/\s+/g, " ").trim(),
  ),
);
const cutoffFormula = formulas.find((f) => f.includes("カットオフ位置")) ?? null;
checks.formulaRowExpands = expanded && formulas.length > 0;
checks.formulaNamesDesignDocument =
  cutoffFormula !== null && cutoffFormula.includes("設計図書");
checks.formulaNamesClause =
  cutoffFormula !== null && cutoffFormula.includes("2（３）梁1)");

// ── ④ 3D가 カットオフ筋을 그린 채로 선다 ──────────────────────────
checks.memberViewRenders = await page.evaluate(
  () => document.querySelector("canvas") !== null,
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc13-cutoff.png")));

// ── ⑤ 継手方式을 바꾸면 設計長さ가 바뀐다 ────────────────────────
// ガス圧接은 1通則5)「長さの変化はないものとする」— 継手 2か所분 2,000 이 빠진다.
await page.selectOption("select[aria-label='G1 継手方式']", "ガス圧接");
await page.waitForTimeout(400);

const gasPressed = await rowTexts();
checks.spliceMethodChangesLength =
  gasPressed.some((t) => /上端筋.*D25\s*13\.200/.test(t)) &&
  gasPressed.every((t) => !/上端筋.*D25\s*15\.200/.test(t));
checks.spliceRowShowsMethod = gasPressed.some((t) => /ガス圧接/.test(t));

// ── ⑥ カットオフ位置를 지우면 고칠 곳을 짚어 준다 ────────────────
// 断面·内法의 寸法不成立과 같은 문구로 묶이면 「支点柱나 스팬을 고치라」는
// 엉뚱한 안내가 나간다 — 고칠 곳은 断面一覧의 カットオフ位置다.
await page.fill("input[aria-label='G1 カットオフ位置']", "0");
await page.waitForTimeout(400);

const unsupported = await page.evaluate(() => {
  const notice = document.querySelector("[data-testid='unsupported-notice']");
  return notice ? notice.textContent.replace(/\s+/g, " ").trim() : null;
});
checks.unsupportedNoticeShown = unsupported !== null;
checks.unsupportedNamesCutoffPosition =
  unsupported !== null && unsupported.includes("カットオフ位置");
checks.unsupportedKeepsNoRawKey =
  unsupported !== null && !unsupported.includes("unsupported.reason");

console.log(JSON.stringify({ inputs, cutoffFormula, unsupported, checks }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc13-splice-method.png")));

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
