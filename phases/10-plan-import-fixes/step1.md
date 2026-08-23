# Step 1: girder-axis-id

같은 符号의 大梁이 한 격자점에서 두 방향으로 뻗으면 **한 본이 조용히 사라진다.**
코드리뷰에서 나왔고 codex가 반증에 실패해 확정된 결함이다
(`phases/9-review-refutation/refutation.md` ②).

## 지금 무슨 일이 일어나는가

`src/lib/import/framing-plan/apply.ts:155`:

```ts
id: `${storyId}-${placement.mark}-${placement.ix}-${placement.iy}`,
```

`placement.axis`가 없다. `role: '辺'`은 X방향과 Y방향 둘이고(`parse.ts:434-449`의
`placementFor`) 둘은 `ix`·`iy`가 같을 수 있다. 그러면 id가 같아지고
`apply.ts:169-170`의 `Map.set`이 뒤의 것으로 앞의 것을 덮는다.

`skipped`에도 남지 않으므로 화면에는 `applied`가 하나 줄어든 것만 보이고
사용자는 이유를 알 수 없다 — **철근이 과소 계상된다.**

## 읽어야 할 파일

- `phases/9-review-refutation/refutation.md` — 이 결함의 확정 근거와 재현 결과
- `src/lib/import/framing-plan/apply.ts` — 특히 `applyFramingPlan`의 id·`deduped`
- `src/lib/import/framing-plan/parse.ts:434-449` — `placementFor`

## 작업

TDD로 진행하라. **먼저 지금 코드에서 실패하는 테스트를 쓰고**, 그 다음 고쳐라.

### 1. id가 방향을 잃지 않게 한다

`placement.axis`를 id에 싣는다. `axis`가 없는 역할(`格子点`·`ベイ`)에서 id 모양이
어떻게 되든 상관없으나, **같은 역할끼리 충돌하지 않는 것**만은 지켜라.

### 2. 중복 접기가 여전히 듣는지 확인한다

id를 위치로 만든 것은 실수가 아니라 **의도**다(`apply.ts:152-154` 주석) — 같은 블록을
두 번 눌러도 부재가 두 배로 늘지 않게 하려는 것이다. 방향을 넣어도 그 성질은
유지되어야 한다(같은 보를 두 번 넣으면 방향도 같으니 여전히 하나로 접힌다).

**「그럴 것이다」로 넘기지 말고 테스트로 고정하라.** 이번 결함 둘이 정확히 그렇게
1402개 테스트를 통과한 채 숨어 있었다.

### 3. 죽은 캐스트

`apply.ts:166`의 `as Member`는 지금 아무것도 하지 않는다 — 빼도 `npm run typecheck`가
통과하는 것이 확인됐다(refutation.md ②). 빼라. 이유: 지금 무해하지만 앞으로
`Member` 스키마가 자랄 때 **그 자리만 조용히 통과시킨다.**

빼고 typecheck가 **실패하면 되돌리고 무엇이 실패했는지 보고하라** — 그때는 그 캐스트가
무언가를 가리고 있었다는 뜻이고, 그것이 새 정보다.

### 4. 테스트

`src/lib/import/framing-plan/apply.test.ts`에:

- **회귀 테스트(필수)**: 같은 `mark`·같은 `ix`·`iy`에 `axis: 'X'`와 `axis: 'Y'` 배치 둘을
  넣으면 **둘 다 남는다**(`applied === 2`, 두 부재의 `position.axis`가 각각 X·Y).
  이 테스트는 **고치기 전에 실패해야 한다** — 실패를 확인하고 나서 고쳐라
- **중복 접기 테스트**: 같은 배치가 두 번 든 블록을 취입하면 `applied === 1`이다
  (2의 성질을 고정한다)

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc22-plan-import.js
```

**순서를 지켜라 — `build` → dev 기동 → e2e다** (step 0과 같은 이유, AGENTS.md).

## 검증 절차

1. 위 AC를 실행한다.
2. **감도 확인**: id에서 `axis`를 도로 빼면 1의 회귀 테스트가 **실패해야 한다.**
   실패하지 않으면 그 테스트는 결함을 못 겨눈다 — 되돌리고 다시 써라
3. `phases/10-plan-import-fixes/index.json`의 step 1을 갱신한다.
   summary에 id 규칙과 중복 접기가 유지된다는 사실을 한 줄로

## 금지사항

- **`skipped`에 「id가 겹쳐 버렸다」를 추가하지 마라.** 이유: 고친 뒤에는 겹치지 않으므로
  일어날 수 없는 상황이고, 일어날 수 없는 것에 대한 처리는 죽은 코드다
- **`Member.id`에 타입을 새로 씌우지 마라**(브랜드 타입·유일성 타입 등). 이유: 요청되지
  않은 추상화다. 이 결함은 문자열 하나가 짧았던 것이지 타입 체계의 문제가 아니다
- **step 0의 결과를 되돌리지 마라.** 이유: 같은 파일을 만지므로 충돌하기 쉽다.
  `applyFramingPlan`의 인자는 step 0이 정한 모양 그대로 두어라
- **`tests/fixtures/`의 전사 JSON을 고치지 마라** (ADR-010)
