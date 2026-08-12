# Step 0: geometry-girder

뷰어 phase의 첫 칸이다. 뷰어의 순수 계산층(`geometry.ts`)을 大梁 대응으로 확장한다: Section별 전개 디스패치, role→layer 매핑, zone(경로거리) 기반 세그먼트 절단 배칭. three.js를 만지는 것은 다음 step부터다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — §7 (좌표계 mm·X=평면x·Y=높이·Z=평면y, 표시 반경 과장 `max(径,14)×1.6`, 표시 배치 규칙 — domain points는 불변)
- `src/components/viewer/geometry.ts` · `geometry.test.ts` — 현재 柱 전용 전개(`rebarPlacements`·`rebarSegments`·`rebarBatches`·hoop 인셋)
- `src/domain/model/rebar.ts` — `RebarZone`(경로거리), role 5종
- `src/domain/model/member.ts` — `Section` 판별 유니온
- `src/domain/rebar/stirrup-layout.ts` — `stirrupPositions` (뷰어 전개가 도메인과 같은 위치를 쓰게 하는 원천)
- `src/domain/rebar/girder.ts` — 생성기의 로컬 좌표계(x=스팬·y=밑면 기준·z=폭)와 points 구조

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/components/viewer/geometry.ts` 확장

- `rebarPlacements(rebar, section)` / `rebarSegments(rebar, section)`를 `Section` 판별 유니온으로 디스패치하라:
  - 柱: 기존 로직 그대로 (둘레 전개, hoop 피치 전개).
  - 大梁 上端筋·下端筋: 帯筋 안쪽 폭(z 방향)에서 count본 **등간격 1열** (둘레 전개 아님).
  - 大梁 あばら筋: `stirrupPositions()`를 재사용해 x축 위치 전개 — **도메인과 다른 위치 산식을 새로 쓰지 마라** (본수·위치 불일치가 즉시 버그다).
- hoop 인셋(`hoopDisplayPoints` 상당)은 **kind 명시 분기**로: 柱는 X–Z 평면, 大梁은 Y–Z 평면. "변하는 축 자동 감지" 같은 추론 로직 금지.
- role→layer 매핑을 단일 헬퍼로:

```ts
export type RebarLayer = 'main' | 'hoop'
export function roleToLayer(role: RebarRole): RebarLayer
// main ⊇ { 主筋, 上端筋, 下端筋 } / hoop ⊇ { 帯筋, あばら筋 }
```

- 배칭 구조 확장 — zone 분리:

```ts
export interface RebarBatch {
  rowId: string
  layer: RebarLayer
  zone: '定着' | '重ね継手' | null
  segments: Segment[]
}
export function rebarBatches(entries: { rowId: string; rebar: Rebar }[], section: Section): RebarBatch[]
```

- `zones`가 있는 철근은 폴리라인을 **누적 경로거리**로 잘라 코어 배치와 zone 배치로 분리한다. 절곡점과 zone 경계가 겹치는 케이스(꺾인 점이 정확히 경계)를 처리하라.
- 이 배칭 구조는 이후 step 3(레이어 토글)·step 6(범례)이 그대로 소비한다 — 여기서 한 번에 만들어 재작업을 막는다.

### 2. 테스트 — `geometry.test.ts` 확장

- 大梁 上下端 placements: 본수·z 등간격·y 위치(도메인 points 기준).
- あばら筋 placements가 `stirrupPositions` 결과와 일치 (본수·좌표 전수 비교).
- `roleToLayer` 전 role 매핑.
- zone 절단: 직선 철근(양단 zone 2개 → 배치 3개), 折曲げ 철근(경계가 절곡점을 넘는 케이스), zones 없는 철근(배치 1개·zone null).
- 기존 柱 케이스 회귀 유지.

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
   - `geometry.ts`가 여전히 three.js 비의존 순수 함수인가? (테스트 가능성의 근거)
   - domain points를 변형하지 않았는가? (표시 과장은 반경·배치 표현에만)
3. `phases/4-girder-viewer/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 `RebarBatch` 스키마·`roleToLayer`·zone 절단 방식을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **あばら筋 위치를 뷰어에서 독자 계산하지 마라.** 이유: 도메인 `stirrupPositions`가 유일한 원천이다. 두 벌이 생기면 내역서 본수와 3D 본수가 어긋난다.
- **Viewer3D.tsx를 수정하지 마라.** 이유: step 1의 스코프다.
- **zone을 3D 거리로 재정의하지 마라.** 이유: 도메인이 경로거리로 준다. 좌표 변환은 절단 후 세그먼트에만 적용한다.
- 기존 테스트를 깨뜨리지 마라.
