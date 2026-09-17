# 사양 반증 브리프 (codex, Herdr pane) — phase 48(UI) 사양을 코드베이스와 대조해 **반증**하라. 고치지 마라.

당신은 검증자다. 구현자가 아니다. 사양 파일·코드·테스트를 수정하지 말고, 발견한 것을 `phases/48-joint-review-ui/spec-refutation.md`에만 쓴다. 이 워킹트리는 phase 47(코어)의 최종 커밋이다 — `src/domain/review/**`, `src/lib/review/**`, `src/lib/persist/**`, `src/lib/store.ts`가 실제 구현이다. phase 48 사양은 그 위에 UI를 얹는다.

## 대상
- `phases/48-joint-review-ui/README.md`, `step1.md` ~ `step6.md`, `index.json`
- 대조 기준: 실제 코드(`src/**`, `tests/**`, `tests/e2e/README.md`, `scripts/execute.py`), phase 47 구현(`src/domain/review/*.ts`, `src/lib/review/*.ts`, `src/lib/persist/*.ts`, `src/lib/store.ts`, `src/lib/hooks/useProjectPersistence.ts`)과 그 사양(`phases/47-joint-review-core/README.md`·`step*.md`), `AGENTS.md`, `docs/ADR.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/UX.md`, `src/lib/telemetry.ts`

## 반증 항목 — 각 항목에 대해 「성립 / 불성립 / 판단 불가」와 근거(파일·줄)를 적어라
1. **인용의 정확성**: 사양이 가리키는 파일·컴포넌트·함수·스토어 필드·i18n 키·CSS 모듈·data-testid·e2e 헬퍼가 실제로 그 이름·그 시그니처로 있는가. 특히 (a) `src/lib/store.ts`의 `AppState` 필드와 액션(`sel`·`viewerMode`·`viewerLayers`·`activeStoryId`·`setReview`·`loadProject(project, review?)`), (b) `src/components/viewer/Viewer3D.tsx`의 구조(three.js 씬·InstancedMesh·OrbitControls 유무·clipping planes 유무·`buildingLayout` 호출 위치·모드 분기), (c) `ViewerTabs`·`StoryTabs`·`TakeoffPane`의 탭 구현 방식, (d) phase 47 API의 실제 시그니처 — `resolveJoint(project, columnMemberId)`, `runGeometryCheck(CheckInput)`의 `CheckInput` 필드, `assessImpact(baseline: TakeoffSnapshot, current: TakeoffSnapshot)`, `itemValidity(item, CurrentModel)`, `packageReadiness(pkg, items, CurrentModel)`, `xrayForRow(rowId, rebars, project, lines)`, `state.ts`의 reducer 이름·인자, `newReviewId(prefix, existingIds)`, `projectFingerprints(...)` 인자 6개, `defaultExclusions(now)`, `saveBundle`·`loadStoredBundle`, `useProjectPersistence`의 review 자동저장. 사양이 다른 이름·다른 형태를 전제하면 전부 목록으로.
2. **실행 가능성**: 각 step이 codex 1회 실행(1800초)에 끝날 분량인가. step 1(뷰어)·step 2(検討 탭)가 특히 큰지 판단하고, 크면 어느 부분을 어느 step으로 옮길지 제안(제안만).
3. **금지사항 충돌**: (a) `src/lib/telemetry.ts`의 `before_send` 허용목록과 기존 `capture()` 호출을 읽고, 사양이 검토 데이터(부재명·좌표·메모)가 새는 경로를 만들 여지가 있는지, (b) `src/domain`에 React/DOM이 들어갈 지점, (c) `src/lib/review/**`가 `src/components`를 import하게 되는 지점, (d) UI 문자열에 「合格」「安全」「承認」「施工可能」이 들어갈 지점, (e) 어떤 버튼이 `Project`의 断面·配筋을 자동으로 바꾸는 지점, (f) 새 페이지·라우트·위저드를 만드는 지점(UX.md §3.2·§9).
4. **설계 결정의 허점**: (a) `state.ts`의 모든 reducer가 `parseReviewState`를 입력·출력 두 번 돌리고 `baseline.project`를 `parseProject`로 전수 검사한다 — 사양의 편집 UI(메모 본문·担当者 입력)가 키 입력마다 `setReview`를 부르면 스트레스 案件(5층 합성)에서 어떻게 되는가. 사양이 이를 다루는가(로컬 상태·blur 시 커밋 등). (b) `runGeometryCheck`가 호출마다 `buildingLayout(project, rebars, …, 実寸 radius)`를 **전 건물**에 대해 다시 만든다 — 사양의 「検査を実行」이 스트레스 案件에서 몇 ms일지 추정 근거를 코드에서 대고, 사양의 성능 목표·측정 방법(step 4)이 이를 잡는지. (c) 기준안 고정이 `Project` 사본을 `review.baseline`에 넣어 IndexedDB `review` 키로 저장한다 — 5층 스트레스 案件 JSON 크기(`npx tsx scripts/perf/stress-fixture.ts 5`의 출력 크기)와 자동저장 debounce(`AUTOSAVE_DEBOUNCE_MS`)를 읽고 문제가 되는지. (d) 3D 접합부 모드의 clip(단면)이 three.js clipping planes로 가능한 구조인지 — `Viewer3D.tsx`의 renderer·material 설정을 읽고 판단. (e) 접합부 씬이 `buildingLayout` 결과를 부재 id로 걸러 쓰는지 `memberWorldPoint`로 따로 만드는지 — 사양의 `joint-layout.ts`가 코어의 검사 좌표와 같은 좌표를 그리는지(검사는 実寸 반경, 표시는 `rebarRadius` — 두 레이아웃이 다른 것을 사양이 아는가). (f) `tests/e2e/uc15-revisit.js`·`uc17`의 관례(dev-browser CLI, `案件を読み込み`로 스트레스 案件 주입, 포트, 대기 방식)와 사양의 `uc25`가 맞는가. (g) phase 47 step 8(`phases/47-joint-review-core/step8.md` — 영역 후보 축소 결함 수정)이 아직 안 들어간 상태다 — phase 48 사양이 그 동작에 의존하는 문장이 있는가.
5. **테스트의 반증 가능성**: 사양의 컴포넌트 테스트·e2e 항목 중 「구현이 틀려도 통과하는」 것(존재만 확인·문자열 포함만 확인·구현 출력을 기대값으로 쓰는 것)을 지목. e2e 전체 흐름(접합부 열기→X-Ray→検査→검토 항목 기록→기준안 고정→수정→영향·再検討必要→패키지 준비 상태 갱신)에서 **각 단계의 실패가 어떤 assertion으로 잡히는지** 빠진 단계가 있으면 지목.
6. **누락**: 사용자 완료 조건 12개(`phases/47-joint-review-core/README.md`의 완료 조건 절)와 phase 47이 남긴 것(README「반증 반영」·step7-report.json) 중 phase 48이 닫아야 하는데 사양에 없는 것. 사양이 만들라는 것 중 사용자가 요구하지 않은 것(YAGNI).
7. **ADR-049 초안**: 사양 step 5가 쓰라는 ADR-049에 들어가야 할 결정 문장 3~6개 제안(제안만). 특히 「確認済＝チェックリスト充足」·「検討 데이터는 Project 밖」·「검사 기준은 利用者入力뿐」·「로컬 전용」의 문장.

## 출력
`phases/48-joint-review-ui/spec-refutation.md`에 위 7항목 순서대로. 맨 위에 `verdict: upheld | refuted`와 refuted 사유 요약(3줄 이내). 각 근거는 `파일:줄` 형식.

## 금지
- 사양·코드·테스트를 수정하지 마라. 하네스(`scripts/execute.py`)를 실행하지 마라. 커밋하지 마라. `npm run build`·dev 서버를 띄우지 마라(다른 워킹트리에서 하네스가 돌고 있다).
- 「대체로 괜찮다」로 끝내지 마라 — 항목마다 판정과 근거.
