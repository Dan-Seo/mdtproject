# Step 5: app-shell

지금까지의 도메인 계산을 화면에 올릴 껍데기를 만든다. zustand 스토어, i18n, 4페인 레이아웃, 하단 고지다. **각 페인의 내용물은 만들지 않는다** — step 6~8의 몫이다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **§1(디자인 토큰), §2(화면 구조·정확한 치수), §3(상호 선택 모델), §8(i18n)**. 이 step은 DESIGN.md 재현이 본체다
- `/docs/ARCHITECTURE.md` — §상태 관리 전체
- `/docs/ADR.md` — ADR-006(클라이언트 전용), ADR-007(서버 컴포넌트 미사용), ADR-008(로케일), ADR-011(가짜 값임을 화면에 크게 표시), ADR-015(경고·워터마크)
- `/docs/PRD.md` — §디자인
- step 0의 `src/styles/` 토큰 CSS와 `src/app/globals.css`
- step 1~4의 `src/domain/` 전체 — 스토어와 파생 계산이 이 위에서 돈다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

**TDD로 진행하라.** `.tsx`도 TDD 가드의 대상이다(`layout.tsx`·`page.tsx`만 면제). 컴포넌트마다 테스트 파일을 먼저 만들어라.

### 1. vitest에 `ui` 프로젝트 추가

step 0은 `domain`(node) 프로젝트 하나만 정의했다. jsdom 환경의 두 번째 프로젝트를 추가한다.

- `name: 'ui'`, `environment: 'jsdom'`, `@vitejs/plugin-react` 사용
- `include`: `src/components/**/*.test.tsx`, `src/app/**/*.test.tsx`, `src/lib/**/*.test.ts(x)`
- `@testing-library/jest-dom` matcher를 setup 파일에서 등록
- `domain` 프로젝트의 include와 겹치지 않게 하라

### 2. ESLint로 도메인 경계를 기계화

`src/domain/`이 React·DOM·three.js·Next.js를 import하지 않는다는 CRITICAL 규칙을 **사람이 지키는 규칙으로 두지 마라.** ESLint flat config에 `src/domain/**` 한정 override를 넣고 `no-restricted-imports`로 `react`, `react-dom`, `next`, `next/*`, `three`, `zustand`, `exceljs`를 금지한다. 위반 시 `npm run lint`가 실패해야 한다.

**이 규칙이 실제로 잡는지 확인하라** — 임시로 `src/domain/`에 `import 'react'`를 넣어 lint가 실패하는 것을 보고 되돌린다.

### 3. zustand 스토어 — `src/lib/store.ts`

```ts
interface Selection { group: string | null; memberId: string | null }   // DESIGN §3.1

interface AppState {
  project: Project
  sel: Selection
  hoverRowId: string | null      // DESIGN §3.2 — sel과 별개 축이다
  locale: 'ja' | 'ko'
  activeStoryId: string
  // actions
  selectMember(memberId: string): void
  selectGroup(groupId: string, memberId: string): void
  setHoverRow(rowId: string | null): void
  setLocale(locale: 'ja' | 'ko'): void
  setActiveStory(storyId: string): void
  updateProject(updater: (p: Project) => Project): void
}
```

**`rebars`·`quantityLines`를 스토어에 넣지 마라.** 파생 상태다(ARCHITECTURE.md). 대신 `src/lib/hooks/useTakeoff.ts`에 `useMemo` 기반 훅을 만든다:

```ts
function useTakeoff(): { rebars: Rebar[]; lines: QuantityLine[]; hasInferred: boolean; inferredRules: RuleHit[] }
```

`sel` 변경 시 **그 부재가 속한 층으로 `activeStoryId`가 자동 전환**되어야 한다(DESIGN §3.1 표의 세 번째 행). 이 규칙을 액션 안에 넣고 테스트로 고정하라.

### 4. i18n — `src/lib/i18n.ts` + `src/locales/`

- `ja.json`(기본), `ko.json`. **`ko`의 fallback은 `ja`** — 키가 없으면 자동으로 일본어가 나온다(ADR-008).
- **도메인 용어를 번역하지 마라.** `ko.json`에서도 `柱`·`大梁`·`主筋`·`帯筋`·`あばら筋`·`定着`·`重ね継手`·`かぶり厚さ`·`SD345`·`Fc24`·`D13`은 일본어 원어 그대로다. 번역 대상은 UI 레이블(`길이`, `본수`, `설계수량`)뿐이다.
- 외부 i18n 라이브러리를 설치하지 마라. 키 조회 + fallback은 20줄이면 된다.

### 5. 4페인 레이아웃 — DESIGN §2를 치수까지 그대로

```
┌──────────────────────────────────────────────┐
│ 헤더 52px — 워드마크 / 案件名 / [日本語][한국어] │
├────────────────────┬─────────────────────────┤
│ 平面エディタ        │ 3Dビュー                 │  ← 우측 상단 44%
│ (step 6)           │ (step 8)                │
│                    ├─────────────────────────┤
│ 部材断面一覧        │ 数量内訳書               │  ← 우측 하단 56%
│ (step 6)           │ (step 7)                │
└────────────────────┴─────────────────────────┘
```

- 최상위 `height: 100vh`, 헤더 52px 고정 + 본문 `1fr`
- 본문 `grid-template-columns: minmax(392px, 34%) 1fr`, `gap: 1px`, 배경 `--hairline`
- 우측 열 `grid-template-rows: minmax(0, 44%) minmax(0, 56%)`
- 모든 페인 헤더는 **38px**, `t-caption-uppercase` 라벨(11px, 자간 +0.88px)로 시작
- 깊이는 전부 **1px 선**이다. `box-shadow`를 쓰지 마라 — DESIGN §1의 `elevation.css`가 모든 elevation을 `none`으로 해석한다
- 색은 토큰만 쓴다. **컴포넌트에 hex를 직접 쓰지 마라.** 바닥 `--color-canvas` `#f7f7f4`, 카드 `--surface-card` `#ffffff`, 글자 `--text-ink` `#26251e`, 강조 `--color-primary` `#f54e00`(화면당 하나, 선택 강조에만)

이 step에서는 각 페인 자리에 페인 헤더 + 빈 본문 플레이스홀더만 둔다. 내용물은 step 6~8이 채운다.

### 6. 하단 고지 — 법적 의무 + M1 경고

**두 가지를 모두 넣어라. 제거 대상이 아니다.**

1. **출처 표시 고지**(CRITICAL, PDL1.0): 산출 근거가 `公共建築工事標準仕様書`·`公共建築数量積算基準`임과 개변 사실을 화면 하단에 고정 표시한다. 적용 범위가 **관청시설 기준**이라 민간공사와 다를 수 있다는 사실도 함께 적는다(R5, ADR-003).
2. **M1 플레이스홀더 경고**: 현재 룰팩 수치가 원문 추출 전의 가짜 값이라는 것을 **눈에 띄게** 표시한다. ADR-011의 트레이드오프가 「이 기간에는 누구에게도 보여주지 않거나, 가짜 값임을 화면에 크게 표시한다」이다. 하단 고지 한 줄로 숨기지 말고 별도 배너로 세워라.

### 7. 로케일 토글

헤더 우측에 `[日本語] [한국어]` 토글. 즉시 전환되고 라우팅하지 않는다(DESIGN §2: 모달 없음, 라우팅 없음).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
npm run test:golden
```

테스트에는 최소한 아래가 포함되어야 한다:

- `selectMember`가 `sel`과 `activeStoryId`를 함께 갱신 (DESIGN §3.1)
- `setHoverRow`가 `sel`을 건드리지 않음 (별개 축)
- 스토어 상태에 `rebars`·`quantityLines` 키가 존재하지 않음
- `ko` 로케일에서 없는 키가 `ja` 값으로 fallback
- 레이아웃이 4개 페인 헤더를 렌더
- 하단 고지와 M1 경고 배너가 렌더

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 모든 컴포넌트가 `'use client'`인가? 서버 컴포넌트가 없는가? (ADR-007)
   - 파생 상태가 스토어에 없는가? (ARCHITECTURE.md)
   - `src/domain/`에 대한 ESLint 경계 규칙이 실제로 위반을 잡는가? (CRITICAL)
   - DESIGN §2의 치수(52px / 38px / `minmax(392px,34%)` / 44%·56% / `gap:1px`)가 그대로인가?
   - 컴포넌트에 hex 리터럴이 아니라 토큰 변수를 쓰는가? (DESIGN §1)
   - 하단 출처 고지가 있는가? (CRITICAL — 법적 의무)
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: 스토어 키·액션 이름, `useTakeoff` 시그니처, i18n 함수 이름, 페인 슬롯 컴포넌트 경로)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`box-shadow`를 쓰지 마라.** 이유: DESIGN §1 — 이 디자인 시스템은 깊이를 1px 선으로만 표현한다. 카드가 떠 보이는 이유는 그림자가 아니라 바닥보다 하얗기 때문이다.
- **오렌지 `--color-primary`를 선택 강조 외에 쓰지 마라.** 이유: DESIGN §1 — 화면당 하나다. 워드마크와 선택 강조 전용.
- **철근 경(D10~D32)을 색으로 구분하지 마라.** 이유: PRD §디자인 — 색 12개는 읽히지 않는다.
- **다크 모드를 만들지 마라.** 이유: PRD §디자인 — 라이트 모드가 기본이고 어두운 배경은 3D 캔버스뿐이다.
- **모달·라우팅을 만들지 마라.** 이유: DESIGN §2 — 한 화면 4페인이 사양이다.
- **파생 상태를 스토어에 넣지 마라.** 이유: 반드시 어긋난다 (ARCHITECTURE.md).
- **하단 출처 고지를 생략하지 마라.** 이유: PDL1.0 준거의 법적 의무다 (CRITICAL).
- **각 페인의 내용물을 만들지 마라.** 이유: step 6~8의 몫이다. 여기서 만들면 두 번 만들게 된다.
- **`_ds_bundle.js`를 import하지 마라.** 이유: 소스 없는 컴파일본이다 (DESIGN §9).
- 기존 테스트를 깨뜨리지 마라.
