# Step 0: 대장이 주장하는 「남은 것」이 사실인지 먼저 잰다 (검증 전용)

이 스텝은 **구현이 아니다.** 코드·문서를 하나도 고치지 마라. 사실을 재고 기록한다.

**반증이 성립하면 status를 `refuted`로 두어라.** `error`가 아니다. 반증이 나와도 **뒤 스텝은 계속 진행한다** — step 2가 이 보고서를 읽어, `upheld`인 트랙만 닫는다.

## 왜 재는가
`CLAUDE.md`의 마일스톤 표는 손으로 갱신하므로 코드보다 뒤처진다. 실제로 **부재 확장(耐震壁·床板)** 행은 아직 「진행 중 / 남은 것: 平面 뷰의 벽·床板 배치·삭제 입력, 片持床板」인데, `docs/MILESTONES.md`는 같은 트랙을 `- [x] 완료 (2026-08-27)`로 적고 본문에 「平面 뷰의 壁·床板 배치·삭제 입력은 phase 26(ADR-038)에서 완료」·「片持床板 … phase 27, ADR-039」라고 쓴다. 둘 중 하나는 틀렸다.

**대장을 근거로 대장을 고치면 안 된다.** 어느 쪽이 맞는지는 코드가 정한다. 그래서 이 스텝이 먼저다.

## 전제 목록 (이것들만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `wall-slab-placement-exists` | 平面 뷰에서 `耐震壁`과 `床板`을 **배치하고 삭제할 수 있다.** 코드를 읽는 것으로 끝내지 말고 **실행해 확인하라** — `src/components/plan/PlanEditor.test.tsx`에 배치와 삭제를 함께 밟는 테스트가 실재하고 통과한다. 그리고 그 삭제 단언을 일부러 무력화하면 그 테스트가 **실제로 실패**해야 한다(확인 뒤 되돌려라). 어느 쪽이든 어긋나면 **`refuted`**. |
| `cantilever-slab-exists` | `片持床板`을 배치하고 삭제할 수 있다. 위와 같은 방식으로 확인하라(배치 후보가 **지지 大梁이 없는 변에는 나오지 않는** 것까지 포함해 적어라). 어긋나면 **`refuted`**. |
| `m3c-remainder-is-decision-only` | `CLAUDE.md`가 M3c의 남은 것으로 적은 `パネルゾーン帯筋`·`溶接閉鎖フープ`가 **`src/`와 `tests/`에 0건**이다. 하나라도 나오면 **`refuted`**(만들지 않기로 한 것이 실은 만들어져 있거나, 반대로 미완의 흔적이 있다는 뜻이다). |
| `japan-remainder-is-decision-only` | ① `機械式定着`·`免震`이 `src/`·`tests/`에 **0건**이다. ② `スパイラル`과 `壁式構造`는 나오되 **전부 주석 줄**이다 — 매칭된 줄이 하나도 빠짐없이 `//` 또는 `*`로 시작하는 주석이며, 식별자·분기·룰팩 항목·로케일 문면으로는 쓰이지 않는다. 주석이 아닌 자리에 하나라도 있으면 **`refuted`**. |
| `stbridge-refusals-are-implemented` | ADR-043 결정 5의 거부(비직교·원호·방사 通り芯, `BASEMENT`·`ISOLATION`·`DEPENDENCE` 階)가 **「미구현」이 아니라 「구현된 거부」**다 — 사유 코드와 함께 후보를 버리는 코드와 그것을 고정하는 테스트가 실재하고, 그 거부 분기를 무력화하면 테스트가 실제로 실패한다(확인 뒤 되돌려라). 어긋나면 **`refuted`**. |
| `drawing-track-really-open` | 도면 인식 트랙은 **정말로 열려 있다** — kani p40을 「읽지 못한다」로 고정한 테스트가 실재한다. 이 전제가 `refuted`면 그 트랙도 닫을 후보가 된다는 뜻이므로, 어긋나면 **`refuted`**로 두고 무엇을 찾았는지 적어라. |
| `m2-really-open` | `src/rulepack/index.test.ts`가 「`stated`는 0행」을 고정하고 있고 현재 룰팩의 `stated`가 0행이다. 어긋나면 **`refuted`**. |

## 기록 항목 (반증 아님 — step 1·2가 이것을 읽는다)
1. `CLAUDE.md` 마일스톤 표의 **모든 행**: 행 이름, 상태 칸, 남은 것 칸(요약 말고 원문 그대로).
2. `docs/MILESTONES.md`의 **모든 체크박스 줄**: `[x]`/`[ ]`, 굵게 표시된 이름.
3. 위 둘의 **대응**과 **어긋난 곳**. 이름이 정확히 같지 않은 쌍(예: 표의 `M4 재방문·내역서·PDF·glTF` ↔ 체크박스의 `M4`)은 어떻게 대응시켰는지 적어라 — step 1의 매핑표가 이것을 그대로 쓴다.
4. `docs/RISKS.md`에 나오는 **모든 `R번호`**와, `CLAUDE.md` 열린 리스크 표의 **모든 `R번호`**. 한쪽에만 있는 것을 적어라.
5. `tests/docs/` 아래 현재 있는 파일 목록과, `npm run test`의 파일 수·테스트 수.

## 산출물
`phases/35-ledger-reconciliation/step0-report.json`

```json
{
  "verdict": "upheld|refuted",
  "premises": [{"id":"", "verdict":"upheld|refuted", "evidence":"", "note":""}],
  "claude_md_milestones": [{"row":"", "status":"", "remaining":""}],
  "milestones_md_checkboxes": [{"checked":true, "name":""}],
  "mapping": [{"claude_row":"", "milestones_name":"", "agrees":true, "note":""}],
  "risk_ids": {"risks_md": [], "claude_md": [], "only_in_risks_md": [], "only_in_claude_md": []},
  "tests_docs_files": [],
  "test_counts": {"files": 0, "tests": 0},
  "noticed": []
}
```

## 완료 조건
- 전제 7건 각각에 `upheld`/`refuted`와 **증거**가 있다.
- 기록 항목 5건이 모두 채워져 있다. 대응표는 **빠짐없이** — 한쪽에만 있는 행도 상대 칸을 비운 채로 넣어라.
- 되돌리지 않은 임시 수정이 없다. 마지막에 `git status`를 확인하고 결과를 적어라.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로. 없으면 `completed`.

## 금지
- 코드·테스트·문서를 고치지 마라. 확인용 임시 수정은 넣고 **반드시 되돌린다**.
- 대장(`CLAUDE.md`·`docs/MILESTONES.md`·`docs/RISKS.md`)의 서술을 근거로 판정하지 마라 — **이 스텝이 재는 대상이 그 서술이다.** 근거는 코드·테스트·픽스처다.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `noticed`다.
