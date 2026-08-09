# Step 0: project-setup

M1(워킹 스켈레톤)의 첫 step이다. 저장소에는 아직 문서와 하네스 스크립트만 있고 **애플리케이션 코드가 한 줄도 없다.** 이 step은 이후 9개 step이 올라탈 빌드 인프라를 세운다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/AGENTS.md` — 기술 스택과 CRITICAL 규칙
- `/docs/ARCHITECTURE.md` — §디렉토리 구조를 그대로 따른다
- `/docs/ADR.md` — ADR-007(Next.js를 쓰되 서버 컴포넌트 미사용), ADR-011(워킹 스켈레톤 우선)
- `/docs/DESIGN.md` — §1(디자인 토큰), §9(디자인 시스템 자체의 불일치), §10-6(CDN 의존 해소)
- `/design/README.md` 와 `/design/kijun-design-system/` 아래 `styles.css`, `tokens/*.css` 7개
- `/scripts/hooks/tdd-guard.sh` — **이 훅이 이 step 이후 모든 파일 편집을 검사한다.** 어떤 경로가 테스트를 요구받고 어떤 경로가 면제되는지 반드시 파악해둘 것
- `/scripts/hooks/stop-verify.sh` — `package.json`에 `lint`·`build`·`test`가 모두 정의되는 순간부터 턴이 끝날 때마다 이 세 커맨드가 실행된다

## 작업

### 1. Next.js 15 App Router 스캐폴딩

- Next.js 15 App Router, React 19, TypeScript **strict mode**, Tailwind CSS, ESLint.
- `src/` 디렉토리 구조를 쓴다. App Router 경로는 `src/app/`.
- `src/app/layout.tsx`와 `src/app/page.tsx`는 **모두 `'use client'`** 로 시작한다. 서버 컴포넌트를 쓰지 않는다(ADR-007).
- `src/app/page.tsx`는 이 step에서는 플레이스홀더 한 줄이면 된다. 실제 화면은 step 5에서 만든다.

### 2. 의존성 설치

`/AGENTS.md`의 기술 스택이 이미 고정되어 있으므로 이 step에서 한 번에 설치한다. step마다 나눠 설치하지 않는다 — 중간 step에서 설치가 실패하면 그 step 전체가 재시도되기 때문이다.

- 런타임: `next`, `react`, `react-dom`, `three`, `zustand`, `exceljs`, `js-yaml`
- 개발: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `@types/three`, `@types/js-yaml`, `eslint`, `eslint-config-next`, `tailwindcss`(+ 필요한 postcss 패키지), `vitest`, `jsdom`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`

### 3. package.json scripts

정확히 아래 5개를 정의한다. 이름을 바꾸지 마라 — `/AGENTS.md`의 §명령어와 `stop-verify.sh`가 이 이름에 의존한다.

```json
"dev": "next dev",
"build": "next build",
"lint": "eslint .",
"test": "vitest run",
"test:golden": "vitest run tests/golden"
```

### 4. vitest 설정 — domain 프로젝트만

`vitest.config.ts`에 **`domain` 프로젝트 하나만** 정의한다. jsdom 환경의 `ui` 프로젝트는 step 5에서 첫 컴포넌트가 생길 때 추가한다.

- `name: 'domain'`, `environment: 'node'`
- `include`: `src/domain/**/*.test.ts`, `src/rulepack/**/*.test.ts`, `tests/**/*.test.ts`
- **`passWithNoTests`를 켜지 마라.** 글로브가 깨져도 조용히 통과하게 된다.

**YAML을 raw 문자열로 읽는 vite 플러그인을 이 설정 안에 넣어라.** step 2가 `src/rulepack/*.yaml`을 문자열로 import하는데, vite는 `.yaml` 확장자를 기본으로 처리하지 못한다. `load` 훅에서 `.yaml`로 끝나는 id를 `fs.readFileSync`로 읽어 `export default <문자열 리터럴>`로 돌려주는 10줄 이내의 인라인 플러그인이면 충분하다. 별도 패키지를 설치하지 마라.

### 5. next.config에 YAML raw 로더

step 2가 브라우저 번들에서도 같은 `.yaml` 파일을 문자열로 읽어야 한다. Node(vitest)와 브라우저(next build) 양쪽에서 **같은 import 문**이 동작해야 한다.

- Turbopack: `.yaml`을 raw 문자열로 반환하는 rule
- Webpack fallback: `{ test: /\.yaml$/, type: 'asset/source' }`

`src/types/yaml.d.ts`에 앰비언트 선언을 둔다:

```ts
declare module '*.yaml' {
  const content: string
  export default content
}
```

### 6. 디자인 토큰 반입

`/design/`은 참조 자료이고 **빌드에 포함되지 않는다**(`/design/README.md`). 따라서 복사해서 들여온다.

- `design/kijun-design-system/tokens/*.css` 7개와 `styles.css`를 `src/styles/`로 복사한다.
- `fonts.css`의 Google Fonts `@import`를 제거하고 `next/font`로 셀프호스팅한다(Inter + JetBrains Mono). **CDN 요청이 남으면 안 된다**(DESIGN §10-6).
- 복사한 각 파일 맨 위에 개변 사실을 주석으로 남긴다. 예: `/* design/kijun-design-system/tokens/fonts.css 에서 복사. Google Fonts @import 제거, next/font 로 대체 (2026-08). */`
- `src/app/globals.css`가 `src/styles/styles.css`를 import하도록 연결한다.
- `_ds_bundle.js`는 **가져오지 마라.** 소스가 없는 컴파일본이고 React 버전이 불명이다(DESIGN §9).

### 7. 스캐폴딩 스모크 테스트

`tests/scaffold.test.ts`를 작성한다. 내용:

- `package.json`의 `scripts`에 `dev`·`build`·`lint`·`test`·`test:golden`이 모두 존재
- `tsconfig.json`의 `compilerOptions.strict === true`

이 테스트가 있어야 `npm test`가 "테스트 파일 없음"으로 실패하지 않는다.

### 8. 디렉토리 골격

`/docs/ARCHITECTURE.md`의 구조를 따른다. **빈 디렉토리를 미리 만들지 마라** — 각 step이 자기 파일을 만들 때 생긴다. 다만 아래 두 가지는 구조를 벗어나므로 하지 마라:

- `src/services/` 를 만들지 마라. 외부 API를 호출하지 않는다.
- `src/types/` 에 도메인 타입을 두지 마라. `yaml.d.ts` 같은 앰비언트 선언만 둔다. 도메인 타입은 step 1에서 `src/domain/model/`에 들어간다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

세 커맨드가 모두 종료코드 0이어야 한다.

추가로 아래를 확인한다:

```bash
grep -rn "fonts.googleapis\|unpkg.com\|cdn.jsdelivr" src/    # 출력이 없어야 한다
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/app`, `src/components`, `src/domain`, `src/rulepack`, `src/lib`, `src/locales`, `tests/golden`)
   - `layout.tsx`·`page.tsx`가 `'use client'`인가? (ADR-007)
   - `src/`에 CDN URL이 남아 있지 않은가? (DESIGN §10-6)
   - `tsconfig.json`이 strict인가?
3. 결과에 따라 `phases/1-skeleton/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step이 알아야 할 것: 설치된 패키지 버전, vitest 프로젝트 이름, 토큰 CSS 경로, YAML import 방식)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **규준 수치를 어떤 파일에도 쓰지 마라.** 이유: 定着長さ·重ね継手長さ·折曲げ·かぶり厚さ·할증률·단위질량은 전부 step 2의 YAML에서 온다. 이 step은 인프라만 만든다 (ADR-002).
- **화면을 만들지 마라.** 이유: 레이아웃은 step 5, 각 페인은 step 6~8의 몫이다. 여기서 만들면 두 번 만들게 된다.
- **서버 컴포넌트·API Route·server action을 만들지 마라.** 이유: ADR-006·007. 사용자 도면 데이터가 서버로 나갈 경로 자체를 만들지 않는다.
- **`_ds_bundle.js`를 `src/`로 복사하지 마라.** 이유: 소스 없는 컴파일본이라 유지보수가 불가능하고 React 버전이 불명이다 (DESIGN §9).
- **`--passWithNoTests`를 쓰지 마라.** 이유: include 글로브가 깨져도 CI가 초록으로 보인다.
- 기존 테스트를 깨뜨리지 마라.
