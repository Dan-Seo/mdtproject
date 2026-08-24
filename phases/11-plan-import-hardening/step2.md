# Step 2: xy-blind-tests

phase 10의 테스트가 **X와 Y를 구별하지 못한다.** 결함이 아니라 **검증의 구멍**이고,
이것을 남겨 두면 step 0·step 1의 뮤테이션 보고도 같은 이유로 헐거워진다.

## 지금 무슨 일이 일어나는가

### ① 합성 픽스처가 두 방향에 같은 값을 쓴다

`src/lib/import/framing-plan/apply.test.ts`의 도우미:

```ts
function framingPage(spanMm: number): TextPage {
  return { widthPt: 1000, heightPt: 1000, items: [
    h('X1', 0, -40), h('X2', 200, -40), h(String(spanMm), 100, -20),
    h('Y1', -40, 0), h('Y2', -40, 200), v(String(spanMm), -20, 100),
  ]}
}
```

X 스팬과 Y 스팬이 **같은 수**다. 그래서 `xGrid`와 `yGrid`를 맞바꾸는 구현 실수를
이 테스트는 못 본다.

Claude가 phase 10에서 돌린 뮤테이션은 `buildBlocks`를 통째로 흔들어 X·Y가 **함께**
깨졌기 때문에 통과했다. **Y만** 흔드는 뮤테이션이었으면 전부 통과했을 것이다 —
이것은 Claude 자신의 검증 구멍이었다.

### ② 화면 testid 하나가 두 방향을 함께 감싼다

`PlanImport.tsx`:

```tsx
<div data-testid={`plan-import-block-grid-${index}`}>
  <Axes ... label={gridX} />
  <Axes ... label={gridY} />
</div>
```

testid가 블록당 하나뿐이라, 두 `Axes`가 뒤바뀌어도 텍스트 대조가 통과한다.

### ③ 실측 e2e가 X·Y를 못 가른다

`tests/e2e/uc22-plan-import.js`가 쓰는 yokohama p7은 **두 블록의 Y 스팬이 완전히 같다**
(`[5000,6000,10000,6000,5000]`, 라벨도 `bY6..bY1`로 같다). 그래서 「블록마다 자기
그리드를 쓴다」를 이 도면으로는 **원리상** 확인할 수 없다 — X 스팬만 다르다.

### ④ 한 페이지에 스팬이 다른 伏図 두 장인 케이스가 커밋되어 있지 않다

Claude가 phase 10 검증 때 일회성 프로브로만 돌렸다. 남지 않았으므로 없는 것과 같다.

## 읽어야 할 파일

- `AGENTS.md`
- `src/lib/import/framing-plan/apply.test.ts`, `parse.test.ts`
- `src/components/plan/PlanImport.tsx`, `PlanImport.test.tsx`(있으면)
- `tests/e2e/uc22-plan-import.js`, `tests/e2e/README.md`

## 작업

### 1. `framingPage`가 방향을 가르게 한다

X와 Y에 **서로 다른 스팬**을 받게 고친다(예: `framingPage(xSpanMm, ySpanMm)`).
기존 호출부는 두 값이 다르도록 바꾼다.

그 위에 **X·Y를 맞바꾸면 실패하는** 테스트를 더한다 — 취입 결과의 `grid.xSpans`와
`grid.ySpans`를 각각 확인한다.

### 2. testid를 방향별로 가른다

`plan-import-block-grid-{index}-{direction}` (`direction`은 `X`·`Y`)로 바꾼다.
감싸고만 있던 `<div>`는 그때 쓸모가 없어지므로 지운다.
`Axes`의 `testId`를 optional로 두었던 것도 되돌려 **필수**로 만든다 —
optional이었던 이유가 이 `<div>` 하나였다.

`tests/e2e/uc22-plan-import.js`에서 이 testid를 쓰는 곳이 있으면 함께 고친다.

### 3. 한 페이지 · 伏図 두 장 · 스팬 상이

**커밋되는 테스트**로 넣는다. 한 페이지에 나란히 선 伏図 두 장(예: 왼쪽 6000, 오른쪽 8000)에서
- 블록이 2개 나오고,
- 각 블록의 `xGrid.spansMm`가 자기 도면의 값이고,
- 각각을 취입하면 案件의 `Grid`가 그 블록의 값이 된다

를 확인한다. X뿐 아니라 **Y도 다르게** 두어라 (1의 이유와 같다).

### 4. e2e가 무엇을 못 보는지 적는다

`tests/e2e/uc22-plan-import.js`는 실측 PDF로 도는 것이 값이므로 도면을 바꾸지 마라.
대신 파일 상단 주석에 **이 시나리오가 확인하지 못하는 것**을 적어라 —
「p7의 두 블록은 Y 스팬·라벨이 동일하므로 블록별 Y 그리드 귀속은 여기서 검증되지 않는다.
그것은 <위 3의 테스트 이름>이 덮는다」.

거짓 안심을 남기지 않는 것이 이 항의 목적이다. 없는 검증을 있는 것처럼 두지 마라.

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build`.

e2e는 **build → dev 기동 → e2e** 순서다 (`next dev`가 뜬 채 `npm run build`를 돌리면
`.next`가 덮여 화면이 통째로 안 뜨는데 `curl`은 200을 준다):

```
npm run build
npm run dev &
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc22-plan-import.js
```

**반증 가능함을 보여라.** 아래를 각각 넣고 실패하는 테스트를 적어라(적은 뒤 되돌릴 것):

1. `gridOf`에서 `xGrid`와 `yGrid`를 맞바꾼다 → 실패하는 테스트 이름
2. `buildBlocks`에서 **Y 그리드만** 첫 번째 것으로 고정한다 → 실패하는 테스트 이름
3. `PlanImport.tsx`에서 블록별 `Axes` 두 개의 순서를 바꾼다 → 실패하는 테스트 이름

2번이 통과하면 이 스텝의 목적이 달성되지 않은 것이다 — 그 뮤테이션이 phase 10을
통과했던 바로 그것이다.

## 하지 말 것

- 실측 픽스처(`tests/fixtures/**`)의 전사값을 고치지 마라
- e2e의 대상 PDF를 바꾸지 마라
- 「돌려봤다」·「통과했다」를 검증으로 적지 마라 — 뮤테이션 결과만이 검증이다

## 출력

`phases/11-plan-import-hardening/step2-output.json`:

```json
{
  "changed": ["..."],
  "mutations": [{ "mutation": "...", "failed": ["..."] }],
  "e2eBlindSpot": "...",
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "...", "e2e": "..." }
}
```
