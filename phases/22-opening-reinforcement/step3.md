# Step 3: 未転記(設計長さ 0) 행의 데이터 손실을 막는다

**전제**: step 2까지 `completed`. Claude의 교차검증이 잡은 결함 하나를
고친다. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 결함 (재현됨)

平面 입력의 補強筋 행 추가 기본값은 `lengthMm: 0`이다 — 제품이 값을
발명하지 않기 위해서고, 그 자체는 옳다. 그런데 `src/domain/model/project.ts`
검증기는 `lengthMm > 0`을 요구한다. 행만 추가하고 길이를 넣기 전에
자동저장(500ms 디바운스)되면, 재로드의 `deserializeProject`가
`Project shape mismatch`로 던지고 **기동 경로는 복원 불가 기록을 조용히
버리고 샘플로 착지하므로 案件 전체가 사라진다** (M4).
재현: `serializeProject`→`deserializeProject` 왕복에서 `lengthMm: 0` 행이
`REJECTED: Project shape mismatch`, `1800`은 accepted.

## 할 일 (TDD — 재현 테스트 먼저)

1. **재현 테스트 먼저**: reinforcements에 `lengthMm: 0` 행이 있는 Project의
   serialize→deserialize 왕복이 성공해야 한다는 테스트를
   `src/domain/model/project.test.ts`에 추가하고, 수정 전에 실패하는 것을
   확인한 뒤 고쳐라 (report에 그 사실을 적어라).
2. **검증 완화**: `lengthMm`은 「**0 이상**의 유한수」로 (0 ＝ 未転記).
   count·size 검증은 그대로.
3. **산정**: `lengthMm === 0` 행은 `Rebar`를 내지 않는다 — 未転記를 質量
   0으로 세우면 内訳에서 전사된 것처럼 보인다. 과소는 기존 상시 고지가
   안내한다 (ADR-034 §5·보충). `wall.ts`·`slab.ts` 양쪽. 테스트로 고정하라.
4. **UI 표식**: `src/components/plan/PlanEditor.tsx`의 補強筋 행에
   `lengthMm === 0`이면 未転記 표식을 표시하라 — 기존
   「▲ 内法をはみ出しています」 방식. 문구는 ja·ko locale 키로
   「▲ 未転記 — 数量に計上されません」 취지. 컴포넌트 테스트로 고정하라.
5. **기존 골든·기존 테스트의 기대값 수정 금지** — 바꿔야 통과한다면
   `blocked`로 멈추고 사유를 적어라.

## 하지 말 것

- 위 범위 밖의 리팩터링 금지. 룰팩(YAML) 수정 금지. e2e 신규 금지.
- 배근 규준 수치 금지.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/22-opening-reinforcement/step3-report.json`:
재현 테스트가 수정 전 실패했음을 명시하고, 변경 파일·게이트 결과를 적어라.
