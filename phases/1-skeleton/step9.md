# Step 9: export-xlsx

M1 관통 경로의 마지막 칸이다. 내역서를 `.xlsx`로 내보내고, **미검증 값이 섞여 있으면 워터마크를 박는다.**

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **§4(화면 12열), §4.2(내보내기 열 구성), §5(워터마크 3단계)**
- `/docs/ADR.md` — ADR-015(미검증 수치는 차단하지 않고 경고 + 워터마크), ADR-006(전부 브라우저에서), ADR-013(設計数量·所要数量)
- `/docs/PRD.md` — §핵심 기능 3·5
- `/docs/SOURCES.md` — 출처 표기에 들어갈 문서명·판·URL
- step 4의 `src/domain/quantity/` — `QuantityLine`, `storySubtotals`, `grandTotal`, `hasInferred`, `inferredRules`
- step 7의 내역서 컴포넌트 — 열 순서와 포맷을 맞춘다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** 테스트를 먼저 쓰고 구현하라.

### 1. 열 구성 — DESIGN §4.2

화면 12열 + `階 / 部材 / 符号` 3열 + `算出式` 1열 = **16열**.

화면(step 7)과 열 이름·순서·포맷이 어긋나면 안 된다. 長さ 소수 3자리 같은 표시 정책도 동일하게 적용한다.

### 2. 워터마크 — DESIGN §5의 3단계 (ADR-015)

`hasInferred(lines) === true`이면 **파일 선두에 2줄을 넣는다.** 조건부 옵션이 아니다.

- 첫 줄: `※ 未確認の規準値を含む — 検収前の参考値`
- 둘째 줄: 기여한 inferred 항목 **전체 목록** (`inferredRules()`의 규준명·조항 포함)
- 해당 항목명 셀에는 `⚠ ` 접두사

**부분 워터마크는 없다.** 행이 하나라도 inferred면 산출물 전체에 붙는다 — 어느 숫자가 오염됐는지 사용자가 추적하게 만들지 않는다(DESIGN §5).

M1에서는 단위질량이 `inferred`이므로 사실상 항상 워터마크가 붙는다. **정상이다.**

### 3. 출처 표기 — 법적 의무

시트 하단(또는 별도 영역)에 산출 근거를 적는다. PDL1.0 준거로 **출처 표시와 개변 사실 표시가 요구된다**(CRITICAL).

- 근거 문서명·판·URL (`/docs/SOURCES.md`의 정본 목록)
- 적용 범위가 **관청시설 기준**이며 민간공사와 다를 수 있다는 사실 (R5, ADR-003)
- 이 산출물이 도구에 의해 가공된 값이라는 사실

### 4. 구현 — `src/lib/export/`

```ts
function buildTakeoffWorkbook(input: {
  project: Project
  lines: QuantityLine[]
  locale: 'ja' | 'ko'
}): WorkbookSpec                                   // 순수 데이터. exceljs에 의존하지 않는다

async function exportTakeoffXlsx(input: { ... }): Promise<void>   // 브라우저에서 파일 다운로드
```

**두 층으로 나눠라.** `buildTakeoffWorkbook`은 「어떤 셀에 무엇이 들어가는가」를 순수 데이터로 반환하고 테스트 가능해야 한다. exceljs 호출과 다운로드 트리거는 얇은 바깥층이다. 그렇지 않으면 워터마크가 실제로 박히는지 테스트할 수 없다.

- exceljs는 **동적 import**로 불러온다. 초기 번들에 넣지 마라
- 파일명은 `kijun-takeoff.xlsx`
- 다운로드는 Blob + `URL.createObjectURL`. **서버로 보내지 마라**(CRITICAL — 모든 계산은 브라우저에서)

### 5. 내보내기 버튼

DESIGN §2의 내역서 페인 헤더에 `[割増 4%][書き出し]` 자리가 있다. `書き出し` 버튼을 붙인다.

**`割増 4%` 표시를 하드코딩하지 마라.** `lookupMarkup`이 반환한 값을 표시한다 (ADR-002, ADR-014).

### 6. 테스트

- `hasInferred === true`인 입력에서 `buildTakeoffWorkbook`의 선두 2행이 워터마크다
- 워터마크 둘째 줄에 inferred 항목이 **빠짐없이** 들어간다
- inferred 행의 항목명 셀에 `⚠ ` 접두사가 있다
- 16열이 DESIGN §4.2의 순서대로 나온다
- 출처 표기 문자열에 문서명·판·URL이 들어간다
- 합계 행이 `grandTotal`과 일치한다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
npm run test:golden
```

**이 step이 M1의 마지막이다.** AC를 통과하면 「입력 → 철근 → 물량 → 3D → Excel」 관통이 완성된다. 아래를 수동으로 한 번 확인하라:

```bash
npm run dev
```

브라우저에서 ① 단면일람에서 主筋 本数를 바꾸면 내역서 수치가 바뀌는가 ② 평면에서 부재를 클릭하면 3D와 내역서가 따라오는가 ③ 내역서 행에 hover하면 3D에서 해당 철근이 오렌지가 되는가 ④ `書き出し`로 받은 `.xlsx` 선두에 워터마크가 있는가.

## 검증 절차

1. 위 AC 커맨드를 실행하고 수동 확인 4가지를 수행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 워터마크가 조건부 옵션이 아니라 inferred 존재 시 무조건 붙는가? (ADR-015, DESIGN §5)
   - 출처·판·URL·개변 사실이 산출물에 들어가는가? (CRITICAL — 법적 의무)
   - 파일이 서버를 거치지 않고 브라우저에서 생성되는가? (CRITICAL, ADR-006)
   - 할증률 표시가 룰팩 조회 결과인가? 하드코딩이 아닌가? (ADR-002, ADR-014)
   - `buildTakeoffWorkbook`이 exceljs에 의존하지 않는가? (테스트 가능성)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 9를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **워터마크를 조건부 옵션·설정으로 만들지 마라.** 이유: ADR-015가 fail-closed 대신 워터마크를 택한 근거가 「틀릴 수 있음을 산출물 자체에 각인시켜 사용자가 모르고 발주에 쓰는 경로를 막는다」이다. 끌 수 있으면 그 근거가 사라진다.
- **부분 워터마크를 만들지 마라.** 이유: 어느 숫자가 오염됐는지 사용자가 추적하게 만들지 않는다 (DESIGN §5).
- **inferred 값 때문에 내보내기를 차단하지 마라.** 이유: 그러면 제품이 영구히 출하되지 않는다 (ADR-015).
- **출처 표기를 생략하지 마라.** 이유: PDL1.0 준거의 법적 의무다 (CRITICAL).
- **파일 생성을 서버로 보내지 마라.** 이유: 건설 도면·물량은 기밀이고, 「데이터가 우리 서버로 올라가지 않는다」가 신뢰 근거다 (ADR-006).
- **PDF·glTF·IFC 내보내기를 만들지 마라.** 이유: PDF·glTF는 M4, IFC는 MVP 제외다 (PRD).
- **CSV를 함께 만들지 마라.** 이유: CSV는 프로토타입 단계의 대용이었고 MVP 목표는 `.xlsx`다 (DESIGN §4.2). 두 벌을 유지할 이유가 없다.
- 기존 테스트를 깨뜨리지 마라.
