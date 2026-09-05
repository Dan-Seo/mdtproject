# Step 0: 중점 허용오차의 안전 여백을 36면에서 실측하라

## 배경

`src/lib/import/framing-plan/parse.ts`의 `MIDPOINT_TOLERANCE_PT = 15` 주석은 근거를
싣고 있다 — 「채택 최댓값은 5.803722pt, 合計 미확인 축의 최근접 미사용 경쟁 치수는
140.325470pt」. 그 두 수치는 **14면 코퍼스** 시절의 실측이다.

코퍼스는 그 뒤 36면으로 늘었고, `docs/RISKS.md`의 R15가 이렇게 적어 두었다 —
「이번에는 `alongDistance` 최댓값과 경쟁 치수 최솟값을 미측정했다.」
그래서 지금 이 상수는 **현재 코퍼스에서 여백이 얼마인지 모르는 채로** 서 있다.

## 할 일

36면(`tests/fixtures/section-import/textitems/*.json`) 전부를 대상으로 두 수를 재라.

1. **A ＝ 채택 이탈 최댓값.** 지금 채택되는 각 스팬 치수에 대해
   「치수의 along 중심」과 「인접 두 축의 중점」의 거리를 재고, 그 최댓값을 구하라.
   출처를 함께 적어라 — 면·방향·축 쌍의 라벨·치수 문자열·거리(pt).
2. **B ＝ 경쟁 이탈 최솟값.** 같은 탐색 창 안에 있으면서 채택되지 **않은** 치수 토큰의
   같은 거리를 재고, 그 최솟값과 출처를 같은 꼴로 적어라.
3. **`A ≤ 15 < B`가 성립하는지 보여라.** 성립하면 그것이 여백이다.
   성립하지 않으면 **그것이 결과다** — 상수를 고치지 말고 어긋난 지점을 그대로 적어라.
   여백이 없다는 사실 자체가 R15에 실려야 할 값이다.
4. **확인 sweep.** `MIDPOINT_TOLERANCE_PT`를 `4·6·15·30·40`으로 바꿔 가며 36면을 돌려
   T별로 다음을 적어라 — 격자 후보를 낸 면 수, 블록을 낸 면 수, 그리고
   `tests/fixtures/plan-import/expected/` 골든 7면의 출력이 T=15와 **동일한가**.
   sweep이 끝나면 상수를 15로 되돌려라.
5. 위 실측으로 `MIDPOINT_TOLERANCE_PT` 주석의 근거 숫자를 갱신하라.
   14면 시절 수치는 지우고 36면 수치를 적되, **출처(면·축 쌍)를 함께 남겨라** —
   숫자만 남으면 다음 사람이 다시 잴 수 없다.

## 측정 방법

파서 내부 값이 필요하면 임시로 계측 코드를 넣어 재고 **되돌려라.**
측정용 스크립트를 `src/`·`scripts/`·`tests/`에 남기지 마라.
대신 **재현 절차를 report에 적어라** — 어디에 무엇을 넣어 무엇을 찍었는지.

## 하지 말 것

- `MIDPOINT_TOLERANCE_PT`의 **값**을 바꾸지 마라. 이 스텝은 재는 스텝이다.
- 골든(`tests/fixtures/plan-import/expected/`)과 픽스처(`tests/fixtures/section-import/`)를
  고치지 마라. 그것은 사람이 도면을 읽어 전사한 것이고 파서 출력으로 유도하지 않는다 (ADR-010).
- 파서의 다른 동작을 바꾸지 마라. 이 스텝의 코드 변경은 **주석 하나**다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`에 다음이 있어야 한다.

- `midpoint_margin`:
  `{accepted_max: {value_pt, page, direction, axis_labels, dimension_text},
    competing_min: {같은 꼴}, tolerance_pt: 15, holds: true|false}`
- `sweep`: `[{tolerance_pt, grid_pages, block_pages, golden_identical}]` — T 다섯 값 전부.
- `procedure`: 위 두 수를 어떻게 쟀는지의 재현 절차.
- `comment_update`: 갱신한 주석의 이전 문장과 이후 문장.
- 측정이 끝난 뒤 `git diff --name-only`에 나타나는 경로가
  `src/lib/import/framing-plan/parse.ts` 하나임을 보여라(계측 코드가 남지 않았다는 증거다).
- `npx vitest run`·`npm run lint`가 0으로 끝난다.

## 기록 규칙

- 읽으려고 존재를 확인한 경로는 `paths_verified`에 넣어라.
- 「없어야 한다」가 결론인 경로는 `paths_expected_absent`에 넣어라. 둘을 섞지 마라.
- 검증 명령의 인자에 한글·일본어를 넣지 마라. Windows 셸에서 `?`로 깨져
  명령이 시작 전에 죽거나 0건 매칭이 「통과」로 보인다.
