# Step 2: 하네스 테스트를 CI에 건다

**전제**: step 1이 `completed`다.

## 왜

`scripts/test_execute.py`가 부패한 채 남아 있던 이유는 하나다 — **아무도 안
돌렸다.** 고치기만 하고 CI에 걸지 않으면 다음 리팩터링에서 똑같이 썩는다.

## 할 일

1. **`.github/workflows/ci.yml`의 pytest 단계를 넓혀라.** 지금은
   `python -m pytest scripts/test_review_verdict.py -q` 하나다. 이것을
   `scripts/` 전체로 넓혀라.
   - **step 0의 `linux_incompatible_tests`를 그대로 따르라.** 리눅스에서 돌 수
     없는 테스트가 있으면 `@pytest.mark.skipif(sys.platform != 'win32', ...)`로
     **그 테스트에만** 표시하고, `reason`에 왜 Windows 전용인지 적어라
     (`tasklist`·PATHEXT·`codex.CMD` 등). **파일 통째로 건너뛰지 마라.**
   - 목록이 비어 있으면 표시를 만들지 마라. 필요 없는 분기를 미리 넣지 않는다.
2. **`review.yml`·`oncall.yml`도 같은 줄을 쓰고 있다.** 셋을 같은 문언으로
   맞춰라 — 한 곳만 넓히면 「main CI는 통과인데 리뷰 CI는 아니다」가 생긴다.
   `oncall.yml`은 에이전트에게 게이트 목록을 **글로 알려주는 자리**(≈:166·:235·:259)도
   있으니 그 문언도 같이 맞춰라.
3. **`docs/`에 한 줄 적어라** — 하네스 테스트가 이제 CI 게이트라는 것.
   `CLAUDE.md`·`AGENTS.md`의 「명령어」 절에 pytest 한 줄을 더할지는 판단에
   맡긴다. 더한다면 **실제로 도는 명령**이어야 한다.
4. **실제로 도는지 확인하라** — 워크플로우를 고친 뒤 로컬에서
   `python -m pytest scripts/ -q`가 통과하는 것으로는 부족하다. **리눅스에서**
   도는지가 관건이므로, `gh workflow run`으로 돌릴 수 있으면 돌려 결과를 적고,
   못 돌리면 **무엇을 확인하지 못했는지 보고서에 적어라.** 「통과할 것이다」라고
   쓰지 마라.

## 하지 말 것

- `scripts/**` 수정 금지 — step 1이 끝냈다. 여기서 또 고치면 CI를 통과시키려고
  테스트를 무르게 만드는 길이 열린다.
- 실패하는 테스트를 CI에서 제외해서 초록을 만들지 마라.
- 기존 게이트(lint·typecheck·test·test:ci-scripts·build·lighthouse)를 빼지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다.

## AC

- `python -m pytest scripts/ -q` 0 failed.
- 워크플로우 셋의 pytest 문언이 같다.

## 산출물

`phases/32-harness-test-rot/step2-report.json`: 고친 워크플로우와 줄,
skipif를 붙였다면 어느 테스트에 왜, 실행으로 확인한 것과 확인하지 못한 것.
