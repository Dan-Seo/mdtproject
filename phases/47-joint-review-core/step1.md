# Step 1: review-state — 검토 데이터의 타입·파서(불변식)·리듀서, `parseProject`

`phases/47-joint-review-core/README.md`의 공통 결정 1~10을 먼저 읽어라. 저장·스토어는 **step 2**다 — 이 step은 `src/domain/review/{types,state}.ts`와 `parseProject`만 만든다.

## 읽어야 할 파일
- `src/domain/model/project.ts` — `Project`(≈L100), `isProjectShape`(≈L1887, 추가 키를 거부하지도 지우지도 않는다), `deserializeProject`(≈L1970), `hasShape`·`isRecord` 헬퍼
- `src/domain/model/member.ts`, `src/domain/model/rebar.ts` — 참조할 id 규약(`Rebar.id`는 `${memberId}|…`)
- 테스트 스타일: `src/domain/model/project.test.ts`

## 만들 것

### 1. `src/domain/review/types.ts` (순수 타입 + 상수)
```ts
export const REVIEW_SCHEMA_VERSION = 1

/** 장기 참조는 안정적 식별자로만. 배열 index·렌더 instanceId·数量行 id 단독 참조 금지 */
export type ElementRef =
  | { kind: 'member'; memberId: string }
  | { kind: 'joint'; columnMemberId: string }   // 접합부 = 그 柱 부재 (階는 부재가 안다)
  | { kind: 'rebar'; rebarId: string }           // Rebar.id (`${memberId}|main` 등 결정적)
  | { kind: 'quantityLine'; lineId: string }     // 보조 참조. 단독으로 쓰지 않는다

export interface ViewerPose { position: [number, number, number]; target: [number, number, number] } // mm
export interface ClipState { enabled: boolean; axis: 'x' | 'y' | 'z'; ratio: number }
export type ViewerLayers = Record<'main' | 'hoop' | 'concrete', boolean>

export interface MemberFingerprint { input: string; result: string | null }  // result null = 未対応
export interface ReviewFingerprints {
  rulepack: string                 // 룰팩 전 항목 해시 (step 3)
  checkVersion: number             // GEOMETRY_CHECK_VERSION (step 5). 검사와 무관한 항목은 0
  checkConditions: string | null   // 사용자 あき 기준＋除外 범위의 해시 (step 3). 검사와 무관하면 null
  members: Record<string, MemberFingerprint>  // 이 항목의 targets가 닿는 부재만 (기준안은 전 부재)
}

export interface ReviewSnapshot {
  capturedAt: string         // ISO 8601, 예 "2026-09-17T10:00:00+09:00"
  fingerprints: ReviewFingerprints
  viewer: {
    mode: 'member' | 'building' | 'joint'
    pose: ViewerPose | null
    clip: ClipState
    layers: ViewerLayers
    selection: { group: string | null; memberId: string | null; rowId: string | null }
  }
}

export type FindingKind = '干渉候補' | 'あき不足候補' | '接触'
/** 그때의 측정 기록. 현재 계산의 원본이 아니다 — 현재 값은 다시 검사해서 본다 */
export interface RecordedFinding {
  checkId: string
  findingId: string
  kind: FindingKind
  clearanceMm: number
  a: { memberId: string; rebarId: string; role: string; barIndex: number; segmentIndex: number }
  b: { memberId: string; rebarId: string; role: string; barIndex: number; segmentIndex: number }
  closestPoints: [[number, number, number], [number, number, number]]
  basis: string   // 「幾何学的重なり」 또는 「利用者入力あき 40mm（範囲: 接合部の全鉄筋）」
}

export type ReviewHumanStatus = '未確認' | '確認済' | '保留' | '判断不可'
/** by는 로컬 자유 입력이다. 신원 인증·전자서명이 아니다 (필드 주석에 명기) */
export interface Confirmation { by: string; at: string; note: string }

export interface ReviewItem {
  id: string
  createdAt: string
  updatedAt: string
  targets: ElementRef[]
  title: string
  body: string
  status: ReviewHumanStatus
  holdReason?: string           // status가 保留일 때 필수
  confirmations: Confirmation[]
  snapshot: ReviewSnapshot
  finding?: RecordedFinding
}

export interface ClearanceBasis {
  valueMm: number     // 유한·양수
  source: '利用者入力'
  scope: string       // 예: 「接合部の全鉄筋」
  enteredAt: string
  note: string
}
/** 검사 제외. 범위와 이유가 없으면 만들 수 없다. kinds에 없는 종류의 finding은 제외하지 않는다 */
export interface CheckExclusion {
  id: string
  scope: {
    sameMemberOnly: boolean
    roles: [string, string]          // 예: ['帯筋', '主筋'] — 순서 무관 매칭
    kinds: FindingKind[]             // 비지 않는다. 기본 제외는 ['接触']뿐 — 干渉候補·あき不足候補를 기본으로 숨기지 않는다
    memberIds?: string[]             // 비면 전 부재
  }
  reason: string
  createdAt: string
}

export type ChecklistStatus = '未入力' | '未確認' | '確認済' | '保留' | '除外'
/** 연결 검토 항목이 없는 체크리스트의 확인 기록. 확인 시점의 대상 부재 fingerprint를 함께 남겨 모델 변경을 잡는다 */
export interface ChecklistConfirmation extends Confirmation { fingerprints: ReviewFingerprints }
export interface ChecklistEntry {
  id: string
  label: string
  required: boolean
  reviewItemIds: string[]          // 존재하지 않는 id가 남을 수 있다(항목 삭제) — 파서는 허용, 준비 상태가 blocker로 낸다
  status: ChecklistStatus
  reason?: string                  // 保留·除外이면 필수
  confirmation?: ChecklistConfirmation  // 연결 항목이 없는데 確認済이면 필수
}
export interface WorkPackage {
  id: string
  name: string
  targets: ElementRef[]
  assignee: string                 // 로컬 자유 입력
  dueDate: string | null           // ISO 날짜 "2026-10-01"
  checklist: ChecklistEntry[]
  createdAt: string
  updatedAt: string
}

export interface Baseline {
  label: string
  capturedAt: string
  project: Project                 // 사본 (순수 JSON)
  fingerprints: ReviewFingerprints // 고정 시점의 전 부재 fingerprint
}

export interface ReviewState {
  reviewSchemaVersion: typeof REVIEW_SCHEMA_VERSION
  baseline: Baseline | null
  settings: { clearance: ClearanceBasis | null }
  exclusions: CheckExclusion[]
  items: ReviewItem[]
  packages: WorkPackage[]
}
```
`Project` import는 `../model/project`에서 type-only.

### 2. `src/domain/review/state.ts` (순수 함수)
- `emptyReviewState(): ReviewState`
- `parseReviewState(value: unknown): ReviewState` — `undefined`/`null` → `emptyReviewState()`(오래된 파일). `reviewSchemaVersion`이 다르면 **throw** `Unsupported ReviewState reviewSchemaVersion; expected 1`(조용히 버리지 않는다). 형태 검사는 `project.ts`의 `hasShape`·`isRecord` 스타일을 따르되 **복사하지 말고** 필요하면 그 헬퍼들을 export해서 재사용. **불변식**(어기면 throw, 문구에 어느 필드인지):
  - 배열·문자열·필수 필드; `baseline.project`는 `parseProject`(아래 3)로 검증.
  - 수치(`clearance.valueMm`, `finding.clearanceMm`, `closestPoints`, `pose`, `clip.ratio`)는 유한(`Number.isFinite`); `valueMm > 0`.
  - `items`·`packages`·`exclusions`·각 `checklist`의 `id`는 컬렉션 안에서 유일.
  - `status === '保留'`인데 `holdReason` 없음 / 체크리스트 `保留`·`除外`인데 `reason` 없음 / 체크리스트 `確認済`인데 `reviewItemIds`가 비고 `confirmation` 없음 → throw.
  - `exclusion.scope.kinds`가 비면 throw. `reason` 빈 문자열이면 throw.
  - `snapshot.fingerprints.members`는 record(비어 있어도 됨). `checkConditions`는 string | null.
  - `reviewItemIds`의 미존재 id는 **허용**(파서는 참조 무결성을 강제하지 않는다 — 준비 상태 판정이 blocker로 낸다, step 4).
- 리듀서(전부 새 객체 반환, 입력 불변): `addItem(state, item)`, `updateItem(state, id, patch)`, `confirmItem(state, id, confirmation)`(status→確認済, updatedAt ＝ confirmation.at), `holdItem(state, id, reason)`, `setClearance(state, basis | null)`, `addExclusion(state, exclusion)`, `removeExclusion(state, id)`, `addPackage(state, pkg)`, `updatePackage(state, id, patch)`, `setChecklistStatus(state, pkgId, entryId, status, extra?: { reason?; confirmation? })`, `setBaseline(state, baseline | null)`. 없는 id → throw. 중복 id 추가 → throw. `保留`에 reason 없음 → throw. `確認済`에 연결도 확인 기록도 없음 → throw. 리듀서의 불변식은 파서와 **같은 함수**로 검사한다(두 벌 쓰지 마라).
- id 생성은 호출 측이 한다(순수 함수에 `Date.now`·`crypto` 금지). `newReviewId(prefix, existingIds: Iterable<string>)`처럼 결정적 카운터 방식으로 하나 두어라.

### 3. `src/domain/model/project.ts`
`parseProject(value: unknown): Project`를 추가하고 `deserializeProject(json)`은 `parseProject(JSON.parse(json))`로 위임. 동작·에러 문구 불변(기존 테스트 그대로 통과). 추가 키(`review`)는 여전히 거부하지 않는다.

## 테스트 (먼저 쓴다)
- `src/domain/review/state.test.ts`: 파서 — 빈 값→empty; 版 `2`→throw with message; 保留 무이유→throw; `valueMm: 0`·`NaN`→throw; 중복 item id→throw; `kinds: []`→throw; 確認済 무연결·무확인→throw; 미존재 `reviewItemIds`→통과; `baseline.project` 깨짐→throw. 리듀서 — 각각 입력 객체 `toEqual` 유지(불변), throw 조건, `confirmItem` 후 `updatedAt === confirmation.at`.
- `src/domain/model/project.test.ts`: `parseProject`가 `deserializeProject`와 같은 판정(기존 케이스 2개를 `parseProject`로도 돌린다).

## 변이 확인 (report `mutations`)
① `parseReviewState`의 版 검사 제거 ② 중복 id 검사 제거 ③ `holdItem`의 reason 검사 제거 — 각각 어느 테스트가 빨개지는지 기록하고 원복.

## Acceptance Criteria
```bash
npx vitest run src/domain/review src/domain/model/project.test.ts
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`phases/47-joint-review-core/step1-report.json`: `{ "changed_files": [...], "tests_added": [...], "mutations": [{ "site", "failing_tests": [...] }], "paths_verified": ["src/domain/review/types.ts", "src/domain/review/state.ts", "src/domain/model/project.ts"] }`

## 금지사항
- `Project` 타입에 필드를 추가하지 마라. `PROJECT_SCHEMA_VERSION`을 바꾸지 마라. 이유: 数量 불변·저장 案件 호환.
- `deserializeProject`의 에러 문구·판정을 바꾸지 마라.
- 저장·스토어·컴포넌트를 건드리지 마라 — step 2다.
- `src/domain`에서 `@/lib`·React·three를 import하지 마라. 순수 함수에 `Date.now()`·`crypto`를 쓰지 마라.
- 테스트를 구현에 맞추지 마라.
