# Step 1: 36면 영역 겹침 census — 강등 문턱이 성립하지 않음을 기록하라 (측정만)

## 배경

ADR-046 초안은 「伏図 블록 영역이 같은 면의 다른 파서 출력 영역에 들어가면 강등」을 검토했다.
계획 검토(`phases/44-drawing-set-assembly/plan-review-codex.md` B1)가 반례를 실측했다 — karatsu-jikugumi2-p1의
오탐 블록과 ina-p6의 정당 블록이 둘 다 軸組図 영역과 교집합 0이라 `legitimate_max < known_false_min`이
성립할 수 없다. 확정 설계(ADR-046)는 그래서 강등을 **만들지 않고** 세트 구성원 선택으로 푼다.
이 스텝은 그 유보의 근거를 **36면 전수로 남기는** 측정이다. 상수도 필드도 넣지 않는다.

## 읽어야 할 파일

- `src/lib/import/framing-plan/{types,parse,elevation}.ts`, `src/lib/import/section-list/{types,parse}.ts`, `src/lib/import/runs.ts`.
- `phases/42-plan-grid-soundness/step0-report.json`(`midpoint_margin`·`procedure` — 보고 형식), 계획 검토 B1·B2·A6.

## 영역 정의 (B2 — 여기서 확정하고 report에 그대로 적는다)

- **텍스트 아이템 bbox**: 가로 글리프 `[x, x+w] × [y-h, y]`, 회전(`rot` −90) 글리프의 진행축은 `[y-w, y]`
  (`src/lib/import/runs.ts`의 규약).
- **断面リスト 표**: `parseTableRegion`이 그 표에 대해 실제로 행으로 받은 `tableRows[].items`(제목 행 포함)의 bbox.
  후보가 0개인 표(`符号行未認識`, 예: ina-p7 柱リスト)도 받은 행이 있으면 그 bbox, 행이 없으면 `degenerate: true`로
  기록한다. `xStart`·`xEnd`의 `±Infinity`는 쓰지 않는다.
- **伏図 블록**: 블록 `xGrid`·`yGrid`의 `AxisCandidate.positionPt` **전체 extent**(placements 유무와 무관 — tsu-p16은
  placements 0). 어느 pt 축인지는 `parse.ts`의 `alongKey`. `MemberPlacement`에는 pt 좌표가 없다.
- **軸組図 계열**: 채택 chain의 치수 토큰과 붙은 레벨 라벨 토큰의 bbox 합집합. 제목 토큰은 **넣지 않는다**(별도로
  「제목 포함 시」 값을 하나 더 재라 — 제목이 어디까지 퍼지는지가 B1 반례의 원인이다).

## 할 일

1. **면별 출력 개수** `{fixture, lists, blocks, elevations, titles_total}` 36면 전부와 요약
   `{list_pages, block_pages, elevation_pages, multi_role_pages}`. 검토가 잰 잠정값은 list 13·block 16·elevation 8·복합 4면이다 —
   네 값과 방법을 적어라(ADR이 잠정으로 적은 9와 다르면 그대로 적는다. 수치 차이는 기능 오류가 아니다).
2. **영역 표** — 모든 リスト 표·블록·계열의 bbox(pt)와 `degenerate` 여부.
3. **블록별 겹침 비율** — 블록 면적 대비 각 표·계열과의 교집합 비율(제목 제외/포함 두 벌), 최댓값.
4. **문턱 불성립의 기록** — `known_false_min`(ina-p7·karatsu-jikugumi2-p1의 블록)과 `legitimate_max`(ina-p6·kani-p38 블록과 나머지
   전 블록)를 출처와 함께 적고 `holds`를 판정하라. B1대로 불성립이면 **그것이 결과다.** 제목 포함 벌에서도 판정하라.
5. **shibata-p13** — 경쟁 출력 유무·비율.

## 측정 방법

파서 내부 값이 필요하면 임시 계측 코드를 넣어 재고 **되돌려라.** 측정 스크립트를 `src/`·`scripts/`·`tests/`에 남기지 마라.
재현 절차(어디에 무엇을 넣어 무엇을 찍었는지)를 `procedure`에 적어라.

## 하지 말 것

- 파서·타입·상수를 바꾸지 마라. 이유: 이 스텝의 코드 변경은 0줄이다.
- 문턱을 제안하지 마라. 이유: 확정 설계가 강등을 만들지 않는다. 불성립의 기록이 산출물이다.
- 제목 유무·면 이름·발주처를 판정에 쓰지 마라. 이유: 규칙이 아니라 목록이고, 제목 규칙은 반증됐다(`docs/RISKS.md` R15).
- 골든·픽스처를 고치지 마라(ADR-010). 규준 수치 리터럴 무관. `scripts/execute.py` 실행·하네스 kill 금지.

## AC

`step1-report.json`:
- `baseline_commit`: 시작 시 `git rev-parse HEAD`. `parser_output_hashes`: **계측 코드를 넣기 전** 시작 시점의 작업 파일 파서로 36면 각각
  `sha256(canonical JSON of {lists, plan, elevations})`(키 정렬·공백 없음)를 `{fixture: hash}` 36건으로 — step 7의 파서 불변 검사 기준이다. `census`, `region_definition`, `regions`, `overlaps`,
  `demotion_margin: {known_false_min, legitimate_max, holds, with_titles: {…, holds}, note}`, `shibata_p13`, `procedure`.
- **청결(D5·R2-10)**: 스텝 시작 시 ① `git status --porcelain --untracked-files=all`을 `baseline_status`에, ② 그 목록의 **모든 dirty·미추적 파일의 sha256**을 `baseline_hashes`에 기록한다. 스텝 종료 시 「이 스텝이 바꾼 경로」＝새로 dirty/미추적이 된 경로 ∪ `baseline_hashes`와 hash가 다른 경로로 정의하고(status 문자만 같다고 제외하지 않는다 — ` M`인 채 내용이 바뀐 파일도 잡힌다), 허용집합 검사는 그 집합에만 적용한다. 시작 시 이미 있었고 내용도 그대로인 변경·미추적 파일은 이 스텝의 잔재가 아니다. 검증·계측 중 변조한 파일은 변조 전·후 sha256을 기록해 같음을 단언한다. 하네스 파일(`index.json`·`step*-invoke.json`·`step*-codex.*.log`)은 제외한다. 여기서는 계측 코드를 넣은 파서 파일의 변조 전·후 sha256 동일이 「되돌렸다」의 증거다. baseline과의 차이가 `phases/44-drawing-set-assembly/` 안뿐이어야 한다.
- `npx vitest run tests/plan-import tests/section-import`가 0.

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지 — 파일 단위로 돌리고 JSON 리포터에서 골라라.
