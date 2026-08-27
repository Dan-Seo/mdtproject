# Step 0: 「하네스 테스트 8건은 계약 부패다」를 반증하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** 코드를 고치지 마라. 아래 전제를 하나씩 코드·실행으로
대조하고, **어긋나는 것이 하나라도 있으면 `refuted`로 끝내라.** 고치라는 것이
아니라 **틀렸음을 보이라**는 것이다. 전부 성립하면 `completed`.

`gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

## 배경

`python -m pytest scripts/test_execute.py -q` 는 2026-08-27 실측에서
**8 failed, 50 passed (700.64s)** 다. 여기에 더해 `scripts/test_stop_verify.py`가 **2 failed**다(아래 `sibling-suites-green` 참조) — 이 phase가 손봐야 할 부패는 **10건**이다. 이 파일은 **어느 CI 워크플로우에도 걸려
있지 않아서** 부패한 채로 남아 있었다.

실패 8건의 내역은 실측으로 이렇게 갈린다 — **세 부류이지 한 부류가 아니다**:

| 부류 | 수 | 예외 | 테스트 |
|---|---|---|---|
| `subprocess.run` patch 가 안 걸림 | **6** | `TypeError: 'NoneType' object is not subscriptable` | `test_invokes_codex_with_correct_args` / `test_resolves_executable_through_pathext` / `test_falls_back_to_bare_name_when_not_resolvable` / `test_hooks_are_not_skipped` / `test_prompt_goes_through_stdin` / `test_timeout_is_1800` |
| 산출물 이름이 바뀜 | **1** | `AssertionError: assert False` (`step2-output.json` 이 없다) | `test_saves_output_json` |
| 가드레일 루트가 옮겨짐 | **1** | `AttributeError` | `TestLoadGuardrails::test_empty_project` |

`TestInvokeCodex` 의 8건 중 **`test_nonexistent_step_file_exits` 는 통과한다** —
codex 를 부르기 전에 `SystemExit` 로 빠지기 때문이다. 「클래스가 통째로 썩었다」가
아니다.

여기서 갈리는 것이 하나 있다. 8건이 **테스트가 낡은 것**이면 테스트를 고치면
되지만, **하네스가 계약을 조용히 잃은 것**이면 그것은 제품 결함이고 테스트가
제 일을 한 것이다. **이 스텝의 일은 그 둘을 가르는 것이다.**

## 읽을 것

- `scripts/execute.py` — 특히 `_run_codex_process`(≈:40-60), `_invoke_codex`,
  `_load_guardrails`(:243-246), `__init__`(:118-120)
- `scripts/test_execute.py` — `TestInvokeCodex`(:426-522), `TestLoadGuardrails::test_empty_project`(:184)
- `scripts/execute_test.py` — `RunCodexProcessTests`, `InvokeArtifactTests`
- phase 13 커밋(`f3a2f79` 및 그 주변)에서 파이프 → 파일 리다이렉션으로 바뀐 지점

## 전제 목록

| id | 전제 |
|---|---|
| `rot-cause-is-popen` | `TestInvokeCodex`의 **6건**(위 표의 첫 부류)이 `subprocess.run`을 patch 하고 `mock_run.call_args`를 읽는데, 현재 `_invoke_codex`는 `subprocess.run`을 **거치지 않는다**(Popen ＋ `communicate` ＋ 로그 파일 리다이렉션). 그래서 `call_args`가 `None`이고 `TypeError: 'NoneType' object is not subscriptable`이 난다. 파일:행으로 보여라. |
| `artifact-rename-deliberate` | `test_saves_output_json`이 기대하는 `step{N}-output.json`은 phase 13에서 `step{N}-invoke.json`으로 **의도적으로** 바뀌었고, `execute_test.py::InvokeArtifactTests`가 새 이름을 이미 고정하고 있다. 즉 이 1건은 낡은 기대값이지 결함이 아니다. |
| `guardrails-root-moved` | `test_empty_project`가 `StepExecutor.__new__`로 `__init__`을 건너뛰는데 `_load_guardrails`가 모듈 전역 `ROOT`가 아니라 `self._root_path`를 읽도록 바뀌어 `AttributeError`가 난다. **그 테스트의 의도(AGENTS.md·docs 둘 다 없으면 빈 문자열)는 현재 하네스에서도 참인가** — 실제 인스턴스로 확인해 보고 결과를 적어라. |
| `contracts-still-hold` | 부패한 6건이 주장하는 **행동 자체는 지금도 하네스에 있다.** 여섯을 각각 `execute.py`의 파일:행으로 보여라 — ① `codex exec`, ② `--json`, ③ `--dangerously-bypass-approvals-and-sandbox`, ④ `--dangerously-bypass-hook-trust`, ⑤ `shutil.which`로 PATHEXT 해석하고 실패하면 `"codex"` 그대로, ⑥ 프롬프트가 argv가 아니라 stdin(`cmd[-1] == "-"`)이고 타임아웃이 1800초. **하나라도 사라졌으면 그것은 테스트 부패가 아니라 하네스 회귀다 — `refuted`.** |
| `ci-runs-neither` | `.github/workflows/ci.yml`·`review.yml`·`oncall.yml`의 pytest 호출이 `scripts/test_review_verdict.py` **하나뿐**이고, `package.json`의 `test:ci-scripts`도 pytest를 부르지 않는다. 즉 `test_execute.py`·`execute_test.py`는 CI에서 한 번도 돌지 않는다. |
| `sibling-suites-green` | **2026-08-27 정정 — 앞선 회차가 이 전제를 반증했다(`step0a-report.json`).** 형제 스위트 다섯 중 넷은 통과한다: `test_dangerous_command_guard.py` 13 / `test_tdd_guard.py` 13 / `test_review_verdict.py` 21 / `execute_test.py` 14. **`test_stop_verify.py`만 6 passed · 2 failed**다 — `test_failure_emits_block_json`·`test_failure_reason_carries_npm_output`이고, 원인은 `scripts/hooks/stop-verify.sh`의 `[ ! -d "$ROOT/node_modules" ]` 조기 종료가 임시 프로젝트에서 걸려 stdout이 비는 것이다(테스트는 그 stdout을 `json.loads` 한다). 실제로 돌려 **파일별 passed/failed 수**를 적어라 — 이 수가 다르면 `refuted`. |
| `stop-verify-guard-is-deliberate` | 위 조기 종료는 **하네스 회귀가 아니라 의도된 가드**다 — `stop-verify.sh`의 주석이 「CI 체크아웃에는 node_modules가 없어 exit 127로만 끝나고 … 이 훅이 CI 에이전트를 붙잡으면 턴 소진으로 리뷰 게시가 유실된다 (PR #5에서 재현)」라고 근거를 적고 있다. 즉 고칠 것은 훅이 아니라 **테스트의 전제**다. 주석을 인용해 보여라. **훅을 고쳐야 통과한다고 판단되면 `refuted`.** |
| `vacuous-passers` | 같은 파일의 `test_success_emits_nothing`·`test_stdout_never_leaks_plain_text`는 **통과하지만 아무것도 검증하지 못한다** — 둘 다 「stdout이 비어 있다」를 기대하는데 조기 종료가 정확히 그것을 낸다. **훅 본문을 망가뜨려도 이 둘이 통과하는지 실제로 흔들어** 확인하고 결과를 적어라(흔든 뒤 반드시 원복하고 `git status`로 보여라). 흔들었을 때 이 둘이 **실패한다면** 이 전제는 성립하지 않으니 `refuted`. |
| `linux-portability` | CI 러너는 리눅스다. `execute_test.py`·`test_execute.py`에 **Windows 전용 경로**(`tasklist`, `PATHEXT`, `codex.CMD`, `.bat`, `os.name`/`sys.platform` 분기, `taskkill`)가 얼마나 있는지 열거하라. **리눅스에서 통과할 수 있는지**를 판정하고, 통과 못 하는 테스트가 있으면 그 목록을 적어라. 이 판정이 step 2(CI 연결)의 방식을 정한다. |

## 방법

- 코드 대조는 **파일:행**을 제시하라. 「그렇게 보인다」는 검증이 아니다.
- 실행 결과는 **명령과 요약 출력**을 함께 적어라.
- 확인용으로 코드를 흔들었으면 **반드시 원복**하고 `git status`로 보여라.
- `test_execute.py` 전량은 700초가 걸린다 — `-q`로 돌리고, 개별 확인은
  `-k`로 좁혀라.

## 하지 말 것

- `scripts/**`·`.github/**`를 수정하지 마라. **반증만 하라.**
- `scripts/test_execute.py`를 지우지 마라 — 지워서 통과시키는 것은 반칙이다.
- `scripts/execute.py` 실행 금지 — 재귀다.

## 산출물

`phases/32-harness-test-rot/step0-report.json`:

```json
{
  "premises": [
    {"id": "...", "verdict": "upheld|refuted", "evidence": "파일:행 또는 명령과 출력", "note": "..."}
  ],
  "linux_incompatible_tests": ["..."],
  "verdict": "upheld|refuted"
}
```

## 종결

전제가 전부 성립하면 `completed`. 하나라도 어긋나면 **`refuted`** —
무엇이 어떻게 어긋났는지 적고 멈춰라. 고치지 마라.
