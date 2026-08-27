# Step 2: 뷰어가 열린 폴리라인과 45° 꼬리를 제대로 그리는지 확인한다

**전제**: step 1이 `completed`다.

## 할 일

1. `src/lib/viewer/geometry.ts`가 `closed: false`가 된 帯筋·あばら筋을 그릴 때
   ① 닫는 마지막 변을 **중복해서** 그리지 않는지(코너 A가 두 번 나온다),
   ② 45° 꼬리에서 튜브가 뒤집히거나 사라지지 않는지 확인하고, **깨지면 고쳐라**.
   `geometry.test.ts`에 두 케이스를 고정하라 — 세그먼트 수와 꼬리 끝점 좌표.
2. 5층 스트레스 案件에서 정점 수·드로우콜이 R4의 예산 안에 남는지 확인하라
   (`npx tsx scripts/perf/stress-fixture.ts 5`). 帯筋 1본당 점이 4→7로 늘므로
   **여기서 예산을 넘으면 그 사실을 report에 수치로 적고 `blocked`**.
   임의로 꼬리를 빼서 통과시키지 마라.
3. e2e로 3D가 뜨는지 확인하라 —
   `npx dev-browser --browser kijun --timeout 90 run tests/e2e/<기존 뷰어 파일>.js`.
   **`npm run build` → dev 기동 → e2e** 순서를 지켜라(dev 서버가 뜬 채 build 하면
   `.next`가 덮여 화면이 통째로 죽는데 curl은 200을 돌려준다).

## 하지 말 것

- 数量·도메인 코드 수정 금지.
- 형상 규칙을 뷰어에서 다시 정하지 마라 — 좌표는 도메인이 준 `points`가 전부다.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- **검증 스크립트를 `src/` 아래에 만들지 마라.**
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- e2e 1건 통과.

## 산출물

`phases/28-shear-hook-shape/step2-report.json`: 뷰어 변경 유무와 이유,
정점 수 실측(전/후), e2e 결과.
