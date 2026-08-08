# 프로젝트: 일본 RC 배근상세·물량산출 시스템 (`@mdt/*`)

일본 종합건설사(제네콘) 공무부용 도구. 사용자가 구조도에서 입력한 **설계 배근정보를 바꾸지 않고**
배근상세(정착·이음·후프/스터럽 길이·본수)와 철근·콘크리트·거푸집 물량을 산정하며,
모든 산출값을 원본 입력과 규정 조항까지 역추적할 수 있게 한다. 구조해석·구조설계는 하지 않는다.

## 문서

이 파일은 작업 지침이다. 배경과 상세 설계는 `docs/`에 있다.

| 문서 | 담는 것 |
|---|---|
| `docs/PRD.md` | 목표·사용자·핵심 기능·MVP 제외 사항·계산 상태·가설과 go/no-go 기준 |
| `docs/ARCHITECTURE.md` | 디렉토리 구조·패턴·데이터 흐름·상태 관리·핵심 타입·감사 산출물 |
| `docs/ADR.md` | 설계 결정 41건의 결정/이유/트레이드오프 |

구현 방향을 바꿔야 한다면 **코드보다 해당 문서를 먼저 고치고 사용자 승인을 받는다.**

## 기술 스택

- TypeScript strict mode / npm workspaces **2개** — `packages/core`, `apps/local`
- `apps/local`: Vite + React. 빌드된 정적 SPA를 `127.0.0.1` 바인딩 로컬 서버로 실행
- 테스트 Vitest, 린트 ESLint
- 3D 라이브러리 없음. 뷰어는 층별 2D 평면 (ADR-034)

## CRITICAL — 어기면 제품이 무너지는 규칙

### 1. 규정 수치를 기억으로 쓰지 말 것

피복두께 표·정착길이 계수·이음길이·철근 단위질량·할증률을 **기억이나 추정으로 채우지 않는다.**
그럴듯하지만 틀린 룰셋이 나오고, 이 제품의 유일한 차별점인 근거 추적성이 무너진다.

- 모든 룰 수치는 잠긴 정본(`sourceId` + 판 + SHA-256 + 쪽·절·표)에 연결된 **데이터 파일**에 둔다
- 원문 대조 전 값은 `verified:false`로만 저장한다. 독립 검토자의 `reviewedBy`·`reviewedAt` 승인 없이
  `verified:true`로 바꾸지 않는다. **Claude가 추출하고 Claude가 승인하는 것은 독립 검토가 아니다**
- 수치를 코드에 리터럴로 박지 않는다. **룰 로직은 TS 함수, 룰 수치는 데이터 파일** (ADR-022).
  리터럴로 박으면 항목 단위 `verified` 게이트가 성립하지 않는다

### 2. `packages/core`는 순수 함수다

- 파일·IndexedDB·네트워크·`Date.now()`·`Math.random()` 사용 금지 (ADR-002, ADR-039)
- ID는 안정 입력 경로·`ruleId`·순번의 해시로 만든다. 난수·시각 기반 ID는 DAG 동일성 검증을 깨뜨린다
- 앱은 `core/src/index.ts`만 import 한다. 내부 모듈 직접 참조 금지
- 공개 진입점은 `compute()` 하나. 예외는 `validateProject()`뿐 (ADR-021).
  단계별 함수를 노출하면 앱이 처리 순서를 우회할 수 있다

### 3. 외부 네트워크 요청 0

도면을 들고 있는 PC에서 실행되므로 **아웃바운드가 도입 심사의 핵심이다** (ADR-027).

- CDN·웹폰트·텔레메트리·원격 에러 리포팅·소스맵 외부 업로드를 넣지 않는다. 에셋은 전부 번들에 포함
- CSP는 `default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'`. 서비스 워커를 등록하지 않는다
- 정본 URL은 **비클릭 일반 텍스트**로만 렌더링한다. `href`·`fetch`·폼·탐색 대상으로 만들지 않는다.
  URL 문자열은 source registry 안에만 존재해야 한다
- 웹 콘솔·서버·DB·인증·동기화 코드를 **작성하지 않는다.** 전부 v1.1이다 (ADR-033)

### 4. 제79조 validator는 봉인한다

건축기준법 시행령 제79조 제1항 피복 하한 검사는 **어떤 경로로도 덮어쓸 수 없다** (ADR-005).

- 사내기준·설정·옵션으로 validator를 우회하는 경로를 만들지 않는다
- 제2항 인정 구조방법·인정부재 주장은 자동 적합 판정도, `LEGAL_INVALID` 판정도 하지 않는다.
  `LEGAL_REVIEW_REQUIRED`로 차단하고 증빙 `InputRef`를 남긴다 (ADR-037)
- 처리 순서 고정: **적용 기준 확인 → 표준 생성 룰 → 봉인된 validator/예외 분기 → 물량**

### 5. 실패는 `Issue[]`, 단 프로그래밍 오류는 삼키지 말 것

- 예상 가능한 도메인 실패(입력 누락, 참조 깨짐, 규정 위반)는 throw 하지 않고 `Issue[]`로 반환한다.
  `compute()`는 부분 `quantities`·`geometry`·`coverage`를 함께 돌려준다 (ADR-020, ADR-030)
- **프로그래밍 오류·메모리 고갈까지 `Issue`로 위장하지 않는다.** 앱 오류 경계가 처리한다
- `Issue`에는 `core`가 판정할 수 있는 것만 넣는다. IndexedDB 실패 같은 앱 레이어 사건은 앱이 표시한다
- 부분 합계는 `coverage.excluded`에서 파생해 표시한다. `QuantityRow`에 상태 필드를 따로 두지 않는다 (ADR-041)

### 6. 해시·저장 전 정규화를 통과시킨다

같은 입력인데 해시가 달라지면 재현성이 조용히 깨진다 (ADR-031, ADR-039). 정규화 함수는 `core`에 두고
해시 계산과 저장이 **같은 함수**를 쓴다.

- JSON 키 재귀 정렬 / 문자열 `normalize('NFC')` (일본어 부재 부호 필수)
- 집합 배열(부재·층·단면)은 안정 ID로 정렬, 순서 배열(경계점·배근구간)은 보존
- `NaN`·`Infinity` 거부, `-0` → `0`
- 합산은 결정적 키로 정렬한 뒤 수행

### 7. 결과를 저장하지 않는다

자동저장과 프로젝트 JSON은 **입력(`ProjectModel`)만** 담는다. 결과·트레이스·manifest는 저장하지 않고
다시 열 때 재계산으로 복원한다 (ADR-023). 결과 캐시는 성능 목표를 넘길 때 도입하지, 미리 만들지 않는다.

## 지금 만들지 않는 것 — 요청받으면 근거 문서를 먼저 확인할 것

| 항목 | 근거 |
|---|---|
| 웹 콘솔·클라우드 동기화·서버·DB·인증 | v1.1 (ADR-033) |
| 3D 렌더링, 철근 렌더링, 가공도 | ADR-011, ADR-034 |
| 사내기준 덮어쓰기(`loadOverrides()` 등) | H6 확인 후 조건부 스텝 12 (ADR-035) |
| ST-Bridge 임포트 | H5 확인 후 조건부 스텝 11 |
| 슬래브·벽 **철근** 산출 | 형상 기반 콘크리트·거푸집만 |
| 릴리스 아티팩트 아카이빙·재실행 보장 | 엔진 식별은 git commit SHA까지 (ADR-040) |
| 룰 DSL·룰 평가기 | 평범한 TS 함수로 쓴다 (ADR-022) |
| 멀티탭 편집 잠금, 결과 캐시, 설계변경 증감표 | v1.1 또는 불필요 |
| 문서 우선순위 자동 해석 | 사람이 판단해 최종 값을 입력한다 (ADR-036) |

## 개발 프로세스

- **TDD.** 테스트를 먼저 쓰고 통과하는 구현을 쓴다. `scripts/hooks/tdd-guard.sh`가 `Edit|Write`에서
  강제하므로 테스트 없이 구현 파일을 만들면 차단된다 (`package.json`이 생긴 이후부터 적용)
- **스텝 순서를 지킨다.** 아래 로드맵대로 진행한다
- **룰 스텝(5~8)은 5단계 절차를 따른다**: 원문·정오표 확인 → 수치표 작성 → `verified:false` 코드화 +
  골든 케이스 → 독립 검토 → 승인 후 `verified:true` 활성화
- 커밋은 conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)

## 스텝 로드맵

| # | 이름 | 내용 |
|---|---|---|
| 0 | `project-setup` | 워크스페이스 2개, TS strict, Vitest, ESLint, git commit SHA 주입, loopback 서버, 강화 CSP, 아웃바운드 0 테스트 |
| 1 | `source-lock` | `sourceStatus`가 있는 정본 registry, SHA-256, 적용 판, 지원 룰 매트릭스, `validation-corpus/manifest`, 채번 규칙 |
| 2 | `domain-model` | `ProjectModel`(`GoverningStandard`·`CoverPolicy`·배치·배근정보·슬래브/벽·예외 주장), 스키마 버전, 입력검증, 정규화 |
| 3 | `trace-dag` | 트레이스 타입과 노드별 산술 정합성 검사, 결정적 ID, 트레이스 노드 수 실측 |
| 4 | `rebar-catalog` | JIS G 3112 기반 D10~D51 공칭단면적·단위질량·강종 |
| 5 | `rule-cover` | 권장 피복 생성 + 제79조 제1항 하한 validator(봉인) + 제2항 예외 분기 |
| 6 | `rule-girder` | 보 정착·이음·철근 길이/본수. 좌/중앙/우, 상/하단, 연속/절단 |
| 7 | `rule-column` | 기둥 정착·이음·길이/본수와 기둥-보 접합 조건 |
| 8 | `quantity-engine` | 철근 설계/소요 kg, 콘크리트 m³, 거푸집 m², 躯体 4% 할증, 반올림 |
| 9 | `project-input` | 입력 UI 전체 + IndexedDB 자동저장 + JSON 왕복 + 층별 2D 평면 뷰 |
| 10 | `result-ui` | 물량표 + 근거 패널 + coverage + 상태별 차단 + 엑셀·감사 JSON 내보내기 |

조건부 — **11** `stb-import`(H5 확인 시), **12** `company-overrides`(H6 확인 시).

**스텝 5 진입에는 두 선행조건이 있다.**

- **P4 (H8)** — 파일럿 현장의 계약도서가 공공건축공사 표준시방서를 채택하는지 확인.
  관청시설용 기준이므로 민간공사가 채택하지 않으면 룰셋의 기반 기준 자체를 다시 골라야 한다
- **P3** — 일본 RC·적산 실무 독립 검토자 확보. 기한은 스텝 4 종료. 미확보 시 스텝 5 진입 전에
  사실·원인·재시도 계획을 기록하고 계속/중단을 결정한다

**스텝 6 직후 수직 슬라이스 게이트 V1**을 통과해야 스텝 7로 간다 — 보 1개 fixture를
`ProjectModel → compute → QuantityRow → TraceDAG → 최소 입력 화면 → 엑셀 + 감사 JSON`까지 관통시켜
결정적 재계산·역추적·해시·외부 요청 0·부분 결과 표시를 함께 검증한다.

병행 작업 **P1**(공무 담당자 3명 인터뷰: H1·H2·H3·H4·H5·H6), **P2**(버리는 입력 목업으로 H7 측정)는
스텝 1과 동시에 시작한다. P2 목업은 `mockups/`에 두고 `core`와 연결하지 않으며 측정 후 폐기한다.
- Stop 훅이 `npm run lint && npm run build && npm run test`를 자동 실행한다. 이게 공통 검수 조건이다

## 명령어

```
npm run dev      # 로컬 앱 개발 서버 (심사 대상 실행에는 쓰지 않음)
npm run build    # 프로덕션 빌드 (git commit SHA를 engineVersion으로 주입)
npm run lint     # ESLint
npm run test     # Vitest
npm run preview  # 빌드 산출물을 127.0.0.1 바인딩으로 서빙 — 파일럿·심사용 실행 경로
```

## 현재 상태

**스텝 0 미착수.** `package.json`·워크스페이스·소스가 아직 없으므로 위 명령어는 스텝 0에서 만든다.
그전까지 Stop 훅의 검수 명령은 실패한다. Harness `phases/` 실행 파일도 아직 없어
`scripts/execute.py` 자동 실행은 돌릴 수 없다.
