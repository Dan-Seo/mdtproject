# Step 0: placement-axis-union

`MemberPlacement.axis`가 optional이라 **세 함수가 서로 다른 답을 낸다.**
코드리뷰 지적 ①②이고, Claude가 프로브로 재현했다.

## 지금 무슨 일이 일어나는가

`src/lib/import/framing-plan/types.ts`:

```ts
export interface MemberPlacement {
  mark: string
  role: PlanPlacementRole      // '格子点' | '辺' | 'ベイ'
  ix: number
  iy: number
  axis?: 'X' | 'Y'             // role === '辺' 일 때만
}
```

`axis` 없는 `role: '辺'`을 세 곳이 다르게 읽는다 (`apply.ts`):

| 함수 | 코드 | 뜻 |
|---|---|---|
| `positionOf` | `placement.axis ?? 'X'` | **X로 친다** |
| `withinGrid` | `placement.axis === 'X'` | **X도 Y도 아니다** |
| `id` | `placement.axis ? \`-${axis}\` : ''` | **아무것도 안 붙인다** |

재현(착수 전에 직접 돌려 확인하라 — 결함이 실재함이 출발점이다):

- `axis` 없는 `辺` 둘을 같은 `mark`·`ix`·`iy`로 넣으면 id가 같아 하나로 접혀야 하는데,
  `positionOf`가 둘 다 `axis:'X'`로 만들어 **위치가 완전히 같은 부재 2개**가 나온다
  (`applied: 2`). 그대로 물량에 들어가면 **이중 계상**이다.
- 스팬 2개짜리 X 그리드에서 `axis` 없는 `辺`을 `ix: 2`로 넣으면 `withinGrid`가
  `lastIx = nx - 1 = 2`로 봐서 통과시키고(`skipped: []`), `positionOf`가 `axis:'X'`를
  붙여 **격자 밖으로 뻗는 大梁**을 만든다.

## 지금은 도달 불가다 — 그래서 고치는 방법이 정해진다

`placementFor`(`parse.ts:434-450`)가 `role: '辺'`의 **유일한 생산자**이고 거기서는
`axis`를 반드시 넣는다. 즉 이 셋은 오늘 터지지 않는 **잠재 결함**이다.

그러므로 값 검사를 넣지 마라. 고칠 것은 **타입이 허용한다는 사실**이다 —
표현할 수 없게 만들면 세 함수가 어긋날 자리 자체가 없어진다 (phase 10 step 0과 같은 수).

## 읽어야 할 파일

- `AGENTS.md`, `docs/ADR.md` — ADR-030·ADR-004
- `src/lib/import/framing-plan/{types,parse,apply}.ts`
- `src/lib/import/framing-plan/apply.test.ts`, `tests/plan-import/parse.test.ts`

## 작업

TDD로 진행하라. **먼저 지금 코드에서 실패하는 테스트를 쓰고**, 그 다음 고쳐라.

### 1. `MemberPlacement`를 판별 유니온으로 바꾼다

```ts
export type MemberPlacement =
  | { mark: string; role: '格子点' | 'ベイ'; ix: number; iy: number }
  | { mark: string; role: '辺'; ix: number; iy: number; axis: 'X' | 'Y' }
```

`role: '辺'`이면 `axis`가 **필수**이고, 나머지 둘에는 **없다**.
`PLAN_PLACEMENT_ROLES`·`PlanPlacementRole`은 그대로 둔다 (`ROLE_FOR_KIND`가 쓴다).

### 2. `apply.ts`의 세 자리를 유니온에 맞춘다

- `positionOf` — `?? 'X'` 기본값을 **없앤다**. `role === '辺'`이면 `placement.axis`를 그대로 쓴다.
- `withinGrid` — `placement.axis === 'X'` 판정은 유니온 좁히기 뒤에 그대로 쓸 수 있다.
- `id` — `placement.axis ? ... : ''` 삼항을 **없앤다**. `role === '辺'`일 때만 붙인다.

`as`·`!`·`any`로 좁히지 마라. 좁혀지지 않으면 유니온이 잘못 쓰인 것이다.

### 3. `placementFor`의 반환 타입

`MemberPlacement | undefined`인데 `undefined`를 내는 경로가 없다.
유니온으로 바꾸면 이것이 눈에 띈다 — **`MemberPlacement`로 좁혀라**.
호출부(`buildBlocks`)의 `if (placement)` 가드는 그때 죽은 코드가 되므로 함께 지운다.
그 외의 죽은 코드는 건드리지 마라.

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build` 가 통과해야 한다.

그리고 **반증 가능함을 보여라.** 아래 뮤테이션을 각각 넣고 무엇이 실패하는지 적어라
(적은 뒤 반드시 되돌릴 것):

1. `positionOf`를 `{ axis: 'X', ... }` 고정으로 바꾼다 → 실패하는 테스트 이름
2. `id`에서 `-${axis}` suffix를 뗀다 → 실패하는 테스트 이름
3. `withinGrid`의 `辺`+`axis === 'Y'` 가지를 지운다 → 실패하는 테스트 이름

셋 중 **하나라도 전부 통과하면 그 자리는 테스트가 없는 것이다.** 테스트를 더 써라.

타입만 바꾸고 끝내지 마라 — 유니온이 실제로 잘못된 조합을 막는지 보이는 테스트가 필요하다.
`@ts-expect-error`로 「이 조합은 타입 오류다」를 고정하는 테스트를 `types.test.ts`에 넣어라.

## 하지 말 것

- `axis`에 기본값을 주는 어떤 코드도 쓰지 마라
- `placementFor` 밖에서 `role: '辺'`을 만들지 마라
- 스키마 버전(`Project.schemaVersion`)을 건드리지 마라 — `MemberPlacement`는 案件에
  저장되지 않는 취입 중간 표현이라 기존 기록과 무관하다

## 출력

`phases/11-plan-import-hardening/step0-output.json`:

```json
{
  "changed": ["..."],
  "mutations": [
    { "mutation": "positionOf 고정", "failed": ["테스트 이름"] },
    { "mutation": "id suffix 제거", "failed": ["..."] },
    { "mutation": "withinGrid Y 가지 제거", "failed": ["..."] }
  ],
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "..." }
}
```
