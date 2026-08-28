# Step 0: 반영의 전제를 반증하고, 뒤 스텝이 쓸 실측값을 확정하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. `gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

**전제**: `docs/ADR.md`에 `### ADR-044`가 있다. 없으면 `blocked`로 멈추고 그 사실을 `blocked_reason`에 적어라(ADR은 Claude가 쓴다 — 네가 쓰지 마라).

## 배경
phase 33이 `.stb`에서 通り芯 그리드와 階 스택을 **후보**로 내는 데까지 갔고, 후보가 `Project`에 닿는 경로는 0건임을 그 phase의 게이트가 확인했다. phase 34는 그 후보를 **사람이 승인하면 案件에 들어가게** 한다 — ADR-043 결정 2가 예고하고 결정 6 후단이 유보한 자리이며, ADR-044가 그 유보를 푼다.

이 스텝의 산출은 둘이다 — **반증**(전제가 어긋나면 phase를 멈춘다)과 **실측**(뒤 스텝의 AC가 될 수치·형식을 확정한다). 둘을 섞지 마라. 「전제 목록」의 항목만 `refuted`를 낼 수 있고, 「기록 항목」은 값이 예상과 달라도 반증이 아니다.

**원본 `.stb`는 이 phase의 필수 조건이 아니다.** phase 33이 실물 4건의 파서 무관 실측을 `phases/33-stbridge-skeleton-import/step0-report.json`에, 중간표현과 기대 후보를 `tests/fixtures/stb-import/` 아래에 커밋해 두었다. 그것으로 대부분이 확인된다. `.cache/stb/`에 원본이 남아 있으면 P4를 원본으로도 검산하고, 없으면 `note`에 적고 커밋된 중간표현으로만 검산하라 — **원본이 없는 것은 반증이 아니다.**

## 읽을 것
- `docs/ADR.md` — ADR-002 / ADR-004 / ADR-005 / ADR-012 / ADR-015 / ADR-029 / ADR-030 / ADR-035 §6 / **ADR-043** / **ADR-044**
- `src/lib/import/framing-plan/apply.ts` 전체 — 특히 `applyElevation`·`sameGrid`·`gridOf`
- `src/lib/import/framing-plan/types.ts` — `PLAN_APPLY_REFUSALS`·`ELEVATION_APPLY_REFUSALS`
- `src/components/plan/PlanImport.tsx` — 거부를 보여준 뒤 「버리고 진행」을 내는 흐름
- `src/domain/model/project.ts` — `Grid`·`isGridLabels`·`Story`·`storyElevation`
- `src/lib/import/stb/types.ts`·`candidates.ts`
- `src/lib/store.ts` — `updateProject`와 `loadProject`의 차이
- `tests/fixtures/stb-import/` 전부 (`SOURCES.md` 포함)
- `phases/33-stbridge-skeleton-import/step0-report.json` — 파서 무관 실측의 정본
- `vitest.config.ts` — 두 프로젝트의 `include`와 `environment`

검증 스크립트가 필요하면 `phases/34-stbridge-apply/` 안에 **`.py`로** 두어라(`tsconfig.json`의 include가 `**/*.ts`라 phases 아래 `.ts`가 `npx tsc --noEmit`에 잡히고, `eslint .`의 ignores에 `phases/**`가 없다). **`phases/` 아래의 파일을 프로덕션 테스트에서 읽지 마라** — 이 스텝의 검증 스크립트에서만 읽는다.

## 전제 목록 (이 6건만 `refuted`를 낼 수 있다)

| id | 무엇을 반증하는가 |
|---|---|
| `elevation-precedent` | ADR-044 실측 1·결정 3의 선례. `applyElevation`이 ① `project.stories`를 **통짜 교체**하고 ② `members`를 `[]`로 비우며 ③ `project.members.length > 0 && !discardMembers`이면 `部材あり階置換不可`로 거부하고 그때 `project`를 **손대지 않은 원본 그대로** 돌려준다. 셋 중 하나라도 어긋나면 **`refuted`** — 결정 3이 선례를 잘못 읽은 것이다. 코드를 읽어 확인하되 **`apply.test.ts`에 이 세 성질을 고정하는 단언이 실재하는지도 함께 적어라**(없으면 그 사실을 `note`에 적되 반증은 아니다). |
| `heightmm-is-storey-height` | ADR-044 실측 2. `tests/fixtures/stb-import/expected/*.json` 중 `stories`가 비어 있지 않은 실물 파일 각각에 대해, `stories[i].heightMm`가 phase 33 step0-report의 같은 파일 `stories[].adjacent_diffs[i]`와 **전 칸 일치**하고, `stories`의 개수가 그 파일 `levels` 개수 − 1이며, `heightMm`가 전부 양수다. **파서를 실행해 확인하지 마라** — 커밋된 두 JSON을 대조하는 것이 이 항의 전부다. 하나라도 어긋나면 **`refuted`**(`heightMm`가 階高가 아니라 절대 표고라는 뜻이고, 그러면 `Story.height`에 그대로 넣을 수 없다). 대조 대상에서 뺀 파일과 그 이유를 적어라. |
| `label-arity` | ADR-044 실측 3. 기대 후보 5건(실물 4 + 합성 `mini`)의 **모든** 그리드에서 `axes.length === spansMm.length + 1`이고, `isGridLabels`(`src/domain/model/project.ts`)가 `labels.length === spanCount + 1`을 요구한다. 어긋나면 **`refuted`**(라벨을 `xLabels`에 그대로 실을 수 없다). |
| `direction-is-measured-axis` | `direction`이 **距離가 재어지는 축**이라는 것. 검산은 파서를 거치지 않고 한다 — `tests/fixtures/stb-import/document/*.json`의 `nodes`에서 `x`의 서로 다른 값을 모아 오름차순 인접 차분 열을 만들고, `expected/*.json`의 `direction: "X"` 그리드의 `spansMm`가 그 열의 **연속 부분열**인지 확인하라(節点은 通り芯 밖에도 있으므로 동일이 아니라 부분열이다). `Y`도 같게 한다. `.cache/stb/`에 원본이 있으면 원본에서도 같은 계산을 해 일치를 확인하라. 한 파일이라도 `X`의 `spansMm`가 **`y` 쪽에서만** 성립하면 **`refuted`**(축이 뒤바뀐 것이고, 반영하면 案件의 가로세로가 바뀐다). 어느 쪽으로도 성립하지 않는 파일은 그 사실을 적되 반증이 아니다 — 이유를 함께 적어라. |
| `still-inert` | 반영 전 기준선. `src/lib/import/stb/`의 **비테스트 `.ts`** 각각에 `grep -Hn -e applyFramingPlan -e applyElevation -e updateProject -e loadProject -e useAppStore -e createSampleProject <파일>` 이 전부 0건이고, `grep -rni -e stb -e st-bridge src/components/ src/lib/store.ts` 가 0건이다. 하나라도 있으면 **`refuted`**(phase 33의 결론이 이미 깨진 것이며, 그러면 이 phase가 여는 것이 무엇인지 다시 정해야 한다). **테스트 파일은 대상에서 뺀다** — `scope-guard.test.ts`가 이 문자열들을 가드 목록으로 선언하므로 포함하면 구조적으로 성립할 수 없다(2026-08-28 phase 33 step 4에서 실측). |
| `rulepack-territory-clean` | `src/lib/import/stb/`의 **비테스트 `.ts`** 각각에 `grep -Hn -e 定着 -e 重ね継手 -e 折曲 -e かぶり -e depth_cover -e anchorage -e cut_off -e center_ -e StbSec -e StbApply <파일>` 이 전부 0건이고, **그리고** `scope-guard.test.ts`가 그 열 문자열을 **여전히 전부** 금지어로 선언하고 있다. 하나라도 어긋나면 **`refuted`**(가드를 비우는 우회이거나 ADR-002·ADR-044 결정 5를 이미 넘은 것이다). |

## 기록 항목 (반증 아님 — 뒤 스텝의 AC가 된다)
1. `PLAN_APPLY_REFUSALS`·`ELEVATION_APPLY_REFUSALS`의 **전 값**과 선언 위치(파일:행). step 2가 새 사유 코드를 지을 때 기존 어휘와 충돌·중복하지 않게 하는 근거다.
2. `PlanImport.tsx`가 ① 스토어에 쓸 때 `updateProject`를 쓰는지 `loadProject`를 쓰는지(파일:행) ② 거부를 보여준 뒤에만 「버리고 진행」을 내는 흐름의 state 이름과 `data-testid` ③ 반영 결과(성공·거부)를 어떤 마크업으로 보여주는지. **step 3은 여기 적힌 것을 그대로 따른다.**
3. **`tests/fixtures/stb-import/synthetic/mini-utf8.stb`의 좌표 실측.** 각 `StbParallelAxes`의 `group_name`·`angle`, 각 `StbParallelAxis`의 `id`·`name`·`distance`와 그 `StbNodeIdList`가 가리키는 노드들의 `X`·`Y`·`Z`를 전부 표로 적어라. 그리고 다음을 판정해 `mini_fixture`에 적어라 — **각 축의 `distance`가 그 축이 가리키는 노드 좌표(angle 0 그룹이면 `Y`, 270 그룹이면 `X`)와 1mm 이내로 맞는가.** 맞지 않는 축이 있으면 `defect_present: true`와 함께 **각 노드가 어떤 값이어야 하는지**(`X`/`Y`/`Z` 각각)를 `should_be`에 적어라. 6 노드가 **한 층 평면의 격자점**이라는 전제에서 유도하라 — 지어내지 말고, 유도가 안 되면 `defect_present: "unclear"`로 적고 무엇이 모자란지 쓰라.
4. `tests/fixtures/stb-import/document/mini.json`과 `expected/mini.json`에서 기록 항목 3의 수정에 따라 바뀔 칸의 **현재값**(경로와 값). `expected/mini.json`의 `issues` 현재값과 `_derivedFrom` 현재값도 그대로 적어라.
5. `scripts/stb/make-sjis-fixture.py`와 `scripts/stb/extract-stb-document.mjs`의 **호출 방법**(인자·출력 경로)을 실제로 파일을 읽어 적어라. step 1이 픽스처를 재생성할 때 쓴다.
6. `src/locales/ja.json`·`ko.json`의 `stbImport.` 로 시작하는 키 전 목록과, 그것이 `STB_ISSUES`(`src/lib/import/stb/types.ts`)와 1:1인지. 그리고 두 로케일의 키 집합이 같은지. 로케일 키 누락을 잡는 테스트가 있으면 그 파일:행도 적어라.
7. `src/components/plan/PlanImport.tsx`·`src/components/section/SectionImport.tsx`의 **파일 입력 방식** — `<input type="file">`의 `accept`, `data-testid`, 그리고 테스트가 파일을 주입하는 방법(prop 주입인지 `File` 객체인지). step 3의 테스트 가능성이 여기 달려 있다.
8. `tests/e2e/uc22-plan-import.js`의 구조 — 첫 20행과 마지막 10행을 그대로 인용하고, 파일을 화면에 넣는 방법이 있으면 그 부분을 적어라. step 4의 `uc23`이 이 형식을 따른다.
9. `src/app/page.tsx`의 `AppShell` 슬롯 이름 전부와 `planActions`에 지금 들어 있는 것.
10. `docs/MILESTONES.md`의 **트랙 항목 한 줄**의 형식(`- [ ] **도면 인식(로컬)** — …`)과 `CLAUDE.md` 마일스톤 표의 행 형식, `AGENTS.md`가 `CLAUDE.md`와 어떻게 동기화되는지(`tests/docs/guardrail-sync.test.ts`를 읽고 적어라). 그리고 `docs/RISKS.md`에서 **가장 큰 R 번호**.
11. 현재 전체 테스트 수 — `npm run test` 의 파일 수·테스트 수(step 6이 증감을 대조한다).

## 산출물
`phases/34-stbridge-apply/step0-report.json` — 뼈대는 이렇다. 값이 없으면 키를 지우지 말고 `null`과 `note`로 적어라.

```json
{
  "verdict": "upheld|refuted",
  "premises": [{"id":"", "verdict":"upheld|refuted", "evidence":"", "note":""}],
  "refusal_vocab": {"plan": [], "elevation": [], "declared_at": ""},
  "plan_import_ui": {"store_write":"", "store_write_at":"", "discard_flow":"", "testids":[], "result_markup":""},
  "mini_fixture": {"axes":[], "nodes":[], "defect_present": null, "should_be": []},
  "mini_expected_cells": {"document":[], "expected":[], "issues_now":[], "derived_from_now":""},
  "fixture_scripts": {"make_sjis":"", "extract_document":""},
  "locale_keys": {"ja":[], "ko":[], "matches_STB_ISSUES": null, "guard_test":""},
  "file_input": {"plan":"", "section":"", "test_injection":""},
  "e2e_shape": {"head":"", "tail":"", "file_injection":""},
  "app_shell": {"slots":[], "plan_actions":[]},
  "ledgers": {"milestones_line_form":"", "claude_table_row_form":"", "agents_sync":"", "max_risk_number":""},
  "test_counts": {"files": 0, "tests": 0}
}
```

## 완료 조건
- 전제 6건 각각에 `upheld`/`refuted`와 **증거**(파일:행, 명령과 그 출력, 대조한 두 값)가 있다. 「확인했다」는 증거가 아니다.
- 기록 항목 11개가 전부 채워졌다.
- `refuted`가 하나라도 있으면 step status를 **`refuted`**로 두고 `summary`에 반증된 id와 무엇이 어긋났는지 적어라. **고치지 마라.** 게이트이므로 뒤 스텝은 돌지 않는다.
- 전부 `upheld`면 `completed`.

## 금지
- 대상 코드를 고치지 마라. `docs/`도 고치지 마라(ADR-044 포함).
- 픽스처를 고치지 마라 — 기록 항목 3은 **관찰**이고 수정은 step 1이다.
- `.stb` 원본·XSD를 커밋하지 마라.
- 전제에 없는 것으로 `refuted`를 내지 마라. 그건 `note`다.
