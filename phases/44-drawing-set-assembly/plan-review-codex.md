**Phase 44 계획 독립 검토 — 현재 계획은 실행 준비 미충족**

검토일: 2026-09-10. 기준 HEAD: `4fa9058`. 판정: **refuted — 계획 수정 후 구현 게이트를 다시 검증해야 한다.** 이 문서는 계획 검토 보고서이며 phase의 `index.json` status를 바꾸지 않는다.

요청한 순서대로 brief 전체(§5 포함), ADR-046, index 및 step 0–8, 세트 골든 5개, worker summary 4개, CLAUDE.md와 ADR-030·035·043·044를 읽었다. 그 뒤 실제 구현·기존 테스트·텍스트 아이템을 대조했다. 보고서에서 `brief`는 다음 파일이다.

`C:/Users/emper/AppData/Local/Temp/claude/C--Users-emper-mdtproject/f3a3dfdc-bd3b-4134-a15d-d234d681c866/scratchpad/brief-drawing-set.md`

severity 기준: **blocker**는 사양을 그대로 지키면 후속 스텝/AC를 완수할 수 없는 것, **major**는 잘못된 조립·자료 손실·검증 공백 또는 거짓 반증을 만드는 것, **minor**는 국소적인 문서·실행 지시의 보정이다.

실행한 검증은 다음과 같다.

- 36개 TextPage에 기존 세 파서를 직접 실행했다. 결과는 원문 전사 골든을 만드는 데 사용하지 않고, 사양의 구현 가능성과 회귀 조건을 검증하는 데 사용했다.
- 원시 `items`를 별도로 읽어 가로 글리프는 x 오름차순, rot −90 글리프는 y 내림차순으로 재구성했다. 아래 원문 근거의 행 번호는 해당 글리프열 첫 아이템의 `str` 행이다.
- 영역 계측은 TS 소스를 메모리에서 transpile하고 후보 생성 위치에 진단 필드만 추가한 data URL 모듈로 수행했다. 디스크의 파서 파일은 수정하지 않았다.
- `.cache/dwg-tsu-kanritou.pdf` 전체를 Node의 pdf.js와 제품의 `toTextItems`로 읽어 step 6 입력 범위를 확인했다. PDF나 텍스트 픽스처를 생성·수정하지 않았다.
- 파일 단위 Vitest **7개 파일, 171건 통과**. 테스트 대상은 `tests/plan-import/corpus2-elevation.test.ts`, `tests/plan-import/corpus2.test.ts`, `tests/section-import/textitems.test.ts`, `tests/plan-import/elevation.test.ts`, `src/lib/import/story-label.test.ts`, `src/lib/import/framing-plan/elevation.test.ts`, `src/lib/import/framing-plan/apply.test.ts`다. 실행 옵션은 `--no-cache --maxWorkers=1 --no-file-parallelism --reporter=dot`이었다. 기존 테스트 통과는 새 계획의 타당성을 뜻하지 않는다.
- git 쓰기 명령, `scripts/execute.py`, build, dev 서버는 실행하지 않았다. 시작 시부터 있던 `docs/ADR.md`, `evals/harness/README.md`, `evals/harness/run.test.ts`, `evals/harness/run.ts`, `phases/index.json` 변경과 미추적 phase/골든 파일은 손대지 않았다. 작성 대상은 이 보고서 한 파일이다.

**A. Brief·ADR·스텝·골든 사이의 모순**

**A1 — blocker: R1–R5가 아직 제안인 상태인데, 기존 결정을 고정하는 구현·검증 사양은 그대로다.**

근거: brief:142–147은 R1–R5를 검증 후 반영할 제안으로 명시한다. 그러나 `docs/ADR.md:986`과 `phases/44-drawing-set-assembly/step4.md:48`은 여전히 모든 계열의 완전 일치 및 불일치 시 `stories: null`을 요구한다. `phases/44-drawing-set-assembly/step4.md:27`의 충돌 enum과 `phases/44-drawing-set-assembly/step4.md:29`의 notice enum에는 R1의 `階未収録レベル`이 없다. `phases/44-drawing-set-assembly/step4.md:42`의 함수에는 基準系列 선택 인자가 없고, `phases/44-drawing-set-assembly/step5.md:21`의 choices 및 `phases/44-drawing-set-assembly/step6.md:25`의 UI에도 그 선택이 없다. `phases/44-drawing-set-assembly/step2.md:24`는 region 필드 셋만 추가한다. `phases/44-drawing-set-assembly/step7.md:33`은 ADR 결정 변경을 금지한다.

수정: 실행 전에 작성자가 ADR-046·step 2–8·골든을 하나의 결정으로 동기화해야 한다. 基準系列 식별자/선택 인자, 충돌의 차단 여부, notice payload, 정규화 함수, 축 검사의 구현 범위를 먼저 확정한다. step 7의 사후 보충으로 해결할 수 없다. 기존 `stories: null`이 제안 R4에 어긋난다는 이유만으로 지금 골든을 허위 전사라고 판단해서도 안 된다. 그것은 아직 채택되지 않은 정책과의 차이다.

**A2 — blocker: 골든의 사람이 읽은 도면 전체와 기존 파서가 내는 후보를 같은 출력 계약으로 취급했다.**

`phases/44-drawing-set-assembly/step2.md:50`은 필드 추가 이외 파서 출력·순서·issue 변경을 금지하고, `phases/44-drawing-set-assembly/step3.md:70`, `phases/44-drawing-set-assembly/step4.md:74`도 파서를 바꾸지 못하게 한다. 동시에 `phases/44-drawing-set-assembly/step4.md:58`과 `phases/44-drawing-set-assembly/step4.md:61`은 새 골든의 값과 면별 출력 전체를 `toEqual`하라고 한다. 아래 차이는 region 추가나 조립으로 복구할 수 없다.

| 대상 | 새 골든 | 현재 파서 및 기존 검증 | 근거 |
|---|---|---|---|
| ina-p6 伏図 | 제목 있는 블록 3개 | 제목 없는 블록 1개, placements 4개 | `tests/fixtures/drawing-set/expected/ina.json:11`; `tests/fixtures/plan-import/expected/ina-pump-p6-grid.json:12`; `tests/plan-import/corpus2.test.ts:127` |
| ina-p6 階高 | RSL·SL·GL·1FL, `[3300,200,1200]` | `[[],[GL+756.50],[1FL+755.30],[]]`, `[3300,1400,800]` | `tests/fixtures/drawing-set/expected/ina.json:32`; `src/lib/import/framing-plan/elevation.ts:185`, `src/lib/import/framing-plan/elevation.ts:197` |
| kani-p40/p41 | 軸組図 roles, frame 数 4/2, 階高不一致 | 両面とも `elevations: []`, `寸法列未検出` | `tests/fixtures/drawing-set/expected/kani.json:25`; `tests/plan-import/elevation.test.ts:77`, `tests/plan-import/elevation.test.ts:99` |
| tsu-p16 | 杭・基礎/1階のブロック2個 | 杭伏図ブロック1個、placements 0個 | `tests/fixtures/drawing-set/expected/tsu.json:11`; `tests/fixtures/plan-import/expected/tsu-kanritou-p16-grid.json:12`; `tests/plan-import/corpus2.test.ts:127` |
| tsu-p20 | 2階・屋根のブロック2個 | `2階伏図S=1/100` 1個、placements 55個 | `tests/fixtures/drawing-set/expected/tsu.json:21`; `src/lib/import/framing-plan/parse.ts:1302`, `src/lib/import/framing-plan/parse.ts:1417` |

실제로 ina의 세 제목은 `tests/fixtures/section-import/textitems/ina-p6.json:42`, `:84`, `:2592`에 있다. 따라서 원문에 제목이 있다는 것과 파서가 세 블록을 낸다는 것은 별개다. kani는 기존 테스트가 빈 후보를 **의도적으로** 고정한다. `150450` 치수 결합으로 연쇄가 성립하지 않는 이유도 `tests/plan-import/elevation.test.ts:82`에 명시되어 있다.

수정: 원하는 조립 범위에 필요한 파서 개선을 별도 선행 스텝으로 설계하고 독립 골든으로 검증하거나, 이번 phase의 제품 청구 범위를 현재 파서가 제공하는 값으로 명시적으로 제한한다. 사람이 읽은 도면 정보는 별도 참고 전사로 보존한다. 골든 값을 파서 출력에 맞춰 베끼거나 `unsure`로 핵심 전체를 제외하는 것은 해결이 아니다.

**A3 — major: 제목·roles·listKinds의 정규화와 배열 순서 계약이 서로 다르다.**

- `phases/44-drawing-set-assembly/step3.md:25`, `phases/44-drawing-set-assembly/step3.md:37`은 roles를 `断面リスト → 伏図 → 軸組図` 순으로 고정하지만 `tests/fixtures/drawing-set/expected/kani.json:9`는 `[伏図,断面リスト]`다.
- `tests/fixtures/drawing-set/expected/yokohama.json:70`의 listKinds는 スラブ·片持スラブ·耐圧版·壁 순이다. 실제 제목의 y 순서는 壁(120.960)·スラブ(128.040)·片持(496.560)·耐圧版(680.760)다. 원문은 `tests/fixtures/section-import/textitems/yokohama-p15.json:10211`, `:10442`, `:10344`, `:10400`; 파서 정렬은 `src/lib/import/section-list/parse.ts:143`이다. 기존 리スト 골든의 편집 순서를 그대로 가져온 것은 페이지 순서가 아니다.
- 골든은 제목에서 축척을 제거한다(`tests/fixtures/drawing-set/expected/ina.json:2`, `tests/fixtures/drawing-set/expected/kani.json:2`, `tests/fixtures/drawing-set/expected/tsu.json:2`). 파서는 compact 후 축척까지 제목에 남긴다(`src/lib/import/framing-plan/parse.ts:340`, `:356`). `docs/ADR.md:544`도 이 점을 이미 정정했다. 예: `基礎伏図` 대 `基礎伏図1/100`, `梁伏図` 대 `梁伏図S=1/100`, 전각 `２階伏図` 대 반각 `2階伏図S=1/100`.
- kani-p38의 `listKinds`에는 `基礎リスト`도 있지만(`tests/fixtures/drawing-set/expected/kani.json:10`), 현재 제목 패턴은 이 종류를 인식하지 않는다(`src/lib/import/section-list/parse.ts:65`). 실제 출력은 `地中梁リスト` 하나다. 기존 골든도 基礎 표를 범위 밖 참고로 남겼다(`tests/fixtures/section-import/expected/kani-sakuragaoka-p38-foundation-girder.json:16`). ‘면에 적힌 모든 표 제목’과 ‘파서가 낸 listKinds’를 구분해야 한다.

수정: roles는 enum 순, 표는 좌표 기반 정렬 등 각 배열의 순서를 명시하고 독립 전사로 맞춘다. `rawTitle`과 비교용 `titleLabel`을 구분할지, `compact`된 파서 제목을 계약으로 삼을지 결정한다. projection에서 원문 축척을 임의 제거하고 정렬하는 방법으로 몰래 맞추지 않는다.

**A4 — major: 通り芯 대조 대상이 ADR에서는 모든 격자 후보, 사양에서는 살아남은 블록의 격자다.**

근거: `docs/ADR.md:985` 대 `phases/44-drawing-set-assembly/step4.md:45`. `PageAssessment`는 `phases/44-drawing-set-assembly/step3.md:35`에서 블록만 남기고 원래 `plan.grids`를 보존하지 않는다. 이 차이는 실물 결과를 바꾼다. tsu-p16에는 블록의 X1…X5 외에 X방향 `['2','1'] / [4700]` 격자 후보가 있고, ina-p6에는 Y `[B,A]`와 `[A,B]` 두 격자 후보가 있다. 기존 `ParsedFramingPlan.grids`는 블록과 독립해서 만들어진다(`src/lib/import/framing-plan/parse.ts:1511`, `:1530`). 모든 후보를 비교하면 두 세트에도 불일치가 생긴다.

수정: 조립 grid의 구성원을 **강등 후 채택 블록의 xGrid/yGrid**로 명시하려면 ADR도 그렇게 수정한다. ‘파서 결과를 버리지 않는다’는 약속을 유지하려면 미사용/비블록 격자는 별도 진단 필드에 보존하되 조립의 투표자가 되지 않게 한다.

**A5 — major: 비교 가능한 충돌/notice 스키마와 참고 설명이 섞여 있다.**

근거: `phases/44-drawing-set-assembly/step4.md:40`은 `{code,evidence,note}`이고, `phases/44-drawing-set-assembly/step4.md:58`은 conflicts 절 전체 비교를 요구한다. 그러나 `tests/fixtures/drawing-set/expected/yokohama.json:98`, `tests/fixtures/drawing-set/expected/hirosaki.json:42`, `tests/fixtures/drawing-set/expected/kani.json:65`의 note는 한국어 전사 설명·좌표·해석이다. 같은 코드/구간을 올바르게 찾아도 제품이 이 문장을 동일하게 생성할 계약은 없다. 면 evidence만으로는 hirosaki의 **한 면 내부** 계열 충돌을 식별할 수 없다(`tests/fixtures/drawing-set/expected/hirosaki.json:55`). `SET_NOTICES`는 선언되지만 `DrawingSetCandidate`에는 notices 필드가 없다(`phases/44-drawing-set-assembly/step4.md:29`, `:34`). 또한 ADR의 모든 claim에 `Evidence[]` 요구(`docs/ADR.md:984`)와 단일 `Evidence`인 `BlockAssignment`·`SectionStoryClaim`(`phases/44-drawing-set-assembly/step4.md:32`)이 다르다.

`sectionStories` → `sectionStoryLabels`, `blocks` → `blockToStory`라는 이름 차이 자체는 명시된 projection으로 해결 가능하다. 문제는 기계 대조 payload와 누락된 기록이다. `unmatchedBlocks`는 최상위 필수 키인데 `phases/44-drawing-set-assembly/step4.md:58`의 통째 비교 목록에서 빠졌다. 표별 claim도 ‘전 표’인지 ‘storyLabel 있는 표만’인지 불명확하다. yokohama는 라벨 없는 표를 생략하고(`tests/fixtures/drawing-set/expected/yokohama.json:90`), kani는 빈 labels의 地中梁 표를 남긴다(`tests/fixtures/drawing-set/expected/kani.json:58`).

수정: conflict/notice를 코드, source/page/series 또는 block 식별자, 레벨 구간, 양쪽 값, 차단 여부로 구조화한다. 사람이 쓴 note는 사유를 붙인 참고 전용 필드로 구분한다. claim의 evidence 형식과 빈 표 처리도 통일하고 `unmatchedBlocks`까지 청구한다. ‘정보성 충돌’인 R1과 적용을 막아야 할 grid/중복 충돌을 같은 무조건 허용 배열로 처리하지 않는다.

**A6 — minor: 잠정 census와 호출처 설명에 실제와 다른 부분이 있다.**

36면 재실행은 **list 13면 / block 16면 / elevation 8면**이며 복합 면은 ina-p6·ina-p7·kani-p38·karatsu-jikugumi2-p1 네 면이다. `docs/ADR.md:969`의 elevation 9면과 다르다. `docs/ADR.md:961`은 `runs.ts`를 parseSectionLists 호출처로 쓰지만 해당 파일의 유일한 이름 출현은 주석이다(`src/lib/import/runs.ts:70`). 역할/세트 대조가 현재 제품에 없다는 핵심 서술은 맞는다.

수정: 9를 확정 사실로 인용하지 않고 step 1에서 8과 조사 방법을 남긴다. ADR이 이미 잠정값이라고 표시했으므로 수치 차이만으로 현재 기능 오류라고 반증하지 않는다. 호출처는 실제 call expression과 주석 출현을 구분한다.

**B. 실제 타입·함수 및 영역 계산의 구현 가능성**

| 의존 항목 | 현재 존재 / 도입 순서 | 확인 근거와 판정 |
|---|---|---|
| TextPage, ParsedSectionList, candidate.storyLabel | 존재 | `src/lib/import/section-list/types.ts:9`, `:44`, `:124` |
| parseSectionLists / parseFramingPlan / parseFrameElevations | 존재 | `src/lib/import/section-list/parse.ts:2743`; `src/lib/import/framing-plan/parse.ts:1427`; `src/lib/import/framing-plan/elevation.ts:356` |
| MemberPlacement.positionPt | **없음** | `src/lib/import/framing-plan/types.ts:50`. ix/iy와 일부 axis만 있다. |
| AxisCandidate.positionPt / alongKey | 존재; alongKey는 내부 | `src/lib/import/framing-plan/types.ts:20`; `src/lib/import/framing-plan/parse.ts:1360` |
| RegionPt, 세 후보의 regionPt | 없음 → step 2가 추가 | `src/lib/import/types.ts:1`; `phases/44-drawing-set-assembly/step2.md:24`. PlanBlock 추가는 합리적이지만 ADR의 두 필드 목록(`docs/ADR.md:983`)도 동기화해야 한다. |
| ElevationCandidate의 축 라벨·수평 스팬 | **없음; 내부에서도 계열별 축을 만들지 않음** | `src/lib/import/framing-plan/types.ts:106`; `src/lib/import/framing-plan/elevation.ts:359`, `:439` |
| storyKey / storyLabelFromTitle | 존재; FL/SL의 exact key는 없음 | `src/lib/import/story-label.ts:16`, `:39` |
| runPageParsers / assessPageRoles / PageAssessment | step 3이 추가 | `phases/44-drawing-set-assembly/step3.md:22`, `:45`; step 4 의존 순서는 맞다. |
| DrawingSetCandidate / assembleDrawingSet | step 4가 추가 | `phases/44-drawing-set-assembly/step4.md:24`; step 5 의존 순서는 맞다. R1 선택 계약은 빠져 있다. |
| applyElevation / applyFramingPlan와 result/options | 존재 | `src/lib/import/framing-plan/apply.ts:29`, `:110`, `:215`, `:243` |
| refusal 타입 | 존재; 정의 파일은 types.ts | `src/lib/import/framing-plan/types.ts:127`, `:145` |
| extractTextPages / updateProject / UI 테스트 주입 | 존재 | `src/lib/import/pdf-text.ts:20`; `src/components/plan/PlanImport.tsx:41`, `:252`, `:365` |
| Grid / Story | 존재 | `src/domain/model/project.ts:67`, `:94`. domain 변경은 필요하지 않다. |

index의 step 0 verify+gate, step 8 verify/non-gate 및 0→8 순서는 brief와 일치한다(`phases/44-drawing-set-assembly/index.json:5`, `:47`). 문제는 누락된 선행 기능과 게이트의 성질이다.

**B1 — blocker: 명시된 영역 정의로는 목표 강등 문턱이 존재하지 않는다.**

근거: `phases/44-drawing-set-assembly/step1.md:37`–`phases/44-drawing-set-assembly/step1.md:44`와 `phases/44-drawing-set-assembly/step2.md:32`–`phases/44-drawing-set-assembly/step2.md:34`의 정의를 그대로 적용했다. 블록은 `src/lib/import/framing-plan/parse.ts:1360`의 xExtent/yExtent, 軸組図는 `src/lib/import/framing-plan/elevation.ts:380`의 채택 chain과 `:423`의 붙은 labels, levels의 상하단으로 쟀다.

| 면 | 블록 bbox pt `(x0,y0,x1,y1)` | 軸組図 bbox pt | 교집합/블록 면적 |
|---|---|---|---|
| karatsu-jikugumi2-p1: 제거해야 하는 오탐 | `(165.328,636.568,708.988,720.028)` | `(84.508,64.714,118.108,208.106)` | **0** |
| ina-p6: 유지해야 하는 복합 면 | `(267.954,565.319,382.708,656.048)` | `(816.008,495.411,866.893,573.646)` | **0** |

karatsu의 현재 높이 후보는 위쪽 치수열에서 만들어졌지만 제목은 아래 Y0/Y1까지 같은 후보에 붙는다(`src/lib/import/framing-plan/elevation.ts:451`). 원문에서도 2FL은 상단 `tests/fixtures/section-import/textitems/karatsu-jikugumi2-p1.json:867`과 하단 `:2035`에 각각 있고, Y1 제목은 `:2056`에 있다. ‘한 높이 후보가 설명하는 도면 전체 영역’과 ‘그 후보를 만든 치수열·레벨 라벨의 좁은 영역’은 다르다. 제목의 x/y를 bbox에 포함시키는 것은 현재 사양의 정의가 아니다.

`phases/44-drawing-set-assembly/step1.md:79`의 조건은 `legitimate_max < known_false_min`이다. karatsu가 0이므로 false 최솟값은 0이고, ina의 유지 대상도 0이어서 부등식은 성립할 수 없다. 0보다 큰 문턱은 karatsu를 못 잡고, 0 이하의 문턱은 ina도 강등한다. list 영역의 나머지 계측 결과와 무관한 반례다. shibata-p13은 경쟁 출력 자체가 없어 계속 남는다.

수정: step 1의 실패를 정식 설계 게이트로 취급해 **영역 정의/역할 증거를 먼저 재설계**한다. frame별 도면 영역을 새로 식별하는 방법은 추가 파서 작업이며 별도 계측이 필요하다. 단순 bbox 확장이나 0 문턱을 처방할 근거는 없다. 현재처럼 step 2를 먼저 구현하고 step 3에서 `blocked`(`phases/44-drawing-set-assembly/step3.md:52`)로 끝내게 두지 않는다.

**B2 — major: ‘리スト가 소비한 아이템’은 유도 가능하지만 집합의 정의가 아직 없다.**

`tableRows[].items`와 잘라낸 `localRows[].items`는 존재한다(`src/lib/import/section-list/parse.ts:2605`, `:2683`). 따라서 `xStart/xEnd`의 Infinity를 bbox로 쓰지 않고 좌표를 얻는 작업 자체는 가능하다. 그러나 ‘읽어 본 아이템’과 ‘필드 값으로 채택한 아이템’은 다르다. スラブ는 다음 제목 이후 행도 읽고 壁/スラブ는 x 절단을 우회한다(`:2608`, `:2613`). 마지막 표의 endY는 페이지 하단이다(`:2790`). `VerticalRun`은 원래 items/w/h를 잃는다(`src/lib/import/runs.ts:39`, `:266`).

특히 ina-p7 柱リスト는 후보가 0개인 `符号行未認識` 출력이다(`src/lib/import/section-list/parse.ts:2651`). 성공적으로 읽힌 값만 bbox에 넣으면 영역이 없고, 모든 스캔 행을 넣으면 표제란/이웃 표까지 포함할 수 있다. 그런데 `phases/44-drawing-set-assembly/step2.md:24`는 모든 출력에 필수·유한 region을 요구한다. bbox의 y는 baseline이므로 `[y-h,y]`, 회전 글자의 진행축은 `[y-w,y]`라는 기존 규약도 적용해야 한다(`src/lib/import/runs.ts:15`, `:256`).

수정: 제목·header·채택 셀·회전 치수 중 포함할 집합, 후보 0개 표의 fallback, 빈/퇴화 영역과 동률 reason 처리까지 step 1 전에 정의한다. 원시 item 식별자를 보존하는 계측이 필요하다. 또한 블록 영역은 **전체 격자 extent**인지 실제 placements에 쓰인 좌표만의 extent인지 명시한다. tsu-p16은 placements가 0개여서 후자의 정의로는 bbox가 없다. 이번 B1 계측은 사양의 xGrid/yGrid 전체 extent 해석이다.

**C. 설계 개정안 R1–R5 판정**

**R1 — 원칙에 동의, ‘현재 파서 위에서 다섯 세트를 해결한다’는 해석은 반증 (major).**

공통 구간만 비교하는 것은 hirosaki에 잘 맞는다. `tests/fixtures/plan-import/expected/hirosaki-kikyono-p25-elevation.json:15`의 X1 7레벨과 `:102`의 X3 6레벨은 PHFL 이하 `[4000,4000,4500,100,2310]`가 같다. 원문 RFL은 `tests/fixtures/section-import/textitems/hirosaki-p25.json:1258`, `:3785`; 하단 X3의 시작 PHFL은 `:5348`이다. R1의 기본값이면 X1을 포함하는 첫 7레벨 후보를 택하고 X3의 상단 결번 때문에 충돌시키지 않는다.

yokohama의 기초 차이도 실재한다. `tests/fixtures/section-import/textitems/yokohama-p8.json:4635`는 2690, p9 `:4765`는 2490, 같은 p9 오른쪽 `:5382`는 2690이다. 다만 현재 p9 첫 후보가 bX1과 bX2A 제목 모두에 2490을 연결한다(`tests/plan-import/elevation.test.ts:119`, `:135`). R1은 이 잘못된 세부 귀속을 되돌리지 못한다. 기본 후보에는 골든의 네 레벨 이외 무라벨 상단과 1400도 있다(`tests/plan-import/elevation.test.ts:27`, `:39`).

kani 원문에서 p40의 RG(水上)/RG(水下)는 `tests/fixtures/section-import/textitems/kani-p40.json:3196`, `:3067`, p41의 RG는 `tests/fixtures/section-import/textitems/kani-p41.json:1935`다. 원문 기준 R1이면 공통 FL→GL→BL은 같고, Y1의 RG(水下)→FL도 같다. Y2의 **RG**는 基準의 **RG(水上/水下)**와 이름이 다르므로 ‘같은 구간의 높이 불일치’가 아니라 未収録レベル 대상이다. 그러나 실제 파서는 kani 두 면에서 후보를 아예 못 내므로 선택할 基準系列이 없다.

수정: 基準 후보 ID와 사용자 선택 인자를 추가하고, 비교 구간은 공통 이름의 유일한 레벨 쌍 사이 **heightsMm 누적합**으로 정의한다. 이름 중복·무라벨·겹친 aliases 및 기준 변경 시 선택 무효화 규약도 명시한다. 경고는 candidate/interval를 식별하고 사용자가 확인할 수 있어야 한다. 잔여 사례는 kani-p40/p41, ina-p6, yokohama-p9의 bX2A 귀속, karatsu-jikugumi2-p1의 넓은 제목 묶음이다.

**R2 — 표기 정규화에 동의, 제안된 키와 기존 함수의 그대로 재사용 조합은 반증 (major).**

`storyKey('1階') === '1'`, `storyKey('R階') === 'R'`이며 FL/SL은 undefined다(`src/lib/import/story-label.ts:16`; `src/lib/import/story-label.test.ts:7`). 제안은 레벨 키를 `1F`·`RF`로 만들면서 블록 쪽 기존 키 `1`·`R`을 재사용하므로 그대로 비교하면 여전히 안 맞는다. PH/Bn은 ADR-035에서 명시적으로 제외했고 기존 테스트도 PH/B1F 거부를 고정한다(`docs/ADR.md:537`; `src/lib/import/story-label.test.ts:16`).

원문에 정규화할 근거는 있다. tsu의 `1FL`·`1SL`은 `tests/fixtures/section-import/textitems/tsu-p21.json:242`, `:493`이고 y도 274.68/275.04로 가깝다. 하지만 현재 whitelist는 SL을 **명시적으로 제외**하므로 `1FL／1SL`을 현재 출력이라고 적은 새 골든 설명은 틀렸다(`src/lib/import/framing-plan/elevation.ts:185`; `tests/fixtures/drawing-set/expected/tsu.json:68`, `:72`). hirosaki의 PHFL은 원문에 있지만 기존 helper가 처리하지 못한다. yokohama의 `中央棟1FL` 접두와 같은 레벨의 `基準GL`, tsu의 `RFL(水下)`, karatsu의 `RFL水上`도 단순 nFL 식만으로는 다루지 못한다.

ina는 `RSL+760.00`, `SL+756.70`, `1FL+755.30`가 각각 실재한다(`tests/fixtures/section-import/textitems/ina-p6.json:623`, `:413`, `:336`). 그러나 階 번호 없는 SL에는 키가 없고, `1階上部床梁伏図`와 `1階床梁伏図`는 기존 제목 helper로 같은 1 키가 된다. 둘을 1FL에 자동 귀속시키는 문제는 정규화로 풀리지 않는다. 중복 충돌과 사용자 선택이 남아야 한다.

수정: 양변이 같은 정준 공간을 사용하도록 `levelStoryKey`/`storyKey` 계약을 정한다. 숫자 및 roof key는 기존 `1`·`R`을 유지하거나 양변을 함께 변환한다. 허용 접미·표고·괄호·棟 접두의 문법과 다중 라벨의 유일 키 규칙을 테스트로 명시한다. PH/Bn 확장은 ADR 변경 및 기존 UI 회귀 범위를 함께 결정한다. substring을 무제한으로 잡으면 기존 레벨 문장 통과 한계(`src/lib/import/framing-plan/elevation.ts:189`)를 階 자동 대응으로 확대한다. 원문 키가 없는 基礎伏図·杭伏図·屋根伏図, ina 上部 블록, yokohama RCL은 수동 대응 대상으로 남는다.

**R3 — 동의. 현재 corpus의 역방향 축에 필요한 규칙이다. 별도 결함 없음; 미노출 입력은 major 잔여다.**

기존 `axisIsOrderedSubsequence`는 grid 라벨과 스팬을 **함께** 뒤집고 건너뛴 스팬을 합산한다(`tests/plan-import/corpus2-elevation.test.ts:94`, `:107`). tsu-p22의 `[Y1,Y2,Y3] / [7175,5825]`는 `tests/fixtures/plan-import/expected/tsu-kanritou-p22-elevation.json:39`에 있고, p16의 `[Y3,Y2,Y1] / [5825,7175]`와 역방향으로 일치한다(`tests/fixtures/plan-import/expected/tsu-kanritou-p16-grid.json:31`). hirosaki도 같은 사정이다.

수정: 양방향 부분열＋인접 구간 합을 그대로 명시하고 step 8의 허용 성질에도 포함한다. 현재 정의로 남는 사례는 yokohama-p8의 bX2A다. 원문 `tests/fixtures/section-import/textitems/yokohama-p8.json:4032`에 있는데 세트 grid에서는 빠져 있다(`tests/fixtures/drawing-set/expected/yokohama.json:115`). 반전은 빠진 축을 해결하지 않는다. 또 karatsu X3/X4는 높이 후보 하나를 공유해도 축은 서로 다르다(`tests/fixtures/plan-import/expected/karatsu-jikugumi1-p1-elevation.json:42`, `:61`; `tests/plan-import/corpus2-elevation.test.ts:244`). 후보 하나에 axis 하나를 달면 이 관계를 표현하지 못한다.

**R4 — 基準系列이 있는 경우에 한해 동의. 다섯 골든의 stories를 무조건 채우는 것은 반증 (major).**

hirosaki는 R1에 따라 7레벨의 stories를 유지하면서 X3 결번을 허용할 수 있다. yokohama도 기초 구간 차이 경고와 基準 stories를 함께 낼 수 있다. 반면 현재 kani는 기준 후보가 없고, ina의 기대 `[3300,200,1200]`는 파서가 낸 값이 아니다. 특히 1200은 독립 치수 문자열이 없다는 것을 골든 자체가 인정한다(`tests/fixtures/drawing-set/expected/ina.json:49`). 원문 1400·200은 `tests/fixtures/section-import/textitems/ina-p6.json:4062`, `:4142`에서 확인된다.

수정: `stories: null` 조건을 ‘기준으로 선택할 수 있는 유효 후보 없음’으로 명시한다. 파서 후보의 무라벨 레벨·aliases까지 보존하는 스키마와 사람이 선택할 경계 범위를 구분한다. 골든은 채택한 출력 계약을 원문에서 독립 재전사해야 하며, 보고된 충돌 종류도 R1대로 다시 판정해야 한다. kani의 RG 이름 차이를 자동으로 숫자 충돌로 남기면 개정 뒤에도 틀린다. ina의 유도값은 허용 여부/근거를 별도 결정하지 않고 확정 출력에 넣지 않는다.

**R5 — ‘通り 수 = ElevationCandidate 수’ 및 단순 필드 노출로 구현 가능하다는 해석을 반증 (major).**

현재 후보는 물리적 frame이 아니라 **높이 치수 계열**이다(`src/lib/import/framing-plan/types.ts:107`; `src/lib/import/framing-plan/elevation.ts:451`). 직접 재실행한 `elevations.length / titles 총수 / 새 골든 elevationCount`는 다음과 같다.

| 면 | 현재 후보 수 | 현재 후보의 titles 총수 | 새 골든 |
|---|---:|---:|---:|
| yokohama-p8 | 2 | 6 | 6 |
| yokohama-p9 | 2 | 4 | 4 |
| hirosaki-p25 | 3 | 4 | 3 |
| ina-p6 | 1 | 1 | 3 |
| kani-p40 / kani-p41 | 0 / 0 | 0 / 0 | 4 / 2 |
| tsu-p21 / tsu-p22 | 2 / 2 | 3 / 5 | 3 / 5 |

hirosaki에는 `X2通り+5765軸組図`라는 추가 제목도 실제로 있다(`tests/fixtures/section-import/textitems/hirosaki-p25.json:11116`). ‘세 주계열’인지 ‘보조 frame까지 포함한 通り 그림’인지의 범위를 결정하지 않고 제목 수로 대체할 수 없다. ina는 세 frame을 사람이 읽어도 후보의 제목은 포괄적인 `軸組図` 하나다(`tests/fixtures/section-import/textitems/ina-p6.json:2536`).

축 라벨도 output에만 숨겨진 것이 아니다. `elevation.ts`는 dimension/level/title만 모으고 `ElevationCandidate`에 수평 axis를 계산하지 않는다(`src/lib/import/framing-plan/elevation.ts:359`, `:439`). `corpus2-elevation.test.ts:345`의 축 검사는 제품 출력이 아니라 **두 독립 골든끼리**의 비교다.

수정: 현재 구현 가능한 `heightSeriesCount = elevations.length`와 참고용 `transcribedFrameCount`를 나누거나, frame 분리 및 frame별 axis 연결을 선행 기능으로 설계한다. R5 후단의 ‘내부 값이 없으면 검사 미구현’은 정직한 축소지만, 그 경우 ADR의 축 대조 완료 약속도 철회하고 UI에 미검증을 남겨야 한다. 남는 사례는 위 표 전체, 특히 ina/kani 및 서로 다른 axis를 공유하는 karatsu X3/X4다.

**D. verify step 0·8의 거짓 refuted 및 검증 누락 위험**

**D1 — blocker: step 0 A2가 미래 산출물의 현재 존재를 요구한다.**

근거: `phases/44-drawing-set-assembly/step0.md:36`–`phases/44-drawing-set-assembly/step0.md:38`은 ADR에 나오는 경로·함수·타입·report가 하나라도 없으면 holds:false라고 한다. 그런데 ADR은 계획 자체로 `step1-report.json`(`docs/ADR.md:963`), `src/lib/import/drawing-set/`·`DrawingSetPage`(`:980`), `DrawingSetCandidate`(`:984`), `applyDrawingSet`(`:989`)를 도입한다. step 0 시점에는 없어야 정상이다. gate=true(`phases/44-drawing-set-assembly/index.json:9`)라 이 요구만으로도 전 구현이 중단된다.

수정: 현황 서술의 기존 기호/인용과 계획된 산출물을 분리한다. 새 기호는 `planned_symbols: {name, introduced_by_step}`로 검증하고, 미래 report는 생산 스텝/스키마만 확인한다. 실제 근거로 현재 인용한 파일만 `paths_verified`에 넣는다. 계획된 부재를 ‘ADR의 거짓말’이나 반드시 계속 없어야 할 파일로 취급하지 않는다.

**D2 — major: 원문 검증을 literal token 존재로 읽으면 정상 전사도 반증한다.**

`phases/44-drawing-set-assembly/step0.md:46`은 각 라벨을 `items[].str`에서 찾으라고 하면서 명시적 조립은 회전 글리프에만 쓴다. 가로 라벨 역시 문자 단위다. hirosaki의 1FL은 `tests/fixtures/section-import/textitems/hirosaki-p25.json:14`의 `1`, `:21`의 `F`, `:28`의 `L`이다. 조립 없는 exact 검색은 실패한다. rot −90의 ‘y 순’도 반드시 내림차순이라고 명시해야 한다(`src/lib/import/runs.ts:218`, `:246`).

또 A6/A9(`phases/44-drawing-set-assembly/step0.md:55`, `:66`)를 `unsure`의 의미와 구분해야 한다. ina의 1200을 확정 기대값으로 계속 두는 것은 현재 ‘직접 전사’ 계약에 대한 **정당한 반증**이다. 반대로 `demotedBlocks`처럼 실행으로만 계수할 값(`tests/fixtures/drawing-set/expected/ina.json:65`)까지 A4/A6의 텍스트 존재 대상으로 해석하면 거짓 반증이다.

수정: 필드별 근거 종류를 분류한다. 원문 라벨/치수는 좌표와 item indices를 가진 글리프열로, 역할/강등은 도면 판정과 parser census로, 조립 결과는 채택한 규칙으로 검증한다. `unsure`는 참고 전사인지 미해결 확정 기대값인지 구분하며, 무조건 모든 수치를 raw token에 요구하거나 전부 면제하지 않는다.

**D3 — major: unsure 절 전체 제외와 미청구 키가 반증 가능성을 없앤다.**

근거: `phases/44-drawing-set-assembly/step4.md:62`는 unsure.path의 절을 빼라고 한다. yokohama·hirosaki·kani는 `stories` 전체가 unsure이고, ina는 `stories.levels` 전체, tsu·ina·hirosaki는 `blockToStory` 전체가 unsure다. 반면 step 8은 `stories.levels[0]` 변조 실패를 요구한다(`phases/44-drawing-set-assembly/step8.md:26`). 어떤 세트를 바꿨는지에 따라 ‘비교를 빼라’와 ‘변조하면 실패하라’가 충돌한다. `unmatchedBlocks` 미청구는 A5와 같다. `phases/44-drawing-set-assembly/step8.md:34`가 요구하는 step 0 시점 SHA-256도 step 0 report 필수 필드에 없다(`phases/44-drawing-set-assembly/step0.md:82`–`phases/44-drawing-set-assembly/step0.md:89`). paths_verified는 해시가 아니다.

수정: phase용 값 경로 청구 대장과 사유 있는 reference-only 대장을 둔다. 기존 선례는 `docs/ADR.md:431`과 `tests/plan-import/key-coverage.test.ts:108`이다. mutation은 null이 아니고 실제 청구된 경로를 명시해서 수행한다. 핵심 조립 결과가 모두 참고 전용이면 기능 완료로 판정하지 않는다. step 0에 모든 동결 대상 파일의 `{path,sha256}` manifest를 요구한다.

**D4 — major: step 8의 정렬/뒤집기 규칙이 정당한 구현까지 배제할 수 있다.**

근거: `phases/44-drawing-set-assembly/step8.md:30`–`phases/44-drawing-set-assembly/step8.md:32`은 `.reverse()`·`sort(`·fixture 이름·부분 매칭 토큰을 나열하고, 허용 예외를 x/y 페이지 순서 정렬로만 한정한다. 그러나 R3의 정상적인 양방향 비교는 기존 코드도 `.reverse()`를 사용한다(`tests/plan-import/corpus2-elevation.test.ts:100`). step 5는 Project.stories 순서로 블록을 처리하게 하므로 그 순서를 위한 정렬도 합법이다(`phases/44-drawing-set-assembly/step5.md:52`). 테스트의 fixture 경로/테스트 이름 자체도 당연히 필요하다.

수정: ‘fixture 이름에 따라 제품 결과를 바꾸지 않는다’, ‘projection이 읽은 순서를 변조하지 않는다’, ‘역방향 비교는 labels와 spans를 함께 반전하여 같은 인접 관계를 보존한다’라는 성질로 쓴다. 코드 토큰의 유무는 검색 단서로만 쓰고 refuted 조건으로 삼지 않는다.

**D5 — major: cleanliness와 회귀 비교 범위가 스텝의 변화량으로 닫혀 있지 않다.**

잘된 점: `phases/44-drawing-set-assembly/step8.md:13`은 phase index, invoke, codex 로그를 청결 검사에서 명시적으로 제외하고 되돌리지 말라고 한다. 이 제외는 유지해야 한다. 그러나 `phases/44-drawing-set-assembly/step1.md:82`는 전체 working tree에 phases 밖 변경이 없어야 한다고 하므로, 이번 검토 시작 시처럼 사전에 있던 ADR/다른 작업 변경도 계측 잔재로 오인한다. step 8의 경로 검사도 전체 base diff를 범위 밖 변경의 증거로 쓴다(`phases/44-drawing-set-assembly/step8.md:38`).

R5에서 axis 등 필드를 추가하면 `phases/44-drawing-set-assembly/step8.md:22`의 ‘regionPt만 제거한 직전 출력과 동일’은 정상 추가 필드 때문에 실패한다. 그 반대로 기존 버그 전체를 수정하라고 해석해서도 안 된다. 또한 `git diff --name-only`는 미추적 계측 파일을 보여 주지 않으므로 ‘스크립트를 남기지 않았다’의 충분한 증거가 아니다.

수정: 시작 시 파일/내용 baseline을 기록하고 **그 스텝이 만든 변화량**만 검사한다. 모든 청결 검사에서 `index.json`, `step*-invoke.json`, `step*-codex.*.log`와 허용 report를 제외한다. 원복은 변조한 파일의 전후 SHA로 확인하고 미추적 파일도 검사한다. 회귀 비교에서는 명시적으로 허용한 추가 필드 집합을 제거한다. 파서 개선을 선행 범위에 채택하면 의도된 출력 변화와 불변 영역을 별도로 정의한다.

**D6 — major: raw 치수 문자열 하나의 교란이 반드시 세트 충돌을 만든다는 보장이 없다.**

근거: `phases/44-drawing-set-assembly/step4.md:63`–`phases/44-drawing-set-assembly/step4.md:65`는 한 면의 치수 하나를 바꾸면 通り芯不一致/階高不一致가 나와야 한다. 그러나 파서는 합계 불일치 시 후보를 거절한다(`src/lib/import/framing-plan/parse.ts:942`), 짧은 연쇄/스케일 불성립도 빈 후보가 된다(`src/lib/import/framing-plan/elevation.ts:205`, `:436`). 한 면에는 동일 치수가 여러 벌 있어 하나만 바꾸면 다른 열이 살아남을 수도 있다. 후보가 사라지거나 같은 결과가 남으면 올바른 reconciler도 기대 충돌을 낼 수 없다.

수정: 파싱된 후보를 받는 순수 reconciliation 핵심의 시그니처를 정하고, 그 입력의 span/height/label 한 값을 교란하는 테스트를 둔다. raw TextPage 교란은 별도 통합 테스트로 두고 ‘어떤 후보가 어떻게 바뀌었는가’를 먼저 단언한다. 테스트의 실패가 다른 파서 조건 때문인지 세트 대조 때문인지 구분한다.

**E. step 1–7 구현자를 막거나 잘못된 반영을 만드는 사항**

**E1 — blocker: step 6의 실제 PDF 입력이 tsu 4면 골든과 다르며, 전체 입력으로는 반영 버튼이 활성화될 수 없다.**

근거: `phases/44-drawing-set-assembly/step6.md:19`는 PDF의 모든 면을 취입하고 `phases/44-drawing-set-assembly/step6.md:34`는 `.cache/dwg-tsu-kanritou.pdf` 자체를 넣는다. 제품 추출기도 모든 페이지를 읽는다(`src/lib/import/pdf-text.ts:39`). 세트 골든은 16·20·21·22 네 면만이다(`tests/fixtures/drawing-set/expected/tsu.json:4`).

같은 원본(SHA-256은 `tests/fixtures/section-import/SOURCES.md:62`)을 로컬에서 직접 읽은 결과 **30면**이며, 골든 밖 **15면**에서 제목 없는 블록이 나왔다: X `['13','3'] / [4119]`, Y `['60','9'] / [200]`, placements 0. 이 면에는 list/elevation 경쟁 출력이 없어 현재 강등 규칙으로 없어지지 않는다. 16·20면의 grid와 달라 step 4는 `通り芯不一致` 및 `grid:null`을 내야 하고, `phases/44-drawing-set-assembly/step6.md:28`대로 버튼은 disabled다. R1–R5도 이 블록을 제거하지 않는다.

전체 PDF의 21·22면에는 표제란 제목 `管理棟軸組図(1)/(2)`도 추가된다. 픽스처는 표제란을 제외하지만 제품은 제외하지 않는다(`scripts/extract-textitems.mjs:161`, `:180`; `src/lib/import/pdf-text.ts:45`). 따라서 titles 수를 frame 数로 바꾸는 R5의 단순 구현은 e2e에서도 다른 수를 낸다.

수정: 사용자에게 세트에 포함할 면을 선택/제외하는 경로를 설계하고 e2e에서 정확히 16·20·21·22를 선택하거나, 전체 30면을 정식 검증 범위로 확장하여 잔여 격자 오탐을 먼저 해결한다. 파일명별 15면 버리기는 금지한다. 전체 PDF의 충돌 노출 테스트와 선택한 면의 성공 테스트를 구분한다. e2e에서 기존 sample members 때문에 최초 階 교체가 거부되는 경로도 처리해야 한다(`src/domain/model/sample-project.ts:248`; `src/lib/import/framing-plan/apply.ts:264`).

**E2 — major: 階重複ブロック을 보여 주기만 하면 뒤 블록이 앞 블록의 부재를 지운다.**

근거: `phases/44-drawing-set-assembly/step4.md:53`은 중복 충돌을 기록하지만 `phases/44-drawing-set-assembly/step6.md:28`의 disabled 조건은 grid/stories null뿐이다. `phases/44-drawing-set-assembly/step5.md:49`–`phases/44-drawing-set-assembly/step5.md:54`는 모든 블록을 차례로 적용한다. 기존 `applyFramingPlan`은 해당 階의 기존 members를 지우고 새 블록으로 교체한다(`src/lib/import/framing-plan/apply.ts:199`–`:207`). 동일 grid이면 refusal도 없다. R2 뒤 ina의 두 1階 블록 또는 수동으로 같은 Story를 고른 블록 둘이 이 경로에 들어간다.

수정: 실행 전에 선택까지 반영한 충돌 해결 단계를 둔다. 하나의 Story에 적용할 블록은 하나만 선택하도록 하거나, 별도 승인된 합성 의미론을 설계해야 한다. 현재 ‘기존 함수 그대로 합성’ 범위에서는 중복을 차단하는 것이 맞다. grid mismatch/중복은 차단, R1의 기초 높이 차이는 정보 등 정책을 명시하고 UI뿐 아니라 순수 적용 함수의 precondition으로 검증한다. 수동 선택으로 새로 생긴 중복도 검사한다.

**E3 — major: 基準/경계/미대응/断面 선택을 실행까지 전달하는 계약이 불완전하다.**

- `phases/44-drawing-set-assembly/step5.md:42`와 `phases/44-drawing-set-assembly/step5.md:48`에 후보 시그니처가 두 형태로 적혀 있다. 최종 non-null stories 계약을 하나로 고정해야 한다. grid 및 해결되지 않은 차단 충돌의 precondition은 없다.
- `phases/44-drawing-set-assembly/step5.md:35`는 perStory의 storyId를 필수 string으로 두면서 `phases/44-drawing-set-assembly/step5.md:50`은 Story가 없는 블록을 그 배열에 남기라고 한다. 없는 ID를 지어내지 말고 unmapped 결과의 union/optional 필드를 정의해야 한다.
- `applyElevation`이 만드는 Story는 선택 구간의 **바닥 레벨**이다. 선택한 top 레벨 자체에는 Story가 생기지 않는다(`src/lib/import/framing-plan/apply.ts:271`). 그런데 step 4는 선택 전 모든 레벨에 블록을 대응시킨다. roof/top에 대응된 블록이나 선택 범위 밖 블록이 자동 대응된 것처럼 보였다가 적용 시 떨어질 수 있다. 同高 aliases의 실제 Story.name은 `labels.join('／')`다(`:275`).
- `phases/44-drawing-set-assembly/step5.md:26`의 blockStories는 어떤 문자열(원문 레벨명, 미래 Story.name, Story.id)인지 타입 주석에서 확정하지 않았다. 수동 선택이 자동 제안을 덮는 우선순위도 명시해야 한다. ADR-035는 수동 선택 우선을 요구한다(`docs/ADR.md:539`).
- `phases/44-drawing-set-assembly/step5.md:28`은 블록별 sectionStoryLabels 입력을 받지만 `phases/44-drawing-set-assembly/step6.md:25`에는 대응 select가 없다. 파싱한 断面リスト도 등록된 Project.sections가 되지는 않는다. `applyFramingPlan`은 기존 sections만 조회하고 정확한 원문 storyLabel로 필터한다(`src/lib/import/framing-plan/apply.ts:140`, `:155`). 표시용 matchedStories 배열만으로 이 인자를 결정할 수 없다.

수정: 基準 후보 선택 → top/bottom 선택 → 미래 Story 목록/ID와 블록 선택 해결 → 차단 충돌 검증 → 적용이라는 순서를 시그니처로 고정한다. 未対応 및 断面の階 UI, 수동 override, 범위 변경 시 stale 선택 처리도 명시한다. section을 실제 등록하는 기능은 이번 범위인지 분명히 하고, 범위 밖이면 기존 등록을 전제로 skips를 보여 준다. 적용 테스트에는 등록된 일치 section과 실제로 적용되는 블록을 넣어 **최소 한 부재가 생김**을 독립적으로 단언한다. 빈 members끼리 `toEqual`하는 합성 동치만으로 완료하지 않는다.

**E4 — minor: 비실행 가능한 셸 표기와 잘못된 테스트 탐색 위치가 남았다.**

실제 실행 명령 대부분은 ASCII이고, ‘브라우저에서 직접 확인’ 같은 사람 전용 AC는 없다. build→dev→e2e 순서와 하네스 실행/kill 금지도 명시되어 있어 이 부분은 적절하다. 다만 다음은 보정해야 한다.

- `phases/44-drawing-set-assembly/step2.md:68`, `phases/44-drawing-set-assembly/step3.md:84`, `phases/44-drawing-set-assembly/step8.md:38`의 ``git diff --name-only <직전 커밋>``은 한글이 든 실행 명령 모양의 placeholder다. 구체 SHA 또는 ASCII 변수로 바꾸고 baseline commit을 report에 기록한다.
- `phases/44-drawing-set-assembly/step6.md:56`의 `base64 -w0`는 이 Windows PowerShell 환경의 PATH에서 찾을 수 없었다. `phases/44-drawing-set-assembly/step6.md:52`의 `rm -rf ... && ...`도 shell을 지정하지 않았다. Bash 사용 전제를 명시하거나 Node/PowerShell로 base64 생성과 별도 프로세스 기동/정리를 적는다. 삭제/종료 대상은 해당 스텝이 소유한 dev 산출물/프로세스로 한정한다.
- `phases/44-drawing-set-assembly/step5.md:14`는 `tests/plan-import/`에서 apply 테스트를 찾으라고 하지만 실제 파일은 `src/lib/import/framing-plan/apply.test.ts`다. 나머지 `tests/plan-import/parse.test.ts`, `src/lib/i18n.ts`, `PlanImport.module.css`는 실제 존재한다. `.cache/dwg-tsu-kanritou.pdf`도 현재 존재한다.

**수정 후 다시 확인할 최소 순서**

1. B1의 영역 반례와 A2의 파서/전사 범위부터 결정한다. 실패가 확정된 강등 규칙의 필드 구현을 먼저 진행하지 않는다.
2. R1–R5의 채택 범위와 최종 타입/충돌/선택 계약을 ADR·스텝·골든에 같이 반영한다. 원문 정보와 실행 후보의 정의를 분리한다.
3. step 0을 기존 현황/계획 산출물/독립 전사에 맞게 고치고, 동결 SHA 및 값 경로 청구를 남긴다.
4. 실제 입력 범위의 e2e, 중복 Story 적용 차단, 수동/断面 선택 및 실제 부재 생성 검증을 추가한다.
5. step 8은 허용된 변화량과 성질을 검증하도록 고친다. 하네스 파일 제외, 원복 SHA 검증, 양방향 축 비교의 합법성은 유지한다.

이 보고서는 지적한 원본 문서·골든·코드·테스트를 수정하지 않았다. 현재 상태에서 구현자가 골든에 맞추려고 파서를 확장하거나 기대값을 제외하면, 계획의 금지사항과 완료 조건 중 하나를 어기게 된다.
