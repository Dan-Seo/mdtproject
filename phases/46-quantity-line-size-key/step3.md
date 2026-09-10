# Step 3: refute-phase — phase 46 산출물을 독립 검증한다 (verify)

## 읽어야 할 파일
- `phases/46-quantity-line-size-key/step1.md`·`step2.md`와 각 `step*-report.json`
- 이 phase 브랜치의 diff: `git diff main...HEAD --stat` 및 전체

## 작업 — 아래 주장을 반증 시도한다. 하나라도 무너지면 `refuted`
- **C1 범위**: diff가 건드린 경로가 `src/domain/quantity/index{.ts,.test.ts}`, `src/domain/model/project{.ts,.test.ts}`, `src/components/quantity/TakeoffPane{.tsx,.test.tsx}`, `src/lib/export/index{.ts,.test.ts}`, 鍵 문자열을 고정한 다른 테스트(step 1 report `tests_tightened`에 나열된 것), `docs/{ADR,RISKS}.md`, `CLAUDE.md`, `AGENTS.md`, `phases/46-*/**`의 밖으로 나가지 않았다. `src/domain/rebar/**`·`src/rulepack/**`·`tests/golden/fixtures/**`·`src/lib/import/**`은 0줄.
- **C2 값 불변**: `npm run test:golden` 통과. `main`과 HEAD에서 샘플 案件의 `buildTakeoff(createSampleProject()).lines`를 `id`를 뺀 채 비교해 동일(임시 스크립트, report에 명령).
- **C3 변이**: M1 `quantityLineId` 径 세그먼트 제거 → R17 재현 테스트가 빨강. M2 `noteFor` fallback 제거 → 구 鍵 備考 테스트가 빨강. M3 `setNote` 구 鍵 삭제 제거 → 이행 테스트가 빨강. M4 `spliceLineId` 径 세그먼트 제거 → 継手 鍵 테스트가 빨강. 원복 후 `git status --short`가 report 외 비어 있음.
- **C4 R17 재현**: `phases/45-partial-import-unsupported/step0-repro-r2.test.ts.txt`의 B1은 「plain Error에 닿는다」를 단언하므로 이 브랜치 HEAD에서는 **실패해야** 한다(임시 config로 한 번 실행). 통과하면 refuted.
- **C5 문서**: ADR-048 존재, `step2-check.py`가 `docs ok`, `python scripts/check-citations.py phases/46-quantity-line-size-key/step1-report.json phases/46-quantity-line-size-key/step2-report.json` 0.
- **C6 게이트**: `npm run lint`·`npx tsc --noEmit`·`npx vitest run` 통과(전체 테스트 수 기록).
- **C7 순수성**: `src/domain/**` 새 줄에 React·DOM·three·next import 없음, 규준 수치 리터럴 없음.

## 산출물
`phases/46-quantity-line-size-key/step3-report.json`: `{ "verdict": "upheld|refuted", "base_commit": "...", "claims": [...], "mutations": [...], "gates": {...}, "paths_verified": [...], "limits": [...] }`

## 금지사항
- 고치지 마라 — 어긋나면 `refuted`로 두고 무엇이 어긋났는지 적어라. 변이 원복은 `git checkout -- <file>`로.
