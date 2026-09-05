# Step 3: 인용을 기계가 검사하게 하라

## 배경

같은 고장이 세 번 났다.

1. phase 38 step 6 — 변조했다는 골든 **파일 세 개가 존재하지 않았다.** 판정은 맞았으나
   근거가 통째로 무효였다.
2. phase 39 step 3 — 문서 `source` 포인터 **12개가 해석되지 않았다.**
   파일 존재만 확인했기 때문에 그 스텝의 AC를 통과했다.
3. phase 39 step 1의 첫 시도 — `levels[]`를 대조한다고 `CLAIMED`에 적었으나
   실제로는 어떤 테스트도 읽지 않았다.

셋의 공통점은 「가리킨 것이 실재하는지 아무도 기계적으로 확인하지 않는다」다.
사양에 「확인하라」라고 쓰는 것만으로는 세 번 다 막지 못했다.

## 할 일

`scripts/check-citations.py`를 만들어라. 하는 일은 하나다 —
**report의 인용이 해석되는지 검사한다.**

- 입력: report JSON 파일 경로 하나 이상 (예: `python scripts/check-citations.py phases/40-*/step*-report.json`)
- report 안에서 `"source"` 값 중 다음 두 꼴을 찾는다.
  - `경로` — 파일이 실재해야 한다
  - `경로#/a/b/0/c` — 파일이 실재하고 **JSON 포인터가 해석**돼야 한다
- 해석 실패를 한 건이라도 찾으면 **비영 종료코드**와 함께 `{파일, 포인터, 실패 이유}`를
  줄 단위로 출력한다. 전부 성공이면 0으로 끝난다.
- 배열 인덱스, 없는 키, 파일 없음, JSON 파싱 실패를 각각 구분해 이유를 적어라.

그리고 이 phase의 모든 report(`step0`〜`step3`)에 대해 실행해 결과를 남겨라.

## 하지 말 것

- 제품 코드(`src/`)를 건드리지 마라. 이것은 개발 도구다.
- 「검사기」를 룰 DSL이나 프레임워크로 키우지 마라. 파일 하나, 표준 라이브러리만.
  100줄을 넘기면 과하다.
- report 스키마를 새로 정의하지 마라. 지금 report들이 이미 쓰는 `source` 꼴만 읽는다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `python scripts/check-citations.py phases/40-citation-integrity/step*-report.json` 이
  **0으로 끝난다.**
- **반증 실측**: 임시로 어느 report의 `source` 하나를 없는 포인터로 바꾸면
  비영으로 끝나는지 재고, 원복하라. `{ "mutation", "exit_code", "stdout" }`로 적어라.
- 과거 사고 재현: `phases/38-elevation-close/step6-report.json`에 이 검사기를 돌려라.
  그 report가 지어낸 세 경로를 **검사기가 잡는지** 확인하고 출력을 그대로 실어라.
  (그 report는 `source` 꼴이 아닐 수 있다 — 그렇다면 무엇을 못 잡는지 한계로 적어라.
  검사기를 그 파일에 맞춰 특별대우하지 마라.)
- `npm run lint` 통과. 이 스텝은 테스트 결과를 바꾸지 않는다.
