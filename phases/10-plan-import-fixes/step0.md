# Step 0: block-owns-grid

`伏図` 취입이 **블록이 속하지 않은 通り芯**을 案件에 쓴다. 코드리뷰에서 나왔고
codex가 반증에 실패해 확정된 결함이다 (`phases/9-review-refutation/refutation.md` ①).

## 지금 무슨 일이 일어나는가

`src/components/plan/PlanImport.tsx:215-218`:

```ts
const grids = plans.flatMap((plan) => plan.grids)   // 전 페이지를 접는다
const xGrid = grids.find((grid) => grid.direction === 'X')  // 첫 X 하나
const yGrid = grids.find((grid) => grid.direction === 'Y')
const blocks: PlanBlock[] = plans.flatMap((plan) => plan.blocks)
```

`apply(block)`(`:247-262`)은 **어느 블록을 눌러도** 이 하나를 넘긴다.
`applyFramingPlan`은 `xGrid.spansMm`로 案件의 `Grid`를 만들면서 부재 위치는
`block.placements`의 index로 넣는데, 둘이 같은 도면에서 왔는지 아무도 확인하지 않는다.

재현(step 0 착수 전에 직접 돌려 확인하라 — 이 결함이 실재함이 출발점이다):
스팬이 다른 伏図 두 장을 넣고 두 번째 블록을 취입하면 **첫 도면의 스팬**이
案件에 들어가고 `refusal`·`skipped` 어느 쪽에도 남지 않는다.

## 읽어야 할 파일

- `AGENTS.md` — 특히 ADR-030(도면 인식 형상 트랙)과 「지어내지 말 것」
- `docs/ADR.md` — ADR-030, ADR-018, ADR-004
- `phases/9-review-refutation/refutation.md` — 이 결함의 확정 근거와 재현 결과
- `src/lib/import/framing-plan/{types,parse,apply}.ts`
- `src/components/plan/PlanImport.tsx`

## 작업

TDD로 진행하라. **먼저 지금 코드에서 실패하는 테스트를 쓰고**, 그 다음 고쳐라.

### 1. 블록이 자기 通り芯을 갖게 한다

`PlanBlock`에 `xGrid: PlanGridCandidate`·`yGrid: PlanGridCandidate`를 더한다.
`buildBlocks`는 이미 짝지은 `ValidatedSequence` 둘을 손에 쥐고 있으므로
(`parse.ts:459-476`) 거기서 그대로 만든다 — 새로 찾지 마라.

### 2. 틀린 그리드를 **넘길 수 없게** 한다

`PlanApplyOptions`에서 `xGrid`·`yGrid`를 **없애고** `applyFramingPlan`이
`block.xGrid`·`block.yGrid`를 쓰게 한다.

검사(대조 후 거부)가 아니라 제거인 이유: 인자가 없으면 틀린 조합이 **표현 불가능**해진다.
검사로 두면 그 검사를 부르는 것을 잊는 다음 결함이 또 생긴다.

### 3. 화면이 블록마다 자기 通り芯을 보이게 한다

지금 화면은 위쪽에 `xGrid`·`yGrid` 하나씩만 보인다. 그리드가 둘 이상일 때
사용자는 **어느 것이 이 블록의 것인지 알 수 없는 채로 승인**하게 된다 — 취입 경로를
고쳐도 승인 근거가 틀린 것은 그대로다.

- 위쪽 표시는 `grids` **전부**를 낸다 (`.find` 금지). testid는
  `plan-import-grid-{direction}-{index}`
- 블록마다 자기 `xGrid`·`yGrid`의 라벨·스팬을 낸다. testid는 `plan-import-block-grid-{index}`
- 새 문자열이 필요하면 `src/locales/{ja,ko}.json` 양쪽에 넣는다

`ParsedFramingPlan.grids`는 **남긴다.** 블록이 되지 못한 축 열(짝지을 Y가 없는 X)도
여기에는 남으므로 blocks와 같은 것이 아니다. 지우지 마라.

### 4. 테스트

`src/lib/import/framing-plan/` 안에:

- **회귀 테스트(필수)**: 스팬이 다른 합성 `TextPage` 두 장을 파싱해
  `PlanImport.tsx`와 같은 방식으로 접은 뒤, 두 번째 블록을 취입하면
  **두 번째 도면의 스팬**이 案件에 들어가는 것을 고정한다.
  이 테스트는 **고치기 전에 실패해야 한다** — 실패를 확인하고 나서 고쳐라.
  실패를 못 봤다면 테스트가 결함을 안 겨누고 있는 것이다
- `PlanImport.test.tsx`: 그리드가 둘일 때 위쪽에 둘 다 나오고, 블록마다 자기 것이 나온다
- 기존 `apply.test.ts`는 인자가 바뀌었으므로 따라 고친다 — **기대값은 바꾸지 마라.**
  기대값을 바꿔야 통과한다면 그건 이 수정이 계산을 바꿨다는 뜻이니 멈추고 보고하라

합성 `TextPage` 만드는 법은 `parse.test.ts:10-22`, `Project`는 `apply.test.ts:27-37`에 있다.

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc22-plan-import.js
```

**순서를 지켜라 — `build` → dev 기동 → e2e다.** `next dev`가 떠 있는 채로
`npm run build`를 돌리면 같은 `.next`를 덮어 화면이 통째로 안 뜨는데 `curl`은 200을
돌려준다(AGENTS.md). 이미 밟았으면 dev를 죽이고 `rm -rf .next && npm run build`.

`uc22`가 `plan-import-grid-X`를 기다리고 있다(`tests/e2e/uc22-plan-import.js:57,66-67`).
testid를 바꿨으면 uc22도 따라 고쳐라.

## 검증 절차

1. 위 AC를 실행한다.
2. **감도 확인**: 고친 `applyFramingPlan`이 `block.xGrid` 대신 첫 그리드를 쓰도록
   일부러 되돌리면 1의 회귀 테스트가 **실패해야 한다.** 실패하지 않으면 그 테스트는
   결함을 못 겨눈다 — 되돌린 것은 원상복구하고 테스트를 다시 써라
3. `phases/10-plan-import-fixes/index.json`의 step 0을 갱신한다
   (completed / error / blocked 규칙은 기존 phase와 같다)

## 금지사항

- **결함 ②(부재 id에서 大梁 방향이 빠지는 것)를 여기서 고치지 마라.** 이유: step 1의
  스코프다. 한 스텝이 둘을 고치면 어느 수정이 어느 테스트를 통과시켰는지 갈리지 않는다
- **기존 테스트의 기대값을 바꾸지 마라.** 이유: 기대값이 통과하도록 움직이면
  테스트가 구현을 뒤따라가게 되어 반증력을 잃는다. 인자 모양이 바뀐 만큼만 고쳐라
- **`ParsedFramingPlan.grids`를 지우지 마라.** 이유: 블록이 되지 못한 축 열이 거기 남는다
- **`.find`로 그리드를 고르는 코드를 남기지 마라.** 이유: 이 결함의 원인 그 자체다
- **`tests/fixtures/`의 전사 JSON을 고치지 마라** (ADR-010). 이유: 독립 전사가 정답이고
  그것을 고치면 검증이 순환한다
