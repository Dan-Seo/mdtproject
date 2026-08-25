# Step 0: section-lookup-by-story

`applyFramingPlan`이 断面을 **符号만으로** 찾고 **먼저 걸린 것을 쓴다.**
같은 符号이 階마다 있는 실물에서 **틀린 断面이 조용히 붙어 物量이 틀린다.**

## 지금 무슨 일이 일어나는가

`src/lib/import/framing-plan/apply.ts:130-133`:

```ts
const sections = new Map<string, Section>()
for (const section of project.sections) {
  if (!sections.has(section.mark)) sections.set(section.mark, section)   // ← 먼저 걸린 것이 이긴다
}
...
const section = sections.get(placement.mark)
```

그런데 `Section`은 `storyLabel`을 갖고(`src/domain/model/member.ts:97,158,230,302`),
断面リスト 取入은 **`(mark, storyLabel)` 조합마다 하나씩** 만든다
(`src/components/section/SectionImport.tsx:77,257`).

**착수 전에 직접 재서 결함이 실재함을 확인하라.** 아래는 이미 레포에 있는 픽스처다:

| 픽스처 | 같은 符号이 걸린 階 |
|---|---|
| `tests/fixtures/section-import/textitems/yokohama-p13.json` | `C51`·`C52`·`C53`·`C54`·`C55`·`C58A` 가 각각 `2階`/`1階` |
| `tests/fixtures/section-import/textitems/yokohama-p14.json` | `G51`·`G52`·`G52A`·`G53`·`G54` 가 각각 `R階`/`2階` |
| `tests/fixtures/section-import/textitems/ojkk-p2.json` | `C1`·`C2`·`C2A` 가 각각 `1F`~`6F` **6개** |
| `tests/fixtures/section-import/textitems/ojkk-p3.json` | `G1`~`G5` 가 각각 `2F`~`RF` **6개** |

그리고 `yokohama-p7.json`(伏図)이 배치하는 符号이 **정확히 그것들**이다 —
`2階床伏図1/100` 블록이 `C51,C52,C53,C54,C55,C58A,G51,G52,G52A,G53,G54`를 놓는다.
즉 오늘 이 두 픽스처를 이어 넣으면 `2階` 伏図에 `1階`의 `C51`이 붙을 수 있다.
**도달 불가한 잠재 결함이 아니라 실물 픽스처에서 재현되는 결함이다.**

## 「모호하면 거부」만으로는 기능이 죽는다 — 그래서 선택을 입력으로 받는다

`C1`이 6개 階에 있으므로 「모호하면 전부 거부」로 고치면 **ojkk 伏図의 柱가 한 본도 안 들어간다.**
그렇다고 제품이 고를 수도 없다 — `Section.storyLabel`은 断面リスト 원문(`1階`·`6F`·`R階`)이고
`Story.name`은 軸組図 원문(`1FL` 등)이라 **문자열이 애초에 다르다.** 정규화해서 맞추는 것은
도면에 없는 대응을 제품이 만드는 것이라 ADR이 필요하다.

그러므로 **사람이 정한다.** 이것은 새 결정이 아니라 이미 있는 결정을 그대로 따르는 것이다 —
`PlanBlock.title`의 주석이 이미 「어느 Story인지는 **사람이 정한다**」라고 적어 두었다
(`src/lib/import/framing-plan/types.ts:65`).

**`block.title`의 「2階床伏図」를 읽어 `storyLabel`과 맞추지 마라.** 그것이 ADR이 필요한 쪽이고
이 스텝의 범위가 아니다. 읽고 싶어지면 그게 지어내는 순간이다.

## 읽어야 할 파일

- `AGENTS.md`, `docs/ADR.md` — ADR-004·ADR-021·ADR-030
- `src/lib/import/framing-plan/{types,apply}.ts`
- `src/lib/import/framing-plan/apply.test.ts`
- `src/domain/model/member.ts` (`Section`의 `storyLabel`)

## 작업

TDD로 진행하라. **먼저 지금 코드에서 실패하는 테스트를 쓰고**, 그 다음 고쳐라.
그 테스트는 「같은 `mark`·다른 `storyLabel`인 断面 둘이 있을 때 오늘은 앞의 것이 조용히 붙는다」를
드러내는 것이어야 한다.

### 1. 새 skip 코드 `断面複数該当`

`src/lib/import/framing-plan/types.ts`의 `PLAN_APPLY_SKIPS`에 **`'断面複数該当'`을 더한다.**
기존 셋(`断面未登録`·`部材種別相違`·`格子外`)은 문자열도 순서도 건드리지 마라.

이름이 `階`가 아니라 `複数該当`인 이유: 손입력으로 **같은 `storyLabel`인 断面이 둘** 생길 수도 있고,
그때도 고르면 안 되기 때문이다. 코드는 관측된 사실만 담고 번역은 표시부가 한다.

### 2. `PlanApplyOptions`에 `sectionStoryLabel`

```ts
export interface PlanApplyOptions {
  block: PlanBlock
  storyId: string
  /**
   * 어느 階의 断面을 쓸지 — 断面リスト 원문 그대로(`2階`·`6F`). 사람이 고른다.
   * undefined는 「고르지 않았다」이지 「storyLabel이 없는 断面」이 아니다.
   */
  sectionStoryLabel?: string
  discardOtherStories?: boolean
}
```

### 3. 조회를 후보 배열로 바꾼다

`Map<string, Section>`(먼저 걸린 것이 이김)을 **`Map<string, Section[]>`**로 바꾸고,
placement마다:

1. `mark`가 같은 断面을 전부 모은다
2. `sectionStoryLabel`이 **주어졌으면** `section.storyLabel === sectionStoryLabel`로 좁힌다
   (엄격 일치다. `trim`·대소문자·`階`↔`F` 어떤 정규화도 하지 마라)
3. 0개 → `断面未登録` (기존 코드·기존 뜻 그대로: 「이 선택으로는 그 符号의 断面이 없다」)
4. **2개 이상 → `断面複数該当`**. 절대 첫 번째를 쓰지 마라
5. 1개 → 그것을 쓴다

`sectionStoryLabel`이 `undefined`면 좁히지 않는다. 그러면 符号당 断面이 하나뿐인 案件은
**지금과 똑같이 동작하고**(기존 테스트가 그대로 통과해야 한다), 여러 개인 案件만 4)로 떨어진다.

`ROLE_FOR_KIND` 검사와 `withinGrid` 검사의 **순서는 그대로 두라.** 어느 사유로 떨어졌는지가
바뀌면 기존 테스트가 이유 없이 흔들린다.

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` 가 통과해야 한다.
`npm run build`는 `next dev`가 떠 있지 않은 상태에서 돌려라.

### AC (전부 반증 가능해야 한다)

1. `mark`가 같고 `storyLabel`이 `'1階'`·`'2階'`인 断面 둘 + 그 `mark`의 placement 하나일 때,
   `sectionStoryLabel` 없이 부르면 `applied: 0`이고 `skipped`가
   `[{ mark, reason: '断面複数該当' }]`이다. **`applied: 1`이면 실패다.**
2. 같은 案件에 `sectionStoryLabel: '2階'`를 주면 `applied: 1`이고, 붙은 `Member.sectionId`가
   **`2階` 쪽 断面의 id**다. `1階` 쪽 id면 실패다.
3. `sectionStoryLabel: '3階'`(그 符号에 없는 階)를 주면 `断面未登録`이다.
4. **「읽지 못한다」 고정**: `storyLabel`이 **둘 다 `'2階'`인 중복 断面** 둘이 있으면
   `sectionStoryLabel: '2階'`를 주어도 `断面複数該当`이다. 여기서 하나를 골라 주면 실패다.
5. **정규화 금지 고정**: 断面이 `storyLabel: '2階'` 하나뿐일 때 `sectionStoryLabel: '2F'`를 주면
   `断面未登録`이다. 맞춰서 붙으면 실패다.
6. 符号당 断面이 하나뿐인 기존 케이스는 `sectionStoryLabel` 없이 지금과 같은 결과다
   (기존 `apply.test.ts`가 수정 없이 통과한다).

### 반증 확인 (뮤테이션)

아래를 각각 넣고 **무엇이 실패하는지 테스트 이름으로 적어라**(적은 뒤 반드시 되돌릴 것):

1. 4)의 `candidates.length > 1` 가지를 `candidates[0]` 사용으로 되돌린다 → 실패하는 테스트
2. 2)의 `filter`를 `storyLabel === undefined || storyLabel === sectionStoryLabel`로 느슨하게 한다 → 실패하는 테스트
3. 2)의 비교를 `String(a).replace('階','F') === String(b).replace('階','F')`로 정규화한다 → 실패하는 테스트

**셋 중 하나라도 전부 통과하면 그 자리는 테스트가 없는 것이다.** 테스트를 더 써라.

## 하지 말 것

- `block.title`에서 階를 읽지 마라 — ADR이 필요한 쪽이고 이 스텝의 범위가 아니다
- `storyLabel`과 `Story.name`을 어떤 방식으로도 맞추지 마라(정규화·부분일치·숫자추출 전부)
- 후보가 여럿일 때 어떤 기준으로든 하나를 고르지 마라(최신·최상층·최하층·정렬 첫째 전부 금지)
- 화면(`src/components/`)을 건드리지 마라 — step 1의 몫이다
- `Project.schemaVersion`을 건드리지 마라. `PlanApplyOptions`는 案件에 저장되지 않는다
- 기존 skip 3종의 문자열·순서·판정 순서를 바꾸지 마라

## 출력

`phases/12-plan-apply-story/step0-output.json`:

```json
{
  "changed": ["..."],
  "reproduced": "착수 전 재현에서 관측한 것 한 줄",
  "mutations": [
    { "mutation": "candidates[0] 되돌리기", "failed": ["테스트 이름"] },
    { "mutation": "filter 느슨하게", "failed": ["..."] },
    { "mutation": "階↔F 정규화", "failed": ["..."] }
  ],
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "..." }
}
```
