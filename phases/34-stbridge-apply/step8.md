# Step 8: 다시 반증하라 (검증 전용 — step 6의 재실행이다)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 어긋난 것을 **고치지 말고 기록하라**.

**반증이 성립하면 status를 `refuted`로 두어라.** `error`가 아니다.

## 1차 실행 기록 (2026-08-28)
step 6이 한 번 `refuted`로 끝났다. 반증된 둘(`no-framing-plan-coupling`·`no-network-in-import`)은 **전제의 grep 범위가 `scope-guard.test.ts`를 포함해 구조적으로 성립 불가능**했던 것이고 코드의 결함이 아니었다 — 그 파일은 `applyFramingPlan`·`applyElevation`·`fetch`·`XMLHttpRequest`·`sendBeacon`을 **금지어 문자열로 선언**하므로 테스트를 포함하면 0건이 될 수 없다. 1차 보고서는 `step6-report.json`에 그대로 남아 있다. 아래에서 그 둘은 **비테스트 소스로 범위를 좁히고, 가드 목록이 비지 않았는지를 함께 요구하도록** 고쳤다 — 완화가 아니라 강화다.

그리고 step 6이 놓친 것이 하나 있었다. `no-rulepack-territory`가 `upheld`였는데 실제로는 `apply.ts`·`types.ts`의 식별자가 유니코드 이스케이프로 쓰여 grep을 통과하고 있었다. step 7이 이름을 바꾸고, 금지어 검사를 **이스케이프 해독본에도** 걸어 그 기법 자체를 무력화했다(금지가 아니라 무력화다 — 정당한 문자 리터럴은 그대로 통과한다). 아래 `no-escaped-identifiers`가 그것을 지킨다.

**1차 결과를 근거로 판정을 완화하지 마라 — 전부 다시 확인하라.** 뮤테이션 스윕도 다시 돌린다.

## 전제 목록 (이것들만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `apply-is-pure` | `src/lib/import/stb/apply.ts`가 React·DOM·three.js·zustand·Next·`node:fs`를 하나도 import하지 않고, `tests/stb-import/apply.test.ts`가 **node 환경**에서 돈다(`npx vitest run --project domain tests/stb-import/apply.test.ts`가 돌면 잡힌 것이다). 어긋나면 **`refuted`**. |
| `no-framing-plan-coupling` | **대상은 `src/lib/import/stb/`의 비테스트 `.ts`뿐이다** — `scope-guard.test.ts`가 이 이름들을 금지어 문자열로 선언하므로 테스트를 포함하면 코드가 아무리 깨끗해도 성립할 수 없다(1차 실행에서 실측). 비테스트 파일 각각에 `grep -Hn -e applyFramingPlan -e applyElevation -e framing-plan <파일>` 이 전부 0건이다. **그리고** `scope-guard.test.ts`가 `applyFramingPlan`·`applyElevation`을 **여전히** 금지어로 선언하고 있다 — 하나라도 빠졌으면 **`refuted`**(가드를 비우는 우회다). |
| `no-domain-drift` | `git diff main...HEAD --stat -- src/domain/ src/rulepack/` 이 **빈 출력**이다. 하나라도 있으면 **`refuted`**. |
| `no-rulepack-territory` | `src/lib/import/stb/`의 **비테스트 `.ts`** 각각에 `grep -Hn -e 定着 -e 重ね継手 -e 折曲 -e かぶり -e depth_cover -e anchorage -e cut_off -e center_ -e StbSec -e StbApply <파일>` 이 전부 0건이고, 그 파일들에 규준 수치로 읽힐 숫자 리터럴이 없다. **그리고** `scope-guard.test.ts`가 그 열 문자열을 **여전히 전부** 금지어로 선언하고 있다. 어느 쪽이든 어긋나면 **`refuted`**. |
| `no-escaped-identifiers` | `scope-guard.test.ts`가 금지어 검사를 **이스케이프를 해독한 사본에도** 걸고 있다. **그리고 그 장치가 항진명제가 아니다** — `apply.ts`의 식별자 하나를 이스케이프 표기(`StbApplyResult`의 `A`를 `\u0041`로)로 되돌리면 그 검사가 실제로 실패해야 한다(확인 뒤 되돌려라). 실패하지 않으면 **`refuted`**. 이것이 이 스텝에서 가장 중요한 항목이다: 이 장치가 헐거우면 위의 두 grep 전제가 통째로 무의미해진다. 덧붙여 `src/lib/import/stb/`에 남은 유니코드 이스케이프가 `real-decode.test.ts:48`의 문자 리터럴 하나뿐임을 확인하라 — 그것은 문자化け 검출용이며 정당하고, 가드의 스캔 대상(비테스트 `.ts`)도 아니다. **식별자** 안의 이스케이프가 하나라도 있으면 **`refuted`**. |
| `name-not-overwritten` | `applyStbGrid`·`applyStbStories`가 `project.name`을 바꾸지 않는다 (ADR-044 결정 5). **코드를 읽어 확인하지 말고 실행해 확인하라.** 그리고 그것을 고정하는 단언이 `apply.test.ts`에 실재하는지 적어라. 어긋나면 **`refuted`**. |
| `refusal-preserves-project` | 부재가 있는 案件에 `discardMembers` 없이 두 함수를 부르면 `applied: false`이고 돌아온 `project`가 **입력과 참조까지 같다**. 어긋나면 **`refuted`**. |
| `same-span-keeps-members` | 스팬이 같고 라벨만 다른 후보를 `applyStbGrid`에 넣으면 부재가 살아남고 `xLabels`·`yLabels`만 바뀐다. 어긋나면 **`refuted`**. |
| `issues-survive-approval` | `StbImport`에서 `issues`가 있는 후보를 승인한 뒤에도 그 issue 문면이 화면에 남는다 (ADR-044 결정 4). **테스트 코드를 읽는 것으로 끝내지 말고**, 그 단언을 일부러 무력화하면 그 테스트가 실제로 실패하는지 확인하라(확인 뒤 되돌린다). 실패하지 않으면 **`refuted`**. |
| `no-network-in-import` | **대상은 `src/lib/import/stb/`의 비테스트 `.ts`와 `src/components/stb/*.tsx`다**(1차 실행의 이유와 같다 — `scope-guard.test.ts`가 이 이름들을 금지어로 선언한다). 각각에 `grep -Hn -e fetch -e XMLHttpRequest -e sendBeacon -e axios <파일>` 이 전부 0건이고, 텔레메트리에 파일명·파일 내용을 싣는 코드가 없다. **그리고** `scope-guard.test.ts`가 `fetch`·`XMLHttpRequest`·`WebSocket`·`sendBeacon`을 **여전히** 금지어로 선언하고 있다. 어느 쪽이든 어긋나면 **`refuted`** (ADR-006). |
| `no-new-dependency` | `git diff main...HEAD -- package.json package-lock.json` 에 **의존 추가가 0건**이다. 있으면 **`refuted`**. |
| `mismatch-issue-still-bites` | `通り芯位置と節点の不一致`를 요구하는 단언이 `src/lib/import/stb/candidates.test.ts`와 `tests/fixtures/stb-import/expected/diffchecker-filea.json`에 **여전히** 있고, `candidates.ts`에서 그 issue를 담는 줄을 지우면 테스트가 실제로 실패한다(확인 뒤 되돌린다). 실패하지 않으면 **`refuted`**. |
| `ledgers-consistent` | ① step 5·7이 `docs/MILESTONES.md`·`docs/RISKS.md`·`CLAUDE.md`에 쓴 **모든 숫자**를 직접 다시 세어 일치한다. ② **R16이 `docs/RISKS.md`·`CLAUDE.md`·`AGENTS.md` 셋 다에 있다**(step 6이 CLAUDE.md 쪽 누락을 발견했다). ③ `CLAUDE.md`와 `AGENTS.md`가 동기화돼 있다(`tests/docs/guardrail-sync.test.ts` 통과). ④ `git diff main...HEAD --stat -- docs/` 에 `ADR.md`·`PRD.md`·`ARCHITECTURE.md`·`SOURCES.md`의 변경이 **없다**. 하나라도 어긋나면 **`refuted`**. |
| `applied-fixtures-are-oracles` | `tests/fixtures/stb-import/applied/` 5건이 실재하고, `_derivedFrom`이 `expected/`의 같은 이름 파일을 가리키며, **`expected/<이름>.json`의 `spansMm`·`heightMm`·`axes[].label`에서 손으로 유도한 값과 `applied/<이름>.json`의 `xSpans`·`ySpans`·`xLabels`·`yLabels`·`height`가 일치**한다. 직접 계산해 대조하라. 한 칸이라도 어긋나면 **`refuted`**. |

## 뮤테이션 스윕 (반증 도구)
아래 각각을 **하나씩** 넣고 `npm run test`를 돌린 뒤 **반드시 되돌려라**. 각 뮤테이션이 **어떤 테스트를 깨뜨렸는지** 파일명과 테스트 이름으로 적어라.

1. `applyStbGrid`에서 `xSpans`와 `ySpans`를 서로 바꾼다.
2. `applyStbStories`의 `id`를 위아래 뒤집는다.
3. `applyStbStories`가 `members: []`로 비우지 않고 기존 `members`를 남기게 한다.
4. 부재가 있을 때의 거부를 없애고 항상 반영하게 한다(두 함수 중 하나).
5. 스팬이 같을 때도 부재를 버리게 한다.
6. `applyStbGrid`가 `project.name`을 `candidate.projectName`으로 덮어쓰게 한다.
7. `StbImport`가 승인 성공 시 `issues` 표시를 지우게 한다.
8. `tests/fixtures/stb-import/applied/` 중 아무 파일의 숫자 한 칸을 1 더한다.
9. **`apply.ts`의 타입 이름 하나를 유니코드 이스케이프 표기로 되돌린다**(\u0041 같은 표기로) — step 7이 더한 해독본 검사가 이것을 잡아야 한다.

**아무 테스트도 깨뜨리지 못한 뮤테이션이 하나라도 있으면** 그 지점은 오라클이 비어 있는 것이다 — `broke: []`로 적고, 그것이 어느 전제의 근거를 무너뜨리는지 판단해 해당 전제를 **`refuted`**로 두어라.

**전 구간이 「동일」로 나오면 그것은 성공이 아니라 값이 닿지 않은 것이다.**

## 그 밖에 확인할 것 (기록 항목 — 반증 아님)
- `npm run test`의 파일 수·테스트 수. step 6 보고서의 **97 파일 / 1,680 테스트**와 비교해 증감을 적어라. **줄었으면 무엇이 사라졌는지 찾아 적어라.**
- `git diff main...HEAD --stat` 전문. 사양에 없는 파일이 있으면 목록으로 적어라.
- `src/lib/import/stb/`를 import하는 파일 전 목록(테스트·`scripts/stb/` 제외). `src/components/stb/StbImport.tsx` 하나가 정상이다 — 다른 것이 있으면 적어라.

## 산출물
`phases/34-stbridge-apply/step8-report.json`

```json
{
  "verdict": "upheld|refuted",
  "premises": [{"id":"", "verdict":"upheld|refuted", "evidence":"", "note":""}],
  "mutation_sweep": [{"mutation":"", "broke":[], "note":""}],
  "test_counts": {"files": 0, "tests": 0, "delta_files": 0, "delta_tests": 0},
  "diffstat": "",
  "unexpected_files": [],
  "stb_importers": [],
  "noticed": []
}
```

## 완료 조건
- 전제 14건 각각에 `upheld`/`refuted`와 **증거**가 있다.
- 뮤테이션 9건 각각에 `broke`가 있다.
- 되돌리지 않은 뮤테이션이 없다 — 마지막에 `git status`를 확인하고 결과를 적어라.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로. 없으면 `completed`.

## 금지
- 대상 코드를 고치지 마라. 뮤테이션은 넣고 **반드시 되돌린다**.
- 테스트를 더하거나 고치지 마라. 약한 테스트를 발견하면 **적기만** 하라.
- `docs/`·`CLAUDE.md`·`AGENTS.md`를 고치지 마라.
- `step6-report.json`을 고치거나 지우지 마라.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `noticed`다.
