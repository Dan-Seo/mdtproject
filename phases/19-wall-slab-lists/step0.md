# Step 0 (kind: verify): Claude의 壁リスト・スラブリスト 전사를 반증하라

**이 스텝은 검증 전용이다. 대상을 고치지 마라.**
반증이 성립하면 그것이 이 스텝의 **정상 종결**이다 — `index.json`의 status를
`"refuted"`로 쓰고 `summary`에 반증 요지를 적어라. 전사를 고치는 것은 전사자
(Claude)의 몫이다 — 고치면 검증자가 전사자가 되어 교차가 무너진다.
반증이 서지 않으면 `completed`에 무엇을 어떻게 대조했는지 적어라.

## 무엇을 검증하는가

Claude가 2026-08-26에 도면 렌더링을 눈으로 읽어 전사한 두 파일:

- `tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json`
- `tests/fixtures/section-import/expected/yokohama-kanazawa-p15-slabs-walls.json`

다음 스텝이 이 전사를 골든의 정답으로 쓴다. 전사가 틀리면 골든이 틀린 값을
고정하므로, **구현 전에** 반증을 시도한다.

## 방법

원시 픽스처(`tests/fixtures/section-import/textitems/ojkk-p4.json`·
`yokohama-p15.json`)의 TextItem을 행(같은 y·x 정렬)·열(같은 x·y 정렬)로
재구성해 전사의 **전 셀**을 대조하라:

1. 符号 목록 — 각 리스트의 marks·entries가 원시에 실재하는가, 빠진 符号은 없는가
2. 두께·径·피치의 수치와 리터럴 — 특히 교호 표기(ojkk 「D10･D13@200」 반각 ･,
   yokohama 「D10D13-@200」 구분자 없음), 반각 가나(「ﾀﾞﾌﾞﾙﾁﾄﾞﾘ」), 괄호 표기
   (「(シングル)」「(ダブル)」)가 전사와 일치하는가
3. 스코프 분류의 근거 — 「片持ちスラブ」 備考 6행, 「片持スラブリスト」·
   「耐圧版リスト」·「小梁リスト」·「片持梁リスト」 표제가 원시에 실재하는가
4. 구조 주장 — ojkk 壁リスト 첫 열이 「W10，W15」 符号 2개＋「100，150」 두께
   표기인 것, EW15 열에도 두께 표기가 「100，150」 둘인 것, yokohama
   スラブリスト에 빈 예비 행이 있는 것, 上端筋/下端筋(ojkk) vs 上筋/下筋
   (yokohama)의 용어 차이
5. 전사 notes의 사실 주장 중 raw로 확인 가능한 것 전부

**「이미지 근거」로 표시된 항목은 raw로 반증할 수 없다** (yokohama 壁リスト의
인출선 값 배치, CBW의 블록 해치 등). 그런 항목은 반증 시도 대상에서 빼고
report에 「검증 불가(이미지 근거)」로 분류하라 — 반증 불가를 반증 성립으로
세지 마라.

## 하지 말 것

- expected 파일·픽스처·파서를 수정하지 마라.
- 파서를 돌려 그 출력과 비교하지 마라 — 전사는 파서와 독립이어야 한다 (ADR-010).
  대조 상대는 원시 TextItem뿐이다.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## 산출물

`phases/19-wall-slab-lists/step0-report.json`:

```json
{
  "files": [
    {
      "file": "ojkk-akamichi-p4-walls-slabs.json",
      "cells_checked": 0,
      "mismatches": [{ "where": "리스트/符号/셀", "expected": "...", "raw": "...", "verdict": "전사 오류 | raw 재구성 한계" }],
      "unverifiable": ["이미지 근거 항목 목록"]
    }
  ],
  "verdict": "refuted | upheld",
  "summary": "index.json summary와 같은 요지"
}
```
