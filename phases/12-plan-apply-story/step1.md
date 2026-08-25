# Step 1: section-story-picker

step 0이 `sectionStoryLabel`을 받도록 `applyFramingPlan`을 고쳤다.
**아직 화면이 그 값을 넘기지 않는다** — 그래서 지금은 같은 符号이 여러 階에 있는
실물 案件에서 伏図 취입이 통째로 `断面複数該当`으로 떨어진다.

이 스텝은 **사람이 고를 자리**를 만든다. 제품이 고르는 코드를 쓰는 것이 아니다.

## 읽어야 할 파일

- `AGENTS.md`, `docs/ADR.md` — ADR-004·ADR-030
- `src/components/plan/PlanImport.tsx` (階 선택은 `:199,369-379`, 취입은 `:250-262`)
- `src/locales/ko.json`, `src/locales/ja.json` (`planImport.*`)
- `tests/e2e/uc22-plan-import.js`
- step 0의 결과물 `src/lib/import/framing-plan/{types,apply}.ts`

## 작업

### 1. 断面 階 선택

`PlanImport.tsx`에 `sectionStoryLabel` 상태를 두고 `applyFramingPlan` 호출에 넘긴다.

- 선택지는 **`project.sections`에 실제로 있는 `storyLabel`의 중복 없는 목록**이다.
  **첫 등장 순서**를 유지하라 — 정렬하면 `10階`가 `2階` 앞에 오고, 그 순서에는 근거가 없다.
- 맨 앞에 「고르지 않음」 선택지를 둔다. 그 값이 `sectionStoryLabel: undefined`다.
  **기본값은 「고르지 않음」이다.** 첫 항목을 기본으로 두면 사용자가 모르는 사이에 階가 정해진다.
- `storyLabel`을 가진 断面이 **하나도 없으면 이 선택 자체를 렌더하지 마라.**
  고를 것이 없는 화면에 고르라는 칸을 두지 않는다.
- `data-testid="plan-import-section-story"`. 기존 `plan-import-story`(취입할 층)와
  **다른 칸이다** — 하나는 案件의 어느 층에 넣을지, 하나는 断面リスト의 어느 階를 쓸지다.
  둘을 한 칸으로 합치지 마라. `Story.name`과 `storyLabel`은 문자열이 다르다(step 0 참조).

### 2. 표시 문구

`ko.json`·`ja.json` **양쪽에** 넣는다. 한쪽만 넣으면 다른 로케일에서 키가 그대로 보인다.

| 키 | 뜻 |
|---|---|
| `planImport.sectionStory` | 이 칸의 라벨 — 「断面一覧의 어느 階를 쓰는가」 |
| `planImport.sectionStoryAny` | 「고르지 않음」 선택지의 표시 |
| `planImport.skip.断面複数該当` | 「같은 符号의 断面이 여러 개다 — 어느 階의 것인지 골라 주세요」 |

한국어 문구는 기존 `planImport.*` 규약대로 **한자 용어에 한국어를 병기**한다
(`断面一覧(단면일람)`처럼). 일본어 문구는 병기하지 않는다.

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` 가 통과해야 한다.

`npm run build`를 **`next dev`가 떠 있지 않은 상태에서** 먼저 돌리고, 그 다음 dev를 띄우고,
그 다음 e2e다. 순서를 지켜라 — 둘이 같은 `.next`를 쓰므로 빌드가 dev의 청크를 덮으면
화면이 통째로 안 뜨는데 `curl`은 200을 돌려준다.

브라우저 실검증:

```
base64 -w0 .cache/dwg-yokohama.pdf > ~/.dev-browser/tmp/uc22-dwg-yokohama.pdf.b64
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc22-plan-import.js
```

`.cache/dwg-yokohama.pdf`가 없으면 이 파일은 첫머리에서 명시적으로 실패한다.
그때는 **없는 것을 지어내지 말고** `blocked`로 두고 무엇이 없는지 적어라.

### AC (전부 반증 가능해야 한다)

`uc22-plan-import.js`에 이어 붙인다. 이 PDF 한 부에 断面リスト(p13·p14)와 伏図(p7)가
**둘 다 들어 있다** — 같은 파일을 `section-import-file`에도 넣어 断面을 먼저 만든 뒤 伏図를 넣는다.
p13은 `C51`~`C58A`를 `1階`·`2階` 둘로, p14는 `G51`~`G54`를 `2階`·`R階` 둘로 낸다.

1. 断面リスト로 `C51`을 `1階`·`2階` 둘 다 승인한 상태에서 `2階床伏図` 블록을
   **「고르지 않음」으로 반영하면 `C51`이 들어가지 않고** 화면에 `断面複数該当` 문구가 뜬다.
   부재가 들어가면 실패다.
2. 断面 階를 `2階`로 고르고 다시 반영하면 `C51`이 들어간다.
   그때 案件의 그 부재가 **`2階` 쪽 断面**을 가리킨다 — `1階` 쪽 값이면 실패다.
   (`storyLabel`은 `section-import-candidate-{mark}-{storyLabel}`로 구분할 수 있고,
   반영 결과는 断面一覧 화면에서 그 부재의 断面을 확인해 판정하라. 테스트만을 위한
   전역 훅을 제품에 심지 마라 — uc22의 기존 규약이다)
3. **「읽지 못한다」 고정**: `storyLabel`을 가진 断面이 하나도 없는 착지 직후 상태(샘플 案件)에서는
   `plan-import-section-story` 칸이 **존재하지 않는다.** 존재하면 실패다.
4. 기존 uc22의 AC가 **하나도 바뀌지 않고 통과**한다. 통과시키려고 기존 단언을 고쳤다면 실패다.

### 반증 확인 (뮤테이션)

각각 넣고 무엇이 실패하는지 적어라(적은 뒤 되돌릴 것):

1. 기본값을 「고르지 않음」 대신 목록 첫 항목으로 바꾼다 → 실패하는 AC
2. `sectionStoryLabel`을 `applyFramingPlan`에 넘기지 않는다(칸은 그대로 둔다) → 실패하는 AC
3. 선택지 목록을 `.sort()`한다 → 실패하는 테스트 (없으면 단위 테스트를 써라)

## 하지 말 것

- `block.title`의 「2階床伏図」를 읽어 이 칸을 자동으로 채우지 마라 — ADR이 필요하다
- `Story.name`으로 이 칸의 기본값을 정하지 마라 — 두 문자열은 다른 계통이다
- `applyFramingPlan`의 판정 로직을 건드리지 마라 — step 0에서 끝났다
- 기존 `plan-import-story` 칸·testid를 바꾸거나 없애지 마라
- 새 부재(小梁·基礎·雑壁)를 만들지 마라
- 규준 수치를 `.ts`에 쓰지 마라

## 출력

`phases/12-plan-apply-story/step1-report.json`:

```json
{
  "changed": ["..."],
  "mutations": [
    { "mutation": "기본값을 첫 항목으로", "failed": ["..."] },
    { "mutation": "sectionStoryLabel 미전달", "failed": ["..."] },
    { "mutation": "선택지 정렬", "failed": ["..."] }
  ],
  "e2e": "uc22 결과 한 줄",
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "..." }
}
```
