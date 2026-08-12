// UC-10: 部材 뷰 기능 4종 — 레이어 토글·단면 컷·호버 툴팁·정착 범례 (M3a)
// 3D 내부 상태(mesh.visible·clippingPlanes)는 유닛테스트가 본다. 여기서는
// 실 브라우저에서만 확인되는 것 — 컨트롤이 DOM에 붙었는지, 실제 WebGL 씬에
// 레이캐스트가 걸려 툴팁이 뜨는지, 범례 수치가 렌더되는지 — 만 본다.
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas");

const checks = {};

// 大梁 G1 선택 — 支持 스팬이라 zones가 있고 범례가 뜬다
const girderLabel = await page.evaluate(() => {
  const g = [...document.querySelectorAll("svg g[role='button']")].find((el) =>
    el.getAttribute("aria-label").startsWith("G1")
  );
  return g ? g.getAttribute("aria-label") : null;
});
// 수평 <line>은 bbox 높이가 0이라 Playwright가 invisible로 판정 → force
await page.click(`svg g[role='button'][aria-label='${girderLabel}'] line[class*='girderHitArea']`, {
  force: true,
});
await page.waitForTimeout(300);

// ── ④ 정착 범례 ────────────────────────────────────────────────
const legend = await page.evaluate(() => {
  const el = document.querySelector("aside[aria-label='定着・継手凡例']");
  if (!el) return null;
  return {
    chips: [...el.querySelectorAll("li")].map((li) => li.textContent.trim()),
    swatches: [...el.querySelectorAll("[data-zone-kind]")].map((s) => ({
      kind: s.getAttribute("data-zone-kind"),
      color: s.style.backgroundColor,
    })),
  };
});
checks.legendShown = legend !== null && legend.chips.length > 0;
checks.legendHasAnchorage = !!legend && legend.chips.some((c) => c.includes("定着"));
checks.legendHasNumbers = !!legend && legend.chips.some((c) => /\d/.test(c));

// ── ① 레이어 토글 ──────────────────────────────────────────────
const layerState = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("button[aria-pressed]")]
      .filter((b) => ["主筋", "帯筋・あばら筋", "コンクリート"].includes(b.textContent.trim()))
      .map((b) => ({ label: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") }))
  );

const layersBefore = await layerState();
await page.click("button:has-text('帯筋・あばら筋')");
const layersAfterOff = await layerState();
await page.click("button:has-text('帯筋・あばら筋')");
const layersAfterOn = await layerState();

const pressedOf = (state, label) => state.find((l) => l.label === label)?.pressed;
checks.layersStartVisible = layersBefore.length === 3 && layersBefore.every((l) => l.pressed === "true");
checks.layerTogglesOff = pressedOf(layersAfterOff, "帯筋・あばら筋") === "false";
checks.layerOtherUnaffected = pressedOf(layersAfterOff, "主筋") === "true";
checks.layerTogglesBackOn = pressedOf(layersAfterOn, "帯筋・あばら筋") === "true";

// ── ② 단면 컷 ──────────────────────────────────────────────────
const clipState = () =>
  page.evaluate(() => {
    const group = document.querySelector("[aria-label='断面カット']");
    if (!group) return null;
    return {
      buttons: [...group.querySelectorAll("button")].map((b) => ({
        label: b.textContent.trim(),
        pressed: b.getAttribute("aria-pressed"),
      })),
      ratio: group.querySelector("input[type='range']")?.value ?? null,
    };
  });

const clipBefore = await clipState();
await page.click("[aria-label='断面カット'] button:nth-of-type(1)");
await page.click("[aria-label='断面カット'] button:nth-of-type(3)"); // Y軸
// range는 React onChange를 태워야 하므로 키보드로 민다
await page.focus("input[aria-label='切断位置']");
for (let i = 0; i < 10; i += 1) await page.keyboard.press("ArrowRight");
const clipAfter = await clipState();

const axisPressed = (state) =>
  state.buttons.filter((b) => b.label.endsWith("軸") && b.pressed === "true").map((b) => b.label);
checks.clipControlsPresent = clipBefore !== null && clipBefore.buttons.length === 4;
checks.clipTogglesOn = clipAfter.buttons[0].pressed === "true";
checks.clipAxisExclusive = axisPressed(clipAfter).length === 1 && axisPressed(clipAfter)[0] === "Y軸";
checks.clipRatioMoved = clipAfter.ratio !== clipBefore.ratio;

// 컷을 되돌려 툴팁 스윕이 잘린 형상 위에서 돌지 않게 한다
await page.click("[aria-label='断面カット'] button:nth-of-type(1)");
await page.waitForTimeout(200);

// ── ③ 호버 툴팁 ────────────────────────────────────────────────
// 픽셀 히트는 카메라 각도에 좌우되므로 캔버스를 격자로 훑어 첫 히트를 취한다
const box = await page.evaluate(() => {
  const r = document.querySelector("canvas").getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});

const readTooltip = () =>
  page.evaluate(() => {
    const el = document.querySelector("[role='tooltip']");
    if (!el || el.hasAttribute("hidden")) return null;
    const text = el.textContent.trim();
    return text.length > 0 ? text : null;
  });

let hover = null;
const swept = [];
for (const fy of [0.45, 0.5, 0.55, 0.4, 0.6]) {
  for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) {
    await page.mouse.move(box.x + box.w * fx, box.y + box.h * fy);
    await page.waitForTimeout(90);
    const text = await readTooltip();
    swept.push({ fx, fy, hit: text !== null });
    if (text !== null) {
      hover = { fx, fy, text };
      break;
    }
  }
  if (hover) break;
}

checks.tooltipShowsOnHover = hover !== null;
checks.tooltipHasRebarFields =
  hover !== null && ["役割", "径", "本数", "加工長"].every((f) => hover.text.includes(f));

// pointerleave → 숨김
await page.mouse.move(box.x - 20, box.y - 20);
await page.waitForTimeout(200);
checks.tooltipHidesOnLeave = (await readTooltip()) === null;

console.log(
  JSON.stringify(
    { girderLabel, legend, layersBefore, layersAfterOff, layersAfterOn, clipBefore, clipAfter, hover, swept, checks },
    null,
    2
  )
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc10-viewer-features.png")));

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) throw new Error("FAILED CHECKS: " + failed.join(", "));
console.log("ALL CHECKS PASSED");
