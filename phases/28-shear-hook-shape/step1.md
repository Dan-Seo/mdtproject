# Step 1: 135°フック 余長을 帯筋·あばら筋의 形状에 그린다 — 골든 먼저

**전제**: step 0이 `completed`다. `refuted`면 진행하지 마라.

## 배경

`docs/ADR.md`의 **ADR-040**과 ADR-019를 읽어라. 바꾸는 것은 **3D 形状뿐**이고
数量은 한 값도 움직이면 안 된다(1通則2)).

## 할 일 (골든 먼저 — TDD)

1. **골든** — `tests/golden/fixtures/fabrication-length.json`의
   `column-hoop-closed-shape`·`girder-stirrup-closed-shape`:
   - `expectedFabricationLengthMm`을 **2956 / 2056**으로 올려라(직선부 ＋ 余長×2).
   - `deviation`을 **지우지 말고 좁혀라** — `term`을 折曲げ内法直径 쪽으로 바꾸고
     (`bend.hook135` 대신 表5.3.1의 内法直径 항을 가리키는 새 term을 `terms`에
     추가), 이제 남은 차액은 「余長은 그렸고 曲げ部の伸び가 남았다」를 뜻한다.
     그 차액을 원문 근거 없이 지어내지 마라 — **값을 정할 수 없으면 `missingMm`을
     빼고 `status`를 그대로 둔 채 note에 「미확정(表5.3.1 折曲げ図が画像)」이라고
     적고, 테스트의 「차액이 대장과 맞는다」 항목이 그 케이스를 건너뛰게 하라.**
     대장 항목을 **삭제**해서 통과시키는 것은 반칙이다.
   - `derivation`에 余長의 유도(`bend.hook135` 6d × 呼び名径 13 ＝ 78, 양 끝)를 적어라.
   - **円形 帯筋** 케이스를 하나 더해라. 円形은 폴리라인이 원의 다각형 근사라
     절대값 대조가 근사에 물리므로, 기대값은 **「훅 없는 폴리라인 대비 증분이
     정확히 2 × 6d × 呼び名径」**로 잡아라.
2. **구현** — `src/domain/rebar/column.ts`(帯筋)·`src/domain/rebar/girder.ts`
   (あばら筋)에서:
   - 余長 길이는 룰팩 `bend.hook135`를 조회해 呼び名径에 곱해 얻는다.
     **`.ts`에 6이나 78을 쓰지 마라.**
   - 矩形: 코너 A에서 출발해 A로 돌아온 뒤 양 꼬리를 붙인 7점, `closed: false`.
     꼬리 방향은 **단면 안쪽 대각**(ADR-040 §3).
   - 円形: 같은 규칙으로 한 점에 두 꼬리(안쪽 반경 방향).
   - `ruleHits`에 `bend.hook135`를 **넣지 마라** — 그 항은 数量을 정하지 않는데
     内訳 행의 근거로 표시된다(column.ts의 기존 주석이 같은 이유로 かぶり를
     빼고 있다). 대신 `formula`의 3D 形状 절에 한 줄로 적어라.
3. **数量 불변 회귀** — 帯筋·あばら筋의 `length`·`count`와 内訳 행·질량이
   이 변경 전후로 동일함을 고정하는 테스트를 써라. 「지금 값과 같다」가 아니라
   **1通則2)의 유도값과 같다**로 적어라.
4. **기존 골든의 기대값을 고치지 마라** — `quantity-r5-ch3.json`·
   `spec-r7-ch5.json`의 数量 기대값이 움직여야 통과한다면 `blocked`.
   `polylineLength`를 읽는 다른 테스트(`girder.test.ts`의 `tie`·`sideBar` 등)가
   깨지면 그것은 **범위 침범**이다 — 幅止め筋·腹筋은 건드리지 마라.

## 하지 말 것

- `src/components/**`·`src/lib/viewer/**` 수정 금지(step 2에서 한다).
- 幅止め筋·主筋·壁筋·床板筋의 형상 변경 금지.
- 表5.3.1 注1의 4d를 그리지 마라 — 설계도서 조건이다(ADR-040 §6, step 3에서 전사).
- 折曲げ内法直径으로 인한 曲げ部の伸び를 지어내지 마라.
- 배근 규준 수치를 코드에 쓰지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- **검증 스크립트를 `src/` 아래에 만들지 마라** — phase 디렉터리 안에 둬라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/28-shear-hook-shape/step1-report.json`: 골든 기대값의 손 유도,
`deviation` 대장을 어떻게 좁혔는지, 数量 불변 회귀가 무엇을 고정하는지, 게이트 결과.
