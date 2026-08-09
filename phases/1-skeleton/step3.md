# Step 3: rebar-column

柱 1종의 철근 개체를 생성한다. M1 관통 경로에서 「입력 → **철근** → 물량 → 3D → Excel」의 두 번째 칸이다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — §데이터 흐름의 `RebarGenerator(Member, RulePack) → Rebar[]`
- `/docs/ADR.md` — ADR-005(柱·大梁만), ADR-011(가짜 룰로 먼저 관통), ADR-012(主筋·帯筋은 입력), ADR-015(inferred 전파)
- `/docs/DESIGN.md` — §4.1(算出式 디스클로저에 나오는 산출식 문장 형식), §7(3D 좌표계: X=평면x, Y=높이, Z=평면y, 단위 mm), §10-5(상부 大梁せい를 전역 상수로 두지 않는다)
- step 1의 `src/domain/model/` 전체 — 특히 `beamDepthAbove`
- step 2의 `src/domain/rules/` 전체 — `lookupRule` 시그니처와 룰 key 목록

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** 테스트를 먼저 쓰고 구현하라.

### 1. `Rebar` 타입 — `src/domain/model/`

```ts
type RebarRole = '主筋' | '帯筋'
type RebarShape = 'straight' | 'hook90' | 'hoop'      // DESIGN §4의 形状 아이콘 3종과 1:1

interface Rebar {
  id: string
  memberId: string
  role: RebarRole
  size: BarSize
  shape: RebarShape
  points: [number, number, number][]   // 굽힘점. mm. X=평면x, Y=높이, Z=평면y (DESIGN §7)
  closed: boolean                      // hoop이면 true — 마지막 점과 첫 점을 잇는다
  length: number                       // 加工長 mm
  count: number                        // 부재 1개당 本数
  rules: string[]                      // 이 철근 산출에 기여한 룰 key 목록
  formula: string                      // 算出式 한 줄 (DESIGN §4.1)
}
```

**`rules[]`가 이 step의 핵심 산출물이다.** 이것이 step 4의 inferred 전파와 step 7의 出典 칩·경고 삼각형을 잇는 배선이다. 룰팩을 조회했으면 그 `key`를 빠짐없이 여기 남겨라.

`points`는 3D 뷰어(step 8)와 산출식이 함께 쓴다. `length`를 `points`에서 재계산하지 말고 **加工長 산식의 결과를 그대로 담아라** — 折曲げ·フック余長이 직선 거리와 다르기 때문이다.

### 2. 생성기 — `src/domain/rebar/column.ts`

```ts
interface ColumnRebarInput {
  member: Member
  section: ColumnSection
  story: Story
  beamDepthAbove: number     // mm. 호출자가 step 1의 beamDepthAbove()로 조회해 넘긴다
}

function generateColumnRebar(input: ColumnRebarInput, pack: RulePack): Rebar[]
```

**`beamDepthAbove`를 이 함수 안에서 상수로 정하지 마라.** 인자로 받는다. 프로토타입이 `beamDepthAbove: 750`을 전역 상수로 굳혔고 DESIGN §10-5가 이를 오류로 지목했다.

산출 내용:

**主筋** — `shape: 'straight'`, `count`는 `section.main.count`를 **그대로** 쓴다. 구조적으로 재산정하지 마라(ADR-012). 加工長은 階高에 定着長さ와 重ね継手長さ를 조합해 만든다. 필요한 값은 전부 `lookupRule`로 조회한다: `anchorage.*`, `lap.*`, `cover.*`. `d`(경) 배수 단위(`unit: 'd'`)로 온 값은 호칭경 수치를 곱해 mm로 바꾼다 — **호칭경→mm 변환표도 룰팩에서 오게 하거나, `BarSize` 문자열에서 파싱하라. 코드에 `D25 → 25` 표를 리터럴로 쓰지 마라.**

**帯筋** — `shape: 'hoop'`, `closed: true`. 加工長은 断面에서 かぶり厚さ를 뺀 폐합 둘레에 135° フック余長 2개를 더한 값이다. 산식은 DESIGN §4.1이 형식을 보여준다:

```
加工長 ＝ 2×{(b−2×かぶり)＋(d−2×かぶり)} ＋ 2×135°フック余長
```

本数는 다음과 같다:

```
本数 ＝ ⌈(階高 − 상부 大梁せい) ÷ 피치⌉ ＋ 1
```

피치는 `section.hoop.pitch`를 그대로 쓴다(ADR-012). **이 산식 안의 `階高`·`せい`·`피치`는 전부 입력이고, 규준에서 오는 것은 かぶり厚さ와 フック余長뿐이다.** 그 둘만 `lookupRule`로 조회한다.

**반올림** — 加工長에 반올림이 필요하면 `rounding.length` 룰을 조회해서 적용하고, 그 key를 `rules[]`에 넣어라. 코드에 `10`을 쓰지 마라(DESIGN §10-4).

### 3. 산출식 문자열

`formula`는 DESIGN §4.1의 요구를 만족해야 한다: **읽는 사람이 표 값을 손으로 재현할 수 있어야 하고, 어느 규준값이 어디에 들어갔는지가 문장에 남아야 한다.** 숫자만 나열하지 마라.

```
加工長 ＝ 2×{(800−2×40)＋(800−2×40)} ＋ 2×135°フック余長 6d(78) ＝ 3040
本数 ＝ ⌈(階高 4200 − 上部大梁せい 750) ÷ 100⌉ ＋ 1 ＝ 36
```

### 4. 테스트

가짜 룰팩을 쓰는 단계이므로 **골든테스트가 아니라 유닛 테스트**다. `tests/golden/`에 넣지 마라 — 골든테스트는 원문 대조가 끝난 값만 담는다.

테스트에 최소한 아래를 포함한다:

- 고정 입력(C1 800×800, 主筋 12-D25, 帯筋 D13@100, 階高 4200, 상부 大梁せい 750)에 대해 主筋 `count === 12`, 帯筋 `count === 36`
- 帯筋의 `closed === true`, `shape === 'hoop'`
- 모든 `Rebar.rules[]`가 비어 있지 않고, 각 key가 룰팩에 실재
- `section.main.count`를 바꾸면 主筋 `count`가 그대로 따라간다 (제품이 本数를 재산정하지 않는다는 회귀 테스트)
- `beamDepthAbove`를 바꾸면 帯筋 `count`가 바뀐다 (전역 상수가 아니라는 회귀 테스트)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
npm run test:golden
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/domain/rebar/`가 React·DOM·three.js를 import하지 않는가? (CRITICAL)
   - 규준 수치 리터럴이 `.ts`에 없는가? — 40, 35, 8, 6, 10 같은 숫자가 보이면 룰팩으로 옮겨라 (ADR-002)
   - 主筋 本数·帯筋 피치를 재산정하지 않는가? (ADR-012)
   - `大梁`·`壁`·`スラブ` 배근 코드를 만들지 않았는가? — 大梁 배근은 M3다 (ADR-005)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: `Rebar` 필드, 생성기 시그니처, 조회한 룰 key 목록)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **大梁·あばら筋 생성기를 만들지 마라.** 이유: M3다. 마일스톤 순서를 건너뛰지 않는다.
- **`beamDepthAbove`를 상수로 두지 마라.** 이유: 부재별 사실을 전역 상수로 굳히는 오류다 (DESIGN §10-5).
- **`D25 → 25` 같은 호칭경 변환표를 `.ts`에 리터럴로 쓰지 마라.** 이유: ADR-002. 룰팩 조회이거나 `BarSize` 문자열 파싱이어야 한다.
- **`rules[]`를 비워두지 마라.** 이유: inferred 경고와 워터마크(ADR-015)가 이 배열을 타고 전파된다. 비면 오염된 값이 깨끗해 보인다.
- **`Rebar[]`를 캐시하거나 스토어에 저장하지 마라.** 이유: 파생 상태다. `Project`에서 매번 계산한다 (ARCHITECTURE.md).
- 기존 테스트를 깨뜨리지 마라.
