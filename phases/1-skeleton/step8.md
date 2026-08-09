# Step 8: viewer-3d

우측 상단 3D 뷰어를 만든다. **선택된 부재 1개의 배근만** 그린다. 골조 전체를 그리지 않는다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **§7(3D 뷰어 전체 — 좌표계·재질·카메라·의도적 예외 2건), §3.2(hoverRow 강조), §2(페인 위치)**
- `/docs/ADR.md` — ADR-016(3D를 MVP에 유지하는 이유와 되돌리는 조건), ADR-006(전부 브라우저에서)
- `/docs/PRD.md` — §핵심 기능 4
- step 3의 `src/domain/model/`의 `Rebar` — `points`·`closed`·`size`
- step 5의 `src/lib/store.ts`(`sel`, `hoverRowId`), `useTakeoff`
- step 7의 행 id 형식 — 레이캐스트 역추적이 이 id로 돌아간다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** jsdom에는 WebGL이 없어 렌더 자체를 테스트할 수 없다. 따라서 **테스트 가능한 순수 로직을 먼저 분리하라.**

### 1. 순수 지오메트리 변환 — `src/components/viewer/geometry.ts`

three.js를 import하지 않는 순수 함수로 만든다. 여기에 테스트를 붙인다.

```ts
interface Segment { from: [number, number, number]; to: [number, number, number]; radius: number }

function rebarSegments(rebar: Rebar): Segment[]      // 꺾인점 사이를 잇는다. closed면 마지막→첫 점도 포함
function rebarRadius(size: BarSize): number          // DESIGN §7의 과장 규칙
function fitCamera(bounds: Bounds): { position: [number, number, number]; target: [number, number, number] }
```

`rebarRadius`는 DESIGN §7의 의도적 예외 2번이다: **`max(径, 14) × 1.6`으로 과장한다.** 실경 축척이 아니다 — D10이 실제 비율대로면 화면에서 사라진다. **이 과장이 적용되고 있음을 UI에 명시하라**(예: 페인 헤더 옆 「寸法判読用ではない」 주석). 명시 없이 과장하면 사용자가 3D를 치수 검증에 쓴다.

`fitCamera`는 바운딩박스 8꼭짓점을 투영해 여유 **1.08**로 자동 프레이밍한다.

**`src/domain/`에 넣지 마라.** 화면 표현 로직이지 규준 도메인이 아니다.

### 2. three.js 뷰어 — `src/components/viewer/`

DESIGN §7을 그대로 따른다.

- **좌표계**: mm. `X` = 평면 x, `Y` = 높이, `Z` = 평면 y. 씬에는 `×0.001`로 스케일해서 넣는다
- **선택된 부재 1개의 배근만** 렌더한다 (`sel.memberId`)
- 부재 외형은 `EdgesGeometry` 와이어프레임 `#4a483c`로만 암시. **콘크리트 솔리드를 만들지 마라** — 철근이 주인공이다
- 철근은 꺾인점 사이를 **8각 실린더**로 잇는다. 帯筋/あばら筋은 `closed: true`로 폐합
- 재질 `#b8b3a6` (roughness .5 / metalness .35), 강조 시 `#f54e00`
- 카메라: fov **38**, 방향 `(0.72, 0.34, 0.86)` 정규화, OrbitControls damping **0.08**
- 캔버스 배경 다크 `#1b1a14` — DESIGN §7의 의도적 예외 1번이다. 회색 철근을 크림 위에 놓으면 대비가 죽는다. **이 페인만 다크다.** 다른 페인에 다크를 번지게 하지 마라

### 3. hoverRow 강조 — DESIGN §3.2

- 내역서 행에 hover(`hoverRowId`) → 그 행의 철근만 오렌지 `#f54e00`, 나머지는 회색 `#b8b3a6`
- 3D에서 철근 클릭 → 레이캐스트 → **`rowId` 역추적** → 해당 내역서 행 강조 (`setHoverRow`)

역추적을 위해 각 메시에 `QuantityLine.id`(step 7의 행 id 형식)를 붙여둔다. **PRD 핵심 기능 4번 「내역서 행 ↔ 3D 철근 개체 상호 선택」이 이 축이다** — 빼면 이 제품이 다른 물량 도구와 구분되지 않는다.

### 4. 리소스 정리

- 언마운트 시 renderer·geometry·material·OrbitControls를 dispose 한다
- `Rebar[]`가 바뀌면 씬을 **재구성**한다. three.js 오브젝트를 React state에 넣지 마라(ARCHITECTURE.md §상태 관리)
- `ResizeObserver`로 페인 크기 변화에 대응한다

### 5. `InstancedMesh`는 M1에서 쓰지 않는다

R4(층당 철근 1만 개)는 실재하는 리스크지만, M1은 **선택 부재 1개만** 그리므로 개체 수가 수십 개다. `InstancedMesh` 전환은 다부재 표시로 확장하는 시점(M4)의 일이다(DESIGN §10-7). 여기서 미리 만들지 마라.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
npm run test:golden
```

테스트에는 최소한 아래가 포함되어야 한다:

- `rebarSegments`가 `closed: true`인 帯筋에 대해 마지막→첫 점 세그먼트를 포함한다
- `rebarSegments`가 `closed: false`인 主筋에 대해 그 세그먼트를 포함하지 않는다
- `rebarRadius('D10')`이 실경(10)이 아니라 과장값을 반환한다 (과장이 의도임을 고정하는 회귀 테스트)
- `fitCamera`가 바운딩박스를 여유 1.08로 감싼다
- 뷰어 컴포넌트가 마운트/언마운트되어도 예외가 나지 않는다 (WebGL은 mock)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/domain/`이 three.js를 import하지 않는가? (CRITICAL — step 5의 ESLint 규칙이 잡아야 한다)
   - three.js 오브젝트가 React state에 없는가? (ARCHITECTURE.md)
   - 선택 부재 1개만 그리는가? 골조 전체를 그리지 않는가? (DESIGN §7)
   - 콘크리트 솔리드를 만들지 않았는가? (DESIGN §7)
   - 다크 배경이 3D 캔버스 안에만 있는가? (PRD §디자인)
   - 철근 반경 과장이 UI에 명시되어 있는가? (DESIGN §7 예외 2)
   - 철근 경을 색으로 구분하지 않는가? (PRD §디자인)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 8을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`InstancedMesh`를 지금 도입하지 마라.** 이유: M1은 선택 부재 1개만 그린다. 필요해지는 시점은 다부재 표시로 확장하는 M4다 (DESIGN §10-7).
- **콘크리트 솔리드·거푸집 형상을 만들지 마라.** 이유: 철근만이다 (ADR-005). 부재 외형은 와이어프레임으로만 암시한다.
- **골조 전체를 렌더하지 마라.** 이유: DESIGN §7 — 선택된 부재 1개의 배근만이다.
- **three.js 오브젝트를 React state에 넣지 마라.** 이유: 리렌더마다 씬이 재생성되어 성능이 무너진다 (ARCHITECTURE.md).
- **철근 반경 과장을 숨기지 마라.** 이유: 명시 없이 과장하면 사용자가 3D를 치수 검증에 쓴다 (DESIGN §7).
- **glTF/GLB export를 여기서 만들지 마라.** 이유: M4다. 마일스톤을 건너뛰지 않는다.
- **`src/components/viewer/geometry.ts`에서 three.js를 import하지 마라.** 이유: 그러면 테스트가 불가능해지고, 이 step에서 테스트 가능한 유일한 층이 사라진다.
- 기존 테스트를 깨뜨리지 마라.
