# Step 2: `levelStoryKey` — 軸組図 レベル명을 기존 階 키 공간으로

## 배경

블록 제목의 階는 `src/lib/import/story-label.ts`의 `storyLabelFromTitle`→`storyKey`로 `'1'`·`'2'`…`'R'` 키가 된다.
軸組図 レベル명(`1FL`·`2FL`·`RFL`·`RSL+760.00`·`RFL(水下)`)에는 키 함수가 없다 — `storyKey('1FL')`은 `undefined`다
(`src/lib/import/story-label.test.ts`). ADR-046 6.2(R2 확정)는 **같은 키 공간**을 쓰는 `levelStoryKey`를 정했다.
계획 검토 R2가 지적한 「양변이 다른 키를 쓰면 여전히 안 맞는다」를 이 스텝이 닫는다.

## 읽어야 할 파일

- `src/lib/import/story-label.ts`·`story-label.test.ts`, `src/lib/import/runs.ts`(`compact`), `docs/ADR.md` ADR-035·ADR-046 6.2.
- 원문 사례: `tests/fixtures/plan-import/expected/*-elevation.json`의 `levelTexts`·`levels`(실재 レベル명 목록).

## 할 일

`src/lib/import/story-label.ts`에 추가:

```ts
/** 軸組図 レベル명 → storyKey와 같은 키 공간('1'…, 'R'). 키 없음은 undefined — 수동 대응 대상 */
export function levelStoryKey(levelLabel: string): string | undefined
```

문법(ADR-046 6.2 그대로, 순서대로 적용):
1. NFKC 정규화, 공백 제거.
2. 뒤의 표고 `[+±-]?\d+(\.\d+)?` 제거, 괄호 한정 `(…)`·`（…）` 제거(NFKC 후 반각).
3. `^(\d+)(FL|SL|F|階)$` → 숫자 문자열(선행 0 제거는 `storyKey`와 같은 `canonicalNumber`), `^(R|RF|RFL|RSL|R階)$` → `'R'`.
4. 그 외 → `undefined`. 접두가 있는 것(`中央棟1FL`), `GL`·`設計GL`·`基礎下端`·`PH*`·`B\d*`·`RCL`은 키 없음.

그리고 `export function storyNameKey(storyName: string): string | undefined` — `Story.name`은 同高 aliases를
`／`로 결합한 것이므로(`applyElevation`), 부분마다 `levelStoryKey`를 구해 **전부 같을 때만** 그 키, 하나라도 다르거나
없으면 `undefined`.

테스트 `src/lib/import/story-label.test.ts`에 **표로** 고정(`it.each`): 최소 다음 행 — `1FL`→`'1'`, `２ＦＬ`→`'2'`,
`1SL`→`'1'`, `01F`→`'1'`, `3階`→`'3'`, `RFL`→`'R'`, `RSL+760.00`→`'R'`, `RFL(水下)`→`'R'`, `RFL水上`→`undefined`,
`中央棟1FL`→`undefined`, `GL`→`undefined`, `PHFL`→`undefined`, `B1F`→`undefined`, `1FL／1SL`(storyNameKey)→`'1'`,
`中央棟1FL／基準GL`(storyNameKey)→`undefined`. 기존 `storyKey` 테스트(PH·B1F 거부 포함)는 그대로 통과해야 한다.

## 하지 말 것

- `storyKey`·`storyLabelFromTitle`의 동작을 바꾸지 마라. 이유: 블록 카드·断面 취입이 그 키를 쓰고 있고 ADR-035가 PH·Bn 제외를 못박았다.
- PH·Bn·GL을 키에 넣지 마라. 이유: ADR-035 범위 밖이며 확장은 ADR 변경 사항이다.
- substring 매칭으로 문장에서 レベル을 뽑지 마라. 이유: 레벨 문장 통과 한계(`elevation.ts`)를 자동 대응으로 확대한다.
- `src/domain/` 불변. 골든·픽스처 불변. 규준 수치 리터럴 무관. `scripts/execute.py` 실행·하네스 kill 금지.

## AC

- `npx vitest run src/lib/import/story-label.test.ts`·`npx vitest run`·`npm run lint`·`npx tsc --noEmit`이 0.
- `step2-report.json`: `baseline_commit`, `grammar_table`(테스트 표 전체), `baseline_status`·`changed_paths` — 스텝 시작 시 ① `git status --porcelain --untracked-files=all`을 `baseline_status`에, ② 그 목록의 **모든 dirty·미추적 파일의 sha256**을 `baseline_hashes`에 기록한다. 스텝 종료 시 「이 스텝이 바꾼 경로」＝새로 dirty/미추적이 된 경로 ∪ `baseline_hashes`와 hash가 다른 경로로 정의하고(status 문자만 같다고 제외하지 않는다 — ` M`인 채 내용이 바뀐 파일도 잡힌다), 허용집합 검사는 그 집합에만 적용한다. 시작 시 이미 있었고 내용도 그대로인 변경·미추적 파일은 이 스텝의 잔재가 아니다. 검증·계측 중 변조한 파일은 변조 전·후 sha256을 기록해 같음을 단언한다. 하네스 파일(`index.json`·`step*-invoke.json`·`step*-codex.*.log`)은 제외한다. baseline과의 차이가 `src/lib/import/story-label.ts`·`story-label.test.ts`·`phases/` 밖에 없다.

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지.
