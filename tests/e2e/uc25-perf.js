// UC-25-perf: 接合部検討の四つの操作を実ブラウザで測る。
//
//   前提: 本番ビルドで回す。
//     npm run build && npx next start -p 3000
//     npx tsx scripts/perf/stress-fixture.ts 5 > /tmp/stress5.json
//     base64 -w0 /tmp/stress5.json > ~/.dev-browser/tmp/uc25-stress.json.b64
//     npx dev-browser --browser kijun --timeout 300 run tests/e2e/uc25-perf.js
//
//   ヘッドレスのページは可視でないので requestAnimationFrame が 1Hz に絞られる。
//   rAF を待つ計測は何を測っても「約1000ms」を返す — それは応答時間ではない。
//   ここで測るのは全部 **DOM がその変化を見せるまで** であって、描画フレームでは
//   ない(uc17 と同じ読み方)。
//
//   各測定は ウォームアップ1回 + 3回の中央値。
const fixtureName = "uc25-stress.json.b64";
let stressBase64 = null;
try {
  stressBase64 = await readFile(fixtureName);
} catch (error) {
  throw new Error(
    `LOCAL FIXTURE MISSING: 先に実行 — ` +
      `npx tsx scripts/perf/stress-fixture.ts 5 > /tmp/stress5.json && ` +
      `base64 -w0 /tmp/stress5.json > ~/.dev-browser/tmp/${fixtureName} ` +
      `(${String(error)})`,
  );
}

const page = await browser.getPage("kijun");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BUDGET_MS = {
  joint_tab_ms: 1500,
  check_ms: 3000,
  compare_ms: 3000,
  tab_switch_ms: 500,
};

const median3 = (values) => {
  if (values.length !== 3) throw new Error(`UC25PERF median needs 3 samples, got ${values.length}`);
  return [...values].sort((a, b) => a - b)[1];
};

const clearStore = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("kijun");
        request.onsuccess = resolve;
        request.onerror = resolve;
        request.onblocked = resolve;
      }),
  );

const land = async () => {
  await page.waitForSelector("[data-testid='grand-total']");
  await page.waitForSelector("canvas");
};

// 画面内で測る。クリックを出してから、DOM がその結果を見せるまでを poll する。
// 待つ条件は「セレクタが現れる」か「セレクタの文字が変わる」の二つだけで、
// ページに渡すのはデータであってコードではない。
const timeUntil = (spec) =>
  page.evaluate(async (input) => {
    const { clickText, clickSelector, wait, waitSelector, timeoutMs } = input;
    const nodes = [...document.querySelectorAll(clickSelector)];
    const target =
      clickText === null
        ? nodes[0] ?? null
        : nodes.find((node) => (node.textContent ?? "").includes(clickText)) ?? null;
    if (target === null) {
      throw new Error(`UC25PERF no element for ${clickSelector} ${clickText ?? ""}`);
    }
    const read = () => {
      const node = document.querySelector(waitSelector);
      return node === null ? null : (node.textContent ?? "").replace(/\s+/g, " ").trim();
    };
    const before = read();
    const settled = () => {
      const now = read();
      if (wait === "present") return now !== null;
      if (wait === "changed") return now !== null && now !== before;
      throw new Error(`UC25PERF unknown wait ${wait}`);
    };

    const start = performance.now();
    target.click();
    const limit = timeoutMs ?? 20000;
    while (performance.now() - start < limit) {
      if (settled()) return Math.round(performance.now() - start);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return null;
  }, spec);

const settledOrThrow = (value, label) => {
  if (value === null) throw new Error(`UC25PERF ${label} never settled`);
  return value;
};

const showTab = async (group, label, ready) => {
  await page.click(`[aria-label='${group}'] [role='tab']:has-text('${label}')`);
  await page.waitForSelector(ready);
};

// 1) 接合部タブ進入: 柱を選んでから接合部 canvas が出るまで。
const measureJointTab = async (columnSelector) => {
  // 接合部から離れてから測る。平面図は別ペインなのでタブではない。
  await showTab(
    "表示切替",
    "部材",
    "[aria-label='表示切替'] [role='tab'][aria-selected='true']",
  );
  await page.click(columnSelector, { force: true });
  await sleep(120);
  return settledOrThrow(
    await timeUntil({
      clickText: "接合部",
      clickSelector: "[aria-label='表示切替'] [role='tab']",
      wait: "present",
      waitSelector: "canvas[aria-label='接合部の配筋3D']",
    }),
    "joint tab",
  );
};

// 2) 検査実行: ボタンから findings 表が出るまで。
const measureCheck = async () =>
  settledOrThrow(
    await timeUntil({
      clickText: "検査を実行",
      clickSelector: "[data-testid='review-check'] button",
      wait: "present",
      waitSelector: "[data-testid='review-findings']",
    }),
    "check run",
  );

// 3) 断面 b の確定から比較節が更新されるまで。rAF を待たない。
const measureCompare = (nextB) =>
  page.evaluate(async (value) => {
    const input = document.querySelector("input[aria-label$='断面 b']");
    if (input === null) throw new Error("UC25PERF no 断面 b input");
    const compare = document.querySelector("[data-testid='review-compare']");
    if (compare === null) throw new Error("UC25PERF no review-compare section");
    const before = (compare.textContent ?? "").replace(/\s+/g, " ").trim();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;

    const start = performance.now();
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();

    while (performance.now() - start < 20000) {
      const now = (document.querySelector("[data-testid='review-compare']")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (now !== "" && now !== before) return Math.round(performance.now() - start);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return null;
  }, nextB);

// 4) 検討 ↔ 作業 のタブ切替。
const measureTabSwitch = async () => {
  const toWork = settledOrThrow(
    await timeUntil({
      clickText: "作業",
      clickSelector: "[aria-label='内訳書切替'] [role='tab']",
      wait: "present",
      waitSelector: "[data-testid='work-packages']",
    }),
    "tab switch to work",
  );
  await showTab("内訳書切替", "検討", "[data-testid='review-joint']");
  return toWork;
};

// 案件ひとつ分の四測定。ウォームアップ1回 + 3回の中央値。
const measureProject = async (columnSelector) => {
  const jointTab = [];
  const check = [];
  const compare = [];
  const tabSwitch = [];

  await showTab("内訳書切替", "検討", "[data-testid='review-joint']");
  await page.fill("input[aria-label='基準案ラベル']", "uc25-perf baseline");
  await page.click("button:has-text('現在案を基準案として固定')");
  await page.waitForSelector("[data-testid='review-compare']");

  let bValue = 810;
  for (let round = 0; round < 4; round += 1) {
    jointTab.push(await measureJointTab(columnSelector));
    await showTab("内訳書切替", "検討", "[data-testid='review-joint']");
    check.push(await measureCheck());
    bValue += 10;
    compare.push(settledOrThrow(await measureCompare(bValue), "compare update"));
    tabSwitch.push(await measureTabSwitch());
  }

  return {
    joint_tab_ms: median3(jointTab.slice(1)),
    check_ms: median3(check.slice(1)),
    compare_ms: median3(compare.slice(1)),
    tab_switch_ms: median3(tabSwitch.slice(1)),
    raw: { jointTab, check, compare, tabSwitch },
  };
};

const firstColumnSelector = async () => {
  const label = await page.evaluate(() => {
    // 平面の aria-label は「符号 部材id」で、柱の id だけが階と格子点だけで
    // できている(C1 1F-X1Y1)。大梁は -G…-X/-Y、床板は -S…、壁は -W… が入る。
    const buttons = [...document.querySelectorAll("svg g[role='button']")];
    const node =
      buttons.find((candidate) => {
        const label = candidate.getAttribute("aria-label") ?? "";
        const id = label.split(" ").pop() ?? "";
        return /^[^-]+-X\d+Y\d+$/.test(id);
      }) ?? null;
    return node === null ? null : node.getAttribute("aria-label");
  });
  if (label === null) throw new Error("UC25PERF no 柱 in the plan");
  return `svg g[role='button'][aria-label='${label}']`;
};

// --- サンプル案件 ---------------------------------------------------------
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.setViewportSize({ width: 1440, height: 900 });
await clearStore();
await page.reload({ waitUntil: "domcontentloaded" });
await land();

const sample = await measureProject(await firstColumnSelector());

// --- 5階ストレス案件 ------------------------------------------------------
await page.click("[aria-label='内訳書切替'] [role='tab']:has-text('内訳書')");
await page.waitForSelector("[data-testid='grand-total']");
await page.setInputFiles("input[type='file'][accept*='json']", {
  name: "stress5.json",
  mimeType: "application/json",
  buffer: Buffer.from(stressBase64, "base64"),
});
await page.waitForSelector("svg g[role='button']");
await sleep(500);
await land();

const stress5 = await measureProject(await firstColumnSelector());

const budgetMet = Object.keys(BUDGET_MS).every(
  (key) => sample[key] <= BUDGET_MS[key] && stress5[key] <= BUDGET_MS[key],
);

const viewport = await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  userAgent: navigator.userAgent,
}));

console.log(
  "UC25PERF " +
    JSON.stringify({
      conditions: {
        build: "production (npm run build + npx next start -p 3000)",
        browser: "dev-browser headless chromium",
        viewport,
        warmup: 1,
        samples: 3,
        statistic: "median",
        note: "rAF is throttled to ~1Hz on a headless page, so every figure here is measured by polling the DOM, never by waiting for a frame.",
      },
      budget_ms: BUDGET_MS,
      sample,
      stress5,
      budget_met: budgetMet,
    }),
);

if (!budgetMet) {
  throw new Error(
    `UC25PERF budget exceeded: ${JSON.stringify({ budget: BUDGET_MS, sample, stress5 })}`,
  );
}
console.log("UC25PERF BUDGET MET");
