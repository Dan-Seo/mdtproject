# Step 2: 伏図 취입 화면 — 기본 미선택·정확 일치 자동 선택·근거 표시

**전제**: step 1이 `completed`. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 배경

ADR-035 §3·§4. 무대는 `src/components/plan/PlanImport.tsx`다 — 대상 Story
드롭다운(state 초기값 `stories[0]?.id ?? ''` 부근)과 断面の階 드롭다운
(`sectionStoryLabel`), distinct 라벨 목록 memo(`sectionStoryLabels`).
자동 결정 근거 표시의 선례는 `src/components/section/SectionImport.tsx`의
방향 피커(자동 시 「…（Y3端=始端）」 문구 노출)다.

## 할 일

1. **대상 Story 기본값을 미선택으로** — 초기값 `''`(placeholder 「선택하지
   않음」 취지, ja·ko locale 키). 미선택 상태로 반영을 누르면 기존
   `階未指定` 거부가 화면에 나온다 — 컴포넌트 테스트로 고정하라.
   기존 테스트가 `stories[0]` 기본값을 기대하면 **그 기대만** 갱신하라
   (ADR-035 §4가 명시하는 변경 대상이다). 그 외 기존 기대값 수정 금지 —
   바꿔야 통과한다면 `blocked`.
2. **자동 선택** — 취입 대상 블록이 정해질 때 그 블록 `title`에
   `storyLabelFromTitle`(step 1)을 적용하고:
   - 제목 階 키와 `storyKey(story.id)` 또는 `storyKey(story.name)`이
     일치하는 Story가 **정확히 하나**면 대상 Story를 자동 선택.
   - 제목 階 키와 키 일치하는 distinct `storyLabel`이 **정확히 하나**면
     断面の階를 자동 선택.
   - 어느 쪽도 **사용자가 이미 고른 값을 덮지 않는다.** 자동이 성립하지
     않으면 미선택 그대로 둔다 — 추정 폴백 금지 (ADR-004·033).
3. **근거 표시** — 자동 선택된 드롭다운 옆에 근거를 밝혀라: 제목에서 찾은
   토큰과 일치 대상(예: 「2階床伏図 → 2階」 취지). ja·ko locale 키.
   수동으로 바꾸면 근거 표시는 사라진다.
4. **컴포넌트 테스트** (`PlanImport.test.tsx`) — 최소 고정:
   - 제목 「2階床伏図」 × Story `{id:'2F'}` 또는 `{name:'2階'}` → 자동 선택
     ＋ 근거 표시.
   - 제목 「R階床伏図」 × Story name `R階` × 断面 라벨 `RF` → 둘 다 키
     일치로 자동 선택 (표기 차이를 storyKey가 흡수).
   - Story name이 「中央棟1FL／基準GL」류(키 미인식) → 자동 없음·미선택 유지.
   - 사용자가 먼저 고른 값 위에 자동이 덮지 않는다.
   - 기본 미선택으로 반영 → `階未指定` 거부 표시.
5. **e2e 확인** — `tests/e2e/uc22-plan-import.js`가 대상 Story의 조용한
   기본값에 의존하면 명시 선택으로 스크립트를 갱신하라(신규 e2e 금지).
   실행 검증은 리뷰어가 한다 — 이 스텝에서 dev 서버를 띄우지 마라.

## 하지 말 것

- `src/domain/**`·`src/lib/import/**` 수정 금지 — 필요해지면 `blocked`.
- Story 신규 생성·개명·정렬 UI 금지 (ADR-035 §6).
- 선택 Story와 断面の階의 불일치 경고 금지 (ADR-035 §6).
- 배근 규준 수치 금지. `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/23-story-label/step2-report.json`:
기본값 변경으로 갱신한 기존 기대값 목록, 자동 선택·근거 표시의 변경 요지,
게이트 결과.
