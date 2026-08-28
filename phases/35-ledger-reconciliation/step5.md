# Step 5: 다시 반증하라 (검증 전용 — step 3의 재실행이다)

이 스텝은 **구현이 아니다.** 대상 코드·문서를 고치지 마라. 어긋난 것을 **고치지 말고 기록하라**.

**반증이 성립하면 status를 `refuted`로 두어라.** `error`가 아니다.

## 1차 실행 기록 (2026-08-28)
step 3이 한 번 `refuted`로 끝났다. 반증된 `closed-tracks-really-closed`는 **사양 결함 둘**을 물려받은 것이었다:
- 정당한 범주를 「주석」 하나로 좁혔다. 실제 범주는 **주석 / 원문 조문의 전사 / 만들지 않는다는 결정의 기록** 셋이며, 문제의 15건은 골든 픽스처의 `quote`·`reason`이었다.
- 검사를 **트랙별로 묶지 않아**, step 2가 닫지도 않은 트랙(일본 고유)의 검사가 닫힌 트랙에 걸렸다.

아래에서 그 전제를 **트랙별로 쪼개고 판정 규칙을 고쳤다** — 완화가 아니다. 「구현 자리에 있는가」라는 더 정확한 질문으로 바꾼 것이고, 확인해야 할 줄 수는 오히려 늘었다.

**1차 결과를 근거로 판정을 완화하지 마라 — 전부 다시 확인하라.** 뮤테이션 스윕도 다시 돌린다.

## 판정 규칙 (전제 안에서 쓴다)
용어가 코드베이스에 있다는 사실만으로는 「만들었다」가 아니다. 정당한 범주는 셋이다 — ① 주석(`//`·`*`) ② 픽스처 데이터 필드에 담긴 **원문 조문의 전사**(`quote`·`text`) ③ **만들지 않는다는 결정의 기록**(`reason`·`status: deferred`·ADR 인용). 이 셋 밖의 **실제 동작을 만드는 자리**(식별자·타입·분기 조건·룰팩 `entries` 항목·로케일 문면·3D 형상 생성)에 있으면 그때가 「만들었다」다.

## 전제 목록 (이것들만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `sync-test-is-falsifiable` | `tests/docs/ledger-sync.test.ts`가 항진명제가 아니다 — 아래 뮤테이션 1~5 각각에서 **실제로 실패**해야 한다. 하나라도 통과하면 **`refuted`**. **이 스텝에서 가장 중요한 항목이다**: 이 검사가 헐거우면 phase 전체가 아무것도 막지 못한 것이다. |
| `guardrail-test-still-bites` | `tests/docs/guardrail-sync.test.ts`가 여전히 문다 — `AGENTS.md` 본문 한 줄을 고치면 실패한다(확인 뒤 되돌려라). 아니면 **`refuted`**. |
| `m3c-closed-correctly` | M3c의 「만들지 않기로 한 것」인 `パネルゾーン`·`溶接閉鎖`가 `src/`·`tests/`에 **0건**이다. 하나라도 있으면 **`refuted`**. |
| `stbridge-closed-correctly` | ADR-043 결정 5의 거부(비직교·원호·방사 通り芯, `BASEMENT`·`ISOLATION`·`DEPENDENCE` 階)가 **구현된 거부**다 — 사유 코드와 함께 후보를 버리는 코드와 그것을 고정하는 테스트가 있고, 그 거부 분기를 무력화하면 테스트가 **실제로 실패**한다(확인 뒤 되돌려라). 어긋나면 **`refuted`**. |
| `japan-closed-correctly` | `スパイラル`·`壁式構造`·`機械式定着`·`免震`의 매칭 줄을 **하나하나** 위 판정 규칙으로 분류했을 때 **「구현」이 0건**이다. **step 4의 분류표를 읽지 말고 직접 다시 분류하라.** 「구현」이 하나라도 있으면 **`refuted`**. |
| `open-tracks-untouched` | `M2 룰팩`·`도면 인식(로컬)`·`M5` 세 행이 `CLAUDE.md`와 `docs/MILESTONES.md` 양쪽에서 **바뀌지 않았다**(`git diff main...HEAD`). 그리고 `src/rulepack/index.test.ts`의 「`stated`는 0행」 고정이 살아 있고 현재 룰팩의 `stated`가 0행이다. 어긋나면 **`refuted`**. |
| `no-code-change` | `git diff main...HEAD --stat -- src/ tests/` 에 나오는 파일이 **`tests/docs/ledger-sync.test.ts` 하나뿐**이다. 그 밖에 하나라도 있으면 **`refuted`**. 특히 골든 픽스처(`tests/golden/`)에 변경이 있으면 결정의 기록을 지운 것이므로 반드시 **`refuted`**. |
| `risks-untouched` | `git diff main...HEAD -- docs/RISKS.md` 가 **빈 출력**이다. 아니면 **`refuted`**. |
| `decisions-preserved` | 닫힌 트랙의 「만들지 않기로 한 것」 서술이 `docs/MILESTONES.md`에 그대로 남아 있다 — `git diff main...HEAD -- docs/MILESTONES.md` 에서 삭제된 줄이 **체크박스 줄 자체의 교체 말고는 없다**. 결정의 기록이 요약되거나 지워졌으면 **`refuted`**. |
| `ledgers-agree` | `CLAUDE.md`·`docs/MILESTONES.md`·`docs/RISKS.md`·`AGENTS.md` 넷이 정합이다 — 두 sync 테스트가 통과하고, `docs/RISKS.md`의 `R번호` 집합과 `CLAUDE.md` 리스크 표의 집합이 **양방향으로 같다**(직접 세어 대조하라). 어긋나면 **`refuted`**. |
| `test-count-not-reduced` | `npm run test`의 테스트 수가 step 0 보고서의 기준선보다 **줄지 않았다**. 줄었으면 무엇이 사라졌는지 적고 **`refuted`**. |

## 뮤테이션 스윕 (반증 도구)
아래 각각을 **하나씩** 넣고 돌린 뒤 **반드시 되돌려라.** 각각이 **어떤 테스트를 깨뜨렸는지** 파일명과 테스트 이름으로 적어라.

1. `CLAUDE.md` 마일스톤 표에서 **완료**인 행 하나의 상태를 `진행 중`으로 바꾼다.
2. `docs/MILESTONES.md`에서 `- [x]`인 체크박스 하나를 `- [ ]`로 바꾼다.
3. `docs/RISKS.md`에서 `R번호` 하나가 나오는 줄을 지운다.
4. `CLAUDE.md` 열린 리스크 표에서 `R번호` 행 하나를 지운다.
5. `CLAUDE.md` 마일스톤 표에 **매핑표에 없는 행**을 하나 추가한다.
6. `AGENTS.md` 본문의 한 줄을 고친다.

**아무 테스트도 깨뜨리지 못한 뮤테이션이 하나라도 있으면** `broke: []`로 적고, 해당 전제를 **`refuted`**로 두어라.

**전 구간이 「동일」로 나오면 그것은 성공이 아니라 값이 닿지 않은 것이다.**

## 그 밖에 확인할 것 (기록 항목 — 반증 아님)
- `git diff main...HEAD --stat` 전문. 사양에 없는 파일이 있으면 목록으로 적어라.
- 매핑표의 쌍 수 · `CLAUDE.md` 표의 행 수 · `docs/MILESTONES.md` 체크박스 수. 셋이 맞는지 적어라.
- 닫히지 않고 남은 트랙 목록과 그 이유. `M2`·`도면 인식`·`M5` 셋이 정상이다 — 다른 것이 있으면 적어라.

## 산출물
`phases/35-ledger-reconciliation/step5-report.json`

```json
{
  "verdict": "upheld|refuted",
  "premises": [{"id":"", "verdict":"upheld|refuted", "evidence":"", "note":""}],
  "japan_classification": [{"term":"", "file":"", "line":0, "category":"comment|quote|decision|implementation"}],
  "mutation_sweep": [{"mutation":"", "broke":[], "note":""}],
  "test_counts": {"files": 0, "tests": 0, "delta_files": 0, "delta_tests": 0},
  "mapping_counts": {"pairs": 0, "claude_rows": 0, "milestones_checkboxes": 0},
  "still_open": [],
  "diffstat": "",
  "unexpected_files": [],
  "noticed": []
}
```

## 완료 조건
- 전제 11건 각각에 `upheld`/`refuted`와 **증거**가 있다.
- 뮤테이션 6건 각각에 `broke`가 있다.
- `japan_classification`에 매칭된 줄이 **전부** 실려 있다.
- 되돌리지 않은 뮤테이션이 없다 — 마지막에 `git status`를 확인하고 결과를 적어라.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로. 없으면 `completed`.

## 금지
- 대상 코드·문서를 고치지 마라. 뮤테이션은 넣고 **반드시 되돌린다**.
- 테스트를 더하거나 고치지 마라. 약한 검사를 발견하면 **적기만** 하라.
- 앞 스텝의 보고서를 근거로 판정하지 마라 — 그것이 이 스텝이 재는 대상이다.
- `step0-report.json`·`step3-report.json`을 고치거나 지우지 마라.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `noticed`다.
