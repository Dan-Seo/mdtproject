# Step 5 (verify · gate): phase 36의 산출을 반증하라

## 배경

step 0〜4가 코퍼스를 14면→36면(발주처 3→10곳)으로 넓히고 파서를 확장했다. 이
스텝은 **검증 전용**이다 — 고치지 않는다. 반증이 하나라도 성립하면 status를
`refuted`로 두고 무엇이 어긋났는지 적는다(`error`가 아니다 — `error`는 하네스가
재시도해 기록을 지운다). 성립하지 않으면 `completed`. 이 스텝은 `gate`라 `refuted`면
step 6(docs)이 돌지 않는다 — 기록이 거짓이 되지 않게 하기 위해서다.

교차검증의 원리: step 0〜4는 codex의 자기 보고이고, `expected/*.json`은 Claude의
전사다. 여기서는 **둘 다** 원문(픽스처 items ＝ 도면 텍스트)과 대조한다.

## 반증 항목

1. **지어냄** — 36면 전부에서 후보(リスト 셀 값·격자 스팬·合計·階高·레벨 라벨)의
   문자열이 그 페이지 픽스처 items에 **없는** 것이 있는가. 숫자는 쉼표 유무를 무시하고
   인접 items를 이어 붙인 문자열에서 찾는다. 하나라도 없으면 반증 성립.
2. **전사 오류(Claude 검증)** — `tests/fixtures/section-import/expected/{karatsu-karayaku-s4-*,
   ina-pump-p7-*, saiki-fire-p1-*, saiki-fire-p2-*, fuji-kanritou-p20-*}.json`과
   `tests/fixtures/plan-import/expected/*.json`의 **모든** 셀 값·스팬·合計·부호·레벨
   라벨이 그 페이지 픽스처 items에 존재하는가(같은 방법). 없으면 **전사가 틀린
   것**이니 파일·경로·값을 적어라 — 고치지 마라. 골든 notes에 「확정하지 못했다」
   「미전사」라고 적힌 항목은 제외한다.
3. **반증 가능성** — 골든 파일 사본의 값 하나를 바꿔(격자 스팬 하나·主筋 하나·階高
   하나·合計 하나) 해당 테스트가 **실패하는지** 골든당 1회. 실패하지 않는 골든이
   있으면 반증 성립(그 테스트는 골든을 안 보고 있다). 임시 변경은 반드시 원복하고
   `git status`로 확인하라.
4. **회귀** — 기존 14면의 リスト·격자·階高 결과가 `step0-report.json`의 실태 표와
   동일한가. 한 칸이라도 다르면 반증 성립.
5. **문턱 스윕** — `MIDPOINT_TOLERANCE_PT`를 4·6·15·30·40으로 갈아끼워 36면 격자
   결과를 재라. **T=4에서 기존 코퍼스(kani-p38·p39·yokohama-p6·p7)의 `寸法欠落`이
   재현되지 않으면 값이 실행 경로에 닿지 않은 것이다** — 측정을 다시 하라. 「전
   구간 동일」은 결과가 아니라 값이 안 닿은 신호다. 창 6pt 이상 30pt 미만이 2차
   코퍼스에서 깨지면(6에서 빠지거나 30 미만에서 오탐) 반증 성립이 아니라 **R15
   기록 사항**이니 report의 `midpoint_sweep`에 적어라. 상수는 원복.
6. **도면 특화** — step 1〜4의 `git diff main...HEAD -- src/lib/import`에 파일명·
   발주처명·시트번호 분기, 또는 36면 중 한 면만 지나가는 상수가 있는가. 있으면
   반증 성립(어느 줄인지).
7. **표제란** — 22면 픽스처에 `/TEL|FAX|℡|電話|一級建築士|設計事務所|株式会社|共同体/`
   매치가 0건인가(step 0의 검사를 **독립 재실행**). 1건이라도 있으면 반증 성립 —
   개인정보가 커밋된다.
8. **2段筋·特記** — saiki 2段 셀(골든 `two_layer` 표기)에서 후보가 본수를 내고
   있는가, ina 빈 STP 셀에 특기 기본값이 채워져 있는가. 하나라도 그렇다면 반증 성립.

## 하지 말 것

- 코드·골든·픽스처를 고치지 마라. 임시 변경(스윕·변조)은 원복하고 `git status`가
  깨끗함을 report에 적어라.
- `error`로 끝내지 마라 — 반증 성립은 `refuted`, 불성립은 `completed`.
- 「돌려봤다」「통과했다」는 검증이 아니다. 각 항목은 **틀렸을 때 실패하는 절차**로
  실행하고 그 절차와 결과를 적어라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## 산출물

`phases/36-corpus-widen-2/step5-report.json`:

```json
{
  "verdict": "completed|refuted",
  "items": {
    "1_fabrication": { "holds": false, "evidence": [] },
    "2_transcription": { "holds": false, "evidence": [] },
    "3_falsifiability": { "holds": false, "evidence": [] },
    "4_regression": { "holds": false, "evidence": [] },
    "5_sweep": { "holds": false, "midpoint_sweep": { "4": "", "6": "", "15": "", "30": "", "40": "" }, "window_kept": true },
    "6_specialization": { "holds": false, "evidence": [] },
    "7_title_block": { "holds": false, "matches": 0 },
    "8_two_layer_and_defaults": { "holds": false, "evidence": [] }
  },
  "git_status_clean": true,
  "summary": "index.json summary와 같은 요지"
}
```
