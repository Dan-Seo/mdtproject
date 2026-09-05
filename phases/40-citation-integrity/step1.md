# Step 1: 주석의 미측정 숫자와 빠진 상호검증 짝

## 할 일

1. **`150`을 없애라.** `src/lib/import/framing-plan/elevation.ts`의
   `SHORT_DIMENSION_SCALE_TOLERANCE_RATIO` 주석이 「tsu 150mm(편차 0.176)」이라고 쓴다.
   `phases/38-elevation-close/step3-report.json`에 `150`은 없고,
   `short_dimension_sweep.observed`의 tsu-p21 항목에 `short_dimension_deviations`
   `[0.175584, 0.176031]`만 있다. **그 편차가 150mm 치수의 것이라는 대응이 없다.**

   두 길 중 하나를 택하고 report에 어느 쪽인지 적어라.
   - (a) 대응을 **측정**해서 근거를 만든다 — 36면 픽스처에서 그 편차를 낸 치수의 값을
     실제로 뽑아 report의 `measured` 항목으로 남기고, 주석은 그 report를 인용한다.
   - (b) 측정하지 않는다면 주석에서 **`150mm` 귀속을 지우고** 편차 값만 남긴다.

   (a)가 더 낫지만 억지로 하지 마라. 뽑히지 않으면 (b)다. **지어내지 마라.**

2. **tsu p22를 상호검증 표에 넣어라.** `tests/plan-import/corpus2-elevation.test.ts`의
   `AXIS_CROSSCHECKS`에 다음을 더한다.

   | elevation 골든 | grid 골든 | 축 |
   |---|---|---|
   | `tsu-kanritou-p22-elevation.json` | `tsu-kanritou-p16-grid.json` | `y` |

   p22의 axis가 이번에 전사되어 짝이 생겼다. 규칙(정/역 방향, 부분열, 스팬 합)은 그대로다.

3. 주석의 숫자를 바꿨다면, 그 주석에 남은 **모든** 숫자가 인용 report에 실재하는지
   `grep -nF`로 다시 확인하고 결과를 report에 실어라.

## 하지 말 것

- 상수 값(`1.0`)을 바꾸지 마라. 동작이 바뀌면 안 된다.
- 골든(`tests/fixtures/**`)을 고치지 마라.
- 측정하지 않은 숫자를 주석·문서에 쓰지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `npx vitest run` 전체 통과, `npm run lint`·`npx tsc --noEmit` 통과.
- **동작 무변화 확인**: `git diff -- src/`의 `+`/`-` 줄이 전부 주석·공백임을
  원문으로 실어라.
- `step1-report.json`에
  - `comment_numbers`: 주석에 남은 숫자마다 `{ "value", "grep_command", "found",
    "pointer" }`. `found: false`가 하나라도 있으면 이 스텝은 실패다.
  - `crosscheck_added`: p22 짝을 넣은 뒤 그 테스트가 통과함과, **grid 쪽 값을 한 칸
    변조하면 실패함**을 실측해 `{ "mutation", "exit_code", "failing_test" }`로 적고 원복하라.
    원복 뒤 `git diff -- tests/fixtures`가 비었음을 적어라.
