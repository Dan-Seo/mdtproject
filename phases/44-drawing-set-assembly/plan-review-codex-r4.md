approved

Round 4 종결 확인: **R3-01~R3-04 모두 closed**, still-open 0 · regressed 0. 이번 수정 범위에서 새 반증은 성립하지 않았으며 R4-xx 지적은 없다. 이 판정은 계획 수정의 종결 확인이다.

기준은 `C:/Users/emper/AppData/Local/Temp/claude/C--Users-emper-mdtproject/f3a3dfdc-bd3b-4134-a15d-d234d681c866/scratchpad/r4-verify-codex.md:5`와 같은 scratchpad의 `r7-decisions.md:3`이다. 3차 보고서의 네 지적을 읽고, 당시 읽은 사양과 현재 파일을 메모리에서 줄 단위로 대조했다. 변경은 해당 처분 범위에 한정돼 있었다.

| 새 발견 | 심각도 | 결과 |
|---|---|---|
| 없음 | — | 이번 수정에서 blocker·major·minor 추가 지적 없음 |

**R3 종결표**

| 항목 | 판정 | 파일:행 근거와 확인 결과 |
|---|---|---|
| R3-01 — cleanliness 내용 baseline | closed | `phases/44-drawing-set-assembly/step1.md:57`, `phases/44-drawing-set-assembly/step2.md:49`, `phases/44-drawing-set-assembly/step3.md:124`가 모두 새 dirty/미추적 경로와 시작 hash 대비 내용 변경 경로의 합집합을 검사한다. `phases/44-drawing-set-assembly/step7.md:12`도 같은 원리를 **step 1 기준의 phase 전체 범위**에 적용하므로, step 7 직전 상태로 앞 단계의 변경을 덮어버리지 않는다. 하네스 파일 제외와 임시 변이 원복 hash는 유지됐다. 파서 출력 기준은 `phases/44-drawing-set-assembly/step1.md:54`의 계측 전 작업 파일로 만든 36개 `parser_output_hashes`이며, `phases/44-drawing-set-assembly/step7.md:16`이 동일 방식으로 비교한다. HEAD와의 파서 비교는 제거됐다. |
| R3-02 — 基準 부재 시 거부 순서 | closed | `phases/44-drawing-set-assembly/step4.md:51`이 grid 존재 → stories 존재 → reference 동일성 → 범위 순으로 검사한다. kani의 stories null 사례에 대한 `階未確定` 테스트가 같은 파일 `:72`에 추가됐고, p8→p9 변경의 `基準不一致` 테스트는 `:74`에 남아 있다. 필수 `reference` 타입(`:21`)도 유지됐다. |
| R3-03 — payload 아래 제목 경로 | closed | `phases/44-drawing-set-assembly/step0.md:66`, `phases/44-drawing-set-assembly/step3.md:94`가 `conflicts[].payload.{reference,series}.titles`와 `conflicts[].payload.blocks[].blockTitle`를 명시한다. `docs/ADR.md:1006`의 예시도 `conflicts[0].payload.levelA`로 수정됐다. A3 및 실제 골든의 payload 구조와 일치한다. |
| R3-04 — ADR의 tsu 성공 조건 | closed | `docs/ADR.md:1009`에 16·20·21·22면 포함과 p16 杭伏図의 **블록 단위 제외**가 함께 들어갔다. `phases/44-drawing-set-assembly/step4.md:66`, `phases/44-drawing-set-assembly/step5.md:39`의 성공 경로 및 `src/lib/import/story-label.test.ts:34`의 階 키 부재와 맞는다. |

**독립 확인**

- **같은 status·다른 내용:** 3차와 같은 `src/domain/model/project.ts` 바이트 및 메모리에서 개행 하나를 더한 바이트를 사용했다. 시작/종료 status를 모두 ` M`로 두어도 hash `9087c324…`와 `3a9b7d7b…`가 달라 새 검사 집합에 해당 경로가 들어갔다. 내용도 같으면 제외됐고, 시작 목록에 없던 새 dirty 경로는 포함됐다. phase 전체 검사에서는 시작 목록에 없던 `$BASE` 대비 변경 경로도 포함되므로, 중간 커밋으로 작업 트리가 깨끗해진 경우를 검사 범위에서 잃지 않는다. 이는 메모리의 집합 대조이며 git 실행이나 실제 파일 변조가 아니다.
- **파서 hash 절차:** 현재 세 파서를 `tests/fixtures/section-import/textitems/*.json` 36면에 두 번 호출했다. `{lists, plan, elevations}`의 객체 키를 재귀 정렬하고 배열 순서는 유지한 뒤, 공백 없는 JSON의 UTF-8 바이트에 SHA-256을 적용했다. 36개 hash가 모두 재현됐으며 불일치는 0개다. hirosaki-p25는 `f2dc98b0ed1616652019a1381f5ce53c59e9258c36e34ab728ab8bfc4afab55b`였고, 객체 키 삽입 순서만 바꾸면 같은 hash, 메모리 안에서 높이 값 하나를 바꾸면 다른 hash가 나왔다. 따라서 새 방식은 동일 출력과 값 변경을 구별한다. 실제 step 1 report를 생성하거나 step 7을 실행한 것은 아니다.
- **거부 순서의 회귀 여부:** kani는 grid가 있고 파서 계열이 없는 사례다(`tests/fixtures/drawing-set/expected/kani.json:42`, 같은 파일 `:86`; `tests/plan-import/elevation.test.ts:88`). 새 순서에서는 choices의 reference를 보기 전에 `階未確定`에 도달한다. 반면 grid와 stories가 있는 yokohama에서 p8→p9로 基準만 바꾸면 앞의 두 검사는 통과하고 reference 비교에서 `基準不一致`가 된다. R2-06 테스트와 모순되지 않는다. ADR의 전제조건 나열(`docs/ADR.md:1002`)은 검사 순서를 지정하지 않으므로 step 4의 명시적 순서와 충돌하지 않는다.
- **payload·knownGaps 정합:** 다섯 골든은 3차 때와 바이트가 같았다. 충돌 객체 키·코드별 payload·blocking 값을 다시 검사해 오류 0건을 확인했다. yokohama의 `conflicts[0].payload.series.titles` 간극(`tests/fixtures/drawing-set/expected/yokohama.json:117`)은 실제 제목 배열로 해석됐다. 추가된 blocks 제목 경로도 ina의 `payload.blocks`(`tests/fixtures/drawing-set/expected/ina.json:49`)와 맞는다. A3(`phases/44-drawing-set-assembly/step0.md:63`)나 기존 간극 경로를 바꿀 필요가 없다.

**미검증**

- phase 44 구현·신규 테스트·UI/e2e 및 실제 `step1-report.json`→`step7-report.json` 실행 결과는 검증하지 않았다. 파서 hash 재현은 현재 작업 파일에 대한 절차 확인이며, 미래 구현 전후의 불변성을 미리 승인한 것이 아니다.
- 이번 수정과 무관한 원문 전사·영역 census·knownGaps 전체의 stale/방향은 다시 감사하지 않았다. 기존 회귀 테스트도 반복 실행하지 않았다.
- git 명령, `scripts/execute.py`, build/dev, 실제 파일 변이는 실행하지 않았다. 이 보고서 외의 대상 파일은 수정하지 않았고, 검토 시작 때 기록한 ADR·사양·골든·이전 보고서·기존 import 파일 등의 hash를 종료 시 다시 확인했다.
