# Step 3: column-fabrication-cover

M2의 마지막 칸이다. 柱 생성기가 加工用かぶり(最小かぶり + 加算)를 쓰도록 바꾸고, 근거 없는 10mm 길이 반올림(`rounding.length`)을 코드와 룰팩에서 함께 제거한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/M0-FINDINGS.md` — "DESIGN §10-4의 r10에 대하여" (반올림에는 근거가 없다)
- `/docs/ADR.md` — ADR-002, ADR-012
- `src/domain/rebar/column.ts` · `column.test.ts` — 현재 조회 룰과 산식, 테스트가 기대값을 lookupRule로 유도하는 방식
- `src/rulepack/jp-mlit/bend.yaml`(step 2 갱신본 — `rounding.length`가 아직 있다), `cover.yaml`(`cover.fabrication.addition` 신설됨)
- `src/domain/quantity/index.ts` — 길이 변화가 kg 집계로 전파되는 경로
- `src/lib/hooks/useTakeoff.ts` — 소비자

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. `src/domain/rebar/column.ts`

- **加工用かぶり 도입**: 배근 치수 계산에 쓰는 かぶり를 `cover.minimum + cover.fabrication.addition`으로 바꿔라. 두 룰을 각각 조회해 TS에서 더한다 — 합산 로직은 코드, 수치는 데이터다 (ADR-002).
- **반올림 제거**: `rounding.length` 조회·`roundLength()` 적용을 제거하고 계산된 mm 값을 그대로 둔다. 근거가 확보되면 그때 룰팩 항목으로 되살린다.
- `rules[]`와 `formula`를 실제 사용 룰에 맞게 갱신하라: `cover.fabrication.addition`이 들어가고 `rounding.length`·`切上げ` 문구가 사라진다. formula에 加工用かぶり가 「最小かぶり40 + 加算10 = 50」처럼 값으로 드러나야 한다 (값은 룰 조회 결과를 보간 — 리터럴 금지).

### 2. `src/rulepack/jp-mlit/bend.yaml`

- `rounding.length` 항목을 삭제하라. 이 시점에는 소비자가 없어야 한다 — `rg "rounding.length" src/`로 확인.

### 3. 테스트 갱신

- `column.test.ts`: `rounded()` 헬퍼 제거, 기대 길이를 반올림 없는 값으로. 加工用かぶり 조합(`cover.minimum` + `cover.fabrication.addition` 조회 유도)으로 帯筋 加工長 기대값을 다시 유도하라. `rules` 배열 기대값 갱신 (rounding 제거, fabrication 추가, 순서 고정).
- 길이에 의존하는 다른 테스트(`useTakeoff.test`, `quantity` 관련, 뷰어 테스트의 길이 문자열 등)가 있으면 같은 방식(룰 조회 유도)으로 갱신하라. **숫자를 하드코딩해 맞추지 마라.**
- `tests/golden/` 기존 픽스처(`markup.json`, `quantity.json`)는 할증률 검증용이다 — designKg가 합성 입력이면 영향이 없어야 한다. 깨지면 원인을 분석하고 픽스처가 아니라 코드 쪽을 의심하라.

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

추가로: `rg "rounding" src/ tests/` 결과에 rounding.length 참조가 남아 있지 않을 것.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `.ts`에 규준 리터럴(40, 10, 50 등)을 직접 쓰지 않았는가? (CRITICAL — 전부 룰 조회 보간이어야 한다)
   - 主筋 본수·피치를 재계산하는 코드가 생기지 않았는가? (ADR-012)
   - formula가 여전히 일본어이고 사용 룰이 전부 드러나는가?
3. `phases/2-m2-rulepack/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 加工用かぶり 적용 방식(두 룰 키)과 반올림 제거 사실, 갱신된 rules 순서를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **새 반올림·자리맞춤 로직을 만들지 마라.** 이유: 근거 문서가 없다. "보기 좋은 숫자"는 이 제품에서 거짓말이다.
- **加工用かぶり 합산값(예: 50)을 룰팩에 새 항목으로 넣지 마라.** 이유: 원문은 「最小 + 10」 구조다. 합산값을 데이터로 굳히면 最小かぶり 개정 시 이중 갱신이 필요해진다. 합산은 코드가 한다.
- **柱 외 부재(大梁) 생성기를 만들지 마라.** 이유: 다음 phase(3-girder-domain)의 스코프다.
- 기존 테스트를 깨뜨리지 마라.
