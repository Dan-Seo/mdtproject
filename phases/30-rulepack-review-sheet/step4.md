# Step 4: 골든 스냅샷이 체크아웃의 줄바꿈에 걸려 깨지는 것을 고친다

**전제**: step 3이 `completed`다. **`src/**` 수정 금지.**

## 관측된 사실 (2026-08-27)

`tests/rulepack/review-sheet.test.ts`의 「matches the checked-in golden Markdown
snapshot」이 **깨끗한 Windows 체크아웃에서 실패한다.** 확인된 것만 적는다.

- 커밋된 blob은 **LF**다: `git show HEAD:tests/golden/fixtures/rulepack-review-sheet.md | file -`
  → `Unicode text, UTF-8 text` (CRLF 표기 없음).
- 워킹 카피는 **CRLF**다: `file tests/golden/fixtures/rulepack-review-sheet.md`
  → `with CRLF line terminators`.
- 이 레포는 `core.autocrlf=true`이고 **`.gitattributes`가 없다.** 그래서 체크아웃이
  LF를 CRLF로 바꾼다.
- 테스트는 파일을 `readFileSync(..., 'utf8')`로 읽어 **바이트 동등**으로 비교하는데
  (`review-sheet.test.ts:101-107`), 생성기는 `\n`을 낸다. 그래서 브랜치를 한 번
  왕복 체크아웃한 것만으로 실패했다. 실패 diff는 **글자가 아니라 줄바꿈만** 다르다.
- 리눅스 CI에서는 통과한다 — 즉 **이 결함은 CI가 못 잡는다.**

## 할 일

1. **기존 관용구를 써라 — 새로 만들지 마라.** 이 레포에는 같은 문제를 이미 이렇게
   풀고 있다: `tests/docs/guardrail-sync.test.ts:9-11`의
   ```ts
   function normalizeNewlines(value: string): string {
     return value.replace(/\r\n?/g, '\n')
   }
   ```
   스냅샷 비교를 이 방식에 맞춰라. **비교를 느슨하게 만들지 마라** — 줄바꿈 외에는
   여전히 바이트 동등이어야 한다.
2. **`.gitattributes`를 만들지 마라.** 레포 전체의 재정규화를 일으키는 변경이고
   이 스텝의 범위 밖이다. 만들어야만 고쳐진다고 판단하면 **고치지 말고 `blocked`**로
   그 근거를 적어라.
3. **스냅샷 파일을 CRLF로 다시 생성하지 마라.** 문제를 옮기는 것이다. 커밋된 blob은
   LF 그대로 둔다.
4. **고쳤다는 것을 반증 가능하게 보여라.** 「통과한다」는 검증이 아니다. 다음 둘을
   보고서에 명령과 출력으로 적어라.
   - **고치기 전**: 워킹 카피를 CRLF로 바꾸면 그 테스트가 실패한다(실패 메시지를 적어라).
   - **고친 뒤**: 같은 CRLF 워킹 카피에서 **통과**하고, LF 워킹 카피에서도 통과한다.
   - 그리고 **내용이 실제로 다를 때는 여전히 실패한다** — 시트의 한 글자를 바꿔
     실패하는 것을 보이고 원복하라. 이것이 없으면 2.을 「전부 통과」로 만들어 버린
     것과 구별되지 않는다.
   CRLF 변환은 파일을 새로 쓰지 말고 되돌릴 수 있는 방법으로 하라(예: 임시 복사본을
   만들어 검사하고 지우거나, 변환 후 `git checkout --`로 원복). 끝나면
   `git status`로 워킹 트리가 깨끗함을 보여라.
5. **같은 취약점이 다른 곳에도 있는지 확인하라.** `tests/` 아래에서 파일을 읽어
   **바이트 동등**으로 비교하는 곳을 전부 찾아 목록으로 적어라.
   - 확인된 것: `tests/golden/spec-fixture.test.ts:236-239`는 소스를 읽지만
     정규식 매칭만 하므로 **무해하다**. 이런 것은 「무해」로 분류해서 적어라.
   - 취약한 곳이 더 있으면 **고치지 말고 목록만** 적어라 — 이 스텝의 범위는
     이 phase가 만든 스냅샷 하나다.

## 하지 말 것

- `src/**`·`src/rulepack/**` 수정 금지.
- `scripts/rulepack/review-sheet.ts`의 **출력 내용**을 바꾸지 마라. 되접기 수치 넷
  (135·8·17·8→2·4→4)과 표식 77칸이 그대로여야 한다.
- step 3이 넣은 단언(`[[` 0건·셀 안 `※既存再対照` 0건·77칸·`屋内・仕上げあり`)을
  지우거나 약화시키지 마라.
- 어떤 행도 `stated`로 올리지 마라.
- 테스트를 `skip`·`xfail`로 덮지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`·`step*-report.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- 4.의 세 가지(CRLF에서 실패→통과, LF에서 통과, 내용이 다르면 실패)가 보고서에
  명령과 출력으로 있다.
- 되접기 수치 넷과 표식 77칸이 step 3과 같다.

## 산출물

`phases/30-rulepack-review-sheet/step4-report.json`: 고친 곳(파일:행), 4.의 세 실행,
5.의 목록(취약/무해 구분), 유지된 수치.
