# Step 2: rulepack

규준 수치를 담는 YAML 룰팩과 그 로더·조회 함수를 만든다. **이 프로젝트에서 가장 중요한 경계다** — 이후 어떤 `.ts` 파일에도 규준 숫자 리터럴이 나타나면 안 되고, 전부 여기를 통해 조회된다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — §패턴의 「룰 로직은 코드, 룰 수치는 데이터」와 룰팩 항목 YAML 예시
- `/docs/ADR.md` — ADR-002(룰 로직/수치 분리), ADR-003(근거 문서 고정), ADR-014(할증률은 부재 구분 인자·범위 밖 실패), ADR-015(inferred는 차단이 아니라 경고)
- `/docs/SOURCES.md` — 정본 목록과 **수량적산기준에서 직접 확인한 값**(6·13·14·20쪽). 이 step의 골든테스트 근거다
- `/docs/DESIGN.md` — §6(출처 표시 UI가 요구하는 필드 집합), §10-1·10-3·10-4(프로토타입이 어긴 것들)
- step 0의 `vitest.config.ts`, `next.config.*`, `src/types/yaml.d.ts` — YAML을 raw 문자열로 읽는 배선
- step 1의 `src/domain/model/` 전체 — `BarSize`, `SteelGrade`, `MemberClass` 타입을 재사용한다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** 테스트를 먼저 쓰고 구현하라.

### 1. 출처 사전 — `src/rulepack/jp-mlit/sources.yaml`

DESIGN §6의 툴팁이 `doc`·`ed`·`sec`·`page`·`url`을 전부 쓴다. 하나라도 비면 고지 의무를 못 채운다. 문서 단위 메타데이터를 여기 모으고, 개별 룰 항목은 `ref`로 가리킨다.

```yaml
spec:
  short: 標準仕様書
  doc: 公共建築工事標準仕様書（建築工事編）
  edition: 令和7年版（最終改定 令和7年5月12日）
  publisher: 国土交通省 大臣官房官庁営繕部
  url: https://www.mlit.go.jp/gobuild/content/001888816.pdf
quantity:
  short: 数量積算基準
  doc: 公共建築数量積算基準
  edition: 令和5年3月29日改定（国営積第8号）
  publisher: 国土交通省 大臣官房官庁営繕部
  url: https://www.mlit.go.jp/common/001178206.pdf
jis:
  short: JIS G 3112
  doc: 鉄筋コンクリート用棒鋼
  edition: null            # 미확보 — docs/SOURCES.md §아직 확보하지 못한 것
  publisher: 日本産業標準調査会
  url: null
```

`/docs/SOURCES.md`의 정본 목록에 없는 문서를 추가하지 마라. 특히 `建築工事標準詳細図`(`001157902.pdf`)는 **근거 목록에서 제외된 문서다**(ADR-003). 어떤 항목의 근거로도 쓰지 마라.

### 2. 룰 항목 YAML

`src/rulepack/jp-mlit/` 아래 6개 파일로 나눈다: `cover.yaml`(かぶり厚さ), `anchorage.yaml`(定着長さ), `lap.yaml`(重ね継手長さ), `bend.yaml`(折曲げ 내법직경·フック余長), `markup.yaml`(할증률), `unit-mass.yaml`(단위질량).

항목 형태는 `/docs/ARCHITECTURE.md`의 예시를 따르되 DESIGN §6이 요구하는 표시 필드를 포함한다:

```yaml
- key: lap.L1
  label: 重ね継手長さ L1（フックなし）
  expr: 40d
  conditions: { fc: 24, grade: SD345, hook: false }
  value: 40
  unit: d
  source: { ref: spec, section: null, page: null }
  confidence: inferred
  note: M1 プレースホルダ — 原文抽出前の仮値であり、規準の転記ではない
```

**`markup.yaml`의 躯体 항목 하나만 `confidence: stated`다.** `/docs/SOURCES.md`가 20쪽 원문(「鉄筋について、その所要数量を求めるときは、その設計数量の４％の割増を標準とする」)을 이미 대조했다. 나머지 **전 항목은 `confidence: inferred`** 이고 `note`에 M1 플레이스홀더임을 적는다. 원문 추출은 M2의 일이다.

`markup.yaml`에는 **躯体 4%만 넣는다.** 山留め壁 3%(13쪽)·杭 3%(14쪽)는 원문에 있지만 MVP 지원 범위 밖이므로 항목으로 만들지 마라 — 조회가 실패해야 한다(ADR-014).

`unit-mass.yaml`은 `D10`~`D32`의 `kg/m`을 담는다. `unit: kg/m`, `source.ref: jis`, `confidence: inferred`, `note`에 JIS G 3112 미확보 사실을 적는다.

`bend.yaml`에는 DESIGN §4.1의 산출식 예시가 쓰는 `135°フック余長`이 필요하다. 帯筋에 쓰이는 값이다.

`cover.yaml`은 柱·大梁 각각의 かぶり厚さ를 담는다. `conditions`로 부재를 구분한다.

**추가로 `rounding.yaml`을 만들지 말고, 加工長 반올림 규칙을 `bend.yaml`이나 별도 항목이 아닌 곳에 숫자로 쓰지도 마라.** DESIGN §10-4가 지적한 프로토타입의 `r10`(10mm 올림)은 근거 문서가 없다. 반올림이 필요하면 `key: rounding.length` 항목을 만들고 `confidence: inferred`, `note: 出典未確認 — 根拠文書を特定できていない`로 명시하라. 근거 없는 규칙을 코드에 숨기는 것이 이 프로젝트가 막으려는 실패 방식이다.

### 3. 로더 — `src/domain/rules/`

```ts
interface ResolvedSource { short: string; doc: string; edition: string | null; publisher: string; url: string | null; section: string | null; page: number | null }
interface RuleEntry { key: string; label: string; expr: string; conditions: Record<string, string | number | boolean>; value: number; unit: string; source: ResolvedSource; confidence: 'stated' | 'inferred'; note: string }
interface RulePack { id: string; entries: RuleEntry[] }

function parseRulePack(files: Record<string, string>): RulePack   // 키는 파일명, 값은 YAML 원문
```

`parseRulePack`은 **순수 함수**다. 파일 시스템을 만지지 마라 — Node와 브라우저 양쪽에서 같은 코드가 돌아야 한다.

검증 규칙. 하나라도 어기면 **throw** 하고, 메시지에 어느 파일·어느 key인지 담아라:

1. 모든 항목에 `key`·`label`·`value`·`unit`·`source`·`confidence`가 있어야 한다 (CRITICAL: 근거 없는 값은 넣지 않는다)
2. `confidence`는 `'stated'` 또는 `'inferred'` 뿐이다. `'verified'` 같은 다른 어휘는 거부한다 (DESIGN §10-3)
3. **`source.page`가 `null`인데 `confidence: 'stated'`면 거부한다** (ARCHITECTURE.md: 「page가 null이면 stated일 수 없다」)
4. `source.ref`가 `sources.yaml`에 없으면 거부한다
5. 같은 `key` + 같은 `conditions` 조합이 중복되면 거부한다

### 4. 조회 함수 — `src/domain/rules/`

```ts
interface RuleHit extends RuleEntry {}

function lookupRule(pack: RulePack, key: string, conditions: Record<string, unknown>): RuleHit
function lookupMarkup(pack: RulePack, memberClass: MemberClass | string): RuleHit
function lookupUnitMass(pack: RulePack, size: BarSize): RuleHit
```

매칭 규칙은 **평범한 TS 함수**로 쓴다. 룰 DSL이나 조건식 평가기를 만들지 마라(ADR-002).

- 항목의 `conditions`가 질의 조건의 부분집합이면 후보다
- 후보가 여럿이면 `conditions` 개수가 가장 많은(가장 구체적인) 것을 고른다
- 최다 조건 개수가 동점이면 **모호하므로 throw** 한다. 임의로 하나를 고르지 마라
- 후보가 없으면 throw 한다. 기본값을 반환하지 마라

`lookupMarkup`은 지원 범위 밖 부재 구분에 **반드시 실패해야 한다**(ADR-014). `'躯体'` 외의 값(`'山留め壁'`, `'杭'`, 빈 문자열, 미지의 문자열)에 4%를 돌려주면 안 된다.

### 5. YAML 파일 로딩 — `src/rulepack/index.ts`

각 `.yaml`을 raw 문자열로 import해 `Record<string, string>`으로 모아 `parseRulePack`에 넘기는 얇은 층이다. **Node(vitest)와 브라우저(next build) 양쪽에서 같은 import 문이 동작해야 한다** — step 0이 깔아둔 배선을 쓴다.

### 6. 골든테스트 — `tests/golden/`

`/AGENTS.md`: 규준 관련 기능은 **골든테스트 먼저**. 픽스처에 출처 쪽·표를 함께 적어라 — 사후 대조의 유일한 단서다.

`tests/golden/fixtures/markup.json` (또는 동등한 형식)에 아래를 적는다:

- 출처: `公共建築数量積算基準 令和5年3月29日改定`, 20쪽, 원문 「鉄筋について、その所要数量を求めるときは、その設計数量の４％の割増を標準とする」
- 범위 밖 근거: 13쪽 山留め壁 3%, 14쪽 杭 3% — **MVP 미지원이므로 조회가 실패해야 함**
- 반올림 정책: 이 항목은 비율이므로 반올림 없음

테스트 케이스:

- `lookupMarkup(pack, '躯体').value === 0.04` (또는 `4` + `unit: '%'` — 어느 쪽이든 픽스처와 일치)
- `lookupMarkup(pack, '山留め壁')` → throw
- `lookupMarkup(pack, '杭')` → throw
- `lookupMarkup(pack, '')` → throw
- 躯体 항목의 `confidence === 'stated'` 이고 `source.page === 20`

**`npm run test:golden`이 이 테스트를 잡아야 한다.**

### 7. 로더 유닛 테스트

골든테스트와 별개로 검증 규칙 5개가 각각 throw하는지 확인하는 테스트를 둔다. 특히 **`page: null` + `stated` 조합이 거부되는지**를 반드시 테스트하라.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
npm run test:golden
```

`npm run build`가 AC에 포함된 이유는 **브라우저 번들에서도 YAML이 문자열로 읽히는지**를 이 step에서 확인해야 하기 때문이다. Node에서만 되고 번들에서 깨지면 step 5 이후에 발견되어 되돌리기 비싸다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/domain/rules/`가 파일 시스템·React·DOM을 만지지 않는가? (CRITICAL)
   - 모든 룰 항목에 `source`와 `confidence`가 있는가? (CRITICAL)
   - `markup.yaml`의 躯体 외 항목이 없는가? (ADR-014)
   - 룰 DSL·조건식 평가기를 만들지 않았는가? (ADR-002)
   - `.ts` 파일에 규준 숫자 리터럴이 없는가? — 테스트 픽스처의 기대값은 예외다
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: 룰 key 목록, 조회 함수 시그니처, `RuleHit` 필드)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`confidence: 'verified'`를 쓰지 마라.** 이유: 이 프로젝트의 어휘는 `stated`/`inferred` 둘뿐이다. 프로토타입이 이 오류를 범했다 (DESIGN §10-3).
- **M1 플레이스홀더 값에 `stated`를 붙이지 마라.** 이유: 원문 대조를 하지 않은 값이다. `stated`는 쪽을 특정한 값에만 붙는다 (ADR-015). 예외는 이미 대조된 markup 躯体 항목 하나뿐이다.
- **`lookupMarkup`에 기본값을 두지 마라.** 이유: 지원 범위를 넓힌 순간 조용히 틀린 값이 나간다. 이것이 정확히 ADR 철학이 막으려는 실패 방식이다 (ADR-014).
- **`建築工事標準詳細図`(`001157902.pdf`)를 근거로 쓰지 마라.** 이유: 3쪽짜리 표지뿐이고 판이 R4로 어긋나 근거 목록에서 제외됐다 (ADR-003, SOURCES.md).
- **룰 DSL·수식 문자열 평가기를 만들지 마라.** 이유: ADR-002. `expr` 필드는 UI 표시용 문자열이지 실행 대상이 아니다.
- **`expr` 문자열을 파싱해 계산에 쓰지 마라.** 이유: 표시값과 계산값이 갈리는 구조가 된다 (DESIGN §10-1). 계산은 `value`만 쓴다.
- 기존 테스트를 깨뜨리지 마라.
