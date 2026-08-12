# Step 0: girder-span

M3a(단일 스팬 大梁)의 첫 칸이다. 大梁의 지점(支点) 기하 — 内法長さ와 양단 柱 치수 — 를 계산하는 순수 함수를 만든다. 배근 계산은 이후 step이 한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 레이어 규칙 1 (`src/domain/`은 순수 TS)
- `src/domain/model/project.ts` — `Grid`·`gridPoint()`·`touchesColumn()`·`beamDepthAbove()`(fail-fast 선례)·`memberGroupKey()`
- `src/domain/model/member.ts` — `GirderPosition { axis, ix, iy }`, `ColumnSection { b, d }`
- `src/domain/model/project.test.ts` — 기존 테스트 패턴
- `src/domain/model/sample-project.ts` — 그리드·부재 배치 (이 step에서는 수정 금지)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/model/project.ts`에 추가

```ts
export interface GirderSpan {
  axis: 'X' | 'Y'
  /** 그리드 교점 간 중심 스팬 (mm) */
  centerSpan: number
  /** 内法長さ (mm) — 양단 柱面 사이 */
  clear: number
  /** 시작 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  startFaceOffsetMm: number
  /** 끝 柱 중심 → 大梁 내측 柱面 오프셋 (mm) */
  endFaceOffsetMm: number
  /** 정착 수용성 검사용 — 시작 柱의 축방향 전체 치수 (mm) */
  startSupportLengthAlongAxisMm: number
  /** 정착 수용성 검사용 — 끝 柱의 축방향 전체 치수 (mm) */
  endSupportLengthAlongAxisMm: number
}

export function girderSpan(project: Project, member: Member): GirderSpan
```

동작 규칙:
- X축 大梁이면 柱 단면의 `b`, Y축이면 `d`를 축방향 치수로 쓴다. `startFaceOffsetMm = 시작 柱 b(또는 d)/2`, `clear = centerSpan − startFaceOffset − endFaceOffset`.
- 양단 그리드 교점에 **같은 story의 柱가 없으면 throw**한다 (`beamDepthAbove`의 fail-fast 선례를 따르는 데이터 오류). 잘못된 kind(柱를 넘김), 비양수 clear도 throw.
- **연속 스팬 여부는 여기서 판정하지 않는다** — 그것은 step 5의 지원 판정(`girderSupport`) 소관이다. 이 함수는 단일 부재의 기하만 본다.

### 2. 테스트 — `src/domain/model/project.test.ts`에 추가

- X축 정상: 6000 스팬, 양단 800×800 柱 → clear 5200, offset 400/400
- Y축 정상 (비정방 柱로 b/d 구분 검증 — 예: 700×900 柱)
- 양단 柱 치수가 다른 케이스
- 단부 柱 결손 → throw
- 柱 member를 넘기면 → throw
- 内法이 0 이하가 되는 이상 입력 → throw

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
   - `src/domain/`에 React·three.js import가 없는가? (CRITICAL)
   - 규준 수치 리터럴이 없는가? — 이 함수는 순수 기하라 룰 조회가 없어야 정상이다
3. `phases/3-girder-domain/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 `GirderSpan` 필드 목록과 throw 조건을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **연속 스팬 검출·미지원 판정을 이 함수에 넣지 마라.** 이유: step 5의 스코프다. 기하와 지원 정책을 섞으면 재사용이 죽는다.
- **sample-project.ts를 수정하지 마라.** 이유: step 5의 스코프다.
- **룰팩 조회를 넣지 마라.** 이유: 이 함수는 형상 입력만 다룬다. 배근 상세값은 생성기(step 4)가 조회한다.
- 기존 테스트를 깨뜨리지 마라.
