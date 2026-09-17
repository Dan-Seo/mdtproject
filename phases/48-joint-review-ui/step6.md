# Step 6: review-compare — 「検討」 탭 (e) 基準案 고정·비교

README 공통 결정(5·7·11)을 먼저 읽어라. step 3~5의 `ReviewPane.tsx`에 절을 **추가**한다.

## 읽어야 할 파일
- step 3 산출물 `useReviewModel.ts`(`current.impact`, `baselineSnapshot`)
- 코어: `src/domain/review/impact.ts`(`ImpactReport{entities, members, lines, rulepackChanged, checkVersionChanged, displayOnly}`·`MemberImpact`·`LineChange`), `state.ts`(`setBaseline`), `types.ts`(`Baseline`)
- 깊은 복사는 `JSON.parse(JSON.stringify(project))`로 충분(순수 JSON — CLAUDE.md)

## 만들 것 — `ReviewPane.tsx` **(e) 基準案と比較** `data-testid="review-compare"`
- 기준안 없음: label(로컬 입력)＋「現在案を基準案として固定」 → `setBaseline({ label, capturedAt, project: 깊은 복사, fingerprints: current.fingerprints })`.
- 기준안 있음: label·capturedAt, 「基準案を破棄」(한 줄 확인 문구 — 되돌릴 수 없음 명시 — 두 번째 클릭에서 `setBaseline(null)`). 비교는 `current.impact`를 표시:
  - 요약(`data-testid="review-compare-summary"`): 부재 영향 n·数量行 변경 n·表示のみ n·`rulepackChanged`면 「根拠（ルールパック）が変わった — 基準案の数量は現在のルールパックで再計算」·`checkVersionChanged`면 「検査版が変わった」.
  - 「変更内容」 목록: `entities`(kind·change·detail). `対応要確認`은 별색 배지와 「同じ要素と自動で確定していない」.
  - 「影響を受けた部材」 표: memberId(클릭→`selectMember`)·categories 칩·path 줄들(짧은 경로 그대로)·support before/after.
  - 「数量行の差分」 표: lineId(役割·符号·径로 풀어 표시)·fields·mass 전이(「単位質量未入力 → 算出」; kg null은 `—`, **0으로 쓰지 않는다**).
  - 「表示のみの変更」 접힘 목록.
- i18n ja·ko.

## 테스트 (먼저) — `src/components/review/ReviewPane.test.tsx`에 추가
- 고정 → `review.baseline.project`가 원본과 다른 참조이고 `toEqual`; 원본 `project`를 이후 `updateProject`로 바꿔도 `baseline.project` 불변.
- `C1.b` 변경 → 요약 부재 영향 n ＝ 코어 `assessImpact(baselineSnapshot, currentSnapshot).members.length`(테스트 직접 호출), 数量行 n ＝ `.lines.length`; 표에 支持柱 경로 문장이 있는 大梁 행, 数量行 차분 표에 柱 帯筋 행.
- 案件名만 변경 → 表示のみ 1·부재 0. `unitMass.D13` 입력 → mass 전이 문구, 셀에 「0」 없음. `review.baseline.fingerprints.rulepack`을 다른 값으로 주입 → 룰팩 문구.
- 「基準案を破棄」 두 번 클릭 → `review.baseline === null`; 한 번은 유지.
- **커밋 시점**: label 타이핑 5회에 `setReview` 0.
- 어떤 버튼도 `updateProject`(spy)를 부르지 않는다.

## Acceptance Criteria
```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step6-report.json`: `{ "changed_files", "tests_added", "mutations": [①기준안을 얕은 복사로 ②mass null을 0 표시 ③rulepackChanged 문구 제거 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/components/review/ReviewPane.tsx", "src/components/review/ReviewPane.test.tsx"] }`

## 금지사항
- 기준안 고정 시 `Project` 참조를 공유하지 마라(깊은 복사).
- 비교 화면의 어떤 버튼도 `updateProject`를 부르지 않는다(「基準案に戻す」 같은 기능 금지 — 요청에 없다).
- 영향·차분을 화면에서 다시 계산하지 마라 — `current.impact` 표시만.
- 키 입력마다 `setReview` 금지. 새 `capture()` 금지. 일본어 리터럴 이스케이프 금지.
