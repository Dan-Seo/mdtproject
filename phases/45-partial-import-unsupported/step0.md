# Step 0: refute-spec — 이 phase의 전제를 코드로 반증한다 (verify · gate) — 3판

1판(`step0-report-r1.json`)과 2판(`step0-report-r2.json`)이 각각 refuted 됐고 그 census·counterexample은 유효하다. 2판이 upheld한 B2~B6은 `step0-report-r2.json`을 인용하고 다시 돌리지 않는다. 3판은 **B1을 네 자리 census로 고쳐** 다시 반증하고, 넷째 자리를 이 phase에서 미루는 근거(B7)를 검증한다.

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step0-report-r1.json`·`step0-report-r2.json`(census 18곳·helper 감사·counterexample 둘), `step0-repro-r1.test.ts.txt`·`step0-repro-r2.test.ts.txt`
- `src/domain/model/project.ts` — `supportColumnSection`(≈L566), `memberGroupKey`(≈L180~195, `story.name` 기반), `girderRun`(≈L1384~1450), `beamDepthAbove`(≈L1520~1550), `Project.notes` 주석(≈L107~108)·`setNote`(≈L1553)
- `src/domain/quantity/index.ts` — `quantityLineId`(≈L195~202)·`aggregateQuantity`의 일관성 검사(≈L280~293)
- `src/components/quantity/TakeoffPane.tsx` ≈L215, `src/lib/export/index.ts` ≈L406 (備考를 `QuantityLine.id`로 찾는 곳)
- `src/lib/hooks/useTakeoff.ts`(try 4곳), `src/lib/i18n.test.ts`

## 배경
実物 PDF 반영 직후 3D·数量 페인이 plain `Error`로 비는 문제. 두 판의 census로 취입이 만든 Project로 도달 가능한 plain throw는 **넷**이다 — ① `supportColumnSection` 「Missing … support 柱」 ② `beamDepthAbove` 「No touching 大梁 found above 柱」 ③ `girderRun` 「大梁 run contains mixed sections」 ④ `aggregateQuantity` 「Inconsistent size or shape in quantity group」(같은 이름의 階 둘 ＋ 같은 符号 ＋ 径이 다른 断面 — 2판 counterexample). 뒤 스텝은 ①②를 `MemberUnsupportedError`로 낮추고 ③은 `slabRun`과 같은 조건(같은 断面일 때만 연속)으로 런을 나눈다. **④는 이 phase에서 고치지 않는다**: 고치려면 `quantityLineId`(또는 `memberGroupKey`)의 형식을 바꿔야 하는데 그 id는 저장된 案件의 備考(`Project.notes`) 키라 이행이 필요하다. 실물 도면(tsu·yokohama)은 階 이름이 전부 달라 ④에 닿지 않는다. ④는 ADR-047과 RISKS에 남긴다(step 4).

## 작업 — 아래 주장을 각각 반증 시도하고, 하나라도 무너지면 `refuted`
- **B1(3판)** 2판의 scope(등록 断面·격자 안·역할 일치·정상 참조)에서 `buildTakeoff`(생성＋`aggregateQuantity`)·`buildingLayout`·`selectedMemberView`가 plain `Error`에 닿는 경로는 위 ①~④뿐이다. 두 판의 census(18곳)와 helper 감사를 재검토해 **다섯째**가 있으면 Project JSON을 붙여 refuted. 없으면 표를 그대로 인용하고 upheld.
- **B7** ④를 이 phase에서 미루는 근거: `Project.notes`는 `QuantityLine.id`를 키로 쓰고(주석·`setNote`·TakeoffPane·export의 줄 번호), `QuantityLine.id`는 `memberGroupKey`(`story.name` 포함)＋`quantityLineId`(size 미포함)로 만들어지므로, ④를 「size를 id에 넣기」나 「story.id로 묶기」로 고치면 기존 저장 案件의 備考 키가 전부 어긋난다. 이 인과가 틀리면(예: 備考가 다른 키를 쓰거나 id가 이미 size를 포함) refuted.
- **B8** ④는 실물 반영에서 나지 않는다: tsu 골든의 stories(`tests/fixtures/drawing-set/expected/tsu.json`의 `stories.levels`)와 yokohama 골든의 같은 필드에서 라벨이 있는 レベル 이름이 서로 다르다(같은 이름 둘이 없다). 같은 이름이 있으면 refuted.
- **B2~B6** `step0-report-r2.json#/claims`를 인용(재실행 불필요). 단 B2의 「mixed 검사가 girderSpan보다 앞」은 3판에서도 그대로인지 줄 번호로 한 번 더 확인.

## 산출물
`phases/45-partial-import-unsupported/step0-report.json`:
```json
{ "verdict": "upheld|refuted", "round": 3,
  "claims": [{ "id": "B1", "status": "upheld|refuted", "evidence": [{ "source": "phases/45-partial-import-unsupported/step0-report-r2.json#/throw_census", "note": "..." }] }],
  "deferred": [{ "site": "src/domain/quantity/index.ts#L289", "why": "..." }],
  "paths_verified": ["src/domain/model/project.ts", "src/domain/quantity/index.ts", "src/lib/hooks/useTakeoff.ts", "src/components/quantity/TakeoffPane.tsx", "src/lib/export/index.ts", "tests/fixtures/drawing-set/expected/tsu.json", "tests/fixtures/drawing-set/expected/yokohama.json", "phases/45-partial-import-unsupported/step0-report-r2.json"] }
```

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step0-report.json
```

## 검증 절차
- 전부 성립 → step 0 `completed`, summary 한 줄. 무너짐 → `refuted`와 summary에 무엇이 무너졌는지. **고치지 마라.**

## 금지사항
- `src/`·`tests/`·`docs/`를 수정하지 마라. 이유: 반증 전용. 재현이 필요하면 `phases/45-partial-import-unsupported/` 안에 두고 임시 config로 돌리며 report에 config를 적어라(vitest 기본 설정은 `phases/`를 포함하지 않는다).
- 「돌려봤다」로 끝내지 마라. 각 주장은 줄 번호·명령·출력으로 증명한다.
