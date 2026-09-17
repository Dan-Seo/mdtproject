# Step 7: work-packages — 「作業」 탭: 작업 패키지·체크리스트·준비 상태

README 공통 결정(4·5·7·11)을 먼저 읽어라. step 3의 플레이스홀더 `<section data-testid="work-packages">`를 대체한다.

## 읽어야 할 파일
- step 3 산출물(`ReviewTabs.tsx`, `page.tsx`, `useReviewModel.ts`)
- 코어: `src/domain/review/readiness.ts`(`packageReadiness(pkg, items, current)` → `{ state, blockers, exceptions }`), `state.ts`(`addPackage`·`updatePackage`·`setChecklistStatus`), `types.ts`(`WorkPackage`·`ChecklistItem`·`ChecklistStatus`)

## 만들 것 — `src/components/review/WorkPackageBoard.tsx` `data-testid="work-packages"`
- 패키지 카드: name·assignee·dueDate·`packageReadiness(pkg, review.items, current)` 배지(`data-package-state`; `準備未完`/`準備完了`/`準備完了（例外あり）`)·blockers 목록(각 행 `data-blocker`; kind·detail)·exceptions 목록·대상 칩(클릭→selectMember)·부재 수. **kg·数量은 표시하지 않는다** — 카드 하단 한 줄 「作業パッケージは数量を持たない（部材は複数のパッケージに属しうる）」.
- 생성 폼(로컬 state, 「保存」에서 `addPackage`): name·assignee(「担当者（ローカル入力・本人認証ではない）」)·dueDate(`<input type="date">`)·targets: 「現在の選択を追加」(joint면 `{kind:'joint', columnMemberId}`, 그 외 `{kind:'member', memberId}`)·체크리스트 항목 추가(label·required)·항목에 検討項目 연결(`review.items` 셀렉트).
- 항목 상태 변경(`setChecklistStatus`): `未入力`→`未確認`→`確認済`(연결 検討項目 없으면 확인자 입력 필수 → `confirmation`), `保留`/`除外`는 reason 필수(빈 값이면 저장 안 됨).
- 고지(`data-review-notice`): 「準備完了は登録したチェックリストの充足であり、法的な施工承認や構造安全の判定ではない」.
- 준비 상태는 저장하지 않는다(파생) — 모델 변경 → 연결 항목 `再検討必要` → `準備未完`＋blocker `前モデルの検討が残っている`가 자동으로 보인다.
- i18n ja·ko.

## 테스트 (먼저) — `src/components/review/WorkPackageBoard.test.tsx`, `ReviewTabs.test.tsx` 갱신
- 생성→필수 항목 確認済(확인자 입력)→`data-package-state` 텍스트 `準備完了`; 배지 텍스트 ＝ 코어 `packageReadiness(pkg, items, current).state`(테스트 직접 호출).
- 연결 検討項目의 대상 柱 断面 변경 → `準備未完`＋`data-blocker`에 `前モデルの検討が残っている`.
- 保留 무이유 → 저장 안 됨; 保留 유이유 → `準備完了（例外あり）`; assignee 공백 → blocker `担当者未入力`.
- 카드 텍스트에 `kg`·`数量`·`%` 없음(고지 한 줄의 「数量を持たない」는 `data-review-notice`가 아니라 카드 footer이므로, 검사는 「数量」이 footer 문장 밖에 없음으로 — footer 요소를 제외한 텍스트에서).
- `data-package-state`·`data-blocker` 텍스트에 금지어 없음; 고지문 존재.
- **커밋 시점**: name·assignee·label·reason 타이핑 5회에 `setReview` 0.
- ReviewTabs: 内訳書 탭에서 `WorkPackageBoard` 미마운트; 作業 탭에서 마운트.
- 어떤 버튼도 `updateProject`(spy)를 부르지 않는다.

## Acceptance Criteria
```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step7-report.json`: `{ "changed_files", "tests_added", "mutations": [①blocker 前モデル 제거 ②準備 상태를 store에 저장 ③保留 이유 검증 제거 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/components/review/WorkPackageBoard.tsx", "src/components/review/WorkPackageBoard.test.tsx"] }`

## 금지사항
- 패키지에 数量·kg를 표시·합산하지 마라. 패키지 분할로 철근·数量을 바꾸지 마라. 퍼센트 금지.
- 준비 상태를 저장 필드로 두지 마라(파생). 화면에서 준비·유효성을 다시 판정하지 마라.
- 4D·BCF·スケジュール 연결용 필드·키를 만들지 마라(README 결정 11).
- 키 입력마다 `setReview` 금지. 새 `capture()` 금지. 일본어 리터럴 이스케이프 금지.
