# Step 1: 通り芯 격자 파서를 발주처 7곳의 伏図로 일반화하라

## 배경

`parseFramingPlan`(`src/lib/import/framing-plan/parse.ts`)은 발주처 2곳(yokohama·kani)의
伏図에 맞춰져 있다(R10·R15). step 0의 실태 표(`step0-report.json`)가 보여주듯 2차
코퍼스의 격자 7면은 전부 또는 일부가 실패한다. 골든은 Claude가 독립 전사한
`tests/fixtures/plan-import/expected/*-grid.json` 7개다 — 스키마는
`blocks[].x / y → { labels, spansMm, totalMm }`(合計이 도면에 없으면 `null`)이고
`notes`에 함정을 적어 두었다. 알려진 어긋남(SOURCES.md 「제2차 수집 도면의 특성」):

- **라벨**: X·Y 접두 없는 숫자(1·2·3)·라틴 대문자(A·B·C·A')·全角(Ｘ１) — ina·fuji·shibata.
  현행 `AXIS_LABEL_PATTERN`은 `[a-z]?[XY]\d+`뿐이라 `通り芯ラベル未検出`이다.
- **合計 없음＋부분합 있음** — karatsu(4,010·4,165). **쉼표 없는 치수** — hirosaki(8000·88000).
- **블록 제목이 伏図가 아닌 「柱芯線図」** — karatsu S-7 (`BLOCK_TITLE_PATTERN`은 `/伏図/`).
- **스팬 치수 열 옆에 나란한 壁面 치수 열** — fuji(合計과 맞는 쪽이 스팬).
- **부분 合計** — shibata(41,000은 1〜5 구간이고 그 오른쪽에 스팬이 더 있다).
- hirosaki가 현행 파서에서 Y축을 `縮尺不整合`으로 버리고 X축은 아예 못 내는
  **원인을 찾아 report에 적어라**(라벨 위치인지, 치수 위치인지, 쉼표인지).

## 할 일

1. **골든 테스트 먼저** — `tests/plan-import/corpus2.test.ts`(새 파일)에 7면 각각
   「blocks의 x·y 라벨 순서 · spansMm · totalMm(null이면 `totalConfirmed === false`,
   값이면 `true`이고 스팬 합과 같다)」을 `toEqual`로 고정하라. 골든 notes에 「파서가
   더 내는 것은 반증이 아니다」라고 적힌 축(shibata X)은 **앞 5축·合計까지만** 본다.
   테스트가 먼저 실패하는 것을 확인한 뒤 구현하라.
2. **라벨 패턴을 넓혀라.** 조건: 한 밴드에 라벨이 2개 이상이고 인접 라벨 중점에
   치수가 있어야 축이다(현행 규약 유지). 숫자만인 라벨은 **2자리 이하**이고 같은
   밴드의 치수(3자리 이상 또는 쉼표)와 겹치지 않는다. 全角은 `normalized()`(NFKC)로
   접는다. 새 패턴이 **기존 14면의 결과를 바꾸면 안 된다.**
3. **合計 규약.** 合計이 없으면 `totalConfirmed: false`로 내되, 부분합(연속 부분
   구간의 합과 일치하는 치수)은 `合計不一致`의 근거로 쓰지 마라. 부분 合計(shibata
   41,000)이 어느 연속 구간과 맞으면 그 구간까지 confirmed로 내는 것은 허용하되
   report에 적어라.
4. **나란한 치수 열(fuji).** 같은 밴드에 후보 치수 열이 둘이면 合計과 맞는 열을
   고르고, 合計이 없으면 격자를 내지 말고 `寸法列曖昧` issue로 거부하라 — 둘 중
   하나를 고르는 것은 지어내는 것이다.
5. **블록 제목.** `BLOCK_TITLE_PATTERN`에 「柱芯線図」를 더하라. 「軸組図」는 더하지
   마라(step 2의 영역이고, 軸組図의 스팬을 伏図 격자로 오인하면 안 된다).
6. **회귀 고정.** 기존 14면의 격자 결과가 `step0-report.json`의 실태 표와 동일해야
   한다 — 기존 테스트가 덮지 않는 면만 테스트로 고정하라.

## 하지 말 것

- 도면 하나에만 맞는 상수·파일명·발주처명 분기를 넣지 마라. 새 규칙은 **최소 2면**이
  지나가야 한다 — 1면뿐이면 report의 `rules_added`에 「1면 근거」라고 적어라.
- `MIDPOINT_TOLERANCE_PT`·`VERTICAL_RUN_GAP_RATIO`를 바꾸지 마라. 바꿔야만 지나가는
  면이 있으면 그 면을 실패로 두고 report에 적어라 — 창 설계는 사람 판단이다(phase 18).
- 골든(`expected/*.json`)을 고치지 마라. 전사가 틀렸다고 판단되면 그 면의 테스트를
  `it.fails`·`skip`으로 감추지 말고 **실패한 채로** 두고 report에 무엇이 어긋나는지
  적고 status를 `blocked`로 하라.
- `src/lib/import/section-list/**`·`framing-plan/elevation.ts`를 건드리지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과 — 7면 골든 통과(또는 `blocked`에 사유).
- 기존 14면 격자 결과 동일(테스트).
- `git diff`에 도면명·발주처명 리터럴 분기 없음.

## 산출물

`phases/36-corpus-widen-2/step1-report.json`:

```json
{
  "goldens": { "<file>": "passed|failed" },
  "rules_added": [{ "rule": "", "pages_exercised": [] }],
  "hirosaki_cause": "",
  "existing14_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
