verdict: refuted

phase 48은 현재 사양 그대로는 성립하지 않는다. `memberWorldPoint` 호출 계약이 어긋나고, `1F-X2Y2`의 4개 大梁 전제가 phase 47의 정정 사실과 충돌한다.
또한 UI 금지어 검사가 사양이 요구하는 법적 고지 및 기존 전역 고지와 동시에 성립할 수 없고, 미완인 phase 47 step 8의 결과를 전제로 삼는다.

## 1. 인용의 정확성 — 판정: 불성립

핵심 코어 API의 이름과 주요 시그니처는 대체로 정확하다. `resolveJoint(project, columnMemberId)`는 `src/domain/review/joint.ts:95`, `runGeometryCheck(input)`와 `CheckInput`·`CheckResult`는 `src/lib/review/geometry-check.ts:94-106,299`, `assessImpact`는 `src/domain/review/impact.ts:298`, `itemValidity`는 `src/domain/review/validity.ts:123`, `packageReadiness`는 `src/domain/review/readiness.ts:70`, `xrayForRow`는 `src/lib/review/xray.ts:229`, `projectFingerprints`의 6개 인자 계약은 `src/domain/review/fingerprint.ts:155`에 있다. `defaultExclusions`와 리듀서도 각각 `src/lib/review/geometry-check.ts:283`, `src/domain/review/state.ts:347-470`에 있고, 파일/IndexedDB 저장 및 autosave 경로도 `src/lib/persist/indexeddb.ts:94-149`, `src/lib/hooks/useProjectPersistence.ts:32-65`와 일치한다.

그러나 다음은 그대로 인용할 수 없다.

- `phases/48-joint-review-ui/step1.md:37`은 `memberWorldPoint(project, member, { role })`을 요구하지만 실제 함수는 `src/lib/viewer/building.ts:117-120`의 두 인자 함수다. 이 문장을 그대로 구현하면 TypeScript 호출 계약이 깨진다. role에 따른 배치 분기는 `RebarBatch` 생성 쪽에서 처리하고, 세계 좌표 변환은 두 인자 계약으로 고쳐야 한다.
- `phases/48-joint-review-ui/step1.md:43`은 `supportColumnIds`를 추가하라고 하지만 이미 `src/domain/review/joint.ts:173`에 존재한다. 중복 추가가 아니라 기존 함수를 재사용해야 한다.
- `ViewerMode`가 현재 `member | building`뿐인 것은 `src/lib/store.ts:21,32`에 맞다. `joint`, `reviewFocus`, pose 저장 및 관련 reducer는 phase 48의 추가 대상이므로 “이미 존재한다”고 읽으면 안 되지만, 새 API로 명시한 것 자체는 오류가 아니다.
- `formatLength`, `SourceChips`, `ConfidenceWarning`은 `src/components/quantity/TakeoffPane.tsx:49,161,185`에 이미 있으나 export되지 않았다. `step2.md:43`의 export 요구는 정확하며 새 구현이 아니다.

## 2. 실행 가능성 — 판정: 불성립

한 codex 실행으로 제한된 1800초 안에 끝내기에는 step 1과 step 2가 각각 과대하다. step 1은 store 상태 확장·순수 joint layout·`Viewer3D`의 새 scene/marker/pose/clip·탭·다수 테스트를 동시에 요구한다(`phases/48-joint-review-ui/step1.md:18-61`). step 2도 탭 전환·`useReviewModel`·4개 ReviewPane 영역·x-ray/check 실행·상태/유효성/패키지 UI·i18n·테스트를 한 실행에 묶는다(`phases/48-joint-review-ui/step2.md:13-67`).

최소 분할안은 step 1을 (a) store·ViewerTabs·pose/clip 상태와 (b) `joint-layout`·scene rebuild·marker/focus로 나누고, step 2를 (a) ReviewTabs·header·X-Ray·검사 실행과 (b) ReviewItem·exclusion·PackageReadiness·persistence로 나누는 것이다. 각 분할은 파일 소유권과 독립된 acceptance를 가져야 한다. phase 47도 같은 1800초 제약으로 step 1과 step 4를 분리했다(`phases/47-joint-review-core/README.md:44`).

## 3. 금지된 충돌 — 판정: 불성립

텔레메트리·도메인 경계·Project 변경 금지는 성립한다. payload 키 allowlist는 `src/lib/telemetry.ts:26,134`, `autocapture: false`와 `before_send`는 `src/lib/telemetry.ts:257,284`에 있고, phase 48도 새 capture를 금한다(`phases/48-joint-review-ui/README.md:10`). Review UI가 `setReview`만 사용하고 Project의 section/rebar를 바꾸지 않는 제약도 `phases/48-joint-review-ui/README.md:9`에 명확하다.

하지만 문구 금지는 내부적으로 모순된다.

- README는 UI에 「合格」「安全」「承認」을 쓰지 말라고 하면서 동시에 「確認済」 옆에 「構造安全・施工承認ではない」 고지를 항상 보이라고 한다(`phases/48-joint-review-ui/README.md:8`).
- WorkPackage 고지는 「法的な施工承認や構造安全の判定ではない」이어야 하고, 그 테스트는 「承認」「安全」이 없다고 요구한다(`phases/48-joint-review-ui/step3.md:24,29`). 같은 문자열을 고지로 렌더링하면서 전역 금지어 검사를 통과시킬 수 없다.
- 이미 모든 화면에 표시되는 M1 고지에도 `承認者`가 있다(`src/components/AppShell.tsx:121`, `src/locales/ja.json:178`). `step6.md:11`의 “i18n 파일에 금지어가 없는가”를 문자 그대로 실행하면 기존 고지 때문에 실패한다.

검사는 판정 문구에만 적용할지, 법적 한계 고지의 허용된 문맥은 예외로 둘지 먼저 확정해야 한다. 그렇지 않으면 구현자가 요구사항 중 하나를 어길 수밖에 없다.

## 4. 설계 공백 — 판정: 불성립

- reducer 입력마다 `validated`가 `parseReviewState`를 다시 호출하고, baseline이 있으면 `parseProject`까지 수행한다(`src/domain/review/state.ts:284-287,324-332,393-394`). step 2는 각 키 입력에서 `setClearance`를 호출한다(`phases/48-joint-review-ui/step2.md:28`). IndexedDB autosave의 500ms debounce(`src/lib/persist/indexeddb.ts:25`)는 저장만 늦출 뿐 이 동기 검증 비용은 줄이지 않는다. 대형 baseline에서 keystroke 지연을 어떻게 측정하고 허용할지 사양에 없다.
- `runGeometryCheck`는 joint만 검사한다는 화면 계약(`phases/48-joint-review-ui/README.md:11`)과 달리 매 호출 `buildingLayout(input.project, input.rebars, input.unsupportedMemberIds, ...)`로 전체 building layout을 만든다(`src/lib/review/geometry-check.ts:299-317`). 선택 joint가 좁혀도 비용이 전체 layout 생성에 걸린다. step 4의 `performance.now()` 측정 지시(`phases/48-joint-review-ui/step4.md:27-30`)에는 허용 시간, 표본/워밍업, 실패 임계치가 없다.
- baseline을 Project copy로 보관하고 한 transaction으로 저장하는 구조는 존재한다(`src/lib/persist/indexeddb.ts:94-97`). 그러나 stress JSON 크기, baseline parse 시간, reducer 검증 시간, review autosave payload 크기 및 debounce coalescing은 성능 시나리오에 없다. 5층 fixture를 만드는 것만으로는 이 위험을 반증하지 못한다.
- clipping 자체는 renderer의 local clipping과 material clipping plane 지원이 이미 있다(`src/components/viewer/Viewer3D.tsx:578-594,1650-1653`). 다만 현재 clip은 local state다(`src/components/viewer/Viewer3D.tsx:1554`); joint scene에 옮길 때 pose/clip/layers와 검사 validity를 섞지 않는 상태 경계가 사양에 더 명시되어야 한다.
- layout 좌표의 acceptance가 `jointLayout`과 `buildingLayout`의 같은 인스턴스를 `toEqual`하라고 한다(`phases/48-joint-review-ui/step1.md:37`). 이는 공통 helper의 동일한 좌표 오류를 함께 통과시킬 수 있는 구현 의존 oracle이다. 더구나 위의 `memberWorldPoint` 시그니처 오류와 함께 있어 좌표 계약이 닫혀 있지 않다.
- phase 47의 `region-prefilter-fix`는 아직 `pending`이다(`phases/47-joint-review-core/index.json:79-80`). 그 사양은 clearance 40에서 28개 후보가 누락되는 현재 반례를 명시한다(`phases/47-joint-review-core/step8.md:6-8,19`). phase 48은 이 수정이 병합되었는지 의존성/게이트로 선언하지 않은 채 UI에서 해당 결과를 전제로 한다(`phases/48-joint-review-ui/step6.md:9-10`).

## 5. 테스트의 반증 가능성 — 판정: 불성립

phase 48의 일부 테스트는 존재·문자열·DOM 흐름만 확인한다. step 1은 mesh/marker와 scene rebuild를 확인하면서 layout을 기존 `buildingLayout`과 비교한다(`phases/48-joint-review-ui/step1.md:57-61`); 독립적인 세계 좌표·최근접점·camera target oracle이 없다. step 2의 핵심 검사는 row/4개 大梁 존재와 verdict/findings를 확인하도록 되어 있지만(`phases/48-joint-review-ui/step2.md:46-49`), 해당 row 수 자체가 잘못된 fixture 전제를 따른다.

phase 47은 이미 독립 반례 12개를 기록했다(`phases/47-joint-review-core/step7-report.json:42-53`). phase 48은 그 코어를 다시 복제할 필요는 없지만, UI가 그 출력의 `scope`, `unchecked`, `assumptions`, `checkId`, `itemValidity` 및 package blocker를 올바른 대상에 연결했는지에 대한 독립 기대값이 필요하다. 현재 step 4의 e2e 흐름은 클릭·문구·화면 전환 중심이다(`phases/48-joint-review-ui/step4.md:10-25`); 저장 후 review record의 정확한 shape/키, version mismatch와 old file의 빈 review, clip/pose 변경 뒤 같은 checkId와 item validity가 유지되는지의 부정 assertion이 충분히 고정되어 있지 않다. step 6도 12개 counterexample을 “실행”하라고만 하고(`phases/48-joint-review-ui/step6.md:9-10`), 각 반례의 독립 oracle과 실패 조건을 report shape에 요구하지 않는다.

또한 `1F-X2Y2`에서 “4개 大梁”을 기대하는 테스트는 사실 자체가 틀려 반증 테스트가 될 수 없다. phase 47의 최종 sample facts는 `1F-X2Y2`가 3개이며 어느 柱도 4개가 아니라고 명시한다(`phases/47-joint-review-core/README.md:39-40`).

## 6. phase 47 조건 대비 누락·YAGNI — 판정: 불성립

phase 47의 12개 완료 조건은 `phases/47-joint-review-core/README.md:20`에 있고, 순수 코어의 핵심 반례 검증은 `step7-report.json:42-53`에 있다. 따라서 phase 48이 geometry/fingerprint/unitMass 같은 순수 코어 테스트를 전부 다시 구현하지 않는 것은 YAGNI로서 타당하다. 그러나 다음 통합 조건이 빠졌거나 잘못 연결됐다.

- 저장→재로드의 동일 案件 연계와 old file의 빈 review, schema/version mismatch 거부는 phase 47 코어에만 있고, phase 48 e2e에는 UI를 넘어선 정확한 review 저장/거부 검사가 없다. 조건 (9), (11)의 통합 경로를 어느 phase가 책임지는지 명시해야 한다.
- 조건 (12)의 화면 상태 독립성은 `step6.md:9`에 적혔지만, item validity와 geometry 결과를 같은 checkId/동일 결과로 비교하는 독립 assertion이 없다.
- region prefilter의 pending 수정은 phase 47 완료 조건 밖에 남아 있다. 이를 해결하지 않고 phase 48을 완료하면 clearance 40의 실제 후보 누락을 UI가 정상 결과처럼 표시할 수 있다(`phases/47-joint-review-core/index.json:79-80`, `phases/47-joint-review-core/step8.md:6-8`). phase 48 index에 명시적 선행 게이트가 필요하다.
- `phases/48-joint-review-ui/step5.md:17`의 미래 4D/BCF/타 도메인 연결 지점은 ADR의 후속 방향으로만 남기고 현재 UI·타입·저장 키에는 넣지 않아야 한다. 지금 기능에 필요한 것은 현재 joint/package 계약뿐이다.

그리고 phase 47이 “4개 大梁·`1F-X2Y2`의 G1/G2 전제는 삭제됐다”고 스스로 정정했다(`phases/47-joint-review-core/README.md:43`). 그 정정을 phase 48 step 2·step 4가 반영하지 않은 것이 가장 큰 누락이다.

## 7. ADR-049 초안 제안 — 판정: 성립(아래 문안으로 고정할 때)

1. `ReviewState`는 `Project` schema와 별도의 순수 JSON이며, 같은 파일/IndexedDB transaction 안에서도 별도 review key로 저장하고, review가 없는 구 파일은 빈 review로 열며 version mismatch는 거부한다(근거: `phases/48-joint-review-ui/step5.md:10`; trade-off: 저장 계약은 두 개가 되지만 Project 호환성과 검토 이력의 독립성을 보존한다).
2. 초기 지원 범위는 직사각형 柱와 같은 story에서 같은 grid point에 닿는 大梁이며, 관계는 `touchesColumn`·`girderSupportSections`로 정하고 circle/other section은 unsupported로 남긴다(근거: `phases/48-joint-review-ui/step5.md:11`; trade-off: 자동 추론 범위는 좁지만 부재 형상과 접합 관계를 지어내지 않는다).
3. geometry check는 실제 철근 반경을 포함한 capsule 최소거리와 이용자가 입력한 clearance만 기준으로 하며, clearance는 rulepack 행이 아니고 검사 결과는 구조 판정이 아니라 후보·未検査·判断不可를 포함한 정보다(근거: `phases/48-joint-review-ui/step5.md:12-13`; trade-off: 기준값의 책임은 사용자에게 남지만 규준값과 제품 판정을 혼동하지 않는다).
4. `確認済`와 `準備完了`는 등록된 체크리스트 충족 상태로만 취급하고, confidence·검사 verdict·사람의 status·package readiness를 서로 승급시키지 않는다(근거: `phases/48-joint-review-ui/step5.md:13,16`; trade-off: 한눈에 보는 종합 pass는 없지만 정보 부족을 합격으로 오해하지 않는다).
5. review 설정·검사·패키지 데이터와 baseline은 브라우저 로컬에만 보관하고 telemetry/outbound payload에는 넣지 않으며, UI는 Project의 section/rebar를 변경하지 않는다(근거: `phases/48-joint-review-ui/step5.md:10,24`, `phases/48-joint-review-ui/README.md:9-10`; trade-off: 기기 간 동기화는 제공하지 않지만 도면 데이터의 서버 전송을 막는다).
