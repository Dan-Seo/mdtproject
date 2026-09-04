# Step 5: 골든 테스트에 남은 리터럴과 미대조 칸을 없애라

## 배경

`phases/37-corpus-widen-2-close/claude-review.md` 5번의 잔여다. 테스트가 골든이 아니라
파서 출력·제목 문자열에 기대고 있으면, 골든과 파서가 어긋나도 테스트가 그것을 감춘다.

## 할 일

### A. `tests/plan-import/corpus2-elevation.test.ts`

1. `toHaveLength(2)`·`toHaveLength(3)` 리터럴을 없애라. 계열 수는 골든에서 나온다.
2. karatsu 블록의 제외 리터럴(`entry.title === 'X2通り' || entry.title === 'X3通り'`)을 없애고
   **골든 3항목(X2·X3·X4) 전부**를 대조하라. X4는 X3과 치수 열을 공유하므로 같은 계열에 붙는다 —
   실제로 그렇게 나오는지가 이 테스트의 몫이다.
3. 「모든 파서 계열이 골든 항목 중 하나에 대응된다」를 단언하라(미청구 계열 0).
   골든에 없는 계열이 새로 생기면 실패해야 한다.
4. hirosaki·tsu도 같은 방식으로 정리하라(제목→계열 대응, 라벨 배열 통째 `toEqual`).
   tsu는 step 3에서 넣은 대조와 중복되지 않게 한 곳으로 모아라.

### B. `tests/section-import/parse.test.ts` — ojkk-p4 `CB1`의 `先端`

지금은 位置 키 중 `中央`과 `端部`만 대조하고 `先端`은 대조하지 않는다. 골든
`ojkk-akamichi-p4-walls-slabs.json`의 `CB1`은 位置 `[中央, 先端]`이고 두 위치의 上端筋·下端筋
값이 같다(`2-D25`·`1-D25`). 파서 출력의 `girderMain`에는 `endTopCount`/`endBottomCount`가 없다.

- 골든 항목의 `位置` 배열에 있는 **모든** 위치를 대조하도록 고쳐라.
  `中央`은 `topCount`/`bottomCount`, `端部`는 `endTopCount`/`endBottomCount`에 대응한다.
- `端部`가 아닌 다른 위치(`先端`)는 파서가 별도 필드를 두지 않는다. 그 위치의 값이 `中央`과
  **같으면** 파서의 단일 쌍과 대조하고, **다르면** 파서가 값을 잃는다는 뜻이므로 테스트를
  통과시키지 말고 `blocked`로 보고하라(사양 결정이 필요하다).
- 이 리스트는 `対象外`라 물량에 들어가지 않는다. 그래도 대조하는 이유는 「読めているか」의
  기록이기 때문이다 — 판정을 `対象外`에서 바꾸지 마라.

## 하지 말 것

- 파서 코드를 고치지 마라. 이 스텝은 테스트만 바꾼다.
- 골든·픽스처를 고치지 마라. 어긋나면 `blocked`＋report.
- 테스트를 파서 출력에 맞추지 마라 — 하드코딩 문자열, `parsed[i]`를 `golden[j]`에 재배치하는
  배열, 라벨만 걸러내는 필터는 전부 금지다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `npx vitest run` 전체 통과.
- `rg -n "toHaveLength\(" tests/plan-import/corpus2-elevation.test.ts` 결과가 0건이거나,
  남았다면 그 인자가 골든에서 계산된 값이다.
- 골든 값 한 칸을 바꾸면(임시) 해당 테스트가 실패한다 — karatsu·hirosaki·tsu·ojkk-p4에서
  각 1건씩 확인하고 원복. 결과를 `step5-report.json`에 적어라.
- `npm run lint`·`npx tsc --noEmit` 통과.
