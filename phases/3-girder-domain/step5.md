# Step 5: girder-support-sample

大梁의 **지원/미지원 판정**을 만들어 파이프라인에 연결한다. 핵심 원칙: **데이터 오류(柱 결손 등)는 throw, 미지원 구성(연속 스팬)은 typed 판정으로 제외**한다. 부재 하나의 미지원이 내역서 페인 전체를 죽이면 안 된다. 샘플 프로젝트를 2×3 그리드로 바꿔 단일 스팬 大梁이 화면에 실제로 나오게 한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `AGENTS.md` — 열린 리스크 R7 ② (연속 스팬 이중 계상 — M3a는 미지원 판정으로 제외)
- `src/lib/hooks/useTakeoff.ts` — 柱 전용 필터(`kind !== '柱'`)와 `TakeoffResult`
- `src/domain/model/project.ts` — `girderSpan`(step 0), `touches` 계열 헬퍼
- `src/domain/rebar/girder.ts` — step 4의 생성기
- `src/domain/model/sample-project.ts` — 현재 3×3 그리드 (모든 라인이 2스팬 연속)
- `src/components/AppShell.tsx` · `src/components/PaneBoundary.tsx` — throw가 페인 단위로 격리되는 구조 (여기는 수정하지 않는다)
- 샘플 부재 수에 의존하는 기존 테스트 전부 (`rg "createSampleProject" src tests`로 찾아라)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/domain/model/project.ts`에 지원 판정 추가

```ts
export type GirderSupport =
  | { supported: true }
  | { supported: false; reason: '連続スパン' }

export function girderSupport(project: Project, member: Member): GirderSupport
```

- 연속 판정: 같은 story·같은 축·같은 통り 선상에서 이 大梁과 그리드 교점을 공유하는 인접 大梁이 존재하면 `連続スパン` 미지원. (스팬별 독립 계산은 중간 柱 정착을 이중 계상하므로 M3b의 通し筋 모델 전까지 계산하지 않는다 — R7 ②.)
- 柱 결손 같은 데이터 오류는 이 함수의 소관이 아니다 — `girderSpan`이 throw한다.

### 2. `src/lib/hooks/useTakeoff.ts` 확장

```ts
export interface UnsupportedMember {
  memberId: string
  mark: string
  storyName: string
  reason: '連続スパン'
}
export interface TakeoffResult {
  // 기존 필드 유지
  unsupportedMembers: UnsupportedMember[]
}
```

- 大梁 분기: `girderSupport`가 supported면 `generateGirderRebar({ member, section, span: girderSpan(...) }, pack)`, 미지원이면 `unsupportedMembers`에 수집하고 건너뛴다.
- 柱 경로는 불변. 캐시(참조 동일성 메모) 구조도 불변.

### 3. `src/domain/model/sample-project.ts` — 그리드 2×3

- `xSpans: [6000]`, `ySpans: [6000, 6000]`로 변경한다. 결과: X방향 大梁은 전부 **단일 스팬**(지원 — 화면에 배근이 보인다), Y방향 大梁은 2스팬 연속(미지원 — 고지가 보인다). 두 경로가 모두 데모된다.
- 柱 6본/층, X大梁 3본/층, Y大梁 4본/층이 된다. 부재 id·符号 배정 로직은 유지.

### 4. 테스트

- `project.test.ts`: X 단일 스팬 → supported, Y 연속 → `連続スパン`, 축이 달라 교점만 스치는 경우 supported 유지.
- `useTakeoff.test.tsx`: 샘플에서 X大梁 그룹 행(上端筋·下端筋·あばら筋 3행)이 나오고, Y大梁은 `unsupportedMembers`에 사유와 함께 들어가며 lines에 없다. 柱 행은 기존과 동일 규칙.
- 샘플 부재 수를 단언하던 기존 테스트를 새 그리드에 맞게 갱신하라 — 수치는 세지 말고 유도(그리드에서 계산)하는 방식으로 바꾸면 다음 변경에 강해진다.

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
   - 미지원이 throw가 아니라 typed 반환인가? (페인 생존 원칙)
   - 파생 상태를 스토어에 저장하지 않았는가? (`unsupportedMembers`는 계산 결과다)
   - 大梁 UI 문구는 건드리지 않았는가? (step 6의 스코프)
3. `phases/3-girder-domain/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 `girderSupport` 판정 규칙·`TakeoffResult` 확장 필드·샘플 그리드 변경(2×3)을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **연속 스팬을 스팬별 독립 계산으로 "일단" 관통시키지 마라.** 이유: 중간 柱 정착 이중 계상은 조용히 틀린 물량이다 (R7 ②). 이 제품은 틀린 값 대신 명시적 미지원을 낸다.
- **미지원 판정을 throw로 구현하지 마라.** 이유: PaneBoundary가 페인 전체를 내려버린다. 미지원은 오류가 아니라 정상 상태다.
- **TakeoffPane 등 UI 컴포넌트를 수정하지 마라.** 이유: step 6의 스코프다.
- 기존 테스트를 깨뜨리지 마라 (샘플 변경으로 인한 기대값 갱신은 예외 — 근거를 커밋 메시지에 남겨라).
