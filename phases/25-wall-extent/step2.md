# Step 2: 3D·平面 표시를 범위대로 세운다

**전제**: step 1이 `completed`. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 배경

step 0 report의 `consumers` 목록이 무대다 — `src/lib/viewer/geometry.ts`
(`carveBox`·`clipSegments`), `src/lib/viewer/building.ts`,
`src/components/viewer/Viewer3D.tsx`, `src/components/plan/PlanEditor.tsx`.
범위가 지정된 벽은 콘크리트 상자도 배근도 그 범위에만 서고, 開口의 국소
좌표 원점은 **범위의 원점**이다 (ADR-037 §6).

## 할 일

1. **콘크리트 상자** — 범위가 지정된 벽의 상자를 범위대로 만들고 anchor대로
   놓아라(`下端`은 바닥에, `上端`은 上部大梁 밑면에, `始端`/`終端`은 그 柱면에
   붙는다). 建物 뷰·部材 뷰 둘 다.
2. **배근 원점** — 철근 `points`는 도메인이 이미 범위 기준으로 낸다(step 1).
   뷰어가 벽 부재를 놓는 원점이 범위 원점과 어긋나지 않는지 확인하고,
   어긋나면 뷰어 쪽 오프셋을 고쳐라 — 값을 도메인에서 새로 만들지 마라.
3. **開口 도려내기** — `carveBox`·`clipSegments`가 범위 원점을 쓰도록 하라.
   범위＋開口를 함께 가진 벽으로 테스트를 고정하라(欠除이 이중이 되지 않을 것).
4. **平面 뷰 표시** — `PlanEditor`가 부분 벽을 전 스팬으로 그리지 않게 하라.
   부분 길이면 그 구간만, 부분 높이면 평면에서는 구간이 같으므로 **범위 표기**
   (예: 「腰壁 H=900」 취지의 라벨 또는 구분 표시)를 내라. 새 페인·새 모드
   금지 — 기존 표시 체계 안에서다.
5. **테스트** — 기하 단위 테스트(`geometry.test.ts` 등)로 범위 상자·도려내기를
   고정하고, `PlanEditor.test.tsx`에 부분 벽 표시 1건을 고정하라.
   e2e 신규 금지 — 기존 `tests/e2e/uc21-opening.js`가 깨지면 그 스크립트를
   갱신하되 실행 검증은 리뷰어가 한다(이 스텝에서 dev 서버를 띄우지 마라).

## 하지 말 것

- `src/domain/**` 수정 금지 — 필요해지면 `blocked`.
- 새 3D 표현(치수선·해칭 등) 추가 금지. 배근 규준 수치 금지.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/25-wall-extent/step2-report.json`:
상자·원점·도려내기의 변경 요지, 고정한 테스트, 게이트 결과.
