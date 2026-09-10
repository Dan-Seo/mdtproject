# Step 6: 문서 동기화 — RISKS·MILESTONES·ADR-046 보충·CLAUDE.md＝AGENTS.md

## 배경

이 phase가 넣은 것: `levelStoryKey`(step 2), 面の役割表·突合(step 3), 계획 해결·반영(step 4), 「図面セット」 UI(step 5).
만들지 않은 것: 자동 강등(step 1이 불성립을 기록), 軸組図 축 대조, 파서 개선, `sectionStoryLabel` 제안. 문서는 손갱신이라
코드보다 뒤처진다 — 이 phase의 report 수치로 맞추고, 모든 수치는 report의 JSON 포인터로 인용한다.

## 읽어야 할 파일

- `phases/44-drawing-set-assembly/step0-report.json`〜`step5-report.json`.
- `docs/RISKS.md`(R10·R15), `docs/MILESTONES.md`(도면 인식 행), `docs/ADR.md` ADR-046, `CLAUDE.md`·`AGENTS.md`의 「마일스톤 현황」·「열린 리스크」 표.
- `scripts/check-citations.py`, `phases/42-plan-grid-soundness/step2-report.json`(`numbers_used`·`citations` 형식의 본보기).

## 할 일

1. `docs/RISKS.md`
   - R15: 블록 오탐 세 면은 **여전히 열림**이고, 영역 겹침 강등이 불성립인 실측(`step1-report.json#/demotion_margin`)과 세트 구성원 선택으로
     사용자가 제외한다는 경로를 적는다. shibata-p13·karatsu-jikugumi2-p1·ina-p7 각각의 비율을 인용.
   - R10: 「面と面の突合(通り芯 일치·基準系列 階高·블록↔Story 키 대응)이 제품에 있다」로 갱신하되, 軸組図 축 대조 미구현·파서 한계로
     `knownGaps`에 남은 항목(`step3-report.json#/sets`의 `known_gaps_confirmed`)·kani 軸組図 0건·SL 제외·ina 블록 미분할을 열린 항목으로 정확히.
2. `docs/MILESTONES.md` 도면 인식 행: 세트 조립 계층 도입과 잔여를 한 줄로.
3. `docs/ADR.md` ADR-046 **보충 소절 추가**(본문 결정 수정 금지): 잠정 census를 `step1-report.json#/census`로 대체, 강등 불성립 실측,
   `levelStoryKey` 문법 표의 위치(`step2-report.json#/grammar_table`), 축 대조 「후속」 명시.
4. `CLAUDE.md`와 `AGENTS.md`의 「도면 인식(로컬)」 행과 R10·R15 행을 **같은 내용으로 동시에** — 두 파일의 그 행은 바이트 단위로 같아야 한다.
5. `numbers_used: [{doc, value, source}]` — `source`는 전부 이 phase의 report JSON 포인터.

## 하지 말 것

- 코드·테스트·골든을 바꾸지 마라. 이유: 문서 스텝이다.
- report에 없는 수치를 문서에 쓰지 마라. 이유: 인용 검사는 선언된 인용만 본다.
- ADR-046 본문의 결정을 바꾸지 마라. 이유: 보충만 한다.
- `scripts/execute.py` 실행·하네스 kill 금지.

## AC

- `python scripts/check-citations.py phases/44-drawing-set-assembly/step*-report*.json`이 0.
- `CLAUDE.md`·`AGENTS.md`의 고친 행을 뽑아 `diff`가 빈 것을 report에.
- `npm run lint`가 0.
- `step6-report.json`: `baseline_commit`, `numbers_used`, `mirror_rows: {claude_md_lines, agents_md_lines, identical: true}`, `docs_changed`,
  `changed_paths`(허용: `docs/`·`CLAUDE.md`·`AGENTS.md`·`phases/`).

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지.
