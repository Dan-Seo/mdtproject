# Step 4 (검증 게이트): 이 phase의 산출물을 반증하라

## 규칙

- 변조 대상은 `ls`의 실제 출력에서 고르고, 각 경로에 `test -f`를 실행해 결과를 실어라.
  **경로를 짓지 마라.**
- 변조는 한 번에 한 칸, 검사 뒤 즉시 원복. 원복 확인은 `git diff --stat -- tests/ src/ docs/`가 빈 출력임으로 한다.
- report가 쓰는 **모든 `#/...` 포인터를 직접 해석**해 `pointers_verified`에 적어라.
  하나라도 실패하면 `refuted`다.

## 반증할 항목

1. **`comment_clean`** — `elevation.ts`의 `SHORT_DIMENSION_SCALE_TOLERANCE_RATIO`
   주석에 남은 모든 숫자가 인용 report에 실재하는가. **`150`과 `20`이 남아 있으면
   `holds: false`.** 숫자마다 `grep -nF` 원문을 실어라.
2. **`src_comment_only`** — `git diff main...HEAD -- src/`의 `+`/`-` 줄이 전부
   주석·공백인가. 실행 코드가 바뀌었으면 방침 위반이다.
3. **`p22_crosscheck_bites`** — `tsu-kanritou-p22-elevation.json`의 axis 값과
   `tsu-kanritou-p16-grid.json`의 `y` 값을 각각 한 칸 변조했을 때 상호검증이 실패하는가.
   양쪽 다 확인하라(한쪽만이면 항진명제일 수 있다).
4. **`axis_all_claimed`** — elevation 골든의 `elevations[].axis` **모든 값 칸**을
   하나씩 변조하면 테스트가 실패하는가. `spansMm[i]+1`, `labels[i]` 삭제,
   `totalMm+1`(null 아닌 것)을 전부 돌려 `attempted`/`detected`를 세라.
   **하나라도 통과하면 `holds: false`.** Claude 사전 실측: axis 블록 **26개**,
   자기 정합성이 눈먼 라벨 치환 변조 **375건 중 375건 검출**.
5. **`no_untranscribed_axis`** — `axis` 없는 elevation 항목이 0개이고, 그 수를
   고정한 테스트가 **1로 바꾸면 실패**하는가.
6. **`docs_pointers_resolve`** — `docs/RISKS.md`·`CLAUDE.md`·`AGENTS.md`가
   이 phase에서 쓴 인용, 그리고 step 2의 `numbers_used`의 모든 `source`가
   파일 존재와 포인터 해석 **둘 다** 통과하는가.
7. **`checker_works`** — `scripts/check-citations.py`가 (a) 정상 report에서 0으로 끝나고
   (b) 없는 포인터를 심으면 비영으로 끝나는가. 직접 실행해 종료코드를 실어라.
8. **`no_golden_edits_by_codex`** — 이 phase에서 `tests/fixtures/**` 변경이 **0건**인가.
   (전사는 phase 40 시작 전 커밋 `03bb3d8`이다.)
   `git diff --stat` 범위를 명시해 실어라.
9. **`full_gates`** — `npx vitest run`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`의 종료코드. build 전에 `next dev`가 떠 있지 않은지 확인하라.

## 하지 말 것

- **고치지 마라.** 어긋나면 `refuted`로 종결하고 무엇이 어긋났는지 적어라.
- 존재하지 않는 경로·포인터를 report에 적지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step4-report.json`에 `verdict`, `items`(1〜9), `paths_verified`,
`pointers_verified`, `restoration.git_diff_stat_after_restore`(빈 문자열),
`mutation_census`(`attempted`/`detected`, 그리고 **유효하지 않은 시도는 따로 세어
`invalid_attempts`에** 적어라 — 검출로 세지 마라).

하나라도 `holds: false`면 `refuted`로 종결하라.
