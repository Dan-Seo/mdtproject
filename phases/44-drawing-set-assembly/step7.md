# Step 7 (검증 전용): step 1〜6을 반증하라

너는 검증자다. **대상을 고치지 마라.** 어긋나면 그대로 두고 무엇이 어긋났는지 적어라. 아래 각 항목은
**성립해야 할 성질**이다. 항목마다 `{id, holds, method, evidence}`를 `step7-report.json`에 적어라. 하나라도
성립하지 않으면 `verdict: refuted`(재시도 없는 정상 종결). 전부 성립하면 `upheld`.

## 검증 범위 (D5)

이 phase가 **넣거나 바꾼 것**만이다 — `src/lib/import/story-label.ts`의 `levelStoryKey`·`storyNameKey`, `src/lib/import/drawing-set/`,
`tests/drawing-set/`, `PlanImport.tsx`의 図面セット 절과 로케일 키, `tests/e2e/uc24-drawing-set.js`, step 6의 문서. 기준 커밋은
`step1-report.json#/baseline_commit`(`$BASE`)이다. 하네스가 쓰는 `phases/44-drawing-set-assembly/index.json`·`step*-invoke.json`·
`step*-codex.*.log`는 네가 쓴 것이 아니므로 청결 검사에서 뺀다. 비우거나 되돌리려 하지 마라. 시작 시 ① `git status --porcelain --untracked-files=all`을 `baseline_status`에, ② 그 목록의 모든 dirty·미추적 파일의 sha256을 `baseline_hashes`에 기록한다. 항목 10의 「이 phase가 바꾼 경로」＝`$BASE` 대비 diff·미추적 경로 중 **step 1의 `baseline_status`에 없던 것** ∪ **step 1의 `baseline_hashes`와 hash가 다른 것**이다(status 문자만 같다고 빼지 않는다 — 시작부터 ` M`이던 파일을 phase 중 다시 바꾼 경우를 잡는다). 네가 변조한 파일은 전·후 sha256 동일을 단언한다.

## 성질

1. **파서 출력이 불변이다.** 현재 작업 파일의 세 파서를 36면(`tests/fixtures/section-import/textitems/*.json`)에 돌려
   `sha256(canonical JSON of {lists, plan, elevations})`(키 정렬·공백 없음)를 면별로 계산하고, `step1-report.json#/parser_output_hashes`(step 1이
   **시작 시점 작업 파일**로 기록한 것)와 36건 전부 같다. HEAD `$BASE`와 비교하지 않는다 — 시작부터 파서에 미커밋 변경이 있었다면 그것을 보존한
   것이 정상이다. 다르면 「이 phase가 파서를 바꿨다」는 반증이다(이 phase는 파서를 바꾸지 않는다).
2. **`levelStoryKey`가 문법 표대로다.** `step2-report.json#/grammar_table`의 각 행을 네가 직접 호출해 같은 값이 나오고, `storyKey`의 기존
   테스트 행(PH·B1F 거부 포함)도 그대로다.
3. **조립이 골든 2판을 지키고 knownGaps가 stale하지 않다.** 다섯 세트에 대해 3단 단언(리프·index 단위: 출력 리프가 전부 골든에 — `extra`·`both` 하위 트리 제외 / 골든 리프가 전부 출력에 —
   `missing`·`both`·`unsure` 하위 트리 제외 / knownGaps 각 항목이 방향대로 stale하지 않음: `missing`은 골든 리프 1개 이상 부재·상이, `extra`는 출력 리프 1개 이상 부재·상이, `both`는 둘 다)을 **네가 다시** 돌려 같은 결론이다. `blocking` 충돌의 코드가 `通り芯不一致`·`階重複ブロック`뿐이다.
4. **변이 검사 — 청구된 경로에 대해.** `tests/drawing-set/claims.ts`의 `CLAIMED`에서 세트별로 하나 이상을 골라(참고 전용 경로는 고르지 않는다)
   골든 값을 바꾸면 그 경로를 청구한 테스트가 실패한다. 그리고 `reconcileAssessments`의 通り芯 비교를 항상 「같다」로, 중복 판정을 항상
   「없다」로, `resolveDrawingSetPlan`의 blocking 검사를 건너뛰게 각각 바꾸면 해당 테스트가 실패한다. 각 변조는 원복하고 **변조한 파일의**
   전후 sha256이 같음을 보여라.
5. **구현이 골든에 맞춰 조작되지 않았다 — 성질로 본다(D4).** ① fixture 이름·source 문자열·페이지 번호 상수가 `src/lib/import/drawing-set/`의
   제품 결과를 바꾸지 않는다(그런 분기가 있으면 줄을 적어라). ② 테스트의 사영이 파서·조립 출력의 순서를 바꾸지 않는다. ③ Story 이름·レベル명을
   조립 계층이 만들지 않고 `applyElevation`에서 얻는다. 코드 토큰(`reverse`·`sort`)의 유무는 검색 단서일 뿐 refuted 조건이 아니다 —
   `Project.stories` 순서를 위한 정렬은 합법이다.
6. **반영이 부재를 만든다.** `step4-report.json#/members_created`가 1 이상이고 네가 같은 픽스처로 재현하면 같은 수다. 중복 블록 둘을 수동으로
   같은 Story에 두면 계획이 거부된다(부재가 조용히 교체되지 않는다).
7. **골든·픽스처·ADR 본문이 동결됐다.** `step0-report.json#/frozen_manifest`의 각 파일 sha256이 현재와 같다. `docs/ADR.md`만 예외 —
   ADR-046 보충 소절 **앞까지**의 바이트가 같고 그 뒤에만 추가가 있다.
8. **거울 문서가 같다.** `CLAUDE.md`·`AGENTS.md`의 「도면 인식(로컬)」·R10·R15 행이 서로 같다.
9. **인용이 닿는다.** `python scripts/check-citations.py phases/44-drawing-set-assembly/step*-report*.json`이 0. step 6이 문서에 쓴 수치마다 포인터가
   해석되고 값이 같은지 건별 대조하고 개수를 적어라.
10. **바뀐 경로가 허용 집합에 든다.** 위 정의의 「이 phase가 바꾼 경로」 각각이 `phases/`, `src/lib/import/story-label.ts`·
    `story-label.test.ts`, `src/lib/import/drawing-set/`, `src/components/plan/`, `src/locales/`, `tests/drawing-set/`, `tests/e2e/`, `docs/`,
    `CLAUDE.md`, `AGENTS.md` 중 하나에 든다. `src/domain/`·파서 파일·`tests/fixtures/`가 없다.
11. **e2e가 두 단계를 밟는다.** `step5-report.json#/e2e`에 `phase1_conflict_seen: true`와 `phase2_spans`가 있고, `uc24`에 파일명·페이지 번호로
    면을 버리는 제품 로직이 없다(면 선택은 testid 조작이다).
12. **전 게이트.** `npx vitest run`·`npm run lint`·`npx tsc --noEmit`·`npm run build`가 0. 빌드 전에 `next dev`가 떠 있지 않은지 확인하라.

## 하지 말 것

- 대상을 고치지 마라. 이유: 검증자가 구현자가 되면 교차가 무너진다.
- 파서 출력에서 골든을 유도하지 마라(ADR-010). `knownGaps`를 늘리지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `step7-report.json`: `verdict`, `base_commit`, `claims`(1〜12), `mutations[]`(파일·sha256 전후·실패한 테스트명), `paths_verified`,
  `paths_expected_absent`(부재가 결론인 경로만).
- `python scripts/check-citations.py phases/44-drawing-set-assembly/step7-report.json`이 0.

## 기록 규칙

- `paths_verified`＝읽으려고 존재를 확인한 경로, `paths_expected_absent`＝부재가 결론인 경로. 섞지 마라.
- 검증 명령 인자에 한글·일본어를 넣지 마라. 파일 단위로 돌리고 JSON 리포터에서 골라라.
