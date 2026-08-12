# Step 2: import-ui

파서(step 1)를 제품에 잇는다: 部材断面一覧 페인에 PDF 취입 버튼 → 브라우저 안에서
pdf.js로 TextPage 추출 → 후보 diff 패널 → **부재 행 단위 승인(反映/無視)** → 반영.

승인 전에는 어떤 후보도 `project`에 닿지 않는다. 이것이 ADR-018의 UX 계약이다.

## 읽어야 할 파일

- `CLAUDE.md` — 「사용자 도면 데이터를 서버로 보내지 말 것」(CRITICAL), ADR-012
- `docs/ADR.md` — ADR-018
- `src/components/section/SectionTable.tsx`(+ test) — 断面一覧 페인. 취입 버튼이 여기 붙는다
- `src/lib/store.ts` — `updateProject(updater)` (반영 경로)
- `src/lib/import/section-list/` — step 1의 파서와 타입
- `src/locales/ja.json`·`src/locales/ko.json` — 문자열 리소스 규약
- `tests/e2e/uc11-continuous-girder.js` — e2e 스크립트 규약 (`browser.getPage("kijun")`·`page.evaluate` 스타일)
- `docs/UX.md` — 키보드 완주 원칙 (断面一覧은 Tab/Enter로 완주 가능해야 한다 — 취입 패널도 같다)

## 작업

TDD로 진행하라. 컴포넌트 테스트를 먼저 쓰고 구현하라.

### 1. pdf.js 어댑터 — `src/lib/import/pdf-text.ts`

```ts
/** File → TextPage[] (step 0 픽스처와 같은 스키마·좌표 규약) */
export async function extractTextPages(file: File): Promise<TextPage[]>
```

- `pdfjs-dist`는 **dynamic import**로 로드하라 (초기 번들에 넣지 마라 — 취입을 안 쓰는
  사용자가 비용을 내면 안 된다).
- `GlobalWorkerOptions.workerSrc`는 **번들에 포함된 로컬 워커**로 설정하라
  (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` 방식).
  **CDN URL 금지** — 외부 요청이 생기면 「외부 전송 없음」 전제가 흐려진다.
- 전 페이지를 추출하되, 페이지당 TextItem 수천 개 규모다 — 페이지 단위로 순차 처리하면 충분하다.
  파싱은 페이지별 `parseSectionLists`를 호출해 표가 나온 페이지만 쓴다.

### 2. 취입 패널 — `src/components/section/SectionImport.tsx`

SectionTable 헤더에 취입 버튼(ja `PDF取込` / ko `PDF 가져오기`)과
`<input type="file" accept="application/pdf">`(숨김, `data-testid="section-import-file"`).

파일 선택 → 추출·파싱 → 패널 표시 (기존 UI 패턴에 맞춰 모달/사이드 어느 쪽이든 —
단 키보드로 완주 가능할 것):

- 후보를 `(mark, storyLabel)` 행으로 나열. 각 행에:
  - **현행값**: `project.sections`에서 같은 `mark`를 찾아 표시 (없으면 「新規」)
  - **파싱값**: 채워진 필드만. 빈칸 필드는 `raw`의 원본 문자열을 흐리게 참고 표시하고
    `issues`를 툴팁/보조 텍스트로
  - **反映 버튼**: `updateProject`로 해당 mark의 섹션을 갱신. 파싱된 필드만 덮어쓴다
    (빈칸 필드는 기존값 유지). 같은 mark의 다른 행을 이어서 反映하면 마지막 것이 이긴다.
  - **無視 버튼**: 행을 접는다 (project 무변경)
- **신규 mark의 反映**: 같은 kind의 기존 섹션 하나를 복제해 파싱 필드만 바꾼 새 섹션을
  추가하고, 그 사실을 행에 표시하라 (ja: `未解析の欄は◯◯から複製`). 결정 근거: fc·grade 등은
  断面リスト에 없다 — 지어내지 않고 기존 입력에서 온 값임을 밝힌다.
- `kind: '対象外'` 후보(小梁 B·地中梁 FG·基礎柱 FC 등)는 접힌 그룹으로 표시만 하고
  反映 버튼을 두지 않는다 (부재는 柱·大梁만 — ADR-005).
- 표를 하나도 못 찾은 PDF → ja `認識できる断面リストが見つかりません` 안내 (throw 금지).
- i18n: 모든 신규 문자열을 ja/ko 리소스에 추가. 도메인 용어는 일본어 그대로 (ADR-008).

### 3. 반영의 안전 규칙

- 승인(反映) 없이 `project`가 변하는 경로가 없어야 한다 — 컴포넌트 테스트로 고정하라.
- PDF 파일·파싱 내용을 네트워크로 보내는 코드가 없어야 한다. PostHog 이벤트를 남긴다면
  **개수·소요시간 같은 메타데이터만** — 파일명·마크·값을 포함하지 마라 (CRITICAL 규칙).
- 반영된 값은 기존 인라인 편집으로 이후 수정 가능하다 — 특별한 잠금·표시를 만들지 마라.
  (승인 순간부터 그것은 여느 사용자 입력과 같다 — ADR-012)

### 4. 컴포넌트 테스트 — `SectionImport.test.tsx`

fixtures의 TextPage JSON을 직접 주입해 (pdf.js 없이) 패널을 렌더:

- yokohama-p13 픽스처 → `C51` 행이 뜨고, 反映 클릭 → `updateProject`가 b·d·主筋을 갱신
- 빈칸 셀(C51 1階 hoop raw `S13-@100`)이 값으로 반영되지 **않고** 기존값이 유지된다
- `対象外` 그룹에 反映 버튼이 없다
- 無視는 project를 바꾸지 않는다
- 표 없는 TextPage → 안내 문구

### 5. e2e — `tests/e2e/uc12-section-import.js`

uc11 규약을 따르는 dev-browser 스크립트. 실물 PDF로 관통 검증한다:

- `page.setInputFiles("[data-testid='section-import-file']", ".cache/dwg-yokohama.pdf")`
  (`.cache`가 없으면 스크립트 첫머리에서 명시적으로 실패시켜라 — 로컬 전용 e2e다)
- 패널에 `C51` 후보가 뜬다 → 反映 → 断面一覧의 해당 셀이 파싱값으로 바뀐다
- `対象外` 그룹(B51 등)에 反映 버튼이 없다
- 내역·3D가 반영 후에도 렌더된다 (throw 없음)

실행 명령 (검증 절차에서 실제로 실행하라):

```bash
npm run dev &   # 이미 떠 있으면 생략
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc12-section-import.js
```

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc12-section-import.js
```

## 검증 절차

1. 위 AC 커맨드를 실행한다 (e2e 포함 — dev 서버를 먼저 띄워라).
2. 체크리스트:
   - 승인 없이 project가 변하는 경로가 없는가?
   - pdf.js 워커가 로컬 번들인가? (CDN URL 검색: `grep -r "cdn" src/` 가 비어야 한다)
   - 취입 패널이 Tab/Enter로 완주 가능한가?
3. `phases/6-section-import/index.json`의 step 2를 업데이트한다 (규칙 동일).
   summary에 반영 규칙(행 단위·빈칸 유지·신규 복제)과 e2e 결과를 한 줄로.

## 금지사항

- **자동 반영을 만들지 마라** (「전부 반영」 버튼 포함). 이유: 승인 단위는 부재 행이다 —
  그릴링에서 합의된 계약이고, 일괄 반영은 틀린 행 하나를 눈감고 통과시킨다.
- **빈칸 필드를 디폴트값으로 채워 반영하지 마라.** 이유: 빈칸은 「모른다」다. 기존값 유지가 옳다.
- **PDF·파싱 내용을 서버·PostHog로 보내지 마라.** 이유: CRITICAL — 도면 데이터는 브라우저를 떠나지 않는다.
- **취입 이력·언두 스택 같은 부가 기능을 만들지 마라.** 이유: 요청되지 않았다. 반영 후 수정은 인라인 편집이 이미 한다.
- **`Project` 스키마를 바꾸지 마라.** 이유: 후보는 기존 `ColumnSection`/`GirderSection`에 매핑된다.
  스키마 확장(継手方式 등)은 M3b의 스코프다.
