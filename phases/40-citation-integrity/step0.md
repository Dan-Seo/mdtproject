# Step 0 (검증 게이트): tsu axis 전사를 반증하라

## 배경

phase 39 step 4 게이트가 둘을 반증했다. **판정은 성립하고 근거도 유효하다** —
이번에는 인용 경로를 파일 존재만이 아니라 **JSON 포인터 해석까지** 확인했다.

1. `elevation.ts`의 `SHORT_DIMENSION_SCALE_TOLERANCE_RATIO` 주석에 남은 `150`이
   `phases/38-elevation-close/step3-report.json`에 없다. 편차 `0.176`은 있으나
   그 편차가 **150mm 치수의 것**이라는 대응은 그 report 어디에도 없다.
2. `docs/RISKS.md`가 인용한 `source` 포인터 12개가 해석되지 않는다. 파일은 있으나
   가리킨 키가 없다 — 예: `phases/38-elevation-close/step4-report.json#/rejectedLevelLikeStrings/0/text`.

둘 다 **내용이 아니라 인용의 결함**이다. 이 phase가 닫는다.

12개 중 7개는 「미전사 axis 항목이 어느 通り에 대응하는가」를 골든의 **없는 경로**에
인용한 것이었다. Claude가 그 주장을 없애는 쪽을 택해 axis 3건을 전사했다
(커밋 `03bb3d8`). 이 스텝은 **그 전사를 독립 재현으로 반증**한다. 고치지 마라.

## 반증할 주장

- **B1** `.cache/dwg-tsu-kanritou.pdf` 21면(0-based 20)의 軸組図 블록은 **3개**이고
  **셋 다** 通り芯 라벨이 `X1`〜`X5`, 인접 치수가 `5850·5150·7175·3825`, 合計가 `22,000`이다.
- **B2** 같은 PDF 22면(0-based 21)의 軸組図 블록은 **5개**이고 **다섯 다**
  라벨이 `Y1·Y2·Y3`, 치수가 `7175·5825`, 合計가 `13,000`이다.
- **B3** 따라서 「한 면 안의 모든 블록이 같은 축을 쓴다」가 성립하며, 제목이 없는 골든
  항목이 어느 블록에 대응하는지 몰라도 axis 값이 정해진다.
  라벨은 **전각**(`Ｘ`=U+FF38, `Ｙ`=U+FF39)이고 페이지는 회전(span `dir`=(0,-1))이라
  표시 좌→우가 fitz y **내림차순**임을 좌표로 보여라.
- **B4** p22 골든의 `Y1·Y2·Y3 / 7175·5825`는 `tsu-kanritou-p16-grid.json`의 `y`
  (`Y3·Y2·Y1 / 5825·7175`)를 뒤집은 것과 일치한다.
- **B5** 현재 `tests/fixtures/plan-import/expected/`의 **모든** axis 블록에서
  「라벨 수 = 스팬 수 + 1」과 「`totalMm`이 null이 아니면 스팬 합 = `totalMm`」이 성립한다.
  검사한 axis 블록 수를 세라(Claude 실측 **26**). 다르면 그 수와 차이를 적어라.
- **B6** `axis` 없는 elevation 항목이 **0개**다.

## 하지 말 것

- 골든·코드·테스트를 고치지 마라. 읽기와 계수만이다.
- 파서 출력에서 기대값을 유도하지 마라. B1·B2·B4의 근거는 **PDF 원본**이다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`에:

- `verdict`: `"not_refuted"` 또는 `"refuted"`
- `claims`: B1〜B6 각각 `{ "id", "holds", "method", "evidence" }`.
  B1·B2의 `evidence`에는 **블록별로** 라벨 목록과 각 라벨의 (x, y), 그 사이 치수를 적어라.
- `paths_verified`: 근거로 읽은 파일과 존재 여부(전부 true여야 한다).
- `pointers_verified`: report가 쓴 **모든 `#/...` JSON 포인터**와 해석 성공 여부.
  **하나라도 실패하면 `refuted`다.** 파일 존재만 확인하고 넘어가지 마라 —
  phase 39가 정확히 그 지점에서 반증됐다.

하나라도 `holds: false`면 `refuted`로 종결하라.
