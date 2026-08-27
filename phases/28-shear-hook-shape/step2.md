# Step 2: 뷰어가 꼬리를 그린다

**전제**: step 1이 `completed`다.

step 1은 `hookTails`를 **채우기만** 했다. 지금 3D에는 아무것도 안 보인다.

## 할 일

1. `src/lib/viewer/geometry.ts`의 edge 생성부(`rebar.closed`로 마지막 변을 잇는
   그 자리)에서 `hookTails`가 있으면 **`points[0]` → 각 꼬리 끝점** 세그먼트
   둘을 더하라. `closed`의 기존 처리는 **그대로 둔다** — 矩形은 여전히 닫힌다.
2. `src/components/viewer/Viewer3D.tsx`가 폴리라인을 만드는 자리도 같이 맞춰라.
   두 곳이 서로 다른 형상을 그리면 안 된다 — **같은 세그먼트 목록을 내는지**
   테스트로 고정하라(phase 27에서 平面과 3D가 각자 계산하던 것과 같은 함정이다).
3. `geometry.test.ts`에 두 케이스를 고정하라 — 矩形·円形 각각 **세그먼트 수**와
   **꼬리 끝점 좌표**. 꼬리를 빼면 실패해야 한다.
4. **`points[0]`을 かぶり·면 기준으로 읽는 경로가 무사한지 확인하라** —
   `geometry.ts`의 `:163`·`:237`·`:322`·`:445`·`:461`(step 0이 확인한 줄들).
   `points`를 안 바꿨으므로 원래 무사해야 한다. 무사함을 **테스트로 보이지 말고**
   (그건 step 0의 일이다) diff가 그 줄에 닿지 않았음을 보고서에 적어라.
5. 5층 스트레스 案件에서 정점 수·드로우콜이 R4의 예산 안에 남는지 확인하라
   (`npx tsx scripts/perf/stress-fixture.ts 5`). 帯筋 1본당 세그먼트가 4→6으로
   늘므로 **여기서 예산을 넘으면 그 사실을 report에 수치로 적고 `blocked`**.
   임의로 꼬리를 빼서 통과시키지 마라.
6. e2e로 3D가 뜨는지 확인하라 —
   `npx dev-browser --browser kijun --timeout 90 run tests/e2e/<기존 뷰어 파일>.js`.
   **`npm run build` → dev 기동 → e2e** 순서를 지켜라(dev 서버가 뜬 채 build 하면
   `.next`가 덮여 화면이 통째로 죽는데 curl은 200을 돌려준다).

## 하지 말 것

- 数量·도메인 코드 수정 금지. 좌표는 도메인이 준 것이 전부다.
- `Rebar.points`·`closed`를 바꾸지 마라.
- 형상 규칙을 뷰어에서 다시 정하지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`·`step0*-report.json`을 지우지 마라.
- **검증 스크립트를 `src/` 아래에 만들지 마라.**
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- e2e 1건 통과.

## 산출물

`phases/28-shear-hook-shape/step2-report.json`: 뷰어 변경 지점,
두 그리기 경로가 같은 세그먼트를 낸다는 것을 무엇으로 고정했는지,
정점 수 실측(전/후), e2e 결과.
