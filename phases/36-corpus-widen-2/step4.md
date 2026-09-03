# Step 4: 断面リスト 파서를 ina·fuji·karatsu 3면에 맞춰 넓혀라

## 배경

step 3이 saiki를 닫았다. 남은 골든 셋(Claude 독립 전사):

- `tests/fixtures/section-import/expected/ina-pump-p7-lists.json` — 大梁 2칸(G1·GA), 地中梁
  3칸(FG1·FGA·FGB, 스코프 밖), 小梁 1칸(B1, 스코프 밖), 柱는 **스케치 주기형**(표
  후보 0이어야 한다). 壁·スラブ는 미전사.
- `tests/fixtures/section-import/expected/fuji-kanritou-p20-lists.json` — 柱 4칸(2C1·1C1·
  B1C1·B1C2), 梁 1열이 부호 3개(RG1·2G1·1G1 — 후보 3), 小梁 3(RB1·B1·B2, 스코프 밖).
  スラブ·壁은 미전사(현행 파서가 スラブ 6칸을 읽는다 — 그대로 두라).
- `tests/fixtures/section-import/expected/karatsu-karayaku-s4-foundation-girders.json` —
  地中梁 세로형 표, 부호 6(FG1·FG2·FG3·FG4·FCG·FB, 전부 스코프 밖).

입력은 `textitems/ina-p7.json`·`fuji-p20.json`·`karatsu-shousai-p1.json`. 알려진
어긋남(골든 notes):

- **제목 뒤 축척** 「大梁リスト 1/30」「地中梁リスト 1/30」 — 정확 일치로 찾으면 못 찾는다.
- **빈 STP·腹筋 셀**(ina 大梁) — 頭注 「特記なき限り STP □-D10-@200 / 腹筋 2-D10」이
  기본값이지만 **채우지 마라**. 후보는 `undefined`. 特記 기본값 반영은 이 phase의
  결정 밖이다(report에 남겨라).
- **階가 표 안의 행**(fuji 「階: 2階·1階·地階」)이고 **부호에 階 접두**(2C1·1C1·B1C1).
  ina는 셀 안에 「R階」「1階」가 있다.
- **피치 표기** 「D10-100@」「D10-200@」「D10-1,000@」(@가 숫자 뒤, 쉼표 포함) —
  `normPitch`가 같은 값으로 접어야 한다.
- **符号 셀에 부호 여럿** 「RG1, 2G1, 1G1」(fuji, 箇所 행 「屋根梁, 2階梁, 1階梁」 대응)·
  「FG1, FG2」「FG3, FG4, FCG」(karatsu) — 부호별 후보로 펼치고 원문 셀을 raw에 남긴다.
- **치수 별표** 「350*700」(karatsu), 행 라벨 「上筋」「下筋」「STP.」(마침표).
- **스터럽 기호** □·▥가 글자로 오면 raw에 남기고 값만 낸다(step 3과 같은 규약).

## 할 일

1. **골든 테스트 먼저** — `tests/section-import/parse.test.ts` 「전사 픽스처 전 셀
   대조 (ADR-010)」에 3면을 추가하라. 골든 스키마가 `lists[]`(ina·fuji)와 세로형
   `entries[]`(karatsu)라 기존 sweep과 다르면 sweep 함수를 확장하거나 새로 쓰되
   **셀 하나라도 다르면 실패**해야 한다. 스코프 밖 리스트(地中梁·小梁)는 「셀은
   읽되 후보가 스코프 밖으로 구분된다」를 본다. ina 柱는 「표 후보 0」을 본다.
   먼저 실패하는 것을 확인한 뒤 구현하라.
2. 구현하라. 기존 골든 7개＋saiki 2개의 카운트가 그대로여야 한다.
3. `real-pdf.test.ts`에 ina p7·fuji p20·karatsu S-4를 추가하라(fuji는 CMap 옵션이
   있어야 읽힌다 — step 0의 `pdfDocumentOptions`를 쓴다).

## 하지 말 것

- 도면 하나에만 맞는 상수·파일명 분기를 넣지 마라.
- 골든을 고치지 마라. 어긋나면 실패한 채로 두고 report에 적고 `blocked`.
- 特記 기본값을 빈 셀에 채우지 마라. 2段筋·特記 반영은 사람 결정이다.
- `framing-plan/**`·`runs.ts`·`textitems.ts`를 건드리지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과 — 3면 골든 통과(또는 `blocked`에 사유), 기존 9 골든 카운트 불변.
- `git diff`에 도면명 리터럴 분기 없음.

## 산출물

`phases/36-corpus-widen-2/step4-report.json`:

```json
{
  "goldens": { "<file>": { "cells": 0, "scopeOutCells": 0, "status": "passed|failed" } },
  "rules_added": [{ "rule": "", "pages_exercised": [] }],
  "deferred_decisions": ["特記 기본값 반영", "..."],
  "existing_goldens_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
