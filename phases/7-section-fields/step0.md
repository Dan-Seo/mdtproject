# Step 0: sidebar — 腹筋을 값으로 읽는다

`断面リスト` 파서는 `腹筋` 라벨 행을 **이미 인식하지만 값을 버린다**
(`parse.ts:725` 주석 — 「腹筋은 파싱 대상이 아니지만 라벨 행이 맞으므로 접힘으로 오인하지 않게 넣는다」).
M3c에서 `GirderSection.sideBar`가 모델에 들어갔으므로 이제 담을 자리가 있다.
이 step은 **파서만** 고친다 — 案件에 반영하는 것은 step 3이다.

## 읽어야 할 파일

- `CLAUDE.md` — 특히 ADR-012(主筋 본수·피치는 입력 — 파서가 값을 지어내면 이 규칙이 무너진다),
  M3c 항의 腹筋 항목, R9②(腹筋 余長에는 근거가 없다)
- `docs/ADR.md` — ADR-018(확신 없는 셀은 빈칸 + 원문 보존), ADR-021
- `src/lib/import/section-list/types.ts` — `SectionCandidate`·`CANDIDATE_ISSUES`
- `src/lib/import/section-list/parse.ts` — 특히 라벨 화이트리스트(`:740` 부근)와 값 행 배정 로직
- `src/domain/model/member.ts` — `GirderSection.sideBar`(size·count·extraLengthMm)
- `tests/fixtures/section-import/expected/*.json` — **여기 적힌 값이 정답이다**

## 전제 — 픽스처에 무엇이 있는지 (조사 완료, 다시 조사하지 마라)

TextItem은 **한 글자 단위**다. `腹筋` 라벨은 두 항목(`腹`+`筋`)으로 쪼개져 있다.
기존 행 복원기가 이미 이것을 처리하므로 새로 만들지 마라.

실측한 腹筋 행:

- `ojkk-p3` (大梁リスト): 층 블록마다 1행씩 6행. 값은 전부 `2-D10`
- `yokohama-p14` (大梁断面リスト): 4행. 값은 `2-D10`·`4-D10` 혼재.
  한 행(`y=922.9`)은 **라벨만 있고 값이 없다**
- `yokohama-p13` (小梁断面リスト): 2행 — 이 리스트의 부재는 `対象外`다
- `yokohama-p13`의 腹筋 행에는 `―`(U+2015) 셀이 섞여 있다
- `kani-p38`: `腹` 한 글자가 `基礎伏図` 표제 근처에 떠 있을 뿐 값 행이 아니다

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. 후보 타입에 `sideBar` 추가 — `types.ts`

```ts
  /**
   * 腹筋。図面が「2-D10」と書く数そのもの — 1通則7) の割付ではない。
   * 未定義は「その配筋がない」を意味する (ADR-012)。
   * 余長 (extraLengthMm) は図面に無い — 取り込み側が決める (R9②)。
   */
  sideBar?: { size: BarSize; count: number }
```

`BarSize`다 — `ShearBarSize`가 아니다. 腹筋은 主筋과 같은 이형봉이고
高強度せん断補強筋(K13·S13)이 올 자리가 아니다.

### 2. 값 정규화

`2-D10` → `{ count: 2, size: 'D10' }`. **기존 主筋 정규화 헬퍼를 재사용하라** —
`16-D25`를 읽는 것과 같은 문법이다. 새 파서를 만들지 마라.

### 3. 빈 셀·`―` 셀

- 값이 없는 셀(빈칸, `―`, `-`) → `sideBar`를 **채우지 않는다**. issue도 남기지 않는다.
  이유: 「배근 없음」은 실패가 아니라 정상값이다. `parse.ts:441` 부근에 같은 판단이
  이미 적혀 있으니 그 규칙과 어긋나게 만들지 마라.
- 정규화 실패(예상 밖 문자열) → `sideBar` 비우고 `raw['腹筋']`에 원문 + issue `腹筋解釈不能`.
  `CANDIDATE_ISSUES`에 이 코드를 추가하고, 표시부 번역 키(`sectionImport.issue.腹筋解釈不能`)를
  ja·ko 양쪽 로케일에 추가하라 (기존 issue 코드가 어떻게 번역되는지 따라가라).

### 4. `対象外` 부재

`小梁`·`地中梁` 등 `kind: '対象外'` 후보에 `sideBar`를 채울 의무는 없다.
채워도 무방하나 **채우려고 별도 분기를 만들지 마라** — 取入이 対象外를 반영하지 않는다.

## 테스트

`parse.test.ts`에 기대값을 **리터럴로 박아라** (expected JSON을 코드로 변환하지 마라 — 순환이 된다):

- `ojkk-p3` `G1`류 → `sideBar: { size: 'D10', count: 2 }`
- `yokohama-p14` `G51`(R階) → `sideBar: { size: 'D10', count: 2 }`
  (girderMain은 기존대로 빈칸 + `主筋端部左右相違` — **이 기존 기대값이 깨지면 안 된다**)
- `yokohama-p14`에서 `4-D10`이 나오는 符号 하나 → `count: 4`
- 값 없는 腹筋 행이 파서를 죽이지 않고 그 후보의 `sideBar`가 `undefined`인 것
- `yokohama-p13` `―` 셀 → `sideBar` `undefined`, `issues`에 아무것도 안 늘어난 것

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `src/lib/import/section-list/`에 React·DOM·pdf.js import이 없는가?
   - 규준 수치 리터럴이 없는가? (파서는 규준을 모른다)
   - 기존 후보 기대값(主筋·帯筋·断面)이 하나도 안 바뀌었는가?
3. `phases/7-section-fields/index.json`의 step 0을 갱신한다:
   - 성공 → `"status": "completed"` + `"summary"` 한 줄
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **`extraLengthMm`(余長)를 파서가 정하지 마라.** 이유: 도면에 없다. 標準仕様書 R7 전 330쪽에
  「腹筋」이 0건이고 1通則6)이 위임한 JASS 5는 미확보다 (R9②). step 3의 取入이 정한다.
- **`―`를 「읽기 실패」로 처리하지 마라.** 이유: 「배근 없음」이라는 값이다. issue를 붙이면
  화면에서 사용자가 고쳐야 할 셀로 보인다.
- **本数를 1通則7)의 割付로 계산하지 마라.** 이유: 腹筋 本数는 도면에 적힌 수 그대로다.
- **`小梁`을 `対象外`에서 꺼내지 마라.** 이유: ADR-005 — 小梁은 아직 모델링하지 않는다.
- **확신 없는 셀에 값을 넣지 마라.** 이유: 파싱값은 승인 후 입력이 된다 (ADR-012).
