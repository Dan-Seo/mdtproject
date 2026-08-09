# Step 1: domain-model

`src/domain/model/`에 프로젝트의 데이터 모델을 정의한다. 이후 모든 step이 이 타입 위에서 돈다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — §데이터 흐름, §상태 관리
- `/docs/ADR.md` — ADR-005(부재는 柱·大梁만), ADR-008(도메인 용어 원어), ADR-012(主筋·帯筋은 입력)
- `/docs/DESIGN.md` — §2(화면 구조에 나오는 符号 C1/G1/G2), §3.1(`sel = { group, memberId }`의 group 문법)
- `/AGENTS.md` — CRITICAL 규칙 전체
- step 0에서 만들어진 `package.json`, `vitest.config.ts`, `tsconfig.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** `src/domain/model/` 아래 `.ts`를 쓰려면 같은 폴더에 `*.test.ts`가 먼저 있어야 한다(`scripts/hooks/tdd-guard.sh`가 차단한다). 테스트를 먼저 쓰고 구현하라.

### 1. 타입 정의

`src/domain/model/` 아래에 둔다. 파일 분할은 재량이되 `types.ts` 한 파일에 몰아넣지 마라 — TDD 가드가 `types.ts`를 면제 경로로 취급해서 테스트 없이 통과시킨다.

**모든 타입은 순수 JSON으로 직렬화 가능해야 한다.** 클래스 인스턴스·함수·`Date`·`Map`·`Set`을 넣지 마라.

```ts
type MemberKind = '柱' | '大梁'
type MemberClass = '躯体'                    // 할증률 조회 인자. 확장 지점이므로 지금 타입으로 존재해야 한다
type BarSize = 'D10' | 'D13' | 'D16' | 'D19' | 'D22' | 'D25' | 'D29' | 'D32'
type SteelGrade = 'SD295' | 'SD345' | 'SD390'

interface Grid { xSpans: number[]; ySpans: number[] }        // mm. 스팬 배열 → 교점 개수는 span+1
interface Story { id: string; name: string; height: number } // name 예: '1階'. height = 階高 mm. 배열은 아래→위 순

interface ColumnSection {
  id: string; kind: '柱'; mark: string                       // mark = 符号. 예: 'C1'
  b: number; d: number                                       // 断面 mm
  fc: number; grade: SteelGrade                              // Fc N/mm²
  main: { size: BarSize; count: number }                     // 主筋 — 사용자 입력. 제품이 바꾸지 않는다
  hoop: { size: BarSize; pitch: number }                     // 帯筋 — 사용자 입력
}

interface GirderSection {
  id: string; kind: '大梁'; mark: string                     // 예: 'G1'
  b: number; depth: number                                   // 幅 × せい mm
  fc: number; grade: SteelGrade
  main: { size: BarSize; topCount: number; bottomCount: number }
  stirrup: { size: BarSize; pitch: number }                  // あばら筋
}

type Section = ColumnSection | GirderSection

interface Member {
  id: string; kind: MemberKind; memberClass: MemberClass
  sectionId: string; storyId: string
  position: ColumnPosition | GirderPosition
}
interface ColumnPosition { ix: number; iy: number }                       // 격자 교점 인덱스
interface GirderPosition { axis: 'X' | 'Y'; ix: number; iy: number }      // 시작 교점 + 진행 축

interface Project {
  schemaVersion: number
  name: string
  grid: Grid
  stories: Story[]
  sections: Section[]
  members: Member[]
}
```

**M1에서 大梁은 입력·표시·せい 조회까지만 한다.** 大梁의 배근 생성은 M3다. 그럼에도 `GirderSection`이 지금 필요한 이유는, step 3의 帯筋 본수 계산이 `階高 − 상부 大梁せい`를 쓰기 때문이다(DESIGN §10-5). 이 값을 전역 상수로 두지 않고 단면일람에서 조회하려면 大梁 단면이 모델에 있어야 한다.

### 2. 순수 함수

```ts
function gridPoint(grid: Grid, ix: number, iy: number): { x: number; y: number }   // mm. 범위 밖이면 throw
function gridPointCount(grid: Grid): { nx: number; ny: number }                    // spans.length + 1
function memberGroupKey(project: Project, member: Member): string                  // '1F|C|C1' 형식
function findSection(project: Project, sectionId: string): Section                 // 없으면 throw
function beamDepthAbove(project: Project, member: Member): number                  // 아래 규칙 참조
function serializeProject(p: Project): string
function deserializeProject(json: string): Project                                 // schemaVersion 불일치면 throw
```

`memberGroupKey`의 형식은 DESIGN §3.1이 고정한 `{층 또는 레벨}|{C|G}|{符号}`다. 층 라벨은 `Story.name`에서, 부재 문자는 `柱`→`C` / `大梁`→`G`로 만든다. 이 문자열이 step 4의 그룹 집계 키이자 step 7의 행 id 접두사가 되므로 형식을 바꾸지 마라.

`beamDepthAbove(project, member)`는 그 柱 바로 위에 걸리는 大梁의 `depth`를 돌려준다. 같은 층의 大梁 중 그 교점에 접하는 것을 찾고, 여러 개면 가장 큰 `depth`를 쓴다. **접하는 大梁이 하나도 없으면 0을 반환하지 말고 throw하라** — 조용히 0이 들어가면 帯筋 본수가 틀린 채로 나간다.

### 3. 샘플 프로젝트 픽스처

`src/domain/model/`에 M1 동작 확인용 초기 `Project`를 만드는 함수를 둔다(예: `createSampleProject()`). DESIGN §2의 화면 예시와 맞춘다:

- 격자 3×3 교점(`xSpans: [6000, 6000]`, `ySpans: [6000, 6000]`)
- 2개 층. `1階` 階高 4200, `2階` 階高 3600
- 断面: `C1` 800×800 / 主筋 12-D25 / 帯筋 D13@100, `G1` 400×750, `G2` 400×700
- Fc·grade는 DESIGN §6의 예시에 맞춰 Fc24 / SD345

**이 수치들은 규준값이 아니라 예시 형상이다.** 定着長さ·かぶり厚さ 같은 규준 수치를 여기에 쓰면 CRITICAL 위반이다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

테스트에는 최소한 아래가 포함되어야 한다:

- `serializeProject` → `deserializeProject` 왕복이 원본과 깊은 동등(round-trip)
- `JSON.stringify(createSampleProject())`가 함수·`undefined`·클래스 인스턴스를 포함하지 않음
- `gridPoint`가 범위 밖 인덱스에 throw
- `memberGroupKey`가 `'1階|C|C1'` 형식을 반환
- `beamDepthAbove`가 접하는 大梁이 없을 때 throw

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/domain/`이 React·DOM·three.js·Next.js를 import하지 않는가? (CRITICAL)
   - 도메인 용어가 일본어 원어인가? `柱`·`大梁`·`主筋`·`帯筋`·`あばら筋` (ADR-008)
   - `壁`·`スラブ`·`基礎`·`小梁` 타입을 만들지 않았는가? (ADR-005)
   - 규준 수치 리터럴이 없는가? (ADR-002)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: 타입 이름과 파일 경로, 샘플 프로젝트 팩토리 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`Rebar`·`QuantityLine` 타입을 여기서 만들지 마라.** 이유: `Rebar`는 step 3, `QuantityLine`은 step 4의 산출물이고 파생 상태다. 여기서 정의하면 모델과 파생의 경계가 흐려진다.
- **主筋 본수·帯筋 피치를 계산하는 함수를 만들지 마라.** 이유: 입력값이지 산출값이 아니다 (ADR-012).
- **`Date`·`Map`·`Set`·클래스를 `Project`에 넣지 마라.** 이유: `Project`는 순수 JSON 직렬화가 저장·불러오기의 이음매다.
- **규준 수치(定着·重ね継手·折曲げ·かぶり·할증률·단위질량)를 쓰지 마라.** 이유: ADR-002. 전부 step 2의 YAML에서 온다.
- 기존 테스트를 깨뜨리지 마라.
