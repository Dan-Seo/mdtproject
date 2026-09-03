# Step 3: 階高 골든 테스트를 골든대로 고치고 레벨 라벨을 라벨 열로 제한하라

## 배경

phase 36 step 2의 `tests/plan-import/corpus2-elevation.test.ts`는 **골든이 아니라 파서
출력에 맞춰** 쓰였다. Claude 검토:

- hirosaki: 테스트가 계열 3개를 `[golden[0], golden[0], golden[1]]`로 대조한다. 골든은
  X1·X2·X3 세 블록이다. 실은 **Claude의 골든이 X2通り의 RFL을 놓쳤고**(원시 TextItem에
  RFL@(94,289)가 있고 PHFL까지 32pt = X1의 3,400mm 간격과 같다) 파서가 맞았다 — 그러면
  「골든 어긋남」으로 `blocked`해야지 골든 두 블록을 세 계열에 늘려 붙이면 안 된다.
  골든은 고쳤다(X2 = RFL부터 6구간).
- karatsu: 테스트가 `toHaveLength(2)`·라벨 `'RFL水上'`를 하드코딩한다. 골든은 X2·X3·X4
  세 블록, 레벨명 `RFL`. 골든에 `levelTexts`(원문 문자열 「RFL水上」)를 더했다. X4通り는
  텍스트에 레벨 라벨 열이 없다(골든 `levelNote`) — 못 내는 것은 정직하게 제외하되 **이유를
  테스트 주석에** 적어라.
- tsu: 테스트가 계열 2를 골든 1블록(Y3通り, 아래 3구간만 전사)에 둘 다 대조한다. 페이지는
  Y1(왼쪽 위)·Y2(오른쪽 위, 라벨 열 없음)·Y3(왼쪽 아래) 세 블록이고 파서 계열 둘은 Y1·Y3다.
- 셋 다 `labelsFrom`이 원하는 라벨만 걸러 평탄화하므로, 파서가 레벨에 붙인 부재 부호
  (`C1`·`G16`·`F5`·`P1-5`)·기호(`▽`·`▲`)가 통과한다. 레벨 라벨은 레벨 라벨 **열**(같은 x
  대역)의 문자열이어야 한다.
- `extendShortTail`의 `SHORT_TAIL_SCALE_TOLERANCE_RATIO = 0.5`(축척 오차 50% 허용)는 잡음
  숫자를 마지막 階高로 붙일 수 있다.

## 할 일

1. **테스트 먼저** — 세 테스트를 골든 블록 단위로 다시 써라:
   - 계열↔블록 대응은 **제목**(「X2通り軸組図」 등, 블록 아래/옆의 텍스트)으로 한다.
     파서가 `title`을 내지 않으면 제목 세그먼트에 가장 가까운 계열로 대응하고 그 규칙을
     테스트 주석에 적어라.
   - `heightsMm`는 골든과 **전부** `toEqual`. tsu는 골든이 `heightsBottomMm`(아래 3구간)
     뿐이므로 `slice(-3)`만 — 그 사유(골든 부분 전사)를 주석에.
   - 레벨 라벨은 골든 `levels`(hirosaki·tsu) 또는 `levelTexts`(karatsu)와 **정확히** 같아야
     한다 — 필터링 없이 `levels.map(l => l.labels)`를 통째로 대조. 기호(▽·▲·△)와 부재
     부호가 섞여 있으면 실패해야 한다.
   - karatsu X4通り는 대조에서 제외하되 이유(텍스트에 라벨 열 없음)를 주석과 report에.
   먼저 실패를 확인하라.
2. `elevation.ts`를 고쳐 통과시켜라: 레벨 라벨은 레벨 라벨 열(치수 연쇄 옆의 같은 x 대역)
   안의 세그먼트만이고, 그 밖의 텍스트(부재 부호·기호)는 라벨에 넣지 않는다. 기호는
   버리거나 별도 필드에 남겨라(골든과 대조하지 않는다).
3. `SHORT_TAIL_SCALE_TOLERANCE_RATIO`: tsu 1170·hirosaki 2310에서 실제 오차를 재고
   (report에 숫자) 그 필요치＋여유로 줄여라. 0.5를 유지하려면 실측 근거를 적어라.
4. 기존 4면 회귀(`tests/plan-import/*.test.ts`의 기존 항목)가 그대로여야 한다.

## 하지 말 것

- 골든·픽스처를 고치지 마라. 어긋나면 report＋`blocked`.
- `framing-plan/parse.ts`·`runs.ts`·`textitems.ts`·`section-list/**`를 건드리지 마라.
- 도면 이름·제목 문자열로 갈라지는 조건을 넣지 마라(제목은 계열 대응에만).
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과. 세 테스트가 골든 블록 수(hirosaki 3·karatsu 2＋X4 제외·tsu 1)를
  순회하고 라벨을 통째로 대조한다.

## 산출물

`phases/37-corpus-widen-2-close/step3-report.json`:

```json
{
  "blocks_checked": { "hirosaki": 3, "karatsu": 2, "tsu": 1 },
  "series_to_block_rule": "",
  "label_rule": "",
  "short_tail_tolerance": { "measured": {}, "value": 0 },
  "existing4_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
