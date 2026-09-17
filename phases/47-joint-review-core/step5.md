# Step 5 (verify): refute-core — step 1~4를 반례로 반증한다. **고치지 마라.**

이 step은 검증 전용이다. 어긋남을 찾으면 status를 `refuted`로 두고 `summary`와 `step5-report.json`에 무엇이 어긋났는지 적어라. 대상을 고치지 마라 — 고치면 검증자가 구현자가 된다. 어긋남이 없으면 `completed`.

## 읽어야 할 것
- `phases/47-joint-review-core/README.md`(결정 1~9)와 step1~4.md의 「금지사항」
- step1~4-report.json (자기 보고다 — 믿지 말고 대조하라)
- `git diff main...HEAD --stat`과 각 파일 diff

## 반증 항목 (각각 실제로 실행하고 결과를 report에)
1. **범위**: diff에 사양에 없는 파일·기능(컴포넌트, 새 이벤트 `capture(`, 룰팩 YAML 변경, `PROJECT_SCHEMA_VERSION`·`DATABASE_VERSION` 변경, `Project` 타입 필드 추가)이 있는가. `git diff main...HEAD -- src/rulepack tests/golden/fixtures src/domain/rebar src/domain/quantity`가 `ruleIdentity` export 외에 비어 있는가.
2. **数量 불변**: `npm run test:golden` 통과, 그리고 main과 HEAD에서 `buildTakeoff(createSampleProject())`·`createStressProject({xSpanCount:4,ySpanCount:3,storyCount:2})`의 `lines`를 JSON으로 덤프해 **바이트 동일**(임시 스크립트 `npx tsx`로. main 쪽은 `git stash`가 아니라 `git worktree add`로 별도 트리에서 돌려라 — 실행 중 트리를 바꾸지 마라).
3. **순수성**: `src/domain/review/**`에 `@/lib`·`react`·`three`·`Date.now`·`crypto` 문자열이 없다(`grep`). `src/lib/review/**`에 `@/components`·`react`·`three` 없음.
4. **변이 재현**: 각 step report의 `mutations`에서 하나씩 골라(총 4건) 실제로 그 변이를 넣고 지목된 테스트가 빨개지는지 확인 후 `git checkout --`로 원복. 빨개지지 않으면 refuted.
5. **반례 — 12개 완료 조건 중 코어에서 판정 가능한 것**:
   - (2) 떨어진 형상 미검출: 샘플 접합부 下端筋 X/Y 쌍 clearance를 직접 계산한 값이 finding에 없는가(기준 미입력 시).
   - (3) 継手位置 등 정보 부족이 `unchecked`에 남는가. verdict 타입에 총괄 합격 값이 없는가.
   - (4) 제외 범위 밖 간섭이 남는가(帯筋↔主筋 제외 상태에서 大梁 교차 干渉候補 유지).
   - (5)(6) `section-G2` 피치 변경 시 `joint 1F-X2Y2` 항목은 유효하고 G2 대상 항목만 재검토; 案件名·備考·xLabels 변경·`ClipState`·pose 변경으로 어떤 항목도 무효화되지 않는가.
   - (7) X-Ray의 `quantity.designCount`·`designLengthMm`가 `Rebar.count`·`length`와 같고 `shape`와 다른 필드인가.
   - (8) `unitMass` 미입력 행이 `LineChange.mass`에서 `単位質量未入力`로, 값 0으로 나오지 않는가. 未対応 부재가 fingerprint `result: null`로 정상 부재와 구분되는가.
   - (9) `serializeProjectFile` → `readProjectFile` round-trip 후 `items[].targets`·`snapshot.fingerprints`·`packages`가 `toEqual`이고, 빈 review 파일이 구 형식과 문자열 동일한가.
   - (10) 필수 체크리스트가 확인된 패키지가, 대상 柱 断面 변경 후 `準備完了`를 유지하지 않는가.
   - (11) id가 바뀐 부재가 `対応要確認`으로 나오는가(삭제＋추가 아님); review 版 `2` 파일이 throw하는가.
   - (12) 같은 입력의 `runGeometryCheck` 두 번이 `toEqual`이고 `rebarRadius`로 만든 레이아웃과 좌표가 다른가.
   각 항목은 `npx tsx` 임시 스크립트 또는 임시 테스트 파일로 **실행**하고, 원복한다(커밋에 남기지 않는다). 출력값을 report에 붙여라.
6. **테스트의 반증 가능성**: `src/domain/review/*.test.ts`·`src/lib/review/*.test.ts` 중 「구현 결과를 그대로 스냅샷해 통과시키는」 테스트(값을 계산해 기대값으로 쓰는 `expect(x).toEqual(x)` 류)가 있는가. 있으면 refuted 사유.
7. **문구**: 코드·타입에 「合格」「安全」「施工可能」「承認」이 판정 값으로 존재하는가(`grep`). 「確認済」 주석이 체크리스트 충족임을 밝히는가.

## Acceptance Criteria
```bash
npx vitest run
npm run test:golden
npx tsc --noEmit
npm run lint
python scripts/check-citations.py phases/47-joint-review-core/step*-report*.json
```

## 산출물
`step5-report.json`: `{ "verdict": "upheld" | "refuted", "checks": [{ "id": 1..7, "result": "pass" | "fail", "evidence": "..." }], "counterexamples_run": [{ "case": 2, "command": "...", "output_excerpt": "..." }], "mutations_reproduced": [...], "paths_verified": [...] }`

## 금지사항
- 찾은 것을 고치지 마라. 이유: 교차검증 — 만든 쪽이 자기 것을 승인하지 않는 것과 같은 원리로, 검증자가 구현자가 되면 검증이 사라진다.
- 「돌려봤다」「통과했다」로 끝내지 마라 — 항목마다 실행한 명령과 출력 발췌.
- 실행하지 않은 검증을 했다고 쓰지 마라.
