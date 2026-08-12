# Step 3: stirrup-layout

あばら筋 배치를 **위치 배열**로 계산하는 순수 함수를 만든다. `⌈clear÷pitch⌉+1` 같은 본수 공식만으로는 마지막 철근이 부재 밖(예: @150에서 5,250 > 内法 5,200)에 놓이는 것을 못 잡는다 — 위치 자체를 계산하고 불변조건으로 검증한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `AGENTS.md` — 열린 리스크 R2(관행은 inferred로 축적), CRITICAL(룰팩 항목엔 source·confidence 필수)
- `src/domain/rules/loader.ts` — inferred 항목은 `source.page: null` 허용
- `src/rulepack/jp-mlit/bend.yaml` — 기존 inferred 플레이스홀더의 note 서식
- `src/domain/rebar/column.ts` — 帯筋 본수 계산부 (이 step에서는 수정 금지 — 柱는 기존 방식 유지)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. 룰팩 — `stirrup.start-offset` 신설 (`src/rulepack/jp-mlit/` 기존 파일 중 적절한 곳, 예: bend.yaml)

첫 あばら筋의 柱面 이격은 標準仕様書에 조문이 없는 관행이다. 근거 없는 0 가정 대신, 가정을 명시한 inferred 항목으로 등재한다:

```yaml
- key: stirrup.start-offset
  label: あばら筋の初期配置オフセット
  expr: 柱面から50mm
  conditions: {}
  value: 50
  unit: mm
  source: { ref: spec, section: null, page: null }
  confidence: inferred
  note: 条文なし — 実務慣行の仮定値。第1あばら筋を柱面から50mm に置く。独立検討待ち (R2)
```

### 2. `src/domain/rebar/stirrup-layout.ts` 신설

```ts
export interface StirrupLayout {
  /** 内法 좌표계(좌측 柱面 = 0)의 위치 배열 (mm) */
  positionsMm: number[]
  /** 마지막 잔여 간격 (mm) — 범례 표시용 */
  lastGapMm: number
}

export function stirrupPositions(
  clearMm: number,
  pitchMm: number,
  startOffsetMm: number,
): StirrupLayout
```

배치 규칙:
1. 배치 가능 구간은 `[startOffsetMm, clearMm − startOffsetMm]` (양단 대칭).
2. `pitchMm` 간격으로 놓고, 잔여 구간이 있으면 구간 끝에 마지막 철근을 추가한다 (등간격이 아니어도 됨 — 최대 간격만 지키면 된다).
3. 불변조건: 모든 위치가 구간 안 / 인접 간격 ≤ pitch / 나누어떨어질 때 끝점 중복 없음.
4. `pitchMm <= 0`, `clearMm <= 2×startOffsetMm` 등 성립 불가 입력은 throw.

### 3. 테스트 — `src/domain/rebar/stirrup-layout.test.ts` 신설

- 고정 케이스: 구간이 [50, 5150]일 때 @150 → 마지막 위치가 5,150이고 5,250 같은 구간 밖 값이 없다 (경계 초과 회귀).
- 나누어떨어지는 케이스: 끝점 중복 없음.
- property 테스트(수동 루프로 충분): 여러 (clear, pitch) 조합에서 불변조건 3종을 전수 검사.
- 0·음수 pitch, 구간 성립 불가 → throw.
- startOffset은 룰 조회값을 넘기는 계약임을 테스트에서 드러내라 (호출부가 `lookupRule(pack, 'stirrup.start-offset', {})`로 얻는다).

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
   - `stirrup.start-offset`에 source·confidence·가정 명시 note가 있는가? (CRITICAL + R2)
   - 함수 안에 50 같은 관행 리터럴이 없는가? (startOffset은 인자 — 룰 조회는 호출부)
3. `phases/3-girder-domain/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 함수 시그니처·배치 규칙(대칭 구간·잔여 시 끝점 추가)·신설 룰 키를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **첫 위치를 0으로 암묵 가정하지 마라.** 이유: 근거 없는 가정은 반드시 룰팩 항목(inferred + note)으로 드러낸다. 숨은 가정은 이 제품의 신뢰 장치를 우회한다.
- **柱 帯筋 본수 계산을 이 방식으로 바꾸지 마라.** 이유: 柱는 기존 산식이 테스트로 고정돼 있고, 전환은 별도 결정이 필요하다. 이 step은 大梁 전용 유틸만 만든다.
- **사용자 입력 필드(첫 위치 오버라이드)를 Project에 추가하지 마라.** 이유: 스키마 변경(마이그레이션)을 끌고 온다. M3b 이후 과제다.
- 기존 테스트를 깨뜨리지 마라.
