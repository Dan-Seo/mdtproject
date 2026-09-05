# Step 2 (검증 전용): 이 phase를 반증하라

> **재실행 메모.** 이 스텝은 한 번 `refuted`로 끝났고 그 기록은
> `step2-report.attempt1.json`에 보존돼 있다. 반증 두 건(F1·F2)은 **이 사양의 결함**이었다 —
> 2항이 허용 경로에서 `CLAUDE.md`를 빠뜨렸고, 4항이 하네스가 스스로 쓰는 파일까지
> 「깨끗해야 한다」고 요구했다. 검증자의 판단은 옳았다. 두 항을 아래처럼 고쳤으니
> 처음부터 다시 검증하라.

너는 검증자다. **대상을 고치지 마라.** 어긋나는 것을 찾으면 그대로 두고 무엇이 어긋났는지
적어라. 고치기 시작하면 만든 쪽이 자기 것을 승인하는 것이 되어 교차가 무너진다.

아래 각 항목은 **성립해야 할 성질**이다. 항목마다
`{id, holds, method, evidence}`를 `step2-report.json`에 적어라.
하나라도 성립하지 않으면 `verdict`를 `refuted`로 두고 종결하라.
전부 성립하면 `upheld`다.

## 1. 복원은 로그 원문과 바이트가 같다

step0의 `restorations` 각 건에 대해, **step0-report.json의 값을 믿지 말고**
지목된 `step{N}-codex.stdout.log`를 직접 열어 원문을 다시 뽑아라.

- 복원된 필드 값이 로그의 원문과 문자열로 동일하다.
- 그 원문의 비ASCII 문자를 각각 `?` 한 글자로 바꾸면 `stored_before`와 동일하다.
- 이 두 대조를 건별로 독립 수행한 수치를 적어라(`checked`, `matched`).

## 2. 복원 외에는 아무것도 바뀌지 않았다

- 복원 대상 파일 각각에 대해, 이 phase 이전 커밋의 사본과 현재 사본을 **파싱해 비교**하고
  값이 다른 JSON 포인터의 집합이 `restorations`의 포인터 집합과 **정확히 일치**함을 보여라.
- 이 phase에서 바뀐 경로 전체를 `git diff --name-only <phase 직전 커밋>`으로 뽑아,
  각 경로가 다음 집합에 **든다**는 것을 보여라 —
  `phases/`, `scripts/check-citations.py`, `AGENTS.md`, `CLAUDE.md`.
  (`AGENTS.md`와 `CLAUDE.md`의 「개발 프로세스」 절은 서로 거울이다. 가드레일 한 줄은
  두 파일 모두에 있어야 하고, 한쪽에만 있으면 그것이 반증이다.)

## 3. 남은 `?`는 전부 설명된다

`phases/*/step*-report*.json`을 직접 다시 훑어라(step0의 결과를 재사용하지 마라).
남아 있는 `?` 2연속 이상 각 건이 다음 둘 중 하나임을 건별로 보여라.

- 기록된 셸 입출력 안이거나 원문에 실재하는 `?`다.
- step0-report.json의 `unrecoverable`에 이유와 함께 선언돼 있다.

두 분류 어디에도 들지 않는 건이 있으면 그것이 반증이다.

## 4. 새 검사는 반증 가능하다

step1의 실측을 믿지 말고 **네가 직접** 변조하고 원복하라.

- `paths_verified`의 어느 항목을 실재하지 않는 경로로 바꾸면 비영, 원복하면 0.
- 실재하는 경로를 `paths_expected_absent`·`fabricated_paths`에 넣으면 비영, 원복하면 0.
- `exists: false` 항목을 실재하는 경로로 바꾸면 비영, 원복하면 0.
- 각 변조가 끝난 뒤 **네가 변조한 그 파일**이 변조 직전 바이트와 동일함을 sha256으로 보여라.
  하네스가 스텝이 도는 동안 스스로 쓰는
  `phases/41-report-record-integrity/index.json`·`step*-invoke.json`·`step*-codex.*.log`는
  네가 쓴 것이 아니므로 이 대조의 대상이 아니다. 그것을 비우거나 되돌리려 하지 마라.

## 5. 옛 검사가 그대로 산다

- `python scripts/check-citations.py phases/40-citation-integrity/step*-report.json`이 0.
- `python scripts/check-citations.py phases/39-axis-claim/step*-report.json`이 비영이고,
  잡히는 `source` 실패 건수를 적어라. phase 39의 report는 보존된 반증 근거다 — 고치지 마라.
- `python scripts/check-citations.py phases/41-report-record-integrity/step*-report.json`이 0.
  (네 자신의 report의 `source`도 해석돼야 한다.)

## 6. 가드레일 문장이 실재한다

`AGENTS.md`에 더해진 항목을 인용하고, 그 항목이 인용한
`phases/39-axis-claim/step4-report.json#/mutation_census_note`가 **해석되는지**
직접 확인해 값을 실어라.

## 7. 전 게이트

`npx vitest run`·`npm run lint`·`npx tsc --noEmit`·`npm run build`가 전부 0으로 끝난다.
빌드 전에 `next dev`가 떠 있지 않은지 확인하라 — 떠 있으면 `.next`가 덮여 다음 e2e가 깨진다.

## 기록 규칙

- 읽으려고 존재를 확인한 경로는 `paths_verified`에 넣어라(존재해야 하는 쪽).
- 「없어야 한다」가 결론인 경로는 `paths_expected_absent`에 넣어라(없어야 하는 쪽).
  둘을 한 배열에 섞지 마라.
- 검증 명령의 인자에 한글·일본어를 넣지 마라. 셸에서 `?`로 깨져 명령이 죽거나
  0건 매칭이 「통과」로 보인다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.
