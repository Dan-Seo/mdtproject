# Step 3: joint-and-fingerprint — 접합부 판정·의존관계(읽는 필드 단위)·fingerprint, 3D 개체 식별과 부재→세계좌표 변환 추출

README의 공통 결정을 먼저 읽어라. 특히 결정 6(의존관계는 실제 산정 함수, fingerprint는 그 함수가 읽는 필드만)과 「샘플 案件의 사실」.

## 읽어야 할 파일
- `src/domain/model/project.ts` — `touchesColumn`(≈L512, private `(GirderPosition, ColumnPosition): boolean`, 階 비교는 호출자 몫)·`girderSupportSections`(≈L548, `{start, end}: ColumnSection` 반환 — 부재 id는 돌려주지 않는다)·`supportColumnSection`(≈L566, 같은 階·격자점의 柱)·`girderRun`(≈L1378; 연속 조건은 같은 断面 id·같은 階·인접)·`columnEnds`(≈L1480; 上下階 柱의 **존재**만 읽는다)·`beamDepthAbove`(≈L1512; 접속 大梁의 `depth`만 읽는다)·`MemberUnsupportedError`
- `src/domain/rebar/girder-ends.ts`·`src/domain/rebar/girder.ts` — 支持柱 断面에서 실제로 읽는 필드(`b`/`d`·`shape`; 定着 수용·面 오프셋)
- `src/domain/model/member.ts` — `ColumnSection.shape`(円形은 이번 접합부 범위 밖), `Member.position` 판별은 항상 `kind`로
- `src/domain/model/rebar.ts` — `Rebar` 필드 전부
- `src/domain/rules/types.ts` — `RuleEntry`·`RulePack`·`RuleSource`(edition·url 포함); `src/rulepack/index.ts` — `jpMlitRulePack`
- `src/domain/quantity/index.ts` — `ruleIdentity`(≈L150, key＋정렬된 conditions, private) — export해서 재사용
- `src/lib/viewer/geometry.ts` — `Segment`(≈L23), `rebarSegmentRuns`(≈L963, `placements.flatMap`가 개체를 펼친다), private `clipSegment`(≈L917; 조각 객체를 930·940행에서 다시 만든다 — 필드 보존 주의)와 public `clipSegments`(≈L955), `rebarSegments`, `rebarBatches`
- `src/lib/viewer/building.ts` — `RebarInstance`(≈L49), `buildingLayout`(≈L120; 柱 `worldPoint` ≈L311, 大梁 ≈L347~358, 床板 ≈L367~395(`slabBay`·`cantileverSlabGeometry`로 원점; role은 `openings` 계산에만 쓰인다), 耐震壁)
- `src/lib/export/gltf.ts` — `RebarInstance` 소비자(필드 추가에 무영향인지 확인)
- 테스트 스타일: `src/domain/model/project.test.ts`, `src/lib/viewer/building.test.ts`, `src/lib/viewer/geometry.test.ts`, `src/lib/hooks/useTakeoff.test.tsx`(부분 案件 만드는 법)

## 만들 것

### 1. `src/domain/review/joint.ts` — 접합부 판정 (순수)
```ts
export interface JointGirder { member: Member; section: GirderSection; end: '始端' | '終端' }  // 柱가 그 大梁의 어느 끝인가
export interface Joint {
  columnMemberId: string
  column: { member: Member; section: ColumnSection; story: Story }
  girders: JointGirder[]                 // 같은 階, touchesColumn 관계. 축·index 오름차순
  /** 참고 표시 대상: 上下階의 같은 격자점 柱, 各 大梁의 런 동료 (girderRun.members − jointMemberIds) */
  reference: { memberIds: string[] }
}
export type JointResolution =
  | { status: 'joint'; joint: Joint }
  | { status: 'unsupported'; reason: '柱ではない' | '円形柱' | '取り付く大梁なし' | '部材なし' }
export function resolveJoint(project: Project, columnMemberId: string): JointResolution
export function jointMemberIds(joint: Joint): string[]   // 柱 + girders (reference 제외)
/**
 * 접합부에 **철근이 지나가는** 부재 id ＝ jointMemberIds ∪ 각 大梁 런의 대표(`girderRun(...).ownerId`).
 * 通し筋·カットオフ筋은 런 대표 부재에 귀속되므로(`generateMain`의 `memberId: run.ownerId`),
 * 접합부 大梁가 대표가 아니면 그 主筋의 `Rebar.memberId`는 접합부 밖 부재다 — 이 목록으로 걸러야 빠지지 않는다.
 * `girderRun`이 throw(支持柱なし)하면 그 大梁는 자기 id만.
 */
export function jointRebarMemberIds(project: Project, joint: Joint): string[]
/** 大梁의 始端·終端 지점 柱 부재 id (위치·階로). 없으면 null — phase 48의 「柱へ」 이동에 쓴다 */
export function supportColumnIds(project: Project, girderMemberId: string): { start: string | null; end: string | null }
```
- 판정은 **위치와 階**로 한다: `candidate.kind === '大梁' && candidate.storyId === column.storyId && touchesColumn(candidate.position, column.position)`. `touchesColumn`은 `project.ts`의 private 함수다 — **export해서 재사용**하고 복사하지 마라. 大梁가 `MemberUnsupportedError`(支持柱なし 등)인지는 여기서 판정하지 않는다(그건 `buildTakeoff`의 결과이고 step 5가 `unsupportedMemberIds`로 받는다).
- `円形柱`는 `unsupported`로 명시한다(첫 지원 대상은 矩形 柱). 大梁가 하나도 없으면 `取り付く大梁なし`.
- `reference.memberIds`: `columnEnds`와 같은 방식으로 `stories` 순서 ±1 階의 같은 `ix,iy` 柱, 그리고 각 大梁의 `girderRun(project, girder).members`에서 **jointMemberIds에 없는 것**. `girderRun`이 throw하면 그 大梁의 동료는 비운다 — throw를 밖으로 내지 마라.

### 2. `src/domain/review/dependency.ts` — 산정 의존관계 (순수)
```ts
export type DependencyVia = '支持柱' | '上部大梁' | '連続スパン' | '上下階柱'
/** reads: 그 의존에서 산정 함수가 실제로 읽는 값 — fingerprint는 이것만 해시한다 */
export type Dependency =
  | { memberId: string; via: '支持柱';   detail: string; reads: { shape: string; b: number; d: number } }     // girderSupportSections → 定着 수용·面 오프셋
  | { memberId: string; via: '上部大梁'; detail: string; reads: { depth: number } }                            // beamDepthAbove
  | { memberId: string; via: '連続スパン'; detail: string; reads: { sectionId: string; position: GirderPosition } }  // girderRun 연속 조건·스팬
  | { memberId: string; via: '上下階柱'; detail: string; reads: { exists: true } }                              // columnEnds
export type DependencyResolution =
  | { status: 'tracked'; dependencies: Dependency[]; missing: { via: DependencyVia; detail: string }[] }   // missing: 「始端 支持柱なし」
  | { status: 'untracked'; reason: '依存経路未追跡（耐震壁・床板）' }
export function memberDependencies(project: Project, memberId: string): DependencyResolution
```
- 大梁: `girderRun`의 모든 런 부재(자신 제외, via 連続スパン) ＋ 런의 각 스팬 지점 柱(via 支持柱; `supportColumnIds`로 부재 id). `girderRun`/`girderSupportSections`가 `MemberUnsupportedError`를 던지면 얻은 것까지만 담고 `missing`에 「始端 支持柱なし」처럼 남긴다(throw 금지). 다른 Error는 그대로 던진다.
- 柱: 같은 階의 `touchesColumn` 大梁(via 上部大梁, `reads.depth`) ＋ 上下階의 같은 격자점 柱(via 上下階柱, 존재만).
- 耐震壁·床板: `untracked`. 조용히 빈 배열을 주지 마라 — 「영향 없음」과 「추적 안 함」은 다른 사실이다.
- `reads`에 넣는 필드가 실제 산정 함수가 읽는 필드와 같다는 것을 **테스트로 고정**한다(아래).

### 3. `src/domain/review/fingerprint.ts` (순수)
- `canonicalJson(value: unknown): string` — 객체 키를 재귀적으로 정렬. `undefined` 값 키는 생략(JSON.stringify와 같게).
- `hashString(text: string): string` — 결정적 문자열 해시(예: cyrb53 또는 FNV-1a 두 번). 16진 문자열. **암호 해시가 아님**을 주석에. 해시 상수는 규준값이 아니다(README 결정 8).
- `rulepackFingerprint(pack: RulePack): string` — 각 entry의 `{key, conditions, value, unit, confidence, source}`(**`source` 객체 전체** — doc·edition·url·page·section 등 있는 것 전부)를 `ruleIdentity` 순으로 정렬해 해시. `note`·`label`은 넣지 않는다(표시 문구 변경은 근거 변경이 아니다).
- `checkConditionsFingerprint(settings: { clearance: ClearanceBasis | null }, exclusions: CheckExclusion[]): string` — `{ clearance: clearance ? { valueMm, scope } : null, exclusions: exclusions.map(e => e.scope) (canonical 정렬) }` 해시. `enteredAt`·`note`·`reason`·`id`는 넣지 않는다.
- `memberInputs(project, memberId): unknown` — 그 부재의 산정 입력을 **한 객체**로: `{ member(kind·storyId·position·sectionId·openings), section(전체), story: {id,name,height}, gridSpansAround, dependencies: [{memberId, via, reads}] | 'untracked', missing }`. `gridSpansAround`는 그 부재가 걸친 通り芯 스팬 값(柱면 인접 스팬 4개 이하, 大梁면 자기 스팬). **의존 부재의 断面 전체를 넣지 마라** — `reads`만.
- `memberInputFingerprint(project, memberId): string` ＝ `hashString(canonicalJson(memberInputs(...)))`.
- `memberResultFingerprint(memberId: string, rebars: Rebar[]): string` — `rebar.memberId === memberId`인 것만 골라 id 순 정렬 후 `{id, role, size, shape, points, closed, hookTails, length, count, placement, axisOffsetsMm, axisSlotStart, zones, splice:{method,countPerBar,lengthMm}, ruleHits:[{key,conditions,value,unit,confidence}]}`를 해시. `formula`는 넣지 않는다(문구). 귀속 철근이 0개인 정상 부재(런 동료의 主筋은 대표에 귀속)는 빈 배열의 해시다 — null이 아니다(null은 未対応).
- `projectFingerprints(project, rebars, unsupportedMemberIds, pack, checkVersion, checkConditions: string | null): ReviewFingerprints` — 전 부재. 未対応 부재는 `result: null`.

### 4. 3D 개체 식별 — `src/lib/viewer/geometry.ts`·`building.ts`
- `Segment`에 선택 필드 `barIndex?: number`(같은 `Rebar`의 몇 번째 배치 개체인가 — `rebarPlacements` 순서)와 `hookTail?: boolean`을 싣는다. `rebarSegmentRuns`의 `placements.flatMap((offset, barIndex) => …)`에서 넣고, `clipSegment`가 조각을 다시 만들 때(930·940행) **보존**한다.
- `RebarInstance`에 `rebarId: string`·`barIndex: number`·`segmentIndex: number`(그 개체 안 순번)를 추가. `buildingLayout`의 인스턴스 push에서 채운다. glTF 노드명 등 기존 출력은 불변(테스트로 고정).
- `memberWorldPoint(project: Project, member: Member): (point: Point3) => Point3`를 `building.ts`에서 **export**로 추출한다 — 현재 `buildingLayout` 안의 `worldPoint` 클로저 4분기(柱·大梁·床板·耐震壁)를 그대로 옮기고 `buildingLayout`이 그것을 호출하게. 床板의 `openings` 계산은 `buildingLayout`에 남긴다(변환 함수는 role에 의존하지 않는다). 추출 전후 `buildingLayout` 출력이 같아야 한다(아래 픽스처).

## 테스트 (먼저 쓴다)
- `src/domain/review/joint.test.ts`(샘플 案件 — README 「샘플 案件의 사실」): `1F-X1Y1`(大梁 2개, 둘 다 始端)·`1F-X2Y1`(G1 X 終端·G2 Y 始端)·`1F-X2Y2`(大梁 3개 전부 G2, 始端/終端 혼재; Y 런 대표 `1F-G2-X2Y1-Y`가 jointMemberIds에 있으므로 reference에 없다)·`2F-X1Y1`(위층 없음 → reference에 1F 柱만); **`1F-X1Y3`**(Y 런 終端 — 접합 大梁 `1F-G1-X1Y2-Y`의 런 대표 `1F-G1-X1Y1-Y`는 `jointMemberIds`에 없고 `jointRebarMemberIds`·`reference`에 있다; 그 대표에 귀속된 `上端筋` Rebar의 memberId가 전자에 포함됨을 `buildTakeoff`로 확인); `supportColumnIds('1F-G1-X1Y1-X') === { start: '1F-X1Y1', end: '1F-X2Y1' }`; 大梁를 선택하면 `柱ではない`; `shape: '円形'` 断面이면 `円形柱`; 大梁를 전부 지운 柱면 `取り付く大梁なし`; 격자에 가까이 있어도 **다른 階**의 大梁는 들어가지 않는다(반례).
- `src/domain/review/dependency.test.ts`: 大梁 `1F-G1-X1Y1-X`의 의존에 始端·終端 柱가 via 支持柱로 `reads: {shape,b,d}`; Y 런 `1F-G1-X1Y1-Y`의 의존에 런 동료 `1F-G1-X1Y2-Y`(reads sectionId·position)와 柱 3개; 柱 `1F-X2Y2`의 의존에 上部大梁 **3개**(`reads: {depth}`)와 2F 柱(`exists`); 耐震壁·床板은 `untracked`; 支持柱를 지운 大梁는 throw 없이 `missing`에 支持柱なし. **읽는 필드 고정**: 柱 断面 `b`만 바꾼 案件에서 大梁 의존의 `reads.b`가 바뀌고, 柱 `mainBar` 본수만 바꾼 案件에서는 `reads`가 불변(그리고 그 大梁의 `buildTakeoff` 결과도 불변 — 산정이 그 필드를 읽지 않는다는 근거).
- `src/domain/review/fingerprint.test.ts`: `canonicalJson` 키 순서 무관; `rulepackFingerprint`가 `note` 변경에 불변·`value`·`source.url` 변경에 가변; `checkConditionsFingerprint`가 `valueMm`·exclusion scope 변경에 가변, `enteredAt`·`reason` 변경에 불변; 柱 断面 `b`를 바꾸면 그 柱와 **인접 大梁**의 input fingerprint가 바뀌고 반대편 격자의 大梁·다른 階는 불변; **`section-G2.stirrup.pitch` 변경은 柱 input을 바꾸지 않는다**(柱는 depth만 읽는다) — G2 大梁의 result만 바뀐다; `unitMass`·`notes`·`xLabels`·案件名 변경은 어떤 부재 fingerprint도 바꾸지 않는다; 帯筋 피치 변경은 柱 result 변경·大梁 result 불변; 런 동료의 断面 id 변경이 대표 부재 input에 반영(런이 끊긴다).
- `src/lib/viewer/building.test.ts`·`geometry.test.ts`: `barIndex`가 배치 수만큼 0..n-1로 나오고 開口 clip 뒤에도 유지; `memberWorldPoint` 추출 전후 동일 — 추출 **전에** 샘플·스트레스 案件의 `buildingLayout` 결과를 **기존 필드로 투영한**(`from`·`to`·`radius`·`memberId`·`rowId`… 새 필드 제외) JSON을 픽스처 `tests/fixtures/viewer/building-layout-sample.json`에 저장하고(크면 해시만), 추출 후 같은 투영이 `toEqual`; 새 필드(`rebarId`·`barIndex`·`segmentIndex`)는 별도 검사.
- `src/lib/export/gltf.test.ts`: 기존 통과.

## 변이 확인 (report `mutations`)
① `resolveJoint`의 `storyId` 비교 제거 ② `memberInputs`에서 `dependencies` 제거 ③ `clipSegment`에서 `barIndex` 전파 제거 ④ `memberInputs`의 上部大梁 `reads`를 断面 전체로 교체(→ G2 피치 테스트가 빨개져야 한다).

## Acceptance Criteria
```bash
npx vitest run src/domain/review src/lib/viewer src/lib/export src/domain/model/project.test.ts
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step3-report.json`: `{ "changed_files", "tests_added", "mutations", "exported_from_project_ts": ["touchesColumn", ...], "world_point_extraction": { "fixture": "...", "identical": true }, "paths_verified": ["src/domain/review/joint.ts", "src/domain/review/dependency.ts", "src/domain/review/fingerprint.ts", "src/lib/viewer/building.ts", "src/lib/viewer/geometry.ts"] }`

## 금지사항
- 접합·의존을 좌표 근접·박스 겹침으로 판정하지 마라. 이유: README 결정 6.
- `girderRun`·`columnEnds`·`beamDepthAbove`·`girderSpan`의 동작을 바꾸지 마라. `src/domain/rebar/**`·`src/domain/quantity/**`의 값을 바꾸지 마라(`ruleIdentity` export만).
- `buildingLayout`의 출력 좌표·순서를 바꾸지 마라(필드 추가만).
- 壁·床板의 의존을 「없음」으로 내지 마라 — `untracked`다.
- fingerprint에 의존 부재의 断面 전체·`formula`·`note`·`label`·`notes`·`unitMass`·案件名을 넣지 마라. 이유: 표시만 달라진 변경·무관한 필드 변경이 검토를 무효화하면 안 된다.
- 규준 수치 리터럴 금지, `src/domain`에서 `@/lib` import 금지.
