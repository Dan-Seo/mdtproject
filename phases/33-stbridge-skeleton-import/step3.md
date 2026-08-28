# Step 3: 중간표현에서 通り芯 그리드와 階 스택 후보를 낸다 (담을 수 없으면 근사하지 않고 거부한다)

**전제**: step 2가 `completed`다. `tests/fixtures/stb-import/document/*.json` 5건(합성 1 + 실물 4)이 커밋돼 있다.

## 배경
2단 분리의 뒤 절반이다. **여기부터는 DOM을 쓰지 않으므로 `tests/stb-import/`(node)에서 픽스처 대조를 받는다 — node에서 도는 것 자체가 이 모듈이 DOM-free라는 증명이다.**

규율은 ADR-030의 그것 그대로다: **담을 수 없는 것은 근사하지 않고 사유 코드와 함께 빈 후보로 실패한다.** `Grid`에는 회전각·원호·방사축을 담을 필드가 없고 `Story`에는 `kind`도 GL 기준 절대 표고도 없다(step 0이 확정). 임의로 직교 투영하거나 지하층을 지상으로 접으면 **도면에 없는 격자·층을 제품이 만드는 것**이고, 그게 ADR-004가 거부한 바로 그 실패다.

**세 가지를 특히 조심하라.**
- `angle`이 0이 아니어도 직교다. 실물 세 파일 전부 한 그룹이 `angle="270.0"`이다. **`angle !== 0`을 거부 조건으로 쓰면 현실 파일을 100% 거부한다.**
- **방향을 `group_name`으로 정하지 마라.** 자유문자열이 방향을 뜻한다는 보장이 없다. `angle`로 정한다.
- **미대응 階를 부분 제거하지 마라.** 중간 레벨을 빼고 인접 차분을 하면 그 아래층이 빠진 구간을 흡수해 階高가 조용히 부풀고, 사유 코드는 「그 층을 못 읽었다」로만 읽혀 사용자가 오염을 알 수 없다(실물 `diffchecker-filea`에서 `RFL`이 `PENTHOUSE`다). **층 스택은 통짜로 거부한다.**

## 할 일 (테스트 먼저 — TDD)
1. `src/lib/import/stb/types.ts`에 후보 타입을 더하라(TDD 훅 면제).
   ```ts
   export interface StbAxisCandidate { label: string }
   export interface StbGridCandidate { direction: 'X' | 'Y'; groupName?: string; axes: StbAxisCandidate[]; spansMm: number[] }
   export interface StbStoryCandidate { name: string; heightMm: number }
   export interface StbSkeletonCandidate {
     version: string;
     projectName?: string;
     grids: StbGridCandidate[];
     stories: StbStoryCandidate[];
     unsupported: { name: string; count: number }[];
     issues: StbIssue[];
   }
   ```
   **`positionPt`·`scalePtPerMm`·`totalConfirmed`를 만들지 마라.** 도면 pt 개념이고 ST-Bridge에는 대응물이 없다 — `scalePtPerMm`에 `1`을, `positionPt`에 mm 누적값을 넣는 것이 정확히 「값을 지어내는」 것이다. **`src/lib/import/framing-plan/types.ts`의 `PlanGridCandidate`를 재사용하지도, 수정하지도 마라** — 기존 테스트가 후보 객체를 통째로 `toEqual`로 고정하고 있어 조용한 회귀가 난다.
2. `src/lib/import/stb/candidates.test.ts`(jsdom)를 **먼저** 쓰고 `candidates.ts`를 구현하라.
   `toSkeletonCandidate(doc: StbDocument): StbSkeletonCandidate`
   **`StbDocument`만 인자로 받는다. DOM 타입·`File`·`Project`를 인자로도 반환값으로도 쓰지 마라.**
   **`issues`는 첫 등장 순의 중복 없는 배열이다.** 같은 코드가 두 번 성립해도 한 번만 담는다(두 그룹이 다 비직교이거나 두 방향이 다 `通り芯距離解釈不能`인 경우). 담는 순서는 「通り芯 규칙 → 階 규칙」이고 같은 규칙 안에서는 아래에 적힌 순서다. **이 계약이 없으면 AC의 「`issues`가 정확히 `[...]`」 단언이 구현에 따라 흔들린다.**
3. **버전·미대응 축 종별**
   - `doc.issues`에 `対応外バージョン`·`XML解析不能`·`ST-Bridge形式でない`가 있으면 그대로 옮기고 `grids: []`·`stories: []`로 끝낸다.
   - `doc.unsupportedAxisKinds`에 `StbArcAxes` 또는 `StbRadialAxes`가 있으면 `grids: []` + `非直交通り芯`(원호·방사는 직교 곱 격자로 표현할 수 없다).
   - `StbDrawingAxes`만 있으면 그것은 무시하고 `未対応通り芯種別`을 issue에 담되 평행축 처리는 계속한다.
   - `doc.unsupportedAxisKinds`·`doc.unreadElements`를 그대로 `unsupported`에 옮겨 실어라. **조용히 버리지 마라.**
4. **通り芯 규칙**
   - `axisGroups`가 비면 `grids: []` + `通り芯未検出`.
   - `axisGroups`가 정확히 2개가 아니면 `grids: []` + `通り芯グループ数不一致`.
   - 각 그룹의 `angle`을 `Number`로 읽는다. `r = ((n % 360) + 360) % 360`, `q = Math.round(r / 90)`로 두고, 유한수가 아니거나 `Math.abs(r - q * 90) > 0.001`이면 **그리드를 통짜로 거부한다** — `grids: []` + `非直交通り芯`. **`angle !== 0`으로 판정하지 마라.** **한 그룹만 버리지 마라** — 남은 한 그룹으로 만든 격자는 도면에 없는 격자이고, `axisGroups` 2개 검사는 이미 지난 뒤라 아무것도 막지 못한다(階의 통짜 거부와 같은 이유다). **`((n % 90) + 90) % 90`으로 판정하지 마라** — `89.9995`가 나머지 `89.9995`를 내어 허용 오차에 걸리지 않고 직교에 가까운 격자를 거부한다.
   - 방향: 위의 `q % 4`가 `0` 또는 `2`면 `direction: 'Y'`(축이 글로벌 X를 따라 달리고 `distance`를 Y로 잰다), `1` 또는 `3`이면 `direction: 'X'`. **정확히 `0`/`90`/`180`/`270`인지로 비교하지 마라** — 허용 오차를 통과한 `269.9999`가 어느 쪽에도 안 걸려 `direction`이 `undefined`가 된다. **`groupName`을 방향 판정에 쓰지 마라 — `groupName`은 후보에 원문 그대로 싣기만 한다.**
   - 두 그룹의 `direction`이 같으면(평행) `grids: []` + `通り芯方向不明`.
   - 각 축의 `distance`를 `Number`로 읽는다. **`Number.isFinite`가 아니면** 그 방향을 버리고 `通り芯距離解釈不能`.
   - `name`이 없는 축이 하나라도 있으면 그 방향을 버리고 `通り芯ラベル欠落`. **라벨을 index로 지어내지 마라.**
   - `distance` 오름차순 정렬 후 인접 차분이 `spansMm`. 차분이 0 이하면 그 방향을 버리고 `通り芯位置重複`.
   - 축이 2본 미만인 방향은 후보를 내지 않고 `通り芯未検出`.
   - `axes[].label`은 `name` **원문 그대로**다. 정렬은 `distance` 기준이며 이름 순이 아니다.
   - **節点 좌표 검산은 거부에 쓰지 않는다.** 축의 절대 좌표는 **그룹 원점 + `distance`**다 — `direction`이 `'X'`면 `Number(group.originX ?? 0) + distance`를 `StbNode@X`와, `'Y'`면 `Number(group.originY ?? 0) + distance`를 `StbNode@Y`와 비교한다. **원점을 빼먹지 마라** — 원점이 0이 아닌 그룹에서 전 축이 어긋난 것으로 발화해 이 issue가 무의미해진다(원점의 실제 값은 step0-report.json의 `axis_groups`에 있다). 각 축에 대해 `nodeIds`가 비어 있지 않은데 그 목록의 어떤 `StbNode`도 그 좌표와 1mm 이내로 맞지 않으면 `通り芯位置と節点の不一致`를 issue에 **한 번만** 담되 **후보는 그대로 낸다**(위치의 정본은 `distance`다). `nodeIds`가 빈 축은 검산 대상 밖이다. 실물에 이 어긋남이 실재하므로 거부하면 정상 데이터를 죽인다.
   - `grids`는 `direction`이 `'X'`인 것을 먼저, `'Y'`를 뒤에 담는다.
5. **階 규칙 — 통짜 거부다**
   - `stories`가 비면 `stories: []` + `階不足`.
   - `height`를 `Number`로 읽는다. **한 레벨이라도** `Number.isFinite`가 아니면 `stories: []` + `階レベル解釈不能`.
   - **한 레벨이라도** `kind`가 `GENERAL`·`ROOF`·`PENTHOUSE` 밖이면 `stories: []` + 사유: `BASEMENT`면 `地下レベル未対応`, 그 밖(`ISOLATION`·`DEPENDENCE`·`undefined`·미지 값)이면 `対応外の階種別`. 둘 다면 둘 다 담는다. **그 층만 빼고 나머지를 잇지 마라 — 남은 층의 階高가 오염된다.**
     (`PENTHOUSE`를 허용하는 근거: `Story`는 `name`만 취하므로 담을 수 있다. `BASEMENT`는 음의 표고라 누적합 모델에 담을 수 없고, `ISOLATION`·`DEPENDENCE`는 개념 자체가 없다.)
   - `height`가 음수인 레벨이 하나라도 있으면 `stories: []` + `地下レベル未対応`.
   - `height` 오름차순 정렬 후 같은 값이 둘 이상이면 `stories: []` + `階レベル重複`.
   - 레벨이 2개 미만이면 `stories: []` + `階不足`.
   - 통과하면 `stories[i] = { name: levels[i].name, heightMm: levels[i+1].height - levels[i].height }`로 **n-1개**를 만든다. **최상단 레벨은 층이 되지 않는다.** `name`이 없는 레벨이 있으면 이름을 지어내지 말고 `stories: []` + `階レベル解釈不能`.
   - `Project.stories`가 아래에서 위 순서이므로 그 순서로 낸다.
6. `candidates.test.ts`(jsdom)의 케이스 — **합성 `StbDocument` 객체 리터럴로** 경계 규칙만 고정한다. 픽스처 파일을 읽지 마라.
   - `angle: '270.0'` 그룹이 `direction: 'X'`, `angle: '0.0'` 그룹이 `direction: 'Y'`가 된다.
   - **모순 케이스(필수)**: `{groupName: 'X', angle: '0.0'}` → `direction: 'Y'`, `{groupName: 'Y', angle: '270.0'}` → `direction: 'X'`, `{groupName: '通り', angle: '90.0'}` → `direction: 'X'`. **`groupName`을 보는 구현이면 이 셋이 깨진다.**
   - **두 그룹 중 한 그룹만** `angle: '45.0'`이면 `grids`가 `[]`이고 `issues`가 정확히 `['非直交通り芯']`이다 — **통짜 거부라 남은 직교 그룹으로 만든 격자가 하나도 없다.** **그리고 같은 문서에서 그 `angle`만 `'270.0'`으로 되돌리면 `grids`가 2건이 된다**(대비 케이스 — 없으면 값이 안 닿아도 통과한다). 두 그룹이 **다** `'45.0'`인 케이스도 넣어 `issues`가 `['非直交通り芯']` **하나뿐**임을 단언하라(중복 없음 계약).
   - 두 그룹이 다 `angle: '0.0'`이면 `grids: []` + `['通り芯方向不明']`.
   - `StbArcAxes` 1건이 있으면 `grids: []` + `非直交通り芯`. `StbDrawingAxes`만 있으면 평행축 후보는 나오고 `未対応通り芯種別`이 든다.
   - `distance`가 `undefined`인 축, `'abc'`인 축 → 각각 `通り芯距離解釈不能`.
   - `name`이 없는 축 → `通り芯ラベル欠落`이고 `axes`에 `'X1'` 같은 생성 라벨이 **없다**.
   - `distance`가 같은 축 둘 → `通り芯位置重複`.
   - `nodeIds`가 축 좌표와 어긋나는 문서 → `通り芯位置と節点の不一致`가 들되 **`grids`는 그대로 나온다**. 좌표가 맞으면 그 issue가 **없다**(양방향 단언).
   - `kind: 'BASEMENT'` 레벨이 하나 섞이면 `stories`가 `[]`이고 `地下レベル未対応`이 든다. **남은 층으로 만든 후보가 하나도 없다.**
   - `kind: 'PENTHOUSE'`·`'ROOF'`는 통과한다.
   - 레벨 `[200, 4700, 8700]` → `stories`가 `[{name:'1FL',heightMm:4500},{name:'2FL',heightMm:4000}]` **2개**다(`[{heightMm:200}, ...]`가 아니다).
   - 반환값이 순수 JSON이다(`JSON.parse(JSON.stringify(...))` 왕복 `toEqual`).
7. `tests/fixtures/stb-import/expected/*.json` 5건을 만들어 커밋하라 — 합성 `mini` 1건 + 실물 4건. **값은 step0-report.json의 실측에서 유도하라. 파서 출력을 붙여넣지 마라.** 유도 경로는 이렇다 — 축 라벨·`spansMm`은 `axes`에서, `stories`는 `stories`의 표고 차분에서, **`unsupported`는 `element_census`(step 0 기록항목 13)에 step 2가 정한 컨테이너 제외·조상 규칙을 손으로 적용해** 얻는다. `element_census`에 없어서 유도할 수 없는 값이 있으면 **지어내지도 베끼지도 말고 `blocked`로 멈춰라.** 각 파일 첫 키로 `"_derivedFrom": "phases/33-stbridge-skeleton-import/step0-report.json"`을 넣어라.
   **참고 — planner의 사전 실측이다. step0-report.json과 다르면 step0을 정본으로 하고 두 값을 report에 나란히 적어라.**
   - `hoaryfox-sample`: X 라벨 `X1..X7` 스팬 `[3600,3600,3600,3600,3600,3600]`; Y 라벨 `Y1,Y2,Y3` 스팬 `[10800,3600]`. stories 5개 `1F/2F/3F/4F/5F` 전부 `4000`. issues `[]`.
   - `diffchecker-filea`: X 라벨 `X0,X1,X1a,X2,X2a,X3,X4` 스팬 `[1000,2000,2000,4400,4400,1000]`; Y 라벨 `Y0,Y1,Y1a,Y2,Y2a,Y3,Y3a,Y4,Y5` 스팬 `[1000,3200,3200,3200,3200,3200,3200,1000]`. stories 4개 `1FL 4500 / 2FL 4000 / 3FL 4000 / RFL 3800`. issues에 `通り芯位置と節点の不一致`.
   - `dotnet-sample1`: X 라벨 `X1,X2,X3` 스팬 `[6000,6000]`; Y 라벨 `Y1,Y2,Y3` 스팬 `[6000,6000]`. stories 2개 `1FL 5000 / 2FL 4200`. 
   - `diffchecker-mini210`: `grids: []`, `stories: []`, issues에 `通り芯未検出`과 `階不足`.
8. `tests/stb-import/candidates.test.ts`(**node 프로젝트, CI 상시**)를 만들어라. 커밋된 IR JSON 5건을 읽어 **`_source`를 벗긴 뒤** `toSkeletonCandidate`에 넘기고, 결과를 대응하는 `expected/*.json`에서 **`_derivedFrom`를 벗긴 것**과 `toEqual`. (`_`로 시작하는 키는 출처 메타데이터이지 타입의 필드가 아니다 — 벗기지 않으면 `toEqual`이 그 키 하나 때문에 실패한다.) **양쪽이 함께 퇴행해도 통과하는 것을 막기 위해** 절대 수치를 따로 박아라 — `expect(hoaryfox.grids[0].spansMm).toEqual([3600,3600,3600,3600,3600,3600])`, `expect(filea.stories.map(s=>s.heightMm)).toEqual([4500,4000,4000,3800])`, `expect(mini210.grids).toEqual([])`.
   **이 테스트가 node에서 통과하는 것 자체가 `candidates.ts`가 DOM-free라는 증명이다.**

## 하지 말 것
- 비직교·원호·방사 축을 직교로 근사하지 마라. 지하층을 0으로 밀어 올리지 마라. **도면에 없는 격자·층을 제품이 만드는 것이 ADR-004가 거부한 바로 그것이다.**
- 미대응 `kind`의 층만 빼고 나머지를 잇지 마라 — 남은 층의 階高가 조용히 부푼다. **통짜 거부다.**
- `groupName`으로 방향을 정하지 마라. `angle !== 0`으로 비직교를 판정하지 마라.
- `nodeIds` 좌표 어긋남을 거부 사유로 쓰지 마라 — 실물의 정상 데이터다.
- 층 이름·通り芯 라벨을 index로 지어내지 마라. 못 읽으면 거부한다.
- `positionPt`·`scalePtPerMm`·`totalConfirmed`를 만들지 마라. `src/lib/import/framing-plan/types.ts`를 고치거나 재사용하지 마라.
- `Number.isFinite` 검사 없이 `Number(...)`·`parseFloat(...)` 결과를 후보에 넣지 마라 — `NaN`이 그대로 실린다.
- `?? 0`·`|| 0`·`?? ''`로 채우지 마라.
- `StbStory@kind`를 `Story`에 담으려 하지 마라. `src/domain/model/project.ts`를 고치지 마라. `PROJECT_SCHEMA_VERSION`을 건드리지 마라.
- `StbParallelAxes@X`·`@Y`(기준점)를 **후보에** 담지 마라 — `Grid`에 원점이 없고 산출값에 영향이 없다. **다만 節点 검산에는 반드시 쓴다** — 담지 말라는 것이지 무시하라는 것이 아니다.
- 断面·부재·開口·かぶり·定着을 다루지 마라. `applyFramingPlan`·`applyElevation`·`updateProject`·`loadProject`를 호출하거나 고치지 마라 — **이 phase는 `Project`에 아무것도 반영하지 않는다.**
- 취입 UI·file input·e2e를 만들지 마라.
- `tests/stb-import/` 아래 테스트에서 `DOMParser`를 쓰지 마라 — node 환경이다.
- `docs/ADR.md`·`CLAUDE.md`·`AGENTS.md`·`.github/workflows/*`를 수정하지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC
`npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

그 위에:
1. `npx vitest run --project domain tests/stb-import` 가 통과하고 passed 수가 0이 아니다. 수를 report에 적어라 — **이것이 `candidates.ts`가 DOM-free라는 증명이다.**
2. **대비 케이스**: 두 그룹 중 **한 그룹만** `angle: '45.0'` → `grids` 0건(통짜 거부) + `issues` 정확히 `['非直交通り芯']`, **같은 문서에서 그 `angle`만 `'270.0'`으로 바꾸면 `grids` 2건**. 두 결과를 report에 적어라. 대비 케이스가 없으면 불합격이다.
3. **모순 케이스**: `{groupName:'X', angle:'0.0'}`이 `direction:'Y'`가 된다. **흔들기 A**: 방향 판정을 `groupName === 'X' ? 'X' : 'Y'`로 바꾸면 이 케이스가 실패한다. 메시지를 적고 **같은 턴 안에 원복**하라. (실물 4건 대조만으로는 이 오류가 잡히지 않는다 — 그래서 합성 모순 케이스가 필수다.)
4. **흔들기 B**: 階 규칙을 「미대응 kind인 층만 빼고 나머지를 인접 차분」으로 바꾸면 `BASEMENT` 케이스의 「`stories`가 `[]`」 단언이 실패한다. 메시지를 적고 원복하라.
5. **흔들기 C**: 층고를 `levels[i+1].height - levels[i].height`에서 `levels[i].height`로 바꾸면 `diffchecker-filea`의 `4500`이 `200`이 되어 `tests/stb-import/candidates.test.ts`가 실패한다. 메시지를 적고 원복하라.
6. **흔들기 D**: 비직교 판정을 `angle % 90 !== 0`에서 `angle !== 0`으로 바꾸면 실물 3건의 한 축군이 통째로 사라져 픽스처 대조가 실패한다. 메시지를 적고 원복하라.
7. **흔들기 E**: `tests/fixtures/stb-import/expected/hoaryfox-sample.json`의 `spansMm` 한 칸을 `3600` → `3601`로 바꾸면 `tests/stb-import/candidates.test.ts`가 실패한다. 메시지를 적고 원복하라.
8. `grep -rn 'scalePtPerMm\|positionPt\|totalConfirmed' src/lib/import/stb/` 가 **0건**이다.
9. `height`가 없는 레벨이 든 문서에서 `heightMm`가 어디에도 `0`으로 나타나지 않는다.
10. `git diff main --stat -- src/domain src/rulepack src/lib/import/framing-plan src/lib/import/section-list src/components src/lib/store.ts .github/workflows docs/ADR.md package.json` 이 비어 있다. 출력을 report에 붙여라.
11. 흔들기 5건 전부 원복 후 `git status --porcelain`에 이 스텝의 산출물 외 변경이 0건이다.
12. **중복 없음 계약**: 두 그룹이 다 비직교인 문서에서 `issues`가 `['非直交通り芯']` **하나뿐**이고, 두 방향이 다 `distance` 해석 불능인 문서에서도 `通り芯距離解釈不能`이 **하나뿐**이다.
13. **원점 검산**: `originX`가 0이 아닌 합성 그룹에서 節点 좌표가 `originX + distance`와 맞으면 `通り芯位置と節点の不一致`가 **들지 않는다**(원점을 무시하는 구현이면 이 케이스가 깨진다).

## 산출물
`phases/33-stbridge-skeleton-import/step3-report.json`: `files`, `grid_rules`(거부 규칙별 테스트 이름과 기대 issue), `contrast_case`(angle 45 → grids 0 / angle 270 → grids 2 실측), `story_rules`(통짜 거부 사유별 테스트), `expected_fixtures`(5건 각각의 spansMm·라벨 배열·stories 배열·issues), `step0_mismatches`, `mutations`(흔들기 5건 각각 — 흔든 내용·실패 테스트·메시지 원문·원복 확인), `vitest`(`domain`·`ui` 두 프로젝트의 passed 수), `pt_field_grep`, `untouched_tracks`.

`summary`(한 줄): 「通り芯·階 후보가 서고 실물 4건을 전 칸 대조로 고정했다. angle 판정·통짜 거부·값 미채움을 흔들면 실패하며, 방향을 groupName으로 정하는 구현은 모순 케이스에서 깨진다.」
