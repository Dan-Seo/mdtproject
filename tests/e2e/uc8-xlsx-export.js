// UC-8: Excel 書き出し — 다운로드가 실제로 트리거되는지 (Blob 가로채기)
const page = await browser.getPage("kijun");
// 自動保存 (IndexedDB) は前の走行を持ち越す。消してから始めないと、この筋書きは
// 「一度目だけ通る」ものになる — 再訪経路そのものを見る uc15 だけは自分で管理する。
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("kijun");
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    }),
);
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
// 自動保存 (M4) が前の筋書きの編集を復元する。どの筋書きもサンプル案件から
// 始めたいので、最初の着地で記録を消してから読み直す。
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
await page.waitForSelector("canvas");

await page.evaluate(() => {
  window.__download = null;
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__download = { size: blob.size, type: blob.type };
    return originalCreate(blob);
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__download = { ...(window.__download ?? {}), filename: this.download, clicked: true };
      return; // 실제 다운로드는 막고 기록만
    }
    return originalClick.call(this);
  };
});

await page.click("button[class*='exportButton']");
await page.waitForFunction(() => window.__download && window.__download.clicked, { timeout: 20000 });

const download = await page.evaluate(() => window.__download);

// ko 로케일로 전환 후 재수출 — 시트명/문구가 로케일을 따르는지
await page.click("button:has-text('한국어')");
await page.evaluate(() => {
  window.__download = null;
});
await page.click("button[class*='exportButton']");
await page.waitForFunction(() => window.__download && window.__download.clicked, { timeout: 20000 });
const downloadKo = await page.evaluate(() => window.__download);

console.log(JSON.stringify({ download, downloadKo }, null, 2));
