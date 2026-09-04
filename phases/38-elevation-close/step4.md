# Step 4: 레벨 라벨 화이트리스트와 大梁 부호 판정의 근거를 실측으로 적어라 (동작 변경 0)

## 배경

phase 37의 후속 기록(`phases/37-corpus-widen-2-close/claude-review.md` 2·4번)은 두 판정의
근거가 비어 있다고 적었고, 그중 화이트리스트 항목은 **부분적으로 틀렸다**(step 0 C3).
이 스텝은 코드 동작을 바꾸지 않고 **측정한 근거를 코드 주석과 테스트로 남긴다.**

## 할 일

1. 36면 서베이를 다시 돌려(스크립트는 `.cache/`) `isLevelLabel`의 통과/탈락을 표로 만들어
   `step4-report.json`에 넣어라. 최소한 다음을 구분해 적을 것.
   - 통과하는 **진짜 레벨 라벨**: `RFL`·`PHFL`·`2FL`·`設計GL`·`基礎下端`·`パラペット天端`·
     `RFL(水下)`·`中央棟RCL(水下)`·`梁天端`·`基礎梁天端` 등.
   - 통과하는 **문장**: `・基礎梁天端から1FLまでは打増しとする。`(tsu-p21),
     `支持地盤は、GL-900以下の弱風化花崗岩層とする`(karatsu-fukuzu) 등 — 최소 3개.
   - 탈락하는 **레벨스러운 문자열**: `1SL`(tsu-p21 ×2)·`2SL`·`2SL(水下)`(saiki-p2)·
     `SL+756.70`·`RSL+760.00`(ina-p6).
2. `isLevelLabel` 주석을 다시 써라. 담을 것:
   - SL 계열을 **넣지 않는 이유**: tsu-p21의 `1SL`은 `1FL`과 같은 높이라 넣으면 한 레벨에
     라벨이 둘이 되고, 그 도면의 레벨 이름 체계는 FL/GL이다. 넣으려면 골든이 먼저 필요하다.
   - 문장이 통과한다는 사실과, 36면에서는 창(`LABEL_WINDOW_PT`)·허용 범위 밖이라 결과에
     닿지 않았다는 것. **여기서 문장 배제 규칙을 새로 만들지 마라** — 코퍼스가 그 규칙을
     반증할 수 없다(효과 0). 이 사실은 step 7에서 R10에 적는다.
3. 두 합성 단위 테스트를 `src/lib/import/framing-plan/elevation.test.ts`에 더하라.
   - `1SL`은 레벨 라벨이 되지 않는다(화이트리스트에 SL을 넣으면 실패한다).
   - `梁天端`은 레벨 라벨이 된다(`天端` 어미 판정이 살아 있음을 고정).
4. `src/lib/import/section-list/parse.ts`의 `kindFromMark` 주석에 大梁 판정 `^G`의 근거를 적어라.
   - 코퍼스 근거: ina-p7의 `GA`가 大梁リスト 항목이다(`tests/fixtures/section-import/expected/ina-pump-p7-lists.json`).
     그래서 `G` 뒤에 숫자를 요구하는 옛 `^G\d`로는 못 읽는다.
   - `GB1`·`GW1`은 36면 코퍼스에 **0건**이다. 없는 부호에 맞춰 좁히지 않는다 —
     좁히는 코드를 쓰지 마라. 이 결정과 근거만 주석에 남긴다.
   - 실제로 0건인지 직접 세어 report에 적어라(`^G[A-Z]` 부호의 전 목록).

## 하지 말 것

- 화이트리스트·`kindFromMark`의 **동작**을 바꾸지 마라. 이 스텝의 diff는 주석과 새 테스트뿐이다.
- 골든·픽스처를 고치지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- 36면 스윕이 step 3 이후와 **바이트 동일**(동작 변경 0).
- `npx vitest run tests/plan-import src/lib/import tests/section-import` 통과.
- `npm run lint`·`npx tsc --noEmit` 통과.
