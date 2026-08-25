# Step 0: phase 14가 남긴 부채 셋을 갚는다

phase 14(`b6b56c7`)의 폐지 작업에서 셋이 남았다. 셋 다 작고 서로 독립이다.
**이 스텝은 부채 상환이다 — 파서의 동작을 바꾸는 변경은 범위 밖이다.**

## 부채 1 — 잃어버린 「0mm 후보가 나오지 않는다」 불변식

### 무슨 일이 있었는가

phase 14 step0.md가 「폐지되는 가드 5개 중 넷은 파서 출력 유래」라고 적었는데
**틀렸다. 셋이었다.** 사양을 쓴 쪽(컨트롤러)의 오산이고 구현은 사양대로
정확히 됐다. 넷째는 이것이었다(`tests/section-import/plan-grid.test.ts`,
`fa5ab24`에서 읽을 수 있다):

```
it('実図面5部のどこからも 0mm 候補が出ない')
// 机上の話ではない: yokohama-p14 の「650x1000」は pdf.js が
// `650`・`x`・`1`・`000` の4アイテムに割って出すので、狭めた閾値では
// `000` が単独セグメントになり 0mm として通っていた（4か所）。
```

이것은 파서 출력을 박은 것이 아니라 **불변식**이고, 지키던 대상은 폐지된
`grid-parse`가 아니라 **`src/lib/import/runs.ts`의 세그먼트 문턱**이다. 즉
이번 폐지에서 지키려던 자산 자체다. framing-plan의 `DIMENSION_PATTERN`
(`/^(?:\d{1,3}(?:,\d{3})+|\d{2,})$/`)은 `000`을 그대로 받아 `parseInt` → 0을
내므로 같은 고장이 그대로 성립한다.

### 컨트롤러의 실측 (단서다. 근거가 아니다 — 네가 직접 재라)

`recoverRows(items, gapRatio)`의 gapRatio를 흔들며 위 패턴에 걸리는
0 이하 세그먼트를 센 결과:

| gapRatio | yokohama-p14 | p13 | kani-p38 | yokohama-p7 |
|---|---|---|---|---|
| 2.2 (현행 기본값) | 0 | 0 | 0 | 0 |
| 0.8 | 0 | 0 | 0 | 0 |
| 0.5 | **4** | 0 | 0 | 0 |

0.5에서 나온 4건이 옛 주석의 「4か所」와 같은 수다.

### 무엇을 하라

`tests/plan-import/parse.test.ts`에 **실도면 픽스처 전부**(`tests/fixtures/
section-import/textitems/`의 8부)를 도는 가드를 세워라. 지키는 것은
「어느 페이지에서도 0mm 이하의 치수 후보가 나오지 않는다」다.

판정에 쓰는 패턴은 **framing-plan의 `DIMENSION_PATTERN` 그 자체**여야 한다.
테스트에 정규식을 복사해 두면 `parse.ts` 쪽이 바뀔 때 가드가 조용히
엇나간다 — `parse.ts`에서 그 상수를 `export` 해서 테스트가 import하게 하라.
로직은 건드리지 말고 `export` 키워드만 붙인다. (`runs.ts`가
`VERTICAL_RUN_GAP_RATIO`·`PROXIMITY_MULTIPLIER`를 export하는 것과 같은 결이다.)

세그먼트를 얻는 경로는 `runs.ts`의 `recoverRows`와 `verticalRuns` 둘 다다 —
가로쓰기만 보면 세로 런 쪽 문턱이 안 걸린다.

### 이 가드의 한계를 함께 적어라

위 표가 말하듯 이 가드는 **0.8에서는 침묵하고 0.5에서야 운다.** 촘촘한
경계가 아니라 굵은 트립와이어다. 테스트 주석에 그 사실과, 네가 실측한
**실제로 깨지기 시작하는 gapRatio**를 적어라 — 0.8과 0.5 사이를 좁혀
소수점 첫째 자리까지 찾고, 그 수를 주석에 남긴다. 「테스트가 있다」가
「안전하다」로 읽히지 않게 하는 것이 이 문장의 목적이다.

## 부채 2 — 테스트 헬퍼 `v()`의 `+4` 하드코딩

phase 14 step 1의 반증(주장 C, `refuted`)이다. `src/lib/import/framing-plan/
elevation.test.ts`의 헬퍼:

```ts
function v(str: string, x: number, y: number): TextItem {
  return { str, x, y: y + 4, w: 8, h: 0, rot: -90 }
}
```

주석은 「원점은 진행량 `w`의 절반만큼 아래」라고 말하는데 코드는 `4`를
박아둬 `w`를 따라가지 않는다. codex의 실측: `w=12`로 바꾸면 레벨이
98·198·298·398(기대 100·200·300·400), `w=6`이면 101·201·301·401.
같은 파일의 필터 `item.y !== 354`도 `350 + 4`이지 `350 + w/2`가 아니다.

**폭을 이름 있는 상수로 빼고 오프셋을 거기서 유도하라.** 필터의 `354`도
같은 상수로 표현한다. 기대값(100·200·300·400)은 **바꾸지 마라** — 그것이
이 헬퍼가 재현하려는 물리량이다.

## 부채 3 — 옮긴 가드에 근거 주석이 없다

phase 14가 `tests/plan-import/parse.test.ts`로 옮긴 가드
(`断面リスト pages do not produce framing grids`)에 주석이 한 줄도 없다.
원본은 「왜 하필 이 4부인가」의 근거를 달고 있었는데 그것이 사라져서, 지금은
읽는 사람이 파일 목록의 유래를 알 수 없다.

주석을 세워라. 담을 것은 둘이다:

1. **왜 이 페이지들이 위험한가** — `断面リスト`의 部材 符号 `X2`·`X3`(`Y4`·`Y5`)가
   通り芯 라벨의 모양을 그대로 갖는다는 실측. 원문 근거는 `fa5ab24`의
   `tests/section-import/plan-grid.test.ts`에 있다.
2. **framing-plan이 침묵하는 기전** — 옛 `grid-parse`는 라벨 `X2`·`X3`를
   **찾은 뒤** 「스팬 1본 축은 검산이 공회전한다」로 거절했다(`区間数不足`).
   framing-plan은 `通り芯ラベル未検出`을 낸다 — 즉 애초에 라벨을 못 찾는다.
   **왜 못 찾는지를 네가 직접 확인해서 적어라.** 결과가 같아도 기전이 다르면
   나중에 한쪽이 바뀔 때 가드가 무엇을 지키고 있었는지 알 수 없다.

## AC

1. `npm run test` 전부 통과, `npm run test:golden` 전부 통과
2. `npx tsc --noEmit` 무출력, `npm run lint` errors 0
   (`route.test.ts:161`의 `_omitted` warning 1건은 기존 것이다)
3. **부채 1의 가드가 반증 가능하다**: `runs.ts`의 `DEFAULT_SEGMENT_GAP_RATIO`를
   임시로 0.5로 낮추면 그 가드가 실패한다. 확인 후 **원복하라.**
4. **부채 2의 수정이 규약을 표현한다**: 헬퍼의 폭 상수를 12로, 또 6으로 바꿔도
   `elevation.test.ts`가 전부 통과한다(레벨 기대값 100·200·300·400이 유지된다).
   확인 후 **8로 원복하라.** 통과하지 않으면 원인을 report에 적고 `blocked`로
   멈춰라 — 기대값을 고쳐서 맞추지 마라.

## 산출물

`phases/15-plan-guard-debts/step0-report.json`:

```json
{
  "debt1": {
    "guard": "테스트 이름",
    "fixtures": ["실제로 돈 픽스처"],
    "measured": "각 픽스처의 0mm 후보 수(현행 문턱)",
    "breaking_gap_ratio": "0.8~0.5 사이에서 네가 좁혀 찾은 값",
    "pattern_source": "export한 상수 이름과 파일"
  },
  "debt2": {"constant": "...", "widths_verified": [12, 6], "restored": true},
  "debt3": {"mechanism": "framing-plan이 p14에서 라벨을 못 찾는 이유(네가 확인한 것)"},
  "controller_measurement_mismatch": "어긋난 항목 또는 none",
  "gates": {"test": "...", "golden": "...", "tsc": "...", "lint": "..."},
  "mutation": {"gap_ratio": {"failing_test": "...", "restored": true}}
}
```

## 하지 말 것

- **`scripts/execute.py`를 실행하지 마라** — 하네스가 하네스를 부르는 재귀다(AGENTS.md).
- **파서의 동작을 바꾸지 마라.** `framing-plan/parse.ts`에서 허용되는 변경은
  `DIMENSION_PATTERN`에 `export`를 붙이는 것 하나뿐이다. `runs.ts`의 문턱 상수는
  AC 3의 뮤테이션 동안만 만지고 반드시 원복한다.
- **기대값을 고쳐서 테스트를 통과시키지 마라.** 부채 2에서 100·200·300·400이
  안 나오면 그것은 헬퍼가 아니라 다른 것이 틀렸다는 신호다 — 멈추고 적어라.
- 새 픽스처를 만들지 마라. 실도면 픽스처는 `tests/fixtures/section-import/
  textitems/`의 8부가 전부다.
- `docs/ADR.md`를 고치지 마라. 이 스텝에 결정은 없다.
- 폐지된 `src/lib/import/plan/`을 되살리지 마라.
