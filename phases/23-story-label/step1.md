# Step 1: storyKey·제목 階 추출 헬퍼 — 순수 함수, TDD

**전제**: step 0이 `completed`(전제 유지)로 끝났을 때만 진행하라. step 0이
`refuted`면 이 스텝은 `blocked`로 멈추고 사유에 반증 요지를 적어라 — 저자의
ADR 정정을 기다린다. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 배경

`docs/ADR.md`의 ADR-033·ADR-035를 읽어라. 이 스텝은 동작을 바꾸지 않는다 —
다음 스텝들이 쓸 순수 함수 둘을 만들고 테스트로 고정만 한다.

## 할 일 (테스트 먼저)

1. **`src/lib/import/story-label.ts` 신규** — 함수 둘:
   - `storyKey(label: string): string | undefined` —
     `compact()`(`src/lib/import/runs.ts`)를 지난 뒤 정준 키로 접는다:
     `RF`·`R階` → `'R'`, `〈n〉F`·`〈n〉階` → `String(n)` (선행 0은 숫자로
     접어 `01F`→`'1'`). 완전 일치가 아니거나 인식 밖 표기(`B1F`·`地下1階`·
     `PH`·`塔屋`·빈 문자열 등)는 undefined — **지어내지 않는다** (ADR-035 §1).
   - `storyLabelFromTitle(title: string): string | undefined` —
     제목 원문에서 인식 가능한 階 토큰(`RF`·`R階`·`〈n〉F`·`〈n〉階`)을 전부
     찾아, 그 **정준 키가 정확히 하나**면 첫 토큰의 원문을 반환한다.
     없거나 키가 복수면 undefined (ADR-035 §2). 토큰 탐색도 `compact()`를
     지난 문자열에서 한다 — 「２階 床伏図」(전각·공백)도 잡혀야 한다.
     주의: 「2階床伏図1/100」의 `1/100`처럼 階가 붙지 않은 숫자는 토큰이
     아니다.
2. **단위 테스트** (`src/lib/import/story-label.test.ts`) — 최소 고정:
   - `storyKey`: `2階`≡`2F`≡`２階`(전각), `RF`≡`R階`, `01F`→`'1'`,
     `B1F`·`地下1階`·`PH`·`塔屋`·`''`·`X1` → undefined.
   - `storyLabelFromTitle`: 「2階床伏図1/100」→`2階`, 「R階床伏図」→`R階`,
     「杭伏図」→undefined, 서로 다른 키 둘이 든 제목 → undefined,
     같은 키 토큰 둘(예: 「2階床伏図(2F)」) → 첫 토큰.
3. **기존 코드는 건드리지 않는다** — `compact()`·파서·컴포넌트 무변경.

## 하지 말 것

- `src/lib/import/runs.ts` 수정 금지 — 축명 매칭(ADR-033)이 걸려 있다.
- `src/components/**`·`src/domain/**`·파서 수정 금지 — step 2·3이다.
- 배근 규준 수치 금지. `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/23-story-label/step1-report.json`:
함수 시그니처·테스트 케이스 목록·게이트 결과.
