# Step 1: 합성 픽스처의 節点 좌표 결함을 고친다 (파서가 아니라 픽스처가 틀렸다)

**전제**: step 0이 `completed`이고 `step0-report.json`의 `mini_fixture.defect_present`가 `true`다.

**`defect_present`가 `false`거나 `"unclear"`면 이 스텝은 파일을 하나도 고치지 마라.** status를 `blocked`로 두고 `blocked_reason`에 step 0이 무엇을 관찰했는지 적어라. 결함이 없는데 픽스처를 고치는 것은 기대값을 구현에 맞추는 것이고, 그것이 골든테스트를 죽이는 방식이다.

## 배경
`tests/fixtures/stb-import/synthetic/mini-utf8.stb`는 이 코퍼스에서 **유일한 합성 픽스처**이자 「바이트에서 후보까지」 전 구간이 깨끗하게 도는 것을 보이는 최소 케이스다. 그런데 지금 이 파일은 `通り芯位置と節点の不一致`를 낸다 — 즉 최소 케이스가 깨끗하지 않다.

**파서는 옳다.** 축의 `distance`와 그 축이 가리키는 節点의 좌표가 실제로 어긋나 있고, 파서는 그것을 정확히 발화했다. 틀린 것은 픽스처다. 이 스텝은 **픽스처를 원래 의도한 형상으로 되돌리는 것**이지 파서를 바꾸는 것이 아니다.

## 할 일
1. `tests/fixtures/stb-import/synthetic/mini-utf8.stb`의 `StbNode` 좌표를 `step0-report.json`의 `mini_fixture.should_be`에 적힌 값으로 고쳐라. **`should_be`에 없는 것은 손대지 마라** — 축·階·`project_name`·요소 순서·들여쓰기·XML 선언을 그대로 둔다. 바꾸는 것은 `StbNode`의 좌표 속성뿐이다.
2. `tests/fixtures/stb-import/synthetic/mini-sjis.stb`를 `step0-report.json`의 `fixture_scripts.make_sjis`에 적힌 방법으로 **재생성**하라. 손으로 고치지 마라(인코딩이 깨진다).
3. `tests/fixtures/stb-import/document/mini.json`을 `fixture_scripts.extract_document`에 적힌 방법으로 **재생성**하라.
4. `tests/fixtures/stb-import/expected/mini.json`은 **재생성하지 말고 손으로 고쳐라.** 기대값을 파서 출력으로 만들면 그 파일은 더 이상 기대값이 아니다.
   - `issues`에서 `通り芯位置と節点の不一致`를 뺀다. 다른 issue가 있으면 빼지 마라.
   - `_derivedFrom`을 `"phases/34-stbridge-apply/step0-report.json"`으로 고친다 — 이 픽스처의 근거는 이제 phase 34 step 0의 좌표 실측이다.
   - `grids`·`stories`는 손대지 마라. 이 수정은 節点 좌표만 바꾸므로 그리드도 階도 변하지 않는다. **바뀐다면 무언가 잘못 고친 것이다.**

## 완료 조건 (AC)
1. `mini-utf8.stb`를 통과한 후보의 `issues`가 **`[]`**이고 `grids`·`stories`가 수정 전과 **완전히 같다**.
2. `document/mini.json`의 `nodes`가 `mini_fixture.should_be`와 전 칸 일치한다.
3. `mini-sjis.stb`가 여전히 CP932 바이트이고 UTF-8 판과 **같은 후보**를 낸다(기존 테스트가 이미 이것을 요구한다 — 그 테스트를 고치지 마라).
4. **`通り芯位置と節点の不一致`가 여전히 반증 가능하다.** 이 코드를 요구하는 곳이 셋 있다 — `src/lib/import/stb/candidates.test.ts`의 단위 케이스와 `tests/fixtures/stb-import/expected/diffchecker-filea.json`(실물)이다. **이 셋 중 어느 것도 지우거나 약화시키지 마라.** 보고서에 「수정 뒤에도 이 코드를 요구하는 단언이 몇 건 남았는가」를 실제 grep 결과로 적어라. 0건이면 그 자체가 결함이다.
5. `npx tsc --noEmit`·`npm run lint`·`npm run test` 전부 통과.

## 금지
- `src/lib/import/stb/` 아래의 **어느 파일도 고치지 마라.** 이 스텝은 픽스처만 만진다. 파서를 고쳐야 AC가 맞는다면 그건 step 0의 판정이 틀렸다는 뜻이니 `blocked`로 멈추고 그 사실을 적어라.
- `expected/diffchecker-filea.json`·`dotnet-sample1.json`·`hoaryfox-sample.json`·`diffchecker-mini210.json`을 손대지 마라.
- 새 픽스처를 만들지 마라.
- `STB_ISSUES`에서 코드를 빼지 마라.
