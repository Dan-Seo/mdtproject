# Step 2: building-view-girder

建物 뷰에 지원 大梁의 철근을 인스턴싱한다. `building.ts`의 柱 전용 필터를 걷어내고, layer 정보를 인스턴스 그룹 키에 넣어 다음 step(레이어 토글)을 준비한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — §7 建物 탭 (전 부재 콘크리트 + 철근 InstancedMesh, R4)
- `src/components/viewer/building.ts` · `building.test.ts` — `buildingLayout()`(콘크리트는 柱·大梁 모두, `RebarInstance`는 柱만), 반경별 인스턴스 그룹핑, 大梁 박스 배치(상단=층 천장)
- `src/components/viewer/Viewer3D.tsx` — building 씬 구축부 (단위 실린더 + 방향 벡터 회전, `userData.memberIds[instanceId]`)
- `src/components/viewer/geometry.ts` — step 0의 `roleToLayer`·전개 함수
- `src/domain/model/project.ts` — `girderSpan`(`startFaceOffsetMm`)·`girderSupport`·`storyElevation`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/components/viewer/building.ts`

- `RebarInstance`에 `layer: RebarLayer` 추가 (`roleToLayer` 사용 — 매핑 중복 금지).
- 柱 전용 필터(`kind !== '柱'`) 제거. **지원 大梁만** 전개한다 (`girderSupport` — 미지원은 콘크리트 박스만, 기존과 동일).
- 大梁 로컬 → 월드 매핑 (로컬: x=스팬·좌측 柱面 원점, y=밑면 기준, z=폭):
  - `base = storyElevation + story.height − depth` (大梁 상단 = 층 천장 — 기존 콘크리트 박스 배치와 같은 규칙)
  - X축: `world = [start.x + startFaceOffsetMm + x, base + y, start.y − b/2 + z]`
  - Y축: `world = [start.x − b/2 + z, base + y, start.y + startFaceOffsetMm + x]`
- 인스턴스 그룹 키를 반경 단독에서 `${radius}|${layer}`로 확장하라 — 같은 표시 반경의 主筋과 스터럽이 한 InstancedMesh에 묶이면 레이어 토글이 불가능해진다.

### 2. `src/components/viewer/Viewer3D.tsx` — building 씬 구축부

- 그룹별 InstancedMesh `userData`에 `layer`를 저장한다.
- 수평(스팬 방향) 세그먼트는 기존 「단위 실린더 + `setFromUnitVectors`」 방식이 그대로 처리한다 — 회전 로직을 새로 만들지 마라.
- 철근 머티리얼은 기존 building용 1개를 유지한다 (그룹이 늘어도 프로그램은 1개 — 셰이더 재링크 없음).

### 3. 테스트 — `building.test.ts`

- 샘플(2×3)에서 지원 X大梁의 인스턴스가 존재하고, 미지원 Y大梁의 철근 인스턴스는 없다.
- 좌표 매핑: X축 大梁 上端筋 대표 인스턴스의 월드 좌표가 기대값(수식 유도)과 일치. Y축 케이스 1개.
- **부재 밖 돌출 invariant**: 모든 大梁 철근 인스턴스의 스팬 방향 좌표가 「지점 柱 외면」을 넘지 않는다 (定着 구간 포함 — resolveGirderEnd의 수용성 검사가 지켜졌다는 물리 검증).
- 그룹 키에 layer가 반영됨 (같은 반경·다른 layer가 다른 그룹).

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
   - InstancedMesh 유지 (부재당 개별 Mesh 금지 — R4)
   - `building.ts`가 three.js 비의존 순수 계산으로 남았는가?
3. `phases/4-girder-viewer/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 좌표 매핑식·그룹 키 확장·미지원 大梁 처리 방식을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **부재마다 개별 Mesh를 만들지 마라.** 이유: R4 (층당 철근 1만 개). InstancedMesh가 유일한 확장 경로다.
- **building 뷰 전용 철근 머티리얼을 늘리지 마라.** 이유: 머티리얼 수 = 셰이더 프로그램 수. 그룹 분할은 지오메트리 차원이지 머티리얼 차원이 아니다.
- **미지원 大梁의 철근을 그리지 마라.** 이유: step 1과 동일 — R7 ②.
- 기존 테스트를 깨뜨리지 마라.
