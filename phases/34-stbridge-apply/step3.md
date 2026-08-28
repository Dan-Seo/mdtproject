# Step 3: .stb를 골라 후보를 보고 승인하는 화면을 짓는다 (승인해도 못 읽은 것은 지우지 않는다)

**전제**: step 2가 `completed`이고 `src/lib/import/stb/apply.ts`가 서 있다.

## 배경
ADR-043 결정 2 — 「후보는 사람 승인을 거쳐야만 입력이 된다」 — 가 실제로 지켜지는 자리다. 그리고 ADR-044 결정 4가 이 화면의 성격을 정한다: **승인은 못 읽은 것을 지우지 않는다.** `issues`와 `unsupported`가 승인 뒤에도 화면에 남아야 한다. 그것이 사라지면 사용자는 「.stb를 다 읽었다」고 믿게 되고, ADR-015가 세운 승인은 형해화한다.

**`PlanImport.tsx`를 흉내내되 베끼지 마라.** step 0 기록 항목 2·7이 그 컴포넌트의 스토어 쓰기 방식·거부 후 「버리고 진행」 흐름·파일 입력 방식·테스트 주입 방식을 적어 두었다. **그 기록에 적힌 것을 따르라** — 이 사양이 `updateProject`라고 적어도 기록이 다른 것을 말하면 기록이 이긴다(사양은 코드보다 오래된 것일 수 있다).

## 할 일 (테스트 먼저 — TDD)

1. `src/components/stb/StbImport.test.tsx`(jsdom)를 **먼저** 쓰고 `StbImport.tsx`를 구현하라. CSS Module이 필요하면 `StbImport.module.css`를 옆에 둔다(기존 취입 컴포넌트와 같은 방식).

2. **파이프라인**은 이미 다 서 있다. 새로 만들지 마라.
   `File` → `ArrayBuffer` → `decodeStbBytes` → `parseStbDocument` → `toSkeletonCandidate` → 화면.
   - 파일 입력의 `accept`는 `.stb`다.
   - 테스트가 파싱을 건너뛰고 후보를 직접 넣을 수 있게 하라 — 주입 prop의 이름과 형태는 step 0 기록 항목 7의 기존 방식을 따른다. **프로덕션 경로에 테스트 전용 분기를 만들지 마라.**

3. **보여줄 것** (후보가 있을 때)
   - `version`과 `projectName`(있으면). **`projectName`은 표시만 한다 — 案件名을 덮어쓰는 버튼을 만들지 마라** (ADR-044 결정 5).
   - `direction`별 그리드 — 축 라벨과 스팬을 원문 그대로. `PlanImport`의 `Axes` 표시와 같은 정도면 된다.
   - 階 목록 — `name`과 `heightMm`.
   - `unsupported` 목록 — 요소 이름과 건수. **비어 있어도 목록 자리를 없애지 마라**(「없다」와 「안 보여준다」가 화면에서 같아 보이면 안 된다).
   - `issues` — 로케일로 옮겨 보여준다. 키는 이미 있는 `stbImport.issue.<코드>`다.

4. **승인**은 둘이고 서로 독립이다 (ADR-044 결정 2).
   - 「通り芯」 승인 → `applyStbGrid` → 스토어에 반영.
   - 「階」 승인 → `applyStbStories` → 스토어에 반영.
   - 후보의 해당 부분이 비어 있으면(`grids`에 X·Y가 갖춰지지 않았거나 `stories`가 `[]`) **그 버튼을 내지 마라** (ADR-044 결정 4 후단).
   - 거부가 돌아오면 사유를 로케일로 보여주고, **그때만** 「부재를 버리고 진행」 선택지를 낸다. 기본값으로 켜 두지 마라 — 조용한 기본값은 사용자가 모르는 사이에 부재를 지운다. 흐름은 step 0 기록 항목 2가 적은 `PlanImport`의 것을 따른다.
   - 승인이 성공하면 **무엇이 들어갔는지**를 보여라(반영한 축 수·階 수). 그러면서 `issues`·`unsupported`는 **그대로 남긴다**.

5. **로케일 키**를 `src/locales/ja.json`·`ko.json` 양쪽에 더하라. `stbImport.` 접두를 쓰고, 필요한 것은 대략 — 화면 제목, 파일 고르기, 통り芯 승인, 階 승인, 부재 버리고 진행, 반영 결과, 미대응 목록 제목, 그리고 `STB_APPLY_REFUSALS` 4개의 사유 문면(`stbImport.refusal.<코드>`)이다. **한쪽 로케일에만 넣지 마라** — step 0 기록 항목 6이 그것을 잡는 테스트가 있는지 적어 두었다. 문면은 일본어가 정본이고 한국어는 그 번역이다. **도메인어(通り芯·階·部材)는 번역하지 마라** (ADR-008).

## 완료 조건 (AC)
1. 후보에 X·Y 그리드와 階가 다 있을 때 승인 버튼 둘이 나오고, 각각 눌렀을 때 스토어의 `project.grid`·`project.stories`가 `apply.ts`가 낸 값과 같아진다.
2. **`issues`가 비어 있지 않은 후보를 승인해도 그 issue 문면이 화면에 그대로 남는다**는 단언이 있다 (ADR-044 결정 4). 이 단언이 없으면 AC 미달이다.
3. `unsupported`가 비어 있지 않은 후보에서 그 목록이 건수와 함께 보인다.
4. 부재가 있는 案件에서 승인하면 거부 문면이 보이고, **그 시점에는 `project`가 바뀌지 않았다**는 단언이 있다. 「버리고 진행」을 고른 뒤 다시 누르면 반영된다.
5. `grids`가 비었거나 `stories`가 빈 후보에서는 해당 승인 버튼이 **렌더되지 않는다**는 단언이 있다.
6. `project.name`이 승인 전후로 같다는 단언이 있다.
7. ja·ko 두 로케일에서 화면이 렌더되고, 새로 더한 키가 양쪽에 다 있다.
8. `npx tsc --noEmit`·`npm run lint`·`npm run test` 전부 통과.

## 금지
- **파일 내용을 서버로 보내지 마라.** `fetch`·`XMLHttpRequest`·`navigator.sendBeacon`을 이 컴포넌트에 쓰지 마라. 텔레메트리에 파일명·경로·내용을 싣지 마라 (ADR-006·ADR-020).
- 자동 승인·자동 재시도를 만들지 마라. 파일을 고른 것은 승인이 아니다.
- `loadProject`로 案件을 통째로 갈아치우지 마라 — step 0 기록 항목 2가 적은 것을 쓴다.
- `src/domain/`·`src/rulepack/`·`src/lib/import/framing-plan/`·`src/lib/import/section-list/`를 고치지 마라.
- `src/lib/import/stb/apply.ts`·`candidates.ts`·`document.ts`·`decode.ts`의 **동작을 바꾸지 마라.** 화면을 맞추려고 파서를 고쳐야 한다면 그건 step 2의 사양이 틀렸다는 뜻이니 `blocked`로 멈추고 적어라.
- `src/app/page.tsx`를 고치지 마라 — 마운트는 step 4다.
- `scope-guard.test.ts`의 금지어 목록에서 무엇도 빼지 마라. 이 컴포넌트가 그 목록에 걸리면 목록이 아니라 컴포넌트를 고쳐라.
