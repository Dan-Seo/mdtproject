# Step 3: layer-toggle

뷰어 기능 ①: 레이어 토글. 主筋 / 帯筋·あばら筋 / 콘크리트를 개별 on-off한다. 상태는 store, 적용은 Viewer3D, **피킹은 visible을 존중**해야 한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `src/lib/store.ts` — `viewerMode` 선례 (페인-로컬 UI 상태를 store에 두는 방식), `ViewerMode` 타입
- `src/lib/store.test.ts` — store 테스트 패턴
- `src/components/viewer/Viewer3D.tsx` — 씬 구축부(메시 `userData.layer` — step 1·2 산출), 클릭 피킹부(`pickableMeshes`)
- `src/components/viewer/ViewerTabs.tsx` — 뷰어 상단 컨트롤의 기존 배치·스타일
- `src/locales/ja.json` · `ko.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/lib/store.ts`

```ts
export type ViewerLayer = 'main' | 'hoop' | 'concrete'
// state
viewerLayers: Record<ViewerLayer, boolean>   // 초기값 전부 true
toggleViewerLayer(layer: ViewerLayer): void
```

파생 상태가 아니라 UI 상태이므로 store에 두는 것이 맞다 (`viewerMode` 선례).

### 2. `src/components/viewer/Viewer3D.tsx`

- 콘크리트 메시(部材 뷰 반투명 솔리드·와이어프레임, 建物 뷰 박스·아웃라인)에 `userData.layer = 'concrete'`를 부여한다. **단, 部材 뷰 와이어프레임(EdgesGeometry)과 建物 뷰 아웃라인은 콘크리트 off에서도 남긴다** — 공간 참조를 완전히 잃으면 철근이 허공에 뜬다. 이것은 명시적 제품 결정이며 코드 주석으로 남겨라.
- `viewerLayers` 변경 시 씬을 재구축하지 말고 `content.traverse`로 `userData.layer` 매칭 메시의 `visible`만 바꿔라.
- **피킹 가드**: three.js Raycaster는 `visible=false` 메시도 교차시킨다. 클릭(및 이후 호버) 피킹에서 히트 대상의 **자신+조상 체인 effective visibility**를 확인해 숨긴 메시를 걸러라.

### 3. UI

- 뷰어 오버레이(우상단)에 토글 버튼 3개: `主筋` / `帯筋・あばら筋` / `コンクリート`. `aria-pressed`로 상태 노출, 기존 탭 버튼 스타일 재사용.
- i18n: `viewer.layer.main`·`viewer.layer.hoop`·`viewer.layer.concrete` (ja 기본, ko 대응 — 도메인 용어 원어 유지).

### 4. 테스트

- `store.test.ts`: 초기값 전부 true, 토글 동작.
- `Viewer3D.test.tsx`: ① hoop off → 해당 메시 visible=false, main은 true ② concrete off에서 아웃라인은 여전히 visible ③ off된 레이어의 메시는 클릭 피킹에서 제외 ④ 토글해도 씬 재구축(메시 재생성)이 일어나지 않음.

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
   - store에 파생 상태(`Rebar[]` 등)를 넣지 않았는가? (viewerLayers는 순수 UI 상태)
   - 토글이 지오메트리 재구축을 유발하지 않는가? (visible만)
3. `phases/4-girder-viewer/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 store 필드·visible 적용 방식·피킹 가드(조상 체인 확인)를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **레이어 토글로 메시를 dispose·재생성하지 마라.** 이유: 토글은 고빈도 조작이다. visible 스위치가 전부여야 한다.
- **Raycaster가 invisible을 걸러줄 거라 가정하지 마라.** 이유: three.js Raycaster는 visible을 검사하지 않는다. 직접 필터해야 하며, 부모 그룹이 숨겨진 경우까지 조상 체인으로 확인하라.
- **레이어 상태를 URL·localStorage에 영속하지 마라.** 이유: 요청 밖 기능이다.
- 기존 테스트를 깨뜨리지 마라.
