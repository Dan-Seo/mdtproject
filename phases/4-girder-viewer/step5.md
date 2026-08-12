# Step 5: hover-tooltip

뷰어 기능 ③: 호버 툴팁. 部材 뷰에서 철근에 마우스를 올리면 `役割/径/本数/加工長`을, 建物 뷰에서는 부재 id·符号를 보여준다. **성능 계약**: pointermove는 기록만 하고, 레이캐스트는 렌더 루프에서 프레임당 최대 1회.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `src/components/viewer/Viewer3D.tsx` — 렌더 루프(`renderFrame` 상당), 클릭 피킹부(NDC 변환·Raycaster·`pickableMeshes`·visible 가드 — step 3 산출), `userData.rowId`·`userData.memberIds`
- `src/components/viewer/Viewer3D.test.tsx` — RaycasterMock·rAF 모킹 패턴, 피킹 테스트 선례
- `src/lib/hooks/useTakeoff.ts` — lines 구조 (`役割/径/本数/加工長` 필드의 원천)
- `src/lib/store.ts` — 선택(클릭) 상태 계약 — 호버가 이것을 건드리면 안 된다
- `src/locales/ja.json` · `ko.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. 이벤트 → 레이캐스트 분리

- `pointermove` 핸들러: NDC 좌표와 dirty 플래그를 ref에 기록만 한다. 핸들러 안에서 레이캐스트 금지.
- 기존 렌더 루프에서 dirty일 때만 프레임당 최대 1회 레이캐스트. 새 타이머·새 rAF 루프를 만들지 마라.
- 피킹 대상·visible 가드(조상 체인)는 클릭 피킹과 **같은 코드 경로**를 재사용하라 — 클릭과 호버가 다른 대상을 잡으면 안 된다.
- `pointerleave`: dirty 해제 + 툴팁 숨김.

### 2. 툴팁 내용

- **部材 뷰**: 히트 메시 `userData.rowId` → lines 조회 → `役割/径/本数/加工長` 표시. 조회 실패(편집 직후 스테일 rowId)는 **null 가드로 툴팁 숨김만** — 에러 처리 기계를 만들지 마라.
- **建物 뷰**: InstancedMesh `instanceId` → `userData.memberIds[instanceId]` → 부재 id·符号 표시. 콘크리트 박스 히트도 동일하게 부재 식별.
- 径·加工長 등 수치는 lines가 주는 값 그대로 — 뷰어에서 재계산 금지.

### 3. 툴팁 DOM

- 위치 갱신은 **ref 직접 스타일**(`style.transform` 등) — pointermove 빈도로 setState를 하면 리렌더가 프레임을 잡아먹는다.
- 내용(어떤 행인가)이 바뀔 때만 setState. 같은 행 위에서의 이동은 위치만 갱신.
- 접근성: 툴팁은 마우스 전용 보조 정보다 — 클릭=행 선택(키보드 접근 가능한 기존 경로)이 정보의 정식 경로로 남는다.

### 4. 피킹 정책 (테스트로 고정)

- step 3에서 숨긴 레이어는 호버에서도 제외된다 (클릭 가드 재사용의 자연 귀결 — 테스트로 고정).
- step 4에서 클립으로 잘린 영역은 호버가 **걸린다** — 알려진 한계 수용. 이 동작 자체를 테스트로 명문화해 "우연"이 아니라 "정책"으로 만들어라.
- store의 선택 상태(클릭=행 선택)는 호버로 절대 변하지 않는다.

### 5. 테스트 — `Viewer3D.test.tsx`

- pointermove 발화 시 즉시 레이캐스트가 일어나지 않고, 다음 프레임에서 1회 일어난다 (RaycasterMock 호출 횟수).
- 部材 뷰: 철근 호버 → 툴팁에 役割·径·本数·加工長. 스테일 rowId → 툴팁 숨김.
- 建物 뷰: 인스턴스 호버 → 부재 id·符号.
- pointerleave → 툴팁 숨김. 숨긴 레이어 호버 제외. 호버가 store 선택 상태를 바꾸지 않음.

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
   - 호버 경로에 store 쓰기가 없는가?
   - 렌더 루프 밖에서 레이캐스트하지 않는가?
   - 클릭 피킹 코드와 가드가 공유되는가? (두 벌 금지)
3. `phases/4-girder-viewer/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 dirty 플래그 방식·툴팁 내용 소스·피킹 정책(숨김 제외·클립 수용)을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **pointermove 핸들러 안에서 레이캐스트하지 마라.** 이유: 이벤트는 프레임보다 잦다. 기록→렌더 루프 1회가 성능 계약이다.
- **호버 상태를 store에 넣지 마라.** 이유: 리렌더 폭주 + 클릭=행 선택 계약 오염. 호버는 Viewer3D 내부 사정이다.
- **툴팁 위치를 setState로 갱신하지 마라.** 이유: pointermove 빈도의 React 리렌더는 프레임 드랍이다. ref 직접 스타일이 사양이다.
- **호버용 레이캐스트 경로를 클릭과 별도로 새로 쓰지 마라.** 이유: 가드(visible·pickable)가 두 벌이 되면 클릭과 호버가 서로 다른 것을 잡는 버그가 생긴다.
- 기존 테스트를 깨뜨리지 마라.
