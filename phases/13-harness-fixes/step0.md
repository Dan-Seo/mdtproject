# Step 0: codex-invoke-io — 타임아웃이 실제로 발동하게 하고, 산출물 충돌을 없앤다

대상은 `scripts/execute.py`의 `_invoke_codex`(:239-277) 하나다. 결함 2건이 같은 자리에 있다.

## 무슨 일이 일어났는가

**1) `timeout=1800`이 발동하지 않는다.** 2026-08-25 실측: codex가 멈췄는데 스피너가
2,080초를 넘도록 `TimeoutExpired`도 재시도도 나오지 않았다. 현재 코드는
`subprocess.run(..., capture_output=True, timeout=1800)`(:256-261)인데, Windows에서 이 조합은
타임아웃 시 **직접 자식만** kill한다. codex는 npm 셔뱅 `codex.CMD`라 실제 작업은
**손자 프로세스(node)**가 하고, 손자가 상속받은 stdout/stderr 파이프의 write 핸들을 쥔 채
살아남으면 kill 뒤의 `communicate()`가 EOF를 영원히 기다린다 — kill **이후에** 멈추므로
예외가 밖으로 나가지 않는다. codex가 스스로 안 끝나는 경우 30분이 아니라 **무한히** 버려진다.

**2) 하네스가 codex의 보고 파일을 덮어쓴다.** `_invoke_codex`는 스텝이 끝날 때마다 자기 기록
`{step, name, exitCode, stdout, stderr}`을 `step{N}-output.json`에 쓴다(:273-275).
phase 12 step 0에서 스텝 사양이 codex에게 같은 이름으로 뮤테이션 보고를 쓰게 했고,
하네스가 그것을 덮었다 — `phases/12-plan-apply-story/step0-output.json`이 지금 하네스 기록인
이유다(codex의 보고는 대피본만 남았다).

## 읽어야 할 파일

- `scripts/execute.py` 전체
- `phases/12-plan-apply-story/step0-output.json` — 덮어쓰기 사고의 실물

## 설계 — 이대로 구현하라

### 1. 파이프를 없앤다: stdout/stderr는 파일로 직행

모듈 수준 함수로 추출한다:

```python
def run_codex_process(cmd, prompt, stdout_path, stderr_path, timeout_sec, cwd):
    """반환: {"exitCode": int|None, "timedOut": bool, "elapsed": float}"""
```

- `subprocess.Popen`으로 띄우되 `stdout`·`stderr`는 **열린 파일 핸들**(`"w"`, utf-8)로 준다.
  파이프가 없으면 손자가 뭘 쥐고 살아남든 EOF 대기가 없다. 로그가 디스크에 실시간으로
  남는 것 자체가 두 번째 수확이다 — 이번 진단에서 `capture_output=True`가 모든 것을 삼켜
  눈먼 대기 65분이 나왔다.
- 프롬프트는 지금처럼 stdin으로: `proc.communicate(input=prompt, timeout=timeout_sec)`.
  stdout/stderr가 파이프가 아니므로 communicate가 기다리는 것은 프로세스 종료뿐이다.
- `TimeoutExpired`가 잡히면 **프로세스 트리 전체**를 죽인다:
  - win32: `taskkill /F /T /PID {pid}` (subprocess로, `capture_output=True`)
  - posix: `Popen(..., start_new_session=True)`로 띄우고 `os.killpg(pid, SIGKILL)`
- kill 후 `proc.wait()`로 회수하고 `timedOut=True`로 정상 반환한다. 예외를 위로 던지지 마라 —
  스텝 루프는 index.json의 status 미갱신을 보고 재시도 경로를 타므로 루프 수정이 필요 없다.

### 2. `_invoke_codex`의 산출물 이름을 바꾼다

- stdout → `step{N}-codex.stdout.log`, stderr → `step{N}-codex.stderr.log` (phase 디렉터리)
- 하네스 자기 기록 → `step{N}-invoke.json`:
  `{"step", "name", "exitCode", "timedOut", "elapsed", "stdout_log", "stderr_log"}` (로그는 경로만)
- `step{N}-output.json`이라는 이름은 execute.py에서 완전히 사라진다. 그 이름은 이제
  스텝 사양이 codex에게 시키는 보고 전용이다.
- `_commit_step`(:146-152)의 feat 커밋 제외 목록을 새 이름 셋(`invoke.json`＋로그 2개)으로
  갱신한다. 취지는 기존과 같다: 하네스 부산물을 feat 커밋에 섞지 않는다.
- codex 비정상 종료 시의 WARN 출력(:263-266)은 유지하되, stderr 요약은 로그 파일의
  마지막 500자를 읽어 보여준다.

### 3. 테스트를 위한 root 주입

`StepExecutor.__init__(self, phase_dir_name, *, auto_push=False, root=None)` — `root=None`이면
지금의 `ROOT`. `_load_guardrails`의 `ROOT` 직접 참조도 주입된 root를 쓰게 바꾼다.
테스트가 임시 디렉터리에 가짜 phase를 만들어 실행하기 위한 것이고, 기본 동작은 불변이다.

## 작업 — TDD

`scripts/execute_test.py`(stdlib `unittest`, 서드파티 금지)를 **먼저** 쓰고 구현하라.
실행은 `python scripts/execute_test.py`다. 최소 테스트 셋:

1. **정상 경로**: `cmd=[sys.executable, "-c", ...]`로 stdin을 읽고 stdout/stderr에 쓰는 자식.
   `exitCode==0`, `timedOut==False`, 두 로그 파일에 기대 내용.
2. **타임아웃＋손자**: 자식 스크립트가 손자(`sys.executable -c`로 300초 sleep, 자기 PID를
   인자로 받은 파일에 기록)를 낳고 자신도 300초 sleep. `timeout_sec=3`으로 호출하되
   **호출을 별도 스레드에 넣고 `join(30)`으로 행을 감지하라** — 뮤테이션이 행을 만들면
   join 초과가 곧 실패다. 단언: `timedOut==True`, 자식·손자 **둘 다** 죽었다(PID 생존 확인은
   win32 `tasklist /FI "PID eq {pid}"` 파싱, posix `os.kill(pid, 0)`; taskkill 직후 레이스가
   있으므로 최대 5초 폴링). 테스트 teardown에서 결과와 무관하게 PID 파일 기반으로 정리하라.
3. **산출물 이름**: 임시 root에 `phases/t/index.json`＋`step0.md`를 만들고
   (`git init`＋로컬 `user.name`·`user.email` 설정), `shutil.which`를 몽키패치해 codex 대신
   `sys.executable`이 잡히게 한 뒤 `_invoke_codex`를 호출한다(인자가 안 맞아 즉시 비정상
   종료하지만 그걸로 충분하다). 단언: `step0-invoke.json`과 로그 2개가 생기고,
   `step0-output.json`은 **생기지 않는다**.

### 뮤테이션 검증 (반증 가능성 증명)

구현 완료 후 아래 3개를 **하나씩** 넣고, 각각 어느 테스트가 실패하는지 확인·기록하고 원복하라:

1. 트리 kill을 직접 자식 `proc.kill()`로 되돌린다 → 손자 생존으로 테스트 2 실패
2. 파일 핸들 대신 `stdout=PIPE`로 되돌린다 → 테스트 2가 join(30) 초과로 실패
3. `step{N}-invoke.json`을 `step{N}-output.json`으로 되돌린다 → 테스트 3 실패

## AC

1. `python scripts/execute_test.py` 전부 통과
2. `grep -c "output.json" scripts/execute.py` → 0
3. 뮤테이션 3종이 각각 이름 붙은 테스트를 실패시켰다가 원복됨 — 보고서에 기록
4. `npm run lint`·`npm run test` 통과 (건드린 것이 없으니 그대로여야 한다)

## 산출물

`phases/13-harness-fixes/step0-report.json`:

```json
{
  "reproduced": "타임아웃 미발동을 어떤 테스트로 고정했는지 한 줄",
  "mutations": [{"mutation": "...", "failing_test": "...", "restored": true}],
  "gates": {"execute_test": "...", "lint": "...", "test": "..."}
}
```

주의: 이 phase를 실행 중인 하네스는 **옛 코드**(메모리에 이미 로드됨)라 `step0-output.json`을
계속 만든다. 그것은 하네스 기록이고 네 보고가 아니다. 네 보고는 `step0-report.json`이다.

## 하지 말 것

- **`scripts/execute.py`를 실행하지 마라** — 하네스가 하네스를 부르는 재귀다(AGENTS.md).
  진짜 `codex` 바이너리도 호출하지 마라. 테스트의 자식 프로세스는 전부
  `sys.executable`로 띄운 파이썬이다.
- 스텝 루프(`_execute_single_step`·`_execute_all_steps`)·재시도·status 판정 로직을 바꾸지 마라 —
  step 1의 몫이다.
- timeout 값(1800)·codex 인자·프롬프트 조립(`_build_preamble`)을 바꾸지 마라.
- npm scripts·CI 워크플로에 이 테스트를 배선하지 마라.
- psutil 등 서드파티 의존을 추가하지 마라.
