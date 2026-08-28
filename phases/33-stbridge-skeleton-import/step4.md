# Step 4: 이 phase의 오라클이 공허하지 않은지 반증하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 「통과한다」는 검증이 아니다 — 틀렸을 때 실패하는지를 확인하는 것이 검증이다. `gate: true`다.

## 배경
step 1~3에서 파서와 픽스처를 같은 손이 만들었다. 그 구조에서는 파서와 기대값이 함께 틀리면 조용히 통과한다. 2026-08-23 phase 7이 전 AC를 통과한 채 값을 지어내는 경로를 하나 남겼고, 그것을 잡은 것은 AC가 아니라 따로 돌린 반례였다. 이 스텝이 그 반례다.

**뮤테이션을 걸어 둔 채 턴을 끝내지 마라.** Stop 훅이 매 턴 끝에 `lint && typecheck && build && test`를 돌려 실패 출력을 「고쳐라」로 되돌리고, 그 압력의 최단 해법은 기대값 픽스처를 파서 출력에 맞추는 것이다 — 검증자가 구현자로 되돌아가는 정확한 경로다. **각 뮤테이션은 같은 턴 안에서 반드시 원복하고, 턴 끝의 검증 실패 지시를 따라 코드를 고치지 말고 원복만 하라.**

## 읽을 것
- `phases/33-stbridge-skeleton-import/step0-report.json` ~ `step3-report.json`
- `src/lib/import/stb/` 전부, `tests/stb-import/` 전부, `tests/fixtures/stb-import/` 전부
- `docs/ADR.md`의 ADR-043

## 방법
검증 스크립트는 `phases/33-stbridge-skeleton-import/` 안에 **`.py`로** 두어라. 세는 것은 파서가 아니라 grep·python 정규식이다.

## 전제 목록

| id | 전제 (반증 조건 포함) |
|---|---|
| `expected-independently-recomputed` | `tests/fixtures/stb-import/expected/*.json`의 실물 4건 값을 **파서를 쓰지 말고 `.cache/stb/`의 원본 .stb에서 직접 다시 계산**하라(python 정규식으로 `StbParallelAxes@angle`·`StbParallelAxis@name`·`@distance`·`StbStory@name`·`@height`·`@kind`를 뽑아 정렬·차분). 축 라벨 배열·`spansMm`·`stories`의 이름과 `heightMm`를 전부 재계산해 적어라. 커밋된 기대값과 한 칸이라도 다르면 **`refuted`**이고 **실제 값을 적어라**. `.cache/`가 비어 있으면 refuted가 아니라 note. |
| `expected-matches-step0` | 같은 값들이 `step0-report.json`의 `axes`·`stories`와도 일치한다. 다르면 어느 칸이 어떻게 다른지 적고 **`refuted`**. |
| `mutation-sweep-bites` | 아래 6곳을 **하나씩** 흔들면 각각 최소 한 테스트가 실패한다. ① `decode.ts`의 인코딩 판별을 항상 `'utf-8'`로 고정 ② `document.ts`의 버전 검사에 `'2.0.3'`을 추가 ③ `candidates.ts`의 방향 판정을 `groupName === 'X' ? 'X' : 'Y'`로 교체 ④ `candidates.ts`의 비직교 판정을 `angle !== 0`으로 교체 ⑤ `candidates.ts`의 階 통짜 거부를 「미대응 kind인 층만 제거 후 인접 차분」으로 교체 ⑥ `expected/diffchecker-filea.json`의 `spansMm` 한 칸 변경. **어느 하나라도 전 테스트가 통과하면 `refuted`** — 그 지점은 검사되고 있지 않다. 그리고 **6곳이 전부 같은 테스트 하나만 깨뜨리면** 값이 안 닿았다는 신호이므로 그 사실을 적고 `refuted`. 각 항목마다 흔든 diff 요지·실패한 테스트 파일·실패 메시지 원문을 표로 적고 **전부 원복해 `git status --porcelain`이 비었음을 보여라.** |
| `no-fabrication-on-missing` | 합성 `StbDocument`에서 `StbStory@height`, `StbParallelAxis@distance`, `StbParallelAxis@name`, `StbStory@name`을 **하나씩 지웠을 때** 후보가 기본값(0·빈 문자열·`'GENERAL'`·생성된 이름)을 채우지 않는다. 그리고 `src/lib/import/stb/` 전체에서 `?? 0`·`\|\| 0`·`?? ''`·`Number(x) \|\|`·`parseFloat(x) \|\|`·`Number.isFinite` 검사 없는 `Number(`/`parseFloat(` 를 전부 찾아 「이 값이 .stb에 없을 때 무엇이 나오는가」를 각각 답하라. 못 읽은 값이 후보에 숫자(`NaN` 포함)로 들어가는 경로가 하나라도 있으면 **`refuted`**. |
| `scope-guard-nonvacuous` | `src/lib/import/stb/scope-guard.test.ts`가 스캔한 파일 수가 실제 `src/lib/import/stb/` 아래 비테스트 `.ts` 수와 **같다**. 적으면(글롭이 빗나가 빈 통과) **`refuted`**. 그리고 `candidates.ts`에 `const x = 'depth_cover_start_X'` 한 줄을, `document.ts`에 `const y = 'applyFramingPlan'` 한 줄을 각각 심어 실제로 실패하는지 확인하라 — 실패하지 않으면 **`refuted`**. 확인 후 원복. |
| `candidates-are-inert` | 후보가 `Project`에 닿는 경로가 하나도 없다. **대상은 `src/lib/import/stb/`의 비테스트 `.ts`뿐이다** — `scope-guard.test.ts`가 금지어 목록 자체를 문자열로 선언하므로 테스트를 포함하면 이 전제는 코드가 아무리 깨끗해도 성립할 수 없다(2026-08-28 1차 실행에서 실측). 비테스트 파일 각각에 `grep -Hn -e applyFramingPlan -e applyElevation -e updateProject -e loadProject -e useAppStore -e createSampleProject <파일>` 을 돌려 전부 0건이고, `grep -rni -e stb -e st-bridge src/components/ src/lib/store.ts` 가 0건이며, `src/lib/import/stb/`를 import하는 파일이 **자기 테스트와 `scripts/stb/` 밖에** 0건이다. 하나라도 있으면 파일:행으로 적고 **`refuted`**(승인 없는 반영 경로가 열린 것이다). **그리고 테스트를 제외한 것이 구멍이 되지 않도록**, `scope-guard.test.ts`가 이 여섯 문자열을 **여전히 전부** 가드 목록으로 선언하고 있는지 확인하라 — 하나라도 빠졌으면 **`refuted`**(가드를 비우는 우회다). |
| `no-rulepack-territory` | **대상은 `src/lib/import/stb/`의 비테스트 `.ts`뿐이다**(위와 같은 이유 — `scope-guard.test.ts`가 금지어를 선언한다). 비테스트 파일 각각에 `grep -Hn -e 定着 -e 重ね継手 -e 折曲 -e かぶり -e depth_cover -e anchorage -e cut_off -e center_ -e StbSec -e StbApply <파일>` 을 돌려 전부 **0건**이고, 그 파일들에 규준 수치로 읽힐 숫자 리터럴(定着·継手·折曲げ·かぶり에 해당하는 mm 값이나 배수)이 없다. 있으면 파일:행을 적고 **`refuted`**. **그리고** `scope-guard.test.ts`가 이 열 문자열을 **여전히 전부** 금지어로 선언하고 있는지 확인하라 — 하나라도 빠졌으면 **`refuted`**. |
| `greps-are-not-vacuous` | **이 스텝이 쓰는 grep 명령 자체가 무언가를 잡을 수 있는 명령인지 먼저 확인하라.** 같은 명령을 확실히 걸리는 대상에 돌려 **1건 이상** 나오는 것을 명령·출력 그대로 보여라 — `-e stb`를 `src/lib/import/stb/`에, `-e 定着`을 `src/rulepack/`에. 0건이면 그 grep은 아무것도 검사하지 않고 있는 것이므로 **`refuted`**. **`grep -E`에 `\|`를 쓰면 alternation이 아니라 리터럴 파이프가 되어 항상 0건이다**(`grep -rn`의 BRE에서만 `\|`가 alternation이다) — 이 스텝의 명령 어디에든 `-E`와 `\|`가 함께 남아 있으면 그 자체로 **`refuted`**. |
| `env-split-holds` | `npx vitest run --project domain tests/stb-import` 와 `npx vitest run --project ui src/lib/import/stb` 를 각각 돌려 파일별 passed/failed 수를 적어라. `tests/stb-import/candidates.test.ts`가 0건이거나 실패면 **`refuted`** — node 환경에서 도는 것이 순수 TS의 유일한 증명이다. `tests/stb-import/**`의 어떤 파일이든 `DOMParser`를 쓰면 **`refuted`**. |
| `local-only-not-load-bearing` | `.cache/stb/`를 임시로 다른 이름으로 옮긴 상태에서 `npm run test`가 통과하고, **그때 스킵된 테스트 이름에 `real-decode`가 들어 있다**(step 1이 `describe` 제목에 그 문자열을 넣도록 정했다). 이름이 없으면 먼저 `src/lib/import/stb/real-decode.test.ts`가 실재하고 스킵됐는지 보라 — **파일과 스킵은 있는데 제목에만 없으면 `refuted`가 아니라 `note`다**(이름 규약 위반이지 오라클 부재가 아니다). 파일 자체가 없거나, 스킵되지 않고 통과하거나, `.cache/` 부재로 테스트가 실패하면 **`refuted`**. 확인 후 `.cache/stb/`를 되돌려라. |
| `untouched-tracks` | `git diff main --stat -- src/domain src/rulepack src/lib/import/framing-plan src/lib/import/section-list src/lib/import/types.ts src/lib/import/textitems.ts src/lib/import/runs.ts src/lib/import/pdf-text.ts src/lib/import/story-label.ts src/components src/lib/store.ts .github/workflows docs/ADR.md package.json` 이 **비어 있다**. 비어 있지 않으면 파일별 변경 줄 수를 적고 **`refuted`**. (`src/locales/`는 이 phase가 이유 코드 키를 추가하므로 대상이 아니다.) |
| `i18n-complete` | `STB_ISSUES`의 18개 코드 전부에 `stbImport.issue.<code>` 키가 `src/locales/ja.json`·`ko.json` 양쪽에 있다. 코드를 하나 더하고 키를 안 넣었을 때 `src/lib/import/stb/types.test.ts`가 실제로 실패하는지 확인하라 — 실패하지 않으면 **`refuted`**. 확인 후 원복. |
| `adr043-scope-matches-code` | ADR-043의 「하지 않는 것」에 적힌 것들(断面·배근·부재 배치·かぶり·定着·開口·壁式·재취입·UI·Project 반영)이 실제로 코드에 없고, ADR이 허용한다고 적은 것 중 만들어지지 않은 것도 적어라. **ADR이 금지한 것 중 만들어진 것이 하나라도 있으면 `refuted`.** ADR 문언이 코드보다 넓게 주장하면 어느 문장이 어떻게 어긋나는지 적어라. **고치지 마라.** |

## 하지 말 것
- 어긋난 것을 **고치지 마라.** 반증하고 끝내라 — 고치면 검증자가 구현자가 되어 교차검증이 무너진다.
- 뮤테이션을 원복하지 않은 채 턴을 끝내지 마라. 턴 끝 검증 실패 지시를 따라 코드를 고치지 말고 **원복만** 하라. 마지막에 `git status --porcelain`이 비어야 한다.
- 새 테스트·새 소스 파일을 `src/`·`tests/` 아래에 만들지 마라. 일회용 확인 스크립트는 `phases/33-stbridge-skeleton-import/` 안에 `.py`로 두어라.
- `docs/ADR.md`·`docs/RISKS.md`·`docs/MILESTONES.md`·`CLAUDE.md`·`AGENTS.md`를 고치지 마라.
- npm 패키지를 설치하지 마라. `.cache/`의 원본을 커밋하지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 죽이지 마라.

## 산출물
`phases/33-stbridge-skeleton-import/step4-report.json`:

```json
{
  "premises": [{"id": "", "verdict": "upheld|refuted", "evidence": "", "note": ""}],
  "recomputed": [{"file": "", "x_labels": [], "x_spans": [], "y_labels": [], "y_spans": [], "story_names": [], "story_heights": []}],
  "mutations": [{"id": "", "what": "", "failing_tests": [], "message": "", "reverted": true}],
  "fabrication_candidates": [{"file": "", "line": 0, "pattern": "", "what_happens_when_absent": ""}],
  "scope_guard": {"scanned": 0, "actual": 0, "injected_violation_failed": true},
  "vitest_projects": [{"project": "domain|ui", "files": 0, "passed": 0, "failed": 0}],
  "cache_absent_run": {"skipped_names": [], "passed": true},
  "untouched_tracks_diff": "",
  "git_status_clean": true,
  "verdict": "upheld|refuted"
}
```

`summary`(한 줄): 전제 13건의 upheld/refuted 수와, **뮤테이션 6곳 중 아무 테스트도 깨뜨리지 못한 지점이 있었는지**.

## 종결
전제 하나라도 어긋나면 status `refuted` + `summary`에 반증 요지. 반증 성립은 실패가 아니라 이 스텝의 정상 종결이며, 게이트이므로 step 5가 돌지 않고 top index가 `refuted`로 남는다.

## 1차 실행 기록 (2026-08-28)

이 스텝은 한 번 `refuted`로 끝났다. 반증된 둘(`candidates-are-inert`·`no-rulepack-territory`)은 **전제의 grep 범위가 `scope-guard.test.ts`를 포함해 구조적으로 성립 불가능**했던 것이고 코드의 결함이 아니었다 — 1차 보고서는 `step4-report-refuted-1.json`에 남아 있다. 위 두 전제는 그 뒤 **비테스트 소스로 범위를 좁히고, 가드 목록이 비지 않았는지를 함께 요구하도록** 고쳤다. 나머지 11건은 1차에서 이미 `upheld`였고 `mutation-sweep-bites`는 6곳이 서로 다른 테스트를 깨뜨렸다. **1차 결과를 근거로 판정을 완화하지 마라 — 전부 다시 확인하라.**
