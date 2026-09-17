# Step 4: impact-validity-readiness — 기준안 대비 변경 분류·의존관계 기반 영향과 경로·검토 항목 유효성·작업 패키지 준비 상태

README 결정 2·4·6·10과 step 1·3의 타입·함수를 전제로 한다.

## 읽어야 할 파일
- step 1·3 산출물: `src/domain/review/{types,state,joint,dependency,fingerprint}.ts`
- `src/lib/hooks/useTakeoff.ts` — `buildTakeoff(project): TakeoffResult`(순수, `'use client'` 파일이지만 Node 테스트에서 import 가능 — `useTakeoff.test.tsx` 참조), `UnsupportedMember`
- `src/domain/quantity/index.ts` — `QuantityLine`(`MassQuantityLine.designKg: number | null` — **null은 0이 아니다**), `isMassLine`
- `src/domain/model/project.ts` — `Member`·`Section` 필드(변경 필드 이름을 경로 문장에 쓴다)

## 만들 것

### 1. `src/domain/review/impact.ts` (순수)
입력은 계산 결과를 **받는다**(domain은 `@/lib`를 import할 수 없으므로 `buildTakeoff`는 호출 측이 돌린다):
```ts
export interface TakeoffSnapshot {
  project: Project
  rebars: Rebar[]
  lines: QuantityLine[]
  unsupportedMemberIds: ReadonlySet<string>
  fingerprints: ReviewFingerprints      // 기준안은 저장된 baseline.fingerprints, 현재는 projectFingerprints(...)
}

export type EntityChange =
  | { kind: 'member'; change: '追加' | '削除' | '変更' | '対応要確認'; memberId: string; fields?: string[]; detail: string }
  | { kind: 'section'; change: '追加' | '削除' | '変更'; sectionId: string; fields: string[]; detail: string }   // detail: 「C1 b 800→900」
  | { kind: 'story'; change: '追加' | '削除' | '変更'; storyId: string; fields: string[]; detail: string }
  | { kind: 'grid'; change: '変更'; detail: string }
  | { kind: 'unitMass'; change: '変更'; sizes: string[]; detail: string }
  | { kind: 'rulepack'; change: '変更'; detail: string }
  | { kind: 'displayOnly'; what: '案件名' | '備考' | '通り芯名'; detail: string }

export type ImpactCategory = '入力' | '形状' | '数量' | '対応状態' | '根拠'
export interface MemberImpact {
  memberId: string
  categories: ImpactCategory[]                 // 비지 않는다
  /** 왜 영향을 받았는가 — 짧은 경로. 예: ["柱 1F-X1Y1 断面 C1 b 800→900", "支持柱 → 大梁 1F-G1-X1Y1-X（内法・定着の判定に使う）"] */
  path: string[]
  support: { before: '対応' | '未対応'; after: '対応' | '未対応' }
}
export type MassState = '算出' | '単位質量未入力'
export interface LineChange {
  lineId: string
  change: '追加' | '削除' | '変更'
  fields: string[]                              // lengthMm, countPerMember, places, designKg …
  mass?: { before: MassState | null; after: MassState | null; beforeKg: number | null; afterKg: number | null }  // 「단위질량 미입력」은 0이 아니라 상태
}
export interface ImpactReport {
  entities: EntityChange[]
  members: MemberImpact[]
  lines: LineChange[]
  rulepackChanged: boolean
  checkVersionChanged: boolean
  displayOnly: EntityChange[]                   // entities의 displayOnly만 추린 것
}
export function assessImpact(baseline: TakeoffSnapshot, current: TakeoffSnapshot): ImpactReport
```
규칙:
- **부재 대응**은 `member.id`로 한다. 같은 id가 양쪽에 있는데 `kind`·`storyId`·`position`이 다르면 `変更`(fields에 이름). id가 사라졌는데 **같은 kind·storyId·position**의 다른 id 부재가 생겼으면 둘 다 `対応要確認`으로 내고(삭제＋추가로 처리하지 않는다), 그 부재의 `MemberImpact.path`에 「id 変更の可能性 — 対応要確認」을 넣는다. 그 밖의 사라짐/생김은 削除/追加.
- 입력 변경의 **직접 대상**(section 변경 → 그 section을 쓰는 부재, story 변경 → 그 階 부재, grid 변경 → 걸친 스팬이 바뀐 부재, member 변경 → 자신)을 구한 뒤, **역의존**으로 전파한다: 현재 案件의 모든 부재에 대해 `memberDependencies`를 구해 「직접 대상을 의존하는 부재」 중 **그 의존의 `reads`가 실제로 바뀐 것**만 영향 대상에 넣고 path에 `via`와 `detail`을 붙인다(한 홉. 連続スパン은 런 전체가 한 단위이므로 런 동료를 거친 두 홉까지 — 그 이상은 넣지 않는다). 예: C1 `b` 변경 → 그 柱를 支持柱로 읽는 大梁는 영향(`reads.b`가 바뀜); G2 `stirrup.pitch` 변경 → 그 大梁를 上部大梁로 읽는 柱는 **비영향**(`reads.depth` 불변). `untracked` 부재(壁·床板)는 입력 전파를 하지 않는다 — 대신 아래 결과 비교로만 잡히며 path에 「依存経路未追跡 — 結果差分で検出」을 쓴다.
- **결과 비교**: 양쪽 `fingerprints.members`를 비교해 `input`이 다르면 `入力`, `result`가 다르면 `形状`(＋数量 행이 달라졌으면 `数量`), `result`의 null 여부가 바뀌면 `対応状態`. `rulepack`이 다르면 전 부재에 `根拠`를 넣고 `rulepackChanged: true`. 입력 전파로 잡혔는데 결과가 같은 부재는 categories에 `入力`만 두고 path 끝에 「結果は不変」을 붙인다.
- **数量 행**: `lines`를 `id`로 대응. 값 필드 비교. `designKg`가 `null`↔숫자면 `mass`에 상태 전이로 기록하고 `fields`에 `designKg`. `null`→`null`은 변경 아님. 숫자 비교는 `Object.is`. `unitMass`만 바뀐 경우 `entities`에 `unitMass` 변경, `lines`에 mass 전이가 실리고 `members`는 빈다(부재 입력·결과는 불변이므로 — 문서화. 행→부재 역참조는 만들지 않는다).
- `displayOnly`: `name`, `notes`, `grid.xLabels/yLabels`. 이것만 다르면 `members`·`lines`는 비고 `displayOnly`만 찬다.
- 경로 문장은 일본어 부재 용어 그대로(ADR-008). 断面 필드 변경은 `断面 C1 b 800→900`처럼 **값을 같이** 적는다(원문 그대로의 입력값이지 규준값이 아니다).

### 2. `src/domain/review/validity.ts` (순수)
```ts
export type StaleReasonKind = '入力変更' | '結果変更' | '対応状態変更' | '根拠変更' | '検査版変更' | '検査条件変更' | '対象変更' | '対象なし' | '対応要確認'
export interface StaleReason { kind: StaleReasonKind; memberId?: string; detail: string }
export type ReviewValidity = { state: '有効' } | { state: '再検討必要'; reasons: StaleReason[] }

export interface CurrentModel {
  project: Project
  fingerprints: ReviewFingerprints             // 현재 전 부재 ＋ 현재 rulepack·checkVersion·checkConditions
  impact: ImpactReport | null                  // 기준안이 없으면 null — 그때 対応要確認은 판정하지 않는다(문서화)
}
export function itemTargetMemberIds(item: ReviewItem, project: Project): { memberIds: string[]; missing: ElementRef[]; unresolved: ElementRef[] }
export function itemValidity(item: ReviewItem, current: CurrentModel): ReviewValidity
export type EffectiveItemStatus = ReviewHumanStatus | '再検討必要'
export function effectiveItemStatus(item: ReviewItem, validity: ReviewValidity): EffectiveItemStatus
export function itemsNeedingRecheck(items: ReviewItem[], current: CurrentModel): ReviewItem[]   // 「이번 변경으로 다시 봐야 하는 것만」
```
- `itemTargetMemberIds`: `member` → 자신; `joint` → `resolveJoint`가 `joint`면 `jointRebarMemberIds(project, joint)`(런 대표 포함 — 通し筋 결과 변경을 놓치지 않기 위해), 아니면 `missing`; `rebar` → `rebarId`의 `|` 앞 부분(`Rebar.id` 규약)이 존재하면 그 부재; `quantityLine` → 부재를 특정할 수 없으므로 memberIds에 기여하지 않고 `unresolved`에 넣는다(무시가 아니다). validity는 다른 ref로 판정하고, quantityLine만 있는 항목은 `対象なし`.
- `itemValidity`: 비교 대상 부재 집합 ＝ **`snapshot.fingerprints.members`의 키 ∪ 현재 `itemTargetMemberIds`**. 스냅샷에만 있는 부재(접속 大梁 삭제 등)·현재에만 있는 부재(大梁 추가) → `対象変更`(memberId·detail). 양쪽에 있는 부재는 `input` 다름→`入力変更`, `result` 다름→`結果変更`, null 전이→`対応状態変更`; `snapshot.fingerprints.rulepack !== current.fingerprints.rulepack`→`根拠変更`; `item.finding`이 있고 `checkVersion` 다름→`検査版変更`; `item.finding`이 있고 `checkConditions` 다름→`検査条件変更`(finding 없는 항목은 검사 조건과 무관); 대상 없음→`対象なし`; `impact`에 그 부재가 `対応要確認`이면→`対応要確認`. 이유가 하나도 없으면 `有効`.
- **무효화하지 않는 것**(테스트로 고정): 카메라 pose·clip·layers·selection·案件名·備考·通り芯名·대상 밖 부재의 변경·finding 없는 항목에 대한 검사 조건 변경.
- `effectiveItemStatus`: validity가 `再検討必要`면 그것(사람 status와 별개로 표시). `有効`면 사람 status.

### 3. `src/domain/review/readiness.ts` (순수)
```ts
export type ReadinessState = '準備未完' | '準備完了' | '準備完了（例外あり）'
export type BlockerKind = '前モデルの検討が残っている' | '必須の詳細情報が未入力' | '確認記録がない' | '関連項目が未確認' | '関連する検討項目がない' | '未入力' | '判断不可' | '理由のない保留' | '担当者未入力' | '対象部材なし'
export interface Blocker { entryId: string | null; kind: BlockerKind; detail: string }
export interface Exception { entryId: string; kind: '保留' | '除外'; reason: string }
export interface PackageReadiness { state: ReadinessState; blockers: Blocker[]; exceptions: Exception[]; memberIds: string[]; missingTargets: ElementRef[] }
export function packageReadiness(pkg: WorkPackage, items: ReviewItem[], current: CurrentModel): PackageReadiness
```
- `required` 항목마다:
  - `未入力`·`未確認` → blocker `未入力`.
  - `確認済`이고 연결 항목이 있으면 각 연결 항목에 대해: id가 `items`에 없음 → `関連する検討項目がない`; `itemValidity`가 `再検討必要` → `前モデルの検討が残っている`(어느 항목·이유를 detail에); 사람 status `未確認`·`保留` → `関連項目が未確認`; `判断不可` → `必須の詳細情報が未入力`. (연결 항목이 존재한다는 사실은 확인이 아니다.)
  - `確認済`이고 연결 항목이 없으면: `confirmation` 없음 → `確認記録がない`; 있으면 `confirmation.fingerprints`를 **패키지 대상 부재**의 현재 fingerprint와 비교(itemValidity와 같은 규칙 — 같은 함수를 재사용) → 다르면 `前モデルの検討が残っている`.
  - `保留`·`除外`는 reason이 있으면 exception, 없으면 blocker `理由のない保留`.
- `assignee`가 빈 문자열 → `担当者未入力`. 대상 ref가 현재 案件에 없으면 `対象部材なし`.
- 상태: blockers 비고 exceptions 비면 `準備完了`, blockers 비고 exceptions 있으면 `準備完了（例外あり）`, 아니면 `準備未完`. **퍼센트를 만들지 않는다.**
- 필수가 아닌 항목은 상태에 영향 없음(정보로만).

## 테스트 (먼저 쓴다) — `src/domain/review/{impact,validity,readiness}.test.ts`
샘플 案件으로 `TakeoffSnapshot`을 만드는 헬퍼 `tests/fixtures/review/snapshot.ts`(테스트 전용, `buildTakeoff`＋`projectFingerprints`)를 두고:
- **영향 전파**: 柱 `section-C1.b` 800→900 → 영향 부재 ＝ C1을 쓰는 모든 柱(입력) ＋ 그 柱를 지점으로 하는 大梁(支持柱 경로 `reads.b`, 결과도 변함) ＋ 그 柱의 上下階柱는 **비영향**(`reads.exists` 불변 — 실제 `columnEnds`가 존재만 읽는다). 壁·床板은 결과가 바뀐 것만 「依存経路未追跡」 path로. **반례**: `section-G2.stirrup.pitch` 변경 → G2 大梁만 영향, G1·柱는 미포함(柱의 上部大梁 의존은 `depth`만 읽는다).
- **표시만**: 案件名·備考·通り芯名 변경 → `members`·`lines` 빈 배열, `displayOnly` 3건.
- **단위질량**: `unitMass.D13` 추가 → 해당 행들 `mass.before='単位質量未入力'`·`after='算出'`, `beforeKg null`, `afterKg` 숫자; 어떤 행도 `0`으로 나오지 않는다; `members` 빈 배열·`entities`에 unitMass.
- **부재 대응**: 柱 id를 바꾸고 나머지 동일 → `対応要確認` 2건(삭제＋추가가 아님); id는 같은데 階를 옮김 → `変更`(fields에 storyId).
- **미지원 전이**: 지점 柱를 지워 大梁가 未対応이 되면 `対応状態` ＋ support before/after.
- **룰팩**: baseline `fingerprints.rulepack`을 다른 문자열로 바꾼 스냅샷 → `rulepackChanged`, 전 부재 `根拠`.
- **유효성**: 항목 targets `[joint 1F-X1Y1]`(大梁 G1 둘); `section-C1.b` 변경 → `再検討必要`(入力変更·結果変更 with memberIds); **`section-G2` 피치 변경 → 그 항목은 유효**(G2는 이 접합부에 없다)하고, targets `[joint 1F-X2Y1]`·`[member 1F-G2-…]` 항목은 재검토(G2 大梁가 대상); pose/clip/備考 변경 → 유효; 대상 柱 삭제 → `対象なし`; 접속 大梁 하나 삭제 → `対象変更`; `finding` 있는 항목의 `checkVersion` 증가 → `検査版変更`; `finding` 있는 항목에서 `settings.clearance.valueMm` 변경 → `検査条件変更`, `finding` 없는 항목은 유효; `enteredAt`만 변경 → 유효; `quantityLine`만 참조 → `対象なし`; 기준안 없음(`impact: null`) → `対応要確認`을 내지 않는다.
- **준비 상태**: 필수 항목이 確認済＋연결 항목 유효·確認済 → `準備完了`; 연결 항목이 `未確認` → `関連項目が未確認`; 연결 id 소실 → `関連する検討項目がない`; 모델 변경으로 연결 항목이 再検討必要 → `準備未完`＋`前モデルの検討が残っている`; 연결 없는 確認済 with `confirmation.fingerprints` → 대상 柱 断面 변경 후 `準備未完`(반증 4의 결손 — 완료 조건 (10)); 保留 with reason → `準備完了（例外あり）`; 保留 no reason → blocker; assignee 빈값 → blocker; 연결 없는 確認済 without confirmation → `確認記録がない`; 비필수 항목 未入力은 무영향.

## 변이 확인
① 역의존 전파 제거(직접 대상만) ② `designKg` null을 0으로 취급 ③ `itemValidity`에서 `checkConditions` 비교 제거 ④ `packageReadiness`에서 연결 없는 확인 기록의 fingerprint 비교 제거.

## Acceptance Criteria
```bash
npx vitest run src/domain/review
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step4-report.json`: `{ "changed_files", "tests_added", "mutations", "propagation_example": { "change": "section-C1.b 800→900", "affected": [...], "not_affected_sample": [...] }, "paths_verified": ["src/domain/review/impact.ts", "src/domain/review/validity.ts", "src/domain/review/readiness.ts", "tests/fixtures/review/snapshot.ts"] }`

## 금지사항
- 영향 범위를 「선택 부재와 같은 階 전부」·「거리 안의 부재」로 만들지 마라. 이유: README 결정 6.
- 카메라·clip·layers·selection·案件名·備考·通り芯名 변경으로 검토를 무효화하지 마라.
- `designKg: null`을 0이나 「변화 없음」으로 다루지 마라.
- 퍼센트 진척도를 만들지 마라. 「確認済」·「準備完了」를 안전·승인으로 표현하는 문구를 쓰지 마라.
- id가 사라진 요소를 자동으로 같은 요소로 확정하지 마라(`対応要確認`).
- 연결 항목이 존재한다는 사실을 확인으로 치지 마라.
- `src/domain`에서 `@/lib` import 금지(`buildTakeoff`는 테스트 헬퍼가 호출).
