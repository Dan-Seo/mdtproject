// UC-9: 3D 페인 「部材｜建物」 탭 — 建物 뷰 전환과 부재 선택 연동 (DESIGN.md §7)
// 픽셀 좌표 클릭 피킹은 카메라 각도에 좌우되어 취약하므로, 단언은 DOM 반영
// (aria-label 전환·内訳 선택 행·캔버스 유지)으로 한다. 실제 히트는 로그로 남긴다.
const page = await browser.getPage("kijun");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='grand-total']");
await page.waitForSelector("canvas"); // 하이드레이션 완료 신호

const probe = () =>
  page.evaluate(() => ({
    canvasCount: document.querySelectorAll("canvas").length,
    canvasLabel: document.querySelector("canvas")?.getAttribute("aria-label") ?? null,
    tabSelected: [...document.querySelectorAll("[aria-label='表示切替'] [role='tab']")].map((t) => ({
      label: t.textContent,
      selected: t.getAttribute("aria-selected"),
    })),
    viewerMemberId: document.querySelector("[class*='memberId']")?.textContent?.trim() ?? null,
    selectedGroupRow: [...document.querySelectorAll("[data-testid^='quantity-group-']")]
      .filter((r) => r.getAttribute("aria-selected") === "true")
      .map((r) => r.textContent.trim()),
    selectedPlanMember: [...document.querySelectorAll("svg g[role='button']")]
      .filter((g) => g.getAttribute("aria-pressed") === "true")
      .map((g) => g.getAttribute("aria-label")),
  }));

const before = await probe();

// 建物 탭 클릭 → 같은 캔버스가 유지된 채 aria-label만 建物全体の3D로 바뀐다
await page.click("[aria-label='表示切替'] [role='tab']:nth-of-type(2)");
await page.waitForSelector("canvas[aria-label='建物全体の3D']");
const afterBuildingTab = await probe();

// 플라이인 연출(900ms)이 끝난 뒤 캔버스 중앙 클릭 — 콘크리트/철근 어느 쪽이든
// 부재에 맞으면 selectMember로 4페인 선택이 갱신된다
await page.waitForTimeout(1200);
const canvasBox = await page.evaluate(() => {
  const rect = document.querySelector("canvas").getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.mouse.click(canvasBox.x, canvasBox.y);
const afterCanvasClick = await probe();

// 部材 탭으로 복귀 → 선택 부재의 배근 뷰로 돌아온다
await page.click("[aria-label='表示切替'] [role='tab']:nth-of-type(1)");
await page.waitForSelector("canvas[aria-label='選択部材の配筋3D']");
const afterMemberTab = await probe();

console.log(
  JSON.stringify({ before, afterBuildingTab, afterCanvasClick, afterMemberTab }, null, 2)
);
console.log("SHOT " + (await saveScreenshot(await page.screenshot(), "uc9-building-view.png")));
