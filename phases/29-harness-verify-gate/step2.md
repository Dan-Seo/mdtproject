# Step 2: 게이트를 문서에 적는다 (문서 전용)

**전제**: step 1이 `completed`다. **`src/**`·`scripts/**`를 고치지 마라.**

## 할 일

1. `AGENTS.md`와 `CLAUDE.md`의 개발 프로세스 절에서 `refuted`를 다루는 줄을 찾아
   **한 문장을 더하라**(기존 문장을 지우지 말고). 요지:
   - `refuted`는 재시도 없는 정상 종결이고, 기본값은 **phase가 계속 돈다**
     — 검증 스텝이 맨 뒤에 붙는 쓰임새 때문이다.
   - 검증 스텝을 **`step 0`의 게이트**로 쓸 때는 그 스텝 항목에 `"gate": true`를
     함께 달아라. 그러면 반증이 뒤 스텝을 막고 top index가 `refuted`가 된다.
   - **게이트를 달지 않으면 「refuted면 진행하지 마라」라고 사양에 써도 소용없다**
     — 2026-08-27 phase 28에서 실제로 다음 스텝으로 넘어갔다.
   두 파일의 문언을 서로 맞춰라.
2. `phases/README.md`가 있으면 스텝 항목의 필드 표에 `gate`를 더하라. 없으면 만들지 마라.
3. **틀린 서술을 지우지 말고 정정으로 덧붙여라** — 무엇이 언제 왜 바뀌었는지가
   사라지면 다음 세션이 같은 것을 다시 판단한다.

## 하지 말 것

- `src/**`·`scripts/**` 수정 금지.
- 「phase 13이 틀렸다」고 쓰지 마라 — 쓰임새가 늘어난 것이지 그때의 판단이 틀린 게 아니다.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/29-harness-verify-gate/step2-report.json`: 고친 파일과 줄, 두 문서의 문언이 같은지.
