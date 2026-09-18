# Phase 49 — joint review defects

phase 48(PR #77)의 리뷰에서 나온 결함 6건을 닫는다. 구현 스텝 앞에 **반증 게이트**(step 0)가
있다: 주장이 실제로 성립하는지 먼저 판정하고, 하나라도 성립하지 않으면 `refuted`로 멈춘다.
이 결함들은 phase 48을 만든 쪽이 아니라 검증 쪽이 보고한 것이므로, 판정도 만든 쪽이 하지 않는다.

- step 0 — 결함 주장 6건 반증 (verify, gate)
- step 1 — `openDraft`의 접합부 타깃을 부재 종류로 판정 (**유일한 제품 변경**)
- step 2 — `staleNotice` 렌더 경로 커버리지
- step 3 — 작업묶음 테스트의 연결 경로·단언 강도
- step 4 — uc25의 리터럴 체크·진단 게이트·`schemaVersion` 비교, 그리고 카메라 오라클의 C7 구멍

C1~C6은 Antigravity CLI의 독립 반증에서 전부 `HOLDS`로 확인됐다. 같은 반증이 phase 48에서 새로
넣은 카메라 오라클을 `REFUTED`로 판정했고, 그중 **소리 없이 통과하는** 구멍 하나를 C7로 받아
step 0에서 판정하고 step 4에서 닫는다 — `fingerprintAfter`에 「장님 아님」 가드가 없어 드래그가
접합부를 화면 밖으로 돌리면 다섯 점이 전부 `hidden`이 되고 그것이 「달라졌다」로 통과한다.

근거: `phases/48-joint-review-ui/step8-report.json`,
`phases/48-joint-review-ui/step8-cross-verification-antigravity.md`, PR #77 본문.
