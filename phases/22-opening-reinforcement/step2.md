# Step 2: 平面 입력·고지 전환·뷰어 skip·대장 갱신

**전제**: step 1이 `completed`. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 할 일

1. **平面 입력** — `src/components/plan/PlanEditor.tsx`의 開口 편집기에
   補強筋 행 입력을 더하라: 開口마다 목록(추가/삭제), 행은 径 셀렉트
   (`BAR_SIZES`)·본수·設計長さ(mm). 빈 목록은 키를 지워 저장하지 않는다
   (`openings` 자체의 선례 — 같은 파일의 빈 배열 처리부를 따르라).
   locale 키는 ja·ko 둘 다. 컴포넌트 테스트로 입력→스토어 반영·행 삭제·
   빈 목록 키 삭제를 핀하라.
2. **고지 문면 전환** — `takeoff.wallOpening`(ja·ko)을 「補強筋은 전사
   입력으로 계상하며, 전사하지 않은 開口는 그만큼 과소 계상」 취지로
   바꿔라(1通則8) 인용은 유지). 상시 표시는 유지한다 — 제품은 전사의
   완전성을 알 수 없다 (ADR-034 §5). `TakeoffPane.test.tsx`의 고지
   assertion을 새 문면으로 갱신하라.
3. **뷰어** — role `'開口補強筋'`을 그리지 않는다 (ADR-034 §3). step 0
   report의 실코드 확인 결과에 따라 skip 지점을 정하고, 補強筋 있는
   案件으로 지오메트리 생성이 죽지 않고 해당 role의 인스턴스를 만들지
   않는 것을 테스트로 고정하라.
4. **内訳 표시** — role→표시명이 필요한 곳(xlsx·印刷 포함)이 있으면
   `開口補強筋` 라벨을 대응하라. 새 열·새 시트는 만들지 마라.
5. **대장 갱신** —
   - `docs/RISKS.md` R14: 잔여(補強筋 미계상)를 닫고, 미전사 開口의 과소는
     고지가 안내한다는 사실로 갱신.
   - `CLAUDE.md`·`AGENTS.md`: R14 행 갱신, 부재 확장 행의 잔여에서
     「開口補強筋 입력」 제거.
   - `docs/MILESTONES.md` 부재 확장 절: 끝난 것에 開口補強筋 전사 입력
     (ADR-034, phase 22)을 추가하고 「남은 것」에서 제거.

## 하지 말 것

- `src/domain/**` 수정 금지 — 필요해지면 `blocked`로 멈춰라.
- `src/lib/import/**` 수정 금지 — 도면 인식은 이 phase의 범위가 아니다.
- e2e 신규 금지 — 기존 `tests/e2e/uc21-opening.js`는 초록으로 유지돼야 한다.
- 사용자 도면 데이터를 서버로 보내는 코드 금지.
- 배근 규준 수치 금지.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/22-opening-reinforcement/step2-report.json`:
입력 UI·고지 문면·뷰어 skip의 변경 요지, 대장 갱신 목록, 게이트 결과.
