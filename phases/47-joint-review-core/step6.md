# Step 6: xray — Calculation X-Ray 뷰모델(設計 vs 形状 분리)과 역방향 탐색

README 결정 5·9와 step 3을 전제로 한다.

## 읽어야 할 파일
- `src/domain/model/rebar.ts` — `Rebar.length`·`count`·`placement.positionCount`·`zones`·`ruleHits`·`formula`·`splice`
- `src/domain/quantity/index.ts` — `quantityLineId`·`spliceLineId`(한 Rebar에서 질량 행과 継手 箇所 행 **둘**이 생길 수 있다 ≈L193·L210·L327), `contributingRules`(≈L167), `ruleIdentity`(step 3 export)
- `src/lib/viewer/geometry.ts` — `rebarPlacements`(≈L588; 형상이 없는 역할·開口補強筋(ADR-034)에서 throw할 수 있다 ≈L875·L969), `rebarSegments`
- `src/components/viewer/legend.ts`(≈L16·L26) — zone→rule 대응 **방식**만 참고. **import하지 마라**(README 결정 9) — 같은 대응(`ruleHits.find(h => h.key === zone.ruleKey)`, 없으면 throw)을 `xray.ts` 안에 둔다.
- `src/lib/rule-source.ts` — `sourceLabel`·`sourceTooltip`(출처 문자열 형식은 여기가 유일한 출처)
- `docs/ADR.md` ADR-019(数量과 形状 분리)·ADR-034(開口補強筋)

## 만들 것 — `src/lib/review/xray.ts`
```ts
export interface RuleUse { rule: RuleHit; usedFor: ('定着' | '継手' | 'かぶり' | '割付' | '周長' | 'その他')[]; identity: string; sourceLabel: string }
export interface XRayView {
  member: { id: string; kind: MemberKind; mark: string; storyName: string }
  rebar: { id: string; role: RebarRole; size: ShearBarSize; shape: RebarShape }
  quantity: {
    lineIds: { mass: string | null; splice: string | null }   // 그 철근이 기여하는 두 행(있으면)
    designLengthMm: number; designCount: number
    places: number | null; spliceCountPerBar: number | null
  }
  shape:
    | { drawn: true; drawnLengthMm: number; placedCount: number; positionCount: number | null; differsFromDesign: { length: boolean; count: boolean } }
    | { drawn: false; reason: string }   // 형상이 없는 역할(開口補強筋 등) — 数量은 있으나 形状은 없다
  formula: string
  rules: RuleUse[]
  zones: { kind: '定着'; ruleKey: string; fromMm: number; toMm: number; lengthMm: number; rule: RuleHit }[]
}
export function xrayForRebar(rebar: Rebar, project: Project, lines: QuantityLine[]): XRayView
export function xrayForRow(rowId: string, rebars: Rebar[], project: Project, lines: QuantityLine[]): XRayView[]  // 그 행(질량 행이든 継手 행이든)에 기여하는 대표 철근들(부재별)
export function rebarsUsingRule(rule: RuleHit, rebars: Rebar[]): Rebar[]   // ruleIdentity 일치 (key+conditions) 그리고 value 일치 — 같은 키·다른 조건은 다른 근거
```
- `drawnLengthMm` ＝ `points` polyline 길이(＋`closed`면 닫는 변 ＋`hookTails` 두 꼬리) — **数量에 쓰지 않는다**는 주석. `placedCount` ＝ `rebarPlacements(rebar, section).length`, `positionCount` ＝ `placement?.positionCount ?? null`. `rebarPlacements`가 throw하거나 그 역할이 3D에 그려지지 않으면 `shape: { drawn: false, reason }`(throw를 밖으로 내지 않는다; reason에 역할과 ADR).
- `quantity.lineIds`: `quantityLineId(groupId, rebar)`와 `spliceLineId(...)`를 `lines`에서 찾는다(없으면 null). groupId는 `memberGroupKey`와 같은 규약.
- `usedFor`는 룰 키 접두로 정한다(`anchorage.*`→定着, `lap.*`·`measure.splice.*`→継手, `cover.*`→かぶり, `measure.distribution.*`→割付, `measure.hoop.*`·`measure.width-tie.*`→周長, 그 외→その他). 형상을 보고 룰을 역추측하지 않는다 — `ruleHits`와 `zones.ruleKey`에 있는 것만.
- `sourceLabel`은 `src/lib/rule-source.ts`의 것을 호출한다(문자열 형식을 새로 만들지 않는다).

## 테스트 (먼저 쓴다) — `src/lib/review/xray.test.ts`
- 柱 主筋: `quantity.designLengthMm`(継手 포함) ≠ `shape.drawnLengthMm`이고 `differsFromDesign.length === true`; `quantity.designCount`가 `rebar.count`와 `toBe`(「3D 개수로 数量을 만들지 않는다」); `lineIds.mass`가 `lines`에 존재하고 `lineIds.splice`도 있으면 그 행이 `箇所` 단위.
- 帯筋: `designCount`(1通則7)) ≠ `placedCount`(初期オフセット)인 案件을 만들어 `count: true`.
- `xrayForRow(継手 행 id)`가 그 철근의 뷰를 돌려준다(질량 행 id로도 같은 철근).
- `rules`의 `usedFor`가 zone 룰에 `定着`; `sourceLabel`이 `rule-source`의 출력과 `toBe`.
- `rebarsUsingRule(anchorage.L1 with fc24/SD345)`가 같은 조건 철근만 돌려주고 조건이 다른 행(다른 fc 断面을 추가)은 제외.
- 開口補強筋 또는 형상이 없는 역할 → `shape.drawn === false`이고 `quantity`는 그대로 있다(throw 없음).

## 변이 확인
① `drawnLengthMm`에 `hookTails` 누락 ② `rebarsUsingRule`에서 conditions 비교 제거(키만) ③ zone→rule 대응이 없을 때 throw 대신 첫 룰 반환.

## Acceptance Criteria
```bash
npx vitest run src/lib/review
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step6-report.json`: `{ "changed_files", "tests_added", "mutations", "paths_verified": ["src/lib/review/xray.ts"] }`

## 금지사항
- 형상을 보고 적용 룰을 역추측하지 마라. X-Ray는 `ruleHits`·`zones`만 쓴다.
- 3D 개수·polyline 길이로 `Rebar.length`·`count`·`QuantityLine`을 만들거나 덮지 마라.
- `src/components/viewer/legend`를 import하지 마라. 출처 문자열 형식을 새로 만들지 마라.
- `src/domain`·`src/domain/quantity`를 수정하지 마라(이 step은 `xray.ts`와 테스트만).
