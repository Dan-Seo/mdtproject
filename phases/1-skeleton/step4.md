# Step 4: quantity

`Rebar[]`를 부재 그룹별로 집계해 내역서 행(`QuantityLine[]`)을 만든다. 設計数量 → 할증률 조회 → 所要数量까지가 이 step이다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — §데이터 흐름의 `QuantityAggregator(Rebar[], RulePack) → QuantityLine[]`, §패턴의 「할증률 룰은 부재 구분을 인자로 받는다」
- `/docs/ADR.md` — ADR-013(設計数量·所要数量 둘 다 산출), ADR-014(할증률은 부재 구분 인자·범위 밖 실패), ADR-015(inferred 경고·워터마크)
- `/docs/SOURCES.md` — §수량적산기준에서 직접 확인한 값 (6·13·14·20쪽)
- `/docs/DESIGN.md` — §3.1(그룹 = `{층}|{C|G}|{符号}`, 1행 + 箇所수), §3.2(행 id = `1F|C|C1|main`), §4(내역서 12열), §5(inferred 전파 규칙)
- step 1의 `src/domain/model/` — `memberGroupKey`
- step 2의 `src/domain/rules/` — `lookupMarkup`, `lookupUnitMass`
- step 3의 `src/domain/rebar/` — `Rebar` 타입과 `rules[]`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** 테스트를 먼저 쓰고 구현하라.

### 1. `QuantityLine` 타입과 집계 함수 — `src/domain/quantity/`

```ts
interface QuantityLine {
  id: string                 // 행 id. '1階|C|C1|主筋' 형식 — DESIGN §3.2의 hoverRow 값
  groupId: string            // '1階|C|C1'
  storyName: string
  memberKind: MemberKind
  mark: string               // 符号
  sectionLabel: string       // '800×800'
  role: RebarRole
  size: BarSize
  shape: RebarShape
  lengthMm: number           // 부재 1개당 철근 1본의 加工長
  countPerMember: number     // 本数
  places: number             // 箇所 — 그룹에 속한 부재 수
  totalLengthMm: number      // lengthMm × countPerMember × places
  unitMassKgPerM: number
  designKg: number           // 設計数量
  requiredKg: number         // 所要数量
  rules: RuleHit[]           // 기여한 룰 — step 7의 出典 칩이 그대로 쓴다
  inferred: boolean
  formula: string
}

function aggregateQuantity(project: Project, rebars: Rebar[], pack: RulePack): QuantityLine[]
```

집계 규칙:

- 같은 `groupId`(층 + 부재종 + 符号)의 부재는 **한 행으로 묶고 `places`(箇所)로 센다.** 9개 기둥이면 1행 × 9箇所다(DESIGN §3.1).
- 같은 그룹 안에서 `role`이 다르면 행이 나뉜다(主筋 행, 帯筋 행).
- **그룹 안의 부재들이 서로 다른 `lengthMm`/`countPerMember`를 내면 묶지 말고 throw 하라.** 같은 符号인데 결과가 다르면 입력이나 생성기가 잘못된 것이고, 조용히 평균 내거나 첫 번째를 쓰면 틀린 수량이 나간다.

수량 계산:

- `totalLengthMm = lengthMm × countPerMember × places`
- `designKg = (totalLengthMm / 1000) × unitMassKgPerM` — 단위질량은 `lookupUnitMass(pack, size)`
- `requiredKg = designKg × (1 + 할증률)` — 할증률은 **`lookupMarkup(pack, member.memberClass)`**

**`lookupMarkup`에 `'躯体'`를 하드코딩해 넘기지 마라.** `Member.memberClass`를 그대로 전달한다. 그래야 지원 범위가 넓어질 때 ADR-014의 실패가 실제로 발동한다.

**도메인은 반올림하지 않는다.** `number`를 그대로 담고, 표시 자릿수(길이 소수 3자리 등)는 step 7의 UI가 정한다. 中間 반올림을 넣으면 합계가 어긋난다.

### 2. inferred 전파

DESIGN §5의 규칙을 그대로 구현한다:

- 행의 `rules[]` 중 **하나라도** `confidence === 'inferred'`면 그 **행 전체가 `inferred: true`**
- 단위질량과 할증률도 룰이므로 `rules[]`에 포함된다 — 즉 M1에서는 단위질량이 `inferred`라 사실상 모든 행이 `inferred`가 된다. **정상이다.** ADR-015가 이 상태를 차단이 아니라 경고·워터마크로 처리하도록 정했다.

```ts
function hasInferred(lines: QuantityLine[]): boolean
function inferredRules(lines: QuantityLine[]): RuleHit[]   // 중복 제거된 기여 항목 목록. step 9의 워터마크 둘째 줄이 쓴다
```

### 3. 소계·합계

DESIGN §4의 행 계층이 층 행 → 그룹 행 → 철근 행 3단이고 층 행에 소계, 맨 아래 합계 행이 있다. **집계 함수는 평평한 `QuantityLine[]`만 반환하고, 층 소계·합계는 별도 순수 함수로 제공하라.** 계층 구조를 도메인 타입에 넣지 마라 — 표시 형태이지 데이터 형태가 아니다.

```ts
function storySubtotals(lines: QuantityLine[]): { storyName: string; designKg: number; requiredKg: number }[]
function grandTotal(lines: QuantityLine[]): { designKg: number; requiredKg: number }
```

### 4. 골든테스트 — `tests/golden/`

`tests/golden/fixtures/`에 픽스처를 추가한다. 출처를 반드시 적어라:

- 출처: `公共建築数量積算基準 令和5年3月29日改定`, **20쪽**, 「鉄筋について、その所要数量を求めるときは、その設計数量の４％の割増を標準とする」
- 반올림 정책: 없음 (도메인은 raw number)

테스트 케이스:

- 設計数量 1000 kg → 所要数量 1040 kg (躯体)
- `memberClass`가 지원 범위 밖인 `Member`가 섞이면 `aggregateQuantity`가 **throw** (ADR-014가 집계 경로에서도 살아 있는지 확인)

### 5. 유닛 테스트

- 같은 符号 부재 9개 → 1행, `places === 9`
- 같은 그룹에서 `lengthMm`이 갈리면 throw
- `rules[]`에 `inferred`가 하나라도 있으면 행 `inferred === true`
- `inferredRules()`가 중복 없이 기여 항목을 모두 반환

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
   - `src/domain/quantity/`가 React·DOM·three.js를 import하지 않는가? (CRITICAL)
   - 할증률 `0.04`·`1.04`가 `.ts`에 리터럴로 없는가? — 룰팩 조회여야 한다 (ADR-002, DESIGN §10-2)
   - `lookupMarkup`에 부재 구분이 인자로 전달되는가? 하드코딩이 아닌가? (ADR-014)
   - 콘크리트·거푸집 물량을 내지 않는가? 철근만인가? (ADR-005)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: `QuantityLine` 필드, 행 id 형식, 소계·합계 함수 이름, inferred 전파 헬퍼)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **할증률을 상수로 두지 마라.** 이유: 프로토타입의 `reqKg = designKg * V.markup`이 정확히 이 오류였다 (DESIGN §10-2, ADR-014).
- **`memberClass`가 범위 밖일 때 기본값 4%를 주지 마라.** 이유: 지원 범위를 넓힌 순간 조용히 틀린 값이 나간다 (ADR-014).
- **절단 로스·이음 개소 최적화를 구현하지 마라.** 이유: 수량적산기준 6쪽이 所要数量을 「定尺寸法による切り無駄…を含んだ数量」로 정의한다 — 표준 할증률에 이미 포괄되어 있다 (ADR-013).
- **`QuantityLine[]`을 스토어에 저장하지 마라.** 이유: 파생 상태다 (ARCHITECTURE.md §상태 관리).
- **도메인에서 반올림·자릿수 포맷을 하지 마라.** 이유: 표시 정책이고, 중간 반올림은 합계를 어긋나게 한다.
- 기존 테스트를 깨뜨리지 마라.
