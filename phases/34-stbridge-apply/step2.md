# Step 2: 후보를 案件에 넣는 순수 함수를 짓는다 (통짜로 넣거나, 사유와 함께 거부한다)

**전제**: step 1이 `completed`(또는 `blocked`로 넘어왔다면 픽스처는 손대지 않은 상태). `src/lib/import/stb/candidates.ts`가 서 있다.

## 배경
ADR-044가 여는 자리다. 규율은 `applyFramingPlan`·`applyElevation`(ADR-030)의 그것 그대로다 — **사용자가 승인한 뒤에만 불리고, 반영하지 못하면 案件을 손대지 않은 채 사유 코드와 함께 돌려준다.**

**이 파일은 순수 TypeScript다.** `tests/stb-import/`(node 환경)에서 픽스처 대조를 받는다 — node에서 도는 것 자체가 이 모듈이 DOM-free·React-free라는 증명이다.

**세 가지를 특히 조심하라.**
- **`applyFramingPlan`·`applyElevation`을 import하지 마라.** 그것들은 부재 배치가 든 `PlanBlock`·`ElevationCandidate`를 받는다. .stb 후보에는 배치가 없다(ADR-043 「하지 않는 것」). 같은 규약을 따르는 것과 같은 함수를 부르는 것은 다르다. 코드를 복사해 오지도 마라 — 필요한 것은 그 셈법이 아니라 그 규율이다.
- **부분 반영을 만들지 마라.** 축 하나·階 하나만 받으면 나머지 스팬이 근거 없이 남는다. 그리드는 그리드 통째로, 階 스택은 스택 통째로다.
- **`src/domain/`을 고치지 마라.** `Grid`에 회전각·원점을, `Story`에 `kind`를 더하지 마라 — ADR-043 실측 8의 결손은 **후보 단계에서 이미 거부로 다뤄졌고**, 여기서 필드를 늘리면 그 거부가 의미를 잃는다.

## 할 일 (테스트 먼저 — TDD)

1. `src/lib/import/stb/types.ts`에 반영 타입을 더하라(TDD 훅 면제).
   ```ts
   export const STB_APPLY_REFUSALS = [
     '通り芯候補なし',
     '階候補なし',
     '部材あり通り芯置換不可',
     '部材あり階置換不可',
   ] as const
   export type StbApplyRefusal = (typeof STB_APPLY_REFUSALS)[number]

   export interface StbApplyResult {
     project: Project
     applied: boolean
     refusal?: StbApplyRefusal
   }
   ```
   - `部材あり階置換不可`는 `ELEVATION_APPLY_REFUSALS`에 이미 있는 **문자열과 같은 값**이다. 그 배열을 import해 재사용하지 말고 여기서 다시 선언하라 — 두 취입 경로가 서로의 어휘를 고쳐 깨뜨리지 않게 한다(값이 같은 것은 사용자에게 같은 말을 보이기 위해서다). step 0 기록 항목 1이 적은 기존 어휘와 **철자가 다른 중복**을 만들지 마라.
   - `Project`를 `types.ts`에서 import하면 이 파일이 도메인에 묶인다. 그것이 싫으면 `StbApplyResult`만 `apply.ts`에 두어라 — 어느 쪽이든 좋으나 **`src/domain/`을 고치지 않는다**는 것만은 지켜라.

2. `tests/stb-import/apply.test.ts`(node)를 **먼저** 쓰고 `src/lib/import/stb/apply.ts`를 구현하라.

   ```ts
   export function applyStbGrid(
     project: Project,
     candidate: StbSkeletonCandidate,
     options?: { discardMembers?: boolean },
   ): StbApplyResult

   export function applyStbStories(
     project: Project,
     candidate: StbSkeletonCandidate,
     options?: { discardMembers?: boolean },
   ): StbApplyResult
   ```
   **`File`·DOM 타입·`StbDocument`·문자열 원본을 인자로 받지 마라.** 이 층은 후보와 案件만 안다.

3. **`applyStbGrid` 규칙**
   - `candidate.grids`에 `direction: 'X'`가 정확히 1개, `'Y'`가 정확히 1개 있지 않으면 → `{ project, applied: false, refusal: '通り芯候補なし' }`. `project`는 **손대지 않은 그 객체 그대로** 돌려준다.
   - 새 그리드는 `xSpans` ＝ `direction:'X'` 그리드의 `spansMm` 복사본, `ySpans` ＝ `'Y'`의 것, `xLabels`·`yLabels` ＝ 각 그리드 `axes[].label`의 복사본이다. **배열을 그대로 참조로 넘기지 마라** — 후보와 案件이 같은 배열을 공유하면 한쪽 편집이 다른 쪽을 바꾼다.
   - **스팬이 기존 `project.grid`와 같으면**(`xSpans`·`ySpans`의 길이와 전 칸이 같으면) 부재를 버리지 않고 **라벨만 갱신**한다. 라벨은 数量도 격자 index도 바꾸지 않으므로 이름만 달라진 그리드를 「바뀌었다」로 보면 부재를 이유 없이 버리게 된다(`sameGrid`와 같은 판단이다).
   - 스팬이 다르고 `project.members.length > 0`이며 `discardMembers`가 참이 아니면 → `refusal: '部材あり通り芯置換不可'`, `applied: false`, `project`는 원본 그대로.
   - 스팬이 다르고 진행이 허락되면 `members: []`로 비우고 그리드를 교체한다. **`stories`·`sections`·`notes`·`schemaVersion`·`name`은 손대지 마라.**
   - `applied`는 案件이 실제로 바뀌었을 때만 `true`다.

4. **`applyStbStories` 규칙**
   - `candidate.stories.length === 0`이면 → `refusal: '階候補なし'`.
   - `project.members.length > 0 && !discardMembers`이면 → `refusal: '部材あり階置換不可'`, `project`는 원본 그대로.
   - 반영은 통짜 교체다. `candidate.stories`는 **아래에서 위 순서**이고 `Project.stories`도 그렇다(step 0 전제 `heightmm-is-storey-height`가 확정). i번째 候補가
     `{ id: 'story-' + (i + 1), name: candidate.stories[i].name, height: candidate.stories[i].heightMm }`이 된다.
     **이름을 지어내지 마라** — `name`은 `StbStory@name` 원문 그대로다. **id를 이름에서 만들지 마라** — 원문 이름이 중복이거나 비ASCII일 수 있다.
   - `members: []`로 비운다(`applyElevation`과 같다 — 階를 갈면 부재의 `storyId`가 가리키던 階가 사라진다).
   - **`grid`·`sections`·`schemaVersion`·`name`은 손대지 마라.**

5. **둘 모두에 걸리는 것**
   - `project.name`을 `candidate.projectName`으로 덮어쓰지 마라 (ADR-044 결정 5). 案件名은 사용자가 지은 것이다.
   - `candidate.issues`가 비어 있지 않아도 반영을 막지 마라 (ADR-044 결정 4). 반영 함수는 issue를 **읽지 않는다** — 그것은 화면이 보여줄 것이지 이 층이 판단할 것이 아니다.
   - 돌려주는 `project`는 **순수 JSON 직렬화 가능**해야 한다. 클래스·함수·`Date`·`undefined` 값을 넣지 마라.
   - 입력 `project`를 **변형하지 마라**(mutate 금지). 새 객체를 만들어 돌려준다.

6. **픽스처 대조 (ADR-044의 판정 장치)**
   `tests/fixtures/stb-import/applied/<이름>.json`을 5건(실물 4 + `mini`) 만들어 커밋하고, `tests/stb-import/apply.test.ts`가 그것과 전 칸 대조하게 하라. 각 파일의 모양:
   ```json
   {
     "_derivedFrom": "tests/fixtures/stb-import/expected/<이름>.json",
     "grid": { "applied": true, "refusal": null, "value": { "xSpans": [], "ySpans": [], "xLabels": [], "yLabels": [] } },
     "stories": { "applied": true, "refusal": null, "value": [{ "id": "", "name": "", "height": 0 }] }
   }
   ```
   - 출발 案件은 **부재가 없는 빈 案件**이다 — `createSampleProject()`를 쓰지 마라(부재가 들어 있어 전부 거부로 끝나고, 샘플이 바뀌면 이 픽스처가 이유 없이 깨진다). 테스트 안에서 최소 `Project` 리터럴을 만들어 쓰고, 그 리터럴을 테스트 파일 위쪽에 한 번만 두어라.
   - 후보가 그리드나 階를 못 낸 파일은 `applied: false`와 `refusal`을 그대로 적어라. **거부도 기대값이다.**
   - `value`는 `applied`가 `true`일 때만 채운다. `false`면 `null`.

## 완료 조건 (AC)
1. `tests/stb-import/apply.test.ts`가 node 환경에서 돌고 통과한다. `apply.ts`가 React·DOM·three.js·zustand·Next를 **하나도** import하지 않는다.
2. `tests/fixtures/stb-import/applied/` 5건이 커밋되고 전 칸 대조가 통과한다.
3. 부재가 있는 案件에 대해 두 함수 모두 `discardMembers` 없이는 거부하고 **`project`가 참조까지 같은 원본**임을 단언한다.
4. 스팬이 같고 라벨만 다른 그리드를 반영하면 **부재가 살아남고 라벨만 바뀐다**는 단언이 있다.
5. `applyStbStories`의 결과 `stories[0]`이 **최하층**임을 실물 파일 하나로 단언한다(`step0-report.json`의 `stories[].levels`에서 이름을 확인해 그 이름과 대조하라).
6. 반영 결과가 `JSON.parse(JSON.stringify(project))`와 `toEqual`로 같다는 단언이 있다.
7. `applyStbGrid`가 案件의 `stories`를, `applyStbStories`가 案件의 `grid`를 **바꾸지 않는다**는 단언이 각각 있다.
8. `npx tsc --noEmit`·`npm run lint`·`npm run test` 전부 통과.

## 금지
- `src/domain/` 아래를 고치지 마라. `src/lib/store.ts`·`src/components/`를 고치지 마라(그건 step 3이다).
- `src/lib/import/framing-plan/` 아래를 고치지 마라. 그 모듈의 함수를 import하지 마라.
- `src/rulepack/`을 조회하지 마라. 定着·重ね継手·折曲げ·かぶり·할증률에 해당하는 숫자를 쓰지 마라 (ADR-002).
- `StbSec*`·`StbApply*`를 읽지 마라 (ADR-043·ADR-044 결정 5).
- 자동 승인 경로를 만들지 마라 — 이 스텝은 함수만 짓는다. `useAppStore`를 부르는 코드를 여기 두지 마라.
- `scope-guard.test.ts`의 금지어 목록에서 무엇도 빼지 마라.
