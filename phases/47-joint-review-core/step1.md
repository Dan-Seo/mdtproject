# Step 1: review-state — 검토 데이터의 타입·리듀서·파서와 로컬 저장, 스토어 슬라이스

`phases/47-joint-review-core/README.md`의 공통 결정 1~9를 먼저 읽어라.

## 읽어야 할 파일
- `src/domain/model/project.ts` — `Project`(≈L100), `isProjectShape`(≈L1887, **추가 키를 거부하지 않는다**), `deserializeProject`(≈L1970), `serializeProject`(≈L1588)
- `src/lib/store.ts` — 슬라이스 형태, `loadProject`(≈L120)
- `src/lib/persist/indexeddb.ts` — 단일 스토어 `project`·키 `current`, `createAutosave(write)`(≈L113, write 인자를 받는다)
- `src/lib/persist/file.ts` — `downloadProjectJson`·`readProjectFile`
- `src/lib/hooks/useProjectPersistence.ts` — 복원→자동저장 구독 순서
- `src/components/ProjectActions.tsx` — 파일 읽기 UI(`loadProject` 호출 지점)
- 테스트 스타일: `src/lib/store.test.ts`, `src/lib/persist/file.test.ts`, `src/lib/persist/indexeddb.test.ts`, `src/lib/hooks/useProjectPersistence.test.tsx`, `tests/e2e/uc15-revisit.js`(IndexedDB 키 `current`를 직접 읽는다 — **이 키 이름·형식은 유지**)

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
  rulepack: string           // 룰팩 전 항목 해시 (step 2에서 계산)
  checkVersion: number       // GEOMETRY_CHECK_VERSION (step 4). 검사와 무관한 항목은 0
  members: Record<string, MemberFingerprint>  // 이 항목의 targets가 닿는 부재만
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

/** 그때의 측정 기록. 현재 계산의 원본이 아니다 — 현재 값은 다시 검사해서 본다 */
export interface RecordedFinding {
  checkId: string
  findingId: string
  kind: '干渉候補' | 'あき不足候補' | '接触'
  clearanceMm: number
  a: { memberId: string; rebarId: string; role: string; barIndex: number }
  b: { memberId: string; rebarId: string; role: string; barIndex: number }
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
  valueMm: number
  source: '利用者入力'
  scope: string       // 예: 「接合部の全鉄筋」
  enteredAt: string
  note: string
}
/** 검사 제외. 범위와 이유가 없으면 만들 수 없다 */
export interface CheckExclusion {
  id: string
  scope: {
    sameMemberOnly: boolean
    roles: [string, string]          // 예: ['帯筋', '主筋'] — 순서 무관 매칭
    memberIds?: string[]             // 비면 전 부재
  }
  reason: string
  createdAt: string
}

export type ChecklistStatus = '未入力' | '未確認' | '確認済' | '保留' | '除外'
export interface ChecklistEntry {
  id: string
  label: string
  required: boolean
  reviewItemIds: string[]
  status: ChecklistStatus
  reason?: string                  // 保留·除外이면 필수
  confirmation?: Confirmation      // 연결 항목이 없는데 確認済이면 필수
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
- `parseReviewState(value: unknown): ReviewState` — `undefined`/`null` → `emptyReviewState()`(오래된 파일). `reviewSchemaVersion`이 다르면 **throw** `Unsupported ReviewState reviewSchemaVersion; expected 1`(조용히 버리지 않는다). 형태 검사: 배열·문자열·필수 필드, `baseline.project`는 `parseProject`(아래 3)로 검증, `status`가 `保留`인데 `holdReason` 없음 / 체크리스트 `保留`·`除外`인데 `reason` 없음 → throw. 검사는 `project.ts`의 `hasShape`·`isRecord` 스타일을 따르되 **복사하지 말고** 필요하면 그 헬퍼들을 export해서 재사용.
- 리듀서(전부 새 객체 반환, 입력 불변): `addItem(state, item)`, `updateItem(state, id, patch)`, `confirmItem(state, id, confirmation)`(status→確認済, updatedAt 갱신), `holdItem(state, id, reason)`, `setClearance(state, basis | null)`, `addExclusion(state, exclusion)`, `removeExclusion(state, id)`, `addPackage(state, pkg)`, `updatePackage(state, id, patch)`, `setChecklistStatus(state, pkgId, entryId, status, extra?: { reason?; confirmation? })`, `setBaseline(state, baseline | null)`. 없는 id → throw. `保留`에 reason 없음 → throw.
- id 생성은 호출 측이 한다(순수 함수에 `Date.now`·`crypto` 금지). `newReviewId(prefix, existingIds: Iterable<string>)`처럼 결정적 카운터 방식으로 하나 두어도 좋다.

### 3. 저장
- `src/domain/model/project.ts`: `parseProject(value: unknown): Project`를 추가하고 `deserializeProject(json)`은 `parseProject(JSON.parse(json))`로 위임. 동작·에러 문구 불변(기존 테스트 그대로 통과).
- `src/lib/persist/file.ts`:
  - `serializeProjectFile(project, review): string` — `JSON.stringify({ ...project, review })`. `review`가 `emptyReviewState()`와 같으면 **키를 생략**(기존 파일 형식과 바이트 호환 — `uc15`가 문자열을 본다).
  - `readProjectFile(file): Promise<{ project: Project; review: ReviewState }>` — 한 번 파싱해 `review` 키를 떼고 나머지를 `parseProject`, `review`를 `parseReviewState`. 둘 중 하나라도 throw면 전체 throw(원본 案件 유지는 `ProjectActions`가 한다).
  - `downloadProjectJson(project, review)`.
- `src/lib/persist/indexeddb.ts`: 같은 DB·같은 스토어에 키 `'review'` 추가. `saveReview(review)`, `loadStoredReview(): Promise<ReviewState | null>`(복원 경로라 실패는 null — `loadStoredProject`와 같은 이유, 주석에 적어라), `clearStoredProject`가 `review`도 지운다. `DATABASE_VERSION`은 **올리지 않는다**(키 추가에 upgrade가 필요 없다 — `uc15`의 `open(…, 1)`이 깨진다).
- `src/lib/hooks/useProjectPersistence.ts`: 복원 시 `loadStoredReview`도 읽어 `setReview`. 자동저장은 `createAutosave(saveReview)` 두 번째 인스턴스로 `review` 변화만 구독. flush 두 곳(pagehide·visibilitychange) 모두.

### 4. 스토어 `src/lib/store.ts`
- `review: ReviewState`(초기 `emptyReviewState()`), `setReview(updater: (review) => ReviewState)`, `loadProject(project, review?)` — `review` 생략 시 `emptyReviewState()`(다른 案件의 검토가 남지 않는다). `updateProject`는 `review`를 건드리지 않는다.
- `src/components/ProjectActions.tsx`: `readProjectFile` 반환 형태 변경에 맞춰 `loadProject(project, review)`.

## 테스트 (먼저 쓴다)
- `src/domain/review/state.test.ts`: 파서(빈 값→empty, 版 불일치→throw with message, 保留 무이유→throw, baseline.project 깨짐→throw), 각 리듀서의 불변성(입력 객체 `toEqual` 유지)과 throw 조건.
- `src/domain/model/project.test.ts`: `parseProject`가 `deserializeProject`와 같은 판정(기존 케이스 2개를 `parseProject`로도 돌린다).
- `src/lib/persist/file.test.ts`: 빈 review면 기존 형식과 **문자열 동일**; review가 있으면 round-trip으로 `items`·`packages`·`baseline` 복원; review 版 불일치 파일은 throw; 검토 키 없는 구 파일은 `emptyReviewState()`.
- `src/lib/persist/indexeddb.test.ts`: `review` 키 저장·복원, `clearStoredProject`가 둘 다 지움, 깨진 review는 null.
- `src/lib/hooks/useProjectPersistence.test.tsx`: review 변경만으로 `saveReview`가 불리고 `saveProject`는 안 불린다(그리고 그 반대).
- `src/lib/store.test.ts`: `setReview`가 `project` 참조를 바꾸지 않는다(`toBe`) — 결정 1의 핵심 회귀. `loadProject(p)`가 review를 비운다.

## 변이 확인 (report `mutations`)
① `parseReviewState`의 版 검사 제거 ② `serializeProjectFile`의 빈 review 키 생략 제거 ③ `setReview`가 `project`를 spread로 새로 만들게 변경 — 각각 어느 테스트가 빨개지는지 기록하고 원복.

## Acceptance Criteria
```bash
npx vitest run src/domain/review src/domain/model/project.test.ts src/lib/persist src/lib/hooks/useProjectPersistence.test.tsx src/lib/store.test.ts src/components/ProjectActions.test.tsx
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`phases/47-joint-review-core/step1-report.json`: `{ "changed_files": [...], "tests_added": [...], "mutations": [{ "site", "failing_tests": [...] }], "file_format_note": "빈 review 생략 근거와 uc15 호환 확인 방법", "paths_verified": ["src/domain/review/types.ts", "src/domain/review/state.ts", "src/lib/persist/file.ts", "src/lib/persist/indexeddb.ts", "src/lib/store.ts"] }`

## 금지사항
- `Project` 타입에 필드를 추가하지 마라. `PROJECT_SCHEMA_VERSION`·IndexedDB `DATABASE_VERSION`·키 `current`를 바꾸지 마라. 이유: 数量 불변이며 저장 案件·uc15 호환.
- `deserializeProject`의 에러 문구·판정을 바꾸지 마라.
- 検討 데이터를 `capture()`로 보내지 마라.
- `src/domain`에서 `@/lib`·React·three를 import하지 마라. 순수 함수에 `Date.now()`·`crypto`를 쓰지 마라.
- 화면(컴포넌트)을 만들지 마라 — `ProjectActions`의 호출 인자 변경만. 이유: UI는 phase 48.
- 테스트를 구현에 맞추지 마라.
