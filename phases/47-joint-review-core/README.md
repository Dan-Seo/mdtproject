# Phase 47: joint-review-core — 접합부 검토·변경 영향·작업 준비의 **순수 코어**

> 목표 흐름: 「접합부를 연다 → 형상·근거를 확인한다 → 검토 항목을 기록한다 → 수정안을 비교한다 → 다시 확인할 항목을 찾는다 → 작업 패키지 준비 상태를 갱신한다」.
> 이 phase는 그 흐름의 **UI 없는 코어**(도메인·lib·스토어 슬라이스·저장)만 만든다. 화면·3D·e2e는 phase 48이다.

## 전체 설계 결정 (모든 step 공통 — 어기면 `blocked`)

1. **검토 데이터는 `Project` 밖이다.** `ReviewState`(`src/domain/review/types.ts`)라는 별도 순수 JSON이고 스토어의 별도 슬라이스 `review`다. `Project`·`PROJECT_SCHEMA_VERSION`·`buildTakeoff`·`aggregateQuantity`·`quantityLineId`·`Rebar`의 의미와 값을 **바꾸지 않는다.** 검토 메모 한 글자에 数量이 재계산되면 안 되고(§8 책임 분리), 数量이 바뀌지 않으므로 版도 올리지 않는다(`Project.grid.xLabels` 선례).
2. **파생 결과(`Rebar[]`·`QuantityLine[]`)를 영구 저장하지 않는다.** 기준안은 `Project` 사본과 **fingerprint(해시)** 만 저장하고, 필요할 때 `buildTakeoff`로 다시 계산한다. 검토 항목이 기록하는 「그때의 측정값」(`RecordedFinding`)은 과거 사실의 기록이지 현재 계산의 원본이 아니다 — 필드 주석에 그렇게 적는다.
3. **정보 부족은 합격이 아니다.** 검사 결과는 `干渉候補` / `あき不足候補` / `検出なし（検査条件内）` / `判断不可` / `未検査` 를 구분한다. 규준값이 없는 것(鉄筋のあき 기준)은 사용자 입력이며 `source: '利用者入力'`·적용 범위·입력 시각을 함께 저장한다. 룰팩에 값을 **추가하지 않는다** — 원문을 대조하지 않은 값은 `transcribed`조차 될 수 없다(ADR-023).
4. **상태를 합치지 않는다.** 룰 `confidence`(룰팩) / 정보 충족(`unchecked`·`判断不可`) / 자동 검사 결과(`Finding.kind`) / 사람의 기록(`ReviewItem.status`·`confirmations`) / 패키지 준비(`PackageReadiness`)는 각각 다른 타입이다. 자동 검사가 통과해도 `confidence`를 올리지 않고, 「確認済」는 체크리스트 충족이지 구조 안전·시공 승인이 아니다(문구도 그렇게).
5. **적산과 형상을 섞지 않는다.** X-Ray는 `Rebar.length`·`count`(設計)와 polyline 길이·`rebarPlacements().length`(形状)를 **다른 필드**로 낸다. 3D 개수·polyline 합으로 数量을 만들거나 덮지 않는다(ADR-019).
6. **의존관계는 실제 산정 함수로 판정한다.** 화면 근접·바운딩 박스 겹침으로 접합·영향을 정하지 않는다. `girderSupportSections`·`girderRun`·`beamDepthAbove`(`touchesColumn`)·`columnEnds`가 읽는 관계가 곧 의존관계다.
7. **로컬 처리.** 서버·LLM·텔레메트리로 검토 데이터(부재명·좌표·메모)를 보내지 않는다. `capture()`에 새 이벤트를 추가하지 않는다.
8. **규준 수치 리터럴 금지(ADR-002).** 해시 상수·수치 허용오차(`1e-6` 같은 계산 오차)는 규준값이 아니므로 허용하되, 허용오차는 결과에 `toleranceMm`로 드러낸다.
9. `src/domain/**`은 React·DOM·three·`@/lib`를 import하지 않는다. `src/lib/review/**`는 `src/lib/viewer/*`·`src/lib/hooks/useTakeoff`(`buildTakeoff`)·`src/domain/*`·`src/rulepack`만 import한다(`src/components` 금지).

## 스텝

| step | 이름 | 산출 |
|---|---|---|
| 1 | review-state | `ReviewState` 타입·리듀서·파서, 저장(IndexedDB `review` 키·파일 번들), 스토어 슬라이스 |
| 2 | joint-and-fingerprint | 접합부 판정, 의존관계, fingerprint, `RebarInstance`의 개체 식별, 부재→세계좌표 변환 추출 |
| 3 | impact-and-validity | 기준안 대비 변경 분류, 의존관계 기반 영향과 경로, 검토 항목 유효성, 패키지 준비 상태 |
| 4 | geometry-check-xray | 캡슐 최소거리 검사(干渉·あき·接触·除外·未検査), X-Ray 뷰모델과 역방향 탐색 |
| 5 | refute-core (verify) | 반례로 1~4를 반증 |

각 step은 TDD다: 테스트를 먼저 빨갛게, 구현, 그리고 「구현을 흔들면 실패하는가」를 변이로 확인해 report에 남긴다.
