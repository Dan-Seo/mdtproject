# Step 1: 넓힌 코퍼스에서 세 문턱을 재측정하고 기록을 갱신하라

## 배경

phase 16·17이 8부 기준으로 셋을 실측해 코드 주석·docs에 박았다:

- `VERTICAL_RUN_GAP_RATIO`(1.5, `src/lib/import/runs.ts`): 같은 열 인접쌍의
  `gap / max(w)` 최솟값 1.000000(6자리 반올림), 0mm 가드의 트립 지점은 정확히
  1.0 — kani-p38 3건 · ojkk-p3 21건 · yokohama-p7 13건 · yokohama-p8 3건.
- `MIDPOINT_TOLERANCE_PT`(15, `src/lib/import/framing-plan/parse.ts`): 안전 창
  6pt 이상 30pt 미만. 채택 치수의 `alongDistance` 최댓값 5.803118pt, `false`
  세 축의 최근접 미사용 경쟁 치수 최소 140.325470pt.
- 0mm 가드(가로, `tests/plan-import/parse.test.ts` 주석): gapRatio 0.5에서
  yokohama-p14 「650x1000」이 갈라져 000이 4건.

step 0이 코퍼스를 14부로 넓혔다(형상 페이지 +4: yokohama-p6·p9, kani-p39·p41.
リスト 페이지 +2: ojkk-p4·yokohama-p15). 이 수치들은 전부 「8부 실측」이라는
단서가 붙어 있으므로, 넓힌 코퍼스에서 같은 측정을 반복해 창과 여유가
유지되는지 재고 기록을 갱신한다. 이것이 R15의 닫는 조건 1단계다 — 다만 伏図를
가진 발주처는 여전히 2곳뿐이므로 R15를 닫지는 마라.

## 할 일

1. **실태 표**: 14부 전부에 `parseFramingPlan`·`parseFrameElevations`를 돌려
   페이지별 표를 만들어라 — 격자는 file / direction / axes / spansMm /
   scalePtPerMm / totalConfirmed / issues, 軸組図는 file / 계열 수 / heightsMm /
   levels / issues. リスト 페이지(断面リスト 4면 ＋ ojkk-p4·yokohama-p15)는
   격자가 안 나오는 것이 기대 동작이다 — 0인 것을 0으로 적어라.
2. **세로 문턱 재측정**: 14부의 같은 열 인접쌍에서 `gap / max(w)` 분포
   (최솟값, 1.5~2.0 구간의 쌍 수), 그리고 배수를 1.0으로 갈아끼웠을 때 0mm
   가드 발화 수를 파일별로 재라. **1.0에서 발화가 0이면 값이 실행 경로에 닿지
   않은 것이다 — 기존 8부의 40건이 재현되는지부터 확인하고 다시 재라.**
3. **중점 창 재측정**: `MIDPOINT_TOLERANCE_PT`를 4·6·15·30·40으로 갈아끼워
   각 값의 격자 결과 변화를 재라. **T=4에서 기존 코퍼스의 寸法欠落이 재현되지
   않으면 값이 안 닿은 것이다.** 채택 치수 `alongDistance` 최댓값과 최근접
   미사용 경쟁 치수 최솟값을 새 페이지 포함으로 갱신하라.
4. **기록 갱신** — 측정이 끝난 뒤에만:
   - `src/lib/import/runs.ts`의 `VERTICAL_RUN_GAP_RATIO` 주석 (8부 수치 문단)
   - `tests/plan-import/parse.test.ts`의 0mm 가드 주석·테스트명(「실도면 8부」)
     ·`DRAWING_FIXTURES`(14부 전부로)
   - `src/lib/import/framing-plan/parse.ts`의 `MIDPOINT_TOLERANCE_PT` 주석
   - `docs/RISKS.md` R15에 넓힌 코퍼스 결과를 추기 (닫지 마라)
   - 수치가 달라졌으면 `CLAUDE.md`·`AGENTS.md`의 R15 행 — **표의 다른 행과
     길이·어투를 맞춰라**
5. **새 형상 페이지의 실태를 테스트로 고정하라**: yokohama-p6·p9의 파서 출력이
   안정적이면 기대값을 인라인 테스트로 박아라. **기대값은 픽스처 원시 items
   (도면 원문)에서 전사하고 출처 주석을 달아라** — 파서 출력을 복사해 붙이는
   것은 골든이 아니다. kani-p39·p41이 빈 결과·issues라면 그 빈 결과 그대로
   고정하라 — 지원하게 만들지 마라.

## 하지 말 것

- `src/lib/import/**`의 **로직·상수를 바꾸지 마라.** 이 스텝의 산출물은 측정과
  기록(주석·테스트·docs)이다. 스윕에서 갈아끼우는 것은 측정용 임시 변경이고
  반드시 원복하라 — 끝나고 `git diff`로 로직 변경이 없음을 확인해 report에 적어라.
- 새 페이지가 격자를 못 내도 파서를 고치지 마라 — 실태 기록이 목적이다. 지원
  확대는 별 phase다.
- 배수 1.0의 발화 수를 테스트로 박지 마라 — 부동소수 칼끝이라 flaky다
  (phase 16의 결정). 수치는 주석·report에만 적는다.
- T=15에서 실패하는 새 페이지가 다른 T에서 合計 확인까지 성공하는 것을
  발견하면, 상수를 조정하지 말고 report에 적고 status를 `blocked`로 두어라 —
  창 설계는 사람 판단이다.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## AC

- `npm run test` 전체 통과.
- `git diff`에 `src/lib/import/**` 로직·상수 변경 없음 (주석만 허용).
- step1-report.json에 표·스윕 수치·갱신 파일 목록이 있다.

## 산출물

`phases/18-plan-corpus-widen/step1-report.json`:

```json
{
  "grids": [{ "file": "...", "direction": "x|y", "axes": 0, "spansMm": [], "scalePtPerMm": 0, "totalConfirmed": true, "issues": [] }],
  "elevations": [{ "file": "...", "series": 0, "heightsMm": [], "issues": [] }],
  "vertical_sweep": { "min_gap_ratio": 0, "pairs_1_5_to_2": 0, "fires_at_1_0": { "파일별": 0 } },
  "midpoint_sweep": { "4": "...", "6": "...", "15": "...", "30": "...", "40": "...", "adopted_max_pt": 0, "competitor_min_pt": 0 },
  "updated_files": [],
  "logic_diff_clean": true,
  "summary": "index.json summary와 같은 요지"
}
```
