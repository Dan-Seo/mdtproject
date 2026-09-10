# Step 4: `resolveDrawingSetPlan`·`applyDrawingSet` — 선택 해결과 반영

## 배경

ADR-046 6.3. 조립 후보에 사람의 선택을 적용해 **실행 계획**을 만들고(전제조건은 순수 함수가 검사해 거부),
계획을 `applyElevation` → 階 순서대로 `applyFramingPlan`으로 **기존 함수 그대로 합성**한다. 새 반영 의미론은 없다.
계획 검토 E2(중복 블록이 앞 블록의 부재를 지운다)·E3(선택 전달 계약 불완전)을 이 스텝이 닫는다.

## 읽어야 할 파일

- `src/lib/import/framing-plan/apply.ts` 전체와 `src/lib/import/framing-plan/apply.test.ts`(기존 apply 테스트는 여기다 — `tests/plan-import/`가 아니다).
- `src/lib/import/drawing-set/{types,reconcile}.ts`, `src/domain/model/project.ts`, `src/domain/model/sample-project.ts`(샘플에 부재가 있다 — 階 교체가 거부되는 경로).

## 할 일

`src/lib/import/drawing-set/plan.ts`·`apply.ts`(순수. 스토어·React 접근 금지).

```ts
export interface DrawingSetChoices {
  /** 이 선택이 속한 基準系列 — **필수**. candidate.stories.reference와 깊은 동치가 아니면 거부(基準不一致) */
  reference: SeriesRef
  topLevelIndex: number; bottomLevelIndex: number
  discardMembers?: boolean
  /** 블록별 미래 Story — **基準 レベル index**(candidate.stories.levels의 index, 그 Story의 바닥 レベル). 수동이 자동 제안보다 항상 우선 (ADR-035). 이름은 표시용이라 선택에 쓰지 않는다(동명 Story가 있다) */
  blockStories?: Record<string /* `${source}#${pageNumber}#${index}` (BlockRef) */, number /* levelIndex */>
  /** 階별 断面リスト 階 라벨 — key는 levelIndex, 값은 등록된 Project.sections의 storyLabel 중 사용자가 고른 것 */
  sectionStoryLabels?: Record<number /* levelIndex */, string>
}
export const PLAN_REFUSALS = ['基準不一致', '通り芯未確定', '階未確定', '未解決の矛盾', '階未対応ブロック', '階範囲不正'] as const
export type PlanRefusal = (typeof PLAN_REFUSALS)[number]
export interface DrawingSetPlan {
  elevation: ElevationApplyOptions             // candidate·top·bottom·discardMembers
  stories: Array<{ levelIndex: number; storyName: string }>   // applyElevation이 만들 Story, 아래→위. levelIndex는 그 Story의 바닥 レベル
  perStory: Array<{ levelIndex: number; storyName: string; block: PlanBlock; ref: BlockRef; sectionStoryLabel?: string }>
  conflicts: Conflict[]                        // 정보 충돌만 남는다 (階重複ブロック은 선택 구간으로 재판정한 뒤라 0개)
}
export function resolveDrawingSetPlan(candidate: DrawingSetCandidate, choices: DrawingSetChoices): { plan: DrawingSetPlan } | { refusal: PlanRefusal; detail: unknown }
export interface DrawingSetApplyResult {
  project: Project
  refusal?: ElevationApplyRefusal              // applyElevation 거부 → project는 원본 그대로
  storiesApplied: number
  perStory: Array<
    | { levelIndex: number; storyName: string; storyId: string; ref: BlockRef; applied: number; skipped: PlanApplyResult['skipped']; refusal?: PlanApplyRefusal }
    | { levelIndex: number; storyName: string; ref: BlockRef; unmapped: true }   // 그 index의 Story가 생기지 않음 — ID를 지어내지 않는다
  >
}
export function applyDrawingSet(project: Project, plan: DrawingSetPlan): DrawingSetApplyResult
```

규칙:
- `resolveDrawingSetPlan`은 순서대로 검사한다 — ① `grid` 없음 → `通り芯未確定` ② `stories` 없음 → `階未確定`(kani처럼 후보가 없는 정상 실패는
  어떤 `choices`를 넣어도 이 코드다) ③ `choices.reference`가 `candidate.stories.reference`와 **깊은 동치**가 아니면 `基準不一致`로 거부
  (基準을 바꾸면 UI가 `assembleDrawingSet(pages, membership, reference)`로 후보를 다시 만들고 의존 선택을 비운다 — 계획 함수는 재계산하지 않는다)
  ④ top/bottom이 `applyElevation`의 유효 조건에 어긋남 → `階範囲不正`
  ⑤ 선택 구간의 미래 Story 목록 `{levelIndex, storyName}`을 **`applyElevation`을 빈 project에 호출해** 얻는다(`stories[i]`의 levelIndex는 그 Story의
  바닥 レベル index) ⑥ **자동 대응을 이 목록에 대해 다시 계산**한다(`storyLabelFromTitle`→`storyKey`가 목록의 `storyNameKey`와 정확히 하나 일치 —
  전 구간에서 다수 일치라 미대응이던 블록이 선택 구간에서 유일해지면 여기서 대응된다) ⑦ `blockStories`(수동, levelIndex)를 덧씌운다 — 목록에 없는 index면
  `階範囲不正` ⑧ 최종 대응에 없는 포함 블록이 있으면 `階未対応ブロック`{blocks} ⑨ 최종 대응으로 `階重複ブロック`을 **다시 판정** — 같은 levelIndex에 둘
  이상이면 `未解決の矛盾`{`階重複ブロック`}. candidate의 초기 `階重複ブロック`은 정보일 뿐 전제조건이 아니다 ⑩ candidate의 `通り芯不一致`(구성원 수준)가
  있으면 `未解決の矛盾`. 정보 충돌(`階高不一致`·`階未収録レベル`)은 plan에 남긴다.
- `applyDrawingSet`: `applyElevation` 거부 → 전체 거부(project 동일 참조). 성공하면 만들어진 `stories`(아래→위) 순서로 `perStory`의 블록을
  `applyFramingPlan(project, {block, storyId, sectionStoryLabel, discardOtherStories: false})`로 반영한다. 같은 grid이므로
  `他階部材あり通り芯変更不可`는 나올 수 없다 — 나오면 버그이며 테스트가 잡는다. 계획의 `levelIndex`에 해당하는 Story가 실제 결과에 없으면 `unmapped: true`(index로 대응한다 — 이름으로 찾지 않는다).

테스트 `tests/drawing-set/apply.test.ts`:
- **합성 동치**: tsu 세트(16·20·21·22면 포함, p16의 `杭伏図` 블록은 `membership.excludedBlocks`로 **블록 단위 제외** — 그 제목에는 階 키가 없어 대응이
  불가능하다는 것을 테스트 주석에 적어라; 면은 포함해 블록 단위 구성원 선택을 검증한다)로 `assembleDrawingSet` → `resolveDrawingSetPlan` → `applyDrawingSet` 결과의 `project`가
  같은 선택으로 `applyElevation` 뒤 `applyFramingPlan`을 같은 순서로 손으로 이어 부른 결과와 `toEqual`.
- **부재 생성**: 위 픽스처의 블록 부호와 일치하는 `Section`(kind·mark·storyLabel)을 `project.sections`에 등록한 뒤 반영하면
  `project.members.length >= 1`이고 `perStory[].applied`의 합과 같다 — 빈 members끼리의 동치로 끝내지 않는다.
- **거부 전파**: `discardMembers: false`이고 샘플 project에 부재가 있으면 `refusal: '部材あり階置換不可'`, `project`가 `toBe` 동일 참조.
- **전제조건**: `grid: null`인 후보 → `通り芯未確定`; kani 세트(`stories: null`) candidate에 어떤 `choices`(유효한 `reference` 포함)를 넣어도 `階未確定`; 같은 Story에 수동으로 두 블록 → `未解決の矛盾`; 자동 미대응 블록 하나 → `階未対応ブロック`;
  수동 `blockStories`가 자동 제안과 다르면 수동이 이긴다.
- **基準 변경 무효화(R2-06)**: 레벨 구성이 같은 다른 基準(yokohama p8→p9)으로 `assembleDrawingSet`을 다시 만든 뒤 이전 `choices`(옛 `reference`)를 넣으면 `基準不一致`.
- **선택 후 재계산(R2-07)**: ① candidate에 `階重複ブロック`이 있어도 수동으로 한 블록을 다른 levelIndex로 옮기면 계획이 선다 ② 전 구간에서 다수 일치라 미대응이던 블록이 top/bottom을 좁힌 구간에서 유일해지면 자동 대응된다.
- **동명 Story(R2-11)**: 基準 `[2FL,1FL,1FL,GL]`처럼 이름이 같은 Story가 둘일 때 `blockStories`의 levelIndex로 둘을 구분해 반영되고 `perStory`의 `levelIndex`가 다르다.
- **순수성**: 입력 `project`·`candidate`·`choices`의 깊은 복제가 호출 전후 `toEqual`.

## 하지 말 것

- `applyFramingPlan`·`applyElevation`을 바꾸지 마라. 이유: 합성만 한다(6.3).
- 새 skip·refusal 코드를 `framing-plan/types.ts`에 만들지 마라. 이유: 기존 의미론 재사용. 계획 단계의 거부는 `PLAN_REFUSALS`뿐이다.
- 중복 블록을 「뒤가 이긴다」로 처리하지 마라. 이유: E2 — `applyFramingPlan`은 階의 부재를 통째로 교체하므로 앞 블록이 조용히 사라진다.
- 파싱된 断面リスト를 `Project.sections`에 등록하지 마라. 이유: 6.1 — 이 phase 범위 밖이고, 등록은 기존 断面 취입 경로다.
- 스토어 접근 금지. `src/domain/` 불변. 골든·픽스처 불변. 규준 수치 리터럴 무관. `scripts/execute.py` 실행·하네스 kill 금지.

## AC

- `npx vitest run tests/drawing-set/apply.test.ts`·`npx vitest run`·`npm run lint`·`npx tsc --noEmit`이 0.
- `step4-report.json`: `baseline_commit`, `equivalence: {set, stories, blocks, equal: true}`, `members_created: n`(≥1),
  `refusal_propagation`, `preconditions: [{case, refusal}]`, `purity`, `changed_paths`(허용: `src/lib/import/drawing-set/`·`tests/drawing-set/`·`phases/`).

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지.
