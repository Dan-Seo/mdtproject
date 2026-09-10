# Step 0: refute-spec — 이 phase의 전제를 코드로 반증한다 (verify · gate) — 2판

1판은 `step0-report-r1.json`으로 **refuted** 됐다(2026-09-10 15:12). 그 census와 재현은 유효하다 — 이 2판은 1판이 무너뜨린 주장을 고친 뒤 **고친 주장만** 다시 반증한다. 1판이 upheld한 A2·A5·A6은 `step0-report-r1.json`을 인용하고 다시 돌리지 않는다.

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step0-report-r1.json`(1판 census·재현·counterexample), `step0-repro-r1.test.ts.txt`(1판 재현 테스트 — 확장자를 바꿔 보관)
- `src/domain/model/project.ts` — `supportColumnSection`(≈L566), `girderRun`(≈L1384~1450, 특히 mixed sections throw ≈L1437), `slabRun`(≈L1240~1300, 「同一断面であることを連続の条件にする」 주석), `beamDepthAbove`(≈L1520~1550)
- `src/domain/model/unsupported.ts`, `src/lib/hooks/useTakeoff.ts`(try 4곳: 柱 ≈L106·床板 ≈L143·耐震壁 ≈L177·大梁 ≈L205)
- `src/components/viewer/Viewer3D.tsx` ≈L1363~1380(`runSupportSections`)·≈L1400~1404(unsupported 조기 반환)·≈L1484(`girderRun`), `src/lib/viewer/building.ts` ≈L120~200(콘크리트 박스 루프)·≈L303·L341
- `src/lib/i18n.test.ts` ≈L18~47, `src/locales/ja.json`·`ko.json`

## 배경
実物 PDF 반영 직후 3D·数量 페인이 plain `Error`로 비는 문제. 1판 census: 취입이 만든 Project로 도달 가능한 plain throw는 **셋** — ① `supportColumnSection` 「Missing … support 柱」 ② `beamDepthAbove` 「No touching 大梁 found above 柱」 ③ `girderRun` 「大梁 run contains mixed sections」(인접한 같은 通り의 大梁이 다른 断面이면 지점이 다 있어도 터진다 — counterexample은 r1 report). 뒤 스텝은 ①②를 `MemberUnsupportedError`로 낮추고, ③은 `slabRun`과 같은 조건(**같은 断面일 때만 연속**)으로 런을 나눠 throw 자체를 없앤다.

## 작업 — 아래 주장을 각각 반증 시도하고, 하나라도 무너지면 `refuted`
- **B1** 1판 census의 「입력 도달 가능」 3곳 외에, `applyFramingPlan`·`applyDrawingSet`이 만든 Project(1판 counterexample처럼 등록 断面·격자 안·역할 일치)로 `buildTakeoff`(useTakeoff.ts)와 `buildingLayout`(building.ts)·`selectedMemberView`(Viewer3D.tsx)가 plain `Error`에 닿는 넷째 경로는 없다. 1판 census 표(18곳)를 그대로 재검토하고, `throw storyNotFound`·`findSection` 같은 헬퍼 throw도 포함해 「취입 결과로 도달 불가」 근거를 한 줄씩 적어라. 넷째가 있으면 Project JSON을 붙여 refuted.
- **B2** `girderRun`의 mixed sections 검사(≈L1437)는 `girderSpan` 호출(≈L1442)보다 **앞**에 있고, `buildTakeoff`는 大梁마다 `girderRun`을 try 안에서 부르며 catch가 `run?.members ?? [member]` 전부를 unsupported로 넣는다(줄 번호). 그리고 `slabRun`은 인접 베이를 **같은 `sectionId`일 때만** 런으로 잇는다(줄 번호·주석 인용) — 즉 「같은 断面일 때만 연속」은 이미 床板에 적용된 조건이다.
- **B3** 취입 계층은 인접 大梁의 断面 일치를 검사하지 않는다(`src/lib/import/framing-plan/apply.ts` ≈L148~190: 断面未登録·複数該当·種別相違·格子外 넷뿐).
- **B4** `Viewer3D.tsx`에서 `girderSupportSections`(≈L1373·1375)·`girderRun`(≈L1484)은 try 밖이지만, 같은 함수 안의 unsupported 조기 반환(≈L1400~1404, `useTakeoff().unsupportedMembers` 기반)보다 **뒤**에 있어, `unsupportedMembers`에 든 부재로는 호출되지 않는다. `building.ts`의 콘크리트 박스 루프(≈L130~200)는 `girderSpan`·`beamDepthAbove`를 부르지 않고, 배근 루프는 ≈L303에서 unsupported를 건너뛴 뒤 ≈L341에서 `girderSpan`을 부른다. 어느 하나라도 틀리면 refuted.
- **B5** `src/lib/i18n.test.ts`는 ①ja 키가 전부 ko에 있음(부분집합, ≈L18) ②`Record<UnsupportedReason, true>`로 reason 전부의 `takeoff.unsupported.reason.*`·`plan.*`를 양 로케일에서 `t()`로 확인(≈L29~47)한다. 따라서 `UnsupportedReason`에 값을 더하면 그 Record가 컴파일 오류로 갱신을 강제하고, ja 키가 빠지면 ②가 실패한다(「키 자체가 돌아온다」를 어떻게 잡는지 인용).
- **B6** 1판의 A6 재현(`step0-report-r1.json#/reproduction`)은 HEAD에서도 그대로다: `git log`로 `src/domain/model/project.ts`·`src/lib/import/**`가 1판 head `6ab8a36` 이후 바뀌지 않았음을 보이면 충분하다(재실행 불필요).

## 산출물
`phases/45-partial-import-unsupported/step0-report.json`(1판 파일명과 같다 — 1판은 `-r1`로 보관돼 있다):
```json
{ "verdict": "upheld|refuted", "round": 2,
  "claims": [{ "id": "B1", "status": "upheld|refuted", "evidence": [{ "source": "src/domain/model/project.ts#L1437", "note": "..." }] }],
  "paths_verified": ["src/domain/model/project.ts", "src/lib/hooks/useTakeoff.ts", "src/lib/viewer/building.ts", "src/components/viewer/Viewer3D.tsx", "src/lib/i18n.test.ts", "src/lib/import/framing-plan/apply.ts", "phases/45-partial-import-unsupported/step0-report-r1.json"] }
```

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step0-report.json
```

## 검증 절차
- 전부 성립 → step 0 `completed`, summary 한 줄. 무너짐 → `refuted`와 summary에 무엇이 무너졌는지. **고치지 마라.**

## 금지사항
- `src/`·`tests/`·`docs/`를 수정하지 마라. 이유: 반증 전용. 재현 테스트가 필요하면 `phases/45-partial-import-unsupported/` 안에 두되 vitest 기본 설정이 `phases/`를 포함하지 않으므로 1판처럼 임시 config로 돌리고 report에 그 config 내용을 적어라.
- 「돌려봤다」로 끝내지 마라. 각 주장은 줄 번호·명령·출력으로 증명한다.
