# Step 1: rulepack-anchorage-lap

step 0이 만든 원문 픽스처(`tests/golden/fixtures/spec-r7-ch5.json`)를 근거로 定着·重ね継手 룰팩을 정식화한다. M1 플레이스홀더(단일 조합 35d/40d)를 표 전 조합으로 교체하고, 골든테스트로 픽스처와 대조한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 레이어 규칙 2(룰 로직은 코드, 룰 수치는 데이터)
- `/docs/ADR.md` — ADR-002, ADR-010(골든테스트 범위), ADR-014(fail-fast), ADR-015(inferred 경고)
- `tests/golden/fixtures/spec-r7-ch5.json` — step 0의 산출물 (이 step의 유일한 값 원천)
- `src/rulepack/jp-mlit/anchorage.yaml`, `lap.yaml`, `sources.yaml` — 현재 M1 플레이스홀더
- `src/domain/rules/loader.ts`, `lookup.ts`, `types.ts` — 로더 제약(중복 키 에러, stated는 page 필수)과 부분집합 매칭·최다특이성 선택 로직
- `src/domain/rebar/column.ts` — 기존 소비자의 조회 조건 (`{fc, grade, hook:false}`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. `src/rulepack/jp-mlit/anchorage.yaml` · `lap.yaml` 재작성

픽스처의 모든 셀을 룰팩 항목으로 등재하라. 키 체계:

- `lap.L1` (hook:false) / `lap.L1h` (hook:true) — 表5.3.2
- `anchorage.L1` / `anchorage.L2` / `anchorage.L1h` / `anchorage.L2h` — 表5.3.4
- `anchorage.La` — 表5.3.5 (投影定着長さ)

조건 스키마 — **Fc 구간은 이산값으로 전개한다**:

```yaml
- key: anchorage.L2
  label: 定着長さ L2（フックなし）
  expr: 35d
  conditions: { fc: 24, grade: SD345, hook: false }
  value: 35
  unit: d
  source: { ref: spec, section: 表5.3.4, page: 30 }   # page = 인쇄 쪽
  confidence: inferred
  note: LLM転写 — 独立検討待ち（表5.3.4 Fc24-27帯）
```

- `lookupRule`은 조건을 `===` 등호로만 비교한다. 표의 Fc 구간(예: 24-27)은 구간에 속하는 이산 Fc값(24, 27)마다 항목을 복제해 데이터로 전개하라. **구간 경계를 TS 코드에 쓰면 규준 리터럴 금지 위반이다.** 지원 Fc 목록은 픽스처의 `fcBand` 라벨에 나온 값들이며, 라벨에 없는 Fc(예: 25)는 조회 실패(fail-fast)로 남긴다 — ADR-014와 같은 태도다.
- `source.section`은 표 번호, `source.page`는 **인쇄 쪽**(픽스처의 `printedPage`).
- `confidence`는 전부 **`inferred`**로 두고 note에 `LLM転写 — 独立検討待ち`를 명시하라. **`stated`로 승격하지 마라** — 추출자와 승인자가 같으므로 독립 검토가 아니다 (ADR-015, R6). 승격은 사람의 원문 대조 후에만 한다.
- 기존 소비자 호환: `column.ts`의 `{fc: 24, grade: SD345, hook: false}` 조회가 새 항목에 그대로 매칭되어야 한다.

### 2. 골든테스트 — `tests/golden/spec-tables.test.ts`

픽스처의 각 entry에 대해 룰팩 조회 결과를 대조하라:

- `lookupRule(pack, entry.kind, 전개된 conditions)`의 `value`·`unit`이 픽스처와 일치
- `source.section`·`source.page`가 픽스처의 표·인쇄 쪽과 일치
- 픽스처에 없는 조합(예: fc 25)은 조회가 throw하는지 1케이스 확인

**기대값을 `lookupRule()`로 만들지 마라 — 픽스처 JSON에서 직접 읽어라.** 골든의 존재 이유는 룰팩이 나중에 잘못 편집됐을 때 잡는 것이다.

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
   - `.ts` 파일에 규준 숫자 리터럴이 없는가? (CRITICAL, ADR-002)
   - 모든 신규 항목에 `source`(section·page 포함)와 `confidence`가 있는가? (CRITICAL)
   - `confidence: stated`로 승격한 항목이 없는가? (ADR-015, R6)
   - 기존 `column.test.ts`가 그대로 통과하는가?
3. `phases/2-m2-rulepack/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 등재한 키 목록과 항목 수, Fc 전개 방식을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 픽스처 결손으로 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **픽스처에 없는 값을 룰팩에 넣지 마라.** 이유: 값의 유일한 원천은 step 0의 원문 전사다. 기억으로 채우면 이 제품의 신뢰 장치가 무너진다.
- **`confidence: stated`를 쓰지 마라.** 이유: LLM 전사는 독립 검토가 아니다 (R6). 로더가 stated에 page를 강제하는 것과 별개의 문제다.
- **`lookupRule`의 매칭 로직을 수정하지 마라.** 이유: Fc 구간은 데이터 전개로 해결한다. 룰 DSL·평가기 금지 (ADR-002).
- **`unit-mass.yaml`·`bend.yaml`·`cover.yaml`을 건드리지 마라.** 이유: step 2의 스코프다.
- 기존 테스트를 깨뜨리지 마라.
