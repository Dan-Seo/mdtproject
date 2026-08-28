# Step 3: 반증하라 (검증 전용)

이 스텝은 **구현이 아니다.** 대상 코드·문서를 고치지 마라. 어긋난 것을 **고치지 말고 기록하라**.

**반증이 성립하면 status를 `refuted`로 두어라.** `error`가 아니다.

앞 스텝의 보고서(`step0-report.json`·`step1-report.json`·`step2-report.json`)는 **자기 보고**다. 「돌려봤다」·「통과했다」는 근거가 아니다. **전부 다시 확인하라.**

## 전제 목록 (이것들만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `sync-test-is-falsifiable` | `tests/docs/ledger-sync.test.ts`가 항진명제가 아니다. 아래 뮤테이션 1~5 각각에서 **실제로 실패**해야 한다. 하나라도 통과하면 **`refuted`**. **이것이 이 스텝에서 가장 중요한 항목이다** — 이 검사가 헐거우면 phase 전체가 아무것도 막지 못한 것이다. |
| `guardrail-test-still-bites` | `tests/docs/guardrail-sync.test.ts`가 여전히 문다 — `AGENTS.md`의 본문 한 줄을 고치면 실패한다(확인 뒤 되돌려라). 실패하지 않으면 **`refuted`**. |
| `no-code-change` | `git diff main...HEAD --stat -- src/ tests/` 에 나오는 파일이 **`tests/docs/ledger-sync.test.ts` 하나뿐**이다. 그 밖에 하나라도 있으면 **`refuted`**. 이 phase는 문서와 테스트 하나다. |
| `risks-untouched` | `git diff main...HEAD -- docs/RISKS.md` 가 **빈 출력**이다. 아니면 **`refuted`**. |
| `closed-tracks-really-closed` | step 2가 닫은 트랙 각각에 대해, **step 0 보고서를 읽지 말고 직접** 다시 재라. ① `パネルゾーン`·`溶接閉鎖`·`機械式定着`·`免震`이 `src/`·`tests/`에 **0건**이다. ② `スパイラル`·`壁式構造`의 매칭 줄이 **전부 주석**이다. ③ ADR-043 결정 5의 거부가 사유 코드와 함께 구현돼 있고 그 분기를 무력화하면 테스트가 실패한다(확인 뒤 되돌려라). 어느 하나라도 어긋나면 **`refuted`**. |
| `open-tracks-untouched` | `M2 룰팩`·`도면 인식(로컬)`·`M5` 세 행이 `CLAUDE.md`와 `docs/MILESTONES.md` 양쪽에서 **바뀌지 않았다**(`git diff main...HEAD`로 확인). 그리고 `src/rulepack/index.test.ts`의 「`stated`는 0행」 고정이 살아 있고 현재 룰팩의 `stated`가 0행이다. 어긋나면 **`refuted`**. |
| `decisions-preserved` | 닫힌 트랙의 **「만들지 않기로 한 것」 서술이 `docs/MILESTONES.md`에 그대로 남아 있다.** `git diff main...HEAD -- docs/MILESTONES.md` 에서 **삭제된 줄(`-`)이 체크박스 줄 자체의 교체 말고는 없다**는 것으로 확인하라. 결정의 기록이 요약되거나 지워졌으면 **`refuted`**. |
| `ledgers-agree` | `CLAUDE.md`·`docs/MILESTONES.md`·`docs/RISKS.md`·`AGENTS.md` 넷이 정합이다 — 두 sync 테스트가 통과하고, `docs/RISKS.md`의 `R번호` 집합과 `CLAUDE.md` 리스크 표의 `R번호` 집합이 **양방향으로 같다**(직접 세어 대조하라). 어긋나면 **`refuted`**. |
| `test-count-not-reduced` | `npm run test`의 테스트 수가 step 0 보고서의 기준선보다 **줄지 않았다**. 줄었으면 무엇이 사라졌는지 찾아 적고 **`refuted`**. |

## 뮤테이션 스윕 (반증 도구)
아래 각각을 **하나씩** 넣고 해당 테스트를 돌린 뒤 **반드시 되돌려라.** 각 뮤테이션이 **어떤 테스트를 깨뜨렸는지** 파일명과 테스트 이름으로 적어라.

1. `CLAUDE.md` 마일스톤 표에서 **완료**인 행 하나의 상태를 `진행 중`으로 바꾼다.
2. `docs/MILESTONES.md`에서 `- [x]`인 체크박스 하나를 `- [ ]`로 바꾼다.
3. `docs/RISKS.md`에서 `R번호` 하나가 나오는 줄을 지운다.
4. `CLAUDE.md` 열린 리스크 표에서 `R번호` 행 하나를 지운다.
5. `CLAUDE.md` 마일스톤 표에 **매핑표에 없는 행**을 하나 추가한다.
6. `AGENTS.md` 본문의 한 줄을 고친다.

**아무 테스트도 깨뜨리지 못한 뮤테이션이 하나라도 있으면** 그 지점은 오라클이 비어 있는 것이다 — `broke: []`로 적고 `sync-test-is-falsifiable`(6번은 `guardrail-test-still-bites`)을 **`refuted`**로 두어라.

**전 구간이 「동일」로 나오면 그것은 성공이 아니라 값이 닿지 않은 것이다.**

## 그 밖에 확인할 것 (기록 항목 — 반증 아님)
- `git diff main...HEAD --stat` 전문. 사양에 없는 파일이 있으면 목록으로 적어라.
- `tests/docs/ledger-sync.test.ts`의 매핑표에 실린 쌍의 수와, `CLAUDE.md` 표의 행 수·`docs/MILESTONES.md`의 체크박스 수. 셋이 맞는지 적어라.
- 닫히지 않고 남은 트랙 목록과 그 이유.

## 산출물
`phases/35-ledger-reconciliation/step3-report.json`

```json
{
  "verdict": "upheld|refuted",
  "premises": [{"id":"", "verdict":"upheld|refuted", "evidence":"", "note":""}],
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
- 전제 9건 각각에 `upheld`/`refuted`와 **증거**가 있다.
- 뮤테이션 6건 각각에 `broke`가 있다.
- 되돌리지 않은 뮤테이션이 없다 — 마지막에 `git status`를 확인하고 결과를 적어라.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로. 없으면 `completed`.

## 금지
- 대상 코드·문서를 고치지 마라. 뮤테이션은 넣고 **반드시 되돌린다**.
- 테스트를 더하거나 고치지 마라. 약한 검사를 발견하면 **적기만** 하라.
- 앞 스텝의 보고서를 근거로 판정하지 마라 — 그것이 이 스텝이 재는 대상이다.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `noticed`다.
