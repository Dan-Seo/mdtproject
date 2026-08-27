# Step 0: 검증 전용 스텝을 「게이트」로 쓸 수 있게 한다

대상은 `scripts/execute.py`의 스텝 루프다.

## 무슨 일이 일어났는가

2026-08-27 phase 28. `step 0`은 `kind: "verify"`였고 사양은 「전제가 하나라도
어긋나면 `refuted`로 끝내라」였다. codex는 전제 둘을 반증하고 `refuted`로 끝냈다.
그런데 하네스는 곧장 `step 1`(구현)로 넘어갔다 — `step1.md` 첫 줄이
「전제: step 0이 `completed`다. `refuted`면 진행하지 마라」인데도.

`_execute_single_step`이 `refuted`에 `True`를 돌려주고, `_execute_all_steps`는
그저 다음 `pending`을 집기 때문이다. 사람이 끊지 않았으면 **반증된 전제 위에서
구현이 나갔다.**

## 이것은 phase 13의 결정을 뒤집는 것이 아니다

`phases/13-harness-fixes/step1.md`는 「`refuted` 뒤에 `pending` 스텝이 있으면
계속 실행된다」(:53)와 「`_update_top_index`에 `refuted` 전파를 추가하지 마라 —
phase의 결과는 `completed`다」(:84)를 **의도적으로** 정했다. 그때의 검증 스텝은
phase 12 step 2처럼 **맨 뒤에 붙는** 것이었고, 뒤에 아무것도 없으니 「계속」이
해로울 일이 없었다. 그 전제는 지금도 맞다.

바뀐 것은 **쓰임새**다. phase 16 이후 검증 스텝은 `step 0`에 놓여 뒤 스텝의
전제를 세우는 **게이트**로 쓰인다. 두 쓰임새는 반증에 대한 요구가 반대다.
그러므로 동작을 갈아치우지 말고, **사양 작성자가 고르게** 하라 — `kind`가
그랬듯이. **기본값은 phase 13 그대로다.**

## 만들 것

### 새 선택 필드 `"gate": true`

phase의 `index.json` 스텝 항목에 **사양 작성자가** 단다. 하네스는 읽기만 한다.
`kind: "verify"`와 **함께일 때만** 유효하다.

1. **기동 시 검증** — `gate: true`인데 `kind`가 `"verify"`가 아닌 스텝이 하나라도
   있으면, 스텝을 하나도 돌리기 전에 명시적인 메시지와 함께 종료하라(`exit 1`).
   문구: `"gate": true는 kind "verify" 스텝에서만 유효하다 (step N)`.
   조용히 무시하지 마라 — 무시하면 게이트가 없는데 있다고 믿게 된다.
2. **게이트 반증** — `gate: true`인 스텝이 `refuted`로 끝나면:
   - 그 스텝 자체의 처리(`refuted_at` 스탬프·`summary` 보존·`_commit_step`·
     `⊘` 출력)는 **지금과 똑같다**. 건드리지 마라.
   - `_execute_all_steps`가 **거기서 멈춘다.** 남은 스텝은 `pending`인 채로 둔다.
     지우거나 `skipped`로 바꾸지 마라 — 사람이 사양을 고쳐 다시 돌릴 것이다.
   - 멈췄다는 것과 남은 스텝 번호를 한 줄로 출력하라.
   - `_finalize`가 top index에 **`refuted`**를 쓰고 `refuted_at`을 남긴다.
     phase 13이 금지한 것은 「반증했으니 phase가 실패」라는 전파였고, 그때는
     남은 일이 없었으므로 `completed`가 참이었다. 게이트 반증은 **스텝이 남아
     있는데 안 돈 것**이라 `completed`가 거짓이 된다. 이 좁은 경우에만 바꾼다.
   - phase `index.json`의 `completed_at` 스탬프는 지금처럼 찍어도 좋다 —
     하네스가 정상 종료했다는 뜻이다.
3. **게이트 없는 반증은 무변경** — `gate`가 없거나 `false`면 phase 13 그대로:
   다음 `pending` 스텝이 돌고, top index는 `completed`다.

## 작업 — TDD

`scripts/execute_test.py`에 테스트를 **먼저** 이어 쓰고 구현하라. 기존
`RefutedProtocolTests`의 방식(임시 root ＋ `git init` ＋ `FakeStepExecutor`)을 그대로 쓴다.

고정할 행동:

1. `gate: true`인 verify 스텝이 `refuted`면 — 뒤 `pending` 스텝의 invoke가
   **0회**이고, 그 스텝의 status가 `pending`으로 남는다
2. 같은 경우 `_finalize`가 top index를 **`refuted`**로 쓰고 `refuted_at`이 있다
3. `gate: true`인 verify 스텝이 `completed`면 뒤 스텝이 **정상으로 돈다**
   (게이트가 통과까지 막지 않는다)
4. `gate: true`인데 `kind`가 `verify`가 아니면 기동 시 `exit 1`이고 메시지에
   스텝 번호가 들어간다. **스텝은 한 번도 invoke되지 않는다**

### 뮤테이션 검증 (반증 가능성 증명)

구현 완료 후 아래를 하나씩 넣고, 각각 **어느 테스트가 실패하는지** 확인·기록하고
원복하라. 실패하는 테스트가 없으면 그 테스트는 반증 불가능한 것이니 다시 써라.

1. 게이트 반증에서 멈추지 않고 계속 돈다 → 테스트 1 실패
2. `_finalize`가 항상 `completed`를 쓴다 → 테스트 2 실패
3. `completed`일 때도 멈춘다 → 테스트 3 실패
4. 기동 시 검증을 뺀다 → 테스트 4 실패

## AC

1. `python scripts/execute_test.py`·`python scripts/test_execute.py` 전부 통과
2. **기존 테스트를 한 줄도 고치지 마라.** 특히
   `test_refuted_verify_allows_next_pending_step`과
   `test_finalize_marks_phase_completed_after_refuted`는 `gate` 필드가 없으므로
   **그대로 통과해야 한다.** 이 둘을 고쳐야 통과한다면 기본값을 바꾼 것이니
   `blocked`으로 멈추고 그렇게 보고하라.
3. 뮤테이션 4종이 각각 이름 붙은 테스트를 실패시켰다가 원복됨 — 보고서에 기록
4. `npm run lint`·`npm run test`·`npx tsc --noEmit` 통과

## 하지 말 것

- **`scripts/execute.py`를 실행하지 마라** — 재귀다 (AGENTS.md).
- 구현 스텝용 preamble 문구를 바꾸지 마라.
- `phases/28-shear-hook-shape/index.json`을 소급 수정하지 마라 — 반증이 역사다.
- `refuted` 스텝 자체의 처리(스탬프·커밋·summary)를 건드리지 마라.
- 남은 스텝을 `skipped` 같은 새 status로 바꾸지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.

## 산출물

`phases/29-harness-verify-gate/step0-report.json`: 추가한 테스트 이름,
뮤테이션 4종이 각각 실패시킨 테스트, 게이트 없는 경로가 무변경임을 무엇으로 보였는지.
