# Step 5: 「図面セット」 UI와 e2e uc24

## 배경

ADR-046 6.4. `src/components/plan/PlanImport.tsx`는 PDF 하나를 받아 블록·입면 카드를 내고 하나씩 반영한다. 여기에
「図面セット」 절을 더한다 — 파일(복수) → 면 목록(역할표·포함 체크·블록 포함 체크) → 基準系列 → top/bottom → 階별 블록
select(자동 제안 표시, 수동 override) → 階별 断面の階 select(등록된 断面의 라벨) → 충돌 패널(차단/정보) → 「反映」(plan이
유효할 때만 활성). 기존 카드는 남긴다. 자동 반영은 없다(ADR-030·043).

실제 입력(`.cache/dwg-tsu-kanritou.pdf`)은 **30면**이고 골든 밖 15면에 제목 없는 블록(X `['13','3']`, Y `['60','9']`)이 있어
전부 포함하면 `通り芯不一致`다(계획 검토 E1). 그래서 e2e는 두 단계다 — 충돌 노출, 그리고 면 선택 뒤 성공.

## 읽어야 할 파일

- `src/components/plan/PlanImport.tsx`·`PlanImport.module.css`, `src/lib/i18n.ts`·`src/locales/{ja,ko}.json`의 `planImport.*`.
- `src/lib/import/pdf-text.ts`(`extractTextPages` — 모든 면을 읽고 표제란도 제외하지 않는다), `src/lib/import/drawing-set/{types,roles,reconcile,plan,apply}.ts`.
- `tests/e2e/README.md`, `tests/e2e/uc22-plan-import.js`(픽스처 미러링·IndexedDB 초기화·`data-testid` 규약), `src/domain/model/sample-project.ts`.

## 할 일

1. `PlanImport.tsx` 절(`data-testid` 접두 `drawing-set-`):
   - `drawing-set-files`(`multiple`) → 파일마다 `extractTextPages` → `DrawingSetPage[]`(`source`＝파일명, `pageNumber` 1-based). 브라우저 안에서만.
   - 면 목록 `drawing-set-pages`: 행 `drawing-set-page-{i}`에 source·pageNumber·roles·포함 체크 `drawing-set-page-include-{i}`, 블록 행
     `drawing-set-block-include-{i}-{j}`(제목 또는 축 라벨 표시). 체크 변경 → `membership` 갱신 → `assembleDrawingSet` 재실행.
   - 基準 select `drawing-set-reference`(`referenceChoices`, 제목·면 표시) — 바꾸면 `assembleDrawingSet(pages, membership, reference)`로 후보를 다시 만들고
     top/bottom·`blockStories`·`sectionStoryLabels`를 **비운다**(R2-06). top/bottom `drawing-set-level-top`·`-bottom`.
   - 階별 블록 select `drawing-set-block-story-{key}`(option 표시는 Story 이름, **값은 levelIndex** — 동명 Story 구분; 자동 제안은 기본 선택＋「自動」 표시, 바꾸면 수동), 階별 断面の階 select
     `drawing-set-section-story-{levelIndex}`(등록된 `project.sections`의 `storyLabel` 집합).
   - 충돌 패널 `drawing-set-conflicts`: 항목 `drawing-set-conflict-{i}`에 코드(로케일 키로 번역)·blocking 표시·payload 요약(면·블록·レベル·값).
   - `drawing-set-apply` 버튼: `resolveDrawingSetPlan`이 `plan`을 돌려줄 때만 활성. 거부면 `drawing-set-plan-refusal`에 사유.
     `discardMembers` 체크 `drawing-set-discard-members`는 반영이 `部材あり階置換不可`로 거부된 뒤에만 보인다(기존 카드 규약).
     결과는 `drawing-set-result`.
   - 로케일 키는 `ja.json`·`ko.json` 양쪽. 도메인 용어 원어(ADR-008).
2. 컴포넌트 테스트 `src/components/plan/PlanImport.drawing-set.test.tsx`: `extractTextPages`를 목으로 두고 tsu 4면 픽스처를 넣어
   역할표 4행·基準 select에 후보·反映 후 스토어의 `stories`가 `applyDrawingSet` 결과와 같음, 그리고 5면째로 다른 격자의 블록을 넣으면
   충돌 패널에 `通り芯不一致`가 뜨고 버튼이 disabled이며 그 면의 포함 체크를 끄면 활성이 되는 것(p16 `杭伏図`는 블록 체크로 제외). 基準 select를 바꾸면 top/bottom·블록 select가 비는 것.
3. e2e `tests/e2e/uc24-drawing-set.js`(uc22 규약: 픽스처 base64 미러링, `indexedDB.deleteDatabase("kijun")` → reload):
   ① 30면 전체 포함 → `drawing-set-conflicts`에 `通り芯不一致`가 있고 `drawing-set-apply`가 disabled
   ② 16·20·21·22면만 포함(나머지 체크 해제 — **testid로 면을 고른다, 파일명·페이지 번호로 버리는 제품 로직 금지**) 그리고 p16의 `杭伏図` 블록을
     `drawing-set-block-include-*` 체크박스로 제외(階 키가 없어 대응 불가 — 스크립트 주석에 적는다) → grid·stories가 서고,
     基準·top/bottom 선택 → 反映 → `部材あり階置換不可` 표시 → `drawing-set-discard-members` 체크 → 反映 → DOM의 `span-x-*` 값이 골든
     `tests/fixtures/drawing-set/expected/tsu.json`의 `grid.xSpansMm`와 같다.
   `tests/e2e/README.md` 표에 `uc24` 행을 더하라.

## 하지 말 것

- 자동 반영·파일명/페이지 번호로 면을 버리는 로직을 만들지 마라. 이유: ADR-030·043, E1.
- 기존 블록·입면 카드를 지우거나 바꾸지 마라. 이유: 충돌 시의 대안 경로.
- 도면 데이터를 서버로 보내지 마라. 이유: CLAUDE.md CRITICAL.
- 조립·계획 규칙을 UI에서 다시 구현하지 마라. 이유: 계층 함수를 부르기만 한다.
- 테스트 전용 전역 훅 금지(uc22 규약). `src/domain/` 불변. 골든·픽스처 불변. 규준 수치 리터럴 무관. `scripts/execute.py` 실행·하네스 kill 금지.

## AC — 셸은 **Git Bash**(Windows). 순서: **build → dev 기동 → e2e**

`next dev`가 떠 있는 채로 `npm run build`를 돌리지 마라 — 같은 `.next`를 써서 빌드가 dev 청크를 덮고, `curl`은 200을 돌려주므로
「서버는 살았는데 e2e만 실패」로 보인다. 밟았으면 dev를 내리고 `rm -rf .next && npm run build` 후 다시 띄운다(이 스텝이 띄운 프로세스와
`.next`만 정리한다).

1. `npm run lint`·`npx tsc --noEmit`·`npx vitest run`이 0.
2. dev 서버가 없는지 확인(`netstat -ano | grep 3000` 빈 출력) → `npm run build`가 0.
3. 픽스처 미러링은 Node로: `node -e "require('fs').writeFileSync(process.env.HOME+'/.dev-browser/tmp/uc24-dwg-tsu-kanritou.pdf.b64', require('fs').readFileSync('.cache/dwg-tsu-kanritou.pdf').toString('base64'))"`
4. `npm run dev -- -p 3000`을 백그라운드로 → `npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc24-drawing-set.js`가 0 →
   dev 서버 종료(이 스텝이 띄운 PID만) → `npx dev-browser stop`.
5. `step5-report.json`: `baseline_commit`, `testids`, `locale_keys`(ja·ko 양쪽), `e2e: {command, exit_code, phase1_conflict_seen, phase2_spans}`,
   `build_order_respected: true`, `changed_paths`(허용: `src/components/plan/`·`src/locales/`·`src/lib/import/drawing-set/`·`tests/e2e/`·`tests/drawing-set/`·`phases/`).

## 기록 규칙

- `paths_verified`／`paths_expected_absent` 분리. 검증 명령 인자에 한글·일본어 금지.
