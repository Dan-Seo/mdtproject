# Step 1: viewer-state-and-joint-layout — 스토어 확장, ViewerTabs 3탭, 접합부 레이아웃(순수)

README(phase 48) 공통 결정과 「샘플 案件의 사실」을 먼저 읽어라.

## 읽어야 할 파일
- `src/lib/store.ts` — `ViewerMode`('member' | 'building'), `viewerLayers`, `sel`, `hoverRowId`, `review`, `setReview`, `loadProject(project, review?)`
- `src/components/viewer/Viewer3D.tsx` — 로컬 `clip` state(옮길 대상)와 `applyClipPlane`, `MILLIMETRES_TO_SCENE`
- `src/components/viewer/ViewerTabs.tsx`·`ViewerTabs.test.tsx`
- `src/lib/viewer/building.ts` — `memberWorldPoint(project, member)`(**두 인자**), `buildingLayout(project, rebars, unsupportedMemberIds, radiusOf?)`, `RebarInstance{rebarId, barIndex, segmentIndex}`, `ConcreteBox`
- `src/lib/viewer/geometry.ts` — `rebarBatches`(`originOffsetMm`은 로컬 x만), `Segment`, `Bounds`, `rebarRadius`, `barDiameter`
- `src/domain/review/joint.ts` — `resolveJoint`·`jointMemberIds`·`jointRebarMemberIds`·`supportColumnIds`
- `src/domain/quantity/index.ts` — `quantityLineId`; `src/domain/model/project.ts` — `memberGroupKey`·`gridPoint`·`storyElevation`
- `src/domain/review/types.ts` — `ViewerPose`·`ClipState`; `src/lib/review/geometry-check.ts` — `BarRef`
- `src/lib/viewer/building.test.ts` — 帯筋 x 좌표 오라클의 선례(`offsetX + かぶり + rebarRadius('D13')`)

## 만들 것

### 1. 스토어 `src/lib/store.ts`
- `ViewerMode`에 `'joint'` 추가.
- `viewerClip: ClipState`(초기값은 Viewer3D의 현 초기값 그대로) ＋ `setViewerClip(clip)`. Viewer3D의 로컬 `clip` state를 이것으로 **이동**(동작 동일 — `uc10`의 `aria-label='断面カット'`·`切断位置` DOM 불변). 이 step에서 Viewer3D 변경은 이 이동 한 가지뿐.
- `viewerPose: ViewerPose | null`(mm) ＋ `setViewerPose(pose)`; `requestedViewerPose: ViewerPose | null` ＋ `requestViewerPose(pose | null)` — Viewer3D의 사용은 step 2.
- `reviewFocus: { point: Point3; segments: [Segment, Segment]; label: string } | null` ＋ `setReviewFocus(focus)`.
- `takeoffTab: '内訳書' | '検討' | '作業'` ＋ `setTakeoffTab`.
- `loadProject`는 `reviewFocus`·`requestedViewerPose`를 null로, `viewerMode`가 `'joint'`였으면 `'member'`로.

### 2. `src/lib/review/joint-layout.ts` (순수 — `src/components`·React·three import 금지)
```ts
export interface JointLayout {
  batches: RebarBatch[]                 // 세계 mm. rowId = quantityLineId(memberGroupKey(project, member), rebar)
  segmentRefs: BarRef[][]               // batches[i].segments[j] ↔ segmentRefs[i][j] (rebarId, barIndex, segmentIndex)
  boxes: { target: ConcreteBox[]; reference: ConcreteBox[] }
  bounds: Bounds                        // target 부재 박스 ∪ 철근
  rowMembers: Map<string, string[]>     // rowId → memberIds
  focusTarget: Point3                   // 柱 박스 중심(mm) — 카메라 target
}
export function jointLayout(project: Project, rebars: Rebar[], unsupportedMemberIds: ReadonlySet<string>, joint: Joint): JointLayout
export function segmentFor(layout: JointLayout, ref: BarRef): Segment | null   // step 2 마커용
```
- 철근: `jointRebarMemberIds(project, joint)` 중 未対応이 아닌 부재마다 그 부재에 귀속된 `Rebar[]`로 `rebarBatches(entries, section)`(로컬)를 만든 뒤 `memberWorldPoint(project, member)`(두 인자)로 세그먼트를 세계 좌표로 옮긴다. 大梁의 `originOffsetMm`은 0. 표시 반경은 `rebarRadius`(화면용) — 검사(코어)는 実寸을 따로 쓴다.
- `RebarBatch` 타입은 바꾸지 않는다 — 병렬 배열 `segmentRefs`로 대응.
- `boxes.target` ＝ `buildingLayout(project, rebars, unsupportedMemberIds).boxes` 중 `jointMemberIds`, `boxes.reference` ＝ `joint.reference.memberIds`. 나머지 부재는 포함하지 않는다.
- `focusTarget` ＝ 柱 박스 `center`.
- 未対応 부재는 철근 없이 박스만.

### 3. `ViewerTabs.tsx`: 세 번째 탭 `viewer.tab.joint` = 「接合部」. 클릭 → `setViewerMode('joint')`.

### 4. i18n 키(ja·ko): `viewer.tab.joint`, `viewer.canvasJoint`(「接合部の配筋3D」), `viewer.joint.unsupported.柱ではない`·`円形柱`·`取り付く大梁なし`·`部材なし`, `viewer.joint.toStartColumn`·`toEndColumn`, `viewer.joint.reference`(「参考表示（検討対象外）」), `viewer.joint.focus`. (step 2가 쓴다 — 여기서 추가만.)

## 테스트 (먼저)
- `src/lib/review/joint-layout.test.ts`(샘플 案件, `buildTakeoff`로 rebars):
  1. `1F-X2Y1`: batches의 rowId 전부가 `lines`의 id에 존재; `rowMembers`가 두 大梁와 柱를 가리킨다.
  2. **독립 좌표 오라클**: 柱 `1F-X2Y1` 帯筋 첫 세그먼트의 세계 x ＝ `gridPoint(grid, 1, 0).x − b/2 ＋ かぶり ＋ rebarRadius('D13')`, z도 같은 식. かぶり는 `building.test.ts`가 쓰는 방법(룰팩 조회를 테스트가 직접)으로 얻는다. 大梁 `1F-G1-X1Y1-X` 上端筋의 세계 y ＝ 階 標高 ＋ 階高 − かぶり − あばら筋径 − rebarRadius('D25') — building.ts 大梁 분기와 별개로 테스트가 직접 계산한다(그 식이 building.ts와 다르면 building.ts가 아니라 테스트 식을 의심하고 report에 적는다. 조용히 building.ts의 결과를 오라클로 바꾸지 마라).
  3. `buildingLayout(project, rebars, ∅, rebarRadius)`의 같은 (rebarId, barIndex, segmentIndex) 인스턴스와 `from`·`to` 일치(공통 helper 확인 — 2와 함께 써야 의미가 있다).
  4. `1F-X1Y3`: 런 대표 `1F-G1-X1Y1-Y`의 上端筋 배치가 batches에 있다.
  5. reference 박스에 `2F-X2Y1`과 런 동료가 있고 target에는 없다; 다른 階 부재·`1F-X1Y3` 같은 무관 柱는 어느 목록에도 없다.
  6. `segmentFor(layout, ref)`가 검사 결과(`runGeometryCheck`)의 첫 干渉候補 `a`·`b`로 세그먼트를 찾고, 없는 ref는 null.
  7. `focusTarget`이 柱 박스 중심 ＝ `[gridPoint.x, storyElevation + story.height/2, gridPoint.y]`(테스트가 직접 계산).
  8. `bounds`: 테스트가 target 박스 8꼭짓점과 모든 batch 세그먼트 `from`·`to`의 min/max를 직접 계산해 `toEqual`(합집합이어야 한다 — 박스만·철근만이면 실패). reference 박스는 bounds에 들어가지 않는다(reference 박스 하나가 bounds 밖에 있는 접합부 `1F-X2Y1`의 `2F-X2Y1`로 확인).
- `src/lib/store.test.ts`: `setViewerClip`·`setViewerPose`·`requestViewerPose`·`setReviewFocus`·`setTakeoffTab`이 `project`·`review` 참조를 바꾸지 않는다; `loadProject`가 focus·requested를 비우고 joint 모드를 member로 되돌린다.
- `src/components/viewer/Viewer3D.test.tsx`: 断面カット 컨트롤이 store를 통해 동작하고 DOM aria-label 불변(기존 테스트가 있으면 그대로 통과).
- `src/components/viewer/ViewerTabs.test.tsx`: 탭 3개, 세 번째가 `setViewerMode('joint')`.

## Acceptance Criteria
```bash
npx vitest run src/lib/review src/lib/store.test.ts src/components/viewer
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

## 산출물
`step1-report.json`: `{ "changed_files", "tests_added", "mutations": [①joint-layout에서 런 대표 제외 ②帯筋 세계 x에서 かぶり 누락 ③loadProject가 focus를 남김 — 각각 어느 테스트가 실패했는지], "paths_verified": ["src/lib/review/joint-layout.ts", "src/lib/review/joint-layout.test.ts", "src/lib/store.ts", "src/components/viewer/ViewerTabs.tsx"] }`

## 금지사항
- 部材·建物 뷰의 동작·DOM·aria-label을 바꾸지 마라(clip state 이동은 동작 동일). 이유: uc9·uc10·uc17 회귀.
- `buildingLayout`·`rebarBatches`·`memberWorldPoint`의 시그니처·출력을 바꾸지 마라. `supportColumnIds`를 새로 만들지 마라(있다).
- 새 `capture()` 이벤트 금지. 새 3D 라이브러리 금지. 일본어 리터럴 이스케이프 금지.
