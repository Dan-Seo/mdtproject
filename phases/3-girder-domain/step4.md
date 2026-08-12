# Step 4: girder-generator

앞 step들의 부품(girderSpan·resolveGirderEnd·stirrupPositions·RebarZone)을 조립해 大梁 배근 생성기를 만든다. 산출은 `[上端筋, 下端筋, あばら筋]` 3행 — column.ts의 「대표 1본 + 本数」 모델을 그대로 따른다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — ADR-002, ADR-008, ADR-012
- `src/domain/rebar/column.ts` · `column.test.ts` — 생성기 구조·formula 서식·rules 추적·테스트 패턴의 원본
- `src/domain/model/project.ts` — step 0의 `girderSpan`
- `src/domain/rebar/girder-ends.ts` — step 2의 `resolveGirderEnd`
- `src/domain/rebar/stirrup-layout.ts` — step 3의 `stirrupPositions`
- `src/domain/model/rebar.ts` — step 1의 `RebarZone`(경로거리), role 3종
- `src/domain/model/member.ts` — `GirderSection { b, depth, main: { size, topCount, bottomCount }, stirrup }`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/rebar/girder.ts` 신설

```ts
export interface GirderRebarInput {
  member: Member
  section: GirderSection
  span: GirderSpan
}

export function generateGirderRebar(input: GirderRebarInput, pack: RulePack): Rebar[]
// 반환: [上端筋, 下端筋, あばら筋]
```

계산 규칙 (부재 로컬 좌표: x=스팬 방향·좌측 柱面 원점, y=梁 밑면 기준, z=폭):

- **上端筋** (`role: '上端筋'`, `count: main.topCount` 입력 그대로 — ADR-012):
  - 양단 각각 `resolveGirderEnd(...)` (bendDirection `'下'`).
  - `加工長 = clear + 시작단.lengthMm + 끝단.lengthMm` — 반올림 없음 (M2에서 제거됨).
  - `points`: 直線 단부는 x축 직선 연장. 折曲げ 단부는 柱面 안쪽으로 투영 길이만큼 간 뒤 절곡 방향(y)으로 꺾이는 폴리라인 — L2h 전장과 투영·수직 구간의 합이 정합해야 한다.
  - `zones`: 양단 定着 구간을 **경로거리**로 기록 (`[0, 시작단 길이]`, `[加工長 − 끝단 길이, 加工長]`).
  - y 위치는 `depth − 加工用かぶり` (加工用かぶり = cover.minimum{大梁} + fabrication 가산).
- **下端筋**: 동일하되 `role: '下端筋'`, `count: bottomCount`, y = 加工用かぶり, bendDirection `'上'`.
- **あばら筋** (`role: 'あばら筋'`, `shape: 'hoop'`, `closed: true`):
  - `加工長 = 2×{(b − 2×加工用かぶり) + (depth − 2×加工用かぶり)} + 2×hook135余長` — 반올림 없음.
  - `count = stirrupPositions(clear, stirrup.pitch, startOffset).positionsMm.length` (startOffset은 `stirrup.start-offset` 조회).
  - points는 Y–Z 평면 사각 후프 (x=0 대표 1본).
- `rules[]`는 실제 조회한 룰만 순서대로. `formula`는 일본어로 값·룰 명칭을 전개하되 **양단 정착이 각각 어느 방식(直線/折曲げ)인지 드러낼 것** — R7 ② (접합부 이중 계상)의 가시화 장치다.

### 2. 테스트 — `src/domain/rebar/girder.test.ts` 신설

column.test.ts 패턴(기대값 lookupRule 유도, 실 룰팩, 모킹 없음)으로:

- 3행 생성: role·shape·count가 입력 그대로 (topCount 4 / bottomCount 4 / positions 길이)
- 上端筋 加工長 = clear + 양단 lengthMm (양단이 折曲げ인 케이스 — 샘플 G1 D25·800柱는 折曲げ가 정답)
- 지점이 큰 가상 케이스에서 直線 정착 加工長
- zones 경로거리 2건과 불변조건 (`0 <= from < to <= 加工長`)
- あばら筋 count가 위치 배열 길이와 일치, 부재 밖 위치 없음
- 主筋 본수를 재계산하지 않는다는 회귀 (ADR-012)
- rules 실재성(`pack.entries` 키 집합 대조)과 순서 고정
- formula에 양단 정착 방식·加工用かぶり 값이 드러나는지

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
   - 규준 리터럴 없음 (전부 룰 조회)
   - `src/domain/` 순수성 유지
   - 도메인 points는 mm 실좌표 — 표시 과장(×1.6 등)은 뷰어 소관이므로 여기 넣지 않는다
3. `phases/3-girder-domain/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 시그니처·3행 구성·조회 룰 키 목록·로컬 좌표계 정의를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **길이를 10mm 단위로 올림하지 마라.** 이유: 근거 없음이 M0에서 판정됐고 M2가 제거했다.
- **カットオフ·継手位置·連続 스팬 보정을 넣지 마라.** 이유: M3b 스코프. 이 생성기는 단일 스팬 전용이다.
- **useTakeoff를 수정하지 마라.** 이유: step 5의 스코프다. 이 step은 도메인 생성기까지만.
- 기존 테스트를 깨뜨리지 마라.
