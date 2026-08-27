# Step 1: 135°フック 余長을 `hookTails`에 낸다 — 골든 먼저

**전제**: step 0이 `completed`다.

## 배경

`docs/ADR.md`의 **ADR-040**을 **2026-08-27 정정까지** 읽어라. ADR-019도 읽어라.

첫 시도에서 「余長을 `points`에 넣는다」는 안이 반증됐다. `points`는 数量의
行 키(`quantityLineId`)에 들어가고 그 키가 `QuantityLine.id`가 되며
`project.notes`가 그 id로 사용자 메모를 담는다 — 바꾸면 **저장된 案件의 메모가
조용히 떨어진다.** 그래서 余長은 **새 필드로 뺀다.**

바꾸는 것은 **3D 形状뿐**이고 数量은 한 값도 움직이면 안 된다(1通則2)).

## 할 일 (골든 먼저 — TDD)

1. **필드** — `src/domain/model/rebar.ts`의 `Rebar`에
   `hookTails?: [Vec3, Vec3]`를 더한다(좌표 튜플의 표기는 `points`와 같게).
   - 뜻: 두 훅 꼬리의 **먼 쪽 끝점**. 둘 다 **`points[0]`에서 출발한다**.
   - **`points`·`closed`는 한 값도 바꾸지 마라.** 矩形은 4점·`closed: true`,
     円形도 지금 그대로다.
   - `points`의 doc 주석이 「3D 표시의 유일한 출처」라고 말하고 있다 —
     더 이상 유일하지 않으므로 **그 한 줄을 정확하게 고쳐라**(지우지 말고).
   - `hookTails`가 왜 `points` 밖에 있는지(数量 行 키·`notes`) 주석에 적어라.
     다음 사람이 「합치면 깔끔한데」라고 되돌리는 것을 막는 게 이 주석의 일이다.
2. **골든** — `tests/golden/fixtures/fabrication-length.json`의
   `column-hoop-closed-shape`·`girder-stirrup-closed-shape`:
   - `expectedFabricationLengthMm`을 **2956 / 2056**으로 올려라(직선부 ＋ 余長×2).
   - 길이 계산은 `tests/golden/fabrication-length.test.ts`의 `polylineLength`에
     **꼬리를 더한 값**이다: `polylineLength(points, closed) ＋ Σ|tail − points[0]|`.
     그 계산은 **테스트 안에** 둬라 — 소비자가 하나인 함수를 프로덕션에 만들지 마라.
   - `deviation`을 **지우지 말고 좁혀라** — `term`을 折曲げ内法直径 쪽으로 바꾸고,
     이제 남은 차액은 「余長은 그렸고 曲げ部の伸び가 남았다」를 뜻한다.
     그 차액을 원문 근거 없이 지어내지 마라 — **값을 정할 수 없으면 `missingMm`을
     빼고 `status`를 그대로 둔 채 note에 「미확정(表5.3.1 折曲げ図が画像)」이라고
     적고, 테스트의 「차액이 대장과 맞는다」 항목이 그 케이스를 건너뛰게 하라.**
     대장 항목을 **삭제**해서 통과시키는 것은 반칙이다.
   - `derivation`에 余長의 유도(`bend.hook135` 6d × 呼び名径 13 ＝ 78, 양 끝)를 적어라.
   - **円形 帯筋** 케이스를 하나 더해라. 円形 폴리라인은 원의 다각형 근사라
     절대값 대조가 근사에 물리므로, 기대값은 **「꼬리를 뺀 폴리라인 대비 증분이
     정확히 2 × 6d × 呼び名径」**로 잡아라.
3. **구현** — `src/domain/rebar/column.ts`(帯筋)·`src/domain/rebar/girder.ts`
   (あばら筋)에서 `hookTails`를 채운다:
   - 余長 길이는 룰팩 `bend.hook135`를 조회해 呼び名径에 곱해 얻는다.
     **`.ts`에 6이나 78을 쓰지 마라.**
   - 방향은 `points[0]` 코너에서 **단면 안쪽 대각**이다(ADR-040 §3).
     두 꼬리가 같은 점에서 갈라지므로 좌표는 서로 달라야 한다 — 어떻게 가르는지
     `formula`의 3D 形状 절에 한 줄로 적어라.
   - 円形: 한 점에서 **안쪽 반경 방향**으로 두 꼬리.
   - `ruleHits`에 `bend.hook135`를 **넣지 마라** — 그 항은 数量을 정하지 않는데
     内訳 행의 근거로 표시된다(column.ts의 기존 주석이 같은 이유로 かぶり를
     빼고 있다). `formula`에만 적어라.
4. **数量 불변 회귀** — 다음 셋을 고정하는 테스트를 써라. **셋 다 구현을 흔들면
   실패해야 한다.**
   - `Rebar.length`·`count`가 이 변경에 닿지 않는다 — 「지금 값과 같다」가 아니라
     **1通則2)의 유도값과 같다**로 적어라.
   - **`QuantityLine.id` 문자열이 `hookTails`에 무관하다** — 같은 鉄筋에
     `hookTails`를 넣은 것과 뺀 것의 `quantityLineId`가 **문자 그대로 같다**.
   - **`project.notes`가 계속 붙어 있다** — 帯筋 행에 메모를 단 `Project`를
     `hookTails`가 있는 산정 결과로 내보냈을 때 그 메모가 그 행에 실린다.
     (이 셋이 첫 시도에서 반증된 바로 그 지점이다.)
5. **기존 골든의 기대값을 고치지 마라** — `quantity-r5-ch3.json`·
   `spec-r7-ch5.json`의 数量 기대값이 움직여야 통과한다면 `blocked`.
   `polylineLength`를 읽는 다른 테스트(`girder.test.ts`의 `tie`·`sideBar` 등)가
   깨지면 그것은 **범위 침범**이다 — 幅止め筋·腹筋은 건드리지 마라.
   `points`를 안 바꾸므로 이들은 원래 안 깨져야 한다. 깨지면 원인을 적어라.

## 하지 말 것

- **`Rebar.points`·`closed`를 바꾸지 마라.**
- **`quantityLineId`·`aggregateQuantity`를 바꾸지 마라.**
- `src/components/**`·`src/lib/viewer/**` 수정 금지(step 2에서 한다).
- 幅止め筋·主筋·壁筋·床板筋의 형상 변경 금지.
- 表5.3.1 注1의 4d를 그리지 마라 — 설계도서 조건이다(ADR-040 §6, step 3에서 전사).
- 折曲げ内法直径으로 인한 曲げ部の伸び를 지어내지 마라.
- 배근 규준 수치를 코드에 쓰지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`·`step0-report.json`을 지우지 마라.
- **검증 스크립트를 `src/` 아래에 만들지 마라** — phase 디렉터리 안에 둬라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/28-shear-hook-shape/step1-report.json`: 골든 기대값의 손 유도,
`deviation` 대장을 어떻게 좁혔는지, 数量 불변 회귀 셋이 각각 무엇을 흔들면
깨지는지(실제로 흔들어 확인하고 원복하라), 게이트 결과.
