# Step 3: 게이트 반증이 top index 를 갱신하지 않고 끝나는 경로를 닫는다

**전제**: step 2가 `completed`다.

## 관측된 사실 (2026-08-27 phase 30 step 0)

`gate: true`인 verify 스텝이 `refuted`로 끝났는데 **`phases/index.json`이
`pending` 그대로 남았다.** 확인된 것만 적는다 — 원인은 네가 진단하라.

- 스텝 커밋은 **났다**: `0510536 feat(30-rulepack-review-sheet): step 0 - verify ADR-041 premises`
  (`_commit_step`이 돌았다는 뜻이다).
- `chore(...): mark phase completed` 커밋은 **나지 않았다**.
- `git log -S`로 확인: `phases/index.json`이 phase 30에 대해 `refuted`로 커밋된
  적이 **한 번도 없다**.
- 하네스 프로세스는 **exit 127**로 끝났다. stdout은 스피너 [665s]에서 끊기고
  `⊘ Step 0 ... refuted`도 `⏹ Gate Step 0 refuted`도 **찍히지 않았다**.
- codex 쪽 stderr 마지막은 `apply_patch verification failed`(자기 검증 스크립트
  `verify-step0.py`를 고치다 실패)였다. codex는 그 전에 이미 index.json에
  `refuted`와 summary를 썼고 보고서도 남겼다.

**왜 문제인가**: 대장이 거짓말을 한다. phase는 실제로 반증으로 멈췄는데 top
index는 `pending`이라, 다음 사람이 「아직 안 돌린 phase」로 읽는다. 작업이
유실되지는 않지만(스텝 커밋이 살아 있다) 상태를 오독한다.

## 할 일

1. **재현하라.** codex를 실제로 부르지 말고, `gate: true` verify 스텝이
   `refuted`로 끝난 뒤 **codex 프로세스가 비정상 종료 코드를 남기는** 상황을
   테스트로 만들어라. 재현이 안 되면 **거기서 멈추고 `blocked`**로 끝내라 —
   못 고친 것을 고쳤다고 적지 마라.
   - `scripts/execute_test.py`의 `RefutedProtocolTests`가 이미 게이트 계약을
     보고 있다. 그것이 왜 이 경우를 못 잡았는지 **한 줄로 적어라.**
2. **원인을 찾아라.** `run()`은 `_execute_all_steps()` → `_finalize()` 순이고
   `_finalize()`가 `_update_top_index()`를 부른다. 그 사이 어디서 끊기는지
   진단하라. 추측을 적지 말고 **재현 테스트가 가리키는 것**을 적어라.
3. **고쳐라.** 게이트 반증이 정상 종결인 이상, top index 갱신과 마무리 커밋은
   **codex의 종료 코드와 무관하게** 일어나야 한다.
   - `blocked`(`sys.exit(2)`)·`error`(`sys.exit(1)`) 경로는 이미 각각
     `_update_top_index`를 부르고 나간다 — **그 경로들의 동작을 바꾸지 마라.**
   - 정상 종료 경로에서 예외가 나더라도 대장이 실제 상태와 어긋난 채로 남지
     않게 하라. 다만 **오류를 삼키지 마라** — 조용히 성공으로 만들면 이 결함의
     더 나쁜 판이 된다. 실패는 보이되 대장은 맞아야 한다.
4. **고정하라.** 게이트 반증 뒤 top index가 `refuted`가 되는 것을 테스트로
   박아라. **흔들어 보여라** — 갱신을 빼면 실패해야 하고, 그 실패 메시지를
   보고서에 적어라.

## 하지 말 것

- `src/**` 수정 금지 — 이건 하네스 문제다.
- 스텝 커밋(`_commit_step`) 동작을 바꾸지 마라. 그건 정상이었다.
- 재현 못 한 것을 고쳤다고 적지 마라.
- 실패를 삼켜서 초록으로 만들지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`·`step*-report.json`을 지우지 마라.
- `scripts/execute.py`를 **실행**하지 마라 — 재귀다. 편집은 이 스텝의 대상이다.

## AC

- `python -m pytest scripts/ -q` 0 failed.
- 게이트 반증 → top index `refuted` 가 테스트로 고정돼 있고, 흔들면 실패한다.

## 산출물

`phases/32-harness-test-rot/step3-report.json`: 재현 방법, `RefutedProtocolTests`가
못 잡은 이유, 진단한 원인, 고친 곳, 흔들기 실패 메시지.
