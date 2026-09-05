# Step 0 (검증 게이트): 전사 수정을 반증하라

## 배경

phase 38 step 6이 「軸組図 골든의 `axis` 블록을 아무 테스트도 대조하지 않는다」로 반증됐다.
그 판정은 성립하지만 **제출된 근거는 무효**였다 — 변조했다는 세 파일
(`karatsu-jikugumi1-p38.json`·`hirosaki-jikugumi-p15.json`·`tsu-jikugumi-p21.json`)이
레포에 존재하지 않는다. 없는 파일을 고치고 「테스트가 통과했다」고 한 관측은 아무것도 증명하지 않는다.

그 구멍을 파고들다 Claude가 골든 자체의 결함을 하나 찾아 **원본 도면으로 확인하고 고쳤다.**
이 스텝은 그 수정을 **독립 재현으로 반증**하는 것이다. 고치지 마라 — 어긋나면 무엇이 어긋났는지 적어라.

## 반증할 주장

Claude가 커밋한 `tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json` 변경분
(`axis.labels`에 `"X5"` 추가 + `$comment` 추기)에 대해 아래 다섯을 각각 독립 재현하라.

- **A1** `.cache/dwg-tsu-kanritou.pdf` 21면(0-based 20)에는 軸組図 블록이 **셋**이고
  (`Ｙ１通り軸組図`·`Ｙ２通り軸組図`·`Ｙ３通り軸組図`), 셋 다 전각 라벨 `Ｘ１`〜`Ｘ５`
  **다섯 개**를 가진다. 골든이 적은 네 개가 아니다.
  힌트: 라벨이 **전각**(`Ｘ`, U+FF38)이라 ASCII `X`로 찾으면 0건이다. 페이지는 회전돼 있어
  span의 `dir`이 `(0,-1)`이고, 표시 좌우는 fitz y **내림차순**(= X1→X5)이다.
  PyMuPDF `get_text("rawdict")`로 span을 복원해 좌표와 함께 세어라 (ADR-010).
- **A2** 인접 라벨 사이 치수는 `5,850 / 5,150 / 7,175 / 3,825`이고 合計는 `22,000`이다
  — 즉 **스팬 배열과 `totalMm`은 원본과 이미 일치했고 라벨만 빠져 있었다.**
- **A3** 수정 **전** 값(`git show HEAD~1:...` 또는 phase 38 브랜치의 해당 파일)은
  라벨 4개·스팬 4개로 「라벨 수 = 스팬 수 + 1」을 깨고, 수정 **후**는 지킨다.
  그리고 `tests/fixtures/plan-import/expected/` 아래 **모든** 골든의 모든 axis 블록
  (elevation의 `elevations[].axis`, grid의 `blocks[].x`·`blocks[].y`)에 대해
  수정 후 이 불변식 위반이 **0건**임을 계수하라.
- **A4** 나머지 두 건물의 axis 전사는 **원본과 일치한다**(따라서 이번 수정 대상이 아니다).
  - `.cache/dwg-karatsu-jikugumi1.pdf` 1면 → `karatsu-jikugumi1-p1-elevation.json`
    3블록(X2·X3·X4通り)의 labels·spansMm
  - `.cache/dwg-hirosaki-kikyono.pdf` 25면 → `hirosaki-kikyono-p25-elevation.json`
    3블록(X1·X2·X3通り)의 labels·spansMm·totalMm
- **A5** phase 38 `step6-report.json`이 변조했다고 적은 세 경로가 레포에 **없다**.
  `find tests -name "<파일명>"` 세 번의 출력이 전부 빈 결과임을 report에 그대로 실어라.

## 하지 말 것

- 골든·코드·테스트를 **고치지 마라.** 이 스텝은 읽기와 계수만이다.
- 파서(`src/lib/import/framing-plan/elevation.ts`)의 출력에서 기대값을 유도하지 마라.
  A1·A2·A4의 근거는 **PDF 원본**이어야 한다.
- 존재하지 않는 경로를 report에 적지 마라. **모든 인용 경로는 `test -f`로 존재를 확인한 뒤 적어라.**
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`에 다음을 담아라.

- `verdict`: `"not_refuted"` 또는 `"refuted"`
- `claims`: A1〜A5 각각 `{ "id", "holds": true|false, "method", "evidence" }`.
  `evidence`에는 실제로 읽은 값을 적어라 — A1은 세 블록별 라벨 목록과 각 라벨의 (x, y),
  A3은 위반 건수와 검사한 axis 블록 총수, A5는 세 `find` 명령의 원문 출력.
- `paths_verified`: report가 인용한 모든 파일 경로와 그 존재 여부(true/false).
  **false가 하나라도 있으면 `verdict`는 `refuted`다.**

하나라도 `holds: false`면 `refuted`로 종결하라. 뒤 스텝은 게이트에 막힌다.
