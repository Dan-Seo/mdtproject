# Step 9: perf-browser — 실측 `tests/e2e/uc25-perf.js`

## 읽어야 할 파일
- `tests/e2e/README.md`, `tests/e2e/uc17-stress-building.js`(계측 방식 — rAF 간격을 믿지 않는다; 스트레스 案件 주입), `scripts/perf/stress-fixture.ts`, step 8의 `uc25-joint-review.js`(조작 순서 재사용)
- README 결정 9(목표와 조건)

## 만들 것 `tests/e2e/uc25-perf.js` (계측 전용)
샘플 案件과 `npx tsx scripts/perf/stress-fixture.ts 5` 案件(파일 불러오기 UI로 주입) 각각에서 `performance.now()`로, **워밍업 1회 후 3회 중앙값**:
- 접합부 탭 진입(柱 선택→canvas aria-label 변경까지) — 스트레스 案件에서는 柱 하나를 고른다(id는 스크립트가 `document`에서 읽는다).
- 検査 실행(버튼 클릭→`review-findings` 렌더까지).
- 断面 b 입력 커밋→비교 절 요약 갱신까지(기준안 고정 후).
- 検討 탭↔作業 탭 전환.
rAF 기반 값은 쓰지 않는다. 결과는 조건(headless·기기·중앙값)과 함께 report에.

## 실행 절차
```bash
npm run build          # step 8 빌드가 남아 있으면 생략 가능 — next dev가 없는지 먼저 확인
npx next start -p 3000 &
npx tsx scripts/perf/stress-fixture.ts 5 > /tmp/stress5.json
npx dev-browser --browser kijun --timeout 300 run tests/e2e/uc25-perf.js
```
`tests/e2e/README.md` 표에 uc25-perf 한 줄 추가.

## Acceptance Criteria
- 두 案件 모두 4개 측정의 중앙값이 README 결정 9 이내. 초과하면 이 step은 `error`로 끝내고 수치와 병목 후보(`runGeometryCheck`의 `buildingLayout` 재계산, `parseProject`, `projectFingerprints` 등)를 report에 적는다 — 목표를 올리거나 시나리오를 줄여 통과시키지 마라. 코드를 고치지 마라(계측 스텝).

## 산출물
`step9-report.json`: `{ "perf_browser": { "conditions": "...", "sample": { "joint_tab_ms", "check_ms", "compare_ms", "tab_switch_ms" }, "stress5": {...}, "budget_met": bool }, "paths_verified": ["tests/e2e/uc25-perf.js"] }`

## 금지사항
- `next dev`가 떠 있는 채로 `npm run build`를 돌리지 마라.
- 계측 수치를 유닛 실행시간으로 대신하지 마라. rAF 간격을 응답시간으로 보고하지 마라. 수치는 실제 실행에서만.
