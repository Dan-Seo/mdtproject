# Step 2: girder-end-conditions

大梁 단부 조건을 판정하는 순수 함수를 만든다. 핵심은 **수용성 검사**다: 직선 정착 L2가 지점 柱 안에 물리적으로 들어가지 않으면(샘플 G1 D25: 35d=875mm > 柱 800mm) 折曲げ定着으로 분기하거나 명시적으로 실패한다. R7(端部条件 대장) ③의 해소다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `AGENTS.md` — 열린 리스크 R7(端部条件 대장) ③
- `src/domain/model/project.ts` — step 0의 `GirderSpan` (`*SupportLengthAlongAxisMm`)
- `src/rulepack/jp-mlit/anchorage.yaml` — `anchorage.L2` / `anchorage.L2h` / `anchorage.La` (M2에서 정식화됨)
- `src/rulepack/jp-mlit/cover.yaml` — `cover.minimum` + `cover.fabrication.addition` (加工用かぶり 조합)
- `src/domain/rebar/column.ts` — `columnEnds` 판정 함수의 선례(단부 조건을 별도 함수로 두는 구조), 룰 조회·단위 환산 헬퍼
- `tests/golden/fixtures/spec-r7-ch5.json` — 5.3.4(5)(ｲ)의 折曲げ定着 조건 2건 (余長 하한·투영정착 하한)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/rebar/girder-ends.ts` 신설

```ts
export type GirderEndDetail =
  | { kind: '直線定着'; lengthRule: 'anchorage.L2'; lengthMm: number }
  | {
      kind: '折曲げ定着'
      lengthRule: 'anchorage.L2h'
      projectionRule: 'anchorage.La'
      lengthMm: number
      projectionMm: number
      direction: '上' | '下'
    }

export interface GirderEndInput {
  /** 지점 柱의 축방향 전체 치수 (GirderSpan의 *SupportLengthAlongAxisMm) */
  supportLengthMm: number
  barSize: BarSize
  fc: number
  grade: SteelGrade
  /** 上端筋이면 '下'(아래로 절곡), 下端筋이면 '上' */
  bendDirection: '上' | '下'
}

export function resolveGirderEnd(input: GirderEndInput, pack: RulePack): GirderEndDetail
```

판정 규칙:
1. 加工用かぶり = `cover.minimum {memberKind: 柱}` + `cover.fabrication.addition` 조회 합.
2. 직선 수용성: `L2(mm) <= supportLengthMm − 加工用かぶり` 이면 `直線定着`.
3. 아니면 折曲げ定着: `anchorage.L2h`(절곡 포함 정착 전장)와 `anchorage.La`(투영 정착 하한) 조회. 투영 수용성 `La <= supportLengthMm − 加工用かぶり`를 검사하고, 5.3.4(5)(ｲ)의 조건(余長 하한·투영정착 하한)을 룰 조회로 확인한다.
4. 折曲げ도 수용 불가면 **throw** — 임의 기본값으로 계산하지 않는다 (ADR-014의 태도).

### 2. 테스트 — `src/domain/rebar/girder-ends.test.ts` 신설

- **회귀 케이스(필수)**: D25·SD345·Fc24·지점 800mm → 직선 L2가 지점을 넘으므로 결과는 `折曲げ定着`이어야 한다. 직선 정착으로 875mm가 나오면 실패.
- 지점이 충분히 큰 케이스(예: 가상의 1200mm 지점) → `直線定着`.
- 경계값: `L2 == support − 加工用かぶり` 정확히 같을 때 직선 허용.
- 折曲げ 투영도 수용 불가한 극단 케이스 → throw.
- 기대값은 전부 `lookupRule`로 유도하라 (골든이 아니라 단위테스트다 — 룰팩 값이 갱신돼도 살아남게).

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 규준 수치 리터럴이 없는가? (L2·La·かぶり 전부 룰 조회)
   - 수용성 비교식이 「지점 치수 − 加工用かぶり」인가? (지점 치수 그대로 비교하면 반대면 かぶり를 뚫는다)
3. `phases/3-girder-domain/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 `GirderEndDetail` 유니온 구조와 판정 순서(직선 → 折曲げ → throw)를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - `anchorage.L2h`·`La` 룰이 룰팩에 없어서 진행 불가 → `"status": "blocked"` + `"blocked_reason"` (M2 산출물 결손이다)

## 금지사항

- **수용 불가 시 직선 정착으로 폴백하지 마라.** 이유: 柱를 뚫는 형상은 물리적으로 거짓이고, 이 제품은 조용히 틀린 값을 내지 않는다.
- **継手位置·カットオフ·連続 스팬 로직을 넣지 마라.** 이유: M3b 스코프다.
- **generateGirderRebar를 만들지 마라.** 이유: step 4의 스코프다.
- 기존 테스트를 깨뜨리지 마라.
