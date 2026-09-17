# Step 5: review-items — 「検討」 탭 (d) 検討項目: 생성·確認·保留·判断不可·再現·필터·고지

README 공통 결정(4·5·7)을 먼저 읽어라. step 3·4의 `ReviewPane.tsx`에 절을 **추가**한다(기존 절의 DOM·testid 불변).

## 읽어야 할 파일
- step 3·4 산출물(`ReviewPane.tsx`의 `onCreateItem`, `useReviewModel.ts`)
- 코어: `src/domain/review/types.ts` — `ReviewItem`(`finding?: RecordedFinding` — **생략이지 null이 아니다**)·`ReviewSnapshot`·`RecordedFinding`·`ElementRef`; `state.ts` — `addItem`·`updateItem`·`confirmItem`·`holdItem`·`newReviewId`; `validity.ts` — `itemValidity(item, current: CurrentModel): ReviewValidity`, **`effectiveItemStatus(item, validity: ReviewValidity)`**(두 번째 인자는 `CurrentModel`이 아니라 `itemValidity`의 결과), `itemsNeedingRecheck`, `itemTargetMemberIds`
- `src/lib/store.ts`(step 1 필드: `viewerPose`·`viewerClip`·`viewerLayers`·`requestViewerPose`·`setViewerClip`·**`toggleViewerLayer(layer)`**)

## 만들 것 — `ReviewPane.tsx` **(d) 検討項目** `data-testid="review-items"`
- 생성 폼(「検討項目を追加」 버튼 또는 step 4의 `onCreateItem(finding)`으로 열림): title(기본 finding 요약), body, targets(기본 `[{kind:'joint', columnMemberId}]`＋finding의 두 rebar ref), status 기본 `未確認`. 입력은 로컬 state, 「保存」에서만 `addItem`. 저장 시 `snapshot` ＝ `{ capturedAt, fingerprints: 대상 부재만(`itemTargetMemberIds`로 구해 `current.fingerprints.members`에서 추림; `rulepack`·`checkVersion`·`checkConditions` 포함), viewer: { mode: viewerMode, pose: viewerPose, clip: viewerClip, layers: viewerLayers, selection: { group: sel.group, memberId: sel.memberId, rowId: hoverRowId } } }`; `finding` ＝ RecordedFinding(측정값 복사). finding 없이 만들면 **필드를 생략**한다(null 금지 — `parseReviewState`가 거부한다).
- 목록: 항목 카드 — title, `validity = itemValidity(item, current)` → `effectiveItemStatus(item, validity)` 배지(`data-review-status`; 未確認·確認済·保留·判断不可·再検討必要 색 구분), `validity.state === '再検討必要'`면 `reasons` 목록(kind·memberId·detail — 「どの変更のせいか」), targets 칩(클릭 → `selectMember`), finding 요약(「記録時の測定値」 라벨 — 현재값이 아님을 명기).
- 버튼: 「再現」 → `setViewerMode(snapshot.viewer.mode)`, `setViewerClip(clip)`, layers를 snapshot과 같게(`toggleViewerLayer`를 다른 것만), `selectMember(selection.memberId)`, `setHoverRow(rowId)`, `requestViewerPose(pose)`. stale이면 카드에 「前のモデル時点の画面を再現 — 現在のモデルでは再検討が必要」. 「確認」 → by(라벨 「確認者（ローカル入力・本人認証ではない）」)·note 로컬 입력 → 「確認を保存」에서 `confirmItem` **＋ `updateItem`으로 `snapshot.fingerprints`를 현재값으로 갱신**(재확인 = 현재 모델에 대한 확인). 「保留」 → reason 필수(빈 값이면 폼 오류·저장 안 됨) → `holdItem`. 「判断不可」 → `updateItem`으로 status만.
- 필터 체크박스 「今回の変更で再検討が必要なものだけ」 → `itemsNeedingRecheck`.
- 고지(절 하단 상시, `data-review-notice`): 「確認済はチェックリストの充足を意味し、構造安全・法規適合・施工承認の判定ではない」.
- i18n ja·ko.

## 테스트 (먼저) — `src/components/review/ReviewPane.test.tsx`에 추가
- 「検査を実行」→ 干渉候補 행의 「検討項目にする」→「保存」 → `review.items[0].snapshot.fingerprints.members`의 키 집합 ＝ `itemTargetMemberIds(item, project)` 정확히(더도 덜도 아님); `finding.clearanceMm === -22`; `snapshot.viewer.clip`이 store `viewerClip`과 같다. 「検討項目を追加」로 finding 없이 저장 → `'finding' in review.items[1] === false`.
- 「確認」→by 입력→「確認を保存」 → status 確認済·confirmations 1·`snapshot.fingerprints.rulepack === current.fingerprints.rulepack`; by 비우면 저장 안 됨.
- 「保留」 무이유 → 저장 안 됨(폼 오류 표시, `review.items[0].status` 불변); 이유 있으면 保留.
- 断面 `C1.b` 800→900(`updateProject`) → 카드 배지 `再検討必要`(`data-review-status`)와 이유(入力変更·memberId `1F-X2Y1`); 배지 텍스트 ＝ 코어 `effectiveItemStatus(item, itemValidity(item, current))`(테스트가 직접 계산); 필터 체크 → 그 항목만 남는다. 대상이 `2F-X1Y1`뿐인 항목은 `未確認` 유지. 案件名·備考·`viewerClip`·`viewerPose` 변경 → 배지 불변.
- 「再現」 → `requestViewerPose`·`setViewerClip`·`selectMember`·`setHoverRow` 호출값이 snapshot과 같고, layers가 snapshot과 같아진다(하나를 미리 꺼 둔 상태에서), stale이면 stale 문구가 있다.
- **커밋 시점**: title·body·by·reason 타이핑 5회에 `setReview` 0, 「保存」에 1.
- `data-review-status` 요소 텍스트에 금지어 없음; `data-review-notice` 고지문이 절에 존재.
- 어떤 버튼도 `updateProject`(spy)를 부르지 않는다.

## Acceptance Criteria
```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step5-report.json`: `{ "changed_files", "tests_added", "mutations": [①확인 시 fingerprint 갱신 제거 ②snapshot.fingerprints에 전 부재 포함 ③保留 이유 검증 제거 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/components/review/ReviewPane.tsx", "src/components/review/ReviewPane.test.tsx"] }`

## 금지사항
- 유효성·상태를 화면에서 다시 판정하지 마라 — `itemValidity`·`effectiveItemStatus`·`itemsNeedingRecheck` 호출만.
- 「確認」이 `Project`를 건드리지 마라. 「合格」「安全」「承認」을 상태 문구에 쓰지 마라. 고지문을 빼지 마라.
- 키 입력마다 `setReview` 금지. 새 `capture()` 금지. 일본어 리터럴 이스케이프 금지.
