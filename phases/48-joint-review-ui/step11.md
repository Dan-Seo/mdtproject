# Step 11 (verify): refute-ui — phase 48 전체를 반증한다. **고치지 마라.**

어긋남을 찾으면 status `refuted`＋`summary`＋`step11-report.json`. 대상을 고치지 마라. 반증이 성립하지 않으면 `completed`. 각 항목은 **실행 가능한 오라클과 실패 조건**을 가진다 — 「보였다」는 근거가 아니다. 브라우저 e2e·perf의 재실행은 이 step의 범위가 아니다(Claude가 별도로 재실행한다) — step 8·9 report의 **정합성**만 본다.

## 항목
1. **범위** — 오라클: `git diff --stat e1031a2..HEAD` 파일 목록. 실패 조건: `src/app/` 아래 새 라우트 디렉터리, `package.json` dependencies 변경, `src/rulepack/**` 변경, `src/domain/rebar/**`·`src/domain/quantity/**` 변경, `src/lib/telemetry.ts` 변경, `capture(` 호출의 새 이벤트 문자열(`git diff e1031a2..HEAD -- src | grep "^+.*capture("`이 비어야 함).
2. **数量 불변** — 오라클: 별도 worktree에서 `e1031a2`와 HEAD 각각 `buildTakeoff(createSampleProject())`·`buildTakeoff(stress(4,3,2))`의 `lines` JSON을 파일로 쓰고 sha256 비교. 실패 조건: 한 바이트라도 다름.
3. **표시부가 판정하지 않는가** — 오라클 둘: (가) `grep -rn "lookupRule(\|girderSpan(\|capsuleClearanceMm(\|memberDependencies(\|memberInputs(" src/components/review src/components/viewer/Viewer3D.tsx src/lib/hooks/useReviewModel.ts`; (나) 같은 파일들의 `import` 줄에 `@/rulepack`·`@/domain/review/dependency`·`segment-distance`(Viewer3D의 `closestPointsBetweenSegments`는 마커 위치용으로 허용)·`@/domain/rebar` 경로가 없는가(`useReviewModel`의 `jpMlitRulePack` import는 `projectFingerprints` 인자용으로 허용). 실패 조건: (가) 1건 이상 또는 (나) 허용 외 import 1건 이상(alias·wrapper로 우회한 것도 (나)로 잡는다).
4. **UI 반례** — 각각 컴포넌트 테스트를 **실행**해 발췌(`npx vitest run <파일> --reporter=json`):
   (1) 干渉候補 행 클릭 → `setReviewFocus`의 segments 둘 다 non-null이고 point가 finding의 `pa`·`pb` 중점과 `toBeCloseTo`. 실패: null 또는 다른 점.
   (6) `viewerClip`·`viewerPose`·`notes` 변경 후 `data-review-status` 텍스트 불변. 실패: 변화.
   (10) 断面 변경 후 `data-package-state`가 `準備完了`가 아님. 실패: `準備完了`.
   (13) 키 입력마다 `setReview` — 텍스트 입력 7종(あき·메모·title·body·担当者·label·reason)에 대해 타이핑 5회 후 spy 호출 0을 검사하는 테스트가 **각각 존재하고 통과**하는가. 실패: 7종 중 하나라도 테스트 부재 또는 실패.
   (14) 각 step의 `mutations` 보고 중 하나를 골라 **실제로 그 변이를 넣고** 보고된 테스트가 실패하는지 확인(되돌린다). 실패: 변이를 넣어도 통과.
5. **e2e report 정합성** — 오라클: `phases/48-joint-review-ui/step8-report.json`의 `checks`가 19키 전부 `true`이고, `tests/e2e/uc25-joint-review.js`에 그 19키가 실제로 `checks.<name> =`으로 존재하는가; 7·14·15·17·18의 부정 assertion이 코드에 있는가(예: 18이 `reviewSchemaVersion`을 바꾸고 `読み込めませんでした`를 찾는가). 실패 조건: 키 누락·false·부정 assertion 부재.
6. **perf report 정합성** — 오라클: `step9-report.json`의 `perf_browser.sample`·`stress5`에 4개 측정 중앙값이 숫자로 있고 README 결정 9 이내이며 `conditions`에 headless·기기·회수가 적혀 있는가. 실패 조건: 부재·초과·`budget_met`과 수치의 모순.
7. **문구** — 오라클: 컴포넌트 테스트의 `data-*` 요소 검사(step 4·5·7)와 uc25 19 check. 실패 조건: 금지어 존재 또는 고지문 부재. 페이지 전체 grep은 오라클이 아니다(README 결정 4).
8. **문서 일치** — CLAUDE.md＝AGENTS.md 해당 절 `diff` 비어야 함; ADR-049 10문장·R18 존재; `reviewSchemaVersion`이라는 이름으로 적혀 있는가(`review.version` 없음); step 10 report `cited`의 각 claim이 인용 source에 실제로 있는지(`check-citations.py` 0); `grep -c "4D\|BCF" src/domain/review/types.ts src/lib/persist/indexeddb.ts`가 0.
9. **원어 리터럴** — 오라클: `grep -rln "\\\\u[0-9a-fA-F]\{4\}" src/components/review src/lib/review src/lib/hooks/useReviewModel.ts tests/e2e/uc25*.js`. 실패 조건: 1파일 이상.
10. **저장 계약** — 오라클: `src/lib/persist/file.test.ts`·`indexeddb.test.ts`가 HEAD에서 통과하고, `readProjectFile`에 `reviewSchemaVersion: 2`인 JSON을 주면 throw 하는 테스트가 존재하는가(phase 47 것이면 그대로 인정). 실패 조건: 부재·실패.

## Acceptance Criteria
```bash
npx vitest run && npm run test:golden && npx tsc --noEmit && npm run lint
python scripts/check-citations.py phases/48-joint-review-ui/step*-report*.json
```

## 산출물
`step11-report.json`: `{ "verdict": "upheld" | "refuted", "checks": [{ "item": n, "oracle": "...", "result": "...", "passed": bool | null }], "mutation_tried": { "step": n, "mutation": "...", "failed_tests": [...] }, "paths_verified": [...] }`

## 금지사항
- 고치지 마라. 실행하지 않은 검증을 했다고 쓰지 마라. 실행 못 한 항목은 `"passed": null`과 사유.
- 변이(4-(14))는 반드시 되돌려라 — `git status`가 깨끗해야 한다(report 파일 제외).
