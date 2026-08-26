# Step 2: 断面一覧 区分 입력·취입 보존·대장 갱신

**전제**: step 1이 `completed`. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 할 일

1. **断面一覧 입력** — `src/components/section/SectionTable.tsx`의 壁 단면
   편집기에 区分 셀렉트를 더하라: `耐力壁`(기본) / `耐力壁以外`.
   표시 문구는 ja·ko locale 키로 하되 값 표기는 원어 그대로
   (`耐力壁以外（雑壁）` 취지의 라벨 허용). 선택 → 스토어 반영,
   `耐力壁` 선택 시 키 삭제(기본값과 동일하므로 저장하지 않는다 —
   optional 필드 선례)를 컴포넌트 테스트로 고정하라.
2. **취입 보존** — 断面リスト 취입(`SectionImport.tsx`)이 기존 壁 단면을
   갱신할 때 `wallClass`를 덮지 않는 것을 테스트로 고정하라. step 0의
   (import-preserve) 확인 결과에 따라, 덮이는 구조라면 보존 처리를 넣어라.
   후보에 wallClass를 만들지 마라 — 파서는 판정하지 않는다 (ADR-036 §2,
   備考 분류 금지).
3. **표시** — 内訳(`TakeoffPane`)·断面一覧에서 区分이 보여야 할 곳이 있으면
   기존 표시 체계 안에서만 대응하라(새 열·새 시트 금지). 필요 없으면
   만들지 마라.
4. **대장 갱신** —
   - `docs/MILESTONES.md` 일본 고유 형태·제품 절: ③ 雑壁을 「区分
     (wallClass)·かぶり·40d 하한은 phase 24(ADR-036)로 완료, 부분 높이·
     부분 길이 형상(腰壁·下り壁·袖壁 고유 형상)은 형상 입력 신설이 필요해
     남음」으로 갱신.
   - `CLAUDE.md`·`AGENTS.md` 일본 고유 행: 남은 것을 「雑壁 형상(부분
     높이·袖壁)·壁式構造の壁」로 갱신.
   - `docs/RISKS.md` R2: 40d 하한 미적용(耐力壁以外)이 제품의 읽기로
     추가됐음을 한 줄 덧붙여라 (ADR-036 §4).

## 하지 말 것

- `src/domain/**` 수정 금지 — 필요해지면 `blocked`.
- 断面リスト 파서에 wallClass 자동 판정 추가 금지 (備考 금지).
- e2e 신규 금지. 배근 규준 수치 금지.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/24-wall-class/step2-report.json`:
입력 UI·보존 처리의 요지, 대장 갱신 목록, 게이트 결과.
