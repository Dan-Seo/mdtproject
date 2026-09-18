# Step 0 — 결함 주장 반증 (verify, gate)

**이 스텝은 고치는 스텝이 아니다.** phase 48 리뷰에서 보고된 결함 주장 6건이 실제로 성립하는지만
판정한다. 하나라도 성립하지 않으면 `refuted`로 끝내고 무엇이 어긋났는지 적는다. 게이트이므로
`refuted`면 뒤 스텝은 실행되지 않는다.

주장의 출처는 `phases/48-joint-review-ui/step8-report.json`과 PR #77 본문이다.
C1~C6 여섯 건은 Antigravity CLI의 독립 반증에서 **전부 `HOLDS`로 확인**됐다
(`phases/48-joint-review-ui/step8-cross-verification-antigravity.md`의 Claim 4). 그 판정도
검증자 한 명의 말이므로 이 스텝이 다시 본다 — 다만 「성립한다」쪽으로 기울어 읽지 말 것.

## 판정 대상

각 항목마다 **틀렸을 때 실패하는 관찰**을 만들어 확인한다. 「코드를 읽어보니 그렇다」는 판정이
아니다. 실행 가능한 재현이어야 한다.

### C1 (제품) — `openDraft`가 부재 종류와 무관하게 접합부 타깃을 만든다
`src/components/review/ReviewPane.tsx`의 `openDraft`가 선택 부재의 종류를 보지 않고
`{ kind: 'joint', columnMemberId }`를 넣는다. 大梁·원형 柱·최상층 柱를 선택한 상태에서 만든
검토항목이 `src/domain/review/joint.ts`의 `unsupported`와 `src/domain/review/validity.ts`의
`対象なし`를 거쳐 **영구적으로 `再検討必要`이고 `確認済`에 도달할 수 없는지** 확인한다.

판정 방법: 위 세 경우 각각에 대해 「항목을 만들고 확인 조작을 모두 수행해도 `確認済`가 되지
않는다」를 보이는 테스트를 쓴다. 통과하면 주장 성립. 셋 중 하나라도 `確認済`에 도달하면 그 경우는
반증이다.

### C2 (테스트) — `review.items.staleNotice`에 테스트 참조가 0건
소스와 `src/locales/ja.json`·`ko.json` 외에 참조가 없는지 확인한다. 단순 grep 0건이 아니라,
**그 문구를 렌더하는 경로가 어떤 테스트로도 실행되지 않는다**는 것을 보여야 한다.

### C3 (테스트) — `WorkPackageBoard.test.tsx`가 체크리스트↔검토항목 연결 `<select>`를 조작하지 않는다
`reviewItemIds`가 픽스처에서 직접 주입되고 UI 조작 경로가 테스트되지 않는지 확인한다.
판정 방법: 그 `<select>`의 change 핸들러를 고장내도 기존 테스트가 전부 통과하면 주장 성립.

### C4 (테스트) — 항진명제와 부분일치 단언
`WorkPackageBoard.test.tsx`에서 컴포넌트가 쓰는 것과 **같은** `packageReadiness` 호출 결과를
기대값으로 삼는 단언, 그리고 `準備完了`가 `準備完了（例外あり）`에 부분일치해 통과하는 단언.
판정 방법: 전자는 `packageReadiness`의 반환을 바꿔도 단언이 실패하지 않음을, 후자는 상태가
`準備完了（例外あり）`일 때도 통과함을 보인다.

### C5 (테스트) — uc25의 리터럴 `true` 체크 2건
`tests/e2e/uc25-joint-review.js`가 `checks.jointCanvas`와 `checks.findingFocus`를 관찰 없이
리터럴 `true`로 놓는다. 판정 방법: 그 지점에서 검사 대상이 없어도 체크가 여전히 true인지 본다.

### C6 (테스트) — 관찰만 하고 막지 않는 진단
같은 파일에서 페이지 에러 진단(`__uc25Diagnostics`)을 수집하지만 어떤 체크도 그것으로 실패하지
않는다. 또 `schemaVersion` 비교가 양변에 `?? null`이라 필드가 사라져도 통과한다.
판정 방법: 페이지 에러를 하나 주입해도 19체크가 전부 true인지, `schemaVersion` 필드를 지워도
비교가 통과하는지 본다.

## 보고

`phases/49-joint-review-defects/step0-report.json`에 항목별로
`{"claim":"C1","verdict":"holds|refuted","evidence":{...}}`를 쓴다. `evidence`는 실행한 명령과
관찰값이다. 인용한 경로는 `paths_verified`에 선언한다.

## 금지

- **고치지 마라.** 이 스텝에서 `src/`나 `tests/`의 동작을 바꾸는 편집을 하지 않는다.
  판정을 위해 만든 재현 테스트는 `phases/49-joint-review-defects/` 아래 임시 파일로 두거나,
  판정 후 되돌린다. 되돌린 사실을 report에 적는다.
- 「읽어보니 맞다」로 `holds` 판정을 내리지 마라.

## C7 — uc25 카메라 오라클의 구멍 (phase 48 검증에서 넘어온 것)

같은 반증이 `tests/e2e/uc25-joint-review.js`의 새 카메라 오라클(Claim 3)을 **REFUTED**로 판정했다.
구멍 네 가지는 `phases/48-joint-review-ui/step8-report.json#/desktop_host_run/repairs/1/known_holes`에
있다. 이 스텝에서는 그중 **소리 없이 통과하는 것** 하나만 판정한다:

> `fingerprintAfter`에는 「장님 아님」 가드가 없다. 드래그가 접합부를 화면 밖으로 돌리면 다섯 점이
> 전부 `hidden`이 되고, 그것이 `fingerprintBefore`와 다르므로 `cameraMoved`가 참이 된다 —
> 카메라가 허공을 보고 있는데 통과한다.

판정 방법: 드래그를 접합부가 화면에서 사라질 만큼 크게 준 상태에서 Scenario 7이 통과하는지 본다.
통과하면 주장 성립이고, step 4에서 닫는다.
