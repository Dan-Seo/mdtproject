# 아키텍처

## 디렉토리 구조

```
packages/core/          # 순수 TS. 파일/DB/네트워크 입출력 없음
  src/index.ts          # 공개 API. 앱은 여기만 import 한다
  src/model/            # 구조 모델·설계 배근정보·프로젝트 스키마·정규화
  src/geometry/         # 부재 형상 생성. 평면 뷰와 물량이 같은 형상을 쓴다
  src/rules/            # 배근상세 생성 룰(로직) + 수치표(데이터) + 봉인된 제79조 validator
  src/trace/            # 계산 DAG·manifest
  src/quantity/         # 설계수량·소요수량 산출과 반올림
  src/stb/              # ST-Bridge 파서 (조건부)
apps/local/             # 빌드된 정적 SPA. React + IndexedDB/파일 I/O
mockups/                # 가설 검증용 버리는 목업. core와 연결하지 않음. 측정 후 폐기
```

워크스페이스는 **2개**다. `apps/web`은 없다 — 웹 콘솔은 v1.1이다.

**형상은 `core`가 소유한다.** 콘크리트 체적과 거푸집 면적이 형상에서 나오므로, 뷰어용 형상을 앱에서
따로 만들면 화면과 물량이 어긋난다. `core/src/geometry/`가 형상을 만들고 뷰어는 2D 평면으로 투영만 한다.

길이는 변수명 접미사(`lengthMm`), 물량은 값과 단위(`kg`, `m3`, `m2`)를 함께 보관한다.
단위 브랜드 타입은 쓰지 않는다.

## 패턴

### `core`는 결정적 순수 함수

파일·IndexedDB·네트워크·`Date.now()`·`Math.random()`을 쓰지 않는다. 부수효과는 전부 앱 레이어로 민다.

### 단일 진입점

```ts
export function validateProject(project: ProjectModel): Issue[]
export function compute(project: ProjectModel, ruleset: Ruleset): ComputeResult
```

`compute()`가 유일한 최상위 진입점이고 단계별 함수는 노출하지 않는다. 단계를 쪼개 노출하면
호출 순서를 앱이 책임지게 되어 처리 순서를 우회할 수 있다. `validateProject()`만 예외인 이유는
입력 중 실시간 피드백이 필요해서다.

### 룰 로직은 코드, 룰 수치는 데이터

| | 형식 | 예 |
|---|---|---|
| 룰 로직 | TS 함수 | 환경 구분에 따라 어느 표를 볼지, 정착길이를 어떻게 조합할지 |
| 룰 수치 | 데이터 파일 (`verified` · `SourceRef` 부착) | 피복두께 표, 정착 계수, 할증률 |

이 분리는 선택이 아니다. 수치가 코드에 리터럴로 박히면 항목 단위 `verified` 플래그를 붙일 수 없고
`UNVERIFIED_RULE` 게이트가 성립하지 않는다. 미니 DSL이나 룰 평가기는 만들지 않는다.

### 트레이스는 결과에 동봉

collector를 주입해 push 하는 방식은 순수성과 충돌한다. 각 단계가 결과와 트레이스를 함께 담은 객체를
반환한다.

### 실패는 `Issue[]`, 예외는 삼키지 않음

예상 가능한 도메인 실패(입력 누락, 참조 깨짐, 규정 위반)는 throw 하지 않고 `Issue[]`로 반환하며
`compute()`는 부분 결과를 함께 돌려준다. **프로그래밍 오류·메모리 고갈까지 `Issue`로 위장하지 않는다** —
앱 오류 경계가 실패 화면과 로컬 진단 JSON 저장을 담당한다.

`Issue`에는 `core`가 판정할 수 있는 것만 넣는다. IndexedDB 용량 초과 같은 앱 레이어 사건은 제외한다.

## 데이터 흐름

```
직접입력 ─┐
          ├→ ProjectModel → 입력검증 → 배근상세 → 제79조 검증 → 물량 → Trace DAG
STB 임포트┘
     │
     ├→ IndexedDB 자동저장 / 프로젝트 JSON 저장·불러오기
     └→ ExportPolicy(status, 일회성 ExportContext) → 엑셀 물량표 + 감사 JSON
```

룰 처리 순서는 고정이다.

```
적용 기준 확인 → 표준 생성 룰 → 봉인된 제79조 validator / 예외 주장 분기 → 물량
```

조건부 스텝 12(사내기준 덮어쓰기)를 만들면 `생성 룰` 다음, `validator` 앞에 덮어쓰기가 들어간다.
**덮어쓰기가 validator 뒤로 갈 수 없도록** 자리를 미리 한정해둔다.

### 네트워크 경계

로컬 앱은 **어떤 외부 네트워크 요청도 하지 않는다.**

- 모든 에셋(폰트·아이콘)을 번들에 포함. CDN·웹폰트 금지
- 서버는 `127.0.0.1`에만 바인딩
- CSP: `default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'`. 서비스 워커 등록 금지
- 텔레메트리·에러 리포팅·소스맵 외부 업로드 금지
- 정본 URL은 **비클릭 일반 텍스트**로만 렌더링. `href`·`fetch`·폼·탐색 대상으로 만들지 않는다.
  URL 문자열은 source registry 안에만 존재해야 한다

사용자가 만들어 자기 PC에 저장하는 산출물(엑셀·감사 JSON·프로젝트 JSON)은 이 경계의 대상이 아니다.
우리가 전송하지 않기 때문이다.

## 상태 관리

### 재현성이 저장 설계를 결정한다

> **동일 `projectInputHash` + `engineVersion` + `rulesetHash` ⇒ 동일 `quantities`와 동일 DAG**

- `engineVersion`은 빌드 시 주입되는 **git commit SHA**. 사람이 붙이는 버전 문자열과 달리 실제 실행된
  로직을 지목한다. 릴리스 매니페스트·아티팩트 아카이빙은 만들지 않는다
- `rulesetHash`는 룰 수치 데이터 묶음의 SHA-256
- `calculatedAt`과 내보내기 시각은 동일성 비교에서 제외한다

### 결과를 저장하지 않는다

자동저장과 프로젝트 JSON은 **입력(`ProjectModel`)만** 담는다. 결과·트레이스·manifest는 저장하지 않고
다시 열 때 재계산으로 복원한다. 트레이스 노드는 대표 모델에서도 수천~수만 개라 저장하면 용량과 쓰기
성능이 곧 병목이 된다.

불러올 때 `engineVersion`·`rulesetHash`가 저장 당시와 다르면 **"과거 결과 복원이 아니라 현재 버전
재계산"**임을 먼저 고지한다. 결과 캐시는 성능 목표를 넘길 때 도입하지, 미리 만들지 않는다.

### 정규화가 재현성의 실질적 전제

정규화 함수는 `core`에 두고 **해시 계산과 저장이 같은 함수**를 쓴다. 규칙 자체에
`canonicalizationVersion`을 부여하고, 변경은 `projectSchemaVersion` 마이그레이션과 함께 수행한다.

| 전제 | 조치 |
|---|---|
| JSON 키 정렬 | 해시 전 재귀적으로 키를 정렬한 표준형으로 직렬화 |
| 유니코드 NFC | 모든 사용자 입력 문자열을 저장·해시 전에 `normalize('NFC')` |
| 배열 의미 구분 | 집합 배열(부재·층·단면)은 안정 ID로 정렬, 순서 배열(경계점·배근구간)은 보존 |
| 숫자 표준화 | `NaN`·`Infinity` 입력 거부, `-0` → `0` |
| 합산·출력 순서 | 결정적 키로 정렬 후 합산. `QuantityRow`·`TraceRecord`도 같은 규칙으로 정렬 |
| 결정적 ID | 안정 입력 경로·`ruleId`·순번의 해시로 생성. 난수·시각 금지 |

### 앱 레이어 상태

- 현재 프로젝트: IndexedDB 자동저장(원자적 쓰기). 실패는 화면 상단에 지속 노출하고 조용히 넘어가지 않는다
- 파일럿 내보내기 권한: **일회성 `ExportContext`**. `ProjectModel`이나 `compute()` 옵션에 저장하지 않는다.
  내보낼 때마다 경고 확인이 필요하고 완료 후 폐기한다
- 부분 결과 표시: `coverage.excluded`에서 파생한다. `QuantityRow`에 상태 필드를 따로 두지 않는다

## 핵심 타입

```ts
type SourceRef = {
  sourceId: string; title: string; edition: string; revisionDate: string
  url: string; sha256: string
  page?: number; section?: string; table?: string
}

type InputRef = {
  projectPath: string        // 예: members.G1.rebar.top.left
  label: string
  documentLabel?: string     // 사용자가 적은 도면·특기시방 이름. 파일 자체는 저장하지 않음
  locator?: string           // 도면 번호·시트·쪽·상세 번호
}

type GoverningStandard = {
  projectType: 'public' | 'private'
  adoptedStandardId: string  // source registry의 sourceId
  adoptedEdition: string
  confirmedBy: string; confirmedAt: string; note?: string
}

type TraceRecord = {
  id: string
  ruleId: string; ruleVersion: string
  sourceRefs: SourceRef[]
  verified: boolean
  parentTraceIds: string[]   // 기여 항목과 선행 계산
  inputRefs: InputRef[]
  operation: 'input' | 'rule' | 'sum' | 'multiply' | 'round'
  inputs: Record<string, { value: number | string | boolean; unit?: string }>
  rawResult: { value: number; unit: string }
  result: { value: number; unit: string }
  roundingPolicyId?: string
}

type QuantityRow = {
  id: string; memberId: string
  category: 'rebar' | 'concrete' | 'formwork'
  unit: 'kg' | 'm3' | 'm2'
  designQuantity: number
  requiredQuantity?: number  // 철근 소요수량. 해당하지 않으면 없음
  rootTraceId: string
}

type CalculationManifest = {
  status: 'VALID' | 'INPUT_INVALID' | 'UNVERIFIED_RULE'
        | 'LEGAL_INVALID' | 'LEGAL_REVIEW_REQUIRED'
  projectSchemaVersion: string
  canonicalizationVersion: string
  projectInputHash: string
  engineVersion: string      // 빌드 시 주입된 git commit SHA
  rulesetVersion: string; rulesetHash: string
  sourceSnapshotIds: string[]
  calculatedAt: string
}

// 부분 결과의 포함·제외 범위. 행 단위 상태는 여기서 파생한다
type ResultCoverage = {
  isPartial: boolean
  expectedMemberIds: string[]
  calculatedMemberIds: string[]
  excluded: Array<{ memberId: string; issueIds: string[] }>
}

// 앱 레이어의 일회성 내보내기 승인. ProjectModel과 compute()에는 들어가지 않는다
type ExportContext =
  | { mode: 'standard' }
  | { mode: 'pilot'; acknowledgedAt: string; warningVersion: string }

type ExportManifest = {
  mode: 'standard' | 'pilot'
  exportedAt: string; warningVersion?: string
  calculationManifestHash: string
  auditJsonSha256: string    // 동봉 감사 JSON 파일의 SHA-256
}

type ComputeResult = {
  manifest: CalculationManifest
  quantities: QuantityRow[]
  traces: TraceRecord[]
  issues: Issue[]
  geometry: MemberGeometry[] // 평면 뷰와 물량이 공유하는 형상
  coverage: ResultCoverage
}
```

`Issue`의 `code`는 세 묶음이다.

- **입력 무결성** — `MISSING_INPUT` · `GOVERNING_STD_UNCONFIRMED` · `COVER_POLICY_MISSING` ·
  `DANGLING_REF` · `DUPLICATE_ID` · `CIRCULAR_SUPPORT` · `OPEN_BOUNDARY` · `STORY_HEIGHT_MISMATCH`
- **수치 경계** — `NON_POSITIVE_VALUE` · `SPACING_EXCEEDS_SPAN` · `LENGTH_INFEASIBLE`
- **규정·룰** — `COVER_BELOW_LEGAL_MIN` · `ARTICLE79_EXCEPTION_CLAIMED` · `UNVERIFIED_VALUE` ·
  `OUT_OF_SCOPE_MEMBER`

각 `Issue`는 `severity`(`blocking` | `warning`), `message`, 그리고 UI가 지목에 쓰는
`projectPath`·`memberId`·`sourceRefs`를 갖는다.

조건부 스텝 12(사내기준 덮어쓰기)를 만들면 `TraceRecord.overriddenBy`,
`CalculationManifest.overrideHash`, `operation: 'override'`, `Issue` 코드 `OVERRIDE_REJECTED`가
추가된다. 미리 넣지 않는다.

피복은 부재마다 입력하지 않는다. `CoverPolicy`가 부재종별·환경별 설계 피복값과 출처를 한 번 담고,
도면에 특기된 부재만 `coverOverrideMm`으로 덮는다. 유효 피복은
`coverOverrideMm ?? CoverPolicy 조회값`이며 트레이스에 어느 쪽이 쓰였는지 남긴다.

### DAG 검증은 재실행이 아니라 노드별 산술 정합성

저장된 DAG를 다시 실행해 합계를 재현하는 것은 계산 엔진을 두 벌 만드는 일이므로 하지 않는다.

| operation | 산술 검사 |
|---|---|
| `sum` / `multiply` | 자식들의 `result`에 연산 적용 == 자신의 `result` |
| `round` | `rawResult`에 `roundingPolicyId` 적용 == `result` |
| `input` | 자식 없음. `inputRefs`가 비어 있지 않은지 검사 |
| `rule` | **산술 검사 불가.** `sourceRefs` 존재 + 골든 케이스 회귀로 검증 |

자유 텍스트 `formula`는 테스트할 수 없으므로 두지 않는다.

## 감사 산출물

| 파일 | 내용 |
|---|---|
| `quantities-<projectId>.xlsx` | `Summary` · `MemberQuantities` · `SourceRegistry` · `CalculationManifest` · `ExportManifest` · `Issues` |
| `audit-<projectId>.json` | `ProjectModel` 표준형 · `TraceRecord[]` 전체 · `ResultCoverage` · `CalculationManifest` |

`TraceRecord`와 입력 스냅샷을 스프레드시트 시트로 만들지 않는다 — 수만 행짜리 시트를 사람이 읽지 않고,
기계 검증용으로는 JSON 하나가 xlsx 행 분할보다 단순하고 해시하기 쉽다.
`ExportManifest.auditJsonSha256`이 동봉 JSON의 SHA-256이다.

## 성능 목표

대표 모델 = **2개 층 / 기둥 60 / 보 120 / 슬래브·벽 포함.**
`compute()` 전체 3초 이내, 평면 뷰 초기 표시 1초 이내, 프로젝트 열기 후 재계산 3초 이내.
10층/기둥300/보600 규모는 v1.1 목표이며 그때 결과 캐시 필요 여부를 재판정한다.
