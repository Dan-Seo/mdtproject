// UC-15: 再訪経路 — IndexedDB 自動保存からの復元と、案件 JSON の保存・読み込み。
//        jsdom には IndexedDB が無いので、実ブラウザでしか通らない経路だ。
//        本番ビルドには window.__kijunStore が居ないので、操作は全部 UI から入れる。
const page = await browser.getPage("kijun");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// waitForFunction は非同期の述語を待てないので、IndexedDB はこちら側で回す。
const readStored = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("kijun", 1);
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          let transaction;
          try {
            transaction = open.result.transaction("project", "readonly");
          } catch {
            resolve(null);
            return;
          }
          const get = transaction.objectStore("project").get("current");
          get.onsuccess = () => {
            const value = get.result;
            open.result.close();
            resolve(typeof value === "string" ? value : null);
          };
          get.onerror = () => resolve(null);
        };
      }),
  );

const waitForStored = async (needle) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stored = await readStored();
    if (stored !== null && stored.includes(needle)) return true;
    await sleep(500);
  }
  return false;
};

const land = async () => {
  await page.waitForSelector("[data-testid='grand-total']");
  await page.waitForSelector("canvas");
};

const readState = () =>
  page.evaluate(() => ({
    projectName: document.querySelector("header div[class*='projectName']")
      .textContent,
    mainCount: document.querySelector("input[aria-label='C1 主筋 本数']").value,
    hoopPitch: document.querySelector("input[aria-label='C1 帯筋 ピッチ']")
      .value,
    grandTotal: document
      .querySelector("[data-testid='grand-total']")
      .textContent.replace(/\s+/g, " ")
      .trim(),
  }));

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await land();
// 前回の記録を消してからでないと、この試験が前の回の残りを見てしまう。
await clearStore();
await page.reload({ waitUntil: "domcontentloaded" });
await land();

const firstVisit = {
  ...(await readState()),
  storedBefore: await readStored(),
};

// 断面一覧のセルを打つ ＝ 実際の利用者の編集。これが自動保存に乗るか。
await page.fill("input[aria-label='C1 主筋 本数']", "16");
await page.fill("input[aria-label='C1 帯筋 ピッチ']", "250");
const edited = await readState();
const autosaved = await waitForStored('"pitch":250');

// タブを開き直す＝リロード。サンプルではなく続きが出るか。
await page.reload({ waitUntil: "domcontentloaded" });
await land();
await page.waitForFunction(
  () => document.querySelector("input[aria-label='C1 主筋 本数']").value === "16",
  { timeout: 20000 },
);
const restored = await readState();

// 案件 JSON の書き出し — Blob を横取りして中身まで見る。
await page.evaluate(() => {
  window.__saved = null;
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__savedBlob = blob;
    return originalCreate(blob);
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__saved = { filename: this.download, clicked: true };
      return;
    }
    return originalClick.call(this);
  };
});
await page.click("button:has-text('案件を保存')");
await page.waitForFunction(() => window.__saved && window.__saved.clicked, {
  timeout: 20000,
});
const saved = await page.evaluate(async () => {
  const parsed = JSON.parse(await window.__savedBlob.text());
  return {
    filename: window.__saved.filename,
    type: window.__savedBlob.type,
    name: parsed.name,
    schemaVersion: parsed.schemaVersion,
    hoopPitch: parsed.sections.find((section) => section.mark === "C1").hoop
      .pitch,
  };
});

// 読み込み — 書き出したものを名前と本数だけ変えて戻す。
await page.evaluate(async () => {
  const parsed = JSON.parse(await window.__savedBlob.text());
  parsed.name = "UC15 取り込んだ案件";
  parsed.sections.find((section) => section.mark === "C1").main.count = 20;

  const input = document.querySelector("input[type='file'][accept*='json']");
  const data = new DataTransfer();
  data.items.add(
    new File([JSON.stringify(parsed)], "uc15.json", {
      type: "application/json",
    }),
  );
  input.files = data.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForFunction(
  () =>
    document
      .querySelector("header div[class*='projectName']")
      .textContent.includes("取り込んだ"),
  { timeout: 20000 },
);
const imported = await readState();

// 読めないファイルは今の案件を残したまま失敗を言う。
await page.evaluate(() => {
  const input = document.querySelector("input[type='file'][accept*='json']");
  const data = new DataTransfer();
  data.items.add(
    new File(["{ not json"], "broken.json", { type: "application/json" }),
  );
  input.files = data.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForSelector("header [role='alert']", { timeout: 20000 });
const afterFailure = await page.evaluate(() => ({
  alert: document.querySelector("header [role='alert']").textContent,
  projectName: document.querySelector("header div[class*='projectName']")
    .textContent,
  mainCount: document.querySelector("input[aria-label='C1 主筋 本数']").value,
}));

await clearStore();

console.log(
  JSON.stringify(
    { firstVisit, edited, autosaved, restored, saved, imported, afterFailure },
    null,
    2,
  ),
);
console.log(
  "SHOT " + (await saveScreenshot(await page.screenshot(), "uc15-revisit.png")),
);
