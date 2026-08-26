# Step 2: step 1의 sweep이 재현되지 않는다 — 다시 재고 창을 기록하라

step 1이 「중점 매칭(±15pt)은 실제로 거르는 장치다」를 `refuted`로 냈다.
**그 판정은 틀렸다.** 교차검증에서 sweep이 재현되지 않았다.

step 1 보고서는 두 절로 되어 있고 **서로 모순된다.**

- **slack 절은 맞다.** 채택 `alongDistance` 최댓값 `5.803118pt`
  (yokohama-p7 Y), kani-p38 Y `5.100004`·`5.148004` — 이 값들은 재현된다.
- **sweep 절은 재현되지 않는다.** 문턱 4에서도 `same`이라고 적었는데,
  자기가 잰 5.8pt와 `parse.ts:291`의 `if (alongDistance > MIDPOINT_TOLERANCE_PT) continue`
  를 함께 놓으면 성립할 수 없다. 4에서는 그 치수들이 걸러지고
  `dimensionAt`이 `undefined` → `if (!dimension) break`(331행) →
  `寸法欠落`(335~338행)로 **격자가 통째로 사라진다.**

## 힌트 — 그대로 베끼지 말고 직접 재라

교차검증에서 나온 값이다. **네 손으로 다시 재서 확인한 뒤에 쓰라.** 숫자가
다르면 네 측정을 믿고, 무엇이 어떻게 달랐는지 report에 적어라.

`MIDPOINT_TOLERANCE_PT`를 갈아끼우고 8부에 `parseFramingPlan`을 돌린 결과:

```
T=4    kani-p38     grids 2 → 1   issues [] → ["寸法欠落"]
       yokohama-p7  grids 2 → 1   issues [] → ["寸法欠落"]
T=6    15와 동일
T=8    15와 동일
T=30   yokohama-p7  grids 2 → 2   issues [] → ["合計不一致"]
T=60   위에 더해 yokohama-p8도 ["合計不一致"]
T=150·400  T=60과 같음
```

즉 쓸 수 있는 창은 대략 **(6, 30)**이고 15는 그 안쪽이다. 아래쪽 벽은
채택 최댓값 5.8pt 바로 위이고, 위쪽은 30부터 엉뚱한 치수가 合計 후보로
들어와 뒤쪽 합계 검산이 그것을 잡는다.

**갈아끼운 값이 실행 경로에 실제로 닿았는지 확인하라.** step 1의 sweep이
어긋난 가장 그럴듯한 원인이 그것이다 — 상수를 바꾸고 돌렸는데 출력이
**전 문턱에서 한 글자도 안 바뀌면** 그것부터 의심하라. 예를 들어 문턱을
4로 두고 돌렸을 때 `寸法欠落`이 나오지 않으면 값이 안 닿은 것이다.

## 할 일

### 1. sweep을 다시 재라

문턱 4·6·8·15·30·60·150·400에서 8부의 출력을 15와 대조해 표로 적어라
(파일 / grids 수 / `spansMm` / `totalConfirmed` / `issues`). `issues`가
달라지는 것도 **차이로 세라** — step 1이 이것을 `same`으로 뭉갰다.
실측된 창의 하한·상한을 명시하라.

### 2. `src/lib/import/framing-plan/parse.ts`의 상수 주석을 정정하라

현재 이렇게 적혀 있다:

```
/** 치수 중심과 인접 축 중점의 어긋남 허용. 실측 최대 8pt, 세부 치수 연쇄의
 *  최근접 오탐이 40pt라 그 사이에 둔다 */
const MIDPOINT_TOLERANCE_PT = 15
```

위쪽 값 40pt가 실측과 맞지 않는다 — 8부에서는 **30에서 이미 깨진다.**
네가 잰 창으로 고쳐 쓰고, 아래쪽·위쪽이 각각 **무엇으로 깨지는지**
(`寸法欠落` / `合計不一致`) 적어라. **상수값 15는 그대로 둔다.**

### 3. `docs/RISKS.md`의 R15와 대장 표를 갱신하라

step 1의 「닫는 조건은 step 1에서 중점 매칭이 실제로 무엇을 거르는지
측정하는 것이다」가 이제 측정됐다. 반영할 것:

- 중점 매칭은 **거르는 장치가 맞다.** 창 (하한, 상한)을 네 실측값으로 적어라.
- `totalConfirmed === false`인 세 축에서 **최근접 미사용 경쟁 치수는
  최소 140.325470pt**였다(step 1의 slack 절 — 이 값은 재현된다). ±15의
  9배가 넘는 여유다. 즉 우연한 격자가 서려면 도면에 없던 치수가 중점
  15pt 안에 들어와야 하는데 이 코퍼스에는 그런 것이 없다.
- 따라서 **R15는 닫히지 않되 가벼워진다.** 남는 방어가 「중점 매칭 하나」가
  아니라 「창이 실측된 중점 매칭 ＋ 축척 일관성」이다(축이 3개 이상이라
  스팬이 둘 이상이므로 축척 대조가 성립한다). 닫는 조건은 **더 넓은
  실도면 코퍼스에서 그 여유가 유지되는지**로 바꿔라.
- `CLAUDE.md`·`AGENTS.md`의 R15 행에서 「실측 필요」를 실측 결과로 고쳐라.
  **두 파일 모두** 고치고 두 행이 같아야 한다.

### 4. step 1이 재현되지 않았다는 것을 report에 적어라

`phases/17-total-unconfirmed-risk/step1-report.json`은 **기록이므로 고치지
마라.** step 2 보고서에 「step 1의 sweep 절이 재현되지 않았고 slack 절은
재현됐다」를 어느 행이 어떻게 달랐는지와 함께 남겨라.

## 하지 말 것

- **`MIDPOINT_TOLERANCE_PT`를 바꾸지 마라.** 15 그대로다. 흔드는 실험은
  측정을 위한 것이고 **반드시 원복**한다. `git diff`로 확인하고 적어라.
- 다른 문턱 상수(`BAND_TOLERANCE_PT`·`DIMENSION_WINDOW_PT`·
  `SCALE_TOLERANCE_RATIO`·`SNAP_RATIO`)를 건드리지 마라.
- **테스트를 새로 만들지 마라.** 문턱 창을 테스트로 박으면 픽스처 한 장이
  늘 때마다 깨진다. 이 스텝은 주석·문서다.
- `step1-report.json`·`step0-report.json`을 고치지 마라 — 기록이다.
- 다른 R 항목을 손대지 마라. R11이 끝에 있는 것도 그대로 둔다.
- **`scripts/execute.py`를 실행하지 마라** — 재귀다.

## AC

1. `npm run test`·`npm run test:golden` 통과.
2. `npx tsc --noEmit` 무출력, `npm run lint` 0 errors
   (`route.test.ts:161`의 `_omitted` warning은 기존 것이다).
3. `git diff -- src/ tests/`에 **주석 아닌 줄이 없다.** 특히
   `const MIDPOINT_TOLERANCE_PT = 15`가 그대로다. `git diff`로 확인하고
   report에 적어라.
4. `docs/RISKS.md` diff의 hunk가 **R15 하나**다.
5. `CLAUDE.md`·`AGENTS.md`의 R15 행이 갱신됐고 서로 같다.

## 산출물

`phases/17-total-unconfirmed-risk/step2-report.json`:

```json
{
  "sweep": "문턱 4·6·8·15·30·60·150·400의 파일별 grids/spansMm/totalConfirmed/issues 표",
  "window": {"lower": "하한과 무엇으로 깨지는가", "upper": "상한과 무엇으로 깨지는가"},
  "step1_reproduction": "step 1의 sweep 절·slack 절이 각각 재현됐는가, 어느 행이 어떻게 달랐는가",
  "hint_mismatch": "힌트와 다른 값이 나왔다면 무엇이 어떻게 달랐는가, 없으면 none",
  "edits": ["고친 파일과 무엇을 고쳤는지"],
  "diff_check": "AC3·AC4·AC5를 git diff로 확인한 결과",
  "gates": {"test": "", "golden": "", "tsc": "", "lint": ""},
  "summary": "index.json의 summary와 같은 요지"
}
```
