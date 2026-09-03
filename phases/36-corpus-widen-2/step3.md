# Step 3: 断面リスト 파서를 saiki(佐伯市) 2면에 맞춰 넓혀라

## 배경

`parseSectionLists`(`src/lib/import/section-list/parse.ts`)는 발주처 3곳(ojkk·yokohama·
kani)의 표 형식에 과적합돼 있다(R10). 골든은 Claude가 독립 전사한

- `tests/fixtures/section-import/expected/saiki-fire-p1-girders.json` — 大梁リスト 24칸
  (R階 12·2階 12, 부호 15개 중 「—」 칸 제외)
- `tests/fixtures/section-import/expected/saiki-fire-p2-columns.json` — 柱リスト 10칸
  (2階·1階 × C1〜C5)

이다. 입력은 `tests/fixtures/section-import/textitems/saiki-p1.json`·`saiki-p2.json`
(step 0이 7겹 글자를 접어 정상 밀도다). step 0 실태 표에서 두 면 모두 리스트 0건이다.

알려진 어긋남(골든 notes):

- **位置 「両端 | 中央」** — 端部가 아니라 「両端」이다. `positionZone`이 「端」을 포함
  문자로 端部로 읽으므로 이미 통과할 수 있다 — 확인하고 안 되면 고쳐라.
- **2段筋 슬래시** 「6/3-D25」(1段/2段). 제품 `GirderMainRow`에 2段이 없다. **본수를
  내지 마라** — 6을 본수로 내면 지어내는 것이다. 후보는 `raw`＋issue `2段筋未対応`으로
  남기고 反映 불가로 구분한다. 골든의 `sweepGirders`류 대조는 2段 셀을 「본수
  undefined ＋ raw가 골든 문자열과 같다」로 본다.
- **柱 接合部帯筋 행** — 帯筋 행과 별도다. 帯筋 후보에 섞지 마라. 값은 별 필드로
  raw 보존하거나 무시하되 report에 적어라.
- **断面 스케치 안의 X·Y 本数** 「4-D22」「5-D22」 — 主筋 행의 값(「12-D22」)만
  主筋이다. 스케치 값을 主筋으로 오인하면 안 된다(골든 notes의 정합식
  2×(X+Y)−4로 반증 가능).
- **帯筋 기호** □·⊟·⊞가 글자로 오면 raw에 남기고 값은 「D13@100」(피치 정규화
  `normPitch`)이다.
- **스터럽 라벨** 「スターラップ」(あばら筋·ST·STP가 아니다), 「腹筋」, 「B×D」.

## 할 일

1. **골든 테스트 먼저** — `tests/section-import/parse.test.ts`의 「전사 픽스처 전 셀
   대조 (ADR-010)」 describe에 두 면을 추가하라. 大梁은 `sweepGirders`에
   `{ top: '上端筋', bottom: '下端筋', stirrup: 'スターラップ' }`로, 柱는
   `sweepColumns`로 — 스키마가 안 맞으면(位置 셀 `両端`, 2段 raw, 帯筋形状 필드)
   sweep 함수를 **확장**하라. 기대 카운트: 大梁 main·stirrup·dimension 각 24, 柱 10.
   먼저 실패하는 것을 확인한 뒤 구현하라.
2. 구현하라. 기존 골든(ojkk·yokohama·kani 7개 파일의 sweep 카운트)이 그대로여야
   한다.
3. `tests/section-import/real-pdf.test.ts`에 saiki p1·p2를 추가하라(`.cache/`가 있을 때만
   도는 로컬 통합 테스트) — 표제란을 뗀 픽스처가 원리상 못 보는 구간을 실물
   PDF로 덮는다.

## 하지 말 것

- 도면 하나에만 맞는 상수·파일명 분기를 넣지 마라. 규칙은 report에 근거 면을 적어라.
- 골든을 고치지 마라. 어긋나면 테스트를 실패한 채로 두고 report에 적고 `blocked`.
- 2段筋을 제품 스키마에 추가하지 마라 — 스키마 결정은 사람 몫이다(report에 남겨라).
- `framing-plan/**`·`runs.ts`·`textitems.ts`를 건드리지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과 — saiki 2면 sweep 통과(또는 `blocked`에 사유), 기존 7 골든 카운트 불변.
- `git diff`에 도면명 리터럴 분기 없음.

## 산출물

`phases/36-corpus-widen-2/step3-report.json`:

```json
{
  "goldens": { "saiki-fire-p1-girders.json": { "main": 0, "stirrup": 0, "dimension": 0 }, "saiki-fire-p2-columns.json": { "cells": 0 } },
  "two_layer_cells": ["G4 R階 両端 上端筋 6/3-D25", "..."],
  "joint_hoop_handling": "",
  "rules_added": [{ "rule": "", "pages_exercised": [] }],
  "existing_goldens_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
