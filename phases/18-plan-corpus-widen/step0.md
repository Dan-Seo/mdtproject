# Step 0: 실물 3부의 미추출 페이지 6면을 픽스처로 넣어라

## 배경

textitems 코퍼스는 8부다. `.cache/`의 실물 PDF 3부에는 형상 트랙(伏図·軸組図)과
다음 phase의 壁リスト·スラブリスト 파서가 쓸 페이지가 더 있다. R15의 닫는 조건
(「더 넓은 실도면 코퍼스에서도 여유와 창이 유지되는가」)의 1단계로, 같은 3부
안에서 코퍼스를 넓힌다.

2026-08-26에 3부 전 페이지를 훑은 결과(수치는 pdf.js raw item 수 — `toTextItems`
변환 후에는 2.5~3.8배로 늘어난다):

**추가할 6면:**

| PDF | page | 도면 | raw items | 출력 파일 |
|---|---|---|---|---|
| dwg-yokohama.pdf | 6 | S-C06 基礎伏図・1階床伏図 | 378 | yokohama-p6.json |
| dwg-yokohama.pdf | 9 | S-C09 軸組図(2) — bX1·bX2A·bX3通り | 323 | yokohama-p9.json |
| dwg-yokohama.pdf | 15 | S-C15 スラブリスト・壁リスト | 598 | yokohama-p15.json |
| dwg-ojkk-zumen6.pdf | 4 | 小梁･スラブ･壁･階段リスト | 646 | ojkk-p4.json |
| dwg-kani-kids.pdf | 39 | S-09 梁伏図 | 244 | kani-p39.json |
| dwg-kani-kids.pdf | 41 | S-11 軸組図(2) — Y1·Y2通り | 231 | kani-p41.json |

**빼기로 한 페이지와 이유** — SOURCES.md에 이 목록을 남겨라 (다음 세션이 전수
조사를 다시 하지 않도록):

- yokohama p5 杭伏図・杭リスト: 말뚝은 산정 스코프 밖 부재
- kani p42 (S-12): 軸組図는 p40·p41과 동형이고 나머지는 S造 部材リスト
- kani p44 (S-14): 별동 소도면 여럿이 한 장에 혼재 — 코퍼스 대표성이 낮다
- kani p45–48: 解体撤去図 — 기설 건물의 도면이다
- ojkk p5–7: セルボイドスラブ 시공 표준·배근구분도 — リスト 표가 아니다

## 할 일

1. `scripts/extract-textitems.mjs`의 대상 배열에 6면을 추가하라.
2. 표제란 제외 모서리를 **페이지별로 실측**해
   `tests/fixtures/section-import/title-block-exclusions.json`에 추가하라.
   같은 문서라고 기존 값을 복사만 하지 마라 — SOURCES.md 「표제란 제외」 절의
   절차대로 각 페이지에서 표제란 좌상단(관리건축사 실명·연락처 블록의 시작)을
   실측하고, 같은 대역의 표 내용 최대 x·y와의 여유를 SOURCES.md 표에 추가하라.
   실측 결과가 기존 값과 같으면 같다고 적고 그대로 써라.
3. `npx tsx scripts/extract-textitems.mjs`로 재생성하라. **기존 8부는 바이트
   동일해야 한다** — `git diff --stat`에 기존 픽스처가 나오면 그건 회귀다.
   원인을 찾기 전에 진행하지 마라.
4. `tests/section-import/textitems.test.ts`의 fixtures 배열에 6면을 등록하라.
   needles는 그 페이지에 실제로 있는 문자열 2~4개(도면명·通り芯 라벨·치수)로
   하고, **픽스처 원시 items를 눈으로 읽어 골라라** — 파서 출력에서 유도하지
   마라.
5. **기존 결함 하나를 같이 닫아라**: `yokohama-p8.json`은 커밋돼 있는데
   fixtures 배열에 없어서 밀도·PII 스캔·제외 사각형 검증을 하나도 안 받는다.
   needles를 포함해 등록하라. 2026-08-26 사전 점검에서 p8의 커밋된 내용은 PII
   마커 0건이었으므로 등록만으로 통과해야 한다 — 만약 스캔이 걸리면 그것이 이
   결함의 실증이니, 내용을 보고 표제란 잔재라면 경계를 실측해 고치고 재생성하라
   (그 경우에만 p8 바이트가 바뀐다 — 이유를 report에 적어라).
6. 밀도 하한: 공통 600이 새 픽스처에서 깨지면 **전체 하한을 낮추지 말고**
   픽스처별 하한으로 바꿔라. 픽스처별 값은 실측 아이템 수 × 0.8 내림으로 하고
   주석에 실측값을 남겨라. kani-p39·p41은 raw가 244·231이라 걸릴 수 있다.
7. SOURCES.md의 「사용 페이지」 열과 표제란 표를 갱신하라.

## 하지 말 것

- `src/lib/import/**`를 수정하지 마라 — 이 스텝은 픽스처 생성뿐이다.
- 기존 8부 픽스처를 바꾸지 마라 (위 5의 실증 케이스만 예외).
- PDF 원본을 커밋하지 마라 (`.cache/`는 밖이다).
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## AC

- `npx vitest run tests/section-import/textitems.test.ts` 통과 — 14부 전부의
  밀도·PII 스캔·제외 사각형·needles.
- `tests/fixtures/section-import/textitems/`에 14파일, fixtures 배열에 14항.
- 기존 8부는 `git diff`에 나오지 않는다 (위 5의 실증 케이스만 예외).
- `npm run test` 전체 통과.

## 산출물

`phases/18-plan-corpus-widen/step0-report.json`:

```json
{
  "added": [{ "file": "...", "items": 0, "exclusion": { "x": 0, "y": 0 }, "titleBlockMeasured": { "x": 0, "y": 0 } }],
  "p8_scan": "clean | leaked(내용 요약)",
  "existing_fixtures_changed": "none | 목록＋이유",
  "summary": "index.json summary와 같은 요지"
}
```
