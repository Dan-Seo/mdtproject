# Step 4: geometry-check-xray — 접합부 한정 캡슐 최소거리 검사(干渉·あき·接触·除外·未検査)와 Calculation X-Ray 뷰모델

`phases/47-joint-review-core/README.md` 결정 3·5·8·9와 step 1·2를 전제로 한다.

## 읽어야 할 파일
- `src/lib/viewer/building.ts` — `buildingLayout(project, rebars, unsupportedMemberIds, radiusOf)`; step 2가 넣은 `rebarId`·`barIndex`·`segmentIndex`
- `src/lib/viewer/geometry.ts` — `barDiameter`(≈L116, 呼び名의 숫자＝呼び径 mm), `rebarRadius`(표시 과장 — **검사에 쓰지 않는다**), `rebarPlacements`(≈L588), `roleToLayer`
- `src/lib/export/gltf.ts` — 実寸 반경을 어떻게 넘기는지(같은 방식)
- `src/domain/model/rebar.ts` — `Rebar.length`·`count`·`placement.positionCount`·`zones`·`ruleHits`·`formula`·`splice`
- `src/domain/quantity/index.ts` — `quantityLineId`, `contributingRules`(≈L167), `ruleIdentity`(step 2 export)
- `src/components/viewer/legend.ts` — zone→rule 대응 방식(재사용)
- `src/lib/rule-source.ts` — `sourceLabel`·`sourceTooltip`(출처 문자열 형식은 여기가 유일한 출처)
- `docs/ADR.md` ADR-019(数量과 形状 분리)·ADR-022(パネルゾーン帯筋은 만들지 않는다)·ADR-040(hookTails)·`docs/RISKS.md` R12(折曲げ内法直径 미반영)

## 만들 것

### 1. `src/lib/review/segment-distance.ts` (순수)
- `closestPointsBetweenSegments(a: {from,to}, b: {from,to}): { pa: Point3; pb: Point3; distance: number }` — 표준 선분-선분 최근접점(퇴화: 점·평행 처리).
- `capsuleClearanceMm(a: Segment, b: Segment): { clearanceMm: number; pa; pb }` ＝ `distance − a.radius − b.radius`.
- 테스트: 평행·교차·엇갈림·점 퇴화·끝점 최근접 각 케이스를 손으로 계산한 값과 `toBeCloseTo(…, 9)`.

### 2. `src/lib/review/geometry-check.ts`
```ts
export const GEOMETRY_CHECK_VERSION = 1
export const NUMERICAL_TOLERANCE_MM = 1e-6   // 계산 오차. 규준 허용오차가 아니다 (주석 필수)

export interface BarRef { memberId: string; rebarId: string; role: RebarRole; size: ShearBarSize; barIndex: number; segmentIndex: number }
export type FindingKind = '干渉候補' | 'あき不足候補' | '接触'
export interface Finding {
  id: string                         // 결정적: hash(pairKey)
  kind: FindingKind
  a: BarRef; b: BarRef
  clearanceMm: number
  closestPoints: [Point3, Point3]    // 세계 mm
  midpoint: Point3
  basis: { kind: '幾何学的重なり' } | { kind: '利用者入力あき'; valueMm: number; scope: string } | { kind: '接触（許容誤差内）' }
  excludedBy: string | null          // CheckExclusion.id — 제외돼도 결과에 남는다(숨기지 않는다)
}
export interface UncheckedItem { what: string; reason: string; source: string }   // 예: {'継手位置', '表5.3.3が原文で画像 — 3Dに継手を描かない', 'ADR-019'}
export interface CheckScope { memberIds: string[]; referenceMemberIds: string[]; barCount: number; segmentCount: number; regionMm: Bounds; pairsTested: number }
export interface CheckVerdict {
  clash: '干渉候補あり' | '干渉候補なし（検査条件内）'
  clearance: 'あき不足候補あり' | 'あき不足候補なし（検査条件内）' | '判断不可（あき基準未入力）'
}
export interface CheckResult {
  checkId: string                    // hash(입력: 부재 fingerprint들 + settings + exclusions + version)
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
export function defaultExclusions(now: string): CheckExclusion[]   // 아래 2건
```
규칙:
- 형상은 `buildingLayout(project, rebars, unsupportedMemberIds, (size) => barDiameter(size) / 2)`로 만든다(実寸. glTF와 같은 경로). `jointMemberIds(joint)`에 속한 인스턴스만 검사 대상, `reference`는 대상이 아니다(결과 scope에 둘 다 기록).
- **영역 축소**: 검사 영역 ＝ 柱 콘크리트 박스(建物 뷰 `boxes`의 그 柱)를 각 축으로 「대상 철근 중 최대 径」만큼 넓힌 AABB. 이 영역과 AABB가 겹치는 세그먼트만 후보. 그 다음 세그먼트 쌍은 AABB 교차(각각 반경만큼 팽창)로 거른 뒤 `capsuleClearanceMm`. `pairsTested`에 실제 계산한 쌍 수.
- **같은 개체의 세그먼트끼리는 비교하지 않는다**(`rebarId`＋`barIndex` 동일) — 꺾인점에서의 자기 겹침은 형상이 아니다.
- 판정: `clearance < −tolerance` → `干渉候補`(basis 幾何学的重なり; 기준값 불필요). `|clearance| ≤ tolerance` → `接触`. `tolerance < clearance < settings.clearance.valueMm` → `あき不足候補`(basis 利用者入力 — settings가 null이면 이 종류는 만들지 않고 verdict.clearance가 `判断不可（あき基準未入力）`). 그 외는 결과 없음.
- **제외**: `exclusions`의 scope와 맞는 쌍(`roles` 순서 무관, `sameMemberOnly`면 같은 memberId, `memberIds`가 있으면 둘 다 그 안)은 `excludedBy`를 채우고 **verdict 집계에서 뺀다**. `defaultExclusions`는 두 건: `{ sameMemberOnly: true, roles: ['帯筋','主筋'] }`와 `{ sameMemberOnly: true, roles: ['あばら筋','上端筋'] }`·`['あばら筋','下端筋']`(후자는 한 건으로 묶지 말고 각각 — 범위가 다르다). reason 「作図規則による意図された接触 — 帯筋/あばら筋の外面をかぶり面に、主筋をその内面に接するよう配置する（src/lib/viewer/geometry.ts rebarPlacements）」. 다른 부재끼리(柱 主筋 vs 大梁 主筋)는 어떤 기본 제외도 없다.
- `unchecked` 고정 목록(전부 출처 포함): 継手位置(ADR-019·表5.3.3 화상), パネルゾーン帯筋(ADR-022 — 모델에 없음), 折曲げ内法直径・曲げ部の伸び(R12 — 꺾인점을 각으로 그림), 幅止め筋의 余長(R12), 開口補強筋(ADR-034 — 형상 없음), 上下階柱の主筋・継手との干渉(대상 밖 — reference).
- `assumptions` 고정 목록: 「呼び径＝外径（節を含む最外径ではない）」「主筋は帯筋内面に接する作図規則の位置（設計図書の段配置ではない）」「折曲げは角で描く」「継手を描かない」「大梁の交差部で上下関係を持たない（同じ高さに描く）」.
- `checkId`는 `hashString(canonicalJson({ version, memberFingerprints(대상 부재의 input+result), settings, exclusions(scope+id), regionMm }))`.
- `findings` 정렬: kind(干渉→あき→接触) → clearance 오름차순 → id.

### 3. `src/lib/review/xray.ts`
```ts
export interface RuleUse { rule: RuleHit; usedFor: ('定着' | '継手' | 'かぶり' | '割付' | '周長' | 'その他')[]; identity: string }
export interface XRayView {
  member: { id: string; kind: MemberKind; mark: string; storyName: string }
  rebar: { id: string; role: RebarRole; size: ShearBarSize; shape: RebarShape }
  quantity: { lineId: string | null; designLengthMm: number; designCount: number; places: number | null; unit: 'kg' | '箇所' | null; spliceCountPerBar: number | null }
  shape: { drawnLengthMm: number; placedCount: number; positionCount: number | null; differsFromDesign: { length: boolean; count: boolean } }
  formula: string
  rules: RuleUse[]
  zones: { kind: '定着'; ruleKey: string; fromMm: number; toMm: number; lengthMm: number; rule: RuleHit }[]
}
export function xrayForRebar(rebar: Rebar, project: Project, lines: QuantityLine[]): XRayView
export function xrayForRow(rowId: string, rebars: Rebar[], project: Project, lines: QuantityLine[]): XRayView[]  // 그 행의 대표 철근들(부재별)
export function rebarsUsingRule(rule: RuleHit, rebars: Rebar[]): Rebar[]   // ruleIdentity 일치 (key+conditions) 그리고 value 일치 — 같은 키·다른 조건은 다른 근거
```
- `drawnLengthMm` ＝ `points` polyline 길이(＋`closed`면 닫는 변 ＋`hookTails` 두 꼬리) — **数量에 쓰지 않는다**는 주석. `placedCount` ＝ `rebarPlacements(rebar, section).length`, `positionCount` ＝ `placement?.positionCount ?? null`.
- `usedFor`는 룰 키 접두로 정한다(`anchorage.*`→定着, `lap.*`·`measure.splice.*`→継手, `cover.*`→かぶり, `measure.distribution.*`→割付, `measure.hoop.*`·`measure.width-tie.*`→周長, 그 외→その他). 형상을 보고 룰을 역추측하지 않는다 — `ruleHits`와 `zones.ruleKey`에 있는 것만.
- `zones[].rule`은 `legendEntries`와 같은 방식으로 `ruleHits`에서 찾고, 없으면 throw(결함).

## 테스트 (먼저 쓴다)
- `src/lib/review/segment-distance.test.ts`: 위 케이스.
- `src/lib/review/geometry-check.test.ts` (샘플 案件, `buildTakeoff`로 rebars):
  1. **干渉候補가 실제 위치와 근거를 갖는다**: 접합부 `1F-X2Y2`(X 大梁 G1·Y 大梁 G2)에서 X방향 上端筋과 Y방향 上端筋 쌍이 `干渉候補`(둘 다 階 천장−かぶり 높이에 그려지므로 교차) — `closestPoints`가 柱 박스 안, `clearanceMm < 0`, `basis.kind === '幾何学的重なり'`, 두 `BarRef`의 memberId가 서로 다른 大梁.
  2. **충분히 떨어진 형상은 후보가 아니다**: 下端筋 X(G1, depth 750)와 Y(G2, depth 700)는 y가 다르다 — 그 쌍의 clearance를 직접 계산해 `> 0`이고, `settings.clearance = null`이면 finding에 없고 verdict.clearance가 `判断不可（あき基準未入力）`; `settings.clearance.valueMm`를 그 clearance보다 **작게** 주면 없고, **크게** 주면 `あき不足候補`로 나온다(값은 테스트가 계산한 실측에서 ±1로 정한다 — 규준값이 아니다).
  3. **정보 부족은 미검사로 남는다**: `unchecked`에 継手位置·パネルゾーン帯筋이 출처와 함께 있고, verdict에 「合格」 같은 총괄 문구가 없다(타입이 막는다 — 문자열 스냅샷으로 고정).
  4. **의도된 접촉 제외가 다른 간섭을 숨기지 않는다**: `defaultExclusions` 적용 시 帯筋↔主筋 `接触`은 `excludedBy`가 채워지고 verdict 집계에서 빠지지만, 1의 干渉候補는 그대로 남는다. exclusion을 빼면 접촉이 verdict에 잡힌다(반례). 범위를 `memberIds: ['다른 柱']`로 좁히면 이 柱의 접촉은 제외되지 않는다.
  5. **영역 축소가 결과를 바꾸지 않는다**: 영역 필터를 끄고(테스트 전용 옵션 `regionFilter: false` 또는 내부 함수 직접 호출) 돌린 findings ⊇ 켠 것의 findings이고, 켠 것에서 빠진 쌍은 전부 柱 박스 밖(둘 중 하나의 세그먼트 AABB가 영역과 안 겹침).
  6. **화면용 변환이 검사 좌표를 바꾸지 않는다**: 같은 입력을 두 번 돌리면 `checkId`·findings 동일(`toEqual`); `rebarRadius`(표시 반경)로 돌린 레이아웃과 좌표가 다르다는 것을 한 세그먼트로 확인(검사는 実寸을 쓴다).
  7. `checkId`가 settings·exclusions·대상 부재 fingerprint에 반응하고 `notes`·案件名에는 불변.
  8. 未対応 부재(지점 柱 삭제 등)는 scope에서 빠지고 `unchecked`에 「未対応部材: …」로 기록.
- `src/lib/review/xray.test.ts`: 柱 主筋 — `quantity.designLengthMm`(継手 포함) ≠ `shape.drawnLengthMm`이고 `differsFromDesign.length === true`; 帯筋 — `designCount`(1通則7)) ≠ `placedCount`(初期オフセット)인 案件을 만들어 `count: true`; `rules`의 `usedFor`가 zone 룰에 `定着`; `rebarsUsingRule(anchorage.L1 with fc24/SD345)`가 같은 조건 철근만 돌려주고 조건이 다른 행(다른 fc 断面을 추가)은 제외; 「3D 개수로 数量을 만들지 않는다」 — `xray.quantity.designCount`가 `rebar.count`와 `toBe`.

## 변이 확인
① 자기 개체 제외(`rebarId+barIndex`) 제거 ② 반경을 `rebarRadius`(표시)로 교체 ③ exclusion의 `sameMemberOnly` 무시 ④ verdict에서 `excludedBy` 있는 것도 집계.

## Acceptance Criteria
```bash
npx vitest run src/lib/review src/lib/viewer
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```
추가로 성능 단서(브라우저 아님 — 유닛 실행시간이며 응답시간이 아니라고 report에 명기): `createStressProject({xSpanCount:4, ySpanCount:3, storyCount:5})`의 중앙 柱 접합부 1곳 `runGeometryCheck` 소요 ms와 `pairsTested`를 `performance.now()`로 재서 report `perf_unit`에 적는다.

## 산출물
`step4-report.json`: `{ "changed_files", "tests_added", "mutations", "sample_findings": { "joint": "1F-X2Y2", "clash_pairs": [...], "unchecked": [...] }, "perf_unit": { "note": "vitest 실행시간, 브라우저 응답시간 아님", "stress_joint_ms": n, "pairsTested": n, "segmentCount": n }, "paths_verified": ["src/lib/review/geometry-check.ts", "src/lib/review/segment-distance.ts", "src/lib/review/xray.ts"] }`

## 금지사항
- 鉄筋のあき 기준값을 코드·룰팩에 넣지 마라. 이유: 원문 대조 없이 룰팩 행을 만들 수 없다(ADR-023); 기준은 `settings.clearance`(利用者入力)뿐이다.
- 표시 반경(`rebarRadius`)으로 검사하지 마라. 이유: 과장 반경은 화면용이다(DESIGN.md §7).
- 帯筋 접촉을 코드로 일괄 무시하지 마라 — exclusion 레코드로만, 결과에 남긴다.
- 「合格」「安全」「施工可能」 같은 총괄 판정 문자열을 만들지 마라. verdict는 위 두 축뿐이다.
- 형상을 보고 적용 룰을 역추측하지 마라. X-Ray는 `ruleHits`·`zones`만 쓴다.
- 3D 개수·polyline 길이로 `Rebar.length`·`count`·`QuantityLine`을 만들거나 덮지 마라.
- 전 건물 철근 쌍을 검사하지 마라 — 접합부 부재·영역 한정.
- `src/lib/review`에서 `src/components`·React·three를 import하지 마라. `src/domain`을 수정하지 마라(이 step은 lib만).
