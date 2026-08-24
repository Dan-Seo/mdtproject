# Step 3: drop-axes-alias

`PlanBlock`이 같은 배열을 **두 이름으로** 갖는다. phase 10이 남긴 것이다.

## 지금 무슨 일이 일어나는가

`parse.ts`의 `buildBlocks`:

```ts
const xGrid = gridCandidate(xSequence)
const yGrid = gridCandidate(paired)
const xAxes = xGrid.axes      // 같은 참조
const yAxes = yGrid.axes      // 같은 참조
```

`block.xAxes === block.xGrid.axes`다. 오늘은 같은 것을 가리키므로 무해하지만,
`PlanBlock`의 계약은 「둘이 같다」를 아무 데도 적어 두지 않았다 — 한쪽만 고치는
다음 편집이 두 이름을 갈라놓을 수 있고, 그때 어느 쪽이 옳은지는 타입이 말해 주지 않는다.

`xGrid`·`yGrid`가 들어온 지금 `xAxes`·`yAxes`는 **별칭일 뿐**이다.

## 읽어야 할 파일

- `src/lib/import/framing-plan/{types,parse}.ts`
- 소비처 전부: `apply.test.ts`, `parse.test.ts`, `tests/plan-import/parse.test.ts`
- `src/components/plan/PlanImport.tsx`

## 작업

`PlanBlock`에서 `xAxes`·`yAxes`를 **없앤다.** 소비처는 `block.xGrid.axes`·`block.yGrid.axes`를 쓴다.

`buildBlocks` 안의 지역 변수 `xAxes`·`yAxes`는 남겨도 된다 — 없애는 것은 **타입의 필드**다.
`blocks.sort`의 비교자도 `xGrid.axes`를 보게 고친다.

기계적 치환이다. 이 스텝에서 **동작을 바꾸지 마라** — 테스트 기대값이 하나라도 바뀌면
치환이 아니라 다른 일을 한 것이다.

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build`.

**테스트 기대값이 바뀌지 않았음을 보여라**: 이 스텝의 diff에서 `expect(...)`의
**기대값 쪽**이 바뀐 줄이 있으면 그 줄과 이유를 output에 적어라. 없어야 정상이다.
접근 경로(`block.xAxes` → `block.xGrid.axes`)만 바뀐다.

`npm run test` 통과 수가 step 2 종료 시점과 같아야 한다 — 수를 적어라.

## 하지 말 것

- 다른 필드를 함께 정리하지 마라
- 관련 없는 죽은 코드를 지우지 마라 — 발견하면 output에 적기만 한다

## 출력

`phases/11-plan-import-hardening/step3-output.json`:

```json
{
  "changed": ["..."],
  "testCountBefore": 0,
  "testCountAfter": 0,
  "expectationChanges": [],
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "..." }
}
```
