# Step 2: 階高 파서를 발주처 3곳의 軸組図로 일반화하라

## 배경

`parseFrameElevations`(`src/lib/import/framing-plan/elevation.ts`)는 yokohama p8·p9와
kani p40·p41(읽지 못함을 고정)에 맞춰져 있다. 골든은 Claude가 독립 전사한
`tests/fixtures/plan-import/expected/*-elevation.json` 3개다:

- `karatsu-jikugumi1-p1-elevation.json` — 레벨 RFL·2FL·1FL·GL, 階高 `[3500, 3500, 150]`.
  통り 블록 셋(X2·X3·X4)이 같은 치수 열을 공유한다.
- `tsu-kanritou-p21-elevation.json` — **아래쪽만** 확정: `levelsBottom` 2FL·1FL·設計GL·
  基礎下端, `heightsBottomMm` `[3500, 150, 1170]`. 파서 결과 `heightsMm`의 **끝 세
  구간**만 대조한다(위쪽은 미전사).
- `hirosaki-kikyono-p25-elevation.json` — X1通り 6구간 `[3400, 4000, 4000, 4500, 100, 2310]`,
  X2·X3通り 5구간(RFL 없음).

알려진 어긋남:

- **150·100mm 레벨** — 1/100에서 4.25pt·2.8pt다. 현행은 같은 자리(5pt 이내)의 라벨
  둘을 한 레벨로 접는다(yokohama 1FL/GL 190mm에는 치수가 없었다). 이 도면들은
  **치수 열에 150·100이 명시**돼 있어 별 구간이다. 규약: 치수 열에 그 값이 있으면
  구간으로 세고, 없으면 접는다. kani p40의 「150450」 붙음은 여전히 가르지 않는다
  (phase 18 결정 — 1.3pt로 가르면 도면 하나에 맞춘 것이다).
- **보조 레벨** — tsu에는 梁天端(水下)·1SL·基礎梁天端·B.PL下端이 같은 열 근처에
  있다(골든 notes). 어느 레벨이 階의 경계인지는 정하지 않는다(ADR-030) — 치수
  열이 앵커이고 라벨은 원문 그대로 싣는다.
- 골든의 `elevations[].axis`(軸組図의 X/Y 스팬)는 **이 스텝의 AC가 아니다.**
  읽었으면 대조해 report에 적어라. 읽으려고 `BLOCK_TITLE_PATTERN`에 軸組図를 넣지
  마라 — 伏図 격자와 섞인다.

## 할 일

1. **골든 테스트 먼저** — `tests/plan-import/corpus2-elevation.test.ts`(새 파일)에
   3면의 계열 수·`heightsMm`·레벨 라벨(원문 그대로, 같은 높이 둘은 둘 다)을
   `toEqual`로 고정하라. tsu는 끝 세 구간만. 먼저 실패하는 것을 확인한 뒤 구현하라.
2. 규약대로 구현하라 — 치수 열의 값이 있는 작은 구간을 잃지 않게. 축척은 치수
   열에서 유도하고(현행), 150·100 구간도 같은 축척으로 검산에 들어가야 한다.
3. **회귀 고정** — yokohama p8·p9·kani p40·p41의 결과가 `step0-report.json`의 실태
   표와 동일해야 한다(기존 테스트가 이미 덮는다 — 통과하는지 확인만).

## 하지 말 것

- 도면 하나에만 맞는 상수·파일명 분기를 넣지 마라. 새 규칙은 최소 2면이 지나가야
  한다 — 1면뿐이면 report에 「1면 근거」라고 적어라.
- 골든을 고치지 마라. 어긋나면 테스트를 실패한 채로 두고 report에 적고 `blocked`.
- `src/lib/import/section-list/**`·`framing-plan/parse.ts`를 건드리지 마라(step 1이
  방금 만졌다 — 충돌 방지).
- 階 경계·Story 대응을 정하지 마라(ADR-030·ADR-035).
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과 — 3면 골든 통과(또는 `blocked`에 사유).
- 기존 4면 階高 결과 동일.

## 산출물

`phases/36-corpus-widen-2/step2-report.json`:

```json
{
  "goldens": { "<file>": "passed|failed" },
  "rules_added": [{ "rule": "", "pages_exercised": [] }],
  "axis_readback": { "<file>": "대조 결과 또는 not-read" },
  "existing4_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
