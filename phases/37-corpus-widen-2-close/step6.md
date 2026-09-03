# Step 6: 기록을 갱신하라 — 발주처 3→10, R10·R15, ADR 추기

## 배경

phase 36의 docs 스텝(step 6)은 step 5 게이트가 `refuted`로 끝나 돌지 않았다. Claude의
재대조(`phases/36-corpus-widen-2/step5-adjudication.json`)가 반증 불성립으로 판정했고
phase 37 step 0이 그 판정을 반증하지 못했고, step 2〜4의 수정을 step 5가 반증하지 못했다(step 5가 `completed`일 때만 이 스텝이 돈다).
수치는 전부 아래 파일의 **실측**에서 가져오라 — 기억이나 사양의 예상치가 아니다:

- `phases/36-corpus-widen-2/step0-report.json` … `step5-report.json`
- `phases/36-corpus-widen-2/step5-adjudication.json`
- `phases/37-corpus-widen-2-close/step0-report.json` … `step5-report.json`
- `tests/fixtures/section-import/SOURCES.md`(발주처·면 수)

## 할 일

1. `docs/RISKS.md`
   - **R10**: 2차 코퍼스 결과 — 골든 몇 면 중 몇 면 통과(격자·階高·リスト 각각), 남은
     실패·미전사(壁·スラブ·shibata 大梁 등)·미지원(2段筋 본수, 特記 기본값, 스케치
     주기형 柱リスト). step 5가 `refuted`였고 재대조로 불성립이 된 경위를 한 문장으로
     적고(반증 방법이 회전 글리프를 못 이었다·ojkk-p4 対象外 12칸은 断面寸法 행과
     일치하는 개선이라 phase 37에서 골든 고정), 판정서 경로를 남겨라. **닫지 마라** —
     발주처 접점(R3)은 여전히 0이고 실패 도면 수집은 사용자 동의가 필요하다.
   - **R15**: step 5 `5_sweep`와 판정서 `5_sweep` — T=4에서 기존 4면 `寸法欠落` 재현,
     T=6·15·30·40의 요구 4면 결과, 2차 코퍼스에서 T=6→15 사이에 늘어난 3면이 伏図가
     아닌 면의 부분 격자 오탐이라는 것(면 이름·페이지 성격), 伏図 골든과 기존 14면은
     T=6에서 동일하다는 것. `alongDistance` 최댓값·경쟁 치수 최솟값은 이번에 재측정하지
     않았으니 「미측정」으로 적어라. 伏図를 가진 발주처가 2→N곳이 된 것을 적되(N은
     SOURCES.md에서 세라) 닫을지는 적지 마라(사람 판단).
2. `docs/MILESTONES.md` 도면 인식 항에 「**끝난 것**(2026-09-03, phase 36·37)」을 기존
   문단과 같은 어투로 추기: pdf.js CMap 결함(브라우저에서 조용히 0건이던 도면 —
   e2e uc12의 fuji 스라브 후보 수는 판정서 `additional_checks.e2e_uc12`), 겹침 글자
   접기(saiki 7겹·0.5pt), 通り芯 라벨 일반화(접두 없는 숫자·문자), 合計 없음·부분합·
   나란한 치수 열 규약(`寸法列曖昧`), 階高의 명시 치수 소구간(150·100), 断面リスト의
   両端·階 행·다부호 셀·축척 제목·피치 표기 변형·断面寸法 행. **만들지 않은 것**:
   2段筋 본수(스키마 결정 대기), 特記 기본값 채움, 스케치 주기형 柱リスト.
   교차검증 경위(step 5 refuted → 재대조 → phase 37 step 0 재반증)도 한 문장.
3. `docs/ADR.md`
   - ADR-018·ADR-030에 「구현 결과(2026-09-03)」를 추기하라 — 새 ADR을 만들지 마라,
     결정이 아니라 결과다. 검증 교훈 한 줄: 원문 대조는 회전 글리프(rot −90)를 같은
     x 열로 이어야 한다.
   - 단, **결정** 둘은 ADR 하나로 묶어 새 번호로 적어라(번호는 `docs/ADR.md`의
     마지막＋1 — 파일을 읽어 확인): ① 2段筋 슬래시 표기는 본수를 내지 않고 raw＋
     `2段筋未対応`으로 남긴다(스키마에 2段을 넣을지는 별도 결정), ② リスト의 빈
     셀은 頭注 「特記なき限り」 기본값으로 채우지 않는다(幅止め筋 表題 읽기(phase 8)와
     다른 점을 적어라 — 그것은 셀이 없는 항목이고 이것은 셀이 비어 있는 항목이다).
     형식은 기존 ADR과 같이 「배경·결정·근거·결과」.
4. `CLAUDE.md`·`AGENTS.md` — 마일스톤 표의 「도면 인식(로컬)」 행과 리스크 표의
   R10·R15 행을 갱신하라. **표의 다른 행과 길이·어투를 맞춰라.** 두 파일의 표는
   같은 내용이어야 한다.
5. `tests/fixtures/section-import/SOURCES.md` 「왜 이 코퍼스인가」에 2차 엣지 케이스를
   한 줄씩 추가하라 — 이미 있는 「제2차 수집 도면의 특성」 절과 중복하지 말고 그
   절을 가리켜라. 표제란 표는 phase 36 step 0이 이미 채웠다 — 확인만.

## 하지 말 것

- `src/**`·`tests/**`(SOURCES.md 제외)를 건드리지 마라.
- report·판정서에 없는 수치를 적지 마라. 없으면 「미측정」이라고 써라.
- R10·R15를 닫지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과(문서만 바뀌었으니 당연히).
- 변경 파일이 `docs/RISKS.md`·`docs/MILESTONES.md`·`docs/ADR.md`·`CLAUDE.md`·`AGENTS.md`·
  `tests/fixtures/section-import/SOURCES.md` 안에 있다.
- CLAUDE.md와 AGENTS.md의 갱신 행이 동일하다(`diff`로 확인).

## 산출물

`phases/37-corpus-widen-2-close/step6-report.json`:

```json
{
  "updated_files": [],
  "adr_added": "ADR-0NN",
  "numbers_used": { "<수치>": "<출처 파일.필드>" },
  "summary": "index.json summary와 같은 요지"
}
```
