# Step 1: takeoff-run

step 0이 도메인에 런을 세웠다. 이 step은 산정 파이프라인을 **부재 단위 순회에서
런 단위 순회로** 바꾼다. 내역서에 連続スパン 大梁의 通し筋 행이 나오는 것이 목표다.

## 읽어야 할 파일

- `src/lib/hooks/useTakeoff.ts` · `useTakeoff.test.tsx` — 현재 부재 순회, `MemberUnsupportedError` 선택적 catch, `unsupportedMembers` 수집
- `src/domain/model/project.ts` — step 0이 추가한 `girderRun`
- `src/domain/rebar/girder.ts` — step 0이 바꾼 `generateGirderRebar(run, section)`
- `src/domain/quantity/index.ts` — `QuantityLine`, 행 키(`groupId|role|length|count`), `places` 집계
- `src/components/quantity/TakeoffPane.tsx` — 미지원 부재 고지 UI

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `useTakeoff` — 런 단위 순회

- 大梁 순회에서 각 부재마다 생성기를 부르지 말고, **런마다 한 번** 부른다.
  이미 처리한 런의 부재는 건너뛴다(처리 완료 `memberId` 집합을 두면 된다).
- 런에서 `MemberUnsupportedError`가 나오면 **런의 모든 부재**를 `unsupportedMembers`에
  올려라. 깨진 스팬 하나 때문에 런 전체가 산정되지 않는 것이 사실이고, 화면에
  일부만 미지원으로 보이면 나머지가 왜 안 그려지는지 설명되지 않는다.
- 룰팩 공백 같은 진짜 결함은 지금처럼 그대로 전파시켜라. `MemberUnsupportedError`만
  잡는 현재 규약을 유지한다.

### 2. 미지원 고지 UI 확인

`TakeoffPane`의 미지원 목록·대책 문구에서 `連続スパン`이 사라진다. i18n 키
(`ja`·`ko`)에 그 이유에 대응하는 문구가 있으면 **함께 제거**하라 — 쓰이지 않는
번역 키가 남으면 다음 사람이 아직 미지원이라고 읽는다.

### 3. 수량 집계 확인 — 스키마는 건드리지 않는다

`QuantityLine` 스키마·행 키는 **바꾸지 마라**. 通し筋은 런 대표 부재에 귀속되므로
기존 `groupId|role|length|count` 키로 자연스럽게 묶인다. 같은 符号라도 스팬 수가
다르면 길이가 달라 다른 행이 되는데, 그것이 맞는 표시다.

`kg`·`箇所` 단위 유니온은 M3b 후반(継手方式) 과제다. 이 step에서 손대지 마라.

### 4. 테스트

`src/lib/hooks/useTakeoff.test.tsx`:
- 기존 「連続スパン으로 Y大梁이 미지원」 테스트는 **전제가 뒤집혔다.** 지우지 말고
  「Y大梁도 通し筋으로 산정된다」로 다시 써라. 그 테스트가 무엇을 보증하고 있었는지
  먼저 밝히고 갱신하라.
- 샘플에서 大梁 행 수 검산: X방향 단일 스팬 런 3개 + Y방향 2스팬 런 2개 = 층당 런 5개.
  通し筋 행은 런당 上端·下端 2행, あばら筋은 **부재당** 1행(층당 7부재).
- 런 하나가 미지원이면 그 런의 부재가 **전부** `unsupportedMembers`에 오르고,
  다른 런과 柱는 그대로 산정된다.
- 룰팩 공백은 여전히 그대로 터진다 (기존 테스트 유지).

`src/domain/quantity/index.test.ts`:
- 다스팬 通し筋이 단일 스팬 通し筋과 **다른 행**으로 묶인다(길이가 다르므로)

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
2. 검산: 샘플에서 Y방향 大梁이 더 이상 미지원 목록에 없고, 1階 内訳에 通し筋 행이
   보이는가? 通し筋 길이가 단일 스팬 G1보다 명확히 긴가?
3. `phases/5-girder-continuous/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 런 순회 방식·미지원 묶음 규칙·
     행 수 검산 결과를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **`QuantityLine` 스키마를 확장하지 마라.** 이유: 단위 유니온은 M3b 후반 과제이고,
  지금 넣으면 근거 없는 継手 개소 열이 따라 들어온다.
- **미지원을 부재 단위로 쪼개 올리지 마라.** 이유: 런이 산정 단위다.
- **뷰어를 고치지 마라.** 이유: step 2의 스코프다. 컴파일을 통과시킬 최소 수정만.
- **파생 상태를 store에 넣지 마라.** 이유: `Project`에서 계산한다 (CLAUDE.md).
