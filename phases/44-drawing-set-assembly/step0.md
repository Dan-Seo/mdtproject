# Step 0 (검증 게이트): ADR-046과 세트 골든 2판을 반증하라

너는 검증자다. **대상을 고치지 마라.** 어긋나면 그대로 두고 무엇이 어긋났는지 적어라.
고치기 시작하면 만든 쪽이 자기 것을 승인하는 것이 되어 교차가 무너진다.

## 배경

이 phase는 「도면 세트 단위 조립 계층」을 만든다 — 여러 PDF의 여러 면에 断面リスト·伏図·軸組図
세 파서를 전부 돌리고, 사용자가 세트에 넣을 면·블록을 고르면(세트 구성원 선택), 면과 면을
대조해(突合) 조립 후보 하나를 내고, 사람이 선택을 마치면 기존 반영 함수를 합성해 반영한다.
**파서는 개선하지 않는다.** 사람이 도면에서 읽은 것과 현재 파서 출력의 차이는 골든의
`knownGaps`에 경로 단위로 등록된다. 자동 강등(영역 겹침)은 만들지 않는다 — 계획 검토
`phases/44-drawing-set-assembly/plan-review-codex.md` B1의 실측(karatsu-jikugumi2-p1 오탐 블록과
ina-p6 정당 블록이 둘 다 軸組図 영역과 교집합 0)으로 증거가 반증됐다.

설계는 `docs/ADR.md` **맨 끝의 ADR-046**, 기대값은 세트 골든 2판
`tests/fixtures/drawing-set/expected/*.json`(세트는 yokohama·hirosaki·ina·kani·tsu 다섯)이다.
둘 다 Claude 세션이 썼다. 이 스텝은 그것을 **독립 재현으로 반증**한다.

## 읽어야 할 파일

- `docs/ADR.md` — `### ADR-046`부터 끝까지.
- `tests/fixtures/drawing-set/expected/*.json` 다섯 전부.
- `tests/fixtures/section-import/textitems/<fixture>.json` — 골든의 `pages[].fixture`가 가리키는 면
  (`page{widthPt,heightPt}`·`items[{str,x,y,w,h,rot?}]`).
- 기존 골든 `tests/fixtures/plan-import/expected/*.json`, `tests/fixtures/section-import/expected/*.json`.
- `src/lib/import/runs.ts`(`compact`, 회전 글리프 결합 규약), `src/lib/import/story-label.ts`(`storyKey`·`storyLabelFromTitle`),
  `src/lib/import/framing-plan/{types,apply,parse,elevation}.ts`, `src/lib/import/section-list/{types,parse}.ts`,
  `src/components/plan/PlanImport.tsx`, `src/domain/model/project.ts`.
- 계획 검토 `phases/44-drawing-set-assembly/plan-review-codex.md` — 반례의 출처. 판정은 네가 다시 한다.

## 원문 대조 규약 (A4·A5·A6에 공통)

- **글리프열 조립.** 픽스처의 `items[].str`은 글자 단위인 경우가 많다(hirosaki-p25의 `1FL`은 `1`·`F`·`L`
  세 아이템). 가로 글리프는 같은 y(허용 **1pt 이상** — ina 제목의 축척 글리프는 0.6pt 어긋나 있다)끼리 **x 오름차순**, 회전(`rot` −90) 글리프는 같은 x(±1pt)끼리
  **y 내림차순**으로 이어 문자열을 만든다. 쓴 허용치를 evidence에 적어라(`src/lib/import/runs.ts`의 결합 방향과 같다). 대조는 이 글리프열에
  대해 하고, evidence에는 글리프열의 첫 아이템 index와 좌표를 적는다.
- **문자열 비교.** 양변을 NFKC 정규화하고 공백을 제거한 뒤 동일 여부를 본다. 그 이상의 정규화(축척 접미
  제거 등)는 골든의 `$comment`가 선언한 규약만 허용한다.
- **근거 종류.** 필드마다 근거가 다르다 — 원문 라벨·치수·제목은 글리프열, `roles`·`listKinds`·`blockTitles`·
  `frameCount`는 「사람이 이 면을 무엇으로 읽는가」(원문 제목·표 제목의 존재), `blockToStory`·`conflicts`·`stories`는
  ADR-046 6.2의 규칙을 원문 값에 적용한 결과. **실행으로만 나오는 값을 raw 토큰에 요구하지 마라**(거짓 반증).

## 반증할 성질 — 항목마다 `{id, holds, method, evidence}`

- **A1 ADR-046의 현황 서술이 레포와 맞는다.** ADR이 「현재 이렇다」고 적은 문장 각각(세 파서의 함수명·파일·반환 타입,
  `applyFramingPlan`·`applyElevation`의 skips·refusals 코드, `Project.grid`가 하나, 교차 페이지 대조 로직이
  제품 코드에 없고 `tests/plan-import/corpus2-elevation.test.ts`에만 있다, `ElevationCandidate`에 수평 축이 없다,
  파서가 SL 계열 레벨을 화이트리스트에서 제외한다)에 대해 네가 확인한 근거(파일·줄)를 적어라. 「교차 페이지 로직이
  없다」는 **`src/lib/import/drawing-set/` 디렉터리와 조립 함수(`assembleDrawingSet`·`reconcileAssessments`·`resolveDrawingSetPlan`·`applyDrawingSet`·`levelStoryKey`)의 선언·호출이 `src/`에 없다**는 뜻이다 — 그 범위로 확인하고 방법을 적어라. 테스트 설명·주석·골든 `$comment`·픽스처 문자열에 그런 단어가 있는 것은 제품 현황의 반증이 아니다(R2-15: `tests/stress/multi-story.test.ts`의 「reconciles」가 그 예다). 호출처 인용은 실제 call expression과 주석
  출현을 구분하라(A6 지적: `runs.ts`의 `parseSectionLists`는 주석뿐이다).
- **A2 기존 기호와 계획 산출물이 분리돼 있고, 기존 기호는 전부 실재한다.** ADR 본문의 파일 경로·함수·타입·상수·report
  경로를 전부 뽑아 둘로 나눠라. ① **기존 기호**(ADR이 현재 존재한다고 인용) → 하나씩 존재 확인, 전부 실재해야 성립.
  ② **계획 산출물**(`src/lib/import/drawing-set/`·`assembleDrawingSet`·`resolveDrawingSetPlan`·`applyDrawingSet`·
  `levelStoryKey`·`step*-report.json` 등) → `planned_symbols: [{name, introduced_by_step}]`로 적고, ADR이 그것을
  「이미 있다」고 서술하지 **않는지**만 본다. 계획 산출물이 지금 없는 것은 정상이며 반증 사유가 아니다. 그 경로를
  `paths_expected_absent`에 넣지도 마라(계속 없어야 하는 것이 아니다).
- **A3 세트 골든이 스키마 2판을 지킨다.** 최상위 키 `$comment`·`set`·`pages`·`grid`·`stories`·`storiesReference`·
  `blockToStory`·`unmatchedBlocks`·`conflicts`·`knownGaps`·`unsure`; `pages[]`는 `fixture`·`source`·`pageNumber`·`roles`·
  `listKinds`·`blockTitles`·`frameCount`. `demotedBlocks`·`sectionStoryLabels`·`elevationCount`는 **없어야** 한다.
  `grid`·`stories`는 객체 또는 `null`; `grid`면 `xLabels.length === xSpansMm.length + 1`(Y도); `stories`면
  `levels.length === heightsMm.length + 1`이고 `storiesReference`가 있다. `roles`는 `['断面リスト','伏図','軸組図']`
  enum 순의 부분열이다. `conflicts[]`는 `{code, blocking, evidence: [{source, pageNumber}], payload}`꼴이고 payload의 참조는 골든 표현(계열 `{fixture, titles}`, 블록 `{fixture, blockTitle?}`),
  코드별 payload는 通り芯不一致 `{blocks}` / 階高不一致 `{reference, series, levelA, levelB, referenceMm, seriesMm}` / 階未収録レベル `{series, level}` / 階重複ブロック `{storyName, blocks}`,
  사람이 쓴 설명은 `note`에만 있다. `blockToStory[]`는 `{fixture, blockTitle?, storyName}`, `unmatchedBlocks[]`는 `{fixture, blockTitle?}`. `knownGaps[]`는 `{path, direction, reason, ref}`이고 `direction`은 `missing`|`extra`|`both`(규약은 A9), `unsure[]`는 `{path, reason}`.
- **A4 원문 값이 글리프열에 있다.** `pages[].blockTitles`·`storiesReference.titles`·`conflicts[].payload.{reference,series}.titles`·`conflicts[].payload.blocks[].blockTitle`(제목 비교 규약: 양쪽 모두 NFKC → 공백 제거 → 끝의 축척 토큰(`S=1/\d+` 또는 `1/\d+`) 1개 제거 → 동일(**대칭** — 파서가 축척을 떨어뜨리는 경우와 골든이 원문 축척을 전사한 경우 둘 다 덮는다; 골든 값은 원문 전사 그대로) — 원문 글리프열과 골든 제목을 이 규약으로 대조), `grid.xLabels`·`yLabels`,
  `stories.levels`(aliases는 `／`로 결합된 각 부분), `conflicts[].payload`에 적힌 レベル명.
  찾아지지 않는 값이 있으면 `holds: false`와 그 값·면.
- **A5 순서가 규약대로다.** `grid.xLabels`는 라벨 글리프열의 x 오름차순, `yLabels`는 y 오름차순(top-left 원점,
  y가 클수록 아래). 회전된 면은 라벨 밴드가 놓인 쪽 좌표로 판정하고 어느 좌표인지 적어라. `stories.levels`는
  y 오름차순(위→아래). `listKinds`·`blockTitles`는 파서의 실제 앵커 정렬 그대로 — `row.y` 오름차순 다음 `x` 오름차순(`src/lib/import/section-list/parse.ts`의 앵커 정렬,
  동률은 y가 **같을 때만**). `sameBand`는 표 경계용이지 정렬 동률 허용폭이 아니다 — 그것을 쓰면 yokohama-p15의 壁(y 120.96)→スラブ(y 128.04)가 뒤집혀 거짓 반증이 된다. 기존 리스트 골든의 편집 순서를 베낀 것은 페이지 순서가 아니다.
- **A6 스팬·階高·합계가 치수 글리프열에 있다.** `grid.xSpansMm`·`ySpansMm`·`stories.heightsMm`의 각 값이 그 면의
  치수 문자열(천 단위 콤마 포함)로 존재하고, 합계가 적힌 면에서는 합이 합계 문자열과 같다. **독립 치수 문자열이 없는
  유도값(ina의 1200 같은 것)이 `stories.heightsMm`에 들어 있으면 `holds: false`** — 그것은 `unsure`에만 있어야 한다.
- **A7 `stories`가 6.2의 基準 규칙으로 채워졌다.** `storiesReference`가 가리키는 면·제목의 계열이 골든 안에서
  「라벨 있는 レベル이 가장 많은 후보, 동수면 면·파서 후보 순」인지 원문으로 확인하라. `storiesReference`는 `{fixture, titles}`이며 index만으로 지목하지 않는다 — `titles`가 그 면의 軸組図 제목 글리프열에 있어야 한다(A4의 제목 비교 규약으로). `storiesReference`가 `null`이거나 `knownGaps`에 `missing`으로 등록돼 있으면(kani) 이 확인은 건너뛰고 `stories`도 그 간극으로 등록돼 있는지만 본다. 基準으로 삼을 후보(라벨 있는
  レベル 2개 이상)가 원문에 없는 세트만 `stories: null`이다.
- **A8 `blockToStory`·`conflicts`가 6.2 규칙의 결과다.** 골든의 `stories.levels`에 대해 전 구간 선택(top＝첫 レベル,
  bottom＝마지막)의 미래 Story 이름(바닥 レベル들, aliases `／` 결합)을 만들고, 각 `blockTitles`에 `storyLabelFromTitle`→
  `storyKey`, 각 Story 이름에 ADR-046 6.2의 `levelStoryKey` 문법(NFKC·공백 제거 → 표고·괄호 제거 → `^(\d+)(FL|SL|F|階)$`→숫자,
  `^(R|RF|RFL|RSL|R階)$`→`'R'`, 그 외 없음)을 **네가 손으로** 적용해 대응을 구하고 골든과 같은지 보라. 한 Story에 블록
  둘이면 `階重複ブロック`(blocking)이 있어야 하고, 키 없는 블록은 `unmatchedBlocks`에 있어야 한다. 계열이 여럿인 세트는
  レベル 대응 규칙 — 라벨 L(NFKC·공백 제거)은 基準에서 정확히 한 レベル·상대 계열에서 정확히 한 レベル이 가질 때만 쓰고, 상대 レベル의 대응 라벨들이 모두 같은 基準 レベル을 가리킬 때 그 쌍이 대응한다(양 계열 유일성; alias가 서로 다른 基準 レベル을 가리키면 대응 없음 → `階未収録レベル`) — 로 대응 쌍을 구하고, 그 사이 누적합을 비교해 `階高不一致`(정보; payload `levelA`·`levelB`는 대응된 인접 쌍의 **基準 쪽 Story 이름** `labels.join('／')`, 위가 A·아래가 B — yokohama의 `中央棟1FL／基準GL`이 그 예다) 또는 이름 없는 レベル의 `階未収録レベル`(정보)이
  골든대로인지 본다. kani의 `RG` 대 `RG(水上)/RG(水下)`는 이름이 다르므로 未収録이지 不一致가 아니다.
- **A9 `knownGaps`가 stale하지 않고 근거가 있다.** 각 항목의 `direction`이 `missing`|`extra`|`both`이고(`direction`은 `missing`|`extra`|`both`. 「주장」은 골든/사영 출력 JSON의 **원시값 리프 경로**(예 `stories.levels[3]`)이고 배열은 **index로** 대응한다(재배열·집합 비교 없음). knownGaps의 `path`는 그 **하위 트리 전체**를 덮으며, 한 경로에 항목은 하나다(방향 둘이면 `both`). 같은 경로의 원시값이 다르거나 배열 앞쪽에 요소가 끼어 index가 밀리면 `both`, 배열 뒤에만 더 있으면 `extra`, 뒤쪽만 빠지면 `missing`, 골든 값이 있는데 출력이 `null`·부재면 `missing`(반대면 `extra`).) `missing`·`both`면 `path`가 골든에 실재하며 `extra`면 `path`가 출력 쪽 경로로 해석 가능하고, 같은 `path`에 항목이 둘 이상 없고, `ref`가 `docs/RISKS.md`의 항 또는
  실재하는 테스트 경로이며, `reason`이 파서 한계로 설명되는지(예: kani-p40/p41 `軸組図候補なし`는
  `tests/plan-import/elevation.test.ts`가 빈 후보를 고정한다) 항목별로 적어라. 이 항목의 확인에 한해 파서를 돌려
  「실제로 다르다」를 볼 수 있다 — 골든 값을 파서로 유도하는 것이 아니라 간극의 실재를 보는 것이다.
- **A10 기존 골든과 모순이 없다.** 같은 면의 `*-grid.json`·`*-elevation.json`·section-import 골든의 라벨·스팬·레벨·階高와
  세트 골든 값이 같다(페이지 순서로 재배열된 경우 원소 집합과 인접 관계가 같으면 된다). 값이 다를 때 다음 둘 중 하나면 반증이 아니다 —
  ① 그 경로가 `unsure` 또는 `knownGaps`에 있다 ② 새 골든의 レベル 이름이 `／` 결합 alias이고 기존 골든의 라벨이 그 alias 집합의 부분집합이다(tsu `1FL` ⊂ `1FL／1SL`,
  원문에서 확인되는 독립 전사 보충). 그 외만 반증. tsu 골든의 `$comment`에 「`1FL／1SL`이 현재 출력」류의 틀린 서술이 남아 있으면 `holds: false`.
- **A11 동결 manifest.** `tests/fixtures/drawing-set/expected/*.json`, `tests/fixtures/plan-import/expected/*.json`,
  `tests/fixtures/section-import/**/*.json`, `docs/ADR.md`의 `{path, sha256}`를 `frozen_manifest`에 적어라. step 7이
  이것과 대조한다(step 6은 ADR-046 보충을 추가하므로 ADR은 「ADR-046 보충 소절 앞까지」가 같아야 한다고 step 7에 적혀 있다).

## 하지 말 것

- ADR·골든·코드·테스트를 고치지 마라. 이유: 검증자가 구현자가 되면 교차가 무너진다.
- 파서 출력에서 골든의 기대값을 유도하지 마라(A9의 간극 실재 확인만 예외). 이유: ADR-010.
- 존재하지 않는 경로를 `paths_verified`에 적지 마라. 이유: `scripts/check-citations.py`가 실패한다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`:
- `verdict`: `"upheld"`|`"refuted"`; `claims`: A1〜A11 각 `{id, holds, method, evidence}`.
- `planned_symbols`, `frozen_manifest`, `sets_checked`(다섯 경로).
- `paths_verified`(근거로 읽은 실재 파일), `paths_expected_absent`(보통 빈 배열).
- `python scripts/check-citations.py phases/44-drawing-set-assembly/step0-report.json`이 0.

하나라도 `holds: false`면 `refuted`로 종결(재시도 없는 정상 종결, 뒤 스텝은 게이트에 막힌다). 전부 성립하면 `completed`.

## 기록 규칙

- `paths_verified`＝읽으려고 존재를 확인한 경로, `paths_expected_absent`＝부재가 결론인 경로. 섞지 마라.
- 검증 명령 인자에 한글·일본어를 넣지 마라. 일본어 패턴은 파일에 써서 `grep -f`로 주거나 스크립트 안에서 읽어라.
