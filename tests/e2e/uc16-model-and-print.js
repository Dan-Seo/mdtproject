// UC-16: 3D 模型 (glb) と PDF — 書き出しの二経路。どちらも jsdom には
//        WebGL も印刷ダイアログも無く、実ブラウザでしか通らない。
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
  window.__blob = null;
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__blob = blob;
    return originalCreate(blob);
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__download = { filename: this.download, clicked: true };
      return;
    }
    return originalClick.call(this);
  };
});

await page.click("button:has-text('3D 書き出し')");
await page.waitForFunction(() => window.__download && window.__download.clicked, {
  timeout: 60000,
});

// GLB の中身を読む。magic 'glTF' と version 2、そして JSON チャンクの
// extensionsUsed に EXT_mesh_gpu_instancing が居るか。
const model = await page.evaluate(async () => {
  const buffer = await window.__blob.arrayBuffer();
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)),
  );
  return {
    filename: window.__download.filename,
    type: window.__blob.type,
    bytes: buffer.byteLength,
    magicIsGltf: view.getUint32(0, true) === 0x46546c67,
    version: view.getUint32(4, true),
    extensionsUsed: json.extensionsUsed ?? [],
    nodeNames: json.nodes.map((node) => node.name).filter(Boolean).slice(0, 8),
    meshCount: (json.meshes ?? []).length,
    instancedNodes: (json.nodes ?? []).filter(
      (node) => node.extensions && node.extensions.EXT_mesh_gpu_instancing,
    ).length,
  };
});

// PDF はブラウザの印刷経路。ダイアログを開かせるわけにいかないので
// window.print を差し替え、その瞬間の DOM を測る。
await page.evaluate(() => {
  window.__printed = null;
  window.print = () => {
    const root = document.getElementById("kijun-print-root");
    if (root === null) {
      window.__printed = { present: false };
      return;
    }
    const tables = [...root.querySelectorAll("table")];
    window.__printed = {
      present: true,
      bodyMarked: document.body.classList.contains("kijun-printing"),
      captions: tables.map((table) => table.querySelector("caption").textContent),
      headers: [...tables[0].querySelectorAll("thead th")].map(
        (cell) => cell.textContent,
      ),
      subtotalRows: [...root.querySelectorAll("tr")].filter((row) =>
        row.textContent.includes("小計"),
      ).length,
      hasWatermark: root.textContent.includes("検収前の参考値"),
      hasSourceBlock: root.textContent.includes("算出根拠"),
      bodyRows: root.querySelectorAll("tbody tr").length,
    };
  };
});
await page.click("button:has-text('PDF 書き出し')");
await page.waitForFunction(() => window.__printed !== null, { timeout: 30000 });
const printed = await page.evaluate(() => window.__printed);

// 複製の取り外しは印刷の後の再描画で起きる。一度だけ覗くと再描画前を見て
// しまうので、消えるまで待つ — 消えなければそれは本当の漏れだ。
await page.waitForFunction(
  () => document.getElementById("kijun-print-root") === null,
  { timeout: 20000 },
);
const cleanedUp = await page.evaluate(() => ({
  rootRemoved: document.getElementById("kijun-print-root") === null,
  bodyClassRemoved: !document.body.classList.contains("kijun-printing"),
}));

console.log(JSON.stringify({ model, printed, cleanedUp }, null, 2));
