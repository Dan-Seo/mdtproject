# Step 1: refuted-protocol — 검증 전용 스텝의 반증을 하네스가 지우지 않게 한다

대상은 `scripts/execute.py`의 스텝 루프다. step 0이 끝난 코드 위에서 작업하라.

## 무슨 일이 일어났는가

phase 12 step 2는 검증 전용 스텝이었고, 사양은 「반증이 성립하면 `error`로 두라」고 했다.
반증 성립은 그 스텝의 **성공**인데, 하네스에게 `error`는 실패라서 셋이 연쇄로 틀어졌다:

1. 재시도 경로(`_execute_single_step`)가 status를 `pending`으로 되돌리고
   `error_message`(＝반증 기록)를 **지운다**. 실제로 지워질 뻔했고 커밋 직전 수동 복구로 살아남았다.
2. 다음 시도의 preamble에 반증 내용이 `prev_error`로 들어가 codex에게 「수정하라」고 시킨다 —
   검증자가 구현자가 되는, 이 레포가 금지한 바로 그 패턴이다(AGENTS.md 「검증은 교차로 한다」).
3. `MAX_RETRIES` 소진 후 `_update_top_index("error")`＋`sys.exit(1)` — phase 전체가 실패로
   기록된다. `phases/index.json`의 phase 12 항목이 실제로 그렇게 남아 이번에 손으로 정정했다.

## 읽어야 할 파일

- `scripts/execute.py` (step 0 반영본)
- `scripts/execute_test.py` (step 0이 만든 것 — 여기에 테스트를 이어 쓴다)
- `phases/12-plan-apply-story/index.json` — 사고의 실물 (읽기만. 수정 금지)

## 설계 — 이대로 구현하라

- **스텝 항목의 선택 필드 `"kind": "verify"`** — phase의 `index.json`에 사양 작성자가 단다.
  하네스는 읽기만 한다.
- **새 종결 status `refuted`** — `kind: "verify"`인 스텝에서만 유효하다. 의미는
  「검증이 정상 완료되었고, 대상 주장이 반증되었다」.
  - `_execute_single_step`: status가 `refuted`이고 kind가 `verify`면 → `refuted_at` 스탬프,
    index 저장, `_commit_step`, `⊘ Step N: {name} refuted` 출력, **`True` 반환**(재시도 없음,
    phase 계속). `summary`는 반증 요지이므로 지우지도 옮기지도 마라.
  - status가 `refuted`인데 kind가 `verify`가 아니면 → 그 시도는 실패로 취급하되 err_msg를
    명시한다: `status 'refuted'는 kind 'verify' 스텝에서만 유효하다` (기존 재시도 경로를 탄다).
    구현 스텝이 이 상태로 AC를 피해 가는 구멍을 막는 게이트다.
  - `_build_preamble`에 `verify: bool` 인자를 추가하고, **verify일 때만** 규칙 5에 한 줄을 더한다:
    `- (이 step은 검증 전용) 반증 성립 → "refuted" + "summary"에 반증 요지. 반증 성립은 실패가 아니라 이 step의 정상 종결이다. 대상을 고치지 마라.`
    구현 스텝이 받는 기존 preamble 문구는 **한 글자도 바꾸지 마라.**
  - `_build_step_context`: `refuted`＋`summary`인 스텝도 포함하되 `(반증)` 접두어를 붙인다 —
    뒤 스텝과 finalize가 반증 사실을 알아야 한다.
  - `_check_blockers`·`_finalize`는 **무변경**이다 — `refuted`는 blocker 스캔에서 `break`를 타고
    통과하며, phase는 `completed`로 끝난다(반증 성립 = 검증 스텝의 성공이므로).
    무변경이 맞다는 것을 테스트로 고정하라.

## 작업 — TDD

`scripts/execute_test.py`에 테스트를 **먼저** 이어 쓰고 구현하라. 가짜 codex는
`StepExecutor` 서브클래스로 `_invoke_codex`를 오버라이드해 index.json에 원하는 status를
쓰는 방식으로 만든다. 임시 root에 `git init`＋로컬 `user.name`·`user.email`이 필요하다
(`_commit_step`이 진짜 git을 부른다). 고정할 행동:

1. `kind: "verify"` 스텝이 `refuted`를 쓰면 — invoke 호출 **1회**(재시도 없음),
   `_execute_single_step`이 `True`, status `refuted` 유지, `refuted_at` 존재, `summary` 보존
2. `refuted` 뒤에 `pending` 스텝이 있으면 계속 실행된다 (`_execute_all_steps` 수준)
3. `refuted`가 있어도 `_finalize`는 top index를 `completed`로 쓴다
4. kind가 없는 스텝이 `refuted`를 쓰면 재시도되고, 다음 시도 preamble의 `prev_error`에
   위의 명시 문구가 들어간다
5. `_check_blockers`가 `refuted` 스텝에서 exit하지 않는다
6. `_build_step_context`가 refuted 스텝의 summary를 `(반증)` 접두어로 포함한다

### 뮤테이션 검증 (반증 가능성 증명)

구현 완료 후 아래 3개를 하나씩 넣고, 각각 어느 테스트가 실패하는지 확인·기록하고 원복하라:

1. `refuted`를 `error`와 같은 재시도 경로로 되돌린다 → 테스트 1 실패
2. kind 게이트를 제거한다(아무 스텝이나 `refuted` 허용) → 테스트 4 실패
3. `_build_step_context`에서 refuted 스텝을 제외한다 → 테스트 6 실패

## AC

1. `python scripts/execute_test.py` 전부 통과 (step 0의 테스트 포함)
2. 뮤테이션 3종이 각각 이름 붙은 테스트를 실패시켰다가 원복됨 — 보고서에 기록
3. `npm run lint`·`npm run test` 통과

## 산출물

`phases/13-harness-fixes/step1-report.json` — step 0과 같은 형식
(`reproduced` / `mutations` / `gates`).

## 하지 말 것

- **`scripts/execute.py`를 실행하지 마라**(재귀 금지, AGENTS.md). `codex` 바이너리 호출 금지.
- `phases/12-plan-apply-story/index.json`을 소급 수정하지 마라 — `error`로 남은 것이 역사다.
- 구현 스텝용 preamble 문구를 바꾸지 마라. verify 스텝에 한 줄 추가만 허용된다.
- `_update_top_index`에 `refuted` 상태 전파를 추가하지 마라 — phase의 결과는 `completed`다.
- step 0이 만든 `run_codex_process`·산출물 이름을 건드리지 마라.
- 이 phase의 index(`phases/13-harness-fixes/index.json`)에 `kind` 필드를 달지 마라 —
  이 phase의 두 스텝은 구현 스텝이다. `kind: "verify"`는 다음 phase부터 사양 작성자가 쓴다.
