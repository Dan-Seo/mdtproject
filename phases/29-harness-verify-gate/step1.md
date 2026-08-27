# Step 1: 게이트가 정말 게이트인지 반증하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** `scripts/execute.py`·`scripts/execute_test.py`를
고치지 마라. 아래 주장을 하나씩 대조하고, **어긋나는 것이 하나라도 있으면
`refuted`로 끝내라.** 고치라는 것이 아니라 **틀렸음을 보이라**는 것이다.

이 스텝 자신이 `gate: true`다 — 반증하면 step 2가 돌지 않아야 한다. 그것이
step 0이 만든 것의 실물 시험이다.

## 주장 목록

| id | 주장 |
|---|---|
| `default-unchanged` | `gate`가 없는 phase의 동작이 phase 13과 **한 글자도** 다르지 않다. `test_refuted_verify_allows_next_pending_step`·`test_finalize_marks_phase_completed_after_refuted`가 **수정되지 않은 채** 통과함을 `git diff`로 보여라(그 두 테스트의 diff가 비어 있어야 한다). |
| `gate-halts` | `gate: true` verify 스텝이 `refuted`면 뒤 스텝이 **invoke되지 않는다**. 테스트가 「invoke 0회」를 실제로 세는지 확인하라 — status만 보는 테스트는 통과해도 반증 불가능하다. |
| `gate-leaves-pending` | 막힌 뒤 스텝의 status가 `pending`으로 남는다(`skipped`·`blocked`·삭제가 아니다). |
| `top-index-refuted` | 게이트 반증일 때만 top index가 `refuted`다. **게이트 없는 반증에서는 여전히 `completed`**임을 두 경우 모두 테스트로 보여라. |
| `startup-validation` | `gate: true`＋非verify가 기동 시 `exit 1`이고, 그때 codex invoke가 **0회**다. 스텝이 하나라도 돈 뒤에 죽는다면 반증이다. |
| `mutation-report-honest` | step 0 보고서가 적은 뮤테이션 4종을 **직접 다시 넣어** 보고, 보고서가 지목한 그 테스트가 정말 실패하는지 확인하라. 하나라도 실패하지 않으면 반증이다. 확인 뒤 반드시 원복하고, 원복됐음을 `git status`로 보여라. |
| `no-collateral` | step 0의 diff가 `scripts/execute.py`·`scripts/execute_test.py` 밖으로 나가지 않았다. 나갔다면 무엇인지 적어라. |

## 방법

- 「돌려봤다」·「통과했다」는 검증이 아니다. **틀렸을 때 실패하는 것**을 보여라.
- 뮤테이션은 반드시 원복하라. 원복 확인까지가 이 스텝의 일이다.

## 산출물

`phases/29-harness-verify-gate/step1-report.json`:

```json
{
  "claims": [
    {"id": "...", "verdict": "upheld|refuted", "evidence": "파일:행 또는 명령과 출력", "note": "..."}
  ],
  "verdict": "upheld|refuted"
}
```

검증 스크립트를 쓸 거면 **`phases/29-harness-verify-gate/` 안에** 두어라.

## 하지 말 것

- 대상(`scripts/**`)을 **고치지 마라.** 반증만 하라. 뮤테이션은 확인용이고 원복이 필수다.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## 종결

주장이 전부 성립하면 `completed`. 하나라도 어긋나면 **`refuted`** —
무엇이 어떻게 어긋났는지 report에 적고 멈춰라. 고치지 마라.
