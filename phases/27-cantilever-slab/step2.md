# Step 2: 3D·平面 표시와 배치 입력

**전제**: step 1이 `completed`. 진행 중 새 반증 사유가 나오면 `blocked`.

## 할 일

1. **3D** — 片持床板의 콘크리트 판과 배근을 支持辺에서 `side` 쪽으로
   `projectionMm`만큼 내밀어 그려라(建物 뷰·部材 뷰). 격자 **밖**으로 나가는
   부재라 뷰의 경계 계산이 그것을 포함해야 한다 — 잘리면 고쳐라.
2. **平面** — `PlanEditor`가 片持床板을 격자 밖에 그리고 선택할 수 있게 하라.
   `drawingTransform`의 범위에 내민 부분이 들어가야 한다.
3. **배치 입력** — phase 26(ADR-038)의 배치 UI에 片持床板을 더하라: 支持辺을
   고르고 `side`와 `projectionMm`를 받는다. 지지 조건(大梁·양 끝 柱)이 없는
   辺은 후보로 내지 마라 — 판정은 step 1의 기하 경로와 같은 근거여야 한다.
   삭제는 기존 床板 삭제 경로를 그대로 쓴다.
4. **테스트** — 뷰어 기하 단위 테스트와 `PlanEditor.test.tsx`에 최소 고정:
   내민 판이 격자 밖에 서고, 후보 판정이 지지 조건을 따르며, 배치·삭제가
   `Member`를 규약대로 만든다·지운다.
5. **e2e** — 신규 금지. 기존 `uc20-slab.js`가 깨지면 갱신하되 dev 서버를
   띄우지 마라(실행 검증은 리뷰어가 한다).

## 하지 말 것

- `src/domain/**` 수정 금지 — 필요해지면 `blocked`.
- 断面リスト 파서 수정 금지 (ADR-039 §7). 배근 규준 수치 금지.
- **`phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.**
- **검증 스크립트를 `src/` 아래에 만들지 마라** — phase 디렉터리 안에 둬라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/27-cantilever-slab/step2-report.json`: 변경 요지, 고정한 테스트, 게이트 결과.
