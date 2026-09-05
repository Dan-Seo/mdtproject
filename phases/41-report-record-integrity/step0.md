# Step 0: 인코딩으로 파괴된 report 문장을 로그에서 되살려라

## 배경

Windows 셸을 거치면서 한글이 `?`로 바뀌는 사고가 이 레포에서 두 갈래로 났다.

1. **검증 명령이 깨졌다.** `phases/39-axis-claim/step4-report.json#/mutation_census_note`에
   codex 자신이 적어 뒀다 — PowerShell 기본 stdin 인코딩 때문에 한글 test-name 정규식이
   깨져 Vitest가 시작 전에 죽었고(`Invalid regular expression: /? ?????/`), 그 3회는
   검출로 세지 않고 UTF-8로 고쳐 다시 돌렸다. **집계는 정직했다.**
2. **report에 쓴 문장이 파괴됐다.** 같은 경로로 JSON을 쓸 때 한글이 한 글자씩 `?`가 됐다.
   예: `phases/40-citation-integrity/step1-report.json#/summary`가
   `'36? ????? tsu 150mm ...'`로 남아 있다.

2번은 되살릴 수 있다. codex가 그 문자열을 만든 명령이 `step{N}-codex.stdout.log`에
**원문 그대로** 남아 있기 때문이다. 위 예의 원문은 같은 phase의 step1 로그에서
`report.summary='36면 재계측으로 tsu 150mm 편차 귀속을 확인하고 ...'`로 확인된다.

한편 report 안의 `?`가 전부 사고인 것은 아니다. 다음은 **정확한 기록이므로 그대로 둔다.**

- 기록된 셸 입출력 안의 `?` — 깨진 명령과 그 stderr는 「그때 실제로 무슨 일이 났는가」다.
- 원문에 진짜로 있는 `?` — TypeScript의 `?? []`, `git status --porcelain`의 `?? 경로`.

## 할 일

1. **조사.** `phases/*/step*-report*.json` 전부를 대상으로, 문자열 값 안의 `?` 2연속 이상을
   모두 찾아 하나씩 분류하라.
   - `captured_io` — 기록된 명령·stdout·stderr·diff 안이거나, 원문에 실재하는 `?`다.
   - `authored_mangled` — codex가 쓴 한국어 문장이 파괴된 것이다.

   키 이름만으로 나누지 마라. 각 건마다 「왜 이 분류인가」를 한 줄로 적어라.

2. **원문 찾기.** `authored_mangled` 각 건에 대해 같은 스텝의
   `phases/{phase}/step{N}-codex.stdout.log`에서 원문 후보를 찾아라.

3. **대응 증명.** 후보가 원문임을 기계적으로 증명하라 —
   **후보의 비ASCII 문자를 각각 `?` 한 글자로 바꾸면 저장된 문자열과 완전히 같아야 한다.**
   길이·ASCII 부분이 한 글자라도 다르면 그 후보는 원문이 아니다.
   (이 「비ASCII 1자 → `?` 1자」는 가설이다. 성립하지 않는 건이 있으면 그것도 결과다.)

4. **복원.** 증명이 성립한 건만 원문으로 되돌려라. 성립하지 않거나 로그에 원문이 없는 건은
   `unrecoverable`로 남기고 **문장을 다시 쓰지 마라** — 뜻을 짐작해 채우면 그것은 복원이
   아니라 창작이다.

## 하지 말 것

- report의 그 필드 값 말고 다른 바이트를 바꾸지 마라. 과거 report에 새 필드를 달지 마라.
- `src/`·`tests/`·골든·픽스처를 건드리지 마라. 이 스텝은 기록 복원만이다.
- `captured_io`로 분류한 것을 「보기 좋게」 고치지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`에 다음이 있어야 한다.

- `occurrences`: 찾은 `?` 2연속 이상 전건. 각 건은
  `{file, pointer, excerpt, classification, reason}`.
  `classification`별 개수를 `census`에 함께 적어라.
- `restorations`: 복원한 각 건이
  `{file, pointer, stored_before, restored, log: {file, line}, skeleton_match: true}`.
- `unrecoverable`: 복원하지 않은 `authored_mangled` 각 건과 그 이유.
- **복원 후 재조사**: 같은 조사를 다시 돌려
  `authored_mangled`가 **0건**이고 `captured_io` 개수가 조사 전과 **같음**을 수치로 보여라.
- 복원한 파일이 전부 `json.load`로 파싱된다.
- `git diff --stat`에 나타나는 경로가 `restorations`의 파일 집합과 **정확히 일치**한다.
- `npx vitest run`과 `npm run lint`가 0으로 끝난다.
