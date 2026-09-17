# Step 2: joint-and-fingerprint — 접합부 판정·의존관계·fingerprint, 3D 개체 식별과 부재→세계좌표 변환 추출

`phases/47-joint-review-core/README.md`의 공통 결정을 먼저 읽어라. 특히 결정 6(의존관계는 실제 산정 함수).

## 읽어야 할 파일
- `src/domain/model/project.ts` — `girderSupportSections`(≈L548)·`supportColumnSection`(위치로 지점 柱를 찾는다)·`girderRun`(≈L1378)·`columnEnds`(≈L1480)·`beamDepthAbove`(≈L1512, `touchesColumn` ≈L512)·`MemberUnsupportedError`
- `src/domain/model/member.ts` — `ColumnSection.shape`(円形은 이번 접합부 범위 밖), `Member.position` 판별은 항상 `kind`로
- `src/domain/model/rebar.ts` — `Rebar` 필드 전부
- `src/domain/rules/types.ts` — `RuleEntry`·`RulePack`; `src/rulepack/index.ts` — `jpMlitRulePack`
- `src/domain/quantity/index.ts` — `ruleIdentity`(≈L150, key＋conditions) — export해서 재사용
- `src/lib/viewer/geometry.ts` — `Segment`(≈L23), `rebarSegmentRuns`(≈L963, `placements.flatMap`가 개체를 펼친다), `clipSegments`(≈L917, 세그먼트를 다시 만든다 — 필드 보존 주의), `rebarSegments`, `rebarBatches`
- `src/lib/viewer/building.ts` — `RebarInstance`(≈L49), `buildingLayout`(≈L120; 柱·大梁의 `worldPoint` 클로저 ≈L310~355)
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
  /** 참고 표시 대상: 上下階의 같은 격자점 柱, 各 大梁의 런 동료 (girderRun.members − 자신) */
  reference: { memberIds: string[] }
}
export type JointResolution =
  | { status: 'joint'; joint: Joint }
  | { status: 'unsupported'; reason: '柱ではない' | '円形柱' | '取り付く大梁なし' | '部材なし' }
export function resolveJoint(project: Project, columnMemberId: string): JointResolution
export function jointMemberIds(joint: Joint): string[]   // 柱 + girders (reference 제외)
```
- 판정은 **위치와 階**로 한다: `candidate.kind === '大梁' && candidate.storyId === column.storyId && touchesColumn(candidate.position, column.position)`. `touchesColumn`은 `project.ts`의 private 함수다 — **export해서 재사용**하고 복사하지 마라. 大梁가 `MemberUnsupportedError`(支持柱なし 등)인지는 여기서 판정하지 않는다(그건 `buildTakeoff`의 결과이고 step 4가 `unsupportedMemberIds`로 받는다).
- `円形柱`는 `unsupported`로 명시한다(첫 지원 대상은 矩形 柱 — 화면은 이 사유를 그대로 보여줄 것이다). 大梁가 하나도 없으면 `取り付く大梁なし`.
- `reference.memberIds`: `columnEnds`와 같은 방식으로 `stories` 순서 ±1 階의 같은 `ix,iy` 柱, 그리고 각 大梁의 `girderRun(project, girder).members`에서 자신을 뺀 것. `girderRun`이 throw하면(支持柱なし) 그 大梁의 동료는 비운다 — throw를 밖으로 내지 마라.

### 2. `src/domain/review/dependency.ts` — 산정 의존관계 (순수)
```ts
export type DependencyVia = '支持柱' | '上部大梁' | '連続スパン' | '上下階柱'
export interface Dependency { memberId: string; via: DependencyVia; detail: string }  // detail: 「始端 支持柱 — 内法・定着の判定に使う」
export type DependencyResolution =
  | { status: 'tracked'; dependencies: Dependency[] }
  | { status: 'untracked'; reason: '依存経路未追跡（耐震壁・床板）' }
export function memberDependencies(project: Project, memberId: string): DependencyResolution
```
- 大梁: `girderRun`의 모든 런 부재(자신 제외, via 連続スパン) ＋ 런의 각 스팬 지점 柱(`girderSupportSections`, via 支持柱; 内法·定着·かぶり 조건이 柱 断面에서 온다). `girderRun`/`girderSupportSections`가 `MemberUnsupportedError`를 던지면 얻은 것까지만 담고 `detail`에 「支持柱なし」를 남긴다(throw 금지). 다른 Error는 그대로 던진다.
- 柱: 같은 階의 `touchesColumn` 大梁(via 上部大梁; `beamDepthAbove`가 せい를 읽는다) ＋ 上下階의 같은 격자점 柱(via 上下階柱; `columnEnds`).
- 耐震壁·床板: `untracked`. 조용히 빈 배열을 주지 마라 — 「영향 없음」과 「추적 안 함」은 다른 사실이다.

### 3. `src/domain/review/fingerprint.ts` (순수)
- `canonicalJson(value: unknown): string` — 객체 키를 재귀적으로 정렬. `undefined` 값 키는 생략(JSON.stringify와 같게).
- `hashString(text: string): string` — 결정적 문자열 해시(예: cyrb53 또는 FNV-1a 두 번). 16진 문자열. **암호 해시가 아님**을 주석에. 해시 상수는 규준값이 아니다(README 결정 8).
- `rulepackFingerprint(pack: RulePack): string` — 각 entry의 `{key, conditions, value, unit, confidence, source.doc, source.page, source.section}`를 `ruleIdentity` 순으로 정렬해 해시. `note`·`label`은 넣지 않는다(표시 문구 변경은 근거 변경이 아니다).
- `memberInputs(project, memberId): unknown` — 그 부재의 산정 입력을 **한 객체**로: `{ member, section, story: {id,name,height}, gridSpansAround, dependencies: [{memberId, via, section, story}] }` (의존 부재의 断面·階高까지 포함 — 柱 断面 b가 바뀌면 大梁 입력 fingerprint가 바뀌어야 한다). `gridSpansAround`는 그 부재가 걸친 通り芯 스팬 값(柱면 인접 스팬 4개 이하, 大梁면 자기 스팬). `untracked`(壁·床板)면 `dependencies: 'untracked'`.
- `memberInputFingerprint(project, memberId): string` ＝ `hashString(canonicalJson(memberInputs(...)))`.
- `memberResultFingerprint(rebars: Rebar[]): string` — 그 부재에 귀속된 `Rebar[]`(`rebar.memberId === memberId`, id 순 정렬)의 `{id, role, size, shape, points, closed, hookTails, length, count, placement, axisOffsetsMm, axisSlotStart, zones, splice:{method,countPerBar,lengthMm}, ruleHits:[{key,conditions,value,unit,confidence}]}`를 해시. `formula`는 넣지 않는다(문구).
- `projectFingerprints(project, rebars, unsupportedMemberIds, pack, checkVersion): ReviewFingerprints` — 전 부재. 未対応 부재는 `result: null`.
- 주의: 通し筋은 런 대표 부재(`run.ownerId`)에 귀속된다. 런 동료의 result fingerprint에는 자기 あばら筋만 들어간다 — 그래서 大梁의 입력 fingerprint가 런 전체를 포함해야 한다(위 `memberInputs`).

### 4. 3D 개체 식별 — `src/lib/viewer/geometry.ts`·`building.ts`
- `Segment`에 선택 필드 `barIndex?: number`(같은 `Rebar`의 몇 번째 배치 개체인가 — `rebarPlacements` 순서)와 `hookTail?: boolean`을 싣는다. `rebarSegmentRuns`의 `placements.flatMap((offset, barIndex) => …)`에서 넣고, `clipSegments`/`clipSegment`가 세그먼트를 쪼갤 때 **보존**한다.
- `RebarInstance`에 `rebarId: string`·`barIndex: number`·`segmentIndex: number`(그 개체 안 순번)를 추가. `buildingLayout`의 인스턴스 push에서 채운다. glTF 노드명 등 기존 출력은 불변(테스트로 고정).
- `memberWorldPoint(project: Project, member: Member, options?: { role?: RebarRole }): (point: Point3) => Point3`를 `building.ts`에서 **export**로 추출한다 — 현재 `buildingLayout` 안의 `worldPoint` 클로저 4분기(柱·大梁·床板·耐震壁)를 그대로 옮기고 `buildingLayout`이 그것을 호출하게. 床板은 role로 X/Y 런을 고른다(현재 `openings` 계산과 같은 분기). 추출 전후 `buildingLayout` 출력이 `toEqual`로 같아야 한다(테스트로 고정).

## 테스트 (먼저 쓴다)
- `src/domain/review/joint.test.ts`: 샘플 案件 `1F-X1Y1`(모서리, 大梁 2개)·`1F-X2Y2`(大梁 4개, 始端/終端 혼재)·`2F-X1Y1`(위층 없음 → reference에 1F 柱만); 大梁를 선택하면 `柱ではない`; `shape: '円形'` 断面이면 `円形柱`; 大梁를 전부 지운 柱면 `取り付く大梁なし`; 격자에 가까이 있어도 **다른 階**의 大梁는 들어가지 않는다(반례).
- `src/domain/review/dependency.test.ts`: 大梁 `1F-G1-X1Y1-X`의 의존에 始端·終端 柱가 via 支持柱로, Y방향 連続 大梁의 의존에 런 동료와 3개 柱; 柱의 의존에 上部大梁 4개(X2Y2)와 2F 柱; 耐震壁·床板은 `untracked`; 支持柱를 지운 大梁는 throw 없이 `detail`에 支持柱なし.
- `src/domain/review/fingerprint.test.ts`: `canonicalJson` 키 순서 무관; `rulepackFingerprint`가 `note` 변경에 불변·`value` 변경에 가변; 柱 断面 `b`를 바꾸면 그 柱와 **인접 大梁**의 input fingerprint가 바뀌고 반대편 격자의 大梁·다른 階는 불변; `unitMass`·`notes`·`xLabels`·案件名 변경은 어떤 부재 fingerprint도 바꾸지 않는다; 帯筋 피치 변경은 柱 result 변경·大梁 result 불변; 通し筋 런 동료의 断面 변경이 대표 부재 input에 반영.
- `src/lib/viewer/building.test.ts`·`geometry.test.ts`: `barIndex`가 배치 수만큼 0..n-1로 나오고 開口 clip 뒤에도 유지; `memberWorldPoint` 추출 전후 `buildingLayout` 동일(추출 **전에** 샘플·스트레스 案件의 `buildingLayout` 결과를 JSON으로 픽스처에 저장해 두고 비교 — 픽스처는 `tests/fixtures/viewer/building-layout-sample.json`, 크기가 크면 해시만).
- `src/lib/export/gltf.test.ts`: 기존 통과.

## 변이 확인 (report `mutations`)
① `resolveJoint`의 `storyId` 비교 제거 ② `memberInputs`에서 dependencies 제거 ③ `clipSegment`에서 `barIndex` 전파 제거.

## Acceptance Criteria
```bash
npx vitest run src/domain/review src/lib/viewer src/lib/export src/domain/model/project.test.ts
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step2-report.json`: `{ "changed_files", "tests_added", "mutations", "exported_from_project_ts": ["touchesColumn", ...], "world_point_extraction": { "fixture": "...", "identical": true }, "paths_verified": ["src/domain/review/joint.ts", "src/domain/review/dependency.ts", "src/domain/review/fingerprint.ts", "src/lib/viewer/building.ts", "src/lib/viewer/geometry.ts"] }`

## 금지사항
- 접합·의존을 좌표 근접·박스 겹침으로 판정하지 마라. 이유: README 결정 6.
- `girderRun`·`columnEnds`·`beamDepthAbove`·`girderSpan`의 동작을 바꾸지 마라. `src/domain/rebar/**`·`src/domain/quantity/**`의 값을 바꾸지 마라(`ruleIdentity` export만).
- `buildingLayout`의 출력 좌표·순서를 바꾸지 마라(필드 추가만).
- 壁·床板의 의존을 「없음」으로 내지 마라 — `untracked`다.
- fingerprint에 `formula`·`note`·`label`·`notes`·`unitMass`·案件名을 넣지 마라. 이유: 표시만 달라진 변경이 검토를 무효화하면 안 된다(§5.2).
- 규준 수치 리터럴 금지, `src/domain`에서 `@/lib` import 금지.
