# Step 6: 이 phase가 만든 것을 반증하라 (검증 전용)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 어긋난 것을 **고치지 말고 기록하라** — 고치면 검증자가 구현자가 되어 교차가 무너진다.

**반증이 성립하면 status를 `refuted`로 두어라.** `error`가 아니다. `refuted`는 재시도 없는 정상 종결이고, 무엇이 어긋났는지가 그대로 남는다.

## 배경
step 0~5의 `completed`와 summary는 **자기 보고**다. AC가 통과했다는 것도 실행자가 한 말이다. 이 스텝은 그 말을 믿지 않고 직접 대조한다. phase 33의 같은 스텝에서 「전 AC를 통과한 채로 남은 구멍」이 실제로 발견된 적이 있다.

**「돌려봤다」·「통과했다」는 검증이 아니다.** 검증 항목은 **틀렸을 때 실패하는 것**이어야 한다.

## 전제 목록 (이것들만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `apply-is-pure` | `src/lib/import/stb/apply.ts`가 React·DOM·three.js·zustand·Next·`node:fs`를 하나도 import하지 않고, `tests/stb-import/apply.test.ts`가 **node 환경**에서 돈다. `vitest.config.ts`의 `domain` 프로젝트 `include`에 그 경로가 실제로 잡히는지 확인하라(`npx vitest run --project domain tests/stb-import/apply.test.ts`가 돌면 잡힌 것이다). 어긋나면 **`refuted`**. |
| `no-framing-plan-coupling` | `grep -Hn -e applyFramingPlan -e applyElevation -e framing-plan src/lib/import/stb/*.ts` 가 **테스트를 포함해** 0건이다. ADR-044 결정 1이 「부르지도 옮기지도 않는다」이므로 이 항은 테스트도 대상이다. 있으면 **`refuted`**. |
| `no-domain-drift` | `git diff main...HEAD --stat -- src/domain/ src/rulepack/` 이 **빈 출력**이다. 하나라도 있으면 **`refuted`**(ADR-044 결정 5의 「`Grid`에 필드를 더하지 않는다」를 넘은 것이다). |
| `no-rulepack-territory` | `src/lib/import/stb/`의 **비테스트 `.ts`** 각각에 `grep -Hn -e 定着 -e 重ね継手 -e 折曲 -e かぶり -e depth_cover -e anchorage -e cut_off -e center_ -e StbSec -e StbApply <파일>` 이 전부 0건이고, 그 파일들에 규준 수치로 읽힐 숫자 리터럴이 없다. **그리고** `scope-guard.test.ts`가 그 열 문자열을 **여전히 전부** 금지어로 선언하고 있다. 어느 쪽이든 어긋나면 **`refuted`**. |
| `name-not-overwritten` | `applyStbGrid`·`applyStbStories`가 `project.name`을 바꾸지 않는다 (ADR-044 결정 5). **코드를 읽어 확인하지 말고 실행해 확인하라** — `name`이 다른 案件에 실물 후보를 반영해 `name`이 그대로인지 보라. 그리고 그것을 고정하는 단언이 `apply.test.ts`에 실재하는지 적어라. 어긋나면 **`refuted`**. |
| `refusal-preserves-project` | 부재가 있는 案件에 `discardMembers` 없이 두 함수를 부르면 `applied: false`이고 돌아온 `project`가 **입력과 참조까지 같다**. 어긋나면 **`refuted`**(「손대지 않은 원본 그대로」가 거짓이면 거부가 거부가 아니다). |
| `same-span-keeps-members` | 스팬이 같고 라벨만 다른 후보를 `applyStbGrid`에 넣으면 부재가 살아남고 `xLabels`·`yLabels`만 바뀐다. 어긋나면 **`refuted`**(이유 없이 부재를 버리는 것이다). |
| `issues-survive-approval` | `StbImport`에서 `issues`가 있는 후보를 승인한 뒤에도 그 issue 문면이 화면에 남는다 (ADR-044 결정 4). **테스트 코드를 읽는 것으로 끝내지 말고**, 그 단언을 일부러 무력화하면(예: 승인 후 issue를 지우도록 컴포넌트를 임시 변경) 그 테스트가 실제로 실패하는지 확인하라 — 확인 뒤 변경은 되돌린다. 실패하지 않으면 **`refuted`**(단언이 항진명제다). |
| `no-network-in-import` | `grep -Hn -e fetch -e XMLHttpRequest -e sendBeacon -e axios -e 'navigator.send' src/components/stb/*.tsx src/lib/import/stb/*.ts` 가 0건이고, 텔레메트리에 파일명·파일 내용을 싣는 코드가 없다. 있으면 **`refuted`** (ADR-006). |
| `no-new-dependency` | `git diff main...HEAD -- package.json package-lock.json` 에 **의존 추가가 0건**이다. 있으면 **`refuted`** (ADR-043 「하지 않는 것」). |
| `mismatch-issue-still-bites` | step 1이 픽스처를 고친 뒤에도 `通り芯位置と節点の不一致`가 반증 가능하다 — 그 코드를 요구하는 단언이 `src/lib/import/stb/candidates.test.ts`와 `tests/fixtures/stb-import/expected/diffchecker-filea.json`에 **여전히** 있다. 그리고 `candidates.ts`에서 그 issue를 담는 줄을 지우면 테스트가 실제로 실패한다(확인 뒤 되돌린다). 실패하지 않으면 **`refuted`**. |
| `ledgers-not-fabricated` | step 5가 `docs/MILESTONES.md`·`docs/RISKS.md`·`CLAUDE.md`에 쓴 **모든 숫자**를 직접 다시 세어 일치하는지 확인하라. 하나라도 어긋나면 **`refuted`**. 그리고 `git diff main...HEAD --stat -- docs/` 에 `ADR.md`·`PRD.md`·`ARCHITECTURE.md`·`SOURCES.md`의 변경이 **없는지** 확인하라 — 있으면 **`refuted`**(ADR-044 이후 근거 문서를 실행자가 고친 것이다). |
| `applied-fixtures-are-oracles` | `tests/fixtures/stb-import/applied/` 5건이 실재하고, `_derivedFrom`이 `expected/`의 같은 이름 파일을 가리키며, 그 픽스처가 파서 출력을 그대로 받아 적은 것이 아님을 확인하라 — **`expected/<이름>.json`의 `spansMm`·`heightMm`에서 손으로 유도한 값과 `applied/<이름>.json`의 `xSpans`·`height`가 일치하는지** 직접 계산해 대조하라. 한 칸이라도 어긋나면 **`refuted`**. |

## 뮤테이션 스윕 (반증 도구 — 결과가 `mutation_sweep`에 들어간다)
아래 각각을 **하나씩** 넣고 `npm run test`를 돌린 뒤 **반드시 되돌려라**. 각 뮤테이션이 **어떤 테스트를 깨뜨렸는지** 파일명과 테스트 이름으로 적어라.

1. `applyStbGrid`에서 `xSpans`와 `ySpans`를 서로 바꾼다.
2. `applyStbStories`의 `id`를 `'story-' + (i + 1)` 대신 `'story-' + (candidate.stories.length - i)`로 바꾼다(위아래 뒤집기).
3. `applyStbStories`가 `members: []`로 비우지 않고 기존 `members`를 그대로 남기게 한다.
4. 부재가 있을 때의 거부를 없애고 항상 반영하게 한다(두 함수 중 하나).
5. 스팬이 같을 때도 부재를 버리게 한다(`sameGrid` 상당의 분기 제거).
6. `applyStbGrid`가 `project.name`을 `candidate.projectName`으로 덮어쓰게 한다.
7. `StbImport`가 승인 성공 시 `issues` 표시를 지우게 한다.
8. `tests/fixtures/stb-import/applied/` 중 아무 파일의 숫자 한 칸을 1 더한다.

**아무 테스트도 깨뜨리지 못한 뮤테이션이 하나라도 있으면** 그 지점은 오라클이 비어 있는 것이다 — `mutation_sweep`에 `broke: []`로 적고, 그것이 전제 `apply-is-pure`~`applied-fixtures-are-oracles` 중 어느 것의 근거를 무너뜨리는지 판단해 해당 전제를 **`refuted`**로 두어라. 무너뜨리지 않으면 `note`에만 적는다.

**전 구간이 「동일」로 나오면 그것은 성공이 아니라 값이 닿지 않은 것이다.** 뮤테이션이 실제로 적용됐는지(파일이 바뀐 뒤 테스트가 그 파일을 읽는지) 먼저 확인하라.

## 그 밖에 확인할 것 (기록 항목 — 반증 아님)
- `npm run test`의 파일 수·테스트 수. step 0 기록 항목 11의 값과 비교해 **증가분**을 적어라. 줄었으면 무엇이 사라졌는지 찾아 적어라.
- `git diff main...HEAD --stat` 전문. 사양에 없는 파일이 있으면 목록으로 적어라.
- `src/lib/import/stb/`를 import하는 파일 전 목록(테스트·`scripts/stb/` 제외). 이제 `StbImport.tsx`가 여기 들어오는 것이 정상이다 — **다른 것이 있으면 적어라.**

## 산출물
`phases/34-stbridge-apply/step6-report.json`

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
- 전제 13건 각각에 `upheld`/`refuted`와 **증거**가 있다.
- 뮤테이션 8건 각각에 `broke`가 있다(빈 배열이면 그 사실이 결론이다).
- 되돌리지 않은 뮤테이션이 없다 — 마지막에 `git status`가 깨끗한지 확인하고 그 결과를 적어라.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로. 없으면 `completed`.

## 금지
- 대상 코드를 고치지 마라. 뮤테이션은 넣고 **반드시 되돌린다**.
- 테스트를 더하거나 고치지 마라. 약한 테스트를 발견하면 **적기만** 하라.
- `docs/`를 고치지 마라.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `noticed`다.
