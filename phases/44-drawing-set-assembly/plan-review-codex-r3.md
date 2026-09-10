refuted

Round 3 독립 검증 결과: **blocker 0 · major 1 · minor 3**. R2 항목은 **closed 12 · still-open 3 · regressed 0**이다. 골든의 필수 스키마 오류와 구현 테스트의 tsu 성공 경로는 고쳐졌다. 그러나 cleanliness의 내용 비교가 여전히 불완전하고, 거부 순서와 문서의 참조 경로에 잔여 결함이 있다. closed는 해당 계획 결함의 종결이며, 아직 없는 phase 44 구현의 승인이 아니다.

검증 기준은 `C:/Users/emper/AppData/Local/Temp/claude/C--Users-emper-mdtproject/f3a3dfdc-bd3b-4134-a15d-d234d681c866/scratchpad/r3-verify-codex.md:10`과 같은 scratchpad의 `r5-decisions.md:2`에 따른 r5 > r4 > r3 > brief-rev2 우선순위다. 대상 파일을 수정하지 않고 읽기, 메모리 안의 대조, 파일 단위 Vitest로 확인했다.

| 번호 | 심각도 | 위치(파일:행) | 어긋남 | 근거·필요한 정정 |
|---|---|---|---|---|
| R3-01 | major | `phases/44-drawing-set-assembly/step1.md:56`; `phases/44-drawing-set-assembly/step2.md:49`; `phases/44-drawing-set-assembly/step3.md:124`; `phases/44-drawing-set-assembly/step7.md:13`; `phases/44-drawing-set-assembly/step7.md:17` | **R2-10의 내용 baseline 문제는 남았다.** 단계별 검사는 새 경로·상태가 달라진 경로만 보고, 최종 검사는 step 1 시작 때 dirty였던 경로를 통째로 뺀다. 그 파일을 phase 중 다시 바꾼 경우를 구분하지 못한다. 반대로 파서 불변 검사는 시작 작업 파일이 아니라 HEAD의 `$BASE`와 비교한다. | 시작과 종료가 모두 ` M src/domain/model/project.ts`이면 내용이 달라도 단계별 delta가 비고, 최종 허용집합 검사에서도 그 경로가 빠진다. 임시 변이의 전후 sha256은 이 누락을 대신하지 못한다. 시작부터 파서에 미커밋 변경이 있었다면 이를 그대로 보존해도 `$BASE`와 출력이 달라 거짓 반증이 가능하다. **정정:** 검사 대상의 시작 존재 여부·내용 hash를 보관하고 실제 내용 변화에 허용집합을 적용한다. step 7의 파서 비교도 step 1 시작 작업 상태의 직렬화/내용 snapshot을 기준으로 한다. 하네스 제외와 임시 변이 원복 hash는 유지한다. |
| R3-02 | minor | `phases/44-drawing-set-assembly/step4.md:21`; `phases/44-drawing-set-assembly/step4.md:29`; `phases/44-drawing-set-assembly/step4.md:51`; `phases/44-drawing-set-assembly/step4.md:53`; `docs/ADR.md:993` | 필수 reference를 **가장 먼저** 비교하면서 `階未確定` 분기가 도달 불가능해졌다. `stories: null`이면 `candidate.stories?.reference`는 undefined이고, 유효한 `choices.reference: SeriesRef`와 같을 수 없다. | 실제 kani는 후보가 없어 stories가 null인 정상 실패 사례다(`tests/fixtures/drawing-set/expected/kani.json:86`; `tests/plan-import/elevation.test.ts:88`). 사양대로면 이 경우도 항상 `基準不一致`이며, 뒤의 `stories 없음 → 階未確定` 계약을 충족할 수 없다. **정정:** grid/stories 존재를 검사한 뒤 존재하는 基準의 동일성을 검사하고, stories가 null인 경우의 거부 코드를 테스트로 고정한다. 필수 reference와 p8→p9 변경 거부는 유지한다. |
| R3-03 | minor | `phases/44-drawing-set-assembly/step0.md:66`; `phases/44-drawing-set-assembly/step3.md:94`; `docs/ADR.md:1006` | payload 이동 뒤에도 제목 대조 경로가 `conflicts[].{reference,series}.titles`로 남았고, ADR의 리프 경로 예시도 `conflicts[0].levelA`다. 새 스키마에서는 모두 존재하지 않는 위치다. | 실제 위치는 `tests/fixtures/drawing-set/expected/yokohama.json:100`의 `conflicts[0].payload.reference.titles`와 같은 파일 `:102`의 `payload.levelA`다. 제목 검사/정규화를 경로별로 구현하면 충돌의 제목이 검사 대상에서 빠질 수 있다. **정정:** A4·사영 비교 규약·ADR 예시의 경로를 payload 아래로 일괄 맞춘다. 현재 yokohama 제목은 양쪽 모두 축척을 포함하므로, 이것을 현재 다섯 골든의 실행 실패라고 주장하지는 않는다. |
| R3-04 | minor | `docs/ADR.md:1009`; `phases/44-drawing-set-assembly/step4.md:65`; `phases/44-drawing-set-assembly/step5.md:39` | tsu 성공 경로의 **ADR 동기화가 남았다.** ADR은 16·20·21·22면만 포함하면 반영이 성공한다고 하지만, 수정된 step 4/5는 p16의 杭伏図 블록도 제외해야 한다고 명시한다. | `src/lib/import/story-label.test.ts:34`는 杭伏図의 階 키 부재를 고정하고, `phases/44-drawing-set-assembly/step4.md:57`은 포함 블록의 미대응을 거부한다. 따라서 면 선택만으로는 충분하지 않다. **정정:** ADR 결정 13의 성공 조건에도 p16 면 유지＋杭伏図 블록 제외를 넣는다. 구체 구현 사양의 성공 경로는 이미 수정돼 있어 구현 blocker로 세지 않는다. |

R3-01은 실제 작업 파일을 바꿔 재현하지 않았다. 메모리에서 기존 파일 `src/domain/model/project.ts`의 바이트와 끝에 개행 하나를 더한 바이트를 비교했다. hash는 각각 `9087c324f2751b0b928baa6af2b43eedb4f4eb6a76a3bdbfc30a1893bdf57b31`, `3a9b7d7bb13579df3d13276c1d4aed790656d7d5aecba80a1d599bf3af796f9f`로 달랐지만, 양쪽 status를 ` M`로 둔 사양의 delta 계산 결과는 `[]`, 시작 dirty 경로를 뺀 phase 경로 목록도 `[]`였다. 이는 검사 절차의 반례이며, 해당 파일이 현재 dirty이거나 누군가 실제로 수정했다는 주장이 아니다. git 명령은 실행하지 않았다.

**R2 종결표**

| R2 항목 | 판정 | 현재 파일:행 근거 |
|---|---|---|
| R2-01 — 충돌 스키마·참조 사영 | still-open | 필수 객체 구조와 개명은 해결됐다: `phases/44-drawing-set-assembly/step0.md:63`, `phases/44-drawing-set-assembly/step3.md:91`, `tests/fixtures/drawing-set/expected/ina.json:44`. 다섯 파일 모두 A3 대조를 통과했다. 다만 제목 검사 경로까지 payload로 옮기는 작업은 남아 있다(R3-03, minor로 축소). |
| R2-02 — ina unmatchedBlocks 방향 | closed | `tests/fixtures/drawing-set/expected/ina.json:82`의 `both`와 p7 잉여 설명이 실제 두 무제 블록 출력에 맞는다. 아래 리프 대조 결과 참조. |
| R2-03 — storiesReference 해석 예외 | closed | `phases/44-drawing-set-assembly/step3.md:95`가 null/전체 경로 missing 예외와 정규화 후 제목 포함 관계를 명시한다. kani는 해석을 건너뛰고 후보 0개, 나머지 네 세트는 정확히 하나씩 기본 후보와 일치했다. |
| R2-04 — tsu 성공 경로 | still-open | `phases/44-drawing-set-assembly/step4.md:65`, `phases/44-drawing-set-assembly/step5.md:36`, `phases/44-drawing-set-assembly/step5.md:39`에 블록 제외가 들어갔다. ADR의 조건만 남아 있다(R3-04, minor로 축소). |
| R2-05 — 양 계열 유일성 | closed | `docs/ADR.md:990`, `phases/44-drawing-set-assembly/step0.md:84`, `phases/44-drawing-set-assembly/step3.md:80`이 양쪽 유일성 및 서로 다른 基準 레벨로 향하는 alias의 거부를 일치시킨다. 상대 계열 중복과 alias 충돌 테스트도 `phases/44-drawing-set-assembly/step3.md:106`에 있다. |
| R2-06 — 基準 변경 무효화 | closed | `docs/ADR.md:989`, `phases/44-drawing-set-assembly/step4.md:21`, `phases/44-drawing-set-assembly/step4.md:73`, `phases/44-drawing-set-assembly/step5.md:25`에 필수 identity·같은 레벨 구성의 p8→p9 거부·의존 선택 초기화가 명시됐다. 별도로 새 거부 순서의 결함을 R3-02로 기록했다. |
| R2-07 — 선택 후 대응·중복 재계산 | closed | `docs/ADR.md:1002`와 `phases/44-drawing-set-assembly/step4.md:54`가 선택 구간에서 자동 대응 재계산 → 수동 override → 최종 중복 판정을 정한다. 초기 중복 해소와 구간 축소 후 유일성 테스트는 같은 파일 `:74`에 있다. |
| R2-08 — A5 정렬 | closed | `phases/44-drawing-set-assembly/step0.md:71`이 실제 앵커 정렬 `row.y` 다음 `x`와 일치한다(`src/lib/import/section-list/parse.ts:143`). sameBand를 동률 허용폭으로 쓰지 않는다고 명시했다. |
| R2-09 — A10 alias 보충 | closed | `phases/44-drawing-set-assembly/step0.md:90`이 knownGaps와 기존 라벨의 alias 부분집합을 허용한다. 기존 `1FL`(`tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json:71`)과 새 `1FL／1SL`(`tests/fixtures/drawing-set/expected/tsu.json:49`)을 거짓 반증하지 않는다. 새 골든 `:81`도 1FL／1SL을 현재 출력이 아닌 원문 전사로 구분한다. |
| R2-10 — cleanliness | still-open | `phases/44-drawing-set-assembly/step1.md:56`, `phases/44-drawing-set-assembly/step2.md:49`, `phases/44-drawing-set-assembly/step3.md:124`, `phases/44-drawing-set-assembly/step7.md:13`. 시작 변경과 하네스 파일 제외, 임시 변이의 hash는 명시됐으나 내용 변화의 누락과 기준 상태 불일치가 남는다(R3-01). |
| R2-11 — 동명 Story 식별 | closed | `docs/ADR.md:995`, `phases/44-drawing-set-assembly/step3.md:54`, `phases/44-drawing-set-assembly/step4.md:25`, `phases/44-drawing-set-assembly/step4.md:33`, `phases/44-drawing-set-assembly/step5.md:27`이 바닥 레벨 index를 일관되게 사용한다. 같은 이름의 두 Story를 구분하는 테스트는 `phases/44-drawing-set-assembly/step4.md:75`에 있다. |
| R2-12 — storyNameKey 계획 기호 | closed | `docs/ADR.md:1017`이 두 helper를 step 2 기호로 기록하며, 추가 시그니처는 `phases/44-drawing-set-assembly/step2.md:30`에 있다. step 3의 사용보다 앞선다. |
| R2-13 — 階未対応 분류 | closed | `docs/ADR.md:996`, `phases/44-drawing-set-assembly/step3.md:45`, `phases/44-drawing-set-assembly/step3.md:83`이 SET_CONFLICTS 네 개와 미대응 상태를 구분한다. 계획 거부는 `phases/44-drawing-set-assembly/step4.md:57`의 階未対応ブロック이다. |
| R2-14 — 반환 계약 | closed | `docs/ADR.md:999`와 `docs/ADR.md:1000`이 `phases/44-drawing-set-assembly/step4.md:19`의 Choices, `:29`의 PLAN_REFUSALS 여섯 개, `:31`의 Plan, `:37`의 반환 envelope, `:38`의 ApplyResult 두 perStory 변형과 맞는다. `skipped`, 단일 `refusal`, `unmapped: true`, levelIndex도 일치한다. |
| R2-15 — 현황의 토큰 0건 주장 | closed | `docs/ADR.md:963`과 `phases/44-drawing-set-assembly/step0.md:46`이 제품 디렉터리·함수 선언/호출의 부재로 범위를 좁히고 주석·픽스처를 구분한다. 현재 drawing-set 디렉터리는 없고, 해당 새 함수 이름은 src의 TS/TSX 검색에서도 0건이다. 이를 기존 테스트 설명의 단어로 반증할 수 없다. |

**재현 결과**

Node에서 현재 JSON 다섯 파일을 직접 읽어 step 0 A3를 대조했다. 최상위/페이지 키, roles의 enum 순서, grid/stories 길이 관계, 코드별 payload 키, blocking 값, evidence의 source/page 실재, fixture 참조, storyName 개명, 금지된 구 필드의 부재, knownGaps 경로 문법·중복·direction을 확인했다. missing/both 경로는 골든 안에서 해석됐다. 결과는 다음과 같다. 이는 A3 스키마 검증이며 step 0의 모든 원문 대조 AC를 실행했다는 뜻은 아니다.

| 세트 | 페이지 수 | 충돌 수 | knownGaps 수 | A3 오류 | storiesReference 해석 |
|---|---:|---:|---:|---:|---|
| yokohama | 7 | 1 | 2 | 0 | p8 index 0, 후보 4개 중 제목 포함 관계가 성립하는 후보 1개 |
| hirosaki | 2 | 0 | 1 | 0 | p25 index 0, 후보 3개 중 1개. 추가 제목을 허용하면서 기본 후보와 일치 |
| ina | 2 | 1 | 6 | 0 | p6 index 0, 후보 1개. 골든 축척 접미를 제거한 뒤 일치 |
| kani | 4 | 1 | 5 | 0 | 전체 storiesReference 경로의 missing에 따라 생략. 적격 후보 0개 |
| tsu | 4 | 0 | 5 | 0 | p21 index 0, 후보 4개 중 1개 |

위 해석은 실제 `parseFrameElevations` 출력에서 제목을 양쪽 NFKC → 공백 제거 → 끝 축척 토큰 1개 제거로 비교하고, 기본 후보의 라벨 레벨 수/면 순/index 순과 대조한 결과다. 아직 없는 `assembleDrawingSet`을 실행했다고 주장하지 않는다.

변경된 knownGaps 두 항목만 stale/방향을 다시 확인했다.

- **ina — `unmatchedBlocks`, both:** `parseFramingPlan`은 p6에서 제목 없는 블록 1개(placements 4), p7에서도 제목 없는 블록 1개(placements 6)를 냈다. `phases/44-drawing-set-assembly/step3.md:92`대로 사영하면 `[{fixture:"ina-p6"},{fixture:"ina-p7"}]`다. 골든 `tests/fixtures/drawing-set/expected/ina.json:39`와 비교한 missing 리프는 `[0].blockTitle`, extra 리프는 `[1].fixture = "ina-p7"`다. `:82`의 both는 stale하지 않다.
- **yokohama — `conflicts[0].payload.series.titles`, extra:** p9 첫 후보는 `[bX1通り軸組図1/100,bX2A通り軸組図1/100]`를 냈다. 골든 `tests/fixtures/drawing-set/expected/yokohama.json:101`은 첫 제목 하나뿐이다. 첫 요소는 같고 끝의 `[1]`만 extra이며 missing은 없다. `:117`의 새 경로는 실제 payload로 해석된다. p8/p9 첫 후보의 마지막 높이도 2690/2490으로 재확인했다. 기존 독립 기대값은 `tests/plan-import/elevation.test.ts:39`, `tests/plan-import/elevation.test.ts:119`, `tests/plan-import/elevation.test.ts:135`에 있다.

A5의 원문 좌표는 壁 x=1318.3199, y=120.960432(`tests/fixtures/section-import/textitems/yokohama-p15.json:10211`), スラブ x=676.08, y=128.040236(`tests/fixtures/section-import/textitems/yokohama-p15.json:10442`)다. y 우선 정렬은 새 골든의 壁→スラブ와 맞는다. A10의 alias 보충도 tsu-p21의 １ＦＬ(y=274.679890, `tests/fixtures/section-import/textitems/tsu-p21.json:242`)과 １ＳＬ(y=275.039890, 같은 파일 `:493`) 글리프에서 확인했다. 이를 SL을 현재 파서가 읽는다는 주장으로 확대하지 않았다(`src/lib/import/framing-plan/elevation.ts:185`).

levelIndex의 실현 가능성은 기존 `applyElevation`을 직접 호출해 확인했다. 입력 labels `[2FL,1FL,1FL,GL]`, top=0, bottom=3은 아래→위로 `(story-1, GL, 바닥 index 3)`, `(story-2, 1FL, index 2)`, `(story-3, 1FL, index 1)`에 대응한다. 바닥을 `levels[i+1]`로 읽고 역순으로 Story를 만드는 기존 루프(`src/lib/import/framing-plan/apply.ts:271`)와 맞으며, Project 모델에 index 필드를 추가할 필요가 없다. report에 표시한 index는 그 루프에서 확인한 대응이고 기존 함수가 새 필드를 반환한 것은 아니다.

실행한 파일 단위 회귀는 다음 명령이며 **2 files / 17 tests passed**, 종료 코드 0이다.

```text
node node_modules/vitest/vitest.mjs run tests/plan-import/elevation.test.ts src/lib/import/story-label.test.ts --no-cache --maxWorkers=1 --no-file-parallelism --reporter=dot
```

새 요구와 CLAUDE.md CRITICAL을 대조한 결과, R3-01의 검증 구멍 외에 추가 충돌은 찾지 못했다. 특히 순수 TS/모델 불변(`phases/44-drawing-set-assembly/step3.md:21`, `phases/44-drawing-set-assembly/step4.md:84`), 브라우저 내부 입력 처리(`phases/44-drawing-set-assembly/step5.md:22`), 사람이 실행해야 하는 브라우저 AC 대신 CLI 명령(`phases/44-drawing-set-assembly/step5.md:62`), build/dev 순서(`phases/44-drawing-set-assembly/step5.md:53`), verify gate(`phases/44-drawing-set-assembly/index.json:8`)가 유지돼 있다. 새 셸 명령 인자에는 CJK가 추가되지 않았다. R3-01은 `CLAUDE.md:30`의 “틀렸을 때 실패하는 것”이라는 검증 요구에 못 미친다. 단계별 구현·테스트의 실제 TDD 순서는 아직 실행되지 않아 확인하지 않았다.

**미검증**

- 이번 범위에서 바뀌지 않은 나머지 knownGaps의 stale/방향, 36면 전체 census·영역 실측, 모든 원문 치수의 재전사는 다시 실행하지 않았다. 새 스키마의 19개 간극 항목 검사와 변경된 두 항목의 실재 확인을 구분했다.
- phase 44 제품 함수·새 테스트·UI/e2e는 아직 없으므로 구현의 컴파일, 새 거부 코드 실행, 중복 재계산, 실제 ブロック→Story 반영과 브라우저 성공을 검증한 것은 아니다. 해당 항목의 closed는 시그니처·설계·예정 테스트의 결함이 해소됐다는 판정이다.
- git 명령, 워크트리 비교, `scripts/execute.py`, build, dev, 전체 테스트, 실제 파일 변이 검사는 실행하지 않았다. cleanliness 반례는 메모리에서 절차를 대조한 결과다.
- 읽은 ADR·사양·다섯 골든·CLAUDE.md·AGENTS.md·1/2차 보고서와 대조한 기존 import 파일의 SHA-256은 검토 중 재확인했으며 변화가 없었다. 이 보고서만 새로 작성했다. git 금지에 따라 저장소 전체의 status나 다른 세션의 변경을 판정하지 않았다.
