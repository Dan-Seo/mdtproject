# Step 4: review-check — 「検討」 탭 (c) 形状検査: あき 입력·除外·「検査を実行」·verdict·findings·3D 마커 연동

README 공통 결정(2·3·7·8)을 먼저 읽어라. step 3의 `ReviewPane.tsx`에 절을 **추가**한다(기존 절의 DOM·testid 불변).

## 읽어야 할 파일
- step 1~3 산출물(`joint-layout.ts`의 `jointLayout`·`segmentFor`, 스토어 `setReviewFocus`, `ReviewPane.tsx`, `useReviewModel.ts`)
- 코어: `src/lib/review/geometry-check.ts`(`runGeometryCheck`·`CheckInput`·`CheckVerdict`·`Finding`·`defaultExclusions`·`exclusionMatches`), `src/domain/review/state.ts`(`setClearance`·`addExclusion`·`removeExclusion`), `src/domain/review/types.ts`(`ClearanceSetting`·`Exclusion`)

## 만들 것 — `ReviewPane.tsx` **(c) 形状検査** `data-testid="review-check"`
- 입력: 「鉄筋のあき（利用者入力）」 숫자·범위(텍스트, 기본 「接合部の全鉄筋」)·메모 — **로컬 state**, blur/Enter에서 `setClearance`(`enteredAt`은 컴포넌트가 `new Date().toISOString()`). 비우면 null. 出典 표시 「出典: 利用者入力（規準値ではない）」 상시.
- 除外 목록: `review.exclusions`(비어 있으면 「既定の除外を追加」 버튼 → `defaultExclusions(now)` 삽입 — 자동 삽입 금지). 각 항목: 범위(roles·sameMemberOnly·memberIds)·이유·「削除」(`removeExclusion`). 추가 폼(roles 둘 선택·같은 부재만 체크·이유 필수, 「追加」 버튼에서 `addExclusion`).
- 「検査を実行」 → `runGeometryCheck({ project, rebars, unsupportedMemberIds, joint, settings: review.settings, exclusions: review.exclusions, fingerprints: current.fingerprints })`. 결과는 컴포넌트 state(저장 안 함 — 파생값). `checkId`를 `data-testid="review-check-id"`에 표시.
- 결과: verdict 세 줄(`clash`·`clearance`·`contact` 그대로, 각 줄 `data-review-verdict`), scope(부재 수·철근 수·세그먼트·`pairsTested`·`droppedOutsideRegion`·영역), `unchecked` 목록(what·reason·source) — **항상 verdict 바로 아래**, `assumptions` 목록, `toleranceMm`(라벨 「数値許容差（規準の許容差ではない）」).
- findings 표 `data-testid="review-findings"`: kind·a(部材/役割/径/#barIndex)·b·clearanceMm(소수 1자리)·basis·excludedBy(있으면 「除外: <reason>」 흐리게 — 표에서 빼지 않는다). 행 클릭 → `setReviewFocus({ point: finding의 최근접점 `pa`·`pb`의 중점, segments: [segmentFor(layout, finding.a), segmentFor(layout, finding.b)], label })`＋`setViewerMode('joint')`. `layout`은 `jointLayout(...)`을 `useMemo`.
- 행 버튼 「検討項目にする」 → `onCreateItem(finding)` prop(step 5가 연결; 이 step에서는 no-op).
- i18n ja·ko.

## 테스트 (먼저) — `src/components/review/ReviewPane.test.tsx`에 추가
- 「検査を実行」 → findings에 `干渉候補` 행(上端筋 G1×G2, `-22.0`), `data-review-verdict` 셋 존재, clearance 줄이 `判断不可（あき基準未入力）`, unchecked에 `継手位置`; 표의 행 수 ＝ 코어 `runGeometryCheck(...)`를 테스트가 직접 부른 `findings.length`.
- あき 입력 26 → blur → 재실행 → `あき不足候補` 행(`25.0`)과 「利用者入力」; `review.settings.clearance.valueMm === 26`·`source === '利用者入力'`.
- 「既定の除外を追加」 → `review.exclusions.length === 3`; 재실행 후 접촉 행에 「除外:」가 붙고 표 행 수는 줄지 않는다(`excludedBy` 유무와 무관하게 `findings.length`와 같다).
- 행 클릭 → `setReviewFocus`의 segments 둘 다 non-null, `point`가 finding의 `pa`·`pb` 중점과 `toBeCloseTo`, `viewerMode === 'joint'`.
- **커밋 시점**: `setReview` spy — あき 입력 타이핑 5회 동안 0, blur에 1; 메모·除外 이유도 같음.
- **자동 실행 없음**: `runGeometryCheck` spy — 마운트·断面 변경(`updateProject`)·あき blur 뒤에도 버튼을 누르기 전에는 0.
- `data-review-verdict` 텍스트에 「合格」「安全」「承認」「施工可能」「適合」 없음.

## Acceptance Criteria
```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step4-report.json`: `{ "changed_files", "tests_added", "mutations": [①あき 입력을 키 입력마다 setReview ②excludedBy 행을 표에서 제거 ③断面 변경 시 자동 재검사 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/components/review/ReviewPane.tsx", "src/components/review/ReviewPane.test.tsx"] }`

## 금지사항
- 검사·판정을 화면에서 다시 쓰지 마라 — `runGeometryCheck`·`defaultExclusions`·`jointLayout`·`segmentFor` 호출만. `capsuleClearanceMm` 직접 호출 금지.
- 검사를 편집마다 자동 실행하지 마라. 검사 결과를 `review`에 저장하지 마라(파생값).
- 키 입력마다 `setReview` 금지. 새 `capture()` 금지. 일본어 리터럴 이스케이프 금지.
