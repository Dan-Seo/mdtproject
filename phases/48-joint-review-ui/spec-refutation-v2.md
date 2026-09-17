verdict: refuted

v2는 앞선 반증의 주요 문제를 상당수 반영했지만, 실제 코어 계약과 맞지 않는 필드·호출이 남아 있다.
또한 일부 단계는 1800초 범위를 넘고, 구현 오류를 놓칠 수 있는 oracle과 현재 worktree에서 충족되지 않는 phase 47 선행조건이 있다.

## 1. 앞선 반증 지적의 해소 여부 — 판정: 불성립

해소된 지적은 다음과 같다.

- `memberWorldPoint(project, member, { role })`를 두 인자로 고쳤고, `supportColumnIds`를 새로 만들지 말라고 명시했다(`phases/48-joint-review-ui/v2/README.md:3`, `phases/48-joint-review-ui/v2/step1.md:37,43`). 실제 `memberWorldPoint`도 두 인자다(`src/lib/viewer/building.ts:117-120`), `supportColumnIds`도 이미 있다(`src/domain/review/joint.ts:173`).
- 잘못된 4개 大梁 전제를 없애고 기본 접합부를 `1F-X2Y1` 2개로 통일했다(`phases/48-joint-review-ui/v2/README.md:6-7`, `phases/48-joint-review-ui/v2/step3.md:49`).
- UI 금지어의 검사 대상을 네 `data-*` 요소로 한정하고 고지문은 `data-review-notice`로 분리했다(`phases/48-joint-review-ui/v2/README.md:15`). 키 입력마다 reducer를 부르지 않는 규칙도 blur/Enter/저장 커밋과 spy 조건으로 고쳤다(`phases/48-joint-review-ui/v2/README.md:18`).
- 전체 `buildingLayout` 비용은 코어를 다시 쓰지 않고 명시적인 중앙값 예산으로 실측하게 했다(`phases/48-joint-review-ui/v2/README.md:19-20`). 독립 좌표 oracle, 저장·구 파일·版 불일치·표시 상태 변경의 e2e 반례도 추가했다(`phases/48-joint-review-ui/v2/step1.md:49-60`, `phases/48-joint-review-ui/v2/step6.md:24-28`). 4D·BCF는 ADR 문장으로만 남긴다(`phases/48-joint-review-ui/v2/README.md:22`).

해소되지 않은 지적은 다음과 같다.

- phase 47 step 8 의존을 README에 적었지만, 이 worktree의 `phases/47-joint-review-core/index.json:4,79-80`은 phase와 `region-prefilter-fix`를 여전히 `pending`으로 기록한다. 또한 현재 HEAD는 v2 README가 요구한 merge commit `e1031a2`의 후손이 아니다. “전제로 명시”한 것만으로 현재 실행 대상의 선행조건이 충족되지는 않는다(`phases/48-joint-review-ui/v2/README.md:3,45`).
- 이전 반증이 지적한 코어 시그니처 검증 문제는 `review.version`과 `effectiveItemStatus`에서 다시 남았다(아래 2항).
- 이전에 지적한 e2e의 오류 표시 경로도 그대로 닫히지 않았다. `readProjectFile`의 예외를 `ProjectActions`가 버리고 `project.loadFailed`만 표시한다(`src/components/ProjectActions.tsx:32-43,69`, `src/locales/ja.json:157`). 그런데 v2는 `readProjectFile`이 던진 메시지가 페인에 보인다고 요구한다(`phases/48-joint-review-ui/v2/step6.md:27`).

## 2. 코어 함수·타입·필드 계약 — 판정: 불성립

다음 참조는 실제 이름과 시그니처가 일치한다: `resolveJoint`(`src/domain/review/joint.ts:95`), `supportColumnIds`(`src/domain/review/joint.ts:173`), `runGeometryCheck`·`CheckInput`(`src/lib/review/geometry-check.ts:94-106,299`), `defaultExclusions`(`src/lib/review/geometry-check.ts:283`), `assessImpact`와 `TakeoffSnapshot`(`src/domain/review/impact.ts:12,298`), `itemValidity`·`itemsNeedingRecheck`·`itemTargetMemberIds`(`src/domain/review/validity.ts:72,123,165`), `packageReadiness`(`src/domain/review/readiness.ts:70`), `xrayForRow`·`rebarsUsingRule`(`src/lib/review/xray.ts:229,248`), `projectFingerprints`·`checkConditionsFingerprint`(`src/domain/review/fingerprint.ts:55,155`), reducer 묶음(`src/domain/review/state.ts:347-470`), store 저장 액션(`src/lib/store.ts:23-44`), `saveBundle`·`loadStoredBundle`(`src/lib/persist/indexeddb.ts:94,119`). `joint-layout.ts`, `segmentFor`, `useReviewModel`, 새 store 필드는 해당 step의 산출물이므로 현재 부재 자체는 오류로 세지 않는다.

실제로 없거나 잘못 호출되는 참조는 다음과 같다.

- `review.version`이라는 필드는 없다. 실제 `ReviewState` 필드는 `reviewSchemaVersion`이다(`src/domain/review/types.ts:138`, `src/domain/review/state.ts:292-315`). 따라서 저장 검사는 `json.review.version`을 요구하면 안 되고, v2 step 6의 저장·版 불일치 시나리오(`phases/48-joint-review-ui/v2/step6.md:24,27`)와 ADR 문장(`phases/48-joint-review-ui/v2/step7.md:10`)을 `reviewSchemaVersion`으로 고쳐야 한다.
- `effectiveItemStatus`의 두 번째 인자는 `CurrentModel`이 아니라 `ReviewValidity`다(`src/domain/review/validity.ts:161`). 그런데 step 4는 `effectiveItemStatus(item, current)`라고 지정한다(`phases/48-joint-review-ui/v2/step4.md:12`). 구현자가 문장을 그대로 따르면 타입 오류이며, 먼저 `itemValidity(item, current)`를 계산해 그 결과를 넘겨야 한다.
- `ReviewItem.finding`은 `RecordedFinding` 또는 생략(`finding?`)이지 `null`을 허용하는 필드가 아니다(`src/domain/review/types.ts:64-80`, `src/domain/review/state.ts:212`). step 4의 “finding 없이 만들면 null”(`phases/48-joint-review-ui/v2/step4.md:11`)은 타입·저장 계약과 어긋난다. absent는 필드를 생략하는 것으로 고정해야 한다.
- step 4가 말하는 `toggleLayer`는 실제 store 액션명이 아니다. 실제 이름은 `toggleViewerLayer`다(`src/lib/store.ts:40,120`). “류”라는 완화 표현은 있지만, 재현 로직의 호출 이름을 정확히 고정하지 않으면 없는 API를 구현할 위험이 있다.
- `buildTakeoff`는 `TakeoffSnapshot`을 반환하지 않는다. 반환 타입은 `unsupportedMembers`를 가진 `TakeoffResult`다(`src/lib/hooks/useTakeoff.ts:37-53,79`). step 3은 baseline snapshot을 만든다고만 하고(`phases/48-joint-review-ui/v2/step3.md:21-26`), `unsupportedMemberIds`를 Set으로 바꾸고 fingerprints를 어느 시점의 값으로 조합할지 계약을 적지 않았다. 함수 부재라기보다 baseline 변환 규칙의 설계 공백이다.

## 3. 샘플 案件 사실 — 판정: 성립

README의 수치와 식별자는 테스트·fixture와 일치한다.

- `1F-X2Y1`은 `1F-G1-X1Y1-X` 終端과 `1F-G2-X2Y1-Y` 始端의 2개 大梁이다(`phases/48-joint-review-ui/v2/README.md:6`, `src/domain/review/joint.test.ts:30-36`).
- 上端筋의 −22는 geometry test가 직접 확인하고(`src/lib/review/geometry-check.test.ts:95-104`), 下端筋의 +25와 기준 26에서의 あき不足도 같은 테스트가 확인한다(`src/lib/review/geometry-check.test.ts:109-120`).
- `1F-X2Y2`는 3개 大梁이고 4개인 柱가 없다는 README가 테스트와 일치한다(`phases/48-joint-review-ui/v2/README.md:7`, `src/domain/review/joint.test.ts:39-46`).
- `1F-X1Y3`의 런 대표 `1F-G1-X1Y1-Y`와 上端筋 포함 조건은 테스트가 고정한다(`phases/48-joint-review-ui/v2/README.md:8`, `src/domain/review/joint.test.ts:53-70`). `2F-X1Y1`의 하층 reference `1F-X1Y1`도 테스트에 있다(`phases/48-joint-review-ui/v2/README.md:9`, `src/domain/review/joint.test.ts:53-58`).
- G1 X의 지원 柱 id는 `start: 1F-X1Y1`, `end: 1F-X2Y1`이며 테스트와 step 2의 이동 버튼 전제가 일치한다(`src/domain/review/joint.test.ts:76-80`, `phases/48-joint-review-ui/v2/step2.md:9,21-22`).

## 4. 1800초 실행 가능성 — 판정: 불성립

정적 판단 기준은 각 step의 변경 파일 수, 테스트 항목 수, acceptance 명령의 반복 비용이다. 실제 실행 시간은 측정하지 않았다.

| step | 정적 규모 | 판정 |
|---|---|---|
| 1 | store·Viewer3D·ViewerTabs·joint-layout·ja/ko와 테스트 4개 파일, layout 7개·store 2개·viewer/tabs 테스트(`phases/48-joint-review-ui/v2/step1.md:18-60`) | **조건부 성립**. 범위는 좁아졌지만 6개 이상 구현 파일과 약 11개 반례, 전체 tsc/lint/test/golden까지 한 번에 요구한다(`:62-65`). |
| 2 | `Viewer3D.tsx` 중심의 씬·마커·pose·clip과 7개 테스트 사례(`phases/48-joint-review-ui/v2/step2.md:7-27`) | **조건부 성립**. 파일 수는 작지만 기존 대형 파일의 scene lifecycle과 three mock을 동시에 건드리므로 1800초 여유가 작다. |
| 3 | 탭·page 조립·hook·ReviewPane·TakeoffPane export·ja/ko와 2개 테스트 파일, X-Ray/검사 8개 묶음(`phases/48-joint-review-ui/v2/step3.md:15-54`) | **불성립**. 새 화면의 3개 절과 상태 계산을 한 실행에 넣고 전체 suite를 다시 돌린다(`:56-59`). |
| 4 | 기존 ReviewPane에 생성·확인·보류·재현·필터·snapshot 유효성 테스트를 추가(`phases/48-joint-review-ui/v2/step4.md:10-26`) | **조건부 성립**. 한 컴포넌트이지만 reducer 9종과 여러 입력 커밋 시점을 함께 검증하므로 step 3 실패 시 독립 실행도 어렵다. |
| 5 | 비교 UI와 WorkPackageBoard라는 서로 다른 큰 기능, ReviewPane·ReviewTabs·2개 테스트 파일(`phases/48-joint-review-ui/v2/step5.md:12-32`) | **불성립**. baseline/impact/mass 표시와 package/readiness/checklist를 한 실행에 넣으며 테스트도 독립 흐름 3개다. |
| 6 | 19단계 e2e, 4개 perf 측정, build·next start·회귀 7개와 별도 perf 재현(`phases/48-joint-review-ui/v2/step6.md:8-39`) | **불성립**. 코딩보다도 브라우저 실행·fixture 주입·저장 복원·회귀 시간이 1800초 예산을 잠식한다. |
| 7 | ADR 10개 결정 문장, R18, milestone/architecture/두 운영 문서/e2e README 동기화(`phases/48-joint-review-ui/v2/step7.md:8-30`) | **성립 가능**. 문서 범위는 크지만 코드·테스트 구현은 금지되어 있고 acceptance도 문서/CI 검사 중심이다. |
| 8 | 9개 반증 항목 중 e2e 전체 재실행과 perf 재실행, full test/golden/tsc/lint(`phases/48-joint-review-ui/v2/step8.md:6-24`) | **불성립**. step 6의 긴 브라우저 흐름을 다시 돌리면서 독립 perf까지 요구하므로 1800초 검증 step으로 닫히지 않는다. |

최소 조정은 step 3을 “탭·hook·接合部/X-Ray”와 “形状検査·i18n·테스트”로, step 5를 “baseline/compare”와 “package/checklist”로 나누고, step 6과 step 8의 브라우저 실행을 별도 검증 step으로 분리하는 것이다.

## 5. 구현이 틀려도 통과할 수 있는 테스트 — 판정: 불성립

- step 1의 좌표 테스트는 독립 column/girder 식을 추가했지만, layout의 `bounds`가 target 박스와 철근의 합집합인지 직접 확인하는 테스트가 없다(`phases/48-joint-review-ui/v2/step1.md:49-60`). 빈 bounds 또는 일부 부재만 포함해도 step 1 테스트가 통과할 여지가 있다.
- `buildingLayout(...).rebar`와 `jointLayout`의 같은 인스턴스를 `toEqual`하는 테스트가 독립 oracle 옆에 남아 있다(`phases/48-joint-review-ui/v2/step1.md:55`). 두 구현이 같은 잘못된 helper 출력에 의존하면 공통 좌표 오류를 놓친다.
- step 2 marker 테스트는 실린더 1·구 1·강조 세그먼트 2의 개수와 camera target만 고정한다(`phases/48-joint-review-ui/v2/step2.md:20-27`). 실린더의 양 끝이 두 세그먼트 최근접점인지, 구가 그 중점인지 검증하지 않아 위치 계산을 잘못해도 통과할 수 있다.
- step 3의 `useReviewModel` 테스트는 impact의 `members`를 코어 직접 호출과 비교하지만, `fingerprints`의 의존성·baseline의 `unsupportedMemberIds`·탭 마운트 경계를 모두 독립 oracle로 고정하지 않는다(`phases/48-joint-review-ui/v2/step3.md:21-26,46-54`).
- step 5는 package 카드에 `kg`가 없는지만 검사하고(`phases/48-joint-review-ui/v2/step5.md:22,31`), 요구사항의 “数量도 표시하지 않는다”를 별도 금지 assertion으로 고정하지 않는다. `数量` 문자열을 표시하는 잘못된 카드가 통과할 수 있다.
- step 6의 표시 조작 부정 assertion은 재검사 뒤 `checkId`만 같음을 본다(`phases/48-joint-review-ui/v2/step6.md:16`). 같은 id를 유지하면서 findings나 verdict를 바꾸는 구현은 통과한다. 동일 결과의 `findings`/`scope` 비교가 필요하다.
- step 8의 표시부 금지 oracle은 텍스트 `grep`이다(`phases/48-joint-review-ui/v2/step8.md:8`). 호출을 alias·간접 wrapper로 바꾸면 금지된 core 함수를 호출해도 grep이 0건일 수 있다. 이 항목은 AST/import 경로 또는 mutation으로 보강해야 한다.
- storage e2e가 검사하는 `json.review.version`은 실제 필드가 아니므로(`phases/48-joint-review-ui/v2/step6.md:24,27`, `src/domain/review/types.ts:138`), 구현자가 잘못된 alias만 추가해도 실제 parser가 `reviewSchemaVersion`을 검증하는지 놓칠 수 있다.

## 6. 사양 내부·코드와의 모순 — 판정: 불성립

해소된 내부 모순은 있다. 고지문에는 금지어가 들어가지만 네 `data-*` 판정 요소에서는 검사하지 않는다는 결정 4가 명시되어 있고(`phases/48-joint-review-ui/v2/README.md:15`), step 3 placeholder를 step 5의 WorkPackageBoard가 대체하는 것은 단계적 산출물 관계라 모순이 아니다(`phases/48-joint-review-ui/v2/step3.md:16`, `phases/48-joint-review-ui/v2/step5.md:21`).

그러나 다음 모순은 남아 있다.

1. v2 step 4의 `effectiveItemStatus(item, current)`와 실제 함수 `(item, validity)`가 충돌한다(`phases/48-joint-review-ui/v2/step4.md:12`, `src/domain/review/validity.ts:161`).
2. v2 step 4의 “finding 없음 = null”과 `ReviewItem.finding?`/validator의 “undefined일 때만 생략” 계약이 충돌한다(`phases/48-joint-review-ui/v2/step4.md:11`, `src/domain/review/types.ts:80`, `src/domain/review/state.ts:212`).
3. v2 step 6·step 7의 `review.version`과 실제 `reviewSchemaVersion`이 충돌한다(`phases/48-joint-review-ui/v2/step6.md:24,27`, `phases/48-joint-review-ui/v2/step7.md:10`, `src/domain/review/state.ts:292-315`).
4. v2 README는 phase 47 merge `e1031a2`와 step 8 포함을 실행 전제로 삼지만(`phases/48-joint-review-ui/v2/README.md:3`), 현재 작업 tree의 phase 47 index는 step 8을 pending으로 기록한다(`phases/47-joint-review-core/index.json:4,79-80`). 이 상태에서 v2 step 8의 `git diff e1031a2..HEAD` 및 UI e2e를 진행하면 사양이 가정한 기준과 실제 기준이 다르다.
5. v2 step 6은 版 불일치 때 `readProjectFile`의 thrown message가 페인에 보인다고 하지만(`phases/48-joint-review-ui/v2/step6.md:27`), 현재 import UI는 그 메시지를 버리고 generic `project.loadFailed`만 렌더링한다(`src/components/ProjectActions.tsx:36-43,65-69`). 이 동작을 유지한 채 해당 e2e 기대를 만족시킬 수 없다.

위 계약을 수정하지 않으면 phase 48 v2 사양은 `upheld`로 닫을 수 없다.
