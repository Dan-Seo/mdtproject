# Step 2: takeoff-import-tests — 페인의 데이터 경로가 부재 단위로 강등되는 것을 테스트로 고정한다

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step1-report.json`과 step 1이 바꾼 파일
- `src/lib/hooks/useTakeoff.ts`(`computeTakeoff`·`buildTakeoff`·`TakeoffResult.unsupportedMembers`), `src/lib/hooks/useTakeoff.test.tsx`
- `src/lib/viewer/building.ts`(`buildingLayout(project, …, unsupportedMemberIds)`), `src/lib/viewer/building.test.ts`
- `src/components/viewer/Viewer3D.tsx` ≈L1386~1410·L1568 (unsupportedMemberIds의 출처)
- `tests/drawing-set/apply.test.ts`(tsu 합성), `src/lib/import/framing-plan/apply.test.ts`(伏図 반영 픽스처)
- `src/domain/model/sample-project.ts`

## 작업 (TDD)
1. `useTakeoff.ts`에서 순수 계산을 export한다(`export function buildTakeoff(project): TakeoffResult` 또는 `computeTakeoff`) — 훅의 memo 동작은 바꾸지 않는다.
2. `src/lib/hooks/useTakeoff.test.tsx`: 샘플 案件에 ① 終端 柱가 없는 大梁 ② 닿는 大梁이 없는 柱를 더한 Project로 → throw 없음, `unsupportedMembers`에 둘이 각각 `支持柱なし`·`上部大梁なし`로 들어가고, 나머지 부재의 `lines`는 두 부재를 더하기 전과 같다(개수·합계 비교).
3. `src/lib/viewer/building.test.ts`: 위 Project로 `buildingLayout(…, new Set([두 id]))`가 throw 없이 성립하고 두 부재의 인스턴스가 없다. 그리고 `unsupportedMemberIds`가 `useTakeoff().unsupportedMembers`에서 오는 것을 `Viewer3D.tsx`의 코드 줄로 report에 인용(테스트 패턴이 없으면 인용만).
4. `tests/drawing-set/apply.test.ts`: tsu 합성 결과 Project에 1의 순수 계산을 돌려 → throw 없음, `unsupportedMembers`가 반영된 大梁 6개(2FL)와 일치하고 reason 전부 `支持柱なし`, 다른 階의 `lines`는 그대로.
5. `src/lib/import/framing-plan/apply.test.ts`: 柱 断面만 등록된 상태로 伏図 블록을 반영해(大梁 符号은 `断面未登録`로 skip) 만들어진 Project에 순수 계산을 돌려 → throw 없음, 柱들이 `上部大梁なし`.

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
- 파서·`applyFramingPlan`·`applyDrawingSet`의 동작을 바꾸지 마라. 이유: 이 phase는 엔진 오류 등급과 그 소비자만 다룬다. 취입 결과가 테스트에 안 맞으면 테스트를 옮기지 말고 `blocked`.
- 픽스처·골든을 수정하지 마라. 이유: 값은 원문 전사다(ADR-010).
- 테스트 안에서 부재를 「보기 좋게」 추가해 unsupported를 없애지 마라 — 이 스텝의 목적은 **불완전한 Project가 죽지 않는 것**을 고정하는 것이다.
