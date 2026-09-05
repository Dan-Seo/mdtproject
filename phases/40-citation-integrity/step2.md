# Step 2: 문서의 인용을 해석되는 것으로 고쳐라

## 배경

phase 39 step 4가 `docs/RISKS.md`의 `source` 포인터 12개가 해석되지 않음을 잡았다.
파일은 있으나 가리킨 키가 없다. 문서의 **주장 내용은 대체로 옳고 인용만 틀렸다** —
그래서 「지우기」가 아니라 「해석되는 곳을 가리키기」가 기본이다.

12개의 내역:

- 7개: 미전사 axis 항목이 어느 通り에 대응하는지를 골든의 **없는 경로**
  (`…-elevation.json#/elevations/N/axis/labels`)에 인용했다.
  → **이 주장은 이제 통째로 낡았다.** axis 3건을 전사해 미전사가 0이 됐다(커밋 `03bb3d8`).
- 5개: `phases/38-elevation-close/step4-report.json`의 없는 키를 가리킨다
  (`rejectedLevelLikeStrings`·`acceptedSentences`·`acceptedTrueLevelLabels`).
  → 그 report에 **실제로 있는 키**를 찾아 가리켜라. 값(`1SL`·`2SL`·`SL+756.70`·
  `1FL`·`2FL`)이 그 report에 있는지부터 확인하고, 없으면 그 문장을 근거 있는 것으로 고쳐라.

## 할 일

1. `docs/RISKS.md`의 **R10** 중 「미전사 axis는 3개 골든 항목이다」 문단을 갱신하라.
   지금 사실: tsu p21 `elevations[1]`과 p22 두 항목의 axis를 전사해 **미전사 0**이고,
   `axis` 없는 elevation 항목이 없음을 테스트가 고정한다. 한 면 안의 모든 軸組図 블록이
   같은 通り芯 축을 쓴다는 것이 근거다. 인용은 `phases/40-citation-integrity/step0-report.json`
   의 실재하는 포인터로 하라.
2. 5개 포인터를 그 report에 **실재하는 키**로 고쳐라.
3. 문서에서 새로 쓰거나 고친 **모든** 숫자·문자열을 `numbers_used`에 남겨라.
4. `CLAUDE.md`·`AGENTS.md`의 R10 행에 미전사 axis 수치가 들어 있으면 함께 고쳐라.
   **두 파일의 해당 표는 글자까지 같아야 한다.**

## 하지 말 것

- 코드·테스트·골든을 고치지 마라. 문서만이다.
- 해석되지 않는 포인터를 새로 쓰지 마라. **쓰기 전에 해석해 보고 써라.**
- 근거를 못 찾으면 문장을 지어내지 말고 그 문장을 근거 있는 범위로 줄여라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `step2-report.json`의 `numbers_used` 각 항목에 `source`가 있고, **모든 `source`의
  파일 존재와 JSON 포인터 해석이 성공**함을 `pointers_verified`에 적어라.
  하나라도 실패하면 이 스텝은 실패다.
- `CLAUDE.md`와 `AGENTS.md`의 해당 행이 문자열로 동일함을 `diff`로 확인해 적어라.
- `npx vitest run` 전체 통과(문서만 바꿨으므로 변화 없음), `npm run lint` 통과.
