# Step 0: textitem-fixtures

도면 인식(로컬) 트랙(ADR-018)의 첫 칸이다. `.cache/`의 실물 構造図 PDF 3부에서
**위치 있는 텍스트 조각(TextItem)** 을 추출해 JSON 픽스처로 커밋한다.
이 JSON이 이후 파서(step 1)의 CI 상시 입력이다 — PDF 원본은 커밋하지 않는다
(라이선스, `tests/fixtures/section-import/SOURCES.md` 참조).

## 읽어야 할 파일

- `CLAUDE.md` — 아키텍처 규칙 전부. 특히 「사용자 도면 데이터를 서버로 보내지 말 것」, 도면 인식 트랙 항목
- `docs/ADR.md` — ADR-018 (이 트랙의 결정), ADR-010 (독립 전사)
- `tests/fixtures/section-import/SOURCES.md` — 대상 PDF 3부의 파일명·해시·사용 페이지
- `tests/fixtures/section-import/expected/*.json` — 이미 커밋된 독립 전사 기대값 4부 (스모크 테스트의 대조 재료)
- `package.json` — **pdfjs-dist는 이미 설치돼 있다 (6.2.108). `npm install`을 실행하지 마라** — 네트워크가 없을 수 있다

## 전제

`.cache/`에 아래 3부가 이미 있다 (없으면 status를 `blocked`로 하고 SOURCES.md의 URL·해시를 blocked_reason에 적어라):

- `.cache/dwg-ojkk-zumen6.pdf` — 대상 페이지 2, 3, 4
- `.cache/dwg-yokohama.pdf` — 대상 페이지 13, 14
- `.cache/dwg-kani-kids.pdf` — 대상 페이지 38

## 작업

### 1. `scripts/extract-textitems.mjs`

Node에서 pdfjs-dist legacy 빌드로 대상 페이지의 TextContent를 추출해
`tests/fixtures/section-import/textitems/<이름>-p<페이지>.json` 5부를 생성하는 스크립트.

- import는 `pdfjs-dist/legacy/build/pdf.mjs`를 쓴다 (Node 환경). 워커 불필요 설정으로.
- 출력 스키마 (파일 헤더 주석에도 명시하라):

```json
{
  "source": { "cacheFile": "dwg-yokohama.pdf", "sha256": "<SOURCES.md의 값>", "page": 13 },
  "page": { "widthPt": 0, "heightPt": 0 },
  "items": [
    { "str": "C51", "x": 0, "y": 0, "w": 0, "h": 0 }
  ]
}
```

- **좌표 규약**: 좌상 원점, y는 아래 방향, 단위 pt. pdf.js의 TextItem은
  `transform[4]`(x)·`transform[5]`(baseline y, 좌하 원점)를 주므로
  `y = page.heightPt − transform[5]`로 변환한다. `w = width`, `h = height`.
- 회전 텍스트(transform의 b·c가 0이 아님)는 `"rot": <도>` 필드를 추가해 보존하라.
  표 셀은 수평 텍스트다 — 파서(step 1)가 회전분을 걸러낼 수 있게만 하면 된다.
- `str`이 공백뿐인 항목은 버려라 (CAD PDF는 공백 조각이 수천 개다).
- 실행: `node scripts/extract-textitems.mjs` — 5부 전부 재생성. 멱등이어야 한다.
- SHA-256 대조: 스크립트가 `.cache` 파일의 해시를 SOURCES.md의 값과 대조하고
  다르면 생성하지 않고 실패하라 (다른 파일로 픽스처를 만들면 전사 기대값과 어긋난다).

### 2. 생성 실행 + 스모크 테스트

5부를 생성해 커밋하고, `tests/fixtures/section-import/textitems.test.ts` (vitest)로
픽스처 무결성을 고정한다. **PDF 없이 JSON만으로 도는 테스트다** — CI에서 상시 실행된다.

각 픽스처에 대해:
- `items`가 1,000개 이상 (실물 도면은 텍스트가 많다 — 추출이 뭉텅이로 빠지면 이 개수가 무너진다)
- 전사 기대값에 있는 대표 문자열이 `items[].str` 연결에 존재:
  - ojkk-p2: `柱リスト`, `C2A`, `16-D25`, `22-D32`, `700`
  - ojkk-p3: `梁リスト`, `上端筋`, `あばら筋`
  - yokohama-p13: `柱断面リスト`, `C58A`, `18-D25`, `600φ`
  - yokohama-p14: `大梁断面リスト`, `G51`, `13-D25`, `650`
  - kani-p38: `地中梁リスト`, `ＦＧ１` 또는 `FG1`, `3-D19`, `D10@200`
  - **주의**: `16-D25` 같은 값이 `16-` + `D25`로 쪼개져 나올 수 있다. 개별 str의
    포함이 아니라 「같은 행(y가 근접)의 str들을 x 순으로 이어붙인 문자열」에서 찾아라.
    이 이어붙이기 헬퍼는 테스트 파일 안의 지역 함수로 충분하다 — 파서 모듈을 만들지 마라 (step 1 스코프).
- 좌표 sanity: 모든 항목이 `0 ≤ x < widthPt`, `0 ≤ y < heightPt`

## Acceptance Criteria

```bash
node scripts/extract-textitems.mjs   # 5부 생성, 멱등
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 생성된 JSON 5부가 커밋 대상에 포함돼 있는지, PDF가 커밋 대상에 **없는지** 확인한다
   (`git status` — `.cache/`는 .gitignore 대상이어야 한다. 아니라면 .gitignore에 추가하라).
3. `phases/6-section-import/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 픽스처 5부의 항목 수와 좌표 규약을 한 줄로
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **`npm install`·네트워크 접근 금지.** 이유: pdfjs-dist는 이미 설치돼 있고, 실행 환경에 네트워크가 없을 수 있다.
- **PDF 원본을 커밋하지 마라.** 이유: 공공 발주 도면의 재배포 허용이 불명확하다 (SOURCES.md).
- **파서 로직(표 해석·후보 생성)을 만들지 마라.** 이유: step 1의 스코프다. 이 step은 추출과 무결성 고정만 한다.
- **추출 결과를 손으로 고치지 마라.** 이유: 픽스처는 pdf.js가 실제로 주는 것의 스냅샷이어야 한다.
  스모크 테스트가 깨지면 추출 방식을 고쳐라, JSON을 고치지 마라.
