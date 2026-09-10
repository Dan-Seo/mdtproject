# Step 1: size-in-line-key — 数量行의 鍵에 径을 넣어 같은 이름의 階 충돌을 없애고, 저장된 備考는 구 鍵으로도 찾는다

## 읽어야 할 파일
- `docs/RISKS.md` R17, `docs/ADR.md` ADR-019·ADR-040(数量 鍵과 3D 형상 분리, `points`가 鍵에 들어가는 이유)·ADR-047 ④
- `phases/45-partial-import-unsupported/step0-report-r2.json#/counterexample`(재현 Project와 오류 메시지), `step0-repro-r2.test.ts.txt`
- `src/domain/quantity/index.ts` — `quantityLineId`(≈L193~202)·`spliceLineId`(≈L208~215)·`aggregateQuantity`의 일관성 검사(≈L281~293, 「Inconsistent size or shape」·「Inconsistent quantity rules」)
- `src/domain/model/project.ts` — `memberGroupKey`(≈L180, `story.name` 기반 — **바꾸지 않는다**), `Project.notes` 주석(≈L108), `setNote`(≈L1545)
- `src/domain/model/rebar.ts` ≈L114~122(鍵 안정성과 저장된 備考에 대한 주석)
- 備考 독자: `src/components/quantity/TakeoffPane.tsx` ≈L214(`NoteInput`), `src/lib/export/index.ts` ≈L406
- 테스트: `src/domain/quantity/index.test.ts`(鍵 문자열을 고정한 곳 ≈L190·L486), `src/domain/model/project.test.ts`(`setNote` 블록 ≈L1488, 備考 round-trip ≈L1265), `src/lib/export/index.test.ts` ≈L193, `src/components/quantity/TakeoffPane.test.tsx`

## 배경
数量積算基準 1通則 前文은 「規格、形状、寸法等ごとに」 집계하라고 한다. 현재 `quantityLineId`는 役割·設計長さ·本数·継手·形状(points)을 鍵에 넣지만 **規格(径, `Rebar.size`)은 넣지 않고**, 대신 같은 鍵에 다른 径이 오면 plain `Error`로 계산 전체를 멈춘다. 같은 이름의 階가 둘(`memberGroupKey`가 `story.name`을 쓴다)이고 같은 符号에 径이 다른 断面이면 취입 案件으로 도달한다(R17). 径은 規格이므로 鍵에 들어가는 것이 조문에 맞고, 그러면 충돌 자체가 없어져 두 행으로 갈린다.

鍵 형식이 바뀌면 저장된 案件의 `Project.notes`(備考, 鍵＝`QuantityLine.id`)가 행에서 떨어진다. `schemaVersion`은 올리지 않는다(`deserializeProject`가 버전 동일을 요구해 올리면 저장 案件 전부가 거부된다). 대신 **읽기에서 구 鍵으로 fallback**하고, **쓰기에서 새 鍵으로 옮긴다**.

## 작업 (TDD — 테스트를 먼저 빨갛게 만들고 구현)
1. **테스트 먼저** `src/domain/quantity/index.test.ts`:
   - `quantityLineId`가 `径${rebar.size}` 세그먼트를 **맨 끝**에 붙인다: `${groupId}|${role}|${length}|${count}${継手}|形状${…}|径${size}`. 기존 고정 문자열(≈L190 등)은 새 형식으로 갱신한다(갱신 목록을 report의 `tests_tightened`에).
   - `spliceLineId`도 같은 위치에 `|径${size}`를 붙인다(継手 행도 같은 符号·本数·長さ에 径이 다르면 별개 행이다).
   - **R17 재현**: `step0-report-r2.json#/counterexample/project`의 Project(같은 이름 階 둘, C1의 帯筋 D10과 D13)로 `aggregateQuantity`(또는 `buildTakeoff`)가 throw 없이 끝나고, 帯筋 행이 径별로 **두 행**이며 각 행의 `places`·`size`가 맞다. 「Inconsistent quantity rules」(≈L292)에도 걸리지 않아야 한다 — 걸리면 원인을 report에 적고 `blocked`.
   - 골든·기존 集計 값(kg·本数·길이)은 한 칸도 바뀌지 않는다(`npm run test:golden`).
2. **구현** `src/domain/quantity/index.ts`: 위 두 鍵 함수에 径 세그먼트를 붙인다. 그러면 「Inconsistent size or shape」 검사는 size로는 도달 불가가 된다. `shape`(`RebarShape`)는 `points`가 같은데 다를 수 있는지 생성기(`src/domain/rebar/column.ts`·`girder.ts`·`wall.ts`·`slab.ts`)의 `shape:` 대입 자리를 보고 판단하라 — points가 같으면 shape도 같다면 검사를 **삭제**하고(죽은 검사를 남기지 않는다), 다를 수 있으면 `shape`도 鍵에 넣고 검사를 삭제한다. 어느 쪽인지와 근거 줄을 report의 `shape_decision`에.
3. **備考 fallback — 테스트 먼저** `src/domain/model/project.test.ts`:
   - `legacyQuantityLineId(id)`: 맨 끝 `|径…` 세그먼트를 뗀 문자열. 径 세그먼트가 없으면 그대로.
   - `noteFor(project, lineId)`: `notes[lineId]` → 없으면 `notes[legacyQuantityLineId(lineId)]` → 없으면 `''`.
   - `setNote(project, lineId, note)`: 새 鍵에 쓰고 **구 鍵 항목은 지운다**(같은 구 鍵을 공유하던 다른 행이 있으면 그 행의 備考도 사라진다 — 충돌 案件에서만 생기는 일이고, 두 행이 한 備考를 계속 공유하는 것보다 낫다. 이 동작을 테스트로 고정하고 ADR에 남길 것). `note === ''`이면 둘 다 지운다.
   - 저장 案件 시나리오: `notes: { '1階|C|C1|主筋|1000|12|形状…': '要確認' }`(구 鍵)인 Project에서 새 鍵으로 `noteFor`가 `'要確認'`을 돌려주고, `setNote(새 鍵, '済')` 뒤 `notes`에 구 鍵이 없고 새 鍵만 있다.
4. **구현** `project.ts`에 `legacyQuantityLineId`·`noteFor` export, `setNote` 갱신. `src/domain`은 순수 TS 유지.
5. 독자 교체: `TakeoffPane.tsx`의 `NoteInput` 셀렉터와 `src/lib/export/index.ts` ≈L406을 `noteFor`로. 각 테스트(`TakeoffPane.test.tsx`·`export/index.test.ts`)에 구 鍵 備考가 표시·출력되는 케이스를 하나씩 추가.
6. 반증 가능성 기록: 구현 뒤 ① `quantityLineId`의 径 세그먼트 제거 ② `noteFor`의 fallback 제거 ③ `setNote`의 구 鍵 삭제 제거를 각각 **일시적으로** 넣어 1·3·5의 테스트가 빨갛게 되는 것을 확인하고 원복(실패 테스트명을 report의 `mutations`에. 원복 후 `git diff --stat`이 의도한 파일만).

## Acceptance Criteria
```bash
npx vitest run src/domain/quantity/index.test.ts src/domain/model/project.test.ts src/lib/export/index.test.ts src/components/quantity/TakeoffPane.test.tsx
npm run test:golden
npx tsc --noEmit
npm run lint
npx vitest run   # 전체 — 鍵 문자열을 고정한 다른 테스트가 깨지면 새 형식으로 갱신하고 report의 tests_tightened에 나열
```

## 산출물
`phases/46-quantity-line-size-key/step1-report.json`: `{ "changed_files": [...], "tests_added": [...], "tests_tightened": [...], "shape_decision": { "removed_check": true|false, "shape_in_key": true|false, "evidence": ["src/domain/rebar/column.ts#L…", ...] }, "r17_reproduction": { "lines_for_C1_hoop": 2, "sizes": ["D10", "D13"] }, "mutations": [{ "site": "quantityLineId size segment", "failing_tests": [...] }, { "site": "noteFor legacy fallback", "failing_tests": [...] }, { "site": "setNote legacy delete", "failing_tests": [...] }], "paths_verified": ["src/domain/quantity/index.ts", "src/domain/model/project.ts", "src/components/quantity/TakeoffPane.tsx", "src/lib/export/index.ts", "phases/45-partial-import-unsupported/step0-report-r2.json"] }`

## 금지사항
- `memberGroupKey`를 `story.id` 기반으로 바꾸지 마라. 이유: 群 鍵은 内訳書의 표시 단위(階 이름·符号)이고, 문제는 群이 아니라 規格이 鍵에 없는 것이다.
- `PROJECT_SCHEMA_VERSION`을 올리지 마라. 이유: `deserializeProject`가 버전 동일을 요구해 저장 案件 전부가 열리지 않게 된다. 이행은 읽기 fallback으로 한다.
- 径 세그먼트를 鍵의 중간에 넣지 마라. 이유: `legacyQuantityLineId`가 「맨 끝 세그먼트 제거」 하나로 구 鍵을 복원해야 한다.
- 충돌을 `MemberUnsupportedError`로 감싸지 마라. 이유: 두 부재 모두 유효하고 계상돼야 한다 — 빼는 것은 값을 줄이는 것이다.
- `src/domain/rebar/**`·`src/rulepack/**`·`tests/golden/fixtures/**`·`src/lib/import/**`를 만지지 마라. 이유: 数量 값은 바뀌지 않는다, 鍵만 바뀐다.
- 규준 수치 리터럴을 `.ts`에 쓰지 마라(ADR-002). `src/domain`에 React·DOM을 import하지 마라.
- 테스트를 구현에 맞추지 마라 — 「구현을 되돌리면 실패하는가」가 기준이다.
