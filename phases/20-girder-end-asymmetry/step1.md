# Step 1: GirderMainRow 비대칭 모델 ＋ 분해 함수 — 단위 테스트 먼저

**전제**: step 0이 `refuted`면 구현을 시작하지 말고 이 스텝을 `blocked`로 두고
`blocked_reason`에 「ADR-032 반증 — Claude 인계 대기」를 적어라.

## 배경

`docs/ADR.md`의 **ADR-032**를 먼저 읽어라. R13의 모델 제약 —
`GirderMainRow`(`src/domain/model/member.ts`)가 `{endCount, centerCount}`
둘이라 좌우 비대칭 端部를 담을 수 없다. 이 스텝은 **도메인 모델과 분해
함수만** 만든다. 엔진(girder.ts)·3D(geometry.ts) 이관은 step 2다.

## 할 일

1. **TDD** — `src/domain/model/member.test.ts`의 기존 관례로 테스트 먼저:
   - ADR-032의 실물 케이스: 스텁형 (8,8,13)·(8,8,11), 혼합형 (4,5,8)·(4,5,5)
   - 양측 스텁형 (6,4,9) — 両스텁 2·5로 갈라지고 비연속 항이 없는 것
   - 中央형 (2,4,2)·대칭 스텁형 (5,3,5) — 현행 결과와의 동치
   - property sweep s, c, e ∈ [0, 12]³: ADR-032 §3의 불변식 셋 ＋ 각 항 음수
     없음 ＋ 편측근 동시 양수 없음 ＋ s＝e에서 `splitGirderMainRow`와 동치
2. `GirderMainRow`에 `startCount?: number` 추가. JSDoc에: 始端側の本数 —
   左右で違うときだけ持つ。無ければ endCount と同じ（対称）。始端은 런 로컬
   （`GirderRun.memberOffsetsMm`의 0 쪽）。
3. 분해 함수 `decomposeGirderMainRow(row: GirderMainRow)` — ADR-032 §3의
   수식 그대로. 반환은 기존 스타일의 평평한 형태:
   `{ throughCount, startStubCount, endStubCount, centerOnlyCount,
      oneSidedCount, oneSidedAnchor?: '始端' | '終端' }`
   (oneSidedCount가 0이면 anchor는 없다).
   **기존 `splitGirderMainRow`는 이 스텝에서 지우지 마라** — girder.ts·
   geometry.ts가 아직 쓴다. 이관과 제거는 step 2다.
4. `src/domain/model/project.ts`의 `isMainRow`: `startCount`가 있으면 유한수,
   없으면 통과 (기존 레코드 호환 — ADR-032 §1).

## 하지 말 것

- `src/domain/rebar/**`·`src/lib/viewer/**` 수정 금지 — step 2다.
- `src/components/**`·`src/lib/import/**` 수정 금지 — 입력 경로는 별건 phase다.
- 배근 규준 수치 금지 — 이 함수는 본수 산술뿐이다. 규준 수치가 등장할 이유가 없다.
- `Project` schemaVersion 변경 금지 (ADR-032 §1).
- `src/domain/`의 순수성 유지 — React·DOM·three.js import 금지.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- property sweep이 존재하고, 분해식의 항 하나를 흔들면(예: 편측근의 min을
  max로) 실패한다.
- 기존 테스트 전부 통과 (splitGirderMainRow 소비자 무변경).

## 산출물

`phases/20-girder-end-asymmetry/step1-report.json`: 추가한 함수·필드,
테스트 케이스 목록, sweep 범위.
