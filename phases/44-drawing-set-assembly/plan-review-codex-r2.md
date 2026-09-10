refuted

| 번호 | 심각도 | 위치(파일:행) | 무엇이 어긋나는가 | 근거·필요한 정정 |
|---|---|---|---|---|
| R2-01 | blocker | `phases/44-drawing-set-assembly/step0.md:63`; `phases/44-drawing-set-assembly/step3.md:47`; `tests/fixtures/drawing-set/expected/yokohama.json:93`; `tests/fixtures/drawing-set/expected/ina.json:44`; `tests/fixtures/drawing-set/expected/kani.json:60` | 충돌이 있는 세 골든 모두 필수 `payload`가 없다. ina·kani는 `blocking`·`evidence`도 없다. | step 0 A3가 즉시 실패한다. ina의 `story`와 사양의 `payload.storyName`, 골든의 fixture/title 참조와 제품의 source/page/index 참조도 대응 계약이 필요하다. 작성자가 골든 스키마·참조 사영·knownGaps 경로를 함께 맞춰야 한다. |
| R2-02 | blocker | `tests/fixtures/drawing-set/expected/ina.json:78`; `phases/44-drawing-set-assembly/step3.md:88` | ina의 간극 등록으로는 필수 3단 단언을 통과할 수 없다. `unmatchedBlocks` 방향은 `missing`이 아니라 `both`다. | 전부 포함하면 제목 없는 p6·p7 블록이 모두 미대응이다. 출력 `[1].fixture = ina-p7`은 잉여 주장이다. 사양은 골든/간극 추가를 구현자에게 금지한다(`phases/44-drawing-set-assembly/step3.md:108`). 작성자의 간극 재검토가 선행돼야 한다. |
| R2-03 | blocker | `phases/44-drawing-set-assembly/step3.md:91`; `tests/fixtures/drawing-set/expected/kani.json:52`; `tests/fixtures/drawing-set/expected/kani.json:85` | 基準 제목으로 파서 후보를 정확히 하나 찾으라는 별도 요구에 `knownGaps` 예외가 없다. kani는 후보 0개다. | `tests/plan-import/elevation.test.ts:88`·`:101`과 재실행 모두 p40/p41 후보 0개다. `storiesReference`의 `missing`을 인정하면서 무조건 후보 존재를 요구할 수 없다. 제목 식별 단언에도 동일한 간극 적용 범위를 명시해야 한다. |
| R2-04 | blocker | `phases/44-drawing-set-assembly/step5.md:33`; `phases/44-drawing-set-assembly/step5.md:38`; `phases/44-drawing-set-assembly/step4.md:54` | tsu 네 면을 고르고 基準·범위만 선택하는 성공 AC는 여전히 성립하지 않는다. 杭伏図가 미대응으로 남는다. | p16의 유일한 블록은 `杭伏図S=1/100`, 제목 階 키 없음, placements 0이다. `resolve`는 모든 포함 블록의 대응을 요구한다. e2e와 컴포넌트 테스트에 그 블록의 명시적 제외 또는 수동 대응을 넣어야 한다. |
| R2-05 | major | `docs/ADR.md:990`; `phases/44-drawing-set-assembly/step3.md:80`; `phases/44-drawing-set-assembly/step0.md:83` | 공통 레벨의 유일성 검사가 비대칭이다. 확정 결정/ADR은 양 계열에서 유일해야 하지만 사양은 基準 쪽만 검사한다. | 상대 계열에 같은 `1FL`이 두 레벨이면 둘 다 하나의 基準 `1FL`에 대응한다. 대응 쌍·누적합이 확정될 수 없다. 양쪽 유일성과 여러 alias가 서로 다른 레벨을 가리키는 경우를 함께 정의·검증해야 한다. |
| R2-06 | major | `docs/ADR.md:989`; `phases/44-drawing-set-assembly/step4.md:50`; `phases/44-drawing-set-assembly/step4.md:67`; `phases/44-drawing-set-assembly/step5.md:25` | 基準 변경 시 선택을 **무효화**한다는 결정이 단순 범위 재검증으로 약해졌다. | yokohama p8/p9는 레벨 수·이름이 같아 이전 index와 수동 이름이 모두 유효하지만 마지막 높이는 2690/2490이다. 현재 테스트는 index가 새 범위를 벗어날 때만 거부한다. 선택이 속한 基準을 식별하고 변경 시 명시적으로 비워야 한다. |
| R2-07 | major | `phases/44-drawing-set-assembly/step3.md:81`; `phases/44-drawing-set-assembly/step4.md:53` | 선택 구간과 수동 override를 반영한 자동 대응·중복 충돌 재계산 절차가 빠졌다. | 전 구간에서 만든 `candidate.blocks[].storyName`을 재사용하고, 초기 `階重複ブロック`을 제거하라는 규칙 없이 마지막에 모든 blocking을 검사한다. 수동으로 중복을 해결해도 이전 충돌이 남는다. 선택 적용 후의 대응과 충돌을 다시 산출해야 한다. |
| R2-08 | major | `phases/44-drawing-set-assembly/step0.md:70`; `tests/fixtures/drawing-set/expected/yokohama.json:64`; `src/lib/import/section-list/parse.ts:143` | A5의 `±sameBand` 동률 정렬은 고친 yokohama-p15 순서를 다시 반증할 수 있다. | 壁 y=120.960, x=1318.320; スラブ y=128.040, x=676.080. 기존 `sameBand`는 28.32pt이므로 x 우선이면 スラブ가 먼저다. 실제 파서/골든은 y 우선의 壁→スラブ다. 표 경계용 sameBand와 제목 정렬 규칙을 구분해야 한다. |
| R2-09 | major | `phases/44-drawing-set-assembly/step0.md:89`; `tests/fixtures/drawing-set/expected/tsu.json:49`; `tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json:71` | A10은 기존 골든과 다른 값에 `unsure`만 허용한다. 확정 결정이 요구한 tsu alias 보충은 `knownGaps`에만 있다. | 기존 `1FL`과 새 `1FL／1SL`은 NFKC 후에도 다르다. 새 `unsure`에는 이 경로가 없다. 원문에서 확인되는 독립 전사 보충과 파서 간극을 이전 골든과의 무조건 동일성으로 반증해서는 안 된다. |
| R2-10 | major | `phases/44-drawing-set-assembly/step1.md:56`; `phases/44-drawing-set-assembly/step2.md:49`; `phases/44-drawing-set-assembly/step3.md:120`; `phases/44-drawing-set-assembly/step7.md:38` | cleanliness의 시작 상태 제외가 개별 AC에 일관되게 적용되지 않는다. status 목록만으로는 내용 원복도 확인할 수 없다. | 현재부터 존재한 `evals/harness/*` 변경과 미추적 `tests/fixtures/drawing-set/`가 전체 diff/미추적 허용집합 검사에서 탈락한다. 시작·종료 모두 ` M file`이면 내용 변경을 못 본다. 단계별 파일 내용 baseline과 미추적 파일 목록의 변화량을 써야 한다. 하네스 파일 제외는 유지한다. |
| R2-11 | major | `phases/44-drawing-set-assembly/step4.md:24`; `phases/44-drawing-set-assembly/step4.md:33`; `src/lib/import/framing-plan/apply.ts:271` | 미래 Story를 이름만으로 식별하면 서로 다른 높이의 동명 Story를 수동으로 구분할 수 없다. | 실제 `applyElevation`에 `[2FL,1FL,1FL]`을 주면 `story-1`·`story-2`의 이름이 모두 `1FL`이다. 사양의 문자열 선택은 어느 쪽인지 표현하지 못한다. 원문 표시 이름은 유지하되 선택/계획은 基準 레벨 index 같은 유일 식별자를 가져야 한다. |
| R2-12 | minor | `docs/ADR.md:1017`; `phases/44-drawing-set-assembly/step2.md:30`; `phases/44-drawing-set-assembly/step3.md:14` | 새 `storyNameKey`가 ADR의 계획 기호 목록에 빠져 있다. | step 2에 명시적으로 추가되므로 구현 의존 순서는 맞다. ADR 목록과 `planned_symbols`에도 step 2 기호로 기록해야 한다. 없는 기존 기호라고 반증할 사유는 아니다. |
| R2-13 | minor | `docs/ADR.md:996`; `phases/44-drawing-set-assembly/step3.md:45`; `phases/44-drawing-set-assembly/step4.md:28` | ADR의 정보 충돌 `階未対応`가 실제 `SET_CONFLICTS`/`Conflict`에는 없다. | 사양은 storyName 부재와 계획 거부 `階未対応ブロック`으로 표현한다. 이것을 정보 충돌로 부를지 별도 미대응 상태로 부를지 결정 문서와 타입을 맞춰야 한다. |
| R2-14 | minor | `docs/ADR.md:999`; `docs/ADR.md:1000`; `phases/44-drawing-set-assembly/step4.md:36`; `phases/44-drawing-set-assembly/step4.md:37` | 확정 문서의 반환 계약과 구체 사양의 반환 envelope/필드명이 다르다. | 확정 문서는 `DrawingSetPlan \| PlanRefusal`, `skips[]/refusals[]`; 사양은 `{plan} \| {refusal,detail}`, `skipped`·단일 `refusal`이다. step 4/5끼리의 호출은 일관되지만 상위 문서가 구체 타입을 그대로 명시해야 한다. |
| R2-15 | minor | `docs/ADR.md:963`; `tests/stress/multi-story.test.ts:174`; `tests/fixtures/drawing-set/expected/ina.json:2` | `drawing-set`·`DrawingSet`·`reconcil`·`levelStoryKey`가 src/tests에서 0건이라는 현황 문장은 사실과 다르다. | 기존 테스트 설명에 `reconciles`, 새 골든 주석에 `levelStoryKey`가 있다. 제품에 조립 함수가 없다는 핵심은 맞다. 문자열 부재 주장을 함수 선언·호출 부재 주장으로 좁히고 주석/테스트 설명을 구분해야 한다. |

1차 항목 종결표다. **closed는 이전 계획 결함이 해소됐다는 뜻이며, 아직 없는 phase 44 구현을 승인했다는 뜻이 아니다.** 총 23개 항목 중 closed 14, still-open 9, regressed 0이다.

| 1차 항목 | 판정 | 2판 근거와 남은 것 |
|---|---|---|
| A1 — R1–R5 미확정·미반영 | still-open | 채택/유보 자체는 `docs/ADR.md:983`·`:986`·`:988`에 확정됐다. 다만 골든 충돌 계약과 기호/반환 계약이 아직 다르다(R2-01·12·13·14). |
| A2 — 사람 전사 전체와 현재 파서 출력의 동일시 | still-open | `docs/ADR.md:1004`와 `phases/44-drawing-set-assembly/step3.md:92`이 간극을 구분한다. 그러나 ina 간극 및 kani 基準 식별 요구 때문에 그대로 구현할 수 없다(R2-02·03). |
| A3 — roles·listKinds·제목 순서/정규화 | still-open | kani roles와 yokohama listKinds는 수정됐다(`tests/fixtures/drawing-set/expected/kani.json:9`; `tests/fixtures/drawing-set/expected/yokohama.json:64`). 검토 중 추가된 대칭 제목 비교도 확인했다. A5 동률 정렬 문제는 남는다(R2-08). |
| A4 — 격자 후보와 블록 격자의 혼동 | closed | `docs/ADR.md:987`; `phases/44-drawing-set-assembly/step3.md:34`·`:74`. 모든 grids는 보존하고 포함 블록의 xGrid/yGrid만 대조한다. |
| A5 — 충돌/notice 스키마·참고 설명 혼합 | still-open | 사양에 구조화된 payload와 Evidence[]는 생겼지만 세 골든은 그 스키마가 아니다(R2-01). 미대응 코드도 정리되지 않았다(R2-13). |
| A6 — census·호출처 서술 | closed | `docs/ADR.md:963`은 runs.ts 출현을 주석으로 정정했고 `:971`은 8/9 차이를 잠정 조사 대상으로 명시한다. 이번 재실행도 elevation 8면이다. |
| B1 — 불가능한 강등 문턱 | closed | `docs/ADR.md:984`; `phases/44-drawing-set-assembly/step1.md:7`·`:36`. 자동 강등을 철회했고 문턱 불성립은 구현 중단 사유가 아닌 측정 결과다. |
| B2 — 리スト 소비 영역 정의 부재 | closed | `phases/44-drawing-set-assembly/step1.md:18`–`:26`이 tableRows, 후보 0개, degenerate, 격자 전체 extent를 정한다. 필수 regionPt 추가도 삭제됐다. 내부 tableRows는 `src/lib/import/section-list/parse.ts:2605`에 실재한다. |
| C-R1 — 基準系列 방식 | still-open | 기본 基準·누적합·정보 충돌은 반영됐다(`docs/ADR.md:989`–`:993`). 양 계열 유일성과 基準 변경 후 선택 무효화는 불완전하다(R2-05·06). |
| C-R2 — 레벨 키 정규화 | closed | `phases/44-drawing-set-assembly/step2.md:24`–`:37`이 기존 숫자/R 키, FL/SL, aliases, 접두/PH/Bn 제외를 정의한다. 기존 helper를 바꾸지 않는 조건도 명시돼 있다. |
| C-R3 — 역방향 축 대조 | closed | 규칙의 타당성은 유지하고 이번 구현에서 축 대조를 유보했다(`docs/ADR.md:986`). 수평 axis가 없는 타입에 의존하지 않는다. |
| C-R4 — 충돌이 있어도 基準 stories 유지 | closed | `docs/ADR.md:991`·`:993`이 정보 충돌과 후보 부재 null을 구분한다. kani는 간극으로 남기고 ina 1200은 확정 높이에서 제거했다(`tests/fixtures/drawing-set/expected/ina.json:31`·`:93`). |
| C-R5 — 후보 수와 通り 수·축 노출 혼동 | closed | `docs/ADR.md:986`; `phases/44-drawing-set-assembly/step3.md:96`. frameCount는 참고 전사이며 후보 수와 비교하지 않고, 軸組図 axis 구현 약속도 철회했다. 참고 전사 자체의 시각 판독 미검증은 아래에 별도로 적었다. |
| D1 — 미래 산출물의 현재 존재 요구 | closed | `phases/44-drawing-set-assembly/step0.md:52`–`:57`이 기존/계획 기호를 분리하며 미래 부재를 반증하지 않는다. R2-12의 목록 누락은 이 원칙을 뒤집는 blocker가 아니다. |
| D2 — 토큰 존재만으로 원문 검증 | still-open | 가로/회전 글리프 결합과 근거 종류 구분은 수정됐다(`phases/44-drawing-set-assembly/step0.md:34`–`:42`). 그러나 A5·A10에 다른 거짓 반증 경로가 남는다(R2-08·09). |
| D3 — 미청구 경로·unsure 변이·해시 누락 | closed | `phases/44-drawing-set-assembly/step3.md:97`은 청구 대장, `phases/44-drawing-set-assembly/step0.md:92`은 동결 manifest, `phases/44-drawing-set-assembly/step7.md:23`은 CLAIMED 경로 변이를 요구한다. 간극 적용 자체의 결함은 R2-02·03으로 분리했다. |
| D4 — sort/reverse 토큰 금지 | closed | `phases/44-drawing-set-assembly/step7.md:27`–`:30`이 결과의 성질로 바뀌었고 토큰은 검색 단서일 뿐이다. |
| D5 — cleanliness·회귀 범위 | still-open | 파서 필드 추가가 없어 36면 출력 불변 비교는 정합하다(`phases/44-drawing-set-assembly/step7.md:17`). 하네스 제외도 유지됐다. 그러나 단계별 diff/미추적·내용 원복 판정은 R2-10과 같이 불완전하다. |
| D6 — raw 치수 교란의 잘못된 기대 | closed | `phases/44-drawing-set-assembly/step3.md:72`·`:101`–`:105`가 파싱된 평가 결과에 대한 교란으로 바뀌었다. |
| E1 — 전체 tsu PDF로 성공 불가 | still-open | 전체 포함 충돌과 면 선택 UI는 추가됐다(`phases/44-drawing-set-assembly/step5.md:37`). 하지만 네 면 선택 뒤 杭伏図 대응이 빠져 성공 AC는 여전히 불가능하다(R2-04). |
| E2 — 중복 블록으로 앞 부재 삭제 | closed | `phases/44-drawing-set-assembly/step4.md:54`·`:66`이 수동 중복도 차단한다. 초기 충돌을 해결한 뒤에도 남겨 두는 별도 문제는 R2-07이다. |
| E3 — 선택·범위·미대응·断面 전달 계약 | still-open | 미래 Story·등록된 sections·최소 1부재·unmapped 변형은 추가됐다(`phases/44-drawing-set-assembly/step4.md:25`·`:43`·`:63`). stale 선택/충돌과 동명 Story 식별은 남는다(R2-06·07·11). |
| E4 — 셸·테스트 경로 지시 | closed | `phases/44-drawing-set-assembly/step4.md:11`이 실제 apply 테스트 경로를 가리킨다. `phases/44-drawing-set-assembly/step5.md:51`은 Git Bash, `:59`는 Node 미러링이다. 검토한 인라인 셸 명령 40개에 CJK 인자 0건이다. |

검토 기준: 2026-09-10, HEAD `4fa9058`. 우선 문서는 아래 두 파일이며, ADR/사양/골든과 다르면 이 결정을 기준으로 판단했다.

- `C:/Users/emper/AppData/Local/Temp/claude/C--Users-emper-mdtproject/f3a3dfdc-bd3b-4134-a15d-d234d681c866/scratchpad/brief-rev2.md` — 특히 6–9행(범위), 13–19행(대응·선택·반영), 24–30행(e2e·골든), 33–41행(스텝).
- `C:/Users/emper/AppData/Local/Temp/claude/C--Users-emper-mdtproject/f3a3dfdc-bd3b-4134-a15d-d234d681c866/scratchpad/r3-decisions.md` — 5–10행(리프/index/하위 트리/direction), 13행(levelA/B), 16행(기호명).

**R2-01 — 스키마 재현.** 다섯 파일은 JSON 문법, 최상위 키, grid/stories 배열 길이, 역할 enum 순서 검사를 통과했다. 폐기한 `elevationCount`·`demotedBlocks`·`sectionStoryLabels`도 없다. 실패는 충돌 객체에 집중된다.

| 세트 | 충돌 객체의 실제 키 | step 0 A3에서 빠진 필수 키 |
|---|---|---|
| yokohama | code, reference, series, levelA, levelB, referenceMm, seriesMm, blocking, evidence | payload |
| hirosaki | 충돌 없음 | 해당 없음 |
| ina | code, story, blocks | blocking, evidence, payload |
| kani | code, series, level | blocking, evidence, payload |
| tsu | 충돌 없음 | 해당 없음 |

이는 문장의 표현 차이가 아니다. `phases/44-drawing-set-assembly/step0.md:63`은 정확히 `{code, blocking, evidence[], payload}`를 요구하며 A3가 실패하면 gate가 뒤 구현을 막는다(`phases/44-drawing-set-assembly/index.json:8`; `phases/44-drawing-set-assembly/step0.md:111`). `knownGaps`는 출력과 전사의 차이를 표시할 뿐 골든 자체의 스키마 면제가 아니다.

제품 `SeriesRef`/`BlockRef`는 `{source,pageNumber,index}`이고(`phases/44-drawing-set-assembly/step3.md:39`), 골든은 `{fixture,titles}` 또는 `{fixture,blockTitle}`다. 이 표현 차이는 명시적인 참조 변환으로 해결할 수 있다. 다만 `phases/44-drawing-set-assembly/step3.md:90`의 “이름 바꾸기와 note 제거만”으로 충분한지, Evidence·candidate 같은 제품 전용 필드를 어떤 사영에서 제외하는지도 선언해야 한다. payload로 통일하면 yokohama의 기존 간극 경로 `conflicts[0].series.titles`(`tests/fixtures/drawing-set/expected/yokohama.json:115`)도 그 스키마에 맞춰 함께 검토해야 한다.

**R2-02·03 — knownGaps 19개 대조.** 기존 파서 세 개를 36개 TextPage에 재실행하고, 다섯 세트의 페이지 순서·포함 블록·기본 基準·실제 `applyElevation`의 Story 이름을 확인했다. 아래는 아직 존재하지 않는 `assembleDrawingSet`을 실행한 결과가 아니다. 기존 출력과 명시된 조립 규칙에서 해당 경로가 어떻게 달라지는지 대조한 것이다. 원문 골든을 파서 출력으로 고치지 않았다.

`null`/부재는 r3-decisions 9행의 특별 규약대로 “주장 없음”으로 취급했다. 무제 블록 title 역시 부재로 유지하며 가짜 빈 문자열을 넣거나 블록을 삭제하지 않았다. conflict의 방향은 현재 골든의 평탄한 참조 표현에서 대조했으므로, R2-01의 스키마 정합을 통과했다는 뜻은 아니다.

| 세트 | knownGaps 경로 | 선언 → 대조 결과 | 근거 |
|---|---|---|---|
| yokohama | stories | both → both | 출력의 무라벨 상단과 1400이 앞에 들어가 index가 밀림. `tests/plan-import/elevation.test.ts:39`·`:46`; 골든 `tests/fixtures/drawing-set/expected/yokohama.json:109`. |
| yokohama | conflicts[0].series.titles | extra → extra | p9 첫 후보 제목은 bX1 다음 bX2A가 추가됨. `tests/plan-import/elevation.test.ts:135`; 골든 `tests/fixtures/drawing-set/expected/yokohama.json:115`. |
| hirosaki | storiesReference.titles | extra → extra | 실제 첫 후보 제목은 `[X1通り軸組図, X2通り+5765軸組図]`. 골든 `tests/fixtures/drawing-set/expected/hirosaki.json:45`; 원문 추가 제목 `tests/fixtures/section-import/textitems/hirosaki-p25.json:11116`. |
| ina | pages[0].blockTitles | missing → missing | 실제 title 부재. 골든 `tests/fixtures/drawing-set/expected/ina.json:54`. title를 부재로 사영한다는 전제다. |
| ina | pages[1].roles | extra → extra | `[断面リスト,伏図]`의 마지막 伏図가 추가됨. 골든 `tests/fixtures/drawing-set/expected/ina.json:60`. |
| ina | stories | both → both | 실제 labels `[[],[GL+756.50],[1FL+755.30],[]]`, heights `[3300,1400,800]`. 골든 `tests/fixtures/drawing-set/expected/ina.json:66`; whitelist `src/lib/import/framing-plan/elevation.ts:197`. |
| ina | blockToStory | missing → missing | 포함 블록 둘 다 무제라 자동 대응 0개. 골든 `tests/fixtures/drawing-set/expected/ina.json:72`. |
| ina | unmatchedBlocks | **missing → both** | 골든 `[0].blockTitle`이 없고 출력 `[1].fixture = ina-p7`이 추가됨. 골든 `tests/fixtures/drawing-set/expected/ina.json:78`. |
| ina | conflicts | missing → missing | 무제 블록 둘은 같은 Story에 대응되지 않아 중복 충돌은 없음. 골든 `tests/fixtures/drawing-set/expected/ina.json:84`. |
| kani | pages[2].roles | missing → missing | p40 후보 0개. `tests/plan-import/elevation.test.ts:88`; 골든 `tests/fixtures/drawing-set/expected/kani.json:67`. |
| kani | pages[3].roles | missing → missing | p41 후보 0개. `tests/plan-import/elevation.test.ts:101`; 골든 `tests/fixtures/drawing-set/expected/kani.json:73`. |
| kani | stories | missing → missing | 유효 基準 없음 → null. 골든 `tests/fixtures/drawing-set/expected/kani.json:79`. |
| kani | storiesReference | missing → missing | 유효 基準 없음 → null. 골든 `tests/fixtures/drawing-set/expected/kani.json:85`. |
| kani | conflicts | missing → missing | 대조할 높이 계열 없음. 골든 `tests/fixtures/drawing-set/expected/kani.json:91`. |
| tsu | pages[0].blockTitles | missing → missing | 杭伏図 하나만 있고 뒤의 基礎・1階 블록 부재. 골든 `tests/fixtures/drawing-set/expected/tsu.json:67`. |
| tsu | pages[1].blockTitles | missing → missing | 2階伏図 하나만 있고 뒤의 屋根 블록 부재. 골든 `tests/fixtures/drawing-set/expected/tsu.json:73`. |
| tsu | stories.levels[3] | both → both | 동일 리프의 `1FL／1SL` 대 `1FL`. 골든 `tests/fixtures/drawing-set/expected/tsu.json:79`; whitelist `src/lib/import/framing-plan/elevation.ts:185`. |
| tsu | blockToStory | both → both | 첫 항목이 빠져 2階 항목이 index 0으로 이동. 골든 `tests/fixtures/drawing-set/expected/tsu.json:85`. |
| tsu | unmatchedBlocks | missing → missing | 앞의 杭伏図는 같고 뒤의 屋根만 부재. 골든 `tests/fixtures/drawing-set/expected/tsu.json:91`. |

위 조건에서 간극이 이미 사라진 **stale 항목은 없었다**. 그러나 방향이 하나 틀렸다. ina를 전부 포함할 때 미대응 블록을 사영하면 최소한 다음과 같다.

```json
[
  { "fixture": "ina-p6" },
  { "fixture": "ina-p7" }
]
```

골든은 p6의 R階 제목을 가진 항목 하나뿐이다(`tests/fixtures/drawing-set/expected/ina.json:39`). r3-decisions 5–9행의 index/리프 규약에서는 p7의 fixture 리프가 명백한 잉여다. `missing`은 단언 ②만 제외하므로 단언 ①이 실패한다. p7을 사영에서 버리면 포함 블록 전체 보존 규칙(`phases/44-drawing-set-assembly/step3.md:61`)을 어긴다.

검토 중 외부에서 `docs/ADR.md`와 step 0·3이 추가 수정됐다. 그 변경분도 다시 읽었다. 최초 사본에서는 ina 基準 제목 `['軸組図']`와 골든 `['軸組図 1/100']`을 동등하게 볼 수 없었지만, 최신 `phases/44-drawing-set-assembly/step0.md:65`와 `phases/44-drawing-set-assembly/step3.md:90`은 양쪽의 끝 축척 토큰을 제거하는 대칭 비교를 명시한다. **이 제목 차이는 해소된 것으로 보고 반증 목록에서 뺐다.** ADR의 assemble 시그니처에 optional reference를 명시한 변경도 확인했다(`docs/ADR.md:985`·`:998`). 아래 R2-03의 후보 0개 문제는 이 변경으로 해소되지 않는다.

kani의 null은 상위 결정이 허용한 정상적인 한계다. 따라서 후보 0개라는 이유 자체는 반증이 아니다. **후보가 없음을 간극으로 허용한 사양과, 같은 골든 제목에 대응하는 후보 하나를 반드시 찾으라는 사양이 동시에 있는 것**이 R2-03이다. hirosaki의 추가 제목은 “골든의 제목들을 포함하는 후보”로 식별하면 하나를 찾을 수 있다. 이때 제목 배열 전체의 등가 비교와 후보 식별을 혼동하지 않아야 한다.

**R2-04 — 실제 PDF와 성공 경로.** `.cache/dwg-tsu-kanritou.pdf`를 pdf.js로 전부 다시 읽고, 제품 `pdfDocumentOptions`와 `toTextItems`를 써 세로 회전을 처리했다. PDF 전체는 30면이었다. 제품의 전체 페이지 순회 근거는 `src/lib/import/pdf-text.ts:39`, 원본 SHA 근거는 `tests/fixtures/plan-import/expected/tsu-kanritou-p16-grid.json:5`다.

| 면 | 실제 블록/계열 | 계획상 결과 |
|---|---|---|
| 15 | 무제 블록, X `[13,3]/[4119]`, Y `[60,9]/[200]` | 전체 포함 때 通り芯不一致. 2판의 첫 e2e 단계는 타당하다. |
| 16 | `杭伏図S=1/100`, placements 0, 제목 階 키 없음 | 이 면을 포함하면 별도의 블록 제외/수동 선택이 필요하다. |
| 20 | `2階伏図S=1/100`, placements 55, 제목 키 `'2'` | 미래 Story `2FL`로 자동 대응 가능하다. |
| 21·22 | 각 높이 후보 2개, labels/높이는 네 후보 모두 같음 | 基準/범위는 선택 가능하다. 전체 PDF는 아래 후보에 표제란 제목 `管理棟軸組図(1)/(2)`도 붙인다. |

`storyLabelFromTitle`은 제목에 인식 가능한 토큰이 없으면 undefined를 반환한다(`src/lib/import/story-label.ts:54`; 杭伏図 반례는 `src/lib/import/story-label.test.ts:34`). top/bottom을 바꿔도 杭伏図에 키가 생기지 않는다. 따라서 `phases/44-drawing-set-assembly/step4.md:54`의 `階未対応ブロック`에서 멈추며, `phases/44-drawing-set-assembly/step5.md:29`에 따라 버튼은 비활성이다. discardMembers 선택은 최초 반영 거부 뒤에만 나타나므로(`phases/44-drawing-set-assembly/step5.md:30`) 이 막힘을 해소하지 못한다. 이 결론은 브라우저를 실행해서 관측한 것이 아니라 **실제 입력 출력과 필수 전제조건으로 반증한 것**이다.

**R2-05·06·07·11 — 대응과 선택의 반례.** r3-decisions 13행의 levelA/B 규칙은 사양과 ADR에 반영됐다(`docs/ADR.md:991`; `phases/44-drawing-set-assembly/step3.md:80`). yokohama의 `levelA = 中央棟1FL／基準GL`도 그 규칙에 맞는다(`tests/fixtures/drawing-set/expected/yokohama.json:96`). 이 값 자체를 계열 쪽 `1FL`이나 `基準GL`로 바꾸라고 요구할 근거는 없다.

반면 유일성에는 반례가 있다. 基準이 `[2FL,1FL,GL]`, 상대가 `[2FL,1FL,1FL,GL]`이면 상대의 두 1FL은 각각 基準 쪽의 정확히 하나인 1FL을 찾는다. step 3 문장대로면 두 대응을 모두 채택한다. 확정 brief-rev2 13행 및 `docs/ADR.md:990`의 양 계열 유일성 조건으로는 그 라벨을 비교에 쓰면 안 된다. 현재 교란 테스트는 **基準 쪽** 라벨 중복만 검사한다(`phases/44-drawing-set-assembly/step3.md:102`). 이는 코퍼스에서 발생했다고 주장하는 사례가 아니라, 문서들이 서로 다른 결과를 지시하는 합법적인 입력 타입의 반례다.

基準 변경은 이번 코퍼스로도 확인된다. yokohama p8 첫 후보와 p9 첫 후보는 동일한 5개 레벨·alias 이름을 내지만 마지막 높이가 2690/2490이다(`tests/plan-import/elevation.test.ts:39`·`:119`·`:127`). 범위가 같은지 검사하는 것만으로는 이전 선택이 어느 基準에서 승인됐는지 알 수 없다. `phases/44-drawing-set-assembly/step4.md:67`의 범위 밖 index 테스트만으로 “변경 시 선택 무효화”를 고정할 수 없다.

중복 해소의 반례는 다음 순서다. 전 구간 자동 대응에서 두 블록이 모두 `1FL`에 붙어 `candidate.conflicts`에 blocking 중복이 생긴다. 사용자가 두 번째 블록을 `2FL`로 바꾸면 최종 대응에는 중복이 없다. 그런데 `phases/44-drawing-set-assembly/step4.md:54`의 ⑦을 통과해도 ⑧은 초기 blocking을 계속 거부할 수 있다. 새 대응을 기준으로 기존 중복을 교체한다는 규칙이 필요하다. 마찬가지로 전 구간에서 같은 키의 Story가 여럿이라 자동 대응이 없었더라도 선택 구간에 하나만 남으면 유일해진다. `candidate.blocks[].storyName`의 단순 재사용으로는 이 경우를 복구하지 못한다.

동명 Story는 실제 기존 함수로 재현했다. `ElevationCandidate.levels`를 `[2FL,1FL,1FL]`, 높이를 `[3000,3000]`으로 두고 top=0/bottom=2로 `applyElevation`을 호출한 결과다. 수치는 반례용 입력이며 규준값이 아니다.

```json
[
  { "id": "story-1", "name": "1FL", "height": 3000 },
  { "id": "story-2", "name": "1FL", "height": 3000 }
]
```

기존 `Story`에는 ID가 따로 있고(`src/domain/model/project.ts:94`), `applyElevation`도 index로 ID를 만든다(`src/lib/import/framing-plan/apply.ts:278`). 미래 이름만 가진 `DrawingSetChoices.blockStories`/`DrawingSetPlan.perStory`는 이 둘 중 하나를 지목할 수 없다. 자동 대응은 다수 일치를 거부하지만 수동 이름 선택의 다수 일치는 `phases/44-drawing-set-assembly/step4.md:54`에서 검사하지 않는다. 이름을 새로 지어 해결하는 방법은 원문 이름 유지 결정에 어긋난다.

**R2-08·09 — 거짓 반증과 실제 반증의 구분.** 가로 글리프 결합, 회전 −90의 y 내림차순, 원문값/계산 결과의 근거 구분은 1판보다 명확하다. 한글·일본어를 셸에 직접 넣으라는 요구나 “브라우저에서 직접 확인”이라는 사람 전용 AC도 발견하지 않았다. `phases/44-drawing-set-assembly/step0.md:81`의 “손으로 적용”은 정해진 문법을 검증자가 독립 대조하라는 뜻으로 읽을 수 있으며 사람 UI를 요구하는 blocker가 아니다.

남은 A5 반례는 원시 글리프를 같은 y ±1pt, x 오름차순으로 재구성해서 확인했다. 壁 제목은 `tests/fixtures/section-import/textitems/yokohama-p15.json:10211`(item 1455), スラブ 제목은 `:10442`(item 1488)에서 시작한다. 두 제목의 y 차이는 약 7.080pt이고 글자 높이는 14.16pt다. `src/lib/import/section-list/parse.ts:2751`의 sameBand와 `src/lib/import/runs.ts:54`의 배수 2를 사용하면 28.32pt다. 이 값은 옆 표의 경계를 찾는 허용폭이지 `titleAnchors`의 정렬 동률 허용폭이 아니다. 제목 정렬은 실제로 `row.y` 다음 x다(`src/lib/import/section-list/parse.ts:143`). step 0에서 sameBand의 별도 정의 없이 동률로 쓰면 고친 원문 순서까지 틀렸다고 판정할 수 있다.

A10의 tsu 반례는 더 직접적이다. 기존 p21 골든의 위 블록은 `1FL`만 적었고(`tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json:71`), 2판은 `1FL／1SL`을 적었다(`tests/fixtures/drawing-set/expected/tsu.json:49`). 원시 글리프는 각각 `tests/fixtures/section-import/textitems/tsu-p21.json:242`·`:249`·`:256`과 `:493`·`:500`·`:507`에 있다. y는 약 274.680/275.040이다. 이 차이는 `knownGaps`의 `both`로 등록돼 있지만(`tests/fixtures/drawing-set/expected/tsu.json:79`), unsure는 두 blockTitles 경로뿐이다(`:97`). 확정 결정이 인정한 전사를 기존 골든과 다르다는 이유로 다시 거부하게 해서는 안 된다.

**R2-10 — 범위와 동결.** `phases/44-drawing-set-assembly/step0.md:92`의 manifest는 새 세트 골든, 기존 plan-import 골든, section-import JSON, ADR을 포함한다. step 7의 ADR 보충 이전 바이트 보존 예외(`phases/44-drawing-set-assembly/step7.md:33`)도 step 6의 보충 전용 범위와 맞는다. region 필드 자체를 추가하지 않으므로 step 7의 36면 파서 출력 완전 불변은 이번 범위와 일치한다. 이 둘은 반증 사항이 아니다.

문제는 전체 git diff와 단계별 변화량을 섞는 것이다. 이번 검토 시작 시부터 `docs/ADR.md`, `evals/harness/README.md`, `evals/harness/run.test.ts`, `evals/harness/run.ts`, `phases/index.json`이 수정 상태였고 phase 디렉터리와 새 세트 골든은 미추적이었다. `phases/44-drawing-set-assembly/step7.md:13`은 사전 변경 제외를 말하지만 `:38`–`:40`은 전체 base diff와 모든 미추적 경로가 허용 집합 안이고 tests/fixtures가 없어야 한다고 한다. 어느 기준의 어떤 파일을 빼는지 AC에도 적용해야 한다. step 2·3의 허용집합 검사 역시 같은 사전 변경을 고려하지 않는다.

`git status --porcelain`의 목록 차이만 보는 step 1 방식은 시작부터 수정된 파일에 남은 계측 코드를 발견하지 못한다. 기본 status는 미추적 디렉터리를 한 줄로 묶을 수도 있다. 원복 증거는 변조한 파일의 내용 hash이고, 잔여 파일 증거는 펼친 미추적 파일 목록이다. `index.json`·`step*-invoke.json`·`step*-codex.*.log` 제외와 이를 비우거나 되돌리지 말라는 `phases/44-drawing-set-assembly/step7.md:11`–`:13`은 정확하므로 유지해야 한다.

**실현 가능성과 CRITICAL 대조.** 기존 의존 함수/타입의 실재를 확인했다: 세 파서와 `TextPage`, `ParsedSectionList`, `ParsedFramingPlan`, `ParsedFrameElevations`, `PlanGridIssue`, `ElevationIssue`, `PlanBlock`, `PlanGridCandidate`, `ElevationCandidate`; 기존 apply 함수의 options/results/refusal 타입; `storyKey`·`storyLabelFromTitle`; `Project`·`Story`·`extractTextPages`. 근거는 `src/lib/import/section-list/types.ts:9`·`:124`, `src/lib/import/framing-plan/types.ts:67`·`:78`·`:91`·`:106`, `src/lib/import/framing-plan/apply.ts:29`·`:45`·`:215`·`:228`, `src/lib/import/story-label.ts:16`·`:39`, `src/lib/import/pdf-text.ts:20`이다.

step 2가 `levelStoryKey`·`storyNameKey`를 추가한 뒤 step 3이 소비하고, step 3의 평가/조립 타입과 함수 뒤에 step 4의 계획/반영, step 5 UI가 오는 순서는 성립한다. index는 0–7의 8스텝이고 step 0에 verify+gate, step 7에 verify가 있으며 step8.md는 없다. 계획 기호의 현재 부재는 정상이다. 이 검토에서도 `src/lib/import/drawing-set/`가 없음을 구현 결함으로 세지 않았다.

`CLAUDE.md:14`·`:17`·`:18`의 규준 상수, domain 순수성, 서버 전송 금지와 충돌하는 새 요구는 발견하지 않았다. 높이·스팬은 도면 입력이고 규준 상세 수치가 아니다. 새 조립 모듈의 순수 TS 범위(`phases/44-drawing-set-assembly/step3.md:21`)와 브라우저 내부 추출(`phases/44-drawing-set-assembly/step5.md:22`·`:47`)도 맞는다. 단면을 자동 등록하지 않는 step 4의 제한(`:75`) 역시 확정 결정과 일치한다.

원문 독립 전사 원칙은 `docs/ADR.md:71`·`:115`와 `phases/44-drawing-set-assembly/step0.md:98`·`:100`, `phases/44-drawing-set-assembly/step3.md:108`·`:110`에 유지돼 있다. 이번 결함을 골든 값 복사나 간극 자동 추가로 고치라는 요구는 없다. step 0/7은 대상 수정이 아닌 반증을 지시한다(`phases/44-drawing-set-assembly/step0.md:3`; `phases/44-drawing-set-assembly/step7.md:3`·`:47`). step 7의 일시적 변이는 원복 hash까지 요구하는 검증 절차이며, 구현을 고쳐 승인하라는 지시로 보지 않았다.

실행 가능한 명령 형태와 CJK 인자를 검사한 인라인 명령은 40개였고 CJK 포함 0개였다. 기존 apply 테스트 경로도 수정됐다. build→dev→e2e 순서 및 소유 PID만 종료하라는 지시는 적절하다(`phases/44-drawing-set-assembly/step5.md:51`–`:61`). 이 평가는 명령/입력 계약 검토이며 실제 build/e2e 성공 인증은 아니다.

R2-15는 제품 부재와 토큰 부재의 차이다. `rg -n 'drawing-set|DrawingSet|reconcil|levelStoryKey' src tests`는 기존 `tests/stress/multi-story.test.ts:174`의 테스트 설명과 새 다섯 골든의 `$comment`를 찾는다. 실제 조립 함수/새 helper 구현이 없다는 결론은 유지되지만 `docs/ADR.md:963`의 문자 그대로의 0건 주장은 반증된다. step 0 A1에서 이것을 제품 조립 구현이 이미 있다는 증거로 확대하면 거짓 반증이 된다.

검증 실행 기록: 36면 census는 list 13면, block 16면, elevation 8면, 복합 4면(ina-p6·ina-p7·kani-p38·karatsu-jikugumi2-p1)이었다. 파일 단위 기존 Vitest **4개 파일·77건이 통과**했다.

```text
node node_modules/vitest/vitest.mjs run tests/plan-import/elevation.test.ts tests/plan-import/corpus2.test.ts src/lib/import/story-label.test.ts src/lib/import/framing-plan/apply.test.ts --no-cache --maxWorkers=1 --no-file-parallelism --reporter=dot
```

Node 진단은 표준입력으로 실행했고 TSX 캐시는 비활성화했다. 새 모듈/테스트/측정 스크립트를 디스크에 만들지 않았다. 출력은 도구 결과로만 읽었다. 첫 리뷰 파일, ADR, 사양, 골든, phase status를 수정하지 않았다.

**미검증.** phase 44 구현은 아직 없으므로 새 helper/조립/계획/UI의 실행 결과, 실제 변이 검사, 신규 테스트의 실패 감지 능력은 검증하지 않았다. 사용자 금지에 따라 build·dev·브라우저 e2e·하네스도 실행하지 않았다. 위 e2e 반증은 입력을 직접 파싱한 뒤 사양의 전제조건을 적용한 것이다. 전 PDF 도형을 렌더해 다섯 골든의 모든 치수와 frameCount를 새로 시각 판독하지는 않았다. 특히 hirosaki의 `X2通り+5765軸組図`를 별도 frame으로 세지 않는 2판 설명(`tests/fixtures/drawing-set/expected/hirosaki.json:47`)의 도형 해석은 미검증이다. 텍스트와 현재 파서의 추가 제목 존재는 확인했지만, 이것만으로 frameCount 3 또는 4를 새로 확정하지 않았다. step 1의 bbox/제목 포함 겹침 36면 재계측도 이번에는 수행하지 않았다. 자동 강등 철회가 그 미계측 결과에 의존하지 않는다는 점을 대조했다.

이 보고서는 **blocker 4·major 7·minor 4**를 기록한다. 수정 제안은 작성자에게 돌려줄 사항이며, 검증자가 대상 파일을 고치지는 않았다. 검토 중 외부에서 바뀐 ADR·step 0·3의 변경분을 반영했으며, 이 검증자가 쓴 파일은 이 보고서 하나다.
