// UC-11: 連続スパン 大梁의 通し筋 (M3b)
// 유닛테스트가 보는 것(런 탐색·zones 개수)은 여기서 다시 보지 않는다. 실 브라우저
// 에서만 드러나는 것 — 연속 스팬이 미지원으로 빠지지 않고 실제로 배근·内訳에
// 나오는가, 산출식이 런 구성과 継手 계상 근거를 밝히는가 — 만 본다.
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};
const failed = [];

// ── ① 「連続スパン 미지원」 고지가 사라졌다 ──────────────────────
const notice = await page.evaluate(() => ({
  mentionsContinuous: document.body.textContent.includes("連続スパン"),
  unsupportedPlan:
    document.querySelector("[data-testid='unsupported-plan']")?.textContent.trim() ?? null,
}));
checks.noContinuousSpanNotice = notice.mentionsContinuous === false;
checks.noUnsupportedPlan = notice.unsupportedPlan === null;

// ── ② Y방향(연속) 大梁을 고른다 ──────────────────────────────────
const labels = await page.evaluate(() =>
  [...document.querySelectorAll("svg g[role='button']")]
    .map((el) => el.getAttribute("aria-label"))
    .filter(Boolean),
);
// 평면 라벨은 부재 id 를 담는다 — 축 접미사 -Y 가 연속 스팬 쪽이다.
const yLabel = labels.find((l) => /-Y\b|Y$/.test(l)) ?? null;
checks.continuousGirderSelectable = yLabel !== null;

if (yLabel) {
  await page.click(`svg g[role='button'][aria-label='${yLabel}'] line[class*='girderHitArea']`, {
    force: true,
  });
  await page.waitForTimeout(400);
}

const selected = await page.evaluate(() => {
  const legend = document.querySelector("aside[aria-label='定着・継手凡例']");
  return {
    viewerMemberId:
      document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
    canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
    emptyText: document.querySelector("[class*='empty']")?.textContent.trim() ?? null,
    legendChips: legend ? [...legend.querySelectorAll("li")].map((li) => li.textContent.trim()) : [],
    rows: [...document.querySelectorAll("[data-testid^='quantity-line-']")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
    formulas: [...document.querySelectorAll("[data-testid^='formula-']")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
  };
});

checks.notUnsupported = selected.emptyText === null;
checks.legendShown = selected.legendChips.length > 0;
checks.throughBarRows = selected.rows.some((t) => /上端筋/.test(t)) &&
  selected.rows.some((t) => /下端筋/.test(t));

// 런 모델이 맞으면 같은 符号 G1(D25)에 두 길이가 공존한다:
// 折曲げ定着 全長은 5.3.4(5)(ｲ)(a)에 따라 直線定着 L1 40d ＝ 1,000 이다
//   (2026-08-21 이전에는 L1h 를 하한으로 써서 800 이었다 — R7③-1).
// 단일 스팬 8,200 = 内法 5,200 ＋ 定着 1,000×2 ＋ 継手 1か所×1,000
//   (1通則4) — 鉄筋 7.2m 가 D25 의 7.0m 를 넘겨 1か所. 예전 6.8m 에서는 0か所였다)
// 연속 2스팬 15,200 = (内法 5,200×2 ＋ 中間柱せい 800) ＋ 定着 1,000×2 ＋ 継手 2か所×1,000
//   (（３）梁2) — 梁の長さ 12.8m ≥ 10.0m 이므로 2か所. R8 해소로 계상된다)
// 연속 쪽이 없으면 미지원으로 빠진 것이고, 단일 쪽이 없으면 런 탐색이 과하게 묶은 것이다.
checks.singleSpanLengthPresent = selected.rows.some((t) => /上端筋.*D25\s*8\.200/.test(t));
checks.continuousRunLengthPresent = selected.rows.some((t) => /上端筋.*D25\s*15\.200/.test(t));

// ── ③ 산출식이 런 구성과 継手 계상 근거를 밝힌다 ────────────────
// 산출식 행은 内訳 행을 눌러야 펼쳐진다.
const expanded = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-testid^='quantity-line-']")].find(
    (r) => /上端筋/.test(r.textContent) && r.textContent.includes("15.200"),
  );
  if (!row) return false;
  row.click();
  return true;
});
await page.waitForTimeout(200);

const formulas = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid^='formula-']")].map((r) =>
    r.textContent.replace(/\s+/g, " ").trim(),
  ),
);
const throughFormula = formulas.find((f) => f.includes("中間柱せい")) ?? null;

checks.formulaRowExpands = expanded && formulas.length > 0;
checks.formulaNamesIntermediateColumn = throughFormula !== null;
// 継手는 이제 계상된다(R8 해소) — 質量行의 산출식이 산입분을 밝히고,
// 箇所는 단위가 달라 별도 행으로 선다.
checks.formulaCountsSplice = formulas.some((f) =>
  /継手 2か所 × 重ね継手長さ/.test(f),
);
checks.splicePlaceRowPresent = selected.rows.some((t) =>
  /上端筋.*継手（重ね継手）/.test(t),
);

// 런 部材 뷰는 스크린샷으로 남긴다 — あばら筋이 2번째 스팬에 실제로 놓였는지는
// 좌표 단언(Viewer3D.test.tsx)이 보지만, 형상이 성립하는지는 눈으로 봐야 한다.
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc11-run-member-view.png")),
);

// ── ④ 建物 뷰가 그대로 선다 ──────────────────────────────────────
await page.click("[aria-label='表示切替'] [role='tab']:nth-of-type(2)");
await page.waitForSelector("canvas[aria-label='建物全体の3D']");
await page.waitForTimeout(1400);
checks.buildingViewRenders =
  (await page.evaluate(() => document.querySelector("canvas")?.getAttribute("aria-label"))) ===
  "建物全体の3D";

// 런 部材 뷰는 어느 스팬을 골라도 런 대표 부재를 보여준다 — 축이 뒤바뀌면
// 선택 매핑이 깨진 것이다.
checks.viewerShowsRunOwner = selected.viewerMemberId === "1F-G1-X1Y1-Y";

console.log(
  JSON.stringify(
    { notice, yLabel, viewerMemberId: selected.viewerMemberId, legendChips: selected.legendChips, throughFormula, checks },
    null,
    2,
  ),
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc11-continuous-girder.png")));

for (const [name, ok] of Object.entries(checks)) if (!ok) failed.push(name);
if (failed.length) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
