# Step 4: clip-plane

뷰어 기능 ②: 단면 컷. 클리핑 평면 1개로 부재 내부(かぶり·定着 관입)를 열어 본다. **핵심 제약은 셰이더 재컴파일 회피**다 — three.js는 머티리얼에 `clippingPlanes`를 런타임에 넣으면 셰이더를 다시 컴파일한다. 평면은 머티리얼 생성 시점에 고정하고, on/off는 평면 상수로만 조작한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — §7 (좌표계 mm→scene ×0.001, Y=높이)
- `src/components/viewer/Viewer3D.tsx` — 머티리얼 생성부(씬 구축 시 1회 생성 원칙), 렌더 루프, renderer 초기화부
- `src/components/viewer/geometry.ts` · `geometry.test.ts` — bounds 계산(部材 뷰 `memberBounds` 상당), 순수 함수 테스트 패턴
- `src/components/viewer/Viewer3D.test.tsx` — 씬 구축 검증 패턴
- `src/locales/ja.json` · `ko.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/components/viewer/geometry.ts` — 클립 수학 (순수 함수)

```ts
export type ClipAxis = 'x' | 'y' | 'z'
export function clipPlaneForMm(
  bounds: { min: [number, number, number]; max: [number, number, number] },
  axis: ClipAxis,
  ratio: number  // 0..1, bounds 범위 내 절단 위치
): { normal: [number, number, number]; constantMm: number }
```

- **mm 좌표계에서 계산한다.** scene 단위 변환(×0.001)은 Viewer3D가 THREE.Plane에 적용하는 시점에 한다 — 수학과 렌더 단위를 분리해야 순수 테스트가 성립한다.
- ratio=0 → 절단 없음에 가까운 한쪽 끝, ratio=1 → 반대쪽 끝. 부호(어느 쪽을 남기는지)는 구현이 정하되 테스트로 고정하라.

### 2. `src/components/viewer/Viewer3D.tsx`

- 클립 상태는 **Viewer3D 로컬 state** `{ enabled, axis, ratio }` — 슬라이더는 고빈도 조작이라 store에 두면 앱 전체가 리렌더된다.
- 마운트 시 `renderer.localClippingEnabled = true` **상시 on** (켤 때 토글하면 그 자체가 전 머티리얼 재컴파일이다).
- `THREE.Plane` 1개를 runtime ref로 보유하고, **클립 대상 머티리얼 생성 시점에** `clippingPlanes: [plane]`·`clipShadows: true`를 고정한다. 대상: 콘크리트·철근(zone 머티리얼 포함). **제외: grid·shadow 계열** — 바닥 그리드가 잘리면 공간 참조를 잃는다.
- "끄기" = `plane.constant`를 큰 값(예: 1e6)으로 밀어 사실상 절단 없음. `clippingPlanes` 배열 자체는 절대 바꾸지 않는다.
- 축·ratio 변경 시 `clipPlaneForMm` 결과를 scene 단위로 변환해 plane의 normal·constant만 갱신한다.
- **알려진 한계 (코드 주석으로 명시)**: Raycaster는 CPU 측이라 클리핑을 모른다 — 잘려나간 영역에도 클릭·호버가 걸린다. MVP 수용이며 코드로 풀지 않는다.

### 3. UI

- 뷰어 오버레이에 단면 컷 컨트롤: on/off 토글 + 축 3버튼(X/Y/Z, `aria-pressed`) + range 슬라이더(0..1). 기존 레이어 토글(step 3) 버튼 스타일과 정합.
- i18n: `viewer.clip.*` (예: `viewer.clip.toggle`·`viewer.clip.axisX` 등, ja 기본·ko 대응).

### 4. 테스트

- `geometry.test.ts`: `clipPlaneForMm` — 축 3종의 normal 방향, ratio 0/0.5/1 경계값의 constantMm, 비대칭 bounds 케이스.
- `Viewer3D.test.tsx`: ① 클립 대상 머티리얼에 생성 시점부터 `clippingPlanes`가 존재 ② off 상태에서 plane.constant가 큰 값 ③ grid 머티리얼에는 `clippingPlanes` 없음 ④ 축·ratio를 바꿔도 머티리얼 인스턴스가 교체되지 않음 (재컴파일 없음의 대리 검증).

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
   - 클립 수학이 three.js 비의존 순수 함수인가? (mm 계산과 scene 변환 분리)
   - 마운트 이후 셰이더 재컴파일 경로가 없는가? (clippingPlanes 배열 불변·localClippingEnabled 상시 on)
3. `phases/4-girder-viewer/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 clipPlaneForMm 시그니처·머티리얼 고정 방식·끄기 처리(constant)를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **런타임에 머티리얼의 `clippingPlanes` 배열을 추가·제거하지 마라.** 이유: 셰이더 재컴파일 — 슬라이더 조작마다 프레임이 죽는다. 생성 시 고정 + constant 조작이 전부여야 한다.
- **`renderer.clippingPlanes`(전역 클립)를 쓰지 마라.** 이유: grid·그림자까지 잘린다. 대상 머티리얼에만 적용하는 것이 사양이다.
- **클립 상태를 store에 넣지 마라.** 이유: 슬라이더 고빈도 조작이 store 구독 컴포넌트 전체를 리렌더시킨다. Viewer3D 로컬 state가 사양이다.
- **잘린 영역의 피킹을 "고치려" GPU 판독·수학 보정을 도입하지 마라.** 이유: 알려진 한계로 수용이 결정됐다 (주석 명시로 충분).
- 기존 테스트를 깨뜨리지 마라.
