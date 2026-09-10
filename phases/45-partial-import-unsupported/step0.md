# Step 0: refute-spec — 이 phase의 전제를 코드로 반증한다 (verify · gate)

## 읽어야 할 파일
- `docs/ADR.md`의 ADR-046 (図面セット), `docs/ARCHITECTURE.md`
- `src/domain/model/project.ts` — `supportColumnSection`(≈L566~600), `girderSpan`(≈L604), `beamDepthAbove`(≈L1520~1550)
- `src/domain/model/unsupported.ts` — `UnsupportedReason`·`MemberUnsupportedError`와 그 파일 머리 주석
- `src/lib/hooks/useTakeoff.ts` — `buildTakeoff`의 try/catch 3곳
- `src/components/viewer/Viewer3D.tsx` ≈L1386~1410, `src/lib/viewer/building.ts` ≈L120·L303·L341
- `src/locales/ja.json`·`src/locales/ko.json`의 `takeoff.unsupported.*`, `src/lib/i18n.test.ts`
- `tests/drawing-set/apply.test.ts`(tsu 합성 테스트), `tests/e2e/uc24-drawing-set.js`
- `phases/44-drawing-set-assembly/orchestration-report.md`의 stage2-result (배경)

## 배경 (이 phase가 고치려는 것)
2026-09-10 브라우저 실측: 実物 PDF(`dwg-tsu-kanritou.pdf`·`dwg-yokohama.pdf`)를 図面セット으로 반영하면 부재는 놓이지만 곧바로 3Dビュー·数量内訳書 페인이 「このペインを表示できません — 入力を見直してください。」(`pane.failure`)로 비었다. 메시지는 각각 `Missing start support 柱 for 大梁: story-4-G1-0-0-X`(tsu)·`No touching 大梁 found above 柱: story-2-C51-0-0`(yokohama)다. 実物 도면은 断面 미등록·미인식 때문에 항상 **부분 취입**이므로, 이 두 검증이 plain `Error`인 한 어떤 실물 도면이든 같은 자리에서 죽는다. 이 phase는 두 검증을 부재 단위 `MemberUnsupportedError`로 낮춘다(뒤 스텝). 이 스텝은 그 전제가 코드와 맞는지 **반증만** 한다 — 고치지 마라.

## 작업 — 아래 주장 A1~A6을 각각 반증 시도하고, 하나라도 무너지면 `refuted`
- **A1** `src/domain/model/project.ts`에서 취입(`applyFramingPlan`·`applyDrawingSet`)이 만든 Project로 **도달 가능한** plain `throw new Error(`는 정확히 둘이다: `supportColumnSection`의 「Missing … support 柱」와 `beamDepthAbove`의 「No touching 大梁 found above 柱」. 파일의 모든 `throw new Error(`를 표로 만들어 「입력으로 도달 가능 / 내부 결함」으로 분류하고 근거를 적어라. 셋째 도달 경로가 있으면 그것에 도달하는 Project(JSON)를 붙여 refuted.
- **A2** `useTakeoff.ts`의 `buildTakeoff`는 柱·大梁·床板·耐震壁 생성마다 try/catch로 `MemberUnsupportedError`만 잡아 `unsupportedMembers`에 넣고, `beamDepthAbove`·`columnEnds`·`girderSpan`(大梁 경로) 호출이 그 try 안에 있다. 줄 번호로 증명.
- **A3** `Viewer3D.tsx`는 `useTakeoff().unsupportedMembers`에서 부재의 `unsupported` 상태를 만들고, `building.ts`의 `buildingLayout`은 `unsupportedMemberIds`에 든 부재를 `girderSpan` 호출 **전에** 건너뛴다(L303 vs L341). 즉 두 throw를 `MemberUnsupportedError`로 바꾸면 3D·数量 페인은 그 부재만 빼고 렌더된다. 다른 경로에서 같은 함수를 try 밖에서 부르는 곳이 있으면 refuted — `grep -rn "girderSpan\|beamDepthAbove\|columnEnds\|girderSupportSections" src --include=*.ts --include=*.tsx`로 전수 조사.
- **A4** `ja.json`·`ko.json`에 기존 4개 reason의 `takeoff.unsupported.reason.*`·`plan.*`가 있고, `src/lib/i18n.test.ts`가 두 로케일의 키 동일성을 검사한다(무엇을 검사하는지 인용).
- **A5** `tests/drawing-set/apply.test.ts`의 tsu 합성 테스트는 부재 ≥1을 단언하지만 takeoff를 돌리지 않고, `uc24-drawing-set.js`는 반영 뒤 패널을 닫지도 페인 상태를 단언하지도 않는다.
- **A6 (재현)** tsu 합성 테스트와 같은 순서(`assembleDrawingSet`→`resolveDrawingSetPlan`→`applyDrawingSet`, 샘플 案件, `discardMembers`)로 만든 Project에 `useTakeoff.ts`의 순수 계산을 돌리면 **plain Error**(`Missing start support 柱`)가 난다. `buildTakeoff`가 export되어 있지 않으면 `src/domain`의 함수(`girderSpan` 등)를 그 Project의 大梁에 직접 호출해 같은 메시지를 확인하고, 검증용 테스트를 `phases/45-partial-import-unsupported/step0-repro.test.ts`로 두어라. 메시지 전문을 기록. 나지 않으면 이 phase의 전제가 틀린 것이므로 refuted.

## 산출물
`phases/45-partial-import-unsupported/step0-report.json`:
```json
{ "verdict": "upheld|refuted",
  "claims": [{ "id": "A1", "status": "upheld|refuted", "evidence": [{ "source": "src/domain/model/project.ts#L566", "note": "..." }] }],
  "throw_census": [{ "line": 592, "message": "...", "class": "input-reachable|internal", "why": "..." }],
  "reproduction": { "command": "...", "error": "..." },
  "paths_verified": ["src/domain/model/project.ts", "src/lib/hooks/useTakeoff.ts", "src/lib/viewer/building.ts", "src/components/viewer/Viewer3D.tsx", "src/locales/ja.json", "src/locales/ko.json"] }
```
`python scripts/check-citations.py phases/45-partial-import-unsupported/step0-report.json`이 0으로 끝나야 한다.

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step0-report.json
npx vitest run phases/45-partial-import-unsupported/step0-repro.test.ts   # 만들었다면 — 「plain Error가 난다」를 단언하는 테스트라 통과가 곧 재현
```

## 검증 절차
- 전부 성립 → `index.json` step 0을 `completed`, summary에 census 수·재현 메시지 한 줄.
- 하나라도 무너짐 → `refuted`와 `summary`에 무엇이 무너졌는지. **고치지 마라** — 검증자가 구현자가 되면 교차검증이 무너진다.

## 금지사항
- `src/`·`tests/`·`docs/`를 수정하지 마라. 이유: 이 스텝은 반증 전용이다. 유일한 예외는 위 `step0-repro.test.ts`(phase 디렉터리 안).
- 「돌려봤다」로 끝내지 마라. 각 주장은 줄 번호·명령·출력으로 증명한다.
