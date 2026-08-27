# Step 1: 부패한 8건을 지금의 계약으로 고친다

**전제**: step 0이 `completed`다(전제가 전부 성립했다는 뜻이다).

## 배경

`scripts/test_execute.py`의 8건과 `scripts/test_stop_verify.py`의 2건이 실패한다. 앞의 8건은 — `subprocess.run` 부류 **6건**,
산출물 이름 **1건**(`test_saves_output_json`), 가드레일 루트 **1건**
(`TestLoadGuardrails::test_empty_project`)이다. step 0 의 표를 그대로 따르라. step 0이 **테스트가 낡은 것이고
하네스가 계약을 잃은 것이 아님**을 확인했다. 그러니 **하네스를 고치지 말고
테스트를 지금의 호출 경로에 맞춰라.**

## 할 일

1. **`TestInvokeCodex` 의 `subprocess.run` 부류 6건을 새 호출 경로로 옮겨라.** 지금 `_invoke_codex`는
   `subprocess.run`이 아니라 Popen ＋ `communicate` ＋ 로그 파일 리다이렉션을
   쓴다. patch 대상을 그 경로로 바꾸고, **원래 단언이 지키던 것을 그대로
   지켜라** — 무엇을 지키는지는 각 테스트의 docstring에 이미 적혀 있다:
   - `codex exec` ／ `--json`
   - `--dangerously-bypass-approvals-and-sandbox`
   - `--dangerously-bypass-hook-trust` (`.codex/hooks.json`이 파일 변경마다
     untrusted로 돌아가서 TDD 가드가 조용히 안 걸리는 것을 막는 단언이다)
   - `shutil.which`로 PATHEXT 해석, 못 찾으면 `"codex"` 그대로
   - 프롬프트가 argv가 아니라 stdin(`cmd[-1] == "-"`), 그리고 step 본문이 실린다
   - 타임아웃 1800초
   **단언을 약화시키거나 지워서 통과시키지 마라.** 지금 경로에서 그 계약을
   확인할 수 없다면 그 사실을 적고 `blocked`.
2. **`test_saves_output_json`을 새 산출물 이름으로 맞춰라** — `step{N}-output.json`은
   phase 13에서 `step{N}-invoke.json`으로 바뀌었다. 다만 `execute_test.py::
   InvokeArtifactTests`가 **이미 새 이름을 고정하고 있다.** 같은 것을 두 곳에서
   고정하지 마라 — 겹치면 이 테스트는 지우고 **왜 지웠는지(어느 테스트가
   대신 지킨다)를 그 자리에 주석 한 줄로 남겨라.** 겹치지 않는 부분
   (`exitCode`·`step`·`name` 같은 내용 검사)이 있으면 그것만 남겨라.
3. **`TestLoadGuardrails::test_empty_project`를 고쳐라** — `StepExecutor.__new__`로
   `__init__`을 건너뛰던 것이 `_load_guardrails`가 `self._root_path`를 읽게
   바뀌면서 깨졌다. **테스트의 의도(AGENTS.md도 docs/도 없으면 빈 문자열)를
   유지한 채** 실제 인스턴스를 빈 tmp 루트로 만들어 확인하라.
4. **흔들어 보여라.** 고친 8건 각각에 대해, **하네스 쪽을 흔들면 그 테스트가
   깨지는지** 확인하고 원복하라. 예: `--dangerously-bypass-hook-trust`를 argv에서
   빼면 그 테스트가 깨져야 한다. 보고서에 무엇을 흔들었고 어느 테스트가 어떤
   메시지로 깨졌는지 적어라. **「통과한다」는 검증이 아니다.**
6. **`test_stop_verify.py`의 4건도 같이 고쳐라 — 2건은 실패하고 2건은 헛통과다.**
   step 0이 확인한 대로 `stop-verify.sh`의 `[ ! -d "$ROOT/node_modules" ]` 조기
   종료는 **의도된 가드**다(주석이 PR #5 재현을 근거로 든다). **훅을 고치지 마라** —
   고쳐야 통과한다면 `blocked`로 적어라. 고칠 것은 테스트의 전제다.
   - **실패 2건**(`test_failure_emits_block_json`·`test_failure_reason_carries_npm_output`):
     임시 프로젝트가 훅의 전제를 만족하게 만들어라(가드가 요구하는 것을 갖추면 된다).
     **단언은 그대로 둬라** — stdout이 유효한 JSON이고 `decision`이 `block`이며
     `reason`에 npm 출력이 실린다는 것이 이 테스트가 지키는 계약이다.
   - **헛통과 2건**(`test_success_emits_nothing`·`test_stdout_never_leaks_plain_text`):
     지금은 조기 종료가 내는 빈 stdout 때문에 통과한다 — **훅이 통째로 망가져도
     통과한다.** 같은 전제를 갖춰서 이 둘이 **실제로 훅을 지나가게** 만들어라.
   - **넷 다 흔들어 보여라**: 훅 본문을 망가뜨리면 넷이 각각 어떤 메시지로 깨지는지
     적고 원복하라. 헛통과 2건이 흔들었을 때도 통과하면 아직 안 고친 것이다.

7. 다 고친 뒤 `python -m pytest scripts/ -q`를 돌려 **전 파일 0 failed**를
   확인하라. 남은 실패가 있으면 그 목록과 원인을 적고 `blocked`.

## 하지 말 것

- **`scripts/execute.py`를 고치지 마라.** step 0이 계약이 살아 있음을 확인했다.
  고쳐야 통과한다면 그것은 step 0의 판정이 틀렸다는 뜻이니 `blocked`로 적어라.
- `scripts/test_execute.py`를 통째로 지우지 마라 — 50건이 지금도 하네스를 지킨다.
- `.github/**` 수정 금지 — step 2에서 한다.
- 테스트를 `skip`·`xfail`로 덮지 마라. 부패를 감추는 것이다.
- `scripts/execute.py` 실행 금지 — 재귀다.

## AC

- `python -m pytest scripts/ -q` 0 failed.
- 4.와 6.의 흔들기 결과가 보고서에 있다 — 헛통과 2건이 흔들었을 때 깨지는 것을 포함해서.
- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과(회귀 없음 확인).

## 산출물

`phases/32-harness-test-rot/step1-report.json`: 10건 각각의 전/후, 흔들기 결과,
지운 것이 있으면 무엇이 대신 지키는지, pytest 최종 결과.
