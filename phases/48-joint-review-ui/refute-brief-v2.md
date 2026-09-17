# 재반증 요청 (v2) — phases/48-joint-review-ui/v2/*

앞선 반증(`spec-refutation.md`)을 반영해 사양을 고쳤다. **v2 디렉터리의 README.md·step1~8.md·index.json만** 대상으로 다시 반증하라. 고치지 말고 반증만.

확인할 것(각각 근거를 파일:행으로):
1. 앞선 반증의 각 지적이 v2에서 실제로 해소되었는가 — 해소되지 않은 것이 있으면 어느 지적·어느 파일·왜.
2. v2가 참조하는 코어 함수·타입·필드 이름이 실제 코드(`src/domain/review/*`, `src/lib/review/*`, `src/lib/viewer/building.ts`, `src/lib/store.ts`, `src/lib/persist/*`)에 그 시그니처로 존재하는가. 없는 것을 열거.
3. README 「샘플 案件의 사실」의 수치(−22, +25, 大梁 2개/3개, 支持柱 id)가 `src/domain/review/joint.test.ts`·`src/lib/review/geometry-check.test.ts`·샘플 案件과 일치하는가.
4. 각 step이 1800초 안에 끝날 크기인가(파일 수·테스트 수 기준으로 판단, 근거 제시).
5. 테스트 항목 중 「구현이 틀려도 통과할」 것(반증 불가능한 것)이 있는가.
6. 사양 안에 서로 모순되는 지시가 있는가(예: step 3의 플레이스홀더와 step 5의 대체, 결정 4와 고지문).

산출: `phases/48-joint-review-ui/spec-refutation-v2.md` — 맨 위에 `verdict: refuted` 또는 `verdict: upheld`, 이어서 항목별 근거. 끝나면 「완료」 한 줄만 출력.
