# Step 5: geometry-check — 접합부 한정 캡슐 최소거리 검사(干渉·あき·接触·除外·未検査·検査対象なし)

README 결정 3·8·9·10, 「샘플 案件의 사실」, step 1·3을 전제로 한다.

## 읽어야 할 파일
- `src/lib/viewer/building.ts` — `buildingLayout(project, rebars, unsupportedMemberIds, radiusOf)`; step 3이 넣은 `rebarId`·`barIndex`·`segmentIndex`; 柱 박스(`boxes`)
- `src/lib/viewer/geometry.ts` — `barDiameter`(≈L116, 呼び名의 숫자＝呼び径 mm), `rebarRadius`(표시 과장 — **검사에 쓰지 않는다**), `rebarPlacements`(≈L588; 帯筋 inset r_hoop, 主筋 inset 2r_hoop＋r_main → 帯筋 직선변과 인접 主筋은 정확히 接触), `roleToLayer`
- `src/lib/export/gltf.ts` — 実寸 반경을 어떻게 넘기는지(같은 방식)
- `src/domain/rebar/girder.ts`(≈L997·1006 上端筋·下端筋 높이: かぶり＋あばら筋径＋主筋 반경)·`girder-ends.ts`(折曲げ 꼬리는 수직으로 올라가며 柱 박스 상단을 넘을 수 있다 — 반증 4(d))
- `docs/ADR.md` ADR-019·ADR-022·ADR-040·`docs/RISKS.md` R12

## 만들 것

### 1. `src/lib/review/segment-distance.ts` (순수)
- `closestPointsBetweenSegments(a: {from,to}, b: {from,to}): { pa: Point3; pb: Point3; distance: number }` — 표준 선분-선분 최근접점(퇴화: 점·평행 처리).
- `capsuleClearanceMm(a: Segment, b: Segment): { clearanceMm: number; pa; pb }` ＝ `distance − a.radius − b.radius`.
- 테스트: 평행·교차·엇갈림·점 퇴화·끝점 최근접 각 케이스를 **손으로 계산한 값**(유도를 주석에)과 `toBeCloseTo(…, 9)`.

### 2. `src/lib/review/geometry-check.ts`
```ts
export const GEOMETRY_CHECK_VERSION = 1
export const NUMERICAL_TOLERANCE_MM = 1e-6   // 부동소수 계산 오차. 규준·시공 허용오차가 아니다 (주석 필수)

export interface BarRef { memberId: string; rebarId: string; role: RebarRole; size: ShearBarSize; barIndex: number; segmentIndex: number }
export type FindingKind = '干渉候補' | 'あき不足候補' | '接触'      // types.ts의 것을 re-export
export interface Finding {
  id: string                         // 결정적: hash(a·b BarRef)
  kind: FindingKind
  a: BarRef; b: BarRef
  clearanceMm: number
  closestPoints: [Point3, Point3]    // 세계 mm
  midpoint: Point3
  basis: { kind: '幾何学的重なり' } | { kind: '利用者入力あき'; valueMm: number; scope: string } | { kind: '接触（許容誤差内）' }
  excludedBy: string | null          // CheckExclusion.id — 제외돼도 결과에 남는다(숨기지 않는다)
}
export interface UncheckedItem { what: string; reason: string; source: string }   // 예: {'継手位置', '表5.3.3が原文で画像 — 3Dに継手を描かない', 'ADR-019'}
export interface CheckScope {
  memberIds: string[]; rebarMemberIds: string[]; referenceMemberIds: string[]; unsupportedMemberIds: string[]
  barCount: number; segmentCount: number
  regionMm: { x: [number, number]; y: [number, number]; z: [number, number] }   // XY는 柱 평면 범위±최대径, Z는 후보 세그먼트 전체 범위(정보)
  pairsTested: number
  droppedOutsideRegion: number       // 최근접점 중점이 XY 영역 밖이라 버린 쌍 수
}
export type AxisVerdict<Yes extends string, No extends string> = Yes | No | '検査対象なし'
export interface CheckVerdict {
  clash: AxisVerdict<'干渉候補あり', '干渉候補なし（検査条件内）'>
  clearance: AxisVerdict<'あき不足候補あり', 'あき不足候補なし（検査条件内）'> | '判断不可（あき基準未入力）'
  contact: AxisVerdict<'接触あり', '接触なし（検査条件内）'>
  excludedCounts: Record<FindingKind, number>   // 除外로 집계에서 뺀 수 — 숨기지 않는다
}
export interface CheckResult {
  checkId: string                    // hash(대상 부재 fingerprint들 + checkConditions + version + regionMm)
  version: number
  jointRef: { columnMemberId: string }
  scope: CheckScope
  verdict: CheckVerdict
  findings: Finding[]                // 제외된 것 포함, excludedBy로 구분
  unchecked: UncheckedItem[]
  assumptions: string[]              // 아래 고정 목록
  toleranceMm: number
}
export interface CheckInput {
  project: Project
  rebars: Rebar[]
  unsupportedMemberIds: ReadonlySet<string>
  joint: Joint
  settings: { clearance: ClearanceBasis | null }
  exclusions: CheckExclusion[]
  fingerprints: ReviewFingerprints
}
export function runGeometryCheck(input: CheckInput): CheckResult
export function exclusionMatches(exclusion: CheckExclusion, kind: FindingKind, a: BarRef, b: BarRef): boolean   // 단독 테스트 대상
export function defaultExclusions(now: string): CheckExclusion[]   // 아래 3건
```
규칙:
- 형상은 `buildingLayout(project, rebars, unsupportedMemberIds, (size) => barDiameter(size) / 2)`로 만든다(実寸. glTF와 같은 경로). `jointRebarMemberIds(project, joint)`에 속한 인스턴스(`instance.memberId`)만 검사 대상 — 通し筋은 런 대표 부재에 귀속되므로 `jointMemberIds`로 거르면 대표가 아닌 접합 大梁의 主筋이 빠진다. `reference`는 대상이 아니다. 未対応 부재는 대상에서 빠지고 `scope.unsupportedMemberIds`·`unchecked`에 「未対応部材: …」로 남는다.
- **영역**: XY ＝ 柱 콘크리트 박스의 평면 범위를 「대상 철근 중 최대 径」만큼 넓힌 사각형. Z는 제한하지 않는다(折曲げ 꼬리가 柱 박스 상단을 넘는다 — 반증 4(d)). 후보 ＝ XY-AABB가 이 사각형과 겹치는 세그먼트. 계산 후 **최근접점 중점의 XY가 사각형 밖이면 버리고** `droppedOutsideRegion`에 센다(通し筋끼리 柱에서 먼 곳의 간섭을 접합부 결과로 내지 않는다).
- **쌍 후보(broad phase)**: 각 세그먼트 AABB를 `radius + max(NUMERICAL_TOLERANCE_MM, settings.clearance?.valueMm ?? 0)`만큼 팽창해 겹치는 쌍만 `capsuleClearanceMm`. (반경만 팽창하면 양의 あき 후보가 탈락한다 — 반증 4(d).) `pairsTested`에 실제 계산한 쌍 수.
- **같은 개체의 세그먼트끼리는 비교하지 않는다**(`rebarId`＋`barIndex` 동일) — 꺾인점에서의 자기 겹침은 형상이 아니다.
- 판정: `clearance < −tolerance` → `干渉候補`(basis 幾何学的重なり; 기준값 불필요). `|clearance| ≤ tolerance` → `接触`. `tolerance < clearance < settings.clearance.valueMm` → `あき不足候補`(basis 利用者入力 — settings가 null이면 이 종류는 만들지 않고 verdict.clearance가 `判断不可（あき基準未入力）`). 그 외는 결과 없음.
- **제외**: `exclusionMatches` — `kind ∈ scope.kinds`이고 `roles` 순서 무관 일치이고 (`sameMemberOnly`면 같은 memberId) 이고 (`memberIds`가 있으면 둘 다 그 안). 맞는 finding은 `excludedBy`를 채우고 **verdict 집계에서 빼며 `excludedCounts`에 센다**. `defaultExclusions`는 **세 건**, 전부 `kinds: ['接触']`·`sameMemberOnly: true`: `['帯筋','主筋']`, `['あばら筋','上端筋']`, `['あばら筋','下端筋']`. reason 「作図規則による意図された接触 — 帯筋/あばら筋の外面をかぶり面に、主筋をその内面に接するよう配置する（src/lib/viewer/geometry.ts rebarPlacements）」. 干渉候補·あき不足候補는 기본 제외가 없고, 다른 부재끼리(柱 主筋 vs 大梁 主筋)도 없다.
- **verdict**: 대상 철근이 없거나 `pairsTested === 0`이면 세 축 전부 `検査対象なし`(「なし（検査条件内）」와 구분 — 완료 조건 (3)).
- `unchecked` 고정 목록(전부 출처 포함): 継手位置(ADR-019·表5.3.3 화상), パネルゾーン帯筋(ADR-022 — 모델에 없음; `hoopSpan = story.height − beamDepthAbove`), 折曲げ内法直径・曲げ部の伸び(R12 — 꺾인점을 각으로 그림), 幅止め筋의 余長(R12), 開口補強筋(ADR-034 — 형상 없음), 上下階柱の主筋・継手との干渉(대상 밖 — reference), 그리고 未対応 부재.
- `assumptions` 고정 목록: 「呼び径＝外径（節を含む最外径ではない）」「主筋は帯筋内面に接する作図規則の位置（設計図書の段配置ではない）」「折曲げは角で描く」「継手を描かない」「大梁の交差部で上下関係を持たない（同じ高さに描く）」.
- `checkId` ＝ `hashString(canonicalJson({ version, members: 대상 부재(rebarMemberIds)의 {input,result}, checkConditions: checkConditionsFingerprint(settings, exclusions), regionMm }))`.
- `findings` 정렬: kind(干渉→あき→接触) → clearance 오름차순 → id.

## 테스트 (먼저 쓴다)
- `src/lib/review/segment-distance.test.ts`: 위 케이스.
- `src/lib/review/geometry-check.test.ts` (샘플 案件, `buildTakeoff`로 rebars). 기대값은 입력에서 유도한다 — 유도식을 테스트 주석에 쓴다:
  1. **干渉候補가 실제 위치와 근거를 갖는다**: 접합부 **`1F-X2Y1`**(X 大梁 G1 終端·Y 大梁 G2 始端). 上端筋 높이 ＝ 階 천장 − かぶり − あばら筋径 − 主筋 반경: G1(D25, あばら筋 D13) vs G2(D22, D13)는 1.5mm 차, 반경 합 23.5 → 수평 직선 세그먼트끼리 clearance ＝ 1.5 − 23.5 ＝ **−22**. `干渉候補` finding이 있고 `closestPoints`의 XY가 柱 평면 범위 안, `clearanceMm`가 `toBeCloseTo(-22, 6)`, `basis.kind === '幾何学的重なり'`, 두 `BarRef`의 memberId가 서로 다른 大梁. (같은 유도로 `1F-X2Y2`의 G2/G2 上端筋도 −22.)
  2. **충분히 떨어진 형상은 후보가 아니다**: 같은 접합부의 **下端筋 수평 직선 세그먼트** G1(せい 750) vs G2(せい 700): 높이 차 ＝ 50 − 1.5 ＝ 48.5, clearance ＝ 48.5 − 23.5 ＝ **25**. `settings.clearance = null`이면 그 세그먼트 쌍의 finding이 없고 verdict.clearance가 `判断不可（あき基準未入力）`; `valueMm: 24` → 없음(경계 아래); `valueMm: 26` → 그 쌍이 `あき不足候補`로 `clearanceMm ≈ 25`. 折曲げ 꼬리 세그먼트는 다른 세그먼트 쌍이므로 이 판정과 섞지 않는다(찾을 때 `segmentIndex`로 수평 세그먼트를 지정).
  3. **정보 부족은 미검사로 남는다**: `unchecked`에 継手位置·パネルゾーン帯筋이 출처와 함께 있고, verdict에 「合格」 같은 총괄 문구가 없다(타입이 막는다 — 문자열 스냅샷으로 고정).
  4. **의도된 접촉 제외가 다른 간섭을 숨기지 않는다**: `defaultExclusions` 적용 시 柱 帯筋↔主筋 `接触`(clearance 0 — inset 규칙)은 `excludedBy`가 채워지고 `verdict.contact`는 `接触なし（検査条件内）`이지만 `excludedCounts.接触 > 0`이며, 1의 干渉候補는 그대로 남는다. exclusion을 빼면 `verdict.contact === '接触あり'`(반례). `kinds: ['干渉候補']`로 바꾼 제외는 접촉을 제외하지 않는다. 범위를 `memberIds: ['다른 柱']`로 좁히면 이 柱의 접촉은 제외되지 않는다.
  5. `exclusionMatches` 단독: 같은 roles 쌍·다른 memberId·`sameMemberOnly: true` → false; `sameMemberOnly: false` → true; roles 순서 뒤집어도 true; kind 불일치 → false.
  6. **영역·broad phase가 결과를 바꾸지 않는다**: 후보 축소를 끄고(테스트 전용 옵션 `narrowing: false` 또는 내부 함수 직접 호출) 돌린 결과(XY 영역 안 중점만 남긴 것)와 켠 것의 findings가 `toEqual`.
  7. **화면용 변환이 검사 좌표를 바꾸지 않는다**: 같은 입력을 두 번 돌리면 `checkId`·findings 동일(`toEqual`); `rebarRadius`(표시 반경)로 만든 레이아웃의 같은 세그먼트 `radius`가 検査 레이아웃과 다르다(검사는 実寸).
  8. `checkId`가 settings·exclusions scope·대상 부재 fingerprint에 반응하고 `notes`·案件名·exclusion `reason`에는 불변.
  9. 未対応 부재(지점 柱 삭제 등)는 scope에서 빠지고 `unchecked`에 기록; 대상 大梁가 전부 未対応이고 柱만 남아 쌍이 없으면 verdict 세 축 `検査対象なし`.
  10. `1F-X1Y3`(런 終端)에서 Y 大梁 上端筋(런 대표 `1F-G1-X1Y1-Y` 귀속) 세그먼트가 검사 대상에 들어온다(`scope.rebarMemberIds`에 대표 포함, 그 철근의 finding 또는 `barCount` 기여).

## 변이 확인
① 자기 개체 제외(`rebarId+barIndex`) 제거 ② 반경을 `rebarRadius`(표시)로 교체 ③ `exclusionMatches`의 `sameMemberOnly` 무시(→ 테스트 5) ④ broad phase 팽창에서 `valueMm` 제거(→ 테스트 2의 26mm 케이스).

## Acceptance Criteria
```bash
npx vitest run src/lib/review src/lib/viewer
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```
추가로 성능 단서(브라우저 아님 — 유닛 실행시간이며 응답시간이 아니라고 report에 명기): `createStressProject({xSpanCount:4, ySpanCount:3, storyCount:5})`의 중앙 柱 접합부 1곳 `runGeometryCheck` 소요 ms와 `pairsTested`·`segmentCount`를 `performance.now()`로 재서 report `perf_unit`에 적는다.

## 산출물
`step5-report.json`: `{ "changed_files", "tests_added", "mutations", "sample_findings": { "joint": "1F-X2Y1", "clash_pairs": [...], "clearance_pair_mm": 25, "unchecked": [...] }, "perf_unit": { "note": "vitest 실행시간, 브라우저 응답시간 아님", "stress_joint_ms": n, "pairsTested": n, "segmentCount": n }, "paths_verified": ["src/lib/review/geometry-check.ts", "src/lib/review/segment-distance.ts"] }`

## 금지사항
- 鉄筋のあき 기준값을 코드·룰팩에 넣지 마라. 이유: 원문 대조 없이 룰팩 행을 만들 수 없다(ADR-023); 기준은 `settings.clearance`(利用者入力)뿐이다. 테스트의 24·26은 샘플 입력에서 유도한 경계값이지 규준값이 아니다(주석에).
- 표시 반경(`rebarRadius`)으로 검사하지 마라. 이유: 과장 반경은 화면용이다(DESIGN.md §7).
- 帯筋 접촉을 코드로 일괄 무시하지 마라 — exclusion 레코드로만, 결과에 남긴다.
- 「合格」「安全」「施工可能」 같은 총괄 판정 문자열을 만들지 마라. verdict는 위 세 축뿐이다.
- 3D 개수·polyline 길이로 `Rebar.length`·`count`·`QuantityLine`을 만들거나 덮지 마라.
- 전 건물 철근 쌍을 검사하지 마라 — 접합부 부재·영역 한정.
- `src/lib/review`에서 `src/components`·React·three를 import하지 마라. `src/domain`을 수정하지 마라(이 step은 lib만).
