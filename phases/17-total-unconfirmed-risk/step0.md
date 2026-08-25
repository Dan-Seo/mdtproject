# Step 0: R15가 가리키는 대상을 바꿔라 — 「1본 축」이 아니라 「合計이 확인되지 않은 축」

phase 16 step 1이 「1본 축을 거절하면 실도면 커버리지를 잃는다」를 반증했다.
그 측정을 교차검증하면서 R15의 전제가 어긋난 것이 드러났다.

R15는 이렇게 서 있다:

> **R15 (열림 — 스팬 1본 축의 검산 공회전)** framing-plan은 라벨 2개인 스팬
> 1본 축도 후보를 내므로, 그 축에서는 合計와 스팬 합의 대조가 원리상 아무것도
> 배제하지 못한다. 남는 검증은 중점 매칭(±15pt) 하나라서 (...)

**노출의 서술은 맞다. 대상이 틀렸다.**

`totalConfirmed`는 `parse.ts:378`에서 `total !== undefined`다. 불일치는
`parse.ts:369`에서 `合計不一致`로 **먼저 거절**되므로 `true`는 「찾았고 또
맞았다」는 뜻이고, `false`는 **合計이 아예 없어 검산이 돌지 않았다**는 뜻이다.
즉 「검산이 공회전하고 중점 매칭만 남는다」는 상태는 1본 축의 전유물이 아니라
**`totalConfirmed === false`인 축 전부**다.

## 힌트 — 그대로 베끼지 말고 직접 재라

교차검증에서 나온 값이다. **네 손으로 다시 재서 확인한 뒤에 쓰라.** 숫자가
다르면 네 측정을 믿고, 무엇이 어떻게 달랐는지 report에 적어라.

8부 코퍼스에 `parseFramingPlan`을 돌린 결과:

```
kani-p38     X(축4) Y(축3)   totalConfirmed = true,  true
kani-p40     Y(축3)          totalConfirmed = true
yokohama-p7  X(축4) Y(축6)   totalConfirmed = false, false
yokohama-p8  X(축3)          totalConfirmed = false
ojkk-p2·p3, yokohama-p13·p14 → grids 0 (通り芯ラベル未検出)
```

- 격자 **6건**. 축 2개(＝스팬 1본)짜리 **0건**.
- `totalConfirmed === false` **3건** — yokohama-p7 X·Y, yokohama-p8 X.

즉 R15가 이름으로 단 경로는 코퍼스에 **0/6**이고, 같은 노출이 실제로
일어나는 경로는 **3/6**이다. 조이기 판단의 근거도 뒤집힌다 — 1본 축은
조여도 잃는 것이 없지만(phase 16 step 1이 반증), 合計 없는 축을 조이면
**yokohama 두 장을 통째로 잃는다.**

**셈 정정 하나.** `phases/16-span1-record/step1-report.json`의 서술문은
「grids 7건」이라 적었으나 실제는 **6건**이다. 같은 보고서의 표는 정확했고
서술문의 셈만 어긋났으며, 축 2개짜리가 0건이라는 **반증 판정은 그대로다.**
지난 phase의 보고서 파일은 기록이므로 **고치지 마라.** 새 문서에 7이
흘러 들어가지 않게만 하고, 네 측정으로 6을 확인했다는 것을 report에 적어라.

## 할 일

### 1. `docs/RISKS.md`의 R15를 다시 써라

제목의 대상을 바꾸고(「스팬 1본 축」 → 合計이 확인되지 않은 축), 본문에
아래를 담아라. 문장은 네가 쓰되 기존 R 항목들의 어투를 따를 것.

- 노출의 정의: `totalConfirmed === false`면 合計 검산이 돌지 않고 남는
  검증은 중점 매칭(`MIDPOINT_TOLERANCE_PT = 15`) 하나다. 축척 일관성은
  스팬이 둘 이상이면 대조 상대가 있으므로 1본 축과 다르다 — 구분해서 써라.
- 코퍼스 실측: 격자 6건 중 3건이 `false`(yokohama-p7 X·Y, p8 X).
- 1본 축은 **0/6**이고 phase 16 step 1이 「조여도 잃는 것이 없다」를
  측정으로 확정했다. 그러나 **合計 없는 축을 조이면 yokohama 두 장을 잃는다** —
  대상이 다르므로 그 반증을 이쪽 판단의 근거로 쓰지 마라.
- `断面リスト` 4부가 막히는 이유가 스팬 수가 아니라 sticky 라벨 패턴
  (`X2端`)이라는 기존 서술은 **유지하라.** 그건 지금도 참이다.
- 닫는 조건: 중점 매칭이 실제로 무엇을 거르는지 재는 것 (step 1).

### 2. `CLAUDE.md`와 `AGENTS.md`의 열린 리스크 표에서 R15 행을 고쳐라

두 파일에 같은 표가 있다. **둘 다** 고쳐라. 현재 행은 이렇다:

```
| R15 | 열림 | 스팬 1본 축은 合計 검산이 공회전하고 중점 매칭(±15pt)만 남는다 → 실도면 코퍼스 측정 필요 |
```

한 줄 요약이므로 「合計이 확인되지 않은 축」과 「코퍼스 6건 중 3건」이
들어가게 고쳐 쓰되, 표의 다른 행과 길이·어투를 맞춰라.

## 하지 말 것

- **코드를 고치지 마라.** 이 스텝은 문서뿐이다. `src/`·`tests/`에 변경이
  있으면 잘못된 것이다. `MIDPOINT_TOLERANCE_PT`도 그대로 15다.
- **`合計` 없는 축을 거절하게 만들지 마라.** 이 스텝은 기록이고, 조일지
  말지는 step 1의 측정 뒤에 사람이 정한다. 근거 없이 조이면 실도면
  커버리지가 조용히 줄어든다.
- **다른 R 항목을 손대지 마라.** R11이 순서에서 벗어나 끝에 있는 것도
  그대로 둔다.
- 지난 phase의 `step*-report.json`을 고치지 마라 — 기록이다.
- **`scripts/execute.py`를 실행하지 마라** — 재귀다.

## AC

1. `npm run test`·`npm run test:golden` 통과.
2. `npx tsc --noEmit` 무출력, `npm run lint` 0 errors
   (`route.test.ts:161`의 `_omitted` warning은 기존 것이다).
3. `git diff -- src/ tests/`가 **비어 있다.** 확인하고 report에 적어라.
4. `docs/RISKS.md`에서 **R15 외의 항목이 바뀌지 않았다** — `git diff`로
   hunk가 R15 하나인지 확인하고 report에 적어라.
5. `CLAUDE.md`·`AGENTS.md` 둘 다 R15 행이 갱신됐고, 두 파일의 R15 행이
   서로 같다.

## 산출물

`phases/17-total-unconfirmed-risk/step0-report.json`:

```json
{
  "remeasured": {
    "grids": "파일·방향별 축 수와 totalConfirmed, 그리고 총 격자 수",
    "two_axis": "축 2개짜리 후보 수",
    "total_unconfirmed": "totalConfirmed=false인 격자와 그 소속 페이지"
  },
  "hint_mismatch": "힌트와 다른 값이 나왔다면 무엇이 어떻게 달랐는가, 없으면 none",
  "edits": ["고친 파일과 무엇을 고쳤는지"],
  "diff_check": "AC3·AC4·AC5를 git diff로 확인한 결과",
  "gates": {"test": "", "golden": "", "tsc": "", "lint": ""},
  "summary": "index.json의 summary와 같은 요지"
}
```
