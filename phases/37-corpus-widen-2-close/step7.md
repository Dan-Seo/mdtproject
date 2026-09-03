# Step 7 (verify): 문서 갱신을 반증하라

## 배경

step 6는 codex가 쓴 문서다. 이 스텝은 그 문서를 **고치지 않고** 반증한다. 성립하면
`refuted`, 아니면 `completed`.

## 반증 항목

1. **출처 없는 수치** — step 6의 커밋들(`git log --oneline`의 「step 6」 feat·chore)이 바꾼 `docs`·`CLAUDE.md`·`AGENTS.md`·`tests/fixtures/section-import/SOURCES.md`의 diff(`git diff <step 5 output 커밋>..HEAD -- …`)에
   새로 들어간 **모든 숫자**(면 수·발주처 수·골든 통과 수·테스트 수·pt·건수)를 뽑아,
   각각이 `phases/36-corpus-widen-2/step*-report.json`·`step5-adjudication.json`·
   `phases/37-corpus-widen-2-close/step0-report.json` … `step5-report.json`·SOURCES.md 중
   어느 필드에서 왔는지 표로 적어라. 출처가 없는 숫자가 하나라도 있으면 반증 성립.
   step 6 report의 `numbers_used`도 대조하라 — 거기 없는 숫자가 문서에 있으면 성립.
2. **표 동일성** — CLAUDE.md와 AGENTS.md의 마일스톤 표 「도면 인식(로컬)」 행과 리스크
   표 R10·R15 행을 `diff`해 한 글자라도 다르면 반증 성립.
3. **범위** — 변경 파일에 `src/**`·`tests/**`(SOURCES.md 제외)가 있으면 반증 성립.
4. **닫힘** — R10·R15의 상태가 「열림」이 아니면 반증 성립. `phases/index.json`은
   하네스가 쓰므로 제외.
5. **ADR 번호** — 새 ADR 번호가 파일의 이전 마지막 번호＋1이 아니거나 중복이면 반증
   성립. 「배경·결정·근거·결과」 넷이 다 있는지도 본다.
6. **미측정 표기** — R15의 `alongDistance` 최댓값·경쟁 치수 최솟값이 숫자로 적혀
   있으면(이번 phase는 재측정하지 않았다) 반증 성립.

## 하지 말 것

- 어떤 파일도 고치지 마라.
- `error`로 끝내지 마라 — 성립은 `refuted`, 불성립은 `completed`.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## 산출물

`phases/37-corpus-widen-2-close/step7-report.json`:

```json
{
  "verdict": "completed|refuted",
  "numbers": [{ "value": "", "file": "", "source": "" }],
  "table_identity": true,
  "scope_ok": true,
  "risks_open": true,
  "adr_number_ok": true,
  "summary": "index.json summary와 같은 요지"
}
```
