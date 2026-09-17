verdict: refuted

あき 후보를 제거하는 broad phase, 실제 샘플과 다른 테스트 전제, fingerprint·유효성 규칙의 상호 모순 때문에 사양 그대로는 AC를 충족할 수 없다.
通し筋 소유자 누락, 검사 조건 변경의 무효화 누락, 준비 상태의 확인 기록 결손도 코어에서 해결해야 한다.
저장 분리·수치 허용오차 자체는 반증되지 않았으나 autosave 타입·복원 일관성·파일 저장 연결의 계약은 보완해야 한다.

검토 기준: HEAD `3f3fe33`. 이 문서는 구현 전 사양 반증이다. `src/domain/review`·`src/lib/review`는 아직 없으므로 새 API의 테스트 통과를 주장하지 않는다. 기존 코드의 정적 대조와, 아래에 명시한 기존 함수의 읽기 전용 Node 계산만 수행했다. 하네스 실행·커밋·소스 변경은 하지 않았다. 판정의 「성립」은 해당 사양 주장 또는 검토 조건이 근거로 뒷받침된다는 뜻이다.

## 1. 줄 번호·함수명·시그니처 인용

판정: **불성립 — 대부분의 함수 위치는 정확하지만, 다음 오인용과 계약 누락이 있다.**

### 정확한 인용

| 사양의 인용 | 실제 근거 | 판정 |
|---|---|---|
| `Project` ≈100, `isProjectShape` ≈1887, `serializeProject` ≈1588, `deserializeProject` ≈1970 | `src/domain/model/project.ts:100`, `src/domain/model/project.ts:1887`, `src/domain/model/project.ts:1588`, `src/domain/model/project.ts:1970` | 성립. 추가 키를 **거부하지 않는다**는 주장도 맞다. 다만 삭제하지도 않는다. |
| `touchesColumn` ≈512 | `src/domain/model/project.ts:512` | 성립. private, `(GirderPosition, ColumnPosition): boolean`; 階 비교는 호출자 책임이다. |
| `girderSupportSections` ≈548, `supportColumnSection` | `src/domain/model/project.ts:548`, `src/domain/model/project.ts:566` | 성립. 전자는 `{ start: ColumnSection; end: ColumnSection }`를 반환한다. 부재 ID를 반환하는 함수는 아니다. 후자는 같은 階·격자점의 柱를 찾는다. |
| `girderRun` ≈1378, `columnEnds` ≈1480, `beamDepthAbove` ≈1512 | `src/domain/model/project.ts:1378`, `src/domain/model/project.ts:1480`, `src/domain/model/project.ts:1512` | 성립. `columnEnds`는 上下階 柱의 존재로 단부 조건을 정하고, `beamDepthAbove`는 접속 大梁의 `depth`를 읽는다. |
| `ruleIdentity` ≈150, `contributingRules` ≈167 | `src/domain/quantity/index.ts:150`, `src/domain/quantity/index.ts:167` | 성립. 둘 다 private이고 전자는 key＋정렬된 conditions다. 후자는 `rebar.ruleHits`에 할증 룰을 합친다. |
| `Segment` ≈23, `rebarSegmentRuns` ≈963 | `src/lib/viewer/geometry.ts:23`, `src/lib/viewer/geometry.ts:963`, `src/lib/viewer/geometry.ts:1007` | 성립. `placements.flatMap`에서 배치 개체를 펼친다. |
| `RebarInstance` ≈49, `buildingLayout` ≈120, 柱·大梁 `worldPoint` ≈310–355 | `src/lib/viewer/building.ts:49`, `src/lib/viewer/building.ts:120`, `src/lib/viewer/building.ts:311`, `src/lib/viewer/building.ts:347` | 성립. Y방향 大梁 분기는 358행까지 이어진다. |
| `barDiameter` ≈116, `rebarPlacements` ≈588 | `src/lib/viewer/geometry.ts:116`, `src/lib/viewer/geometry.ts:588` | 성립. 후자는 세 번째 인자 `radiusOf`가 있고 기본값은 표시용 `rebarRadius`다. |
| zone→rule 대응 `legendEntries` | `src/components/viewer/legend.ts:16`, `src/components/viewer/legend.ts:26` | 성립. `zone.ruleKey`로 `ruleHits.find`하고 없으면 throw한다. |

### 틀리거나 불완전한 인용·형태 주장 목록

1. **`clipSegments` ≈917은 이름과 줄의 대응이 틀리다.** 917행은 private `clipSegment`이고 public `clipSegments`는 955행이다. 조각 객체를 재생성하는 곳은 전자의 930·940행이다. 근거: `phases/47-joint-review-core/step2.md:11`, `src/lib/viewer/geometry.ts:917`, `src/lib/viewer/geometry.ts:930`, `src/lib/viewer/geometry.ts:955`.
2. **`createAutosave(write)`의 주입 가능성은 맞지만 `saveReview`를 그대로 받는다는 전제는 틀리다.** 현재 `write`, `Autosave` 호출 인자, pending·queued가 모두 `Project` 고정이다. `createAutosave(saveReview)`에는 generic화 또는 별도 타입 계약 변경이 필요하다. 사양은 그 작업을 명시하지 않는다. 근거: `phases/47-joint-review-core/step1.md:8`, `phases/47-joint-review-core/step1.md:151`, `src/lib/persist/indexeddb.ts:104`, `src/lib/persist/indexeddb.ts:113`, `src/lib/persist/indexeddb.ts:117`, `src/lib/persist/indexeddb.ts:126`.
3. **`loadProject` ≈120은 실제 구현 131행과 약간 다르다.** 함수는 존재하고 기존 형태는 `loadProject(project: Project): void`이므로 의미 오류는 아니다. 근거: `phases/47-joint-review-core/step1.md:7`, `src/lib/store.ts:39`, `src/lib/store.ts:131`.
4. **床板의 `worldPoint`가 role로 X/Y 런을 고른다는 설명은 잘못 연결했다.** role에 따른 `slabRun` 선택은 `openings`에 쓰이며 변환 클로저는 role에 의존하지 않는다. 일반 床板은 `slabBay`, 片持床板은 `cantileverSlabGeometry`로 원점을 정한다. 추출 시 openings 계산을 보존해야 하지만 그것이 변환 함수의 role 인자를 요구한다는 근거는 아니다. 근거: `phases/47-joint-review-core/step2.md:64`, `src/lib/viewer/building.ts:367`, `src/lib/viewer/building.ts:379`, `src/lib/viewer/building.ts:395`.
5. **샘플 `1F-X2Y2`의 大梁 4개·X G1/Y G2 인용은 틀리다.** 실제 grid는 X 1스팬, Y 2스팬이고 해당 柱는 가장자리다. 접속은 `1F-G2-X1Y2-X`, `1F-G2-X2Y1-Y`, `1F-G2-X2Y2-Y`의 **3개, 모두 G2**다. 따라서 柱 의존 테스트의 上部大梁 4개도 틀리다. 근거: `phases/47-joint-review-core/step2.md:67`, `phases/47-joint-review-core/step2.md:68`, `phases/47-joint-review-core/step4.md:102`, `src/domain/model/sample-project.ts:16`, `src/domain/model/sample-project.ts:210`, `src/domain/model/sample-project.ts:224`.
6. **上端筋을 모두 「천장−かぶり」 같은 높이에 그린다는 설명은 일반적으로 틀리다.** 실제로 あばら筋 지름＋主筋 반경만큼 추가로 안쪽 이동한다. G1 D25와 G2 D22의 높이는 다르지만 반경 때문에 겹칠 수 있다. 근거: `phases/47-joint-review-core/step4.md:75`, `phases/47-joint-review-core/step4.md:102`, `src/domain/rebar/girder.ts:997`, `src/lib/viewer/geometry.ts:238`, `src/lib/viewer/building.ts:342`.
7. **`memberResultFingerprint(rebars)` 설명에 자유변수 `memberId`가 있다.** 시그니처에는 memberId가 없는데 함수 안에서 `rebar.memberId === memberId`로 거르라고 한다. 호출 측에서 부재별로 거른 배열을 넘기는지, 인자를 추가하는지 결정해야 한다. 근거: `phases/47-joint-review-core/step2.md:57`.
8. **지원 지점 결손을 담을 반환 위치가 없다.** `DependencyResolution.tracked`에는 `dependencies`뿐이고 `detail`은 실재하는 `memberId`를 가진 개별 Dependency에만 있다. 지점이 모두 없거나 첫 조회부터 throw해 얻은 의존이 0개면 「支持柱なし」를 담을 자리가 없다. `girderSupportSections`도 부분 결과를 돌려주지 않는다. 근거: `phases/47-joint-review-core/step2.md:41`, `phases/47-joint-review-core/step2.md:47`, `src/domain/model/project.ts:560`, `src/domain/model/project.ts:582`.

## 2. 실행 가능성 — 1회 1800초

판정: **현 사양 전체의 실행 가능성은 불성립. 모순을 제거한 뒤의 정확한 소요 시간은 판단 불가.**

하네스는 step의 `model`·`reasoning_effort`를 직접 CLI에 넘기고 1800초로 실행한다. 현재 다섯 step은 모두 Luna `xhigh`다. 제공된 작업 합의의 Luna `max` 기본값과 다르며, 실제로 max로 실행된다고 보고해서는 안 된다. 근거: `scripts/execute.py:328`, `scripts/execute.py:357`, `scripts/execute.py:366`, `phases/47-joint-review-core/index.json:10`, `phases/47-joint-review-core/index.json:39`.

| step | 판정 | 분량·실행상의 근거와 재배치 제안 |
|---|---|---|
| 1 | 판단 불가, 과대 위험 | 큰 JSON 타입·경계 파서·12개 리듀서·파일·DB·hook·store·UI 호출부와 각각의 테스트, 3개 변이, 전체 검증을 한 번에 한다. 타입/파서/리듀서와 영속화/스토어 통합을 별도 step으로 나누는 편이 검토 가능하다. 근거: `phases/47-joint-review-core/step1.md:16`, `phases/47-joint-review-core/step1.md:138`, `phases/47-joint-review-core/step1.md:144`, `phases/47-joint-review-core/step1.md:157`. |
| 2 | 불성립 | 잘못된 샘플 본수, 결과 필드 추가와 전체 `toEqual`의 충돌 때문에 그대로는 통과하지 못한다. 수정 후에도 joint/dependency/fingerprint와 viewer 개체 식별·변환 추출은 별개 작업이다. 후자를 별도 선행 step으로 분리할 것을 제안한다. 근거: `phases/47-joint-review-core/step2.md:63`, `phases/47-joint-review-core/step2.md:64`, `phases/47-joint-review-core/step2.md:67`, `phases/47-joint-review-core/step2.md:70`. |
| 3 | 불성립 | 전 의존 断面을 fingerprint에 넣으면서 G2 pitch 변경에는 柱·접합부를 불변으로 요구한다. 시간 문제가 아니라 동시에 만족할 수 없는 계약이다. 영향 비교와 유효성/준비 상태를 분리하고, 먼저 의존 필드 범위를 결정해야 한다. 근거: `phases/47-joint-review-core/step2.md:55`, `phases/47-joint-review-core/step3.md:102`, `phases/47-joint-review-core/step3.md:108`. |
| 4 | 불성립 | あき broad phase와 테스트가 모순이고 샘플 下端筋 전제도 틀렸다. 기하 알고리즘·제외·성능·X-Ray·4개 변이를 함께 묶었다. 거리 원시 함수와 기하 검사를 한 묶음, X-Ray를 독립 step으로 나누는 것을 제안한다. 근거: `phases/47-joint-review-core/step4.md:17`, `phases/47-joint-review-core/step4.md:70`, `phases/47-joint-review-core/step4.md:79`, `phases/47-joint-review-core/step4.md:103`, `phases/47-joint-review-core/step4.md:112`. |
| 5 | 반증 발견·종결은 성립 가능, 모든 검증의 시간은 판단 불가 | `kind: verify`와 `refuted`는 하네스와 맞는다. 다만 두 트리의 수량 비교, 4개 변이, 다수 새 실행 반례, 전체 테스트·lint를 모두 요구한다. 저장/변경영향 검증과 기하/X-Ray 검증으로 분리할 수 있다. main 비교는 가변 `main`보다 구현 전 SHA를 고정해야 한다. 근거: `phases/47-joint-review-core/step5.md:12`, `phases/47-joint-review-core/step5.md:14`, `phases/47-joint-review-core/step5.md:26`, `phases/47-joint-review-core/index.json:37`, `scripts/execute.py:472`. |

추가 실행 결손: step 5의 임시 `npx tsx` 명령에는 YAML raw import를 처리하는 방법이 없다. `buildTakeoff`는 `src/rulepack/index.ts`를 거쳐 YAML 문자열 import를 요구한다. Vitest의 기존 로더 환경을 쓰거나, 임시 Node 검증의 로더 설정까지 지정해야 재현 가능하다. 이번 읽기 전용 계산은 `node --require tsx/cjs`와 메모리상의 `.yaml` require 처리기를 사용했다. 근거: `phases/47-joint-review-core/step5.md:12`, `src/lib/hooks/useTakeoff.ts:35`, `src/rulepack/index.ts:2`.

## 3. 금지사항 충돌

판정: **요청된 다섯 CRITICAL과의 직접 충돌은 불성립(발견하지 못함). 사양 자체의 경계 문구 충돌은 성립한다.**

- **수치 허용오차·해시 상수는 규준 수치가 아니다.** AGENTS의 정확한 금지는 「배근 규준 수치를 코드에 쓰지 말 것」과 「`.ts` 파일에 **규준 숫자 리터럴**이 나타나면 잘못된 것이다」다(`AGENTS.md:17`). ADR-002도 대상 수치를 「定着長さ, 重ね継手長さ, 折曲げ 형상, かぶり厚さ, 할증률」로 특정한다(`docs/ADR.md:25`). 해시 상수는 식별 계산이고 `1e-6`은 부동소수 연산상의 접촉 분류 오차다. `toleranceMm` 공개·규준 허용오차가 아니라는 주석을 지키면 두 금지에 해당하지 않는다. 기존 코드에도 기하 조각 제거의 `1e-6`이 있다(`src/lib/viewer/geometry.ts:951`). 이를 시공 허용오차나 あき 기준으로 확대 해석해서는 안 된다. 근거: `phases/47-joint-review-core/README.md:15`, `phases/47-joint-review-core/step4.md:25`, `phases/47-joint-review-core/step4.md:72`.
- **主筋 본수 조회 금지·domain 순수성·서버 전송 금지·出典 보존은 성립한다.** 사양은 입력/산정 값을 유지하고, domain은 계산 결과를 인자로 받으며, 사용자 あき를 룰팩에 추가하지 않고, X-Ray에 `RuleHit`와 zone 근거를 보존한다. 근거: `AGENTS.md:18`, `AGENTS.md:20`, `AGENTS.md:21`, `AGENTS.md:22`, `phases/47-joint-review-core/README.md:8`, `phases/47-joint-review-core/README.md:14`, `phases/47-joint-review-core/step3.md:14`, `phases/47-joint-review-core/step4.md:81`, `phases/47-joint-review-core/step4.md:129`.
- **legend 함수의 직접 import는 금지에 걸린다.** 「재사용」은 대응 알고리즘 참조로 해석하면 성립한다. `src/components/viewer/legend` 자체를 lib에서 import하면 `docs/ARCHITECTURE.md:46`과 step 4 금지를 위반한다. 위치 이동 또는 작은 동일 대응 로직 중 하나를 명확히 정해야 한다. 또한 README 결정 9의 허용 import 목록에는 step 4가 출처 문자열의 유일 출처로 지정한 `src/lib/rule-source.ts`가 없다. 근거: `phases/47-joint-review-core/README.md:16`, `phases/47-joint-review-core/step4.md:11`, `phases/47-joint-review-core/step4.md:12`, `phases/47-joint-review-core/step4.md:136`.
- **순수성 검사에서 코드와 테스트·주석을 구분하지 않는다.** step 3은 domain 테스트가 `@/lib`를 쓰는 snapshot 헬퍼를 호출하도록 허용하지만 step 5는 `src/domain/review/**` 전체의 문자열 부재를 요구한다. 순수성은 production import 경계로 검사해야 한다. 금지 이유 주석의 `Date.now`·`crypto`도 문자열 grep에는 걸린다. 근거: `phases/47-joint-review-core/step1.md:142`, `phases/47-joint-review-core/step3.md:101`, `phases/47-joint-review-core/step3.md:132`, `phases/47-joint-review-core/step5.md:13`.

## 4. 설계 결정의 허점

### (a) Project 외부 저장과 uc15

**「Project 밖이면 uc15가 깨진다」는 불성립.** uc15는 DB `kijun` version 1, store `project`, key `current`에서 문자열을 읽고, 부분 문자열 포함 여부로 저장을 기다린다. 파일은 JSON.parse 후 필드값을 읽는다. DB 문자열과 파일 문자열 전체를 비교하는 코드는 없다. 따라서 별도 review 키·빈 review 생략은 호환 가능하지만, 「uc15가 파일 JSON 문자열 동일성을 본다」는 사양의 근거는 틀렸다. 근거: `tests/e2e/uc15-revisit.js:24`, `tests/e2e/uc15-revisit.js:38`, `tests/e2e/uc15-revisit.js:49`, `tests/e2e/uc15-revisit.js:124`, `phases/47-joint-review-core/step1.md:147`.

**별도 저장의 일관성 계약 누락은 성립.** Project와 review를 독립 autosave·독립 transaction으로 저장하면 A→B 案件 전환 중 한 쓰기만 완료/실패했을 때 B Project와 A review가 조합될 수 있다. ReviewState에는 소속 案件 식별자가 없다. 두 키를 유지하더라도 案件 전환의 원자적 저장·복원 또는 일치 검증이 필요하다. 현재 hook의 복원 중 사용자 편집 보호도 Project 참조만 보므로 review만 먼저 편집한 경우까지 확대해야 한다. 이 문제는 uc15의 빈 review 사례로 검증되지 않는다. 근거: `phases/47-joint-review-core/step1.md:127`, `phases/47-joint-review-core/step1.md:150`, `phases/47-joint-review-core/step1.md:154`, `src/lib/persist/indexeddb.ts:48`, `src/lib/persist/indexeddb.ts:135`, `src/lib/hooks/useProjectPersistence.ts:34`.

### (b) 한 번 파싱해서 review 분리

**모순 주장은 불성립.** `isProjectShape`는 추가 키를 검사하지 않으며 `deserializeProject`는 `parsed as Project`를 반환한다. 즉 추가 키를 **보존**한다. 새 파일 경계에서 review만 떼어 `parseProject`에 넘기고, 기존 `deserializeProject`의 반환/에러 동작을 유지하면 양립한다. 읽기 전용 실행에서도 `{...sample, review:{test:true}}`의 deserialize 결과에 review가 남았다. 근거: `src/domain/model/project.ts:1887`, `src/domain/model/project.ts:1988`, `phases/47-joint-review-core/step1.md:145`, `phases/47-joint-review-core/step1.md:148`.

### (c) 런 동료 변경과 fingerprint

**断面 변경을 대표 부재 input에서 잡는다는 핵심 주장은 성립.** 동일 sectionId의 断面 값을 바꾸면 대표 자신의 section도 바뀐다. 동료만 다른 sectionId로 바꾸면 `girderRun`의 연속 조건에서 빠져 런·dependencies 집합이 바뀐다. 이를 fingerprint에 포함하면 검출 가능하다. 근거: `src/domain/model/project.ts:1388`, `src/domain/model/project.ts:1430`, `phases/47-joint-review-core/step2.md:55`.

**그러나 런 전체 입력이라는 계약은 불완전하다.** dependency에는 section·story만 있고 동료의 position·스팬값은 없다. 런 끝쪽의 비인접 스팬 길이 변경은 대표의 `gridSpansAround`에도 들어가지 않는다. result 변화가 이를 잡을 수는 있지만 「런 전체 산정 입력 fingerprint」 주장은 성립하지 않는다. 근거: `phases/47-joint-review-core/step2.md:55`, `phases/47-joint-review-core/step2.md:59`, `src/domain/model/project.ts:1431`, `src/domain/model/project.ts:1441`.

**더 직접적인 내부 모순:** 柱는 접속 大梁을 dependencies로 갖고 그 section 전체를 해시한다. 따라서 G2의 `stirrup.pitch`만 바뀌어도 柱 input은 바뀐다. 그런데 step 3은 柱 영향 없음과 joint 항목 유효를 요구한다. joint targets는 柱뿐 아니라 모든 접속 大梁을 포함하므로, 柱 의존을 depth만으로 좁혀도 G2 자체의 input/result가 바뀌는 한 joint 항목은 재검토 대상이다. 근거: `phases/47-joint-review-core/step2.md:32`, `phases/47-joint-review-core/step2.md:48`, `phases/47-joint-review-core/step2.md:55`, `phases/47-joint-review-core/step3.md:83`, `phases/47-joint-review-core/step3.md:84`, `phases/47-joint-review-core/step3.md:102`, `phases/47-joint-review-core/step3.md:108`, `phases/47-joint-review-core/step5.md:19`.

提案: 실제 읽는 필드별 의존과 항목의 검토 범위를 정한다. 접합부 전체를 targets로 삼은 항목을 특정 柱만의 검토처럼 유지하지 않는다. 上下階 柱도 `columnEnds`가 읽는 것은 존재 여부인데 section 전체를 해시하면 불필요한 무효화가 생긴다(`src/domain/model/project.ts:1494`, `src/domain/model/project.ts:1506`).

### (d) 柱 박스 ± 최대 径과 기하 검사

**교차부·定着 전체를 포함한다는 보장은 불성립.** 좌표를 추적하면 X 大梁의 세계좌표는 `start.x + startFaceOffset + local.x`, `elevation + story.height - depth + local.y`, `start.y - b/2 + local.z`다. 직선 定着은 local.x를 연장하고, 折曲げ는 y에 ±(length−projection)을 더한다. `resolveGirderEnd`는 수평 투영의 柱 내 수용만 검사하고 수직 余長을 해당 階의 박스 안으로 제한하지 않는다. 근거: `src/domain/rebar/girder.ts:115`, `src/domain/rebar/girder-ends.ts:102`, `src/domain/rebar/girder-ends.ts:139`, `src/domain/rebar/girder-ends.ts:151`, `src/lib/viewer/building.ts:347`.

읽기 전용 반례: 샘플 G2 `depth=200` 입력은 `unsupportedMembers=[]`로 산정된다. `1F-X2Y2` 柱 박스의 상단은 4200mm이고 대상 최대 径은 25mm라 확장 상단은 4225mm다. 해당 柱에 들어가는 下端筋 수직 꼬리는 `(6200,4074,5874)→(6200,4354,5874)`로 확장 박스보다 위로 나온다. 이 반례의 입력 근거는 `src/domain/model/sample-project.ts:74`, 높이 변환은 `src/lib/viewer/building.ts:342`, 꼬리 생성은 `src/domain/rebar/girder.ts:142`다.

단, 사양은 세그먼트를 박스로 **자르지 않고 교차 여부만 거른다**. 위 꼬리는 박스와 교차하므로 통째로 남는다. 따라서 이 반례만으로 꼬리 자체가 누락된다고 주장하지 않는다. 오히려 검사 결과의 최근접점이 `regionMm` 밖에 있을 수 있고, 「region 내부 검사」와 「region에 닿는 전체 세그먼트 검사」가 서로 다르다는 반례다. 긴 通し筋끼리는 柱와 멀리 떨어진 곳의 간섭도 보고할 수 있다. 근거: `phases/47-joint-review-core/step4.md:70`, `phases/47-joint-review-core/step4.md:106`.

**あき broad phase는 확정적 누락이다.** 반경만큼 팽창한 AABB가 겹치는 쌍만 남기면, 반경 표면 사이에 양의 간격이 있는 평행/직교 철근은 떨어진 축에서 탈락한다. 예를 들어 수평 두 중심선 높이 차 48.5mm, 반경 12.5·11mm면 clearance=25mm다. 사용자 기준을 26mm로 주어도 y구간이 겹치지 않아 검사까지 도달하지 못한다. tolerance 이내의 양의 接触도 같은 문제가 있다. broad phase에는 사용자 あき 기준과 tolerance를 반영해야 한다. 근거: `phases/47-joint-review-core/step4.md:70`, `phases/47-joint-review-core/step4.md:72`. 아래 5절에 기존 샘플 좌표로 확인한 값을 기록했다.

**런 소유자 제외도 확정적 누락이다.** `1F-X2Y3`에 접속하는 Y 大梁은 `1F-G2-X2Y2-Y`이지만 그 通し筋은 `1F-G2-X2Y1-Y`에 귀속된다. 전자는 targets, 후자는 reference이므로 step 4의 memberId 필터는 그 접합부를 통과하는 通し筋을 모두 제외한다. 所有 부재와 공간상 검토 대상 부재를 구분해야 한다. 근거: `src/domain/model/project.ts:1447`, `src/domain/rebar/girder.ts:364`, `src/lib/viewer/building.ts:299`, `src/lib/viewer/building.ts:440`, `phases/47-joint-review-core/step2.md:25`, `phases/47-joint-review-core/step4.md:69`.

### (e) パネルゾーン帯筋 부재

**성립.** `hoopSpan = story.height - beamDepthAbove`이고 배치도 그 길이를 사용한다. `columnHoopPlacements`는 그 placement만 전개한다. 최고 배치가 경계에 닿을 수는 있어도 그 위 パネルゾーン에 별도 帯筋을 만들지 않는다. 단위 수량의 `hoopCount`는 階高를 사용하므로 그 本数로 형상 존재를 추론해서는 안 된다. 근거: `src/domain/rebar/column.ts:265`, `src/domain/rebar/column.ts:285`, `src/domain/rebar/column.ts:293`, `src/lib/viewer/geometry.ts:265`, `docs/ADR.md:172`.

### 추가 코어 허점

- **接触 verdict 반례가 타입으로 표현되지 않는다.** verdict는 干渉와 あき 두 축이고 接触은 어느 축에도 집계하라고 하지 않는다. 그런데 테스트 4는 exclusion 제거 후 「접촉이 verdict에 잡힌다」고 요구한다. 접촉의 별도 계수/상태 또는 あき와의 관계를 먼저 정해야 한다. `defaultExclusions`도 「2건」이라고 쓰고 실제로 3개 레코드를 요구한다. 근거: `phases/47-joint-review-core/step4.md:41`, `phases/47-joint-review-core/step4.md:66`, `phases/47-joint-review-core/step4.md:73`, `phases/47-joint-review-core/step4.md:105`.
- **기본 제외의 이유와 실제 범위가 다르다.** 「의도된 接触」이라는 이유지만 scope 매칭은 FindingKind를 보지 않으므로 같은 부재의 해당 역할 사이 음수 clearance나 あき不足까지 집계에서 빠진다. フック 꼬리와 다른 主筋의 겹침까지 의도된 접촉이라고 볼 근거는 없다. 근거: `phases/47-joint-review-core/step1.md:88`, `phases/47-joint-review-core/step4.md:73`, `src/lib/viewer/geometry.ts:991`.
- **사용자 あき·exclusion 변경이 기존 항목을 무효화하지 않는다.** `checkId`에는 settings·exclusions가 들어가지만 `CurrentModel`/`itemValidity`는 현재 검사 조건이나 checkId를 받지 않는다. 모델·룰팩·검사版이 같으면 전혀 다른 기준으로 확인한 finding도 유효하고 준비 완료가 유지된다. 근거: `phases/47-joint-review-core/step1.md:51`, `phases/47-joint-review-core/step3.md:72`, `phases/47-joint-review-core/step3.md:84`, `phases/47-joint-review-core/step4.md:76`.
- **항목이 연결되어 있다는 사실을 확인 완료로 오인할 수 있다.** 필수 checklist가 確認済일 때 연결 item의 未確認·保留, 존재하지 않는 reviewItemId를 어떻게 처리할지 없다. 유효하지만 사람이 아직 확인하지 않은 item도 준비 완료가 될 수 있다. 연결 없는 checklist는 Confirmation만 있고 모델 fingerprint가 없어, 대상 断面을 바꿔도 준비 완료를 유지한다. 이는 step 5의 조건 (10)을 전부 충족하지 못한다. 근거: `phases/47-joint-review-core/step1.md:99`, `phases/47-joint-review-core/step1.md:109`, `phases/47-joint-review-core/step3.md:96`, `phases/47-joint-review-core/step5.md:23`.
- **삭제된 검토 대상의 fingerprint 대조가 불완전하다.** joint의 현재 memberIds만 순회하면 과거 접속 大梁이 사라진 사실을 직접 비교하지 않는다. 대개 柱 input 변화가 대신 잡겠지만 이전/현재 targets 집합 차이를 계약으로 고정해야 하며, ID 대응도 baseline이 없으면 `impact:null`이라 `対応要確認`을 내지 못한다. 근거: `phases/47-joint-review-core/step1.md:35`, `phases/47-joint-review-core/step3.md:75`, `phases/47-joint-review-core/step3.md:83`, `phases/47-joint-review-core/step3.md:84`.

## 5. 테스트의 반증 가능성

판정: **불성립 — 반증 가능한 테스트도 있으나 잘못된 전제·약한 oracle·서로 모순되는 기대값이 섞여 있다.**

1. **step 4 테스트 2의 실측±1은 조건부로 순환 oracle이다.** 동일한 새 `capsuleClearanceMm` 결과에서 기준을 만들면 거리 계산이 항상 일정량 틀려도 두 문턱 검사를 모두 통과한다. 분기 경계 검증으로는 유효하지만 거리의 정확성을 검증하지 않는다. 독립 손계산을 사용한다면 순환은 아니나 사양은 이를 강제하지 않는다. 선분 원시 함수의 손계산 테스트는 별도로 유효하다. 근거: `phases/47-joint-review-core/step4.md:20`, `phases/47-joint-review-core/step4.md:103`.

   더 먼저, 지정한 샘플 접합부에서 「下端筋 clearance > 0」이 틀리다. 기존 `buildTakeoff`→実寸 `buildingLayout`을 읽기 전용으로 실행하고, 평면상 투영이 柱 안에서 교차하는 **수평 직선 세그먼트**끼리 `abs(y1-y2)-r1-r2`를 계산했다. 새 거리 구현은 사용하지 않았다.

   | 접합부 | 역할·단면 | 세계 y (mm) | 반경 (mm) | 독립 산술 clearance (mm) |
   |---|---|---|---|---|
   | `1F-X2Y2` | 上端筋 G2/G2 | 4126 / 4126 | 11 / 11 | −22 |
   | `1F-X2Y2` | 下端筋 G2/G2 | 3574 / 3574 | 11 / 11 | −22 |
   | `1F-X2Y1` | 上端筋 G1/G2 | 4124.5 / 4126 | 12.5 / 11 | −22 |
   | `1F-X2Y1` | 下端筋 G1/G2 | 3525.5 / 3574 | 12.5 / 11 | 25 |

   값의 근거: `src/domain/model/sample-project.ts:47`, `src/domain/model/sample-project.ts:74`, `src/domain/rebar/girder.ts:997`, `src/domain/rebar/girder.ts:1006`, `src/lib/viewer/geometry.ts:238`, `src/lib/viewer/building.ts:347`. 提案: `1F-X2Y1`의 해당 수평 세그먼트 쌍을 명시하고 25mm를 독립 기대값, 24/26mm를 경계값으로 고정한다. 折曲げ 세그먼트를 포함한 「철근 전체의 최소거리」와 혼동하지 않는다.

2. **step 2의 변경 전 layout fixture는 보존 테스트로 성립하지만 현재 기대형태는 불성립.** 변경 전 JSON을 고정하는 것은 같은 새 구현에서 기대값을 만드는 순환과 다르다. 그러나 `RebarInstance`에 필수 필드 3개를 추가하면서 전체 결과를 `toEqual` 또는 같은 해시로 비교하면 반드시 다르다. 기존 필드로 투영해 좌표·순서를 비교하고 새 식별 필드는 별도로 검사해야 한다. 근거: `phases/47-joint-review-core/step2.md:63`, `phases/47-joint-review-core/step2.md:64`, `phases/47-joint-review-core/step2.md:70`.

3. **영역 필터의 부분집합 테스트는 제목을 입증하지 않는다.** `off ⊇ on`과 제거 사유가 영역 밖이라는 확인은 필터의 동작만 검증한다. 필요한 定着/런 철근이 검사 영역·targets에서 빠졌는지 검증하지 않는다. 전수 계산의 최근접점/유효영역을 독립 분류한 결과와 비교해야 한다. 근거: `phases/47-joint-review-core/step4.md:106`.

4. **같은 입력 두 번은 결정성 테스트이지 화면 독립성 테스트가 아니다.** 표시 layout과 다름도 実寸 좌표가 맞다는 증명이 아니다. 카메라·clip·layers 변경 전후의 동일 검사와 손계산 좌표를 함께 고정하는 것이 요구 (12)에 더 직접적이다. 근거: `phases/47-joint-review-core/step4.md:107`, `phases/47-joint-review-core/step5.md:25`.

5. **변이 ③을 죽일 테스트가 목록에 명시되지 않는다.** `sameMemberOnly`를 무시하는 변이는 다른 부재의 帯筋↔主筋 같은 **동일한 roles 쌍**을 마련해야 잡는다. 기존 테스트의 大梁 上端筋↔上端筋은 roles가 달라 원래도 매칭되지 않고, memberIds 축소 검사는 별개 조건이다. 근거: `phases/47-joint-review-core/step4.md:105`, `phases/47-joint-review-core/step4.md:113`.

6. **실행 불가능한 기대값은 반증력이 아니라 사양 오류다.** joint 유효성/G2 pitch 모순, 接触 verdict 모순, 샘플 大梁 본수 오류는 구현을 올바르게 해도 빨갛다. 이를 구현에 맞춰 녹이면 「테스트를 구현에 맞추지 마라」와 충돌한다. 근거: `phases/47-joint-review-core/step1.md:186`, `phases/47-joint-review-core/step2.md:67`, `phases/47-joint-review-core/step3.md:108`, `phases/47-joint-review-core/step4.md:105`.

## 6. 누락 — 완료 조건과 phase 48 경계

판정: **코어 계약 누락은 성립. 사용자 원문 12개 조건 전체와의 일대일 완전성은 판단 불가.**

지정 파일에는 사용자 요구 원문 12개가 수록되거나 연결되어 있지 않다. step 5가 번호 (2)–(12)를 요약하며 (5)(6)을 합쳐 쓰고, (1)은 빠져 있다. README는 목표 흐름만 적는다. 아래 표는 그 요약을 대조한 것이며 원문 전체를 검토했다는 주장이 아니다. 근거: `phases/47-joint-review-core/README.md:3`, `phases/47-joint-review-core/step5.md:15`.

| 완료 조건 번호 | 코어의 누락 또는 불성립 |
|---|---|
| (1) | 원문 없음으로 판단 불가. 간섭 위치·근거 검출은 step 4 테스트 1에 있지만 이것이 사용자 (1)의 전부인지는 알 수 없다. `phases/47-joint-review-core/step4.md:102`. |
| (2) | 검사 거리 oracle·올바른 샘플·あき broad phase가 필요하다. `phases/47-joint-review-core/step4.md:70`, `phases/47-joint-review-core/step4.md:103`. |
| (3) | 고정 unchecked는 있다. 그러나 전체 대상이 未対応이면 실제 검사가 0쌍이어도 두 verdict는 「なし」가 될 수 있다. 검사를 수행할 대상이 없는 상태와 검사 후 無検出의 계약이 필요하다. `phases/47-joint-review-core/step4.md:41`, `phases/47-joint-review-core/step4.md:109`. |
| (4) | roles·memberIds 제외는 있으나 接触 한정 의미, 제외된 간섭/미달의 가시적 집계, 실제 `sameMemberOnly` 반례가 빠졌다. `phases/47-joint-review-core/step4.md:73`, `phases/47-joint-review-core/step4.md:105`. |
| (5)(6) | G2 pitch의 영향/유효성 모순을 해소하고 사용자 검사 조건 변경도 재검토 이유에 포함해야 한다. `phases/47-joint-review-core/step3.md:84`, `phases/47-joint-review-core/step3.md:108`. |
| (7) | 数量/形状 분리는 있다. 다만 X-Ray가 開口補強筋에도 적용되면 가상 `points` 길이를 drawnLength라 부르거나 `rebarPlacements`가 throw할 수 있다. 실제 미표시 역할과 開口 절단 전 대표 polyline 길이의 의미를 구분해야 한다. `phases/47-joint-review-core/step4.md:95`, `docs/ADR.md:523`, `src/lib/viewer/geometry.ts:969`, `src/lib/viewer/geometry.ts:875`. |
| (8) | 행의 단위질량 null 상태는 있다. 그러나 unitMass만 바뀌면 부재 input/result 해시가 모두 불변이라 MemberImpact에 数量 영향을 넣는 명시 규칙이 없다. result는 length/count만 담고 kg은 lines에 있다. 결과 비교와 독립적으로 해당 행→부재 연결이 필요하다. `phases/47-joint-review-core/step2.md:57`, `phases/47-joint-review-core/step2.md:69`, `phases/47-joint-review-core/step3.md:61`, `phases/47-joint-review-core/step3.md:104`. |
| (9) | 파일 왕복 함수 테스트 외에 실제 저장 버튼의 review 전달·두 DB 키의 案件 일관성·복원 중 review 편집 보존이 빠졌다. `phases/47-joint-review-core/step1.md:149`, `phases/47-joint-review-core/step1.md:155`, `src/components/ProjectActions.tsx:49`, `src/lib/hooks/useProjectPersistence.ts:34`. |
| (10) | 연결 item이 未確認/保留/소실된 경우와 연결 없는 Confirmation의 모델 변경 무효화가 빠졌다. `phases/47-joint-review-core/step3.md:96`, `phases/47-joint-review-core/step1.md:107`. |
| (11) | ID 변경의 기준안 비교는 있다. 기준안 없는 과거 item, rebarId의 내부 생성 규칙 변경, source edition/url만의 변경을 판단할 계약은 없다. 특히 source에 edition/url이 존재하지만 rulepackFingerprint에서 빠진다. `phases/47-joint-review-core/step3.md:75`, `phases/47-joint-review-core/step3.md:83`, `phases/47-joint-review-core/step2.md:54`, `src/domain/rules/types.ts:4`, `src/domain/rules/types.ts:6`. |
| (12) | 実寸 경로·결정성은 지정했다. 동일 입력 반복을 넘어 표시 상태를 변화시키는 회귀, 검사영역의 정확한 의미, 런 소유 철근 포함 조건이 필요하다. `phases/47-joint-review-core/step4.md:69`, `phases/47-joint-review-core/step4.md:107`. |

추가 저장 경계 누락: `parseReviewState`가 파일에서 받는 수치의 finite·양수 조건, 중복 item/package/exclusion ID, 존재하지 않는 checklist 연결 ID, 단독 quantityLine targets, 빈/누락 snapshot fingerprint의 정책을 명시하지 않는다. 「배열·문자열·필수 필드」만으로는 필드 간 불변식까지 고정되지 않는다. 같은 검사를 add/update 리듀서에서도 유지해야 한다. 근거: `phases/47-joint-review-core/step1.md:20`, `phases/47-joint-review-core/step1.md:80`, `phases/47-joint-review-core/step1.md:140`, `phases/47-joint-review-core/step1.md:141`.

### phase 48 없이는 연결되지 않는 것

- **의도적으로 사용 경로가 없는 코어:** review 생성/확인/보류, baseline 설정, 패키지 편집, joint 열기, impact·validity·readiness 표시, 자동검사와 X-Ray 역탐색이다. phase 47은 UI를 만들지 않으므로 테스트 외 production 호출부가 없는 것이 계획된 상태다. 이를 목표 흐름의 제품 완성으로 보고해서는 안 된다. 근거: `phases/47-joint-review-core/README.md:4`, `phases/47-joint-review-core/README.md:22`, `phases/47-joint-review-core/README.md:25`.
- **phase 47에서 연결할 수 있고 연결해야 하는 경로:** 저장·복원·파일 취입이다. 기존 저장 버튼은 `downloadProjectJson(project)`만 호출한다. step 1은 새 시그니처를 요구하지만 UI 작업 설명은 읽기 결과와 `loadProject` 변경만 명시한다. review를 store에서 구독해 저장 함수에 전달하고 파일에 실제 담기는 통합 검사가 필요하다. 이것을 phase 48로 미루면 review가 저장되지 않거나 필수 인자 타입 검사부터 실패한다. 근거: `src/components/ProjectActions.tsx:18`, `src/components/ProjectActions.tsx:49`, `phases/47-joint-review-core/step1.md:149`, `phases/47-joint-review-core/step1.md:155`, `phases/47-joint-review-core/step1.md:185`.
- **X-Ray의 수량 행 역참조 계약:** 하나의 Rebar에서 질량 행과 継手 箇所 행 둘이 생길 수 있는데 XRayView의 `quantity.lineId`는 하나다. `xrayForRow`가 어느 행의 unit/places를 선택할지, `spliceLineId`를 어떻게 찾을지 정의되어 있지 않다. 형상 기반 새 집계를 만드는 대신 기존 두 키를 모두 다루도록 계약을 정해야 한다. 근거: `phases/47-joint-review-core/step4.md:85`, `phases/47-joint-review-core/step4.md:92`, `src/domain/quantity/index.ts:193`, `src/domain/quantity/index.ts:210`, `src/domain/quantity/index.ts:327`.

## 7. ADR 필요성

판정: **성립 — 기존 결정의 적용 범위를 넓히므로 명시적 결정이 필요하다.** 아래는 초안에 넣을 결정 문장 제안이며 ADR 파일은 수정하지 않았다.

1. **검토 대상은 矩形 柱와 그 柱에 접속하는 大梁의 형상으로 제한하고, 連続スパン 通し筋은 소유 memberId와 무관하게 대상 접합부에 기여하면 검사한다.** 円形柱·耐震壁·床板·上下階 柱의 미검사 범위를 별도로 기록하며 기존 네 부재의 数量 지원 범위는 변경하지 않는다. 근거: `AGENTS.md:24`, `phases/47-joint-review-core/step2.md:25`, `phases/47-joint-review-core/step2.md:35`, `src/domain/rebar/girder.ts:364`.
2. **검토 기록은 Project와 분리된 순수 JSON ReviewState로 저장하되 파일과 IndexedDB 복원에서 같은 案件의 데이터라는 일관성을 보장한다.** Rebar/QuantityLine의 현재 파생 결과는 저장하지 않고, 과거 측정 기록과 baseline 입력·fingerprint는 별도 의미로 유지한다. 이는 「도메인 상태 Project 하나」의 확장이다. 근거: `docs/ARCHITECTURE.md:98`, `docs/ARCHITECTURE.md:101`, `docs/ADR.md:50`, `phases/47-joint-review-core/README.md:8`.
3. **자동검사는 기존 作図規則의 実寸 반경 형상에 대한 후보 검출이며 구조 안전·施工可能·규준 적합 판정이 아니다.** あき는 출처·범위·시각을 가진 사용자 입력이고, 수치 연산 tolerance는 규준 허용오차와 분리해 공개한다. パネルゾーン帯筋·継手位置 등의 없는 형상을 보완해 만들지 않는다. 근거: `docs/ADR.md:25`, `docs/ADR.md:126`, `docs/ADR.md:172`, `docs/DESIGN.md:214`, `phases/47-joint-review-core/step4.md:74`.
4. **검토 유효성은 대상 집합, 실제 산정 의존 필드, 룰 출처·版, 검사 알고리즘版, 사용자 あき·제외 조건에 종속된다.** 표시만의 변경은 분리하고, 요소 ID의 대응이 불확실하면 자동 확정하지 않는다. 근거: `docs/ADR.md:1047`, `phases/47-joint-review-core/step2.md:55`, `phases/47-joint-review-core/step3.md:59`, `phases/47-joint-review-core/step3.md:84`.
5. **確認済와 準備完了는 유효한 확인 기록·필수 정보·명시적 예외의 충족 상태일 뿐 승인이나 rule confidence 승격을 뜻하지 않는다.** 미검사·정보 부족·소실된 확인 기록·변경된 검사 조건을 준비 완료와 구별하고, 예외는 이유와 범위를 보존한다. 근거: `docs/ADR.md:190`, `docs/ADR.md:196`, `phases/47-joint-review-core/README.md:11`, `phases/47-joint-review-core/step3.md:96`.
6. **X-Ray는 設計数量, 대표 가공 경로, 실제 표시/검사 형상을 구별하여 제시하고 형상에서 数量이나 적용 규준을 역산하지 않는다.** 현재 L2 算出式/L3 出典 구조와 접합부 검토 UI의 관계는 phase 48에서 정하되, 코어는 ruleHits의 출처를 잃지 않는다. 근거: `docs/ADR.md:126`, `docs/ADR.md:523`, `docs/UX.md:64`, `docs/UX.md:72`, `phases/47-joint-review-core/step4.md:95`.
