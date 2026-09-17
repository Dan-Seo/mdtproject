# Step 2: review-persistence — 파일 번들, IndexedDB 한 트랜잭션 저장/복원, 자동저장 generic, 스토어 슬라이스, `ProjectActions` 인자

README 결정 1·7과 step 1의 타입·`parseReviewState`·`parseProject`를 전제로 한다.

## 읽어야 할 파일
- `src/lib/store.ts` — 슬라이스 형태, `loadProject`(≈L131, 현재 `(project: Project): void`)
- `src/lib/persist/indexeddb.ts` — 단일 스토어 `project`·키 `current`, `createAutosave(write)`(≈L113; `write`·pending·queued가 전부 `Project` 고정 — generic화가 필요하다), `clearStoredProject`
- `src/lib/persist/file.ts` — `downloadProjectJson`·`readProjectFile`
- `src/lib/hooks/useProjectPersistence.ts` — 복원→자동저장 구독 순서, 복원 중 사용자 편집 보호(≈L34, `project` 참조만 본다)
- `src/components/ProjectActions.tsx` — 저장 버튼은 `downloadProjectJson(project)`만 호출(≈L49), 파일 읽기 UI
- 테스트 스타일: `src/lib/store.test.ts`, `src/lib/persist/file.test.ts`, `src/lib/persist/indexeddb.test.ts`, `src/lib/hooks/useProjectPersistence.test.tsx`, `src/components/ProjectActions.test.tsx`
- `tests/e2e/uc15-revisit.js` — IndexedDB `kijun` v1, store `project`, 키 `current`의 **문자열을 부분 문자열로** 확인한다(전체 문자열 비교는 없다). 이 키 이름·형식(Project JSON 문자열)은 유지.

## 만들 것

### 1. `src/lib/persist/file.ts`
- `serializeProjectFile(project, review): string` — `JSON.stringify({ ...project, review })`. `review`가 `emptyReviewState()`와 `deepEqual`이면 **키를 생략**(구 형식과 바이트 동일).
- `readProjectFile(file): Promise<{ project: Project; review: ReviewState }>` — 한 번 파싱해 `review` 키를 떼고 나머지를 `parseProject`, `review`를 `parseReviewState`. 둘 중 하나라도 throw면 전체 throw(원본 案件 유지는 `ProjectActions`가 한다).
- `downloadProjectJson(project, review)`.

### 2. `src/lib/persist/indexeddb.ts`
- `export interface StoredBundle { project: Project; review: ReviewState }`.
- `saveBundle(bundle): Promise<void>` — **한 readwrite 트랜잭션**에서 키 `current`(Project JSON 문자열 — 현행 형식)와 키 `review`(ReviewState JSON 문자열) 둘을 put. 트랜잭션이 실패하면 둘 다 안 써진다(원자성이 목적 — 주석에).
- `loadStoredBundle(): Promise<{ project: Project | null; review: ReviewState | null }>` — 한 readonly 트랜잭션에서 둘 다 읽는다. `current` 파싱 실패 → `project: null`(현행 `loadStoredProject`와 같은 이유 — 복원 경로라 throw하지 않는다, 주석에). `review` 파싱 실패 → `review: null`. **project가 null이면 review도 null로 돌려준다**(다른 案件의 검토가 빈 案件에 붙지 않게).
- `clearStoredProject`가 `review`도 지운다. `DATABASE_VERSION`은 **올리지 않는다**(키 추가에 upgrade가 필요 없다 — `uc15`의 `open(…, 1)`이 깨진다).
- `createAutosave<T>(write: (value: T) => Promise<void>)` — generic화. pending·queued도 `T`. 기존 `saveProject`·`loadStoredProject`는 **유지**(기존 테스트·호출부 회귀 방지; 내부에서 같은 put/get을 쓴다).

### 3. `src/lib/hooks/useProjectPersistence.ts`
- 복원: `loadStoredBundle()` → `loadProject(project, review ?? emptyReviewState())`. 복원 중 사용자 편집 보호는 **`project` 또는 `review` 참조가 마운트 시점과 달라졌으면** 복원을 건너뛴다(현재는 project만 본다).
- 자동저장: `createAutosave<StoredBundle>(saveBundle)` **하나**. 구독은 `project`·`review` 어느 쪽 참조가 바뀌어도 `{ project, review }`를 넘긴다. flush 두 곳(pagehide·visibilitychange) 유지.

### 4. 스토어 `src/lib/store.ts`
- `review: ReviewState`(초기 `emptyReviewState()`), `setReview(updater: (review: ReviewState) => ReviewState)`, `loadProject(project, review?)` — `review` 생략 시 `emptyReviewState()`(다른 案件의 검토가 남지 않는다). `updateProject`는 `review`를 건드리지 않는다.

### 5. `src/components/ProjectActions.tsx`
- 저장 버튼: `downloadProjectJson(project, review)` — `review`는 스토어에서 구독.
- 파일 읽기: `readProjectFile` 반환 형태에 맞춰 `loadProject(project, review)`. 실패 시 현행대로 원본 유지.

## 테스트 (먼저 쓴다)
- `src/lib/persist/file.test.ts`: 빈 review면 기존 형식과 **문자열 동일**(`serializeProject`와 `toBe`); review가 있으면 round-trip으로 `items`·`packages`·`baseline`·`settings`·`exclusions` `toEqual`; review 版 불일치 파일은 throw(문구); 검토 키 없는 구 파일은 `emptyReviewState()`; `review`가 깨졌으면 project도 반환하지 않는다(throw).
- `src/lib/persist/indexeddb.test.ts`: `saveBundle` 후 `current`·`review` 둘 다 읽힘; `clearStoredProject`가 둘 다 지움; `review` 문자열이 깨졌으면 `review: null`·project는 정상; `current`가 없으면 review가 있어도 둘 다 null; `saveBundle`이 `transaction`을 **한 번** 열고 두 키를 put한다(테스트의 fake IDB에서 트랜잭션 호출 수를 센다 — 기존 테스트의 목 방식을 따른다); `createAutosave<T>`가 기존 `Project` 사용처와 타입 호환(기존 테스트 통과).
- `src/lib/hooks/useProjectPersistence.test.tsx`: review만 바꿔도 `saveBundle`이 `{project, review}`로 불린다; project만 바꿔도 같다; 마운트 직후 사용자가 `setReview`를 한 뒤 복원이 도착하면 복원이 **건너뛰어진다**(review 편집 보존); 복원 번들의 review가 null이면 `emptyReviewState()`.
- `src/lib/store.test.ts`: `setReview`가 `project` 참조를 바꾸지 않는다(`toBe`) — 결정 1의 핵심 회귀; `updateProject`가 `review` 참조를 바꾸지 않는다; `loadProject(p)`가 review를 비운다; `loadProject(p, r)`가 r을 넣는다.
- `src/components/ProjectActions.test.tsx`: 저장 클릭 시 `downloadProjectJson`이 스토어의 `review`와 함께 불린다(목); 검토가 있는 파일을 읽으면 `loadProject(project, review)`.

## 변이 확인 (report `mutations`)
① `serializeProjectFile`의 빈 review 키 생략 제거 ② `setReview`가 `project`를 spread로 새로 만들게 변경 ③ 복원 보호에서 `review` 참조 비교 제거 — 각각 어느 테스트가 빨개지는지 기록하고 원복.

## Acceptance Criteria
```bash
npx vitest run src/lib/persist src/lib/hooks/useProjectPersistence.test.tsx src/lib/store.test.ts src/components/ProjectActions.test.tsx
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step2-report.json`: `{ "changed_files", "tests_added", "mutations", "file_format_note": "빈 review 생략 근거와 uc15 호환(키 current·부분 문자열) 확인 방법", "paths_verified": ["src/lib/persist/file.ts", "src/lib/persist/indexeddb.ts", "src/lib/hooks/useProjectPersistence.ts", "src/lib/store.ts", "src/components/ProjectActions.tsx"] }`

## 금지사항
- IndexedDB `DATABASE_VERSION`·키 `current`·그 값의 형식을 바꾸지 마라. 이유: uc15·기존 저장 案件.
- `project`와 `review`를 서로 다른 트랜잭션·서로 다른 autosave로 쓰지 마라. 이유: 案件 전환 중 한쪽만 써지면 다른 案件의 검토가 붙는다(반증 4(a)).
- 검토 데이터를 `capture()`로 보내지 마라.
- 화면을 만들지 마라 — `ProjectActions`의 호출 인자 변경만. 이유: UI는 phase 48.
- 테스트를 구현에 맞추지 마라.
