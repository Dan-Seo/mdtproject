# Step 3: 편측근 slot이 中央筋과 겹치는 형을 고쳐라

## 배경

Claude의 diff 검증에서 발견한 경계 결함이다. `generateGirderRebar`가
편측근(oneSided)의 `slotStart`를 「通し ＋ anchor쪽 스텁」으로 주는데,
**中央筋과 편측근이 공존하는 형**(c > max(s, e)이면서 s ≠ e — 예: 下筋
s=2·c=9·e=5)에서는 中央筋(slotStart=通し)과 편측근이 中央 x구간에서 같은
枠을 차지해 3D가 이중으로 그려진다. 数量은 무영향이고 현 코퍼스에 이 형은
없지만, step 2 사양의 뷰어 불변식(「같은 x구간에서 같은 枠에 두 그룹이
겹치지 않는다」) 위반이다.

수식 사실 둘 (검산 후 주석에 남겨라):
- anchor쪽 스텁(side > c 요구)과 中央筋(c > 양측 요구)은 **상호 배타**다 —
  동시에 양수일 수 없다.
- 따라서 편측근의 slotStart ＝ 通し ＋ 中央筋 ＋ anchor쪽 스텁이면
  (셋 중 스텁·中央筋은 한쪽이 0) 어느 형에서도 겹치지 않고, G55형
  (4,5,8)의 기존 값 7도 변하지 않는다.

## 할 일

1. **테스트 먼저** — (2,9,5)형 회귀:
   - 엔진: 해당 형의 上端 또는 下端 행에서 생성된 カットオフ筋들의
     `axisSlotStart` 구간(각 행 slotStart부터 본수만큼)이 서로소인 것
   - 뷰어: `geometry.test.ts`의 ADR-032 케이스와 같은 방식으로 (2,9,5)형 —
     始端 x에서 distinct z 2, 中央 x에서 9, 終端 x에서 5, 그리고 中央 x의
     z가 전부 서로 다른 것
2. `src/domain/rebar/girder.ts`의 편측근 `slotStart`를
   `通し ＋ centerOnlyCount ＋ anchor쪽 스텁`으로 고쳐라.

## 하지 말 것

- 이 수정 외의 어떤 파일·로직도 건드리지 마라 (골든 기대값 수정 금지 —
  G55형의 slotStart 7은 변하지 않아야 하고, 변하면 수식 사실이 틀린 것이니
  `blocked`로 멈추고 사유를 적어라).
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- (2,9,5)형 회귀 테스트가 존재하고, slotStart를 이전 식으로 되돌리면 실패한다.
- 기존 테스트·골든 전부 무변경 통과.

## 산출물

`phases/20-girder-end-asymmetry/step3-report.json`: 수정 전후 slotStart 표
((2,9,5)형·(4,5,8)형), 추가 테스트 목록.
