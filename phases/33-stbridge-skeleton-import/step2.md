# Step 2: .stb XML을 순수 JSON 중간표현 StbDocument로 읽고, 실물 4건의 중간표현을 커밋한다

**전제**: step 1이 `completed`다. `decodeStbBytes`가 있고 `STB_ISSUES`가 18개다.

## 배경
ADR-018의 2단 분리를 그대로 적용한다 — 「파일 → 중간표현」은 `DOMParser`를 쓰므로 vitest `ui` 프로젝트(jsdom)에서만 돌고, 「중간표현 → 후보」(step 3)는 순수 TS라 `tests/`(node)에서 픽스처 대조를 받는다. **Node에는 전역 `DOMParser`가 없으므로 이 경계를 어기면 통째로 깨진다.**

이 스텝의 핵심 산출은 코드가 아니라 **커밋된 중간표현 JSON 4건**이다. 원본 .stb는 커밋하지 않지만 골격만 담은 IR은 작고, 이것을 커밋하면 step 3의 「중간표현 → 후보」 구간이 `.cache/` 없이도 CI에서 상시 검증된다.

중간표현은 **원문 문자열을 그대로 담는다.** `distance="3000.0"`은 문자열 `"3000.0"`이고 숫자 변환은 step 3에서 한다. 없는 속성은 `undefined`이고 **0이나 빈 문자열로 채우지 않는다.**

## 할 일 (테스트 먼저 — TDD)
1. `src/lib/import/stb/types.ts`에 중간표현 타입을 더하라(TDD 훅 면제). **전부 순수 JSON 직렬화 가능이어야 하고 DOM 타입을 하나도 노출하지 않는다.**
   ```ts
   export interface StbAxisRaw { id?: string; name?: string; distance?: string; nodeIds: string[] }
   export interface StbAxisGroupRaw { groupName?: string; angle?: string; originX?: string; originY?: string; axes: StbAxisRaw[] }
   export interface StbStoryRaw { id?: string; name?: string; height?: string; kind?: string }
   export interface StbNodeRaw { id?: string; x?: string; y?: string; z?: string; kind?: string }
   export interface StbDocument {
     version: string;
     projectName?: string;
     encoding: StbEncoding;
     axisGroups: StbAxisGroupRaw[];
     stories: StbStoryRaw[];
     nodes: StbNodeRaw[];
     unsupportedAxisKinds: { name: string; count: number }[];
     unreadElements: { name: string; count: number }[];
     issues: StbIssue[];
   }
   ```
   `unreadElements`는 **읽지 않은 요소를 이름별로 센 것**이다. 조용히 버리지 않는다 — 사용자가 「왜 절반만 들어왔나」를 알 수 있어야 한다.
   **다만 두 가지로 접는다. 접지 않으면 `{name:'ST_BRIDGE',count:1}` 같은 항목이 목록을 채워 이 필드의 목적이 무너진다.**
   - **컨테이너 제외**: `ST_BRIDGE`·`StbCommon`·`StbModel`·`StbNodes`·`StbAxes`·`StbStories`·`StbMembers` 일곱만 세지 않는다(읽는 요소이거나 그 직접 부모다). 이 이름들을 **상수 배열 하나**로 두어라. 이 일곱 밖의 요소는 **문서에서 만난 이름을 그대로** 센다.
   - **「이미 센 요소의 자손은 세지 않는다」 같은 조상 규칙을 넣지 마라.** step 0의 실측(`element_census`)에서 `StbMembers` 아래에 `StbColumns`·`StbGirders`·`StbBraces` 같은 **복수형 컨테이너**가 한 겹 더 있음이 확인됐다 — 조상 규칙을 걸면 `StbColumn: 105`가 `StbColumns: 1`로 접혀 목록 전체가 `count: 1`이 되고, 「무엇이 얼마나 안 들어왔나」라는 이 필드의 목적이 사라진다. 그 복수형들을 제외 목록에 넣어 해결하려고도 하지 마라 — `StbColumns`가 `scope-guard.test.ts`의 금지 문자열 `StbColumn`을 포함해 가드와 충돌한다. 복수형 컨테이너가 `{name:'StbColumns',count:1}`로 목록에 함께 실리는 것은 **감수한다**(부재별 실수는 옆에 그대로 남는다).
2. `src/lib/import/stb/document.test.ts`를 **먼저** 쓰고 `document.ts`를 구현하라.
   `parseStbDocument(text: string, encoding: StbEncoding): StbDocument`
   - `new DOMParser().parseFromString(text, 'application/xml')`. 결과에 `parsererror` 요소가 있으면 `issues: ['XML解析不能']`과 나머지 전부 빈 배열.
   - 루트의 `localName`이 `ST_BRIDGE`가 아니면 `issues: ['ST-Bridge形式でない']`.
   - `version`이 `2.0.1`·`2.0.2`·`2.1.0`·`2.1.1` 중 하나가 아니면 `issues: ['対応外バージョン']`과 **나머지 전부 빈 배열**(version 원문은 싣는다). **버전 어댑터·요소명 매핑 테이블을 만들지 마라** — step 0이 골격 요소가 네 버전에서 같음을 확인했으므로 분기 자체가 불필요하다.
   - 요소 탐색은 **네임스페이스를 무시하고 `localName`으로** 하라(실물은 기본 네임스페이스 `https://www.building-smart.or.jp/dl`를 쓴다).
   - 읽는 요소·속성은 step0-report.json의 `skeleton_attr_sets`에 있는 것뿐이다: `StbCommon@project_name`, `StbParallelAxes@group_name/@angle/@X/@Y`, `StbParallelAxis@id/@name/@distance` + 자식 `StbNodeIdList/StbNodeId@id`, `StbStory@id/@name/@height/@kind`, `StbNode@id/@X/@Y/@Z/@kind`.
   - `StbArcAxes`·`StbRadialAxes`·`StbDrawingAxes`는 `unsupportedAxisKinds`에 **이름과 건수만** 담고 `axisGroups`에는 넣지 않는다.
   - 그 밖의 요소(`StbColumn`·`StbGirder`·`StbBeam`·`StbWall`·`StbSlab`·`StbBrace`·`StbPost`·`StbFooting`·`StbPile`·`StbParapet`·`StbSec*`·`StbApply*` 등)는 **속성을 하나도 읽지 말고** `unreadElements`에 이름별 건수만 센다.
   - 속성이 없으면 `undefined`로 남긴다. **`?? 0`·`|| 0`·`?? ''`로 채우지 마라.**
3. `document.test.ts`(jsdom)의 단언 — **합성 XML 문자열을 테스트 안에 직접 써서** 경계 규칙만 고정한다(`src/lib/import/section-list/parse.test.ts`의 분담과 같다):
   - `version="2.0.3"`이면 `issues`가 정확히 `['対応外バージョン']`이고 `axisGroups`·`stories`·`nodes`·`unsupportedAxisKinds`·`unreadElements`가 **전부 길이 0**이다.
   - `version="2.0.1"`·`"2.0.2"`·`"2.1.0"`·`"2.1.1"`은 전부 통과한다.
   - 닫히지 않은 태그 → `issues`가 `['XML解析不能']`.
   - 루트가 `<foo/>` → `['ST-Bridge形式でない']`.
   - `distance` 속성이 없는 `StbParallelAxis`는 `distance === undefined`이고 **`'0'`도 `0`도 아니다**.
   - `height` 속성이 없는 `StbStory`는 `height === undefined`다.
   - `StbParallelAxes@angle`이 `"270.0"`이면 `angle`에 `"270.0"` 문자열이 그대로 실린다(판정하지 않는다).
   - `StbArcAxes`·`StbRadialAxes`·`StbDrawingAxes`가 있으면 `unsupportedAxisKinds`에 이름과 건수가 담기고 `axisGroups`에는 들어가지 않는다.
   - `StbColumn` 2건·`StbWall` 1건이 있으면 `unreadElements`에 `[{name:'StbColumn',count:2},{name:'StbWall',count:1}]`이 들어 있고, `StbDocument`의 어느 필드에도 그 속성값이 없다.
   - 네임스페이스가 붙은 문서와 안 붙은 문서가 같은 결과를 낸다.
   - **순수 JSON 단언**: `expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)` — DOM 노드가 새어 들어가면 실패한다.
4. 합성 픽스처 라운드트립: `tests/fixtures/stb-import/document/mini.json`을 **손으로 전사해** 만들어라(ADR-010 준용 — **파서 출력을 붙여넣지 마라**. 파일 첫 키로 `"_derivedFrom": "tests/fixtures/stb-import/synthetic/mini-utf8.stb (손으로 전사)"`를 넣어라). `document.test.ts`에 라운드트립 케이스를 더한다 — `mini-utf8.stb`와 `mini-sjis.stb` 양쪽에서 나온 `StbDocument`가, **JSON에서 `_derivedFrom`를 제거한 것**과 `encoding` 필드를 뺀 채로 `toEqual`이다. **`_`로 시작하는 키는 출처 메타데이터이고 `StbDocument`의 필드가 아니다 — 비교 전에 반드시 벗겨라**(`const { _derivedFrom, ...expected } = JSON.parse(...)`). 타입에 `_derivedFrom`를 더해 맞추려 하지 마라.
5. `scripts/stb/extract-stb-document.mjs`를 만들어라. `.cache/stb/`의 4건을 읽어 `decodeStbBytes` + `parseStbDocument`를 돌리고 결과를 `tests/fixtures/stb-import/document/{dotnet-sample1,diffchecker-filea,hoaryfox-sample,diffchecker-mini210}.json`에 쓴다.
   - 실행 방법을 스크립트 헤더 주석에 적어라: `npx tsx scripts/stb/extract-stb-document.mjs`. TS 모듈은 `@/` 별칭이 아니라 **상대경로**로 import한다(`scripts/extract-textitems.mjs`가 선례다).
   - `DOMParser`는 jsdom으로 주입한다: `globalThis.DOMParser = new (await import('jsdom')).JSDOM().window.DOMParser`. **순서가 load-bearing이다** — 정적 `import`는 본문보다 먼저 평가되므로 `document.ts`를 정적으로 import하면 주입 전에 그 모듈이 돈다. `decode.ts`·`document.ts`는 **주입한 다음에 `await import('../../src/lib/import/stb/document.ts')`로 동적 import하라.** **`jsdom`은 devDependencies에 이미 있다 — 설치하지 마라.**
   - 각 JSON의 첫 키로 `"_source": {"file": "...", "sha256": "..."}`를 넣어라. **이 키도 `StbDocument`의 필드가 아니다** — 읽는 쪽은 전부 `_`로 시작하는 키를 벗기고 쓴다.
   - **이 4개 JSON을 커밋하라.**
6. `tests/stb-import/document-fixture.test.ts`(**node 프로젝트, CI 상시**)를 만들어라. 커밋된 4개 IR JSON을 읽어 step0-report.json이 확정한 수치와 대조한다. **`DOMParser`를 쓰지 마라** — 이 테스트는 JSON만 읽는다.
   **`phases/` 아래의 파일을 테스트에서 읽지 마라.** step0-report.json은 이 phase의 일회용 산출물이고 codex 자신의 자기보고다 — CI가 그것에 의존하면 phase 디렉터리를 정리하는 순간 빌드가 깨지고, 대조의 정본이 독립적이지도 않다. **그 수치를 테스트 파일에 숫자 리터럴로 전사하고** 각 블록 위에 `// 출처: step0-report.json > axes > hoaryfox-sample` 같은 주석을 달아라(`tests/golden/`의 규율 그대로다).
   - 파일별 `version`·`encoding`.
   - 파일별 `axisGroups.length`, 그룹별 `(groupName, angle, axes.length)`.
   - 파일별 축의 `name` 배열과 `distance` 배열이 step0-report.json의 `axes`와 **정확히 같다**.
   - 파일별 `stories`의 `(name, height, kind)` 배열이 step0-report.json의 `stories`와 정확히 같다.
   - 파일별 `nodes.length`.
   - `diffchecker-mini210.json`은 `axisGroups`가 `[]`이고 `stories.length`가 1이다.
   - **주의**: 이 수치들은 step0-report.json이 정본이다. 사양에 적힌 참고값과 다르면 **픽스처를 고치지 말고** step0-report.json을 따르고, 두 값을 report에 나란히 적어라.
7. `src/lib/import/stb/scope-guard.test.ts`를 만들어라. `src/lib/import/stb/` 아래의 **비테스트 `.ts` 파일 전부**를 `readFileSync`로 읽어 단언한다.
   - `定着`·`重ね継手`·`折曲`·`かぶり`·`depth_cover`·`anchorage`·`cut_off`·`center_` 문자열이 **0건**.
   - `StbSec`·`StbApply`·`StbColumn`·`StbGirder`·`StbBeam`·`StbWall`·`StbSlab`·`StbBrace`·`StbPile`·`StbFooting` 문자열이 **0건**. (`unreadElements`의 요소명은 코드에 리터럴로 박지 말고 **문서에서 만난 요소를 그대로 세는** 방식으로 구현하라 — 그러면 이 가드와 충돌하지 않는다.)
   - `fetch`·`XMLHttpRequest`·`WebSocket`·`sendBeacon` 0건.
   - `applyFramingPlan`·`applyElevation`·`updateProject`·`loadProject`·`useAppStore`·`zustand`·`createSampleProject` 0건.
   - **공회전 방지**: `expect(scannedFiles.length).toBeGreaterThanOrEqual(3)`와, 스캔한 파일 수가 실제 `src/lib/import/stb/`의 비테스트 `.ts` 수와 같음을 함께 단언하라.

## 하지 말 것
- `StbSec*`(断面)·`StbApply*`(要領)를 읽지 마라. `depth_cover_*`·`center_*`·`anchorage_rule`·`cut_off_rule`을 읽지 마라 — **かぶり厚さ·定着는 `src/rulepack/`의 YAML이 정한다.** 2.0.x에도 `StbSecBarArrangementColumn_RC@depth_cover_*`가 있으므로 「버전을 내려서 피했다」고 생각하지 마라.
- 부재 요소(`StbColumn`·`StbGirder`·`StbBeam`·`StbWall`·`StbSlab`·`StbBrace`·`StbPost`·`StbFooting`·`StbPile`)의 **속성을 하나도 읽지 마라.** 건수만 센다.
- 버전 어댑터·요소명 매핑 테이블·룰 DSL을 만들지 마라(ADR-002).
- 속성이 없을 때 기본값(0·빈 문자열·`'GENERAL'`)을 채우지 마라. `undefined`로 두어라.
- 중간표현에서 숫자 변환·단위 환산·정렬을 하지 마라 — 원문 문자열 그대로다.
- `src/domain/` 아래에 .stb 코드를 만들지 마라. `tests/` 아래에 `DOMParser`를 쓰는 테스트를 두지 마라 — node 환경이라 죽는다.
- `src/lib/import/framing-plan/**`·`section-list/**`·`{types,textitems,runs,pdf-text,story-label}.ts`를 고치지 마라.
- `.cache/`의 원본을 커밋하지 마라. XSD를 레포에 넣지 마라.
- npm 패키지를 설치하지 마라(`jsdom`은 이미 있다).
- `docs/ADR.md`·`CLAUDE.md`·`AGENTS.md`·`.github/workflows/*`를 수정하지 마라.
- 취입 UI·file input·e2e를 만들지 마라. `Project`를 만들거나 스토어를 만지지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC
`npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

그 위에:
1. `version="2.0.3"` 케이스에서 `axisGroups`·`stories`·`nodes`·`unsupportedAxisKinds`·`unreadElements`가 **전부 길이 0**이고 `issues`가 정확히 `['対応外バージョン']`이다.
2. **흔들기 A**: `document.ts`가 `distance` 결측 시 `'0'`을 채우게 바꾸면 「`undefined`이고 `'0'`이 아니다」 단언이 실패한다. 흔든 내용·실패 테스트·메시지를 report에 적고 **같은 턴 안에 원복**해 `git status --porcelain`이 비었음을 보여라.
3. **흔들기 B**: `parseStbDocument`가 결과에 DOM 노드를 담게 바꾸면 `JSON.parse(JSON.stringify(doc))` 왕복 단언이 실패한다. 메시지를 적고 원복하라.
4. **흔들기 C**: `document.ts`에 `const x = 'depth_cover_start_X'` 한 줄을 넣으면 `scope-guard.test.ts`가 실패한다. 메시지를 적고 원복하라.
5. **흔들기 D**: `tests/fixtures/stb-import/document/hoaryfox-sample.json`의 어느 축 `distance` 한 칸을 1 바꾸면 `tests/stb-import/document-fixture.test.ts`가 실패한다. 메시지를 적고 원복하라.
6. `scope-guard.test.ts`가 스캔한 파일 수가 `src/lib/import/stb/`의 비테스트 `.ts` 수와 같다. 두 수를 report에 적어라.
7. 커밋된 IR JSON 4건의 `axisGroups`·`stories`·`nodes` 수가 step0-report.json과 **전부 일치**한다. 일치하지 않는 칸이 있으면 픽스처를 고치지 말고 두 값을 report에 나란히 적고 `blocked`로 멈춰라.
8. `git diff main --stat -- src/domain src/rulepack src/lib/import/framing-plan src/lib/import/section-list src/components .github/workflows docs/ADR.md package.json` 이 비어 있다.

## 산출물
`phases/33-stbridge-skeleton-import/step2-report.json`: `files`, `ir_fixtures`(4건 각각의 version·encoding·축 그룹 수·축 수·階 수·節点 수·unreadElements 목록), `step0_mismatches`(step0-report.json과 어긋난 칸이 있으면 기대/실제), `mutations`(흔들기 4건), `scope_guard`(스캔 파일 수 / 실제 파일 수 / 금지 grep 결과), `untouched_tracks`.

`summary`(한 줄): 「.stb → StbDocument 중간표현이 서고 실물 4건의 IR을 커밋했다. 부재·断面은 건수만 세며, 값 미채움·DOM 누출·규준 용어 유입을 흔들면 실패한다.」
