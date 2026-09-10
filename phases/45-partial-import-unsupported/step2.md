# Step 2: takeoff-import-tests — 페인의 데이터 경로가 부재 단위로 강등되는 것을 테스트로 고정한다

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step1-report.json`과 step 1이 바꾼 파일, `step0-report-r1.json#/counterexample`
- `src/lib/hooks/useTakeoff.ts`(`computeTakeoff`·`buildTakeoff`·`TakeoffResult.unsupportedMembers`), `src/lib/hooks/useTakeoff.test.tsx`
- `src/lib/viewer/building.ts`(`buildingLayout(project, …, unsupportedMemberIds)`), `src/lib/viewer/building.test.ts`
- `src/components/viewer/Viewer3D.tsx` ≈L1400~1404·L1484·L1568 (unsupportedMemberIds의 출처와 조기 반환)
- `tests/drawing-set/apply.test.ts`(tsu 합성), `src/lib/import/framing-plan/apply.test.ts`(伏図 반영 픽스처)
- `src/domain/model/sample-project.ts`

## 작업 (TDD)
1. `useTakeoff.ts`에서 순수 계산을 export한다(`export function buildTakeoff(project): TakeoffResult` 또는 `computeTakeoff`) — 훅의 memo 동작은 바꾸지 않는다.
2. `src/lib/hooks/useTakeoff.test.tsx`: 샘플 案件에 ① 終端 柱가 없는 大梁 ② 닿는 大梁이 없는 柱를 더한 Project → throw 없음, `unsupportedMembers`에 둘이 각각 `支持柱なし`·`上部大梁なし`, 나머지 부재의 `lines`는 더하기 전과 같다(개수·합계). ③ 1판 counterexample(같은 通り에 인접한 G1·G2, 柱 셋 다 있음) → throw 없음, `unsupportedMembers`는 비어 있고 G1·G2가 **각각** 런으로 `lines`에 나온다(大梁 행 2개, 定着이 양쪽 끝에 붙는 것을 행으로 확인).
3. `src/lib/viewer/building.test.ts`: ①②의 Project로 `buildingLayout(…, new Set([두 id]))`가 throw 없이 성립하고 두 부재의 배근 인스턴스가 없다. `unsupportedMemberIds`가 `useTakeoff().unsupportedMembers`에서 오는 것을 `Viewer3D.tsx`의 줄로 report에 인용.
4. `tests/drawing-set/apply.test.ts`: tsu 합성 결과 Project에 1의 순수 계산을 돌려 → throw 없음, 반영된 2FL 大梁 6개가 전부 `unsupportedMembers`에 있고 reason은 전부 `支持柱なし`(柱가 하나도 없으므로 — 인접 G1·G2는 이제 런이 갈려 mixed로 죽지 않는다), 다른 階의 `lines`는 그대로.
5. `src/lib/import/framing-plan/apply.test.ts`: 柱 断面만 등록된 상태로 伏図 블록을 반영해(大梁 符号은 `断面未登録`로 skip) 만들어진 Project에 순수 계산 → throw 없음, 柱들이 `上部大梁なし`.

## Acceptance Criteria
```bash
npx vitest run src/lib/hooks/useTakeoff.test.tsx src/lib/viewer/building.test.ts tests/drawing-set/apply.test.ts src/lib/import/framing-plan/apply.test.ts
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`phases/45-partial-import-unsupported/step2-report.json`: `{ "tests_added": [...], "export_added": "...", "viewer_source_citation": { "source": "src/components/viewer/Viewer3D.tsx#L…" }, "paths_verified": [...] }`

## 금지사항
- 파서·`applyFramingPlan`·`applyDrawingSet`의 동작을 바꾸지 마라. 이유: 이 phase는 엔진 오류 등급·런 조건과 그 소비자만 다룬다. 취입 결과가 테스트에 안 맞으면 테스트를 옮기지 말고 `blocked`.
- 픽스처·골든을 수정하지 마라. 이유: 값은 원문 전사다(ADR-010).
- 테스트 안에서 부재를 「보기 좋게」 추가해 unsupported를 없애지 마라 — 이 스텝의 목적은 **불완전한 Project가 죽지 않는 것**을 고정하는 것이다.
