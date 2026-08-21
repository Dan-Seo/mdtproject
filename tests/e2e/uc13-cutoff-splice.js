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
// 継手는 이미 계상되고 있다 — 連続 2スパン 12,800 ＋ 継手 2か所×1,000 ＝ 14,800
checks.continuousLengthWithSplice = before.some((t) => /上端筋.*D25\s*14\.800/.test(t));

// ── ② 端部 本数를 올리면 カットオフ筋이 선다 ─────────────────────
await page.fill("input[aria-label='G1 主筋 上 端部 本数']", "6");
await page.waitForTimeout(400);

const after = await rowTexts();
// 外側支点: 定着 800 ＋ カットオフ位置 1,500 ＝ 2,300 을 両端에 2本씩 ＝ 4本
checks.outerCutoffRow = after.some((t) => /上端カットオフ筋.*D25\s*2\.300/.test(t));
// 中間支点: カットオフ位置 1,500×2 ＋ 中間柱せい 800 ＝ 3,800 (定着 없음)
checks.interiorCutoffRow = after.some((t) => /上端カットオフ筋.*D25\s*3\.800/.test(t));
// 通し筋은 중앙 本数 그대로 4本이고 길이는 변하지 않는다
checks.throughRowUnchanged = after.some((t) => /上端筋.*D25\s*6\.800/.test(t));
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
  gasPressed.some((t) => /上端筋.*D25\s*12\.800/.test(t)) &&
  gasPressed.every((t) => !/上端筋.*D25\s*14\.800/.test(t));
checks.spliceRowShowsMethod = gasPressed.some((t) => /ガス圧接/.test(t));

console.log(JSON.stringify({ inputs, cutoffFormula, checks }, null, 2));
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc13-splice-method.png")));

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
