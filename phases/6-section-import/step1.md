# Step 1: parse-core

TextItem JSON(step 0)을 **部材断面一覧 후보**로 바꾸는 순수 TS 파서.
이 트랙의 심장이다. 실물 도면 3부(발주처 상이)의 표를 좌표 기반으로 해석한다.

브라우저·pdf.js·React는 여기 없다 — 입력은 step 0의 JSON 스키마 그대로다.

## 읽어야 할 파일

- `CLAUDE.md` — 특히 ADR-012(主筋 본수·피치는 입력 — **파서가 값을 지어내면 입력 단계에서 이 규칙이 무너진다**)
- `docs/ADR.md` — ADR-018 (확신 없는 셀은 빈칸 + 원본 참고 표시)
- `tests/fixtures/section-import/textitems/*.json` — 입력 5부 (step 0 산출)
- `tests/fixtures/section-import/expected/*.json` — 독립 전사 기대값 4부. **여기 적힌 값이 정답이다.**
  각 파일의 `$comment`에 전사 범위(어느 부재까지 전사했는지)가 있다
- `src/domain/model/member.ts` — `ColumnSection`·`GirderSection`·`BarSize` (후보가 매핑될 목표 스키마)

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. 모듈 위치와 타입 — `src/lib/import/section-list/`

React·DOM import 금지 (vitest node 환경에서 돌아야 한다). 제안 구조:

```ts
// types.ts
export interface TextItem { str: string; x: number; y: number; w: number; h: number; rot?: number }
export interface TextPage { widthPt: number; heightPt: number; items: TextItem[] }

/** 리스트에서 읽은 한 부재(符号)·한 층의 후보. 값이 확실할 때만 필드가 채워진다. */
export interface SectionCandidate {
  kind: '柱' | '大梁' | '対象外'          // 符号 접두로 판별: /^C\d/ → 柱, /^G\d/ → 大梁, 그 외(B·CB·FG·FC·W…) → 対象外
  mark: string                            // C1, G51 …
  storyLabel?: string                     // '6F', '1階', 'R階' … 리스트의 층 라벨 그대로
  // 柱
  b?: number; d?: number
  main?: { size: BarSize; count: number }             // 柱: 柱頭=柱脚일 때만
  hoop?: { size: BarSize; pitchMm: number }
  // 大梁
  depth?: number
  girderMain?: { size: BarSize; topCount: number; bottomCount: number }  // 全断面 또는 전 위치 동일일 때만
  stirrup?: { size: BarSize; pitchMm: number }
  /** 확신 없어 빈칸으로 남긴 항목의 원본 문자열 — UI가 참고 표시한다 */
  raw: Record<string, string>             // 예: { '主筋(柱頭)': '22-D32', 'HOOP': 'S13-@100', '断面': '600φ' }
  issues: string[]                        // 빈칸 사유 (사람이 읽을 문장, ja)
}

export interface ParsedSectionList {
  listKind: string                        // '柱リスト' | '大梁断面リスト' | '地中梁リスト' … 표제 그대로
  candidates: SectionCandidate[]
}
```

`BarSize`로 표현 불가한 것(`K13`·`S13`·`600φ` 등)은 **해당 필드를 채우지 말고**
`raw`에 원본을, `issues`에 사유를 남겨라. 지어내지 마라.

### 2. 파서 — `parse.ts`

```ts
export function parseSectionLists(page: TextPage): ParsedSectionList[]
```

실물 3부가 요구하는 최소 능력:

- **표제 탐지**: `柱リスト`·`柱断面リスト`·`大梁断面リスト`·`梁リスト`·`地中梁リスト`·`小梁断面リスト`
  문자열을 앵커로 그 아래(가로형)/오른쪽(세로형) 영역을 표로 본다. 한 페이지에 표가 여럿일 수 있다
  (yokohama p13 = 柱 + 小梁).
- **행·열 복원**: y가 근접(허용 오차는 항목 높이 기준)한 항목을 행으로 묶고 x로 정렬한다.
  `符号`·`位置`·`断面`·`主筋`·`帯筋`·`HOOP`·`上筋`·`下筋`·`上端筋`·`下端筋`·`S T`·`ST`·`STP`·`腹筋`·`b×D`
  라벨의 좌표가 그리드의 기준선이다.
- **가로형** (ojkk·yokohama): 부재가 열, 층이 행 블록. 층 라벨(`6F`·`1階`·`R階`…)과
  같은 행 블록의 값 셀을 符号 열에 대응시킨다.
- **세로형** (kani 地中梁リスト): 항목 라벨이 왼쪽 열, 부재가 오른쪽 열.
- **값 정규화** (지역 헬퍼):
  - `16-D25` → `{ count: 16, size: 'D25' }` — `16 - D25`·`16-` + `D25` 같은 조각 분리 허용
  - `D13-@100`·`D10@200`·`-D13-@150` → `{ size: 'D13', pitchMm: 100 }`
  - `800 x 800`·`650 x 1 000`(자릿수 공백)·`300 × 500` → `{ b: 800, d: 800 }` — `x`·`×` 모두
  - 정규화 실패 → 필드 비움 + `raw` + `issues`
- **위치별 상이값 규칙** (ADR-018): 大梁 上筋·下筋이 位置(端部/中央 등)별로 다르면
  `girderMain`을 채우지 말고 `raw`에 위치별 원본을 남겨라 (예: G51).
  全断面이거나 전 위치 동일이면 채운다 (예: G54·G55A). 柱의 柱頭/柱脚도 같은 규칙 (ojkk는 전부 동일).
- **무시하되 죽지 않기**: カットオフ 치수 `[2500]`, 단면도 치수선 숫자, 범례,
  표제란(도곽) 텍스트, 회전 텍스트. 표 밖 노이즈가 후보를 오염시키면 안 된다.

파서가 페이지 전체에서 **아무 표도 못 찾으면 빈 배열**을 돌려준다 — throw하지 마라
(UI가 「認識できる断面リストが見つからない」를 표시할 재료다).

### 3. 골든 테스트 — `parse.test.ts`

픽스처 5부를 로드해 파싱하고, **테스트 코드에 리터럴로 박은 기대값**과 대조한다.
기대값의 출처는 `expected/*.json`의 전사다 — 전사 JSON을 코드로 변환해 돌리지 마라
(변환기가 파서와 같은 정규화를 재구현하게 되어 순환이 된다). 최소 커버리지:

- **ojkk-p2 (柱リスト)**: `C1`(6F) → b 700·d 700·main 16-D25·hoop D13@100 /
  `C2A`(2F) → main 20-D29 / `C2A`(1F) → main 22-D32, hoop 빈칸+raw `K13-@100` /
  `C2`(1F) → hoop 빈칸+raw / `FC1`(1F) → kind 対象外
- **yokohama-p13 (柱断面リスト)**: `C51`(2階) → 800×800·18-D25·D13@100 /
  `C51`(1階) → 22-D25, hoop 빈칸+raw `S13-@100` / `C56`(2階) → b·d 빈칸+raw `600φ`,
  main 12-D22 / `C58A`(1階) → 26-D25 / 小梁 `B51`… → kind 対象外
- **yokohama-p14 (大梁断面リスト)**: `G51`(R階) → b 650·depth 800·stirrup D13@100·
  girderMain **빈칸**+raw(外端/中央/内端 상이) / `G51`(2階) → stirrup D13@150·girderMain 빈칸
  (11/7/11 상이) / `G54`(R階) → girderMain top 5 bottom 5 D25 (全断面) /
  `G55A`(R階) → 450×700·top 5 bottom 4 D22 / `G55`(R階) → girderMain 빈칸 (4/5/8 상이)
- **kani-p38 (地中梁リスト·세로형)**: `FG1` → kind 対象外, b 300·depth 500·
  上端筋 3-D19 (raw 또는 필드 — 対象外라 매핑 의무는 없다), 腹筋 빈 셀이 파서를 죽이지 않는다
- **개수 검증**: 각 리스트의 후보 mark 집합이 전사 JSON의 `entries[].mark` 집합을 **포함**한다
  (전사 범위 밖 부재는 초과 검출 허용 — G52 등)

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
   - 규준 수치 리터럴이 없는가? (파서는 규준을 모른다 — 定着·かぶり를 계산하지 않는다)
   - 실패 셀이 값 대신 `raw`·`issues`로 남는가? (지어낸 값이 없는가)
3. `phases/6-section-import/index.json`의 step 1을 업데이트한다 (completed/error/blocked 규칙은 step 0과 동일).
   summary에 표 방향 2종·후보 매핑 규칙·빈칸 규칙을 한 줄로.

## 금지사항

- **확신 없는 셀에 값을 넣지 마라.** 이유: 파싱값은 승인 후 입력이 된다(ADR-012).
  틀린 값이 조용히 들어가는 것이 이 트랙 최대의 실패 모드다. min·max·평균 같은 유도도 금지다.
- **K13·S13을 D13으로 바꾸지 마라.** 이유: 고강도 전단보강근은 별개 재료다. raw로 남겨라.
- **expected JSON을 코드로 변환해 기대값으로 쓰지 마라.** 이유: 변환기가 정규화를 재구현하면 순환 검증이 된다.
  기대값은 테스트에 리터럴로 박아라.
- **LLM·OCR·외부 서비스를 부르지 마라.** 이유: ADR-018 — 결정적 파싱, 외부 전송 없음.
- **픽스처 3부에 없는 표 형식을 상상해서 지원하지 마라.** 이유: 근거 없는 유연성은 죽은 코드다.
  미지 형식은 「빈 배열」로 정직하게 실패하는 것이 옳다.
