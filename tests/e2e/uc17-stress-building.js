// UC-17: R4「層当たり鉄筋1万個規模」を実ブラウザで測る。5階 × 4×3スパンの
//        合成案件を「案件を読み込み」から入れ、建物ビューを描かせる。
//
//   前提: 計測フック (__kijunViewerRuntime) は本番ビルドに居ない。dev で回す:
//     npx tsx scripts/perf/stress-fixture.ts 5 > /tmp/stress5.json
//     base64 -w0 /tmp/stress5.json > ~/.dev-browser/tmp/uc17-stress.json.b64
//     npm run dev -- -p 3000
//
//   読み方に二つ落とし穴がある。
//   ① 自動保存が前回の実行を復元する。基準線がストレス案件のままになるので、
//      最初に IndexedDB を消してから始める。
//   ② ヘッドレスのページは可視でないので requestAnimationFrame が 1Hz に
//      絞られる。フレーム間隔も rAF を待つ計測も「約1000ms」しか返さない —
//      それは描画費用ではない。ここで信じるのは **draw call・三角形数・
//      再構築時間・rAF を待たない編集反映時間** の四つだけだ。
const fixtureName = "uc17-stress.json.b64";
let fixtureBase64;
try {
  fixtureBase64 = await readFile(fixtureName);
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

const land = async () => {
  await page.waitForSelector("[data-testid='grand-total']");
  await page.waitForSelector("canvas");
};

const measure = () =>
  page.evaluate(() => ({
    renderer: window.__kijunViewerRuntime.getRendererInfo(),
    rebuild: window.__kijunViewerRuntime.getRebuildStats(),
  }));

// rAF を待たずに、編集が内訳書に出るまでを測る。requestAnimationFrame は
// 可視でないページで 1Hz に絞られるので、待つと計測が全部1秒になる。
const editLatencyMs = (pitch) =>
  page.evaluate(async (nextPitch) => {
    const input = document.querySelector("input[aria-label='C1 帯筋 ピッチ']");
    // 単位質量は利用者入力なので、未入力だと合計は「—」のまま動かない。
    // ピッチで動くのは本数と総延長だ — 表ぜんぶの文字を見る。
    const table = document
      .querySelector("[data-testid='grand-total']")
      .closest("table");
    const before = table.textContent;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;

    const start = performance.now();
    setter.call(input, String(nextPitch));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (table.textContent !== before) {
        return Math.round(performance.now() - start);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }, pitch);

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await land();

// ① 前回の実行が自動保存で残っている。消してから始める。
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
await land();

const environment = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  const info = gl === null ? null : gl.getExtension("WEBGL_debug_renderer_info");
  return {
    gpu:
      gl === null
        ? null
        : info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
    // ② 可視でなければ rAF は絞られる。フレーム計測は信じない。
    visibility: document.visibilityState,
    hasHarness: typeof window.__kijunViewerRuntime !== "undefined",
  };
});
if (!environment.hasHarness) {
  throw new Error(
    "計測フックが居ない — 本番ビルドを見ている。npm run dev で回すこと。",
  );
}

const sampleMembers = await page.evaluate(
  () => window.__kijunStore.getState().project.members.length,
);
await page.click("button[role='tab']:has-text('建物')");
await sleep(3000);
const sample = {
  members: sampleMembers,
  ...(await measure()),
  editMs: await editLatencyMs(150),
};

await page.setInputFiles("input[type='file'][accept*='json']", {
  name: "stress5.json",
  mimeType: "application/json",
  buffer: Buffer.from(fixtureBase64, "base64"),
});
await page.waitForFunction(
  () =>
    document
      .querySelector("header div[class*='projectName']")
      .textContent.includes("stress-4x3x5"),
  { timeout: 30000 },
);
const stressMembers = await page.evaluate(() => ({
  members: window.__kijunStore.getState().project.members.length,
  stories: document.querySelectorAll("[data-testid^='story-subtotal-']").length,
}));

// 建物ビュー = 全部材を InstancedMesh で一度に描く経路 (DESIGN.md §7)。
await page.click("button[role='tab']:has-text('建物')");
await sleep(5000);
const stressed = {
  ...stressMembers,
  ...(await measure()),
  editMs: await editLatencyMs(150),
};

// 後片付け — 次の実行がこの案件を復元しないように。
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("kijun");
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    }),
);

console.log(JSON.stringify({ environment, sample, stressed }, null, 2));
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc17-stress.png")),
);
