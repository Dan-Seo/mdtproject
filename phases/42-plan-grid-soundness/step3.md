# Step 3 (검증 전용): 이 phase를 반증하라

너는 검증자다. **대상을 고치지 마라.** 어긋나는 것을 찾으면 그대로 두고 무엇이
어긋났는지 적어라. 고치기 시작하면 만든 쪽이 자기 것을 승인하는 것이 되어 교차가 무너진다.

아래 각 항목은 **성립해야 할 성질**이다. 항목마다 `{id, holds, method, evidence}`를
`step3-report.json`에 적어라. 하나라도 성립하지 않으면 `verdict`를 `refuted`로 두고
종결하라. 전부 성립하면 `upheld`다.

## 1. 여백 실측이 재현된다

step 0의 보고를 믿지 말고 **네가 직접** 36면에서 두 수를 다시 재라.

- 채택 이탈 최댓값 A와 경쟁 이탈 최솟값 B를 네 방법으로 구하고, step 0이 보고한 값과
  같은지 보여라. 다르면 네 값을 쓰고 차이를 적어라.
- `A ≤ 15 < B`라는 판정이 네 값에서도 같은 결론인지 보여라.
- step 0이 갱신한 `MIDPOINT_TOLERANCE_PT` 주석의 숫자가 네가 잰 값과 일치한다.

## 2. 두 성질이 반증 가능하다

step 1의 실측을 믿지 말고 **네가 직접** 무력화하고 원복하라.

- P1(축 좌표 상이)의 검사를 임시로 무력화하면 그 유닛 테스트가 실패하고, 원복하면 통과한다.
- P2(축척 범위)의 검사를 임시로 무력화하면 그 유닛 테스트가 실패하고, 원복하면 통과한다.
- 각 변조가 끝난 뒤 **네가 변조한 그 파일**이 변조 직전 바이트와 같음을 sha256으로 보여라.
  하네스가 스텝이 도는 동안 스스로 쓰는
  `phases/42-plan-grid-soundness/index.json`·`step*-invoke.json`·`step*-codex.*.log`는
  네가 쓴 것이 아니므로 이 대조의 대상이 아니다. 그것을 비우거나 되돌리려 하지 마라.

## 3. 바뀐 것이 두 열뿐이다

- 이 phase 직전 커밋의 파서와 현재 파서를 각각 36면에 돌려 격자 후보 전체를 비교하고,
  값이 달라진 후보가 **정확히 두 개**임을 보여라 —
  `fuji-p20`의 X 열과 `saiki-p2`의 X 열이 후보에서 빠진 것.
- 나머지 후보 전부에 대해 방향·라벨·스팬·`totalConfirmed`가 같다.
- 36면의 블록이 전부 같다 — 면별 블록 수와 각 블록의 부호 배치 수.

## 4. 골든과 픽스처가 그대로다

`tests/fixtures/plan-import/expected/`와 `tests/fixtures/section-import/`의 각 파일이
이 phase 직전 커밋과 sha256이 같다. 이 둘은 사람이 도면을 읽어 전사한 것이고
파서 출력으로 유도하지 않는다 (ADR-010).

## 5. 문서의 수치가 근거에 닿는다

- step 2가 문서에 넣은 수치 각각에 대해, 인용한 report 포인터가 **해석되고**
  그 값이 문서의 값과 같은지 건별로 대조하고 개수를 적어라.
- `python scripts/check-citations.py phases/42-plan-grid-soundness/step*-report.json`이 0.
- `AGENTS.md`와 `CLAUDE.md`에 같은 표가 있다면 두 파일의 그 표가 서로 같다.

## 6. 열린 것이 열린 채로 있다

`docs/RISKS.md`에 다음이 **열린 항목으로 실재**함을 인용해 보여라.

- 블록 오탐 세 면(`ina-p7`·`shibata-p13`·`karatsu-jikugumi2`)과
  반증된 후보 규칙 ①②(제목 게이트·무제목 블록 폐기).
- R10의 미전사 항목(壁·スラブ·shibata 大梁·柱リスト)과 2段筋·特記 기본값·
  스케치 주기형 柱リスト.

## 7. 이 phase에서 바뀐 경로가 허용 집합에 든다

`git diff --name-only <phase 직전 커밋>`으로 전체를 뽑아, 각 경로가 다음에 **든다**는 것을
보여라 — `phases/`, `src/lib/import/framing-plan/`, `src/locales/ja.json`,
`src/locales/ko.json`, `docs/RISKS.md`, `docs/MILESTONES.md`, `CLAUDE.md`, `AGENTS.md`.

## 8. 전 게이트

`npx vitest run`·`npm run lint`·`npx tsc --noEmit`·`npm run build`가 전부 0으로 끝난다.
빌드 전에 `next dev`가 떠 있지 않은지 확인하라 — 떠 있으면 `.next`가 덮여 다음 e2e가 깨진다.

## 기록 규칙

- 읽으려고 존재를 확인한 경로는 `paths_verified`에 넣어라(존재해야 하는 쪽).
- 「없어야 한다」가 결론인 경로는 `paths_expected_absent`에 넣어라(없어야 하는 쪽).
  둘을 한 배열에 섞지 마라.
- 검증 명령의 인자에 한글·일본어를 넣지 마라. 셸에서 `?`로 깨져 명령이 죽거나
  0건 매칭이 「통과」로 보인다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.
