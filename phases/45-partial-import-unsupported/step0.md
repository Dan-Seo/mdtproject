# Step 0: refute-spec — 이 phase의 전제를 코드로 반증한다 (verify · gate) — 4판

1~3판(`step0-report-r1/-r2/-r3.json`)이 각각 refuted 됐고 census·counterexample은 전부 유효하다. 3판이 확인했듯 「도달 가능한 plain throw가 정확히 N개」라는 주장은 부동소수 경계(⑤) 같은 것까지 세면 끝이 없다. 그래서 4판은 **완전성을 주장하지 않는다**: 이 phase가 고치는 ①②③이 실제로 도달 가능하고 실물 도면이 닿는 자리라는 것(B1), 미루는 자리의 근거(B7·B9)만 검증한다. B2~B6·B8은 2·3판 report를 인용하고 다시 돌리지 않는다.

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step0-report-r1.json`·`step0-report-r2.json`·`step0-report-r3.json`(census 18곳·helper 감사·counterexample 셋), `step0-repro-r1/-r2/-r3.test.ts.txt`
- `src/domain/model/project.ts` — `supportColumnSection`(≈L566), `memberGroupKey`(≈L180~195, `story.name` 기반), `girderRun`(≈L1384~1450), `beamDepthAbove`(≈L1520~1550), `Project.notes` 주석(≈L107~108)·`setNote`(≈L1553)
- `src/domain/quantity/index.ts` — `quantityLineId`(≈L195~202)·`aggregateQuantity`의 일관성 검사(≈L280~293)
- `src/components/quantity/TakeoffPane.tsx` ≈L215, `src/lib/export/index.ts` ≈L406 (備考를 `QuantityLine.id`로 찾는 곳)
- `src/lib/hooks/useTakeoff.ts`(try 4곳), `src/lib/i18n.test.ts`

## 배경
実物 PDF 반영 직후 3D·数量 페인이 plain `Error`로 비는 문제. 두 판의 census로 취입이 만든 Project로 도달 가능한 plain throw는 **넷**이다 — ① `supportColumnSection` 「Missing … support 柱」 ② `beamDepthAbove` 「No touching 大梁 found above 柱」 ③ `girderRun` 「大梁 run contains mixed sections」 ④ `aggregateQuantity` 「Inconsistent size or shape in quantity group」(같은 이름의 階 둘 ＋ 같은 符号 ＋ 径이 다른 断面 — 2판 counterexample). 뒤 스텝은 ①②를 `MemberUnsupportedError`로 낮추고 ③은 `slabRun`과 같은 조건(같은 断面일 때만 연속)으로 런을 나눈다. **④는 이 phase에서 고치지 않는다**: 고치려면 `quantityLineId`(또는 `memberGroupKey`)의 형식을 바꿔야 하는데 그 id는 저장된 案件의 備考(`Project.notes`) 키라 이행이 필요하다. 실물 도면(tsu·yokohama)은 階 이름이 전부 달라 ④에 닿지 않는다. ④는 ADR-047과 RISKS에 남긴다(step 4).

## 작업 — 아래 주장을 각각 반증 시도하고, 하나라도 무너지면 `refuted`
- **B1(4판)** 이 phase가 고치는 세 자리는 취입이 만든 Project로 도달 가능하다: ① `supportColumnSection`(r1 `#/reproduction` — tsu 합성 6부재·42부재 모두) ② `beamDepthAbove`(r1 census; 2026-09-10 yokohama 실측 `No touching 大梁 found above 柱: story-2-C51-0-0`은 `phases/44-drawing-set-assembly/orchestration-report.md`가 아니라 지휘 세션의 브라우저 실측이므로 코드 경로로 증명: 柱 断面만 등록된 伏図 반영 → `columnEnds`/`beamDepthAbove`가 plain Error) ③ `girderRun`(r1 `#/counterexample`). 셋 다 인용 또는 최소 재현으로 확인. 하나라도 도달 불가면 refuted.
- **B9** 미루는 자리의 목록과 근거가 사실이다: ④ `aggregateQuantity` size 충돌(r2 counterexample; 근거 B7) ⑤ `stirrup-layout.ts` 부동소수 경계(r3: pitch 100.1 → gap 100.10000000000002 > pitch; 정수 pitch로는 도달 불가 — `100`·`150`·`200`으로 재현되지 않음을 한 번 보여라). ⑤가 정수 pitch로도 나면 refuted(그 경우 이 phase 범위에 넣어야 한다). 이 둘 외에 **실물 도면(tsu·yokohama 골든의 断面·階 값)으로 도달하는** plain throw를 알고 있으면 `deferred`에 추가하되 refuted 사유로 삼지는 않는다.
- **B7** ④를 이 phase에서 미루는 근거: `Project.notes`는 `QuantityLine.id`를 키로 쓰고(주석·`setNote`·TakeoffPane·export의 줄 번호), `QuantityLine.id`는 `memberGroupKey`(`story.name` 포함)＋`quantityLineId`(size 미포함)로 만들어지므로, ④를 「size를 id에 넣기」나 「story.id로 묶기」로 고치면 기존 저장 案件의 備考 키가 전부 어긋난다. 이 인과가 틀리면(예: 備考가 다른 키를 쓰거나 id가 이미 size를 포함) refuted.
- **B8** ④는 실물 반영에서 나지 않는다: tsu 골든의 stories(`tests/fixtures/drawing-set/expected/tsu.json`의 `stories.levels`)와 yokohama 골든의 같은 필드에서 라벨이 있는 レベル 이름이 서로 다르다(같은 이름 둘이 없다). 같은 이름이 있으면 refuted.
- **B2~B6·B8** `step0-report-r2.json#/claims`·`step0-report-r3.json#/claims`를 인용(재실행 불필요).

## 산출물
`phases/45-partial-import-unsupported/step0-report.json`:
```json
{ "verdict": "upheld|refuted", "round": 4,
  "claims": [{ "id": "B1", "status": "upheld|refuted", "evidence": [{ "source": "phases/45-partial-import-unsupported/step0-report-r2.json#/throw_census", "note": "..." }] }],
  "deferred": [{ "site": "src/domain/quantity/index.ts#L289", "why": "..." }, { "site": "src/domain/rebar/stirrup-layout.ts#L77", "why": "..." }],
  "paths_verified": ["src/domain/model/project.ts", "src/domain/quantity/index.ts", "src/lib/hooks/useTakeoff.ts", "src/components/quantity/TakeoffPane.tsx", "src/lib/export/index.ts", "tests/fixtures/drawing-set/expected/tsu.json", "tests/fixtures/drawing-set/expected/yokohama.json", "phases/45-partial-import-unsupported/step0-report-r2.json", "phases/45-partial-import-unsupported/step0-report-r3.json", "src/domain/rebar/stirrup-layout.ts"] }
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
