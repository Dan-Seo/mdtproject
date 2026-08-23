# Step 3: apply — 읽은 腹筋·幅止め筋을 案件에 반영한다

step 0~2는 파서만 고쳤다. 이 step이 그 값을 `断面一覧` 취입 화면에서 `GirderSection`에 넣는다.
`断面一覧` 쪽 입력 칸(`widthTie`·`sideBar`)은 M3c에서 이미 있다 — 새로 만들지 마라.

## 읽어야 할 파일

- `CLAUDE.md` — 도면 인식 트랙 항(**부재 행 단위 反映/無視 규약**), ADR-012, R9②
- `docs/ADR.md` — ADR-018, ADR-021
- `src/components/section/SectionImport.tsx` — `applyParsedFields`(:132), `applyCandidate`(:216)
- `src/components/section/SectionTable.tsx` — `widthTie`·`sideBar` 입력 칸(:752 부근).
  `extraLengthMm`의 기존 기본값이 `?? 0`인 것을 확인하라
- `src/components/section/SectionImport.test.tsx` — 기존 취입 테스트
- `tests/e2e/uc12-section-import.js` — 이 트랙의 실브라우저 시나리오

## 작업

TDD로 진행하라.

### 1. 반영 규칙 — `applyParsedFields`

| 후보 | 목적지 | 규칙 |
|---|---|---|
| `sideBar: {size, count}` | `GirderSection.sideBar` | `extraLengthMm`은 **기존값 유지**, 신규면 `0` |
| `widthTie: {size, pitchMm}` | `GirderSection.widthTie` | `{ size, pitch: pitchMm }` |
| `raw['カットオフ*']` | **없음** | 반영하지 않는다. 화면의 원문 표시로만 남는다 |

**CRITICAL — `undefined`는 「삭제」가 아니라 「유지」다.** 후보에 `sideBar`·`widthTie`가 없을 때
기존 `GirderSection`의 값을 지우지 마라. 이유:

- 후보의 `undefined`는 「도면에 그 배근이 없다」와 「그 리스트/행을 못 읽었다」를 구분하지 않는다.
- phase 6이 정한 규약이 **「빈칸은 기존값 유지」**다. 여기서 뒤집으면 사용자가 손으로 넣은 값이
  다른 페이지를 취입할 때 조용히 사라진다.

`柱`(`ColumnSection`)에는 `sideBar`·`widthTie`가 없다. 柱 후보에 이 값이 오면 무시하라
(step 1이 애초에 안 싣지만 방어는 남겨라).

### 2. `extraLengthMm`을 파서가 아니라 여기서 정하는 이유를 주석으로 남겨라

도면에 余長이 없고 標準仕様書 5章에도 없다(「腹筋」 0건). 1通則6)이 위임한 JASS 5는
유료·미확보다 — 그래서 `0`이 근거 있는 값이 아니라 **미입력 상태**라는 것을 주석에 적어라 (R9②).
기존 `SectionTable`의 `?? 0`과 같은 취급이다.

### 3. 취입 화면 표시

- 반영 대상 행에 `腹筋`·`幅止め筋`이 무엇으로 들어가는지 보이게 하라 — 기존 항목(主筋·帯筋 등)이
  어떻게 표시되는지 그대로 따라가라. 새 표시 방식을 발명하지 마라.
- `カットオフ` raw는 기존 raw 표시 경로에 그대로 얹힌다. 별도 UI를 만들지 마라.
- 로케일 문자열은 `src/locales/ja.json`·`ko.json` **양쪽**에 넣어라. 한쪽만 넣으면 빈 키가 화면에 나온다.

## 테스트

### 단위 (`SectionImport.test.tsx`)

- `ojkk-p3` 후보를 반영하면 대상 `GirderSection.sideBar`가 `{size:'D10', count:2, extraLengthMm:0}`
- 이미 `extraLengthMm: 120`이 들어 있던 断面에 같은 후보를 반영하면 **120이 유지되고** size·count만 갱신
- `widthTie`가 `{size:'D10', pitch:1000}`으로 들어가는 것
- 후보에 `sideBar`가 없을 때 기존 `GirderSection.sideBar`가 **지워지지 않는** 것
- 반영 뒤 `内訳書`·3D가 죽지 않는 것 (기존 테스트가 이미 이 형태를 갖고 있으면 그것을 넓혀라)

### 실브라우저

`tests/e2e/uc12-section-import.js`에 항을 더한다:

```bash
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc12-section-import.js
```

확인할 것: PDF 취입 → 大梁 행 반영 → `断面一覧`의 `腹筋`(径·本数)과 `幅止め筋`(径·ピッチ)이
도면 값으로 차 있고, `余長`은 `0`이며, `内訳書`에 腹筋 행이 나오는 것.
**시나리오 첫 착지에서 IndexedDB를 지우는 기존 규약을 지켜라** (R4 — 앞 시나리오의 자동저장이 흘러든다).

## Acceptance Criteria

**순서를 지켜라. dev 서버와 `npm run build`는 같은 `.next`를 쓴다** (아래 함정 참조):

```bash
# 1) dev 서버가 떠 있으면 먼저 죽인다
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build

# 2) 빌드가 끝난 뒤에 dev 서버를 띄운다
npm run dev -- -p 3000 &

# 3) e2e
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc12-section-import.js
```

### 함정 — `npm run build`를 dev 서버가 뜬 채로 돌리지 마라

`next dev`와 `next build`가 같은 `.next`를 공유한다. dev 서버가 떠 있는데 빌드를 돌리면
`.next`가 덮여 **dev 서버가 자기 청크를 잃는다.** 증상은 e2e의 「페이지가 안 뜬다」인데
**`curl`은 200을 반환하므로 진단이 어긋난다** — HTML 껍데기는 나오고 청크만 404다.

이 상태에 빠졌으면 고치는 법은 하나다:

```bash
# dev 서버를 죽이고
rm -rf .next
npm run build
npm run dev -- -p 3000 &
```

빌드를 다시 돌려야 할 일이 생기면 **그때마다 dev 서버를 먼저 내려라.**
`tests/e2e/README.md`의 「알려진 함정」에 같은 항이 있다.

## 검증 절차

1. 위 AC 커맨드를 **적힌 순서대로** 실행한다. dev-browser는 CLI다 — 사람 확인이 필요 없다.
   e2e가 「페이지가 안 뜬다」로 실패하면 코드를 의심하기 전에 위 함정부터 확인하라.
2. 아키텍처 체크리스트:
   - 후보의 `undefined`가 기존값을 지우지 않는가? (테스트로 고정돼 있는가)
   - 규준 수치 리터럴이 안 들어갔는가? (`extraLengthMm: 0`은 규준값이 아니라 미입력이다 — 주석이 그렇게 말하는가)
   - `ja.json`·`ko.json` 양쪽에 키가 들어갔는가?
3. `docs/`와 `CLAUDE.md`의 도면 인식 트랙 항을 갱신한다:
   - 「남은 것」에서 腹筋·幅止筋을 빼고, カットオフ가 **원문 보존까지**이고 값 반영은 R13 선결임을 적는다
   - 継手方式은 **픽스처 4부에 근거가 0건**이라 이번 phase에서 제외했다는 사실을 적는다
     (`圧接`·`機械式`·`継手` 문자열이 도면에 없다 — 없는 것을 못 읽는 것은 파서 결함이 아니다)
4. `phases/7-section-fields/index.json`의 step 3을 갱신한다 (규칙은 step 0과 동일).

## 금지사항

- **후보의 `undefined`로 기존값을 지우지 마라.** 이유: 조용한 데이터 소실이 이 트랙 최대의 실패 모드다.
- **`cutoffFromSupportFaceMm`를 반영하지 마라.** 이유: R13 (step 2의 「왜 raw까지인가」 참조).
- **`断面一覧`의 입력 칸을 새로 만들지 마라.** 이유: M3c에서 이미 있다 (`SectionTable.tsx:752~`).
- **`extraLengthMm`에 0 이외의 값을 지어내지 마라.** 이유: 근거가 없다 (R9②). 8d 같은 관행값도 금지다 —
  룰팩에 없는 수치를 `.ts`에 쓰는 것이다.
- **`小梁`을 반영 대상으로 만들지 마라.** 이유: ADR-005.
- **dev 서버가 뜬 채로 `npm run build`를 돌리지 마라.** 이유: 같은 `.next`를 덮어 dev 서버가 청크를 잃고, e2e가 「페이지가 안 뜬다」로 실패한다. `curl`이 200을 주므로 코드 쪽을 의심하다 시간을 버린다.
