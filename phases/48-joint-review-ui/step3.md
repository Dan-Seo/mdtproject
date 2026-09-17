# Step 3: review-tabs-joint-xray — ReviewTabs·`useReviewModel`·「検討」 탭의 (a) 接合部 (b) Calculation X-Ray

README 공통 결정(특히 4·7·8)을 먼저 읽어라. (c) 形状検査는 step 4, (d) 検討項目은 step 5, (e) 비교는 step 6, 作業 탭은 step 7이다 — 여기서 만들지 마라.

## 읽어야 할 파일
- `src/components/quantity/TakeoffPane.tsx` — `TakeoffPane`·`TakeoffActions`, `SourceChips`·`ConfidenceWarning`·`formatLength`(각각 :161·:185·:49 부근, **export 필요** — 동작 불변), 행 `data-testid` 규약
- `src/components/AppShell.tsx`, `src/app/page.tsx`(페인 조립), `src/components/plan/PlanEditor.tsx`의 `StoryTabs`(페인-로컬 탭 선례)
- `src/lib/rule-source.ts`
- 코어: `src/lib/review/xray.ts`, `src/domain/review/{types,state,joint,fingerprint,impact}.ts`, `src/lib/hooks/useTakeoff.ts`(`TakeoffResult{rebars, lines, unsupportedMembers: UnsupportedMember[]}` — **`TakeoffSnapshot`이 아니다**), `src/lib/review/geometry-check.ts`(`GEOMETRY_CHECK_VERSION`), `src/rulepack/index.ts`(`jpMlitRulePack`)
- `docs/UX.md` §3.2(깊이 3층·한 번에 하나만 펼침)·§5(막힘은 페인 안에서)·§3.5(키보드)
- 테스트 스타일: `src/components/quantity/TakeoffPane.test.tsx`

## 만들 것

### 1. 탭 `src/components/review/ReviewTabs.tsx`
`role="tablist"` `aria-label="内訳書切替"`에 「内訳書｜検討｜作業」 셋(StoryTabs·ViewerTabs 스타일). 값은 store `takeoffTab`. 「作業」 본문은 step 7이 만든다 — 이 step에서는 빈 `<section data-testid="work-packages">`(문구 「作業パッケージは未実装」).
`src/app/page.tsx`: 탭에 따라 `TakeoffPane` / `ReviewPane` / 작업 섹션. 기존 `TakeoffActions`(xlsx 등)는 그대로 옆에.

### 2. `src/lib/hooks/useReviewModel.ts`
```ts
export function toSnapshot(project: Project, takeoff: TakeoffResult, fingerprints: ReviewFingerprints): TakeoffSnapshot
// = { project, rebars: takeoff.rebars, lines: takeoff.lines, unsupportedMemberIds: new Set(takeoff.unsupportedMembers.map(m => m.memberId)), fingerprints }
export function useReviewModel(): { current: CurrentModel; currentSnapshot: TakeoffSnapshot; baselineSnapshot: TakeoffSnapshot | null }
```
- `checkConditions = checkConditionsFingerprint(review.settings, review.exclusions)`.
- `currentFingerprints = projectFingerprints(project, rebars, unsupportedMemberIds, jpMlitRulePack, GEOMETRY_CHECK_VERSION, checkConditions)` — `useMemo`(project·takeoff·settings·exclusions 의존).
- `baselineSnapshot = baseline ? toSnapshot(baseline.project, buildTakeoff(baseline.project), baseline.fingerprints) : null` — fingerprints는 **저장된** `baseline.fingerprints`(재계산값이 아님 — 룰팩·검사版 변경 검출을 위해). `useMemo`(baseline 의존).
- `impact = baselineSnapshot ? assessImpact(baselineSnapshot, currentSnapshot) : null` — `useMemo`.
- `current: CurrentModel = { project, fingerprints: currentFingerprints, impact }`.
- 이 훅은 `ReviewPane`·(step 7) `WorkPackageBoard`만 부른다. `TakeoffPane`은 부르지 않는다.

### 3. `src/components/review/ReviewPane.tsx` — 각 절은 `<section aria-labelledby>`.
**(a) 接合部** `data-testid="review-joint"`: `resolveJoint(project, sel.memberId)`. joint면 柱 符号·階, 大梁 목록(符号·始端/終端), reference 목록(라벨 「参考表示（検討対象外）」), 버튼 「接合部を3Dで見る」(`setViewerMode('joint')`). unsupported면 사유(`viewer.joint.unsupported.*` 재사용)와 「柱を選択してください」.
**(b) Calculation X-Ray** `data-testid="review-xray"`: 대상 행 = `hoverRowId`. 없으면 「内訳書の行か3Dの鉄筋を選ぶ」. 있으면 `xrayForRow(rowId, rebars, project, lines)` 결과를 부재별 카드로:
   - 표 「設計（数量積算基準）」 vs 「形状（3D）」 두 열: 長さ(`designLengthMm` / `drawnLengthMm`), 本数(`designCount` / `placedCount`＋`positionCount`), 차이가 있으면 `differsFromDesign` 셀에 「一致しない（数量には用いない）」. **같은 숫자로 합치지 않는다.** `shape.drawn === false`면 形状 열에 `reason`.
   - `formula` `<pre>`(내역서와 같은 표시).
   - 룰 표: `rules[]` 각각 `sourceLabel` 링크(`SourceChips` 재사용)·`usedFor`·조건(`conditions`를 `key=value` 나열)·confidence 표시(`ConfidenceWarning`·△▲ 규약). 행 끝 버튼 「この根拠を使う鉄筋」 → `rebarsUsingRule(rule, 접합부 철근 ∪ 없으면 전 철근)` 목록(부재·役割)을 펼치고, 각 항목 클릭 → `setHoverRow(그 철근의 rowId)`. **같은 키·다른 조건은 다른 행.**
   - zones: 定着 구간 `fromMm–toMm`(길이)＋룰.
- 이 step의 `ReviewPane`은 (a)·(b)만 그린다. 다음 step들이 절을 추가한다.

### 4. i18n 키: `review.*` ja·ko. 도메인 용어는 일본어 그대로. 리터럴은 원어.

## 테스트 (먼저) — `src/components/review/ReviewPane.test.tsx`, `src/components/review/ReviewTabs.test.tsx`, `src/lib/hooks/useReviewModel.test.ts`
- ReviewTabs: 탭 3개; 内訳書 탭에서 `ReviewPane` 미마운트(`ReviewPane`을 목으로 바꿔 렌더 카운트 0); 検討 탭에서 1.
- 柱 `1F-X2Y1` 선택 시 (a)에 大梁 **2개**(`G1 終端`·`G2 始端`)·参考 표시; 大梁 선택 시 사유 문구와 「柱を選択してください」.
- `hoverRowId`를 柱 主筋 행으로 세우면 X-Ray에 設計 길이와 形状 길이가 **다른 셀**에 있고 값이 `xrayForRow` 결과와 같다(`formatLength` 적용값), 「一致しない」; 룰 표에 `anchorage.L1`·`lap.L1`·`cover.minimum` 링크와 조건; 「この根拠を使う鉄筋」이 같은 조건 철근만 나열하고 클릭이 `setHoverRow`를 부른다.
- `useReviewModel`(renderHook): baseline 없으면 `impact === null`; `toSnapshot`의 `unsupportedMemberIds`가 `unsupportedMembers`의 id 집합과 같다(未対応 부재 하나를 넣은 案件으로); baseline을 넣으면 `impact.members`가 코어 `assessImpact(baselineSnapshot, currentSnapshot)`와 `toEqual`; `baselineSnapshot.fingerprints`가 재계산값이 아니라 저장된 `baseline.fingerprints` 참조(rulepack 값을 바꿔 넣고 `impact.rulepackChanged === true` 확인); `checkConditions`는 `review.settings.clearance.valueMm` 변경에 `current.fingerprints.checkConditions`가 바뀐다.
- `capture` 목이 새 이벤트 이름으로 불리지 않는다.

## Acceptance Criteria
```bash
npx vitest run src/components/review src/components/quantity src/lib/hooks
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step3-report.json`: `{ "changed_files", "tests_added", "mutations": [①X-Ray가 設計·形状을 한 셀로 합침 ②baseline fingerprints를 재계산값으로 ③内訳書 탭에서도 ReviewPane 마운트 — 각각 어느 테스트가 실패했는지], "i18n_keys_added": n, "paths_verified": ["src/components/review/ReviewPane.tsx", "src/components/review/ReviewTabs.tsx", "src/lib/hooks/useReviewModel.ts", "src/components/review/ReviewPane.test.tsx", "src/lib/hooks/useReviewModel.test.ts"] }`

## 금지사항
- 화면에서 규준 계산·의존 판정·검사 판정을 다시 쓰지 마라(README 결정 2).
- 3D 개수·형상 길이를 数量처럼 표시하거나 内訳書에 흘리지 마라.
- 새 페이지·모달 위저드·전역 배너 금지(UX.md §5·§9). 새 `capture()` 금지.
- `TakeoffPane`의 기존 DOM·`data-testid`를 바꾸지 마라(uc1~uc8 회귀). export 추가만.
- 일본어 리터럴 이스케이프 금지.
