# Step 5: refute-phase — phase 45 산출물을 독립 검증한다 (verify)

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step0.md`~`step4.md`와 각 `step*-report.json`(`step0-report-r1.json`·`step0-report-r2.json` 포함)
- 이 phase 브랜치의 diff: `git diff main...HEAD --stat` 및 전체

## 작업 — 아래 주장을 반증 시도한다. 하나라도 무너지면 `refuted`
- **C1 범위**: diff가 건드린 경로가 `src/domain/model/{project.ts,unsupported.ts,project.test.ts}`, `src/lib/hooks/useTakeoff{.ts,.test.tsx}`, `src/lib/viewer/building.test.ts`, `src/lib/import/framing-plan/apply.test.ts`, `tests/drawing-set/apply.test.ts`, `tests/e2e/uc24-drawing-set.js`, `src/locales/{ja,ko}.json`, `src/lib/i18n.test.ts`, `docs/{ADR,RISKS,MILESTONES}.md`, `CLAUDE.md`, `AGENTS.md`, `phases/45-*/**`의 밖으로 나가지 않았다(片持 테스트 조정 등 step 1 report가 밝힌 예외는 허용하되 나열). `src/lib/import/**`의 비테스트 파일·`tests/fixtures/**`·`src/rulepack/**`·`src/domain/quantity/**`·`src/domain/rebar/**`(테스트 제외)은 0줄 변경.
- **C2 순수성**: `src/domain/**`는 React·DOM·three·next를 import하지 않는다. 새 `.ts` 줄에 규준 수치 리터럴이 없다.
- **C3 반증 가능성(변이)**: 아래 변이를 각각 넣고 vitest를 돌려 **step 1·2가 추가·대체한 테스트가 빨갛게 되는지** 확인하고 원복한다. 하나라도 초록이면 refuted.
  - M1 `supportColumnSection`의 `MemberUnsupportedError`를 plain `Error`로
  - M2 `beamDepthAbove`의 `MemberUnsupportedError`를 plain `Error`로
  - M3 `ja.json`에서 `takeoff.unsupported.reason.支持柱なし` 삭제(`i18n.test.ts`가 잡아야 한다)
  - M4 `building.ts`의 `if (unsupportedMemberIds.has(member.id)) continue` 삭제
  - M5 `girderRun`의 `candidate.sectionId === member.sectionId` 조건 삭제(인접 G1·G2 테스트와 counterexample 테스트가 잡아야 한다)
  원복 후 `git status --short`가 report 파일 외에 비어 있어야 한다.
- **C4 e2e**: step 3 report의 체크 14개가 전부 true이고 `exit_code` 0이며, `uc24-drawing-set.js`에 4개 새 체크 이름이 실제로 있다. 시간이 허락하면 M1을 넣은 채 build→dev→e2e를 한 번 돌려 `panesRenderAfterApply`가 false가 되는지 본다(하지 못했으면 `limits`에 이유).
- **C5 문서**: ADR-047·R17이 있고 CLAUDE.md·AGENTS.md의 「도면 인식(로컬)」 행과 R17 행이 동일하다. `python scripts/check-citations.py phases/45-partial-import-unsupported/step*-report*.json`이 0으로 끝난다.
- **C6 게이트 기준선**: `npm run lint`·`npx tsc --noEmit`·`npx vitest run`이 이 브랜치 HEAD에서 통과한다(전체 테스트 수 기록).
- **C7 런 분할의 의미**: 인접 G1·G2(지점 다 있음)의 `lines`에서 두 大梁의 定着이 각각 양 끝에 계상되고, 같은 断面 둘을 이었을 때는 중간 柱에 定着이 없다(기존 通し筋 동작 유지) — step 2의 ③ 테스트 또는 직접 계산으로 확인.
- **C8 미룬 자리**: 2판 counterexample(`step0-report-r2.json#/counterexample`)은 이 브랜치 HEAD에서도 여전히 plain `Error`로 멎는다(고치지 않았음이 문서와 일치) — 임시 config로 한 번 재현.

## 산출물
`phases/45-partial-import-unsupported/step5-report.json`: `{ "verdict": "upheld|refuted", "base_commit": "...", "claims": [{ "id": "C1", "status": "...", "evidence": [...] }], "mutations": [{ "id": "M1", "failing_tests": [...], "restored": true }], "gates": { "lint": 0, "tsc": 0, "vitest": { "passed": n, "files": m } }, "paths_verified": [...], "limits": [...] }`

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step5-report.json
git status --short   # step5-report.json 외 비어 있음(변이 원복 확인)
```

## 금지사항
- 고치지 마라 — 어긋나면 `refuted`로 두고 무엇이 어긋났는지 적어라. 이유: 검증자가 구현자가 되면 교차검증이 무너진다.
- 변이를 넣은 채로 끝내지 마라. 원복은 `git checkout -- <file>`로.
