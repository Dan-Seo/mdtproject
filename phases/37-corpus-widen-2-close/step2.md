# Step 2: 伏図 격자 파서의 도면별 분기를 걷어내고 축 순서 규약을 세워라

## 배경

phase 36 step 1의 `src/lib/import/framing-plan/parse.ts`를 Claude가 검토해 다음을 찾았다.

1. **`normalizeAxisOrientation`** — `hasZero`(Y0이 있으면)·`hasTwoDigitLabel`(Y10 이상이
   있으면)·`hasFiveAxisX && names.length === 3`·`simpleAlpha && alongKey === 'y'`의 네
   트리거로 Y축 **라벨과 스팬만** 뒤집는다. 각 트리거는 골든 한 면(karatsu·hirosaki·
   tsu·shibata/ina)에 맞춘 것이고, `positionPt`는 안 뒤집어 라벨↔좌표가 거울상이 된다.
   원인은 Claude의 골든이 Y축을 번호 오름차순(아래→위)으로 적어 기존 규약(페이지 순서:
   kani-p38 `Y3,Y2,Y1`)과 어긋난 것이다. **골든은 이미 페이지 순서로 고쳤다**(7면 전부,
   `$comment`에 수정 경위). 규약: **축은 페이지 순서 — X 왼→오, Y 위→아래. 세로로 쌓인
   문자 축(fuji E〜A)도 위→아래.** 따라서 이 함수는 통째로 지운다.
2. **`process.env.DEBUG_PARSE`** console.error 5곳(713·1471·1485·1529·1570) — 디버그 잔재.
3. **`scaleValid`**(≈693) — 축 5개 이상이면 축척 불일치 위치를 1/3까지 허용한다. 기존
   규약 「한 칸이라도 다르면 실패」를 조용히 완화한 것이다.
4. **이슈 덮어쓰기**(≈1517) — 검증을 통과한 격자가 없으면 실제 이슈를
   `通り芯ラベル未検出`로 바꾼다(기존 14면 회귀를 맞추기 위한 것).
5. **`fullTotals[0]?.spanSum`**(≈914) — 후보별이 아니라 첫 해와만 비교한다. 버그 의심.
6. **`minimumCoveredSpans = spanCount - 2`**(≈770) — 주석이 shibata 통과·karatsu 배제를
   명시한다. 두 도면에 맞춘 상수인지 기하 규칙인지 불분명.
7. **`mergeVerticalFragments`**(≈250) — 한 글자 세로 런을 열 안 최소 간격×`VERTICAL_RUN_GAP_RATIO`로
   다시 잇는다. 회전 글리프 치수(fuji 「2,500」)를 읽는 정당한 규칙이지만 step 1 report의
   `rules_added`에 없고 단위 테스트가 없다.

## 할 일

1. **골든 테스트 먼저** — `tests/plan-import/corpus2.test.ts`에 두 가지를 더하라:
   ① 모든 grid의 `axes[i].positionPt`가 **단조 증가**한다(라벨↔좌표 거울상을 잡는 단언).
   ② 기존 `EXISTING_14` 스냅샷은 그대로. 골든 7면은 이미 페이지 순서다.
   먼저 실패를 확인하라(현행 파서는 뒤집힌 라벨을 내므로 7면 중 여럿이 실패해야 한다).
2. `normalizeAxisOrientation`를 삭제하라. 라벨 순서 추정 로직(`.reverse()`로 labels·spans를
   뒤집는 어떤 분기도)을 남기지 마라.
3. `DEBUG_PARSE` 5곳을 지워라.
4. `scaleValid`를 `outlierCount === 0`으로 되돌려라. 그 상태로 실패하는 골든이 있으면
   **완화하지 말고** 그 면의 outlier 라벨·위치·중앙값 축척을 report에 적고 `blocked`.
5. 이슈 덮어쓰기를 규칙으로 바꿔라: 접두 없는 단순 라벨(숫자·문자)만 있고 검증에 전부
   실패하면 `通り芯ラベル未検出`(그 라벨은 通り芯이 아니었다), X·Y 접두 라벨이 하나라도
   있으면 실제 이슈를 그대로 낸다. 합성 items로 두 경우의 단위 테스트를 써라.
6. `fullTotals[0]?.spanSum`를 읽고, 후보별 비교가 맞으면 고치고 테스트를 더하라. 첫 해와의
   비교가 의도라면 그 이유를 주석에 적어라(어느 쪽인지 report에).
7. `minimumCoveredSpans`의 근거를 기하 규칙으로 설명하라(예: 부분합은 미확정 축이 뒤에
   남는 경우에만 — 그러면 「끝에서 두 축」이 아니라 「미확정 축의 수」로 써야 한다).
   설명이 안 되면 규칙으로 바꾸고, 바꿔서 골든이 깨지면 `blocked`＋report.
8. `mergeVerticalFragments`에 단위 테스트(회전 글리프 한 글자 열 「2」「,」「5」「0」「0」→
   「2,500」)를 더하고 report `rules_added`에 적어라.

## 하지 말 것

- 골든·픽스처를 고치지 마라. 어긋나면 report＋`blocked`.
- `MIDPOINT_TOLERANCE_PT`·`VERTICAL_RUN_GAP_RATIO`·`runs.ts`·`textitems.ts`·`section-list/**`·
  `elevation.ts`를 건드리지 마라.
- 도면·발주처·시트 이름으로 갈라지는 조건, 골든 한 면만 지나가는 상수를 넣지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과: 7면 격자 골든(페이지 순서)＋positionPt 단조＋`EXISTING_14` 불변.
- `grep -n "DEBUG_PARSE\|normalizeAxisOrientation" src/lib/import/framing-plan/parse.ts` 0건.
- `git diff`에 도면명 리터럴 분기 없음.

## 산출물

`phases/37-corpus-widen-2-close/step2-report.json`:

```json
{
  "removed": ["normalizeAxisOrientation", "DEBUG_PARSE x5"],
  "scale_valid_strict": { "restored": true, "failing_pages": [] },
  "issue_rule": "",
  "full_totals": "fixed|documented",
  "minimum_covered_spans": "",
  "rules_added": [{ "rule": "mergeVerticalFragments", "test": "" }],
  "tests": { "files": 0, "tests": 0 },
  "summary": "index.json summary와 같은 요지"
}
```
