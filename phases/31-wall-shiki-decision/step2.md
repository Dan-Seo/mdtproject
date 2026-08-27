# Step 2: 대장의 모순을 없앤다 (문서 전용)

**전제**: step 1이 `completed`다. **`src/**`·`tests/**`를 고치지 마라.**

## 할 일

1. `docs/MILESTONES.md`의 「일본 고유 형태·제품」 항에서 **壁式構造の壁을
   「남은 것」에서 빼라**. 대신 「만들지 않는다 — 별개 마일스톤(ADR-042)」로 적어라.
2. `CLAUDE.md`·`AGENTS.md`의 마일스톤 표에서 같은 줄을 1.과 같은 문언으로 맞춰라.
   부재 규칙 문단의 「ADR-025」 서술에 ADR-042 참조를 더하라.
3. `docs/ADR.md`의 **ADR-025 본문을 고쳐 쓰지 말고**, 날짜를 붙인 한 줄 참조를
   덧붙여라 — 「2)壁式構造の壁의 조문 전사와 만들지 않는 결정은 ADR-042」.
4. `docs/RISKS.md`의 **R2**에 「壁式構造の壁의 다섯 구분은 조문에 있으나 제품이
   내지 않는다 — 미계상이지 추정이 아니다」를 적어라.
5. **틀린 서술을 지우지 말고 정정으로 덧붙여라.**

## 하지 말 것

- `src/**`·`tests/**` 수정 금지.
- 「壁式 완료」·「M3c 완료」라고 쓰지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/31-wall-shiki-decision/step2-report.json`: 고친 문서와 줄, 남은 모순 여부.
