# Step 0: `MIDPOINT_TOLERANCE_PT` 주석의 A를 현재 파서 기준으로 갱신하라

## 배경

phase 42 step 3(검증 게이트)이 항목 1을 반증했다 —
`src/lib/import/framing-plan/parse.ts`의 `MIDPOINT_TOLERANCE_PT` 주석은
「36면의 반환 격자·블록에서 실측한 채택 이탈 최댓값 A는 10.379846pt(saiki-p2 …)」라고
**현재형**으로 적혀 있는데, 그 `saiki-p2` 후보는 같은 phase의 step 1이 `縮尺範囲外`로
후보에서 뺐다. 즉 주석이 가리키는 스팬은 현재 파서가 더는 반환하지 않는다.
검증자가 현재 파서로 다시 잰 A는 **7.685713pt**(`shibata-p13`, X `1–5`, 「41,000」, 206스팬)다.
근거: `phases/42-plan-grid-soundness/step3-report.json#/items/0/evidence`.

B(0.018265pt)와 合計 미확인 B(6.180000pt)는 현재 파서에서도 같다. sweep 수치도 그대로다.

## 할 일

1. **A를 네가 다시 재라.** step 3의 값을 믿지 말고, 현재 파서로 36면을 돌려
   반환된 격자·블록의 축 열에서 채택 이탈 최댓값을 구하라. 출처(면·방향·축 라벨·치수 문자열·
   거리)를 함께 적어라. step 3의 7.685713pt와 다르면 네 값을 쓰고 차이를 적어라.
2. **주석을 고쳐라.** 현재 파서 기준 A를 적고, step 0 시점(208스팬, saiki-p2 제거 전)의
   10.379846pt는 **과거 값임을 명시**한 채 남기거나 지워라 — 남긴다면 「제거 전」이라는
   말이 붙어야 한다. 현재 A의 출처 면 `shibata-p13`이 R15의 **열린 블록 오탐 면**이라는
   사실도 한 줄 적어라 — A가 여전히 의심 면에서 나온다는 뜻이다.
3. `docs/RISKS.md`의 R15에서 A를 적은 문장에 「제거 후 A」를 같은 꼴로 덧붙여라.
   인용은 `phases/43-midpoint-comment-currency/step0-report.json`의 네 재계측 포인터다.

## 하지 말 것

- `MIDPOINT_TOLERANCE_PT`의 **값**을 바꾸지 마라. 파서의 동작을 바꾸지 마라 — 이 스텝의
  코드 변경은 **주석뿐**이다.
- 골든(`tests/fixtures/plan-import/expected/`)·픽스처(`tests/fixtures/section-import/`)·
  테스트를 건드리지 마라.
- 측정용 스크립트를 `src/`·`scripts/`·`tests/`에 남기지 마라. 재현 절차를 report에 적어라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

`step0-report.json`에 다음이 있어야 한다.

- `remeasured`: `{page_count, span_count, A: {value_pt, page, direction, axis_labels, dimension_text},
  matches_step3: true|false}`.
- `comment_update`: `{before, after}` — 주석의 전문.
- `risks_update`: `{before, after}` — R15에서 고친 문장.
- `citations`: 문서·주석에 넣은 수치마다 `{value, source}`. `source`는 report 파일과
  JSON 포인터이고 `python scripts/check-citations.py phases/43-midpoint-comment-currency/step0-report.json`이 0으로 끝난다.
- `git diff --name-only`(이 스텝 직전 커밋 대비)가 `src/lib/import/framing-plan/parse.ts`·
  `docs/RISKS.md`·`phases/43-midpoint-comment-currency/` 안의 경로만 보인다.
- `npx vitest run src/lib/import/framing-plan/parse.test.ts tests/plan-import`·`npm run lint`가 0으로 끝난다.

## 기록 규칙

- 읽으려고 존재를 확인한 경로는 `paths_verified`에, 「없어야 한다」가 결론인 경로는
  `paths_expected_absent`에 넣어라. 둘을 섞지 마라.
- 검증 명령의 인자에 한글·일본어를 넣지 마라. Windows 셸에서 `?`로 깨진다.
