# Step 2: 승격 절차를 문서에 못박는다 (문서 전용)

**전제**: step 1이 `completed`다. **`src/**`·`tests/**`를 고치지 마라.**

## 할 일

1. `docs/RISKS.md`의 **R6**을 고쳐라.
   - 대조 단위가 **행 수가 아니라 원문 표 수 ＋ 단발항 수**라는 것(step 0·1이
     보고한 실제 수치를 쓰라).
   - 시트 생성 명령과 검토 순서 3단계.
   - **승격 절차**: 사람이 표 단위로 「전 칸 일치」를 회신 → 그 표가 덮는 행의
     `confidence`를 `stated`로 올리고 `note`의 「独立検討待ち」를 지운다 →
     `src/rulepack/index.test.ts`의 「`stated`는 0행」 고정을 **같은 커밋에서**
     함께 고친다. 이 셋이 한 커밋이 아니면 승격이 조용히 일어난 것이다.
   - R6은 **여전히 열림**이다. 시트가 생겼다고 닫지 마라.
2. `docs/MILESTONES.md`의 **M2** 항목에 같은 내용을 한 줄로 반영하라.
   M2는 여전히 **진행 중**이다.
3. `CLAUDE.md`·`AGENTS.md`의 리스크 대장 R6 한 줄을 1.과 같은 문언으로 맞춰라.
4. `docs/ADR.md`에 **ADR-041**이 이미 있다 — 본문을 고쳐 쓰지 말고, step 0·1에서
   실제 수치가 옛 기록과 달랐다면 **날짜를 붙인 정정**을 덧붙여라.

## 하지 말 것

- `src/**`·`tests/**` 수정 금지.
- 어떤 행도 `stated`로 올리지 마라 — 이 phase의 요점이 그것이다.
- 「M2 완료」·「R6 해소」라고 쓰지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/30-rulepack-review-sheet/step2-report.json`: 고친 문서와 줄, 승격 절차 요약.
