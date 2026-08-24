# Step 1: grid-pairing-guard

`buildBlocks`가 X 열과 Y 열을 **최근접**으로 짝짓는데, 상한도 배타성도 없다.
틀린 짝을 조용히 고른다.

## 지금 무슨 일이 일어나는가

`src/lib/import/framing-plan/parse.ts:480-495`:

```ts
for (const ySequence of ySequences) {
  const distance = distanceToRange(ySequence.across, xExtent.min, xExtent.max)
  if (distance < pairedDistance) { paired = ySequence; pairedDistance = distance }
}
if (!paired) continue
```

셋이 빠져 있다:

1. **상한이 없다.** Y 열이 페이지 반대편에 있어도 「가장 가깝다」는 이유로 짝이 된다.
   `ySequences`가 하나뿐이면 거리와 무관하게 **무조건** 짝지어진다.
2. **배타성이 없다.** 서로 다른 X 열 둘이 같은 Y 열을 가져가도 아무도 모른다.
3. **동점을 조용히 가른다.** `distance < pairedDistance`가 strict라 거리가 같은
   Y 열이 둘이면 **배열 순서로** 이긴다 — 순서는 도면이 정한 것이 아니다.

**phase 10 이전에는 무해했다.** 그때 `yGrid`는 화면 표시와 스냅에만 쓰였다.
지금은 `applyFramingPlan`의 `gridOf`가 `block.yGrid.spansMm`를 **案件의 `Grid.ySpans`로
그대로 쓴다** — 틀린 짝은 이제 곧장 틀린 数量이다. 이 순서 때문에 이 스텝이 이번 phase에서
값이 가장 크다.

## 무엇으로 고칠 것인가

**지어내지 말고 떨어뜨려라.** 이 트랙의 기존 판단과 같다 — 스팬별 축척이 갈리면
`縮尺不整合`, 전체 치수가 합과 다르면 `合計不一致`로 후보를 버린다 (ADR-030).
짝을 확신할 수 없으면 **그 블록을 내지 않는다.** 조용한 그리드를 내느니 실패한다.

임계값은 도면 표기가 아니라 **도면에서 잰 것**에서 유도하라 — 이 파일의 다른 임계값
(`SNAP_RATIO`는 중앙값 스팬의 비율)과 같은 성질이어야 한다. 고정 pt 상수를 새로 만들면
그것은 실측 2부에 맞춘 값이다.

## 읽어야 할 파일

- `AGENTS.md`, `docs/ADR.md` — ADR-030
- `src/lib/import/framing-plan/{parse,types}.ts`
- `src/components/plan/PlanImport.tsx` — issue 코드가 화면에 나오는 경로
- `tests/plan-import/parse.test.ts` — 실측 픽스처 대조
- `src/locales/{ja,ko}.json` — `planImport.issue.*`

## 작업

TDD로 진행하라. **먼저 지금 코드에서 실패하는 테스트를 쓰고**, 그 다음 고쳐라.

### 1. 새 issue 코드

`PLAN_GRID_ISSUES`에 `'通り芯対応不明'`을 더한다.
`src/locales/ja.json`·`ko.json` **양쪽**에 `planImport.issue.通り芯対応不明`을 넣는다.
문면은 「어느 X·Y 通り芯이 한 짝인지 정할 수 없었습니다」의 뜻으로, 각 파일의 기존
문체를 따른다.

### 2. `buildBlocks`가 issue를 낼 수 있게 한다

지금 `buildBlocks`는 `issue` 콜백을 받지 않는다. `parseFramingPlan`이 갖고 있는
`issue`를 인자로 넘겨라. 새 전역 상태를 만들지 마라.

### 3. 상한

짝지음 거리가 임계값을 넘으면 그 X 열은 **블록을 만들지 않고** `通り芯対応不明`을 낸다.
임계값의 근거를 주석으로 남겨라 — 어느 실측값에서 유도했는지가 아니라
**무엇의 비율인지**를 적는다.

### 4. 배타성과 동점

- 이미 다른 X 열이 가져간 Y 열은 다시 쓰지 않는다.
- 최소 거리를 가진 Y 열이 둘 이상이면 고르지 않는다 — `通り芯対応不明`이다.

둘 다 「못 고른다」로 떨어뜨린다. 어느 쪽을 고를지 정하는 규칙을 새로 만들지 마라 —
그 규칙은 도면에 없다.

### 5. 실측이 그대로 통과해야 한다

`tests/plan-import/parse.test.ts`의 yokohama p7 대조(블록 2장, 각자의 그리드)가
**바뀌지 않아야 한다.** 여기가 깨지면 임계값이 좁은 것이다 — 기대값을 고치지 말고
임계값을 다시 유도하라. 픽스처의 기대값은 독립 전사물이다 (ADR-010).

## 검증

`npm run lint` · `npx tsc --noEmit` · `npm run test` · `npm run build`.

**반증 가능함을 보여라.** 아래를 각각 넣고 실패하는 테스트를 적어라(적은 뒤 되돌릴 것):

1. 상한 검사를 지운다 → 실패하는 테스트 이름
2. 배타성 검사를 지운다 → 실패하는 테스트 이름
3. 동점 판정을 「첫 번째를 고른다」로 되돌린다 → 실패하는 테스트 이름
4. 임계값을 10배로 키운다 → 실패하는 테스트 이름

**그리고 반대 방향도 재라**: 임계값을 1/10로 줄이면 실측 대조가 깨지는가?
깨지지 않으면 실측이 이 임계값을 구속하지 않는 것이니 그 사실을 output에 적어라.

## 하지 말 것

- `tests/fixtures/**`의 전사값을 고치지 마라
- 짝을 못 고를 때 **아무거나 골라 넘어가지** 마라
- 기존 issue 코드의 의미를 바꾸지 마라

## 출력

`phases/11-plan-import-hardening/step1-output.json`:

```json
{
  "changed": ["..."],
  "threshold": { "value": "...", "derivedFrom": "...", "constrainedByFixture": true },
  "mutations": [{ "mutation": "...", "failed": ["..."] }],
  "gates": { "lint": "...", "typecheck": "...", "test": "...", "build": "..." }
}
```
