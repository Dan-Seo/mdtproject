# Phase 47: joint-review-core — 접합부 검토·변경 영향·작업 준비의 **순수 코어**

> 목표 흐름: 「접합부를 연다 → 형상·근거를 확인한다 → 검토 항목을 기록한다 → 수정안을 비교한다 → 다시 확인할 항목을 찾는다 → 작업 패키지 준비 상태를 갱신한다」.
> 이 phase는 그 흐름의 **UI 없는 코어**(도메인·lib·스토어 슬라이스·저장)만 만든다. 화면·3D·e2e는 phase 48이다. 이 phase가 끝나도 제품 흐름은 완성이 아니다 — report에 그렇게 쓴다.

## 전체 설계 결정 (모든 step 공통 — 어기면 `blocked`)

1. **검토 데이터는 `Project` 밖이다.** `ReviewState`(`src/domain/review/types.ts`)라는 별도 순수 JSON이고 스토어의 별도 슬라이스 `review`다. `Project`·`PROJECT_SCHEMA_VERSION`·`buildTakeoff`·`aggregateQuantity`·`quantityLineId`·`Rebar`의 의미와 값을 **바꾸지 않는다.** 검토 메모 한 글자에 数量이 재계산되면 안 되고(§8 책임 분리), 数量이 바뀌지 않으므로 版도 올리지 않는다(`Project.grid.xLabels` 선례). 저장은 같은 파일·같은 IndexedDB에 담되 **한 案件의 것이라는 일관성**을 한 트랜잭션·한 파일로 보장한다(step 2).
2. **파생 결과(`Rebar[]`·`QuantityLine[]`)를 영구 저장하지 않는다.** 기준안은 `Project` 사본과 **fingerprint(해시)** 만 저장하고, 필요할 때 `buildTakeoff`로 다시 계산한다. 검토 항목이 기록하는 「그때의 측정값」(`RecordedFinding`)은 과거 사실의 기록이지 현재 계산의 원본이 아니다 — 필드 주석에 그렇게 적는다.
3. **정보 부족은 합격이 아니다.** 검사 결과는 `干渉候補` / `あき不足候補` / `接触` / `…なし（検査条件内）` / `判断不可` / `検査対象なし` / `未検査` 를 구분한다. 규준값이 없는 것(鉄筋のあき 기준)은 사용자 입력이며 `source: '利用者入力'`·적용 범위·입력 시각을 함께 저장한다. 룰팩에 값을 **추가하지 않는다** — 원문을 대조하지 않은 값은 `transcribed`조차 될 수 없다(ADR-023).
4. **상태를 합치지 않는다.** 룰 `confidence`(룰팩) / 정보 충족(`unchecked`·`判断不可`) / 자동 검사 결과(`Finding.kind`) / 사람의 기록(`ReviewItem.status`·`confirmations`) / 패키지 준비(`PackageReadiness`)는 각각 다른 타입이다. 자동 검사가 통과해도 `confidence`를 올리지 않고, 「確認済」는 체크리스트 충족이지 구조 안전·시공 승인이 아니다(문구도 그렇게).
5. **적산과 형상을 섞지 않는다.** X-Ray는 `Rebar.length`·`count`(設計)와 polyline 길이·`rebarPlacements().length`(形状)를 **다른 필드**로 낸다. 3D 개수·polyline 합으로 数量을 만들거나 덮지 않는다(ADR-019).
6. **의존관계는 실제 산정 함수로 판정한다.** 화면 근접·바운딩 박스 겹침으로 접합·영향을 정하지 않는다. `girderSupportSections`·`girderRun`·`beamDepthAbove`(`touchesColumn`)·`columnEnds`가 읽는 관계가 곧 의존관계이고, fingerprint에는 **그 함수가 실제로 읽는 필드만** 넣는다(step 3 — 의존 부재의 断面 전체를 넣으면 무관한 변경이 검토를 무효화한다).
7. **로컬 처리.** 서버·LLM·텔레메트리로 검토 데이터(부재명·좌표·메모)를 보내지 않는다. `capture()`에 새 이벤트를 추가하지 않는다.
8. **규준 수치 리터럴 금지(ADR-002).** AGENTS.md의 금지는 「배근 규준 수치」(定着·継手·折曲げ·かぶり·할증)다. 해시 상수·수치 허용오차(`1e-6` 같은 부동소수 계산 오차 — `src/lib/viewer/geometry.ts`의 조각 제거 `1e-6` 선례)는 규준값이 아니므로 허용하되, 허용오차는 결과에 `toleranceMm`로 드러내고 「규준 허용오차·시공 허용오차가 아니다」를 주석에 쓴다.
9. **import 경계(프로덕션 파일 기준).** `src/domain/**`(테스트 제외)은 React·DOM·three·`@/lib`를 import하지 않는다. `src/lib/review/**`는 `src/lib/viewer/*`·`src/lib/hooks/useTakeoff`(`buildTakeoff`)·`src/lib/rule-source`·`src/domain/*`·`src/rulepack`만 import한다(`src/components` 금지 — `legend.ts`의 zone→rule 대응은 import하지 말고 같은 대응을 lib 안에 둔다). 순수성 검사는 **import 문**으로 하고 주석·테스트 파일은 대상이 아니다.
10. **검사 조건은 유효성의 일부다.** 사용자 あき 기준·除外 목록이 바뀌면 `finding`을 가진 검토 항목은 `再検討必要`다(`ReviewFingerprints.checkConditions`). 카메라·clip·layers·備考·案件名·通り芯名은 무효화 사유가 아니다.

## 완료 조건 (사용자 요구 12개 — 코어에서 판정 가능한 형태로 요약)
(1) 간섭 후보가 실제 위치(세계 좌표)와 근거(어느 철근·어느 세그먼트·왜)를 갖는다. (2) 충분히 떨어진 형상은 후보가 아니고, 사용자 あき 기준의 경계에서만 `あき不足候補`가 된다. (3) 정보 부족(継手位置 등)은 `未検査`로 남고 총괄 합격 값이 없다. (4) 의도된 接触 제외가 다른 간섭을 숨기지 않는다. (5) 무관한 변경(다른 断面의 피치, 表示만의 변경)은 검토를 무효화하지 않는다. (6) 관련 변경(대상 断面·검사 조건·룰팩)은 무효화하고 이유를 낸다. (7) X-Ray는 設計(数量)과 形状을 다른 필드로 낸다. (8) `unitMass` 미입력은 0이 아니라 상태이고, 未対応 부재는 정상 부재와 구분된다. (9) 저장→재로드 후 검토 데이터가 같은 案件의 것으로 복원되고, 구 파일은 빈 검토로 열린다. (10) 대상 断面이 바뀐 패키지는 `準備完了`를 유지하지 않는다. (11) id가 바뀐 요소는 자동 확정하지 않고(`対応要確認`), 版이 다른 검토 파일은 거부한다. (12) 검사는 화면 상태(표시 반경·clip·pose)와 무관하게 결정적이다.

## 스텝

| step | 이름 | 산출 |
|---|---|---|
| 1 | review-state | `ReviewState` 타입·파서(불변식 포함)·리듀서, `parseProject` |
| 2 | review-persistence | 파일 번들·IndexedDB 한 트랜잭션 저장/복원·자동저장 generic·스토어 슬라이스·`ProjectActions` 인자 |
| 3 | joint-and-fingerprint | 접합부 판정, 의존관계(읽는 필드 단위), fingerprint, `RebarInstance` 개체 식별, 부재→세계좌표 변환 추출 |
| 4 | impact-validity-readiness | 기준안 대비 변경 분류, 의존관계 기반 영향과 경로, 검토 항목 유효성(검사 조건·대상 변경 포함), 패키지 준비 상태 |
| 5 | geometry-check | 캡슐 최소거리 검사(干渉·あき·接触·除外·未検査·検査対象なし), 접합부 한정 |
| 6 | xray | X-Ray 뷰모델과 역방향 탐색 |
| 7 | refute-core (verify) | 반례로 1~6을 반증 |

각 step은 TDD다: 테스트를 먼저 빨갛게, 구현, 그리고 「구현을 흔들면 실패하는가」를 변이로 확인해 report에 남긴다. 기대값은 **입력에서 손으로 유도한 값**을 쓰고 유도 과정을 테스트 주석에 적는다 — 구현을 돌려 얻은 값을 기대값으로 쓰지 않는다.

## 샘플 案件의 사실 (테스트가 전제하는 것 — `src/domain/model/sample-project.ts`)
- 通り芯 X1·X2(1스팬 6000), Y1·Y2·Y3(2스팬 6000). 階 1F(4200)·2F(3600). 断面 C1 800×800 D25×12 帯筋 D13@100, G1 400×750 D25 4/4 あばら筋 D13@100, G2 400×700 D22.
- X방향 大梁 `1F-G?-X1Y{n}-X`: Y2행만 G2, 나머지 G1. Y방향 大梁 `1F-G?-X{m}Y{n}-Y`: X2열은 G2, X1열은 G1.
- 접합부: `1F-X1Y1` 大梁 2개(G1 X 始端, G1 Y 始端). **`1F-X2Y1` 大梁 2개(G1 X 終端, G2 Y 始端)** — 上端筋 G1/G2 교차(독립 산술 clearance −22mm), 下端筋 G1/G2 수평 세그먼트 clearance **+25mm**(G1 せい 750 vs G2 700의 차 50 − 반경 12.5 − 11 ＝ 25 … 정확한 유도는 step 5). `1F-X2Y2` 大梁 3개(전부 G2). `1F-X1Y3`·`1F-X2Y3`: Y 런의 終端(런 대표는 Y1의 大梁).
- 어느 柱도 大梁 4개를 갖지 않는다.

## 반증 반영 (`spec-refutation.md`, codex 반증 — 2026-09-17)
- 샘플 사실 정정(위 절). 大梁 4개·`1F-X2Y2` X G1/Y G2 전제를 전부 지웠다.
- step 1을 타입/리듀서와 저장으로 분리, step 4를 기하 검사와 X-Ray로 분리(1800초 1회 분량).
- fingerprint 의존은 断面 전체가 아니라 **읽는 필드**(step 3). 반례 테스트는 접합부 `1F-X1Y1`(G1만) vs `section-G2` 피치.
- あき broad phase가 기준값·허용오차만큼 팽창(step 5). 接触 verdict 축·`検査対象なし`·除外의 `kinds` 추가. 영역은 XY 한정, 최근접점 밖은 버리고 계수.
- 검사 조건 fingerprint(`checkConditions`), 대상 집합 변경(`対象変更`), 연결 항목의 未確認/소실, 연결 없는 확인 기록의 fingerprint(step 1·4).
- 저장은 한 트랜잭션 번들(step 2). uc15는 문자열 비교가 아니라 `current` 키 부분 문자열을 본다 — 근거 문장 정정.
- `rulepackFingerprint`에 `source` 전체(edition·url 포함). `memberResultFingerprint(memberId, rebars)`. `DependencyResolution.tracked.missing`.
- 순수성 검사는 import 문 기준. `legend.ts` import 금지·`rule-source` 허용.
- 검증 step의 main 비교는 `git merge-base main HEAD` 고정, 수량 덤프는 vitest 파일로(YAML 로더).
- 받아들이지 않은 것: 「(1) 원문 없음」 — 위 완료 조건 절로 채웠다. 「접합부 항목이 G2 피치에 유효해야 한다」는 요구 자체가 틀렸으므로(G2가 그 접합부 大梁) 테스트 대상을 바꿨다.
