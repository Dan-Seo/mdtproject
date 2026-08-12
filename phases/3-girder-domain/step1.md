# Step 1: rebar-zones-roles

Rebar 모델을 확장한다: 大梁용 역할 3종과, 定着·重ね継手 구간을 표현하는 `RebarZone`(경로거리 기반). 柱 생성기가 zones를 방출하게 한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — ADR-008(일본어 원어)
- `src/domain/model/rebar.ts` — 현재 `RebarRole = '主筋' | '帯筋'`, `RebarShape`
- `src/domain/rebar/column.ts` · `column.test.ts` — 主筋의 하단 연장(継手 L1 또는 定着 L2)·상단 연장(定着 L2 또는 0) 계산부
- `src/domain/quantity/index.ts` — `quantityLineId = groupId|role|length|count` (역할 분리가 필요한 이유)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/model/rebar.ts`

```ts
export type RebarRole = '主筋' | '帯筋' | '上端筋' | '下端筋' | 'あばら筋'

export interface RebarZone {
  kind: '定着' | '重ね継手'
  /** 철근 polyline 시작점부터의 누적 경로거리 (mm) */
  pathFromMm: number
  pathToMm: number
}

export interface Rebar {
  // 기존 필드 유지
  zones?: RebarZone[]
}
```

- zone 좌표는 **3D 좌표가 아니라 polyline 누적 경로거리**다. 절곡 정착(폴리라인이 꺾임)에서도 구간 정의가 살아남게 하기 위해서다.
- `0 <= pathFromMm < pathToMm <= 加工長` 불변조건.

설계 근거(왜 역할 3종인가): 물량 행 키가 `groupId|role|length|count`라서 上端筋·下端筋을 둘 다 `主筋`으로 넣으면 동일 길이·본수일 때 행이 충돌해 한쪽이 증발한다. 역할 분리가 키 체계를 건드리지 않는 유일한 해법이고, 上端筋·下端筋·あばら筋은 일본 배근표의 표준 행 명칭이다 (ADR-008).

### 2. `src/domain/rebar/column.ts` — 主筋 zones 방출

- 하단 연장이 継手면 `{ kind: '重ね継手', pathFromMm: 0, pathToMm: lap길이 }`, 定着이면 kind만 `定着`.
- 상단 연장이 定着이면 `{ kind: '定着', pathFromMm: 加工長 − anchorage길이, pathToMm: 加工長 }`.
- `ends`가 `'なし'`인 단부는 zone을 만들지 않는다. 기존 산식·rules·formula는 불변.

### 3. 테스트

- `RebarRole` 확장 후 `npm run typecheck`로 기존 role 분기(switch·비교)의 파급 지점을 전수 확인하고 수정하라 — strict mode가 잡는다.
- `column.test.ts`: ends 조합별 zones 기대값(경로거리, 룰 조회로 유도), zones 불변조건, `ends: 'なし'`에서 zone 부재.

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
   - `Rebar`가 여전히 순수 JSON 직렬화 가능한가? (클래스·함수·Date 금지)
   - `zones`를 선택 필드로 뒀는가? (기존 픽스처·저장 프로젝트 호환)
3. `phases/3-girder-domain/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 추가된 role 3종·RebarZone 스키마(경로거리 기반임을 명시)·column zones 방출 규칙을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **zone을 3D 좌표(from/to 점)로 정의하지 마라.** 이유: 折曲げ定着(꺾인 폴리라인)에서 직선 구간 표현이 깨진다. 경로거리는 형상과 무관하게 성립한다.
- **quantityLineId 생성식을 바꾸지 마라.** 이유: 기존 행 id·notes 키가 전부 무효화된다. 역할 분리로 충돌은 이미 해소된다.
- **大梁 생성기를 만들지 마라.** 이유: step 4의 스코프다.
- 기존 테스트를 깨뜨리지 마라.
