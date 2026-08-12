# Step 0: girder-run

M3b의 첫 칸이다. 「스팬 하나 = 부재 하나」 모델을 **런(run)** 모델로 일반화한다.
런은 같은 층·같은 축·같은 通り芯 위에 인접해 늘어선 大梁 부재의 **최대 연쇄**다.

지금 연속 스팬은 `girderSupport()`가 `連続スパン`으로 걷어내고 있어서 배근이 아예
나오지 않는다(샘플 그리드 X 1스팬 × Y 2스팬 → Y방향 大梁 층당 4본이 외형선만 남는다).
이 step은 도메인에서 런을 구성하고 런 전체를 관통하는 通し筋을 만든다.

이 step은 **순수 도메인만** 건드린다. three.js·React·훅은 다음 step이다.

## 읽어야 할 파일

- `CLAUDE.md` — 아키텍처 규칙 전부. 특히 ADR-012(主筋 본수·피치는 입력), 룰팩 `source`·`confidence` 의무, `src/domain/` 순수성
- `docs/ADR.md` — ADR-005·ADR-010·ADR-012·ADR-014
- `src/domain/model/project.ts` — `girderSupport`, `girderSpan`, `GirderSpan`, `touchesColumn`, `supportColumnSection`, `columnEnds`(R7① 해소 방식이 참고가 된다)
- `src/domain/model/unsupported.ts` — `MemberUnsupportedError`와 흡수/전파 경계
- `src/domain/rebar/girder.ts` — 현행 생성기(`generateGirderRebar`), 로컬 좌표계, `mainPoints`, zones
- `src/domain/rebar/girder-ends.ts` — `resolveGirderEnd`(直線/折曲げ 판정과 `lengthRule`·`projectionRule` 귀속)
- `src/domain/rebar/stirrup-layout.ts` — `stirrupPositions`
- `src/domain/model/sample-project.ts` — 검산 대상 샘플

## 배경 — 왜 런인가 (R7②)

스팬마다 독립으로 계산하면 중간 柱 접합부에서 좌·우 스팬이 정착을 **각각** 잡아
이중 계상이 된다. 通し筋의 진실은 그 반대다: 중간 접합부에는 정착이 **0번**이고,
철근은 접합부를 그대로 통과한다. 정착은 런의 **바깥 양 끝**에만 붙는다.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/model/project.ts` — `girderRun`

```ts
export interface GirderRun {
  axis: 'X' | 'Y'
  /** 축방향 오름차순. 단일 스팬이면 길이 1 */
  members: Member[]
  /** 通し筋을 귀속시킬 부재 = members[0].id */
  ownerId: string
  /** members와 같은 순서 */
  spans: GirderSpan[]
  /** 通し筋 코어 길이 (mm) = Σ内法 ＋ Σ中間柱の軸方向せい */
  coreLengthMm: number
}

export function girderRun(project: Project, member: Member): GirderRun
```

- 연쇄 탐색: 축이 `X`면 같은 `iy`·연속 `ix`, `Y`면 같은 `ix`·연속 `iy`. 같은 `storyId`.
  주어진 부재에서 **양방향으로** 끝까지 확장한 최대 연쇄를 돌려준다.
- `coreLengthMm`는 스팬을 순회해 `Σ clear ＋ Σ 중간 柱 축방향 치수`로 **누적해서**
  구하라. `Σ centerSpan − 양 끝 face offset`과 항등이지만, 산출식(formula)에
  중간 柱를 항으로 드러내야 하므로 누적 형태를 쓴다.
- 런 안의 `sectionId`가 섞이면 通し筋의 径·本数·せい가 정의되지 않는다. 이때는
  **plain `Error`로 실패**시켜라 — `MemberUnsupportedError`가 아니다. 현재 UI
  (`src/components/plan/grid.ts`의 `girderLineSectionId`)는 같은 통り芯의 大梁에
  항상 같은 단면을 물려주므로 사용자 입력으로는 도달하지 않는다. 도달했다면 결함이다.
- 단일 스팬은 길이 1인 런이다. **특수 분기를 만들지 마라.**

### 2. `girderSupport` 제거

연속 스팬이 지원되면 `girderSupport`는 항상 `supported: true`를 돌려주는 죽은
코드가 된다. 함수·타입(`GirderSupport`)과 호출부를 **전부** 제거하라.
호출부: `src/lib/hooks/useTakeoff.ts`, `src/components/viewer/building.ts`,
`src/components/viewer/Viewer3D.tsx`.

`src/domain/model/unsupported.ts`의 `UnsupportedReason`에서 `'連続スパン'`을 빼고,
독스트링에서도 연속 스팬 언급을 지워라. 남는 이유는 `'定着不成立' | '寸法不成立'`이며
둘 다 생성기의 throw에서만 나온다.

**주의**: 호출부 제거는 다음 step의 스코프와 겹친다. 이 step에서는 도메인 쪽
(`project.ts`·`unsupported.ts`)을 바꾸고, 타입이 깨지는 호출부는 **컴파일이 통과할
최소한으로만** 손대라. 뷰어의 미지원 표시 경로 재배선은 step 2다.

### 3. `src/domain/rebar/girder.ts` — 런 단위 생성

시그니처를 런 단위로 바꾼다:

```ts
export interface GirderRebarInput {
  run: GirderRun
  section: GirderSection
}
export function generateGirderRebar(input: GirderRebarInput, pack: RulePack): Rebar[]
```

- **上端筋·下端筋 (通し筋)** — `memberId = run.ownerId`, 1행씩.
  - 양단 정착은 `resolveGirderEnd`를 그대로 쓴다. 시작단 재료는 `spans[0]`의
    `startSupport*`, 종단 재료는 `spans[at(-1)]`의 `endSupport*`.
  - `length = run.coreLengthMm + start.lengthMm + end.lengthMm`
  - `points`는 기존 `mainPoints`에 `run.coreLengthMm`을 넘겨 만든다(현행이 넘기던
    `span.clear` 자리). 로컬 x 원점은 **런 시작 柱의 내측면**이다 — 현행 규약 그대로.
  - `zones`는 양 끝 `定着` 2개뿐이다. **중간 접합부에 zone을 넣지 마라.**
  - `formula`에 런 구성을 드러내라. 다스팬일 때 예시:
    `加工長 ＝ 内法長さ 5600＋5600 ＋ 中間柱せい 800 ＋ 始端… ＋ 終端… ＝ …`
    그리고 **이음 미포함을 명시**하라 — 정확한 문구는 아래 「継手」 항 참조.
  - 単一 스팬이면 항이 하나뿐이라 현행 문구와 사실상 같아야 한다.
- **あばら筋** — 런의 **각 부재마다** 1행. `memberId`는 그 부재 자신의 id다
  (3D·선택 연동이 부재 단위이기 때문). 산식·`stirrupPositions` 호출은 현행 그대로,
  각 스팬의 `clear`를 쓴다.
- 런의 어느 스팬이든 `MemberUnsupportedError`가 나면 **런 전체가 미지원**이다.
  깨진 스팬 위로 通し筋을 지나가게 할 수 없다. 그대로 전파시켜라 — 런 전체를
  미지원으로 묶는 처리는 훅(step 1)이 한다.

### 4. `GirderSpan`에서 표시 전용 필드를 걷어낸다 (PR #10 리뷰 잔여 minor)

`GirderSpan`의 `startSupportWidthAcrossAxisMm`·`endSupportWidthAcrossAxisMm`는
어떤 철근 생성기도 읽지 않고 `Viewer3D`만 소비한다 — 「도메인은 UI를 모른다」
(ARCHITECTURE.md) 경계를 흐린다. 두 필드를 제거하고, 대신 지점 柱 단면을 노출하는
함수를 도메인에 둬라:

```ts
export function girderSupportSections(
  project: Project,
  member: Member,
): { start: ColumnSection; end: ColumnSection }  // supportColumnSection 재사용
```

뷰어가 축에 따라 표시 치수를 파생한다. 지점 柱 **탐색** 로직이 표시부에 복제되지
않는다는 원래 의도는 이 함수로 그대로 지켜진다.

런에서는 시작 지점이 `members[0]`, 끝 지점이 `members.at(-1)`이다 — 런 단위
등가 함수가 필요하면 함께 두되, 표시 치수 파생은 뷰어에 맡겨라.

`stirrup-layout.ts`의 `lastGapMm`은 **그대로 둬라.** 그것은 배치 알고리즘의
산출 결과(도메인 사실)이고, 마침 범례가 소비할 뿐이다 — 계산에 쓰이지 않는 값을
표시 편의로 실어 나르는 위 두 필드와는 성격이 다르다.

### 5. 継手 (이음) — 이번 step에서 넣지 않는다

런 전장이 定尺長さ를 넘으면 실무상 重ね継手가 필요하지만, **개소수를 정할 근거가
없다**. `src/rulepack/jp-mlit/lap.yaml`에는 이음 **길이**(`lap.L1`·`lap.L1h`)만 있고
定尺長さ 키는 없으며, 標準仕様書 5章에도 없다. 근거 없는 수치를 넣지 않는다는
CLAUDE.md 규칙이 우선이다.

- 룰팩에 定尺長さ를 **추가하지 마라.**
- 코드에 12000 같은 정척 리터럴을 **쓰지 마라.**
- 通し筋 `formula` 끝에 이음 미포함을 명시하라:
  `／ 継手 ＝ 未計上（定尺長さの根拠なし）`
- 単一 스팬에도 같은 문구를 붙일지는 판단에 맡긴다. 다만 M3a 시점 산출식과 달라지면
  기존 테스트가 깨진다 — 깨진다면 그 테스트가 무엇을 보증했는지 확인하고 갱신하라.

### 6. 테스트

`src/domain/model/project.test.ts`:
- 샘플 Y방향(`ix=0`)에서 런 길이 2, `ownerId`가 `iy=0` 부재, `members` 순서가 축방향 오름차순
- 샘플 X방향에서 런 길이 1 (nx=2라 스팬 1개)
- 런 중간 부재에서 시작해도 **같은 런**이 나온다 (양방향 확장)
- `coreLengthMm` 검산: 샘플 Y런 = 内法(6000−400−400=5200) × 2 ＋ 중간 柱 800 = 11200
- 단면 혼재 런은 plain `Error`

`src/domain/rebar/girder.test.ts`:
- 다스팬 通し筋의 `length`가 `coreLengthMm + 양단 정착`과 일치
- `zones`가 정확히 2개이고 둘 다 런의 바깥 끝에 붙는다 — **중간 접합부에 zone 없음**
- あばら筋이 런의 부재 수만큼 나오고 각 `memberId`가 자기 부재다
- 기댓값은 `lookupRule`로 유도하라 (ADR-010 — 골든이 아닌 유닛테스트의 관례)
- 単一 스팬 회귀: 기존 케이스가 그대로 통과해야 한다

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
   - `src/domain/`에 React·three.js·Next.js import이 없는가?
   - 규준 수치 리터럴이 `.ts`에 새로 들어가지 않았는가? (특히 정척 길이)
   - 中間 접합부에 정착이 한 번도 계상되지 않는가? (R7② 해소 확인)
3. `phases/5-girder-continuous/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 `GirderRun` 스키마·런 탐색 방식·
     `girderSupport` 제거 범위·継手 유예 표기를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **定尺長さ·継手 개소를 추정하지 마라.** 이유: 근거가 없다. 없는 값은 넣지 않는다.
- **중간 접합부에 정착·이음 zone을 넣지 마라.** 이유: 通し筋은 접합부를 통과한다.
  넣으면 R7②의 이중 계상을 형태만 바꿔 되살리는 것이다.
- **단일 스팬용 경로를 따로 남기지 마라.** 이유: 두 벌이 되면 곧 어긋난다.
  단일 스팬은 길이 1인 런이다.
- **단면 혼재를 `MemberUnsupportedError`로 흡수하지 마라.** 이유: 현재 UI로는 도달
  불가능하다. 도달했다면 결함이고, 미지원으로 삼키면 결함이 화면에서 사라진다.
- **뷰어(`src/components/viewer/`)와 훅(`useTakeoff`)의 로직을 재설계하지 마라.**
  이유: step 1·2의 스코프다. 컴파일을 통과시킬 최소 수정만 하라.
- 기존 테스트를 근거 없이 지우지 마라. 깨지면 그 테스트가 무엇을 보증했는지 먼저 밝혀라.
