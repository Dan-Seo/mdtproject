# Step 2: viewer-joint-scene — Viewer3D 접합부 씬·参考 박스·검사 마커·카메라 pose 캡처/복원·未対応 패널

README 공통 결정과 step 1 산출물(`joint-layout.ts`, 스토어 필드)을 먼저 읽어라.

## 읽어야 할 파일
- `src/components/viewer/Viewer3D.tsx` — `rebuildMemberScene`(`rebarBatches`→`createBatchMesh`, `pickableMeshes`, `userData.rowId`), `rebuildBuildingScene`(콘크리트 wireframe/solid, `userData.memberId`), `frameContent`·`startCameraTween`·`applyCameraFit`, `handleClick`, `sceneKey`, `applyClipPlane`, `memberBounds`, `MILLIMETRES_TO_SCENE`, renderer `localClippingEnabled`·material `clippingPlanes`
- `src/components/viewer/Viewer3D.test.tsx`(three 목 방식), `Viewer3D.module.css`, `src/components/viewer/palette.ts`
- `src/lib/review/joint-layout.ts`(step 1), `src/domain/review/joint.ts`(`resolveJoint`·`supportColumnIds`)

## 만들 것 (`Viewer3D.tsx`만 — 필요하면 `Viewer3D.module.css`·`palette.ts`)
- `viewerMode === 'joint'`: `resolveJoint(project, sel.memberId)`. `unsupported`면 씬을 비우고 사유 패널(기존 `viewer.unsupported.*` 스타일, 키는 step 1의 `viewer.joint.unsupported.*`)을 보인다. 사유가 `柱ではない`이고 선택이 大梁이면 「始端の柱へ」「終端の柱へ」 버튼 — `supportColumnIds(project, sel.memberId)`의 id로 `selectMember`(null이면 비활성).
- 씬: `rebuildJointScene(runtime, layout, hoverRowId)` — target 박스는 部材 뷰의 콘크리트 재질(반투명 솔리드＋에지), reference 박스는 **에지만**(솔리드 없음, `pickableMeshes`에 넣지 않는다), 철근은 `createBatchMesh`로 rowId 피킹 가능(部材 뷰와 같은 재질 풀·zone 색·하이라이트). `frameContent(runtime, layout.bounds, 'joint:' + columnMemberId)` 뒤 `controls.target`은 `layout.focusTarget × MILLIMETRES_TO_SCENE`.
- **마커**: `reviewFocus`가 있으면 두 세그먼트를 강조 재질(별도 풀 키 `reviewFocus`; 색은 `palette.ts`에 이미 있는 색 중 주 강조색과 구분되는 하나)로 다시 그리고, 두 세그먼트의 최근접점 사이에 가는 실린더 하나와 중점에 작은 구를 놓는다(최근접점은 `closestPointsBetweenSegments`(`src/lib/review/segment-distance.ts`)로 — 판정이 아니라 표시 위치 계산이므로 허용). 마커 그룹은 `content`와 별개 그룹으로 두어 씬 재구축 없이 갈아끼운다. focus 설정 시 카메라를 `startCameraTween`으로 그 점 주위(반경 = 마커 세그먼트 길이의 2배, 최소 柱 박스 최소 변의 1/4). 뷰어 루트 요소에 `data-review-focus="1"`(e2e 신호), 해제 시 속성 제거.
- **pose**: `controls.addEventListener('end', …)`에서 `setViewerPose({ position: camera.position/MILLIMETRES_TO_SCENE, target: controls.target/… })`(mm). tween 완료 시에도 한 번. **매 프레임 금지.** `requestedViewerPose`가 오면 tween 없이 즉시 적용하고 `requestViewerPose(null)`.
- `sceneKey`에 joint 모드는 `'j:' + columnMemberId + ':' + geometryKey`(部材 뷰 `geometryKey`와 같은 필드 집합을 target 부재들에 적용).
- canvas `aria-label` = `viewer.canvasJoint`.
- 툴팁(`tooltipFromHit`)은 joint 모드에서도 rowId→행 정보(기존 함수 재사용; `rowMembers`로 부재 id 표시).
- 断面カット은 joint 모드에서도 `viewerClip`(store)로 동작 — `applyClipPlane`을 그대로 씀.

## 테스트 (먼저) — `src/components/viewer/Viewer3D.test.tsx`
(a) 柱 `1F-X2Y1` 선택＋joint 모드 → `canvas[aria-label='接合部の配筋3D']`; pickable 메시의 `userData.rowId`가 전부 `lines`에 존재; reference 박스 메시는 pickable에 없다; `controls.target`이 step 1 오라클(柱 박스 중심 × MILLIMETRES_TO_SCENE)과 `toBeCloseTo`.
(b) 大梁 선택 → 사유 문구＋두 버튼, 「終端の柱へ」가 `selectMember('1F-X2Y1')`(`1F-G1-X1Y1-X` 기준).
(c) `setReviewFocus(...)` → 마커 그룹이 씬에 추가되고(실린더 1·구 1·강조 세그먼트 2), 해제 시 제거; `content` 재구축 카운트 불변; `data-review-focus` 속성 토글; 카메라 tween의 target이 focus.point × MILLIMETRES_TO_SCENE. **위치 오라클**: 테스트가 두 세그먼트(평행한 x축 세그먼트 둘, 예: y=0과 y=100)를 직접 주고, 실린더의 양 끝(월드 좌표, `getWorldPosition`＋길이·회전으로 복원하거나 실린더 생성 시 넘긴 두 점을 `userData`에 남겨 검사)이 `closestPointsBetweenSegments`의 `pa`·`pb` × MILLIMETRES_TO_SCENE과 `toBeCloseTo`, 구의 위치가 그 중점과 `toBeCloseTo`. 세그먼트를 뒤집어 주면 값이 바뀐다(고정값 통과 방지).
(d) `requestViewerPose(p)` → `camera.position`·`controls.target`이 p × MILLIMETRES_TO_SCENE, 이후 store의 `requestedViewerPose === null`.
(e) OrbitControls `end` 디스패치 → `viewerPose`가 mm로 기록(값 오라클: 목 camera.position을 정해 두고 그 /MILLIMETRES_TO_SCENE); 렌더 루프 N프레임 진행 시 `setViewerPose` 호출 수 불변.
(f) `viewerClip` 변경 → `applyClipPlane` 호출·material `clippingPlanes` 반영(기존 部材 뷰 테스트와 같은 방식).
(g) 部材·建物 모드의 기존 테스트 전부 그대로 통과.

## Acceptance Criteria
```bash
npx vitest run src/components/viewer src/lib/store.test.ts
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step2-report.json`: `{ "changed_files", "tests_added", "mutations": [①마커가 content를 재구축하게 ②pose를 매 프레임 기록 ③reference 박스를 pickable에 추가 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/components/viewer/Viewer3D.tsx", "src/components/viewer/Viewer3D.test.tsx"] }`

## 금지사항
- 部材·建物 뷰의 동작·DOM·aria-label을 바꾸지 마라.
- 접합부 판정·검사·근거를 Viewer3D 안에서 다시 쓰지 마라 — `resolveJoint`·`supportColumnIds`·`jointLayout`·`segmentFor` 호출만.
- 매 프레임 `setViewerPose`를 부르지 마라. 새 `capture()` 이벤트 금지. 새 3D 라이브러리·IFC 금지. 일본어 리터럴 이스케이프 금지.
