# Step 4 (검증 게이트): 이 phase의 산출물을 반증하라

## 배경

phase 38 step 6은 **판정은 맞았으나 근거가 무효**였다 — 변조했다고 적은 세 경로가
레포에 존재하지 않았다. 없는 파일을 고치고 「테스트가 통과했다」고 하면 그 관측은
아무것도 증명하지 못한다. 이 스텝은 같은 실수를 원천 차단한다.

## 규칙 (어기면 그 자체가 `refuted`다)

- **변조 대상은 실재를 먼저 확인하고 고른다.** 파일 경로를 짓지 마라.
  `ls tests/fixtures/plan-import/expected/`의 실제 출력에서 고르고, 각 경로에 대해
  `test -f "<경로>" && echo EXISTS` 결과를 report에 그대로 실어라.
- 변조는 **한 번에 한 칸**, 검사 뒤 **즉시 원복**한다.
- 원복 확인은 `git diff --stat -- tests/ src/`가 **빈 출력**임으로 한다.

## 반증할 항목

1. **`axis_claimed`** — `tests/fixtures/plan-import/expected/` 아래 elevation 골든의
   `elevations[].axis` **모든 값 칸**을 하나씩 변조하면 테스트가 실패하는가.
   - `spansMm[i] += 1` (전 칸)
   - `labels[i]` 삭제 (전 칸)
   - `totalMm`이 `null`이 아니면 `+= 1`
   변조 총수와 그중 「실패했다」 수를 세라. **하나라도 통과하면 `holds: false`다.**
   참고: Claude의 사전 실측은 스팬·라벨 변조 **85건 중 85건 검출**이다. 수가 다르면
   그 차이를 적어라(골든이 늘었거나 규칙이 다르다는 뜻이다).
2. **`crosscheck_not_tautological`** — step 1의 상호검증이 **한쪽 파일만 읽고 자기와
   비교하는** 항진명제가 아님을 보여라. 대응 grid 골든
   (`hirosaki-kikyono-p21-grid.json`·`tsu-kanritou-p16-grid.json`·`karatsu-fukuzu-p1-grid.json`)
   의 축 값을 한 칸 변조했을 때도 상호검증 테스트가 실패해야 한다. 세 파일 각각 확인하라.
3. **`key_guard_works`** — step 2의 키 가드가 (a) 새 키를 넣으면 실패하고,
   (b) `CLAIMED`에서 한 줄을 지우면 실패하는가.
4. **`no_parser_growth`** — `src/lib/import/framing-plan/elevation.ts`에
   `axis`·`spansMm`가 여전히 **0건**인가(`rg -n`의 원문 출력을 실어라).
   파서가 자라 있으면 방침 위반이다. 그리고 이 phase의 `src/` 변경이
   **주석뿐**인가 — `git diff main...HEAD -- src/`에서 `+`/`-` 줄이 전부
   주석·공백인지 확인하고 원문을 실어라. 실행 코드가 바뀌었으면 방침 위반이다.
5. **`no_golden_edits`** — 이 phase의 브랜치에서 `tests/fixtures/**`에 대한 변경이
   **Claude의 tsu 라벨 수정 한 건뿐**인가. `git log --oneline -- tests/fixtures`와
   `git diff main...HEAD --stat -- tests/fixtures`를 실어라. codex가 골든을 고쳤으면 위반이다.
6. **`tests_are_not_fitted`** — 새 테스트가 파서 출력이나 골든 한쪽에 맞춰 재배치된 것이
   아닌지 확인하라. `rg -n "toHaveLength\(" tests/plan-import/` 출력과, 새 테스트가
   기대값 리터럴을 박고 있지 않은지(`rg -n "[0-9]{4,}" <새 테스트 파일>`)를 실어라.
7. **`docs_numbers_sourced`** — step 3이 문서에 쓴 숫자가 전부 `numbers_used`에 있고
   그 `source` 경로가 전부 실재하는가. 하나라도 없는 경로면 `holds: false`.
8. **`full_gates`** — `npx vitest run` 전체, `npm run lint`, `npx tsc --noEmit`,
   `npm run build` 각각의 종료 코드. **`npm run build` 전에 `next dev`가 떠 있지 않은지
   확인하라**(둘이 같은 `.next`를 쓴다).

9. **`comment_numbers_measured`** (F1) — `elevation.ts`의
   `SHORT_DIMENSION_SCALE_TOLERANCE_RATIO` 주석에 남은 **모든 숫자**가
   `phases/38-elevation-close/step3-report.json`에 실재하는가.
   주석의 숫자를 하나씩 뽑아 그 report에서 `grep`하고, 찾은 키 경로를 함께 적어라.
   report에 없는 숫자가 하나라도 남아 있으면 `holds: false`다.
   특히 **`20`이 주석에 남아 있으면 `holds: false`**다.
10. **`position_map_explicit`** (F2) — `tests/section-import/parse.test.ts`의
   位置 → 本数 대응이 명시적인가. 표에 없는 位置를 넣으면 테스트가 **실패**하는지
   실측하라: `ojkk-akamichi-p4-walls-slabs.json`의 CB1 항목 `上端筋`에
   임시로 `"__unknown": "9-D25"`를 넣고 실행한 종료 코드를 적고 원복하라.
   조용히 통과하면 `holds: false`다.
   그리고 CB1의 `先端` 값을 `2-D25` → `3-D25`로 임시 변조했을 때의 거동을 적어라
   (대조 대상이면 실패해야 하고, 대조 대상 아님으로 명시했다면 통과가 맞다 —
   어느 쪽인지 `method`에 분명히 쓰고 원복하라).

## 하지 말 것

- **고치지 마라.** 어긋나면 `refuted`로 종결하고 무엇이 어긋났는지 적어라.
  고치면 검증자가 다시 구현자가 되어 교차가 무너진다.
- 존재하지 않는 경로를 report에 적지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step4-report.json`에:

- `verdict`: `"not_refuted"` 또는 `"refuted"`
- `items`: 1〜10 각각 `{ "id", "holds", "method", "evidence" }`
- `paths_verified`: 인용한 모든 경로와 존재 여부. **false가 하나라도 있으면 `refuted`.**
- `restoration`: `{ "git_diff_stat_after_restore": "" }` — 빈 문자열이어야 한다.
- `mutation_census`: `{ "attempted": N, "detected": N }` (1항·2항 합산)

하나라도 `holds: false`면 `refuted`로 종결하라.
