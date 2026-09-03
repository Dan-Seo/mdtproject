# Step 0: 2차 코퍼스 22면을 등록하고, pdf.js CMap 결함과 겹침 글자를 추출 단계에서 닫아라

## 배경

Claude가 2026-09-02·03에 발주처 7곳의 構造図 PDF 11부를 `.cache/`에 받아
`tests/fixtures/section-import/SOURCES.md`에 SHA-256·출처 URL·사용 페이지·제외
페이지를 등록했고, 기대값을 **도면을 눈으로 읽어 독립 전사**해 두었다:

- `tests/fixtures/section-import/expected/` — `karatsu-karayaku-s4-foundation-girders.json`,
  `ina-pump-p7-lists.json`, `saiki-fire-p1-girders.json`, `saiki-fire-p2-columns.json`,
  `fuji-kanritou-p20-lists.json`
- `tests/fixtures/plan-import/expected/` — 격자 7면(`*-grid.json`)·階高 3면(`*-elevation.json`)

이 스텝은 **TextItem 픽스처를 만드는 스텝**이다. 파서를 고치는 스텝이 아니다 —
파서 확장은 step 1〜4가 골든을 상대로 한다.

실측한 사실 둘 (SOURCES.md 「제2차 수집 도면의 특성」 절):

1. pdf.js(pdfjs-dist 6.2.108)가 CMap 없이 fuji·shibata를 열면 **전 페이지 텍스트
   0건**이고 경고도 없다(비내장 MS-Gothic Identity-H / 90msp-RKSJ-H). 제품
   `src/lib/import/pdf-text.ts`의 `extractTextPages`도 `{data, useWorkerFetch:false}`만
   주므로 **브라우저에서도 같은 도면이 조용히 빈 결과**가 된다 — 사용자에게는
   「인식 불가」로만 보인다. Node에서는 `cMapUrl`이 `file://` URL이 아니라
   **파일시스템 경로 문자열**(`.../node_modules/pdfjs-dist/cmaps/`, 끝에 `/`)이어야
   동작한다(실측).
2. saiki는 모든 글자를 같은 자리에 **최대 7겹**으로 그린다(太字 흉내). p1 16,289건·
   p2 15,267건이고, 겹친 글자끼리 좌표 편차는 x·y 최대 0.48pt·w 0.017pt다 —
   정확히 같은 좌표가 아니라 정확 일치 키로는 15,791건이 남는다.

## 할 일

1. **pdf.js 옵션** — `src/lib/import/pdf-text.ts`에서 `getDocument`에 주는 옵션을
   순수 함수 `pdfDocumentOptions(data, assetBaseUrl)`로 빼서 export 하고,
   `cMapUrl: assetBaseUrl + 'cmaps/'`, `cMapPacked: true`,
   `standardFontDataUrl: assetBaseUrl + 'standard_fonts/'`를 넣어라. 브라우저는
   `'/pdfjs/'`를 준다. 자산은 새 스크립트 `scripts/copy-pdfjs-assets.mjs`가
   `node_modules/pdfjs-dist/{cmaps,standard_fonts}`(합계 2.3MB)를 `public/pdfjs/`로
   복사하고, `package.json`의 `predev`·`prebuild`에서 돌린다. `public/pdfjs/`는
   `.gitignore`에 넣는다(생성물). Node 호출자 둘 — `tests/section-import/real-pdf.test.ts`·
   `scripts/extract-textitems.mjs` — 는 **같은 함수**에 `node_modules/pdfjs-dist/`의
   절대 경로(끝에 `/`)를 준다. 단위 테스트: 옵션 객체에 세 키가 있고 base가 그대로
   접두된다.
2. **겹침 글자 접기** — `src/lib/import/textitems.ts`의 `toTextItems` 끝에서 같은
   `str`·같은 `rot`이고 x·y 차이가 **모두 0.5pt 이하**인 항목을 하나로 접어라(먼저
   나온 것을 남긴다). 이것은 파서 로직이 아니라 추출 정규화이고, 제품과 픽스처
   생성기가 `toTextItems`를 공유하므로 둘 다에 걸린다. 단위 테스트: 같은 글자
   7개(편차 0.48pt) → 1개, 0.6pt 떨어진 둘 → 2개, 다른 글자 같은 좌표 → 2개.
   **기존 14면 픽스처가 바이트 동일해야 한다** — 달라지면 그 14면에 0.5pt 이내
   같은 글자가 실제로 있다는 뜻이니 멈추고 report에 어느 파일·몇 건인지 적고
   status를 `blocked`로 두어라.
3. **표제란 경계 실측** — 22면 각각에서 표제란(우하단 블록, 설계사무소 실명·주소·
   TEL/FAX) 좌상단 모서리를 재고 `tests/fixtures/section-import/title-block-exclusions.json`에
   넣어라. 같은 대역의 표 내용 최댓값과 여유를 SOURCES.md의 표제란 표에 기존 행과
   같은 열로 추가하라. 반증 가능한 확인: 생성된 22개 픽스처의 items에서 인접
   items를 이어 붙인 문자열이 `/TEL|FAX|℡|電話|一級建築士|設計事務所|株式会社|共同体/`에
   걸리는 것이 **0건**이어야 한다. 표제란 밖(注記)에서 걸리면 그 위치와 내용을
   report에 적어라 — 경계를 넓혀 표를 잘라내지 마라.
4. **추출기 대상 추가** — `scripts/extract-textitems.mjs`의 `targets`에 아래 22면을
   추가하고 `npx tsx scripts/extract-textitems.mjs`로 생성하라. 출력 파일명은 정확히
   이것이다(골든·테스트가 이 이름을 본다):

   | cacheFile | page | output |
   |---|---|---|
   | dwg-karatsu-fukuzu.pdf | 1 | karatsu-fukuzu-p1.json |
   | dwg-karatsu-shousai.pdf | 1 | karatsu-shousai-p1.json |
   | dwg-karatsu-hashirashin.pdf | 1 | karatsu-hashirashin-p1.json |
   | dwg-karatsu-jikugumi1.pdf | 1 | karatsu-jikugumi1-p1.json |
   | dwg-karatsu-jikugumi2.pdf | 1 | karatsu-jikugumi2-p1.json |
   | dwg-fuji-kanritou.pdf | 15, 17, 18, 20 | fuji-p15.json, fuji-p17.json, fuji-p18.json, fuji-p20.json |
   | dwg-ina-pump.pdf | 6, 7 | ina-p6.json, ina-p7.json |
   | dwg-saiki-fire.pdf | 1, 2 | saiki-p1.json, saiki-p2.json |
   | dwg-tsu-kanritou.pdf | 16, 20, 21, 22 | tsu-p16.json, tsu-p20.json, tsu-p21.json, tsu-p22.json |
   | dwg-hirosaki-kikyono.pdf | 21, 25 | hirosaki-p21.json, hirosaki-p25.json |
   | dwg-shibata-fire.pdf | 1, 7, 13 | shibata-p1.json, shibata-p7.json, shibata-p13.json |

   `tests/section-import/textitems.test.ts`에 22면의 밀도 하한(실측 × 0.8 내림)을
   기존과 같은 형식으로 추가하라. karatsu·fuji·saiki·tsu는 페이지 `/Rotate 90`이다 —
   pdf.js viewport가 회전을 반영하므로 `widthPt`가 `heightPt`보다 커야 한다(가로
   도면). 세로로 나오면 회전이 안 먹은 것이니 report에 적고 멈춰라.
5. **실태 표** — 36면 전부에 `parseSectionLists`·`parseFramingPlan`·
   `parseFrameElevations`를 돌려 `step0-report.json`에 페이지별로 적어라: リスト는
   listKind별 셀 수·issues, 격자는 direction/axes/spansMm/totalConfirmed/issues,
   階高는 계열 수/heightsMm/issues. **기존 14면의 결과는 step 5가 회귀 기준으로
   쓴다.** 2차 22면은 대부분 실패가 정상이다 — 실패를 실패로 적어라.
6. **브라우저 실검증** — `tests/e2e/uc12-section-import.js`에 fuji p20
   (`dwg-fuji-kanritou.pdf`, 1.1MB)을 추가해, CMap 자산이 실제로 서빙되어 **スラブ
   후보가 1건 이상** 나오는지 확인하라(현행 파서가 CMap만 있으면 이 페이지의
   スラブリスト 6칸을 읽는다 — 실측. 柱·梁은 step 4 전에는 0이 정상). 순서는
   `npm run build` → `npm run dev` →
   `base64 -w0 .cache/dwg-fuji-kanritou.pdf > ~/.dev-browser/tmp/uc12-dwg-fuji.pdf.b64` →
   `npx dev-browser --browser kijun --timeout 150 run tests/e2e/uc12-section-import.js`.
   이 phase 전에는 이 도면이 브라우저에서 0건이었으므로 후보 1건 이상이 곧 CMap
   경로의 증거다. dev-browser 자체가 안 뜨면(코드 실패가 아닌 환경 실패) report의
   `e2e`에 `not-run`과 오류 원문을 적고 **계속하라** — Claude가 직접 돌린다.

## 하지 말 것

- `src/lib/import/section-list/**`·`src/lib/import/framing-plan/**`·`src/lib/import/runs.ts`의
  로직·상수를 바꾸지 마라. 허용된 변경은 `pdf-text.ts`(옵션)와 `textitems.ts`(겹침
  접기)뿐이다.
- `expected/*.json`(section-import·plan-import 둘 다)을 고치지 마라 — Claude의
  전사이고 step 5가 원문과 대조한다. 틀렸다고 생각하면 report에 적어라.
- 파서가 새 페이지를 못 읽어도 고치지 마라. step 1〜4의 일이다.
- `.cache/`를 지우거나 PDF를 커밋하지 마라. `public/pdfjs/`도 커밋하지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라
  (`phases/36-*/step*-codex.*.log`가 더러운 것은 정상이다 — 커밋에서 빼라).

## AC

- `npm run test`·`npm run build`·`npm run lint` 통과.
- `tests/fixtures/section-import/textitems/`에 22개 새 파일, 기존 14개 바이트
  동일(`git diff --stat -- tests/fixtures/section-import/textitems` 0).
- 22개 픽스처 items에 표제란 정규식 매치 0건 (report에 검사 결과).
- `fuji-p20.json`·`shibata-p7.json`의 items가 각각 300건 이상 (CMap 경로가 실제로
  닿았다는 증거 — 0건이면 실패).
- `saiki-p1.json`·`saiki-p2.json`이 각각 6,000건 이하 (접기가 닿았다는 증거 —
  16,289·15,267이면 실패).
- `step0-report.json`에 실태 표 36면.

## 산출물

`phases/36-corpus-widen-2/step0-report.json`:

```json
{
  "fixtures": [{ "file": "", "items": 0, "widthPt": 0, "heightPt": 0, "exclusion": { "x": 0, "y": 0 }, "titleBlockMatches": 0 }],
  "dedupe": { "saiki-p1.json": { "before": 0, "after": 0 }, "saiki-p2.json": { "before": 0, "after": 0 } },
  "existing14_byte_identical": true,
  "status_table": { "<file>": { "lists": {}, "grids": [], "elevations": [] } },
  "e2e": { "status": "passed|not-run", "detail": "" },
  "summary": "index.json summary와 같은 요지"
}
```
