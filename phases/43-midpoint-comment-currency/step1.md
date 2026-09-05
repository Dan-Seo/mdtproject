# Step 1 (검증 전용): step 0을 반증하라

너는 검증자다. **대상을 고치지 마라.** 어긋나면 그대로 두고 무엇이 어긋났는지 적어라.

아래 각 항목은 **성립해야 할 성질**이다. 항목마다 `{id, holds, method, evidence}`를
`step1-report.json`에 적어라. 하나라도 성립하지 않으면 `verdict`를 `refuted`로 두고
종결하라. 전부 성립하면 `upheld`다.

## 1. 주석의 A가 현재 파서의 A다

step 0의 값을 믿지 말고 **네가 직접** 현재 파서로 36면을 돌려 반환 격자·블록의 축 열에서
채택 이탈 최댓값을 재라. 주석에 현재형으로 적힌 A(소수 6자리)와 네 값이 같고, 출처 면·축·
치수 문자열도 같다. 주석에 과거 값(10.379846pt)이 남아 있다면 그 문장에 「제거 전」에
해당하는 표시가 있고 그 값이 `phases/42-plan-grid-soundness/step0-report.json#/midpoint_margin/accepted_max/value_pt`와 같다.

## 2. 문서의 수치가 근거에 닿는다

- 주석과 R15에 적힌 수치 각각에 대해 step 0 report의 `citations` 포인터가 **해석되고**
  값이 같은지 건별로 대조하고 개수를 적어라.
- `python scripts/check-citations.py phases/43-midpoint-comment-currency/step*-report.json`이 0.

## 3. 파서의 동작이 그대로다

이 phase 직전 커밋의 파서와 현재 파서를 각각 36면
(`tests/fixtures/section-import/textitems/*.json`)에 돌려, 면별 `grids`·`blocks`·`issues`의
직렬화가 **36면 전부** 같다. 서로 다른 면이 하나라도 있으면 그 면과 차이를 적어라.

## 4. 바뀐 경로가 허용 집합에 든다

`git diff --name-only <phase 직전 커밋>`의 각 경로가 `phases/`,
`src/lib/import/framing-plan/parse.ts`, `docs/RISKS.md` 중 하나에 **든다**.
하네스가 스텝이 도는 동안 스스로 쓰는 `phases/43-midpoint-comment-currency/index.json`·
`step*-invoke.json`·`step*-codex.*.log`는 네가 쓴 것이 아니므로 대조 대상이 아니다.
비우거나 되돌리려 하지 마라.

## 5. 전 게이트

`npx vitest run`·`npm run lint`·`npx tsc --noEmit`·`npm run build`가 전부 0으로 끝난다.
빌드 전에 `next dev`가 떠 있지 않은지 확인하라.

## 기록 규칙

- 읽으려고 존재를 확인한 경로는 `paths_verified`에, 「없어야 한다」가 결론인 경로는
  `paths_expected_absent`에 넣어라. 둘을 섞지 마라.
- 검증 명령의 인자에 한글·일본어를 넣지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.
