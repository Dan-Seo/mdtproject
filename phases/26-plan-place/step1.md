# Step 1: 도메인 — 부재 단위 거부와 배치 가능 판정

**전제**: step 0이 `completed`(전제 유지)로 끝났을 때만 진행하라. `refuted`면
`blocked`로 멈추고 반증 요지를 적어라. 진행 중 새 반증 사유가 나오면 `blocked`.

## 할 일 (테스트 먼저 — TDD)

1. **plain Error → `MemberUnsupportedError`** (ADR-038 §3) —
   `girderDepthAboveWall`이 大梁를 못 찾을 때, 그리고 그 함수가 던지는
   다른 plain `Error`(大梁 부재가 大梁 이외의 단면을 가리키는 경우 등)를
   부재 단위 거부로 바꿔라. 이유(`reason`)는 기존 어휘를 쓰고 새 어휘를
   만들지 마라 — 기존 `MemberUnsupportedError`의 reason 목록을 먼저 읽고
   그중에서 골라라. 새 reason이 꼭 필요하면 `blocked`로 물어라.
   **먼저 재현 테스트를 써라** — 大梁 없는 辺의 벽이 있는 Project에서
   `useTakeoff`(또는 그 계산 경로)가 터지지 않고 그 부재만 未対応으로
   떨어지는 것을 고정한 뒤 구현하라. step 0이 「도달 불가」로 결론냈다면
   그 사실을 report에 적고 이 항목은 **그래도 하라** — 취입·손편집·과거
   案件이 여는 경로가 하나라도 생기면 화면이 죽기 때문이다.
   床板 쪽에서 같은 성질의 plain `Error`를 step 0이 찾았다면 함께 바꿔라.
2. **배치 가능 판정** (ADR-038 §2) — `src/domain/model/project.ts`에 순수
   함수를 더하라: 어떤 階의 어떤 辺에 벽을 놓을 수 있는지, 어떤 ベイ에
   床板을 놓을 수 있는지. 판정 근거는 기존 기하 함수가 요구하는 것과
   **같아야 한다**(벽 ＝ 그 辺의 大梁 ＋ 양 끝 柱, 床板 ＝ 네 변의 大梁).
   판정과 실제 계산이 어긋나지 않는 것을 테스트로 고정하라 — 「놓을 수
   있다고 한 자리는 계산이 통과하고, 없다고 한 자리는 未対応이 된다」.
   이미 부재가 있는 자리는 판정에 넣지 마라(그건 UI의 관심사가 아니라
   §4의 id 중복 규칙이다 — 함께 판정하되 이유를 구분하라).
3. **기존 골든·기대값을 고치지 마라** — 고쳐야 통과한다면 `blocked`.

## 하지 말 것

- `src/components/**` 수정 금지 — step 2다.
- 겹침 검사·undo 금지 (ADR-038 §6). 柱·大梁 배치 판정 금지.
- 배근 규준 수치를 코드에 쓰지 마라.
- **`phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.**
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/26-plan-place/step1-report.json`:
바꾼 예외의 목록과 고른 reason, 판정 함수의 시그니처와 근거, 게이트 결과.
