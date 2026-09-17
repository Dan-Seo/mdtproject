# 사양 반증 브리프 (codex, Herdr pane) — phase 47 사양을 코드베이스와 대조해 **반증**하라. 고치지 마라.

당신은 검증자다. 구현자가 아니다. 사양 파일을 수정하지 말고, 코드도 수정하지 마라. 발견한 것을 `phases/47-joint-review-core/spec-refutation.md`에만 쓴다.

## 대상
- `phases/47-joint-review-core/README.md`, `step1.md` ~ `step5.md`, `index.json`
- 대조 기준: 실제 코드(`src/**`, `tests/**`, `scripts/execute.py`)와 `AGENTS.md`, `docs/ADR.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/UX.md`

## 반증 항목 — 각 항목에 대해 「성립 / 불성립 / 판단 불가」와 근거(파일·줄)를 적어라
1. **줄 번호·함수명·시그니처 인용의 정확성**: 사양이 `≈L…`로 가리키는 함수가 그 파일에 그 이름·그 형태로 있는가(예: `touchesColumn`·`girderSupportSections`·`columnEnds`·`beamDepthAbove`·`rebarSegmentRuns`·`clipSegments`·`buildingLayout`의 `worldPoint` 클로저·`createAutosave(write)`·`isProjectShape`가 추가 키를 거부하지 않는다는 주장·`ruleIdentity`·`legendEntries`·`barDiameter`·`rebarPlacements`). 틀린 인용은 전부 목록으로.
2. **실행 가능성**: 각 step이 codex 1회 실행(1800초)에 끝날 분량인가. 너무 크면 어느 부분을 어느 step으로 옮겨야 하는지 제안(제안만).
3. **금지사항 충돌**: 사양이 요구하는 것이 AGENTS.md CRITICAL 규칙(룰팩 수치 리터럴 금지, 主筋 본수 룰팩 조회 금지, `src/domain` 순수성, 서버 전송 금지, 出典 표시)과 충돌하는 지점이 있는가. 특히 step 4의 `NUMERICAL_TOLERANCE_MM = 1e-6`과 해시 상수를 「규준 수치 리터럴」로 볼 여지가 있는가 — AGENTS.md의 문장과 ADR-002를 인용해 판단.
4. **설계 결정의 허점**: (a) 검토 데이터를 `Project` 밖에 두면 `uc15-revisit`(IndexedDB `current` 키·파일 JSON 문자열 비교)이 깨지는가 — `tests/e2e/uc15-revisit.js`를 읽고 판단. (b) `readProjectFile`이 `{...project, review}`를 한 번 파싱해 가르는 것이 `deserializeProject`의 「추가 키 무시」 동작과 모순되는가. (c) `memberInputs`가 의존 부재의 断面을 포함할 때 連続スパン 런 동료 변경이 대표 부재 fingerprint에 잡히는지 — `girderRun`의 「同一断面であることを連続の条件にする」 조건을 읽고 판단. (d) step 4의 「柱 박스 ± 최대 径」 영역이 大梁 교차부와 定着 구간을 전부 포함하는가 — `mainPoints`(`src/domain/rebar/girder.ts`)와 `memberWorldPoint`(building.ts의 大梁 분기)로 좌표를 추적해 판단. (e) 帯筋이 パネルゾーン(階高−上部大梁せい 위)에 없다는 사양의 전제가 `generateColumnRebar`의 `hoopSpan`과 맞는가.
5. **테스트의 반증 가능성**: 사양의 테스트 목록에 「구현을 돌린 값을 기대값으로 쓰는」 항목이 있는가(있으면 지목). step 4 테스트 2의 「실측 ±1」 방식이 그 예인지 판단하고, 대안이 있으면 제안만.
6. **누락**: 12개 완료 조건(사용자 요구) 중 코어 단계에서 다뤄야 하는데 사양에 없는 것. 그리고 사양이 만들라고 하는 것 중 phase 48(UI) 없이도 죽은 코드가 되는 것.
7. **ADR 필요성**: 이 phase가 기존 ADR을 넓히는 지점(부재 범위·데이터 위치·검사 기준의 출처)을 골라 ADR 초안에 들어가야 할 결정 문장을 3~6개 제안(제안만).

## 출력
`phases/47-joint-review-core/spec-refutation.md`에 위 7항목 순서대로. 맨 위에 `verdict: upheld | refuted`와 refuted 사유 요약(3줄 이내). 각 근거는 `파일:줄` 형식.

## 금지
- 사양·코드·테스트를 수정하지 마라. 하네스(`scripts/execute.py`)를 실행하지 마라. 커밋하지 마라.
- 「대체로 괜찮다」로 끝내지 마라 — 항목마다 판정과 근거.
