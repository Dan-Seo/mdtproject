# Step 1: 검사기가 report의 「경로 주장」까지 대조하게 하라

## 배경

`scripts/check-citations.py`(phase 40 step 3)는 `source` 인용만 검사한다.
그 스텝의 report에 한계가 적혀 있다 — phase 38이 지어낸 골든 파일 세 개는 `source`가 아니라
`fixture` 필드에 있었으므로 검사기가 잡지 못했다.

report는 `source` 말고도 **경로에 대한 주장**을 싣는다.
`paths_verified`는 「이 경로들을 열어서 확인했다」이고,
`paths_expected_absent`·`fabricated_paths`는 「이 경로들은 존재하지 않는다」가 결론 그 자체다.
지금 이 주장들은 아무도 대조하지 않는다.

## 할 일

`scripts/check-citations.py`에 **선언된 경로 주장의 대조**를 더하라.

- `paths_verified` 리스트의 각 항목: 존재해야 한다.
  항목 꼴이 레포 안에서 이미 세 가지다 — 경로 문자열 그 자체, `{path, exists}`,
  `{path, ...}`(`exists` 없음). `exists`가 없으면 「존재한다」는 주장으로 읽어라.
  `exists: false`인 항목은 **존재하지 않아야** 한다.
- `paths_expected_absent`·`fabricated_paths` 리스트의 각 항목: **존재하지 않아야** 한다.
- 실패는 `source` 진단과 구별되는 이유로 출력하고, 한 건이라도 있으면 비영으로 끝난다.
- 존재 판정은 파일이든 디렉터리든 「있으면 있다」로 한다.
  (`source`는 지금처럼 JSON을 열어야 하므로 정규 파일이어야 한다 — 그 동작은 바꾸지 마라.)

## 경계 — 이대로 지켜라

**선언된 주장만 검사한다.** 문자열이 경로처럼 생겼다고 훑지 마라.

report에는 「존재하지 않아야 정상인 경로」가 결론으로 실린다(`fabricated_paths`가 그것이다).
과거 diff·명령 기록 안에도 지금은 없는 경로가 잔뜩 있다.
훑기로 가면 그것들을 전부 위반으로 잡게 되고, 그것을 피하려고 키 블랙리스트를 붙이면
phase 39·40에서 두 번 무너진 「금지 목록으로 쓴 검사」로 되돌아간다.

그래서 이 검사가 **닫지 못하는 것**을 `step1-report.json`에 한계로 적어라 —
선언되지 않은 경로 언급은 주장이 아니므로 검사 대상이 아니고,
report가 근거로 삼은 경로는 사양이 `paths_verified`에 선언하도록 요구해서 닫는다.

## 그리고 가드레일 한 줄

`AGENTS.md`의 `## 개발 프로세스` 절에 항목 하나를 더하라 —
**검증 명령의 인자에 한글·일본어를 넣지 말 것.** Windows 셸을 지나며 `?`로 깨져
Vitest가 시작 전에 죽거나(`-t "축 부분열이다"`), 깨진 채로 0건 매칭이 되어
「통과」로 보일 수 있다. 파일 단위로 돌리고 JSON 리포터 출력에서 고르는 쪽을 쓸 것.
근거는 `phases/39-axis-claim/step4-report.json#/mutation_census_note`.

## 하지 말 것

- `src/`를 건드리지 마라. 이것은 개발 도구다.
- 검사기를 프레임워크로 키우지 마라. 파일 하나, 표준 라이브러리만, 120줄 이내.
- 새 report 스키마를 정의하지 마라. 지금 report들이 이미 쓰는 필드 이름만 읽는다.
- 과거 report의 내용을 고치지 마라. 검사기가 잡는 것은 잡히는 채로 둔다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `python scripts/check-citations.py phases/40-citation-integrity/step*-report.json phases/41-report-record-integrity/step0-report.json`이 **0으로 끝난다.**
- **반증 실측 둘.** 각각 `{mutation, command, exit_code, stdout, restored}`로 적어라.
  1. 어느 report의 `paths_verified` 항목 하나를 실재하지 않는 경로로 바꾸면 비영으로 끝나고,
     원복하면 다시 0으로 끝난다.
  2. 실재하는 경로를 `paths_expected_absent`·`fabricated_paths`에 임시로 넣으면 비영으로
     끝나고, 원복하면 다시 0으로 끝난다.
  두 실측 뒤 `git diff --stat -- phases/`가 비어 있음을 보여라.
- **전수 집계.** `phases/*/step*-report*.json` 전부에 돌려
  검사한 주장 수를 `{paths_verified, expected_absent, source}`로 나눠 세고,
  파일별 종료코드를 적어라. phase 39의 report가 `source` 포인터로 계속 실패하는 것은
  보존된 반증 근거다 — 고치지 말고 그대로 세어라.
- `npm run lint` 통과. 이 스텝은 테스트 결과를 바꾸지 않는다.
