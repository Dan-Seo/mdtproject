# Step 0 (verify): ADR-038의 전제를 반증하라

**역할**: 검증 전용이다. `docs/ADR.md`의 **ADR-038**을 읽고 아래 전제들을
코드·실행으로 **반증**하라. 대상 코드를 한 줄도 수정하지 마라. 반증이
성립하면 status **`refuted`**(정상 종결), 전부 버티면 `completed`.

## 반증 대상 전제

1. **(plain-error-crash)** `girderDepthAboveWall`(`src/domain/model/project.ts`)은
   그 辺에 大梁가 없으면 **plain `Error`**를 던지고, `useTakeoff`는
   `MemberUnsupportedError`만 잡는다(`if (!(error instanceof
   MemberUnsupportedError)) throw error`). 따라서 大梁 없는 辺의 벽은 부재
   하나가 떨어지는 것이 아니라 훅 전체가 터진다 — **실행으로 보여라**.
2. **(reachable-today)** 그 상태를 지금 만들 수 있는가. 伏図 취입
   (`src/lib/import/framing-plan/apply.ts`)이 大梁 없는 辺에 벽을 놓을 수
   있는지, 직렬화(`deserializeProject`)가 막는지, 샘플 案件은 어떤지
   전수로 확인하라. **도달 가능하면 살아 있는 결함이다** — 어느 경로인지
   적어라. 어느 경로로도 못 만든다면 그것도 결론이다(ADR-038 §3의
   근거가 약해진다 → 반증).
3. **(slab-needs-four-girders)** 床板의 内法이 정해지려면 무엇이 필요한지
   코드로 특정하고(`slabBay`·`slab-ends.ts`), 없을 때 무엇이 어떤 종류의
   예외로 떨어지는지 적어라(`MemberUnsupportedError`인지 plain `Error`인지).
4. **(no-member-creation-ui)** 지금 제품에 부재를 만들거나 지우는 UI가 없다 —
   `PlanEditor`·`SectionTable`·취입 화면 전수로 확인하라. 취입의 「反映」은
   승인 절차이지 자유 배치가 아니라는 것도 함께 적어라.
5. **(id-convention)** `apply.ts`의 부재 id 규약을 특정하고, **같은 id의 부재가
   둘 들어가면 무엇이 깨지는지** 실행으로 확인하라(직렬화·조회·선택·数量).
6. **(no-undo)** 되돌리기(undo) 기능이 제품에 없다 — 스토어·UI 전수 확인.

## 하지 말 것

- 대상 코드 수정 금지. 새 파일은 검증 스크립트·본 report만.
- **`phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라** — 하네스가
  쓰는 기록이고 삭제 시도가 정책에 막혀 phase 25 step 0에서 하네스가 죽었다.
- `scripts/execute.py` 금지 — 재귀다.

## 산출물

`phases/26-plan-place/step0-report.json`:
전제별 `{id, status: upheld|refuted, evidence[]}`, `verdict`, `summary`.
전제 2의 결과는 `reachablePaths`로 따로 실어라 — step 1이 그것으로
도메인 가드의 범위를 정한다.
