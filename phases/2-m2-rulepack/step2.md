# Step 2: rulepack-bend-cover

折曲げ·かぶり 룰팩을 원문 픽스처로 정식화하고, 加工用かぶり(5.3.5(2))를 별도 키로 신설한다. 単位質量은 JIS 미확보 상태를 정직하게 기록한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/M0-FINDINGS.md` — §1(表5.3.1 余長은 이미지, 5.3.5(2) 원문), "DESIGN §10-4의 r10에 대하여" 절 (加工用かぶり와 길이 반올림은 다른 것)
- `/docs/SOURCES.md` — "아직 확보하지 못한 것" (JIS G 3112)
- `tests/golden/fixtures/spec-r7-ch5.json` — step 0 산출물
- `src/rulepack/jp-mlit/bend.yaml`, `cover.yaml`, `unit-mass.yaml`
- step 1이 재작성한 `anchorage.yaml`의 항목 형식 (source·note 서식을 맞출 것)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. `bend.yaml` 갱신

- `bend.inside-diameter` — 表5.3.1의 折曲げ内法直径을 픽스처대로 전 조합 등재 (강종·경 구간은 step 1과 같은 이산 전개 방식, `source.section: 表5.3.1`).
- `bend.hook180` / `bend.hook135` / `bend.hook90` / `bend.hook-tome`(幅止め筋) — フック余長. **이 4개는 이미지 판독값이다** (픽스처 `imageRead: true`). note에 `表5.3.1 折曲げ図（画像）判読 — 独立検討待ち`를 명시하고 `confidence: inferred` 유지.
- **`rounding.length` 항목은 이 step에서 삭제하지 마라.** `column.ts`가 아직 조회한다 — step 3이 사용 중단과 삭제를 함께 처리한다.

### 2. `cover.yaml` 갱신 + `cover.fabrication.addition` 신설

- `cover.minimum` — 表5.3.6에서 柱·梁에 해당하는 셀을 픽스처대로 등재 (`memberKind: 柱` / `memberKind: 大梁` 조건 유지, 값·쪽은 픽스처를 따름).
- 신설:

```yaml
- key: cover.fabrication.addition
  label: 加工用かぶり厚さの加算
  expr: 最小かぶり厚さ + 10mm
  conditions: {}
  value: 10
  unit: mm
  source: { ref: spec, section: 5.3.5(2), page: 33 }
  confidence: inferred
  note: LLM転写 — 独立検討待ち。「柱、梁等の鉄筋の加工に用いるかぶり厚さは、最小かぶり厚さに10mmを加えた数値を標準とする」
```

**加工用かぶり는 「最小かぶり + 10mm」이지 「길이 10mm 단위 올림」이 아니다** — 프로토타입의 r10은 근거 없는 오독이었다 (M0-FINDINGS). 두 개념을 섞지 마라.

### 3. `unit-mass.yaml` note 정리

- 값·항목 수는 유지한다 (JIS 정본 미확보 — 삭제하면 kg 파이프라인이 통째로 죽는다).
- 각 항목 note를 `JIS G 3112 未確保 — JISC閲覧で版特定・転写するまで inferred。kg算出はM2の正式完了に含めない`로 통일하라.

### 4. 골든테스트 확장 — `tests/golden/spec-tables.test.ts`

- 表5.3.1 내법직경·余長, 表5.3.6 かぶり, `cover.fabrication.addition`의 픽스처 대조 케이스를 추가하라 (step 1과 같은 방식 — 기대값은 픽스처에서 직접).
- 이미지 판독 항목은 픽스처의 `imageRead: true`와 룰팩 note의 `画像` 표기가 함께 있는지도 검증하라.

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
   - 신규 항목 전부에 `source`·`confidence`가 있는가? (CRITICAL)
   - `stated` 승격이 없는가? (R6)
   - `rounding.length`가 아직 남아 있고 기존 테스트가 전부 통과하는가?
3. `phases/2-m2-rulepack/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 신설 키(`cover.fabrication.addition` 포함)와 이미지 판독 항목 수를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **`rounding.length`를 삭제하거나 `column.ts`를 수정하지 마라.** 이유: step 3의 스코프다. 여기서 지우면 이 step의 AC가 깨진다.
- **JIS 단위질량 값을 "확보된 것처럼" note를 바꾸지 마라.** 이유: 정본 미확보는 M2의 공식 상태다 (SOURCES.md). 숨기면 워터마크 장치가 거짓말을 하게 된다.
- **새 YAML 파일을 만들지 마라.** 이유: 기존 파일 갱신으로 충분하다. 새 파일을 만들면 `src/rulepack/index.ts` 등록 누락으로 조용히 무시된다.
- 기존 테스트를 깨뜨리지 마라.
