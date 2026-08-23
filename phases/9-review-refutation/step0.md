# Step 0: refute-plan-import-review (검증 전용)

**이 스텝은 구현이 아니다. 반증이다.**

Claude Code가 `origin/main..main` 31커밋을 코드리뷰하고 **결함 2건을 주장**했다.
그 주장이 틀렸음을 보여라. 맞다면 맞다고 적어라 — 다만 **고치지는 마라.**

리뷰 대상은 plan-import 트랙(ADR-030)이다. 이 트랙은 하네스 밖에서 손으로 나갔고
교차검증을 한 번도 받지 않았다. 이 프로젝트의 규칙이다 — 만든 쪽이 자기 것을
승인하지 않는다(`AGENTS.md` 개발 프로세스, ADR-015·ADR-023).

## 가장 중요한 규칙: 고치지 마라

결함이 진짜여도 **코드를 고치지 마라.** 고치면 검증자가 다시 구현자가 되어 교차가 무너진다.
테스트를 새로 추가해도 안 된다 — 재현은 임시 파일로 하고 커밋에 남기지 마라.

- 주장 셋이 **전부 옳다**(반증 실패) → `"status": "completed"`
- 하나라도 **틀렸다**(반증 성공) → `"status": "blocked"` + `blocked_reason`에
  어느 주장이 왜 틀렸는지. 파일·줄·실행 결과를 그대로 인용하라. 요약하지 마라

어느 쪽이든 근거를 `phases/9-review-refutation/refutation.md`에 남겨라 —
주장마다 「무엇을 어떻게 확인했고 결과가 무엇인가」.

## 반증할 주장 셋

### ① `PlanImport.tsx`가 블록이 속하지 않은 通り芯을 案件에 쓴다

`src/components/plan/PlanImport.tsx:216-218`:

```ts
const grids = plans.flatMap((plan) => plan.grids)
const xGrid = grids.find((grid) => grid.direction === 'X')
const yGrid = grids.find((grid) => grid.direction === 'Y')
const blocks: PlanBlock[] = plans.flatMap((plan) => plan.blocks)
```

`grids`는 **전 페이지를 접은 배열**인데 `.find`는 첫 X·첫 Y 하나씩만 고르고,
`apply(block)`은 **어느 블록을 눌러도** 그 하나를 `applyFramingPlan`에 넘긴다.
`applyFramingPlan`은 `xGrid.spansMm`로 `Grid`를 만들면서 부재 위치는
`block.placements`의 index로 넣는다 — 둘이 같은 도면에서 왔는지 **아무도 확인하지 않는다.**

주장: 스팬이 다른 伏図가 둘 이상 실린 PDF에서, 두 번째 블록을 취입하면
**첫 번째 도면의 스팬**이 案件에 들어가고 `skipped`·`refusal` 어느 쪽에도 남지 않는다.

반증할 것:
- 실물 픽스처(`tests/fixtures/section-import/textitems/yokohama-p7.json`)와 합성 페이지로
  `grids.length > 2`(같은 방향이 둘 이상)가 **원리상 나올 수 없음**을 보여라. 나올 수 있다면 주장은 옳다
- `applyFramingPlan`이나 화면 어딘가에 블록↔그리드 대조가 **이미 있음**을 보여라
- `PlanImport.tsx`가 여러 페이지를 받지 않음을 보여라(받는다면 주장은 옳다)

### ② `applyFramingPlan`의 부재 id가 大梁 방향을 잃는다

`src/lib/import/framing-plan/apply.ts:155`:

```ts
id: `${storyId}-${placement.mark}-${placement.ix}-${placement.iy}`,
```

`placement.axis`가 id에 없다. `role: '辺'`은 X방향과 Y방향 둘이 있고
(`placementFor`, `parse.ts:434-449`) 둘은 `ix`·`iy`가 같을 수 있다.

주장: 같은 符号의 大梁이 같은 격자점에서 X와 Y로 각각 뻗으면 id가 충돌해
**뒤의 하나만 남고 앞의 하나는 조용히 사라진다.** `skipped`에도 남지 않으므로
`applied`만 하나 줄고 사용자는 왜 줄었는지 알 수 없다 — 철근이 과소 계상된다.

반증할 것:
- 같은 符号이 같은 격자점에서 두 방향으로 뻗는 배치가 `parseFramingPlan`에서
  **나올 수 없음**을 보여라(부호 위치가 그 둘을 물리적으로 못 만든다면 주장은 약해진다)
- `deduped`의 덮어쓰기가 실제로는 일어나지 않음을, 또는 `skipped`에 남음을 보여라
- `as Member` 캐스트(`apply.ts:166`)가 없으면 tsc가 이걸 잡았을지도 확인하라

### ③ 그 둘 말고 아키텍처 규칙 위반은 없다

Claude가 「없다」고 주장한 항목이다. **있으면 찾아라** — 이쪽이 반증하기 쉬울 수 있다.
범위는 `git diff origin/main..main`의 `src/` 전부다.

- 도면 데이터를 서버로 보내는 경로가 없다 (예외 둘은 `api/oncall/alert`·`telemetry.ts`)
- `src/domain/`이 React·DOM·three·Next를 import하지 않는다
- 배근 규준 수치(定着·重ね継手·折曲げ·かぶり·할증률) 리터럴이 `.ts`에 없다.
  **주의**: `parse.ts`·`elevation.ts`의 pt 허용오차 상수(`BAND_TOLERANCE_PT` 등)는
  규준값이 아니라 실측 계측값이다 — 이것을 위반으로 세지 마라. 세려면 그것이
  **배근 규준**임을 원문으로 보여라
- 룰팩 `confidence: stated`가 여전히 0행이다

## 재현 방법

주장 ①②는 `vitest`로 재현된다. 임시 테스트 파일을 만들어 돌리고 **지워라**.
`console.log`는 vitest가 삼키므로 `writeFileSync`로 파일에 적어 확인하라.
합성 `TextPage` 만드는 법은 `src/lib/import/framing-plan/parse.test.ts:10-22`에 있다.
`Project` 만드는 법은 `src/lib/import/framing-plan/apply.test.ts:27-37`에 있다.

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
```

`npm run build`는 돌리지 마라 — dev 서버가 떠 있으면 `.next`를 덮는다(AGENTS.md).

## 금지사항

- **코드를 고치지 마라.** 이유: 검증자가 구현자가 되면 교차검증이 무너진다
- **테스트를 커밋하지 마라.** 이유: 위와 같다. 재현은 임시 파일로 하고 지워라
- **주장을 그대로 받아 적지 마라.** 이유: 「돌려봤다」·「맞다」는 검증이 아니다.
  각 주장마다 **틀렸다면 무엇이 보였어야 하는가**를 적고, 그것을 실제로 찾아본 결과를 적어라
- **`tests/fixtures/section-import/expected/*.json`의 `entries`를 고치지 마라** (ADR-010)
