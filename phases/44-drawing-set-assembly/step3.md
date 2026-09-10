# Step 3: 突合 — `assessPageRoles`·`assembleDrawingSet`

## 배경

ADR-046 6.1·6.2. 여러 PDF의 여러 면에 세 파서를 돌리고(결과를 버리지 않는다), 사용자의 세트 구성원 선택
(`membership`)에 따라 면과 면을 대조해 `DrawingSetCandidate` 하나를 낸다. 파서는 개선하지 않고, 강등도 없고,
軸組図 축 대조도 이 phase에서 하지 않는다(파서가 수평 축을 내지 않는다). 기대값은 세트 골든 2판
`tests/fixtures/drawing-set/expected/{yokohama,hirosaki,ina,kani,tsu}.json`이며, 파서 한계로 골든과 달라지는
경로는 골든의 `knownGaps`에 있다(step 0이 stale 아님을 검증했다).

## 읽어야 할 파일

- `docs/ADR.md` ADR-046, 세트 골든 다섯, `phases/44-drawing-set-assembly/step0-report.json`(`planned_symbols`).
- `src/lib/import/story-label.ts`(`storyKey`·`storyLabelFromTitle`·`levelStoryKey`·`storyNameKey`), `src/lib/import/runs.ts`(`compact`).
- `src/lib/import/framing-plan/{types,parse,elevation,apply}.ts`(특히 `applyElevation`이 Story 이름을 만드는 방식),
  `src/lib/import/section-list/{types,parse}.ts`, `src/components/plan/PlanImport.tsx`의 `automaticSelections`.
- `tests/plan-import/key-coverage.test.ts`(골든 키 청구 대장의 선례), `tests/plan-import/corpus2-elevation.test.ts`(`elevationForTitle`의 제목 비교 관례).

## 할 일

새 모듈 `src/lib/import/drawing-set/`(순수 TS. React·DOM·three.js·Next.js import 금지).

### 1. `types.ts`
```ts
export type PageRole = '断面リスト' | '伏図' | '軸組図'
export const PAGE_ROLES = ['断面リスト', '伏図', '軸組図'] as const          // roles 배열은 이 순서의 부분열
export interface DrawingSetPage { source: string; pageNumber: number; page: TextPage }
export interface PageOutputs { lists: ParsedSectionList[]; plan: ParsedFramingPlan; elevations: ParsedFrameElevations }
export interface PageAssessment {
  source: string; pageNumber: number
  roles: PageRole[]                       // 기술만: lists>0 / blocks>0 / elevations>0
  lists: ParsedSectionList[]
  blocks: PlanBlock[]                     // 파서 순서 그대로
  grids: PlanGridCandidate[]              // plan.grids 보존 — 진단용, 투표자가 아니다 (A4)
  elevations: ElevationCandidate[]
  issues: { plan: PlanGridIssue[]; elevation: ElevationIssue[] }
}
export interface Evidence { source: string; pageNumber: number }
export interface SeriesRef { source: string; pageNumber: number; index: number }   // ElevationCandidate 지목
export interface BlockRef  { source: string; pageNumber: number; index: number }   // PlanBlock 지목
export interface DrawingSetMembership {
  excludedPages: Evidence[]               // 기본 빈 배열 = 전부 포함
  excludedBlocks: BlockRef[]
}
export const SET_CONFLICTS = ['通り芯不一致', '階高不一致', '階未収録レベル', '階重複ブロック'] as const
export type SetConflict = (typeof SET_CONFLICTS)[number]
export type Conflict =
  | { code: '通り芯不一致'; blocking: true;  evidence: Evidence[]; payload: { blocks: BlockRef[] } }
  | { code: '階高不一致';   blocking: false; evidence: Evidence[]; payload: { reference: SeriesRef; series: SeriesRef; levelA: string; levelB: string; referenceMm: number; seriesMm: number } }
  | { code: '階未収録レベル'; blocking: false; evidence: Evidence[]; payload: { series: SeriesRef; level: string } }
  | { code: '階重複ブロック'; blocking: true; evidence: Evidence[]; payload: { levelIndex: number; storyName: string; blocks: BlockRef[] } }
export interface SetGridClaim { xLabels: string[]; xSpansMm: number[]; yLabels: string[]; ySpansMm: number[]; evidence: Evidence[] }
export interface SetStoriesClaim { reference: SeriesRef; candidate: ElevationCandidate; levels: string[]; heightsMm: number[]; evidence: Evidence[] }
export interface BlockAssignment { ref: BlockRef; block: PlanBlock; evidence: Evidence[]; levelIndex?: number; storyName?: string; storyKey?: string }
export interface DrawingSetCandidate {
  pages: PageAssessment[]
  membership: DrawingSetMembership
  referenceChoices: SeriesRef[]           // 基準으로 고를 수 있는 후보(라벨 レベル 2개 이상), 기본 順
  grid: SetGridClaim | null
  stories: SetStoriesClaim | null
  blocks: BlockAssignment[]               // 포함된 블록 전부, 면·블록 순
  conflicts: Conflict[]
}
```

### 2. `roles.ts`
- `runPageParsers(page: TextPage): PageOutputs` — 세 파서 호출만.
- `assessPageRoles(page: DrawingSetPage, outputs: PageOutputs): PageAssessment` — 기술만. 제목 유무·면 이름은 쓰지 않는다.

### 3. `reconcile.ts`
- `assembleDrawingSet(pages: DrawingSetPage[], membership: DrawingSetMembership, reference?: SeriesRef): DrawingSetCandidate`
  내부는 **파싱된 평가 결과를 받는 순수 핵심** `reconcileAssessments(assessments: PageAssessment[], membership, reference?)`로
  두고 `assembleDrawingSet`은 파서를 돌려 그것을 부른다(D6 — 교란 테스트가 핵심에 직접 후보를 넣는다).
- **通り芯**: 포함된 伏図 블록들(제외 면·제외 블록 제거)의 `xGrid`·`yGrid`가 라벨 배열＋`spansMm`(양 축)로 전부 같아야 `grid`.
  `scalePtPerMm`·`totalConfirmed`·`positionPt`는 비교하지 않는다. 다르면 `通り芯不一致`{blocks: 다수파와 다른 블록 전부; 다수가
  없으면 전부}, `grid: null`. `pages[].grids`는 투표하지 않는다.
- **階(基準系列)**: `referenceChoices`＝포함된 면의 계열 중 라벨 있는 レベル 2개 이상인 것, 순서는 「라벨 있는 レベル 수 내림차순,
  동수면 면 순·index 순」. `reference` 인자가 없으면 첫 항목, 없으면 `stories: null`. `levels[i]`＝`labels.join('／')`.
  `referenceChoices`의 동수 순서는 **파서 후보 순**(`elevations[]` index)이다.
  다른 포함 계열마다 **レベル 대응**: 라벨 L(NFKC·공백 제거)은 **基準에서 정확히 한 レベル**이 갖고 **상대 계열에서도 정확히 한 レベル**이 가질 때만 대응에 쓴다(양 계열 유일성). 상대 レベル의 대응 라벨들이 모두 같은 基準 レベル을 가리키면 그 쌍이 대응이고, 서로 다른 基準 レベル을 가리키거나(alias 충돌) 쓸 수 있는 라벨이 없으면 대응 없음. 대응된 인접 쌍 사이 `heightsMm` 누적합을 비교, 다르면 `階高不一致`(정보) — payload의 `levelA`·`levelB`는 그 인접 쌍의 **基準 쪽 Story 이름**(`labels.join('／')`, 위가 A·아래가 B)이고 계열 쪽 라벨은 적지 않는다(`series`가 계열을 가리키고 대응은 라벨 일치로 재현된다). 대응이 없는 라벨 있는 レベル(공유 라벨 0, 어느 쪽에서든 중복인 라벨뿐, alias 충돌)은 `階未収録レベル`(정보).
- **블록 → Story**: 전 구간(top＝0, bottom＝마지막) 기준 미래 Story 이름은 `applyElevation`의 규칙(바닥 レベル들, `labels.join('／')`,
  라벨 없으면 번호)으로 만든다 — **그 함수를 호출해** 얻어라(같은 규칙을 다시 쓰지 않는다). 미래 Story의 식별자는 **基準 レベル index**(`stories.levels`의 index — 그 Story의 바닥 レベル)이고 이름은 표시용이다(동명 Story `[2FL,1FL,1FL]`이 실재한다). `storyLabelFromTitle(title)`→`storyKey`가
  Story 이름의 `storyNameKey`와 **정확히 하나** 같을 때 `BlockAssignment.levelIndex`＋`storyName`. 키 없음·다수 일치는 미대응(둘 다 없음 — 이것이 골든 사영의 `unmatchedBlocks`이며 충돌이 아니다).
  같은 `levelIndex`에 블록 둘 이상이면 `階重複ブロック`(blocking; 전 구간 기준의 초기 판정 — 계획 단계가 선택 구간으로 다시 판정한다).
- 모든 claim에 `evidence: Evidence[]`. 계층은 값을 만들지 않는다.

### 4. 테스트 `tests/drawing-set/assemble.test.ts` — 골든 2판 3단 단언
- 다섯 세트 각각 골든 `pages[]`의 fixture를 `DrawingSetPage`로 읽어(전부 포함, 基準은 기본) 돌리고, 결과를 골든 형태로 **사영**한다
  (`grid`·`stories`·`storiesReference`·`blockToStory`·`unmatchedBlocks`·`conflicts`(`note` 제외)·`pages[].{roles,listKinds,blockTitles}`).
  사영은 다음만 한다 — 재배열·필터 없음.
  - **참조 변환**(제품 참조 → 골든 표현): `SeriesRef{source,pageNumber,index}` → `{fixture, titles}`(그 `source`·`pageNumber`에 해당하는 골든 `pages[].fixture` ＋ 그 후보의 `titles`); `BlockRef{source,pageNumber,index}` → `{fixture, blockTitle?}`(블록 `title`이 없으면 `blockTitle` 생략). 테스트는 `DrawingSetPage.source`·`pageNumber`를 골든 `pages[].source`·`pageNumber`로 만든다.
  - **이름**: `stories.reference` → `storiesReference`; `blocks[]` 중 `levelIndex`가 있는 것 → `blockToStory[] = {fixture, blockTitle?, storyName}`(이름만, index는 사영에 넣지 않는다), 없는 것 → `unmatchedBlocks[] = {fixture, blockTitle?}`.
  - **충돌**: `conflicts[] = {code, blocking, evidence: [{source, pageNumber}], payload}` — payload 안의 참조는 위 변환을 거친다(通り芯不一致 `{blocks}` / 階高不一致 `{reference, series, levelA, levelB, referenceMm, seriesMm}` / 階未収録レベル `{series, level}` / 階重複ブロック `{storyName, blocks}` — `levelIndex`는 사영에서 뺀다). 골든의 `note`는 비교에서 뺀다.
  - **제외하는 제품 전용 필드**: `stories.candidate`, `grid`·`stories`·`blocks[]`의 `evidence`, `referenceChoices`, `membership`, `pages[].grids`·`lists`·`blocks`·`elevations`·`issues`, `blocks[].storyKey`·`levelIndex`·`block`. 충돌의 `evidence`는 남긴다. 제목 비교(`pages[].blockTitles`·`storiesReference.titles`·`conflicts[].payload.{reference,series}.titles`·`conflicts[].payload.blocks[].blockTitle`·`blockToStory[]`/`unmatchedBlocks[]`의 `blockTitle` 전부)는 양쪽 모두 NFKC → 공백 제거 → 끝의 축척 토큰(`S=1/\d+` 또는 `1/\d+`) 1개 제거 → 동일(**대칭** — 파서가 축척을 떨어뜨리는 경우와 골든이 원문 축척을 전사한 경우 둘 다 덮는다; 골든 값은 원문 전사 그대로). `listKinds`·`blockTitles`는 파서 출력 순서.
- `storiesReference` 해석: 골든이 `null`이거나 그 경로가 `knownGaps`에 `missing`으로 등록돼 있으면 해석 단계를 **건너뛴다**(그때 출력 `stories`는 `null`이어야 하고 그것은 `stories` 간극으로 등록돼 있다 — kani). 아니면 그 fixture 면의 후보 중 정규화(위 제목 비교 규약) 후 **골든 `titles`를 모두 포함하는** 후보가 정확히 하나여야 하고(배열 전체 동치가 아니다 — hirosaki의 추가 제목 허용), 그것이 결과의 `stories.reference`와 같아야 한다. index만으로 맞추지 않는다.
- `knownGaps[].direction`: `direction`은 `missing`|`extra`|`both`. 「주장」은 골든/사영 출력 JSON의 **원시값 리프 경로**(예 `stories.levels[3]`)이고 배열은 **index로** 대응한다(재배열·집합 비교 없음). knownGaps의 `path`는 그 **하위 트리 전체**를 덮으며, 한 경로에 항목은 하나다(방향 둘이면 `both`). 같은 경로의 원시값이 다르거나 배열 앞쪽에 요소가 끼어 index가 밀리면 `both`, 배열 뒤에만 더 있으면 `extra`, 뒤쪽만 빠지면 `missing`, 골든 값이 있는데 출력이 `null`·부재면 `missing`(반대면 `extra`).
  단언 ① 사영 출력의 모든 리프가 골든에 같은 경로·같은 값으로 있다. `extra`·`both` 경로의 하위 트리는 건너뛴다.
  ② 골든의 모든 리프가 출력에 같은 경로·같은 값으로 있다. `missing`·`both`(와 `unsure`) 경로의 하위 트리는 건너뛴다.
  ③ stale 금지: `missing`이면 그 경로 아래 골든 리프 중 출력에 없거나 값이 다른 것이 1개 이상, `extra`면 출력 리프 중 골든에 없거나 값이 다른 것이 1개 이상, `both`면 둘 다. 아니면 실패.
  `frameCount`는 파서 계열 수와 같다고 주장하지 않으므로 비교하지 않는다(`elevations.length`는 `pages[]` 사영에 넣지 않는다).
- **청구 대장**: `tests/drawing-set/claims.ts`에 골든 키 경로별 `CLAIMED: [{path, test}]`·`REFERENCE_ONLY: [{path, reason}]`를 두고
  (`key-coverage.test.ts` 선례) 골든의 모든 키 경로가 둘 중 하나에 있음을 테스트로 고정한다. `grid`·`stories`·`blockToStory`·
  `conflicts`가 전부 REFERENCE_ONLY인 세트가 있으면 그것은 실패다(핵심 결과가 전부 참고면 기능 완료가 아니다).
- **교란 테스트(D6)** — `reconcileAssessments`에 **평가 결과를 직접 넣어**: 한 블록의 `spansMm[0]`을 바꾸면 `通り芯不一致`이고 그 블록이
  payload에; 基準 아닌 계열의 공통 구간 `heightsMm` 하나를 바꾸면 `階高不一致`이고 payload의 `referenceMm`·`seriesMm`가 바뀐 값;
  계열에 基準과 공유 라벨이 없는 レベル을 넣으면 `階未収録レベル`, 基準의 두 レベル이 같은 라벨을 갖게 만들면 그 대응이 `階未収録レベル`로 떨어짐, 상대 계열 쪽 중복(`[2FL,1FL,1FL,GL]`)도 같은 코드(양 계열 유일성), 한 レベル의 두 alias가 서로 다른 基準 レベル을 가리키면 `階未収録レベル`; 블록 제목의 階 토큰을 바꾸면 미대응; 같은 階 제목의 블록을 복제하면
  `階重複ブロック`; `membership.excludedBlocks`로 불일치 블록을 빼면 `通り芯不一致`가 사라지고 `grid`가 선다.
  raw `TextPage` 교란은 하지 마라 — 파서가 후보를 거절해 다른 이유로 실패한다.

## 하지 말 것

- 골든과 어긋나면 골든·테스트·사영을 맞추지 마라. 이유: ADR-010. `blocked`로 멈추고 세트·경로·기대·실측을 적어라.
  `knownGaps`에 항목을 **추가하지도 마라** — 골든은 사람의 것이다.
- 파서를 바꾸지 마라. 이유: 6.1 — 이 phase는 현재 파서 위의 조립이다.
- 軸組図 축 대조·강등·층별 通り芯·`sectionStoryLabel` 제안을 만들지 마라. 이유: 6.1에서 삭제·유보.
- 레벨명·Story 이름을 만들지 마라 — `applyElevation`에서 얻어라. 이유: 규칙 중복은 어긋난다.
- `src/domain/`·`PlanImport.tsx` 불변. 규준 수치 리터럴 무관. `scripts/execute.py` 실행·하네스 kill 금지.

## AC

- `npx vitest run tests/drawing-set`가 0. `npx vitest run`·`npm run lint`·`npx tsc --noEmit`이 0.
- `step3-report.json`: `baseline_commit`, `sets: [{set, grid, stories, reference, conflicts, known_gaps_confirmed: n, unsure_excluded: [...]}]`,
  `claims_ledger: {claimed: n, reference_only: n}`, `perturbations: [{kind, mutated, expected, observed}]`,
  `baseline_status`·`changed_paths` — 스텝 시작 시 ① `git status --porcelain --untracked-files=all`을 `baseline_status`에, ② 그 목록의 **모든 dirty·미추적 파일의 sha256**을 `baseline_hashes`에 기록한다. 스텝 종료 시 「이 스텝이 바꾼 경로」＝새로 dirty/미추적이 된 경로 ∪ `baseline_hashes`와 hash가 다른 경로로 정의하고(status 문자만 같다고 제외하지 않는다 — ` M`인 채 내용이 바뀐 파일도 잡힌다), 허용집합 검사는 그 집합에만 적용한다. 시작 시 이미 있었고 내용도 그대로인 변경·미추적 파일은 이 스텝의 잔재가 아니다. 검증·계측 중 변조한 파일은 변조 전·후 sha256을 기록해 같음을 단언한다. 하네스 파일(`index.json`·`step*-invoke.json`·`step*-codex.*.log`)은 제외한다. baseline과의 차이가 `src/lib/import/drawing-set/`·`tests/drawing-set/`·`phases/` 밖에 없다.

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지.
