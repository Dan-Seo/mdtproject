# Step 8: e2e-flow — 브라우저 전체 흐름 `tests/e2e/uc25-joint-review.js`(＋부정 assertion)와 회귀

## 읽어야 할 파일
- `tests/e2e/README.md`(실행 규약: 각 시나리오는 IndexedDB `kijun` 삭제 후 시작; **build → `next start` → e2e**; dev 서버와 동시 금지), `tests/e2e/uc10-viewer-features.js`, `uc15-revisit.js`(파일 저장/불러오기 UI 조작·Blob 가로채기 `window.__savedBlob`·`readStored`)
- `src/lib/persist/file.ts`(`readProjectFile`), `src/lib/persist/indexeddb.ts`(키 `current`·`review`), `src/components/ProjectActions.tsx`(불러오기 실패는 메시지를 버리고 `project.loadFailed` 「読み込めませんでした — この形式には対応していません。」만 보인다 — **이 동작을 바꾸지 마라**), `src/domain/review/types.ts`(`reviewSchemaVersion` — `version`이 아니다)
- step 1~7의 `data-testid`·aria-label·`data-*` 속성
- `step8-correction.md`(원본 실패와 독립 검토가 검증한 이 한정 보정의 근거)

## 시나리오 `tests/e2e/uc25-joint-review.js` (dev-browser, port 3000, 프로덕션 빌드)
순서대로, 각 단계에 `checks.<name> = boolean`. 기대값은 README 「샘플 案件의 사실」에서만.
1. 착지(DB 삭제→reload) → 平面에서 柱 `1F-X2Y1` 클릭 → 3D 탭 「接合部」 → `canvas[aria-label='接合部の配筋3D']`.
2. 内訳書 탭 「検討」 → `review-joint`에 大梁 **2개**(`G1`·`G2`), 参考 표시 존재.
3. 内訳書 행(柱 主筋) hover → `review-xray`에 設計·形状 두 열, 「一致しない」 존재, 出典 링크 클릭 가능(pointer-events).
4. 「検査を実行」 → `review-findings`에 `干渉候補` ≥1, `data-review-verdict` 셋, clearance 줄 `判断不可（あき基準未入力）`, unchecked에 継手位置, `あき不足候補` 없음. `checkId0`와 findings 표 텍스트 `findings0` 기록.
5. X-Ray hover/선택을 마친 뒤 ordinary SectionTable의 유일한 `C1 帯筋 径`·`C1 帯筋 ピッチ`를 읽는다. synthetic fixture fact가 각각 `D13`·`100`인지 확인하고 명목 호칭에서 `d`를 파싱해 `g = p - d`를 계산한다(`finite`, `g > 1`; 규준 수치가 아님). visible `範囲`를 읽고, `low = g - 1`을 ordinary clearance input에 입력→blur→재실행한다. low `checkIdLow !== checkId0`, 그리고 unordered exact row labels `C1 / 帯筋 / D13 / #0`·`#1`에 해당하는 `あき不足候補`가 0건이어야 한다(다른 insufficiency 행은 제한하지 않는다). 이어 `high = g + 1`을 같은 입력에 입력→blur→재실행한다. `checkIdHigh`는 두 선행 ID와 달라야 하고, 같은 unordered row class에 `あき不足候補`가 있어야 한다. witness의 표시 gap은 `g.toFixed(1)`와 같고 양수이며 `high` 미만, basis는 「利用者入力」·high 값·visible scope를 포함하고 exclusion text는 없어야 한다. DOM은 bar pair class만 식별하며 `segmentIndex`를 주장하지 않는다. high 결과를 기존 `checkId1`·`findings1`·`verdicts1`에 대입해 이후 불변성 검사의 기준으로 삼고, 모든 downstream first-row action은 그대로 둔다.
6. finding 행 클릭 → viewerMode joint, 뷰어 루트에 `data-review-focus="1"`.
7. **부정: 断面カット 이동＋카메라 드래그 후 「検査を実行」 → `checkId === checkId1` 이고 findings 표 텍스트·verdict 세 줄 텍스트가 `findings1`과 동일**(표시 조작은 검사 조건이 아니다).
8. 「検討項目にする」 → 「保存」 → 카드 1, `data-review-status` `未確認` → 「確認」(by 입력)→「確認を保存」 → `確認済`.
9. 「作業」 탭 → 패키지 생성(name·assignee·현재 선택 추가·필수 항목 1 추가·検討項目 연결)→「保存」 → 항목 確認済 → `data-package-state` `準備完了`.
10. 「検討」 탭 → label 입력 → 「現在案を基準案として固定」.
11. 断面一覧에서 C1 `b` 800→900 입력(실제 aria-label을 SectionTable에서 확인해 쓴다).
12. 「検討」 탭: 비교 절에 부재 영향 ≥1, 支持柱 경로 문장 존재; 検討項目 카드가 `再検討必要`＋이유; 필터 체크 → 카드 1 유지.
13. 「作業」 탭: `準備未完`＋`data-blocker`에 「前モデルの検討が残っている」.
14. **부정: 断面カット·카메라·備考 편집 후에도 카드 상태·패키지 상태 텍스트 불변.**
15. 「案件を保存」(Blob 가로채기로 JSON 획득) → **저장 형태 검사**: `json.review.items.length === 1`, `json.review.packages.length === 1`, `json.review.baseline.label`이 10의 값, `json.review.reviewSchemaVersion === 1`, `json.schemaVersion`이 저장 전 IndexedDB `current`의 값과 같다(`PROJECT_SCHEMA_VERSION` 불변). → DB 삭제 → reload → 「案件を読み込み」로 같은 JSON 주입(`setInputFiles`) → 検討 탭 카드 1(`再検討必要` 유지)·作業 탭 패키지 1(`準備未完`)·基準案 label 유지.
16. 자동저장: 15 대신 reload만으로도 카드·패키지가 남는다(IndexedDB `review` 키를 `readStored` 방식으로 읽어 `items.length === 1`).
17. **부정: 구 파일** — 15의 JSON에서 `review` 키를 지운 파일을 불러오기 → 検討 탭 카드 0·패키지 0·基準案 없음, 内訳書는 정상(행 수 > 0). 실패 문구 없음.
18. **부정: 版 불일치** — `review.reviewSchemaVersion`을 `2`로 바꾼 파일을 불러오기 → 페인 안에 기존 실패 문구 「読み込めませんでした」가 보이고, `review` 상태는 직전 상태 그대로(카드 수·基準案 label 불변), `project`도 불변(案件名 불변).
19. `data-review-verdict`·`data-review-status`·`data-package-state`·`data-blocker` 전 요소 텍스트에 「合格」「安全」「承認」「施工可能」「適合」 없음; `data-review-notice` 둘 존재.
마지막에 `console.log(JSON.stringify(checks))`와 스크린샷 `uc25-joint-review.png`.

## 실행 절차 (그대로 실행하고 출력 발췌를 report에)
```bash
npm run build
npx next start -p 3000 &   # 백그라운드. 끝나면 반드시 종료
npx dev-browser --browser kijun --timeout 180 run tests/e2e/uc25-joint-review.js
# 회귀: uc1 uc2 uc3 uc7 uc9 uc10 uc15
```
`tests/e2e/README.md` 표에 uc25 한 줄 추가.

## Acceptance Criteria
- uc25 `checks` 전부 true(출력 JSON을 report에 그대로).
- 회귀 7개 시나리오 통과 출력.
- `npx vitest run && npx tsc --noEmit && npm run lint`.

## 산출물
`step8-report.json`: host browser를 실제로 다시 돌리기 전에는 `checks`를 null로 두고, 원본 실패 receipt와 보정 script의 unrun 상태를 구분해 적는다. 실제 runtime 뒤에만 `{ "checks": {...}, "regressions": {...}, "screenshot": "path", "paths_verified": ["tests/e2e/uc25-joint-review.js", "tests/e2e/README.md"] }`를 기록한다.

## 금지사항
- `next dev`가 떠 있는 채로 `npm run build`를 돌리지 마라(같은 `.next`).
- 통과시키려고 시나리오의 기대값을 결과에 맞추지 마라 — 실패하면 report에 적고 `error`. 실행하지 않은 것을 실행했다고 쓰지 마라.
- 컴포넌트 코드를 고치지 마라(e2e 스텝). 어긋나면 `error`로 두고 무엇이 어긋났는지 적어라.
- corrected script/spec 작성과 static/helper 검증만으로 browser acceptance를 주장하지 마라. `src`·product/core/rulepack·fixture·store를 바꾸지 말고, high witness가 없거나 low forbidden witness가 나오면 즉시 `error`로 남겨라.
