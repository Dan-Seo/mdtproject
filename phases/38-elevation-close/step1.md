# Step 1: 軸組図 라벨 열 군집(죽은 복잡도)을 걷어내라

## 배경

step 0 C1에서 확인한 대로, `src/lib/import/framing-plan/elevation.ts`의 라벨 열 군집은
결과에 영향이 없다. `selectLabelColumn`이 순위로 열 하나를 고르지만, 뒤이은 `displaced`가
비선택 열의 「화이트리스트 통과 ＋ 레벨 허용 범위 안」 토큰을 전부 되살리기 때문이다.
실효 규칙은 `isLevelLabel` 문자열 판정과 창(`LABEL_WINDOW_PT`)뿐이다.

kani p40에서 `通り芯 라벨 Y1`을 주웠던 사고(주석 ≈37-39행)는 지금 화이트리스트가 막는다 —
`Y1`은 `isLevelLabel`을 통과하지 못한다. 열 군집이 막는 것이 아니다.

## 할 일

1. `labelColumns`·`selectLabelColumn`·`LABEL_COLUMN_GAP_PT`를 삭제하라.
2. 라벨 후보는 `horizontalDistance(label, chain[0].x) <= LABEL_WINDOW_PT`로만 거르고,
   그 뒤의 `isLevelLabel`·최근접 레벨 판정은 지금 그대로 둔다.
3. `LABEL_WINDOW_PT`의 주석에서 열 군집을 전제로 한 문장(「후보를 x 방향 군집으로 나눈 뒤…」)을
   실제 규칙에 맞게 고쳐라. kani p40 실측(창 150pt에서 128pt 떨어진 `Y1`을 주웠다)은
   기록으로 남기되, 지금 그것을 막는 것이 **화이트리스트**임을 적어라.
4. `nearestLevelIndex`·`horizontalDistance`·`labelText`·`isLevelLabel`은 그대로 쓴다.

## 하지 말 것

- 라벨↔레벨 대응 규칙, 짧은 치수 처리, 상수 값을 건드리지 마라 (step 2·3의 몫).
- `elevation.ts` 밖의 파일을 고치지 마라(테스트 포함). 이 스텝은 **동작 변경이 0**이다.
- 골든·픽스처를 고치지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- 36면 스윕이 **바이트 동일**: 변경 전(`git stash`나 `git show HEAD:파일`로 얻은 원본)과
  변경 후의 `JSON.stringify(parseFrameElevations(page))`가 36면 전부 같다. 비교 스크립트와
  결과를 `step1-report.json`의 `sweep`에 적어라(비교한 면 수, 다른 면 수 = 0).
- `npx vitest run tests/plan-import src/lib/import/framing-plan` 통과.
- `rg -n "labelColumns|selectLabelColumn|LABEL_COLUMN_GAP_PT" src` 결과 0건.
- `npm run lint`·`npx tsc --noEmit` 통과.

## 산출

`phases/38-elevation-close/step1-report.json` — `{"sweep":{...},"removed":[...],"tests":"..."}`
