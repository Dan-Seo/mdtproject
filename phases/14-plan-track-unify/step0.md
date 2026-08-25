# Step 0: retire-grid-parse — 伏図 파서를 framing-plan 하나로 합친다

사용자 결정이다: **伏図 트랙은 `src/lib/import/framing-plan/`으로 간다.**
`src/lib/import/plan/`(ADR-031 구현)은 폐지한다. 이 스텝은 그 폐지와,
폐지로 잃는 검증 자산 중 **지킬 가치가 있는 것만** 옮기는 일이다.

## 무슨 일이 있었는가

2026-08-25 머지(`54e2166`)에서 병렬 세션 둘이 같은 머지 베이스에서 각자
伏図 파서를 만든 것이 드러났다. 로컬은 `framing-plan`(通り芯 그리드 ＋ 부재
배치 ＋ 軸組図 階高, UI 배선 완료), origin은 `plan/grid-parse`(通り芯과 스팬
치수만, 파서·테스트만). ADR 번호까지 겹쳐(둘 다 ADR-030) origin 쪽을
ADR-031로 개번해 두 구현을 **둘 다 보존한 채** 머지했고, 통합 방향은 열린
과제로 남겼다. 이 스텝이 그 과제를 닫는다.

## 읽어야 할 파일

- `docs/ADR.md`의 ADR-030·ADR-031 (두 항 전문. ADR-031 머리의 「번호 정정」 주석 포함)
- `src/lib/import/plan/grid-parse.ts`·`types.ts` (폐지 대상)
- `tests/section-import/plan-grid.test.ts` (폐지 대상 테스트 — 여기서 하나를 건진다)
- `src/lib/import/framing-plan/parse.ts` (남는 쪽)
- `tests/plan-import/parse.test.ts` (남는 쪽의 실도면 대조)

## 설계 — 이대로 구현하라

### 1. 폐지

삭제 대상은 셋이다. 이 셋 말고는 지우지 마라.

- `src/lib/import/plan/grid-parse.ts`
- `src/lib/import/plan/types.ts`
- `src/lib/import/plan/grid-parse.test.ts`

`tests/section-import/plan-grid.test.ts`는 **삭제가 아니라 이동·개작**이다(아래 2).

폐지 후 `src/lib/import/plan/` 디렉터리는 비어야 한다. 확인 방법은 AC에 있다.
**주의**: `src/components/plan/`은 UI 컴포넌트라 무관하다. 지우지 마라.

### 2. 잃으면 안 되는 가드 하나를 옮긴다

폐지되는 테스트 파일에는 회귀 가드가 5개 있는데, 넷은 `parseGrid`의 출력을
그대로 박은 것이라(파일 자신이 「파서 출력 유래. 実測 골든이 아니다」라고
적고 있다) 파서와 함께 사라지는 것이 맞다. **하나만 다르다**:

> `【회귀 가드 ─ 날조 0건(독립 리뷰 🔴1)】yokohama-p14 X는 구간 안 치수가
> 정확히 1개인데도 격자를 만들지 않는다`

이것은 파서 출력이 아니라 **「이 페이지에서 격자가 나오면 그것은 날조다」**라는
독립된 사실이고, 断面リスト 페이지의 符号 `X2`·`X3`가 通り芯 라벨 모양을 그대로
갖고 있다는 실측이 근거다. 파서가 바뀌어도 이 사실은 남는다.

`tests/plan-import/parse.test.ts`에 **framing-plan을 대상으로 다시 세워라.**
컨트롤러가 실측한 현 동작(2026-08-25, `parseFramingPlan`):

| 픽스처 | grids | issues |
|---|---|---|
| `yokohama-p14` (断面リスト) | 0개 | `通り芯ラベル未検出` |
| `yokohama-p13` (断面リスト) | 0개 | `通り芯ラベル未検出` |
| `ojkk-p2`·`ojkk-p3` (断面リスト) | 0개 | `通り芯ラベル未検出` |

**伏図가 아닌 4부에서 격자가 하나도 나오지 않는다**를 고정하라. 위 표를 그대로
기대값으로 쓰되, **네 값이 맞는지 네가 직접 돌려서 확인하고 쓰라** — 컨트롤러의
측정은 단서이지 근거가 아니다. 어긋나면 표를 믿지 말고 실제 출력을 적은 뒤,
report에 「컨트롤러 측정과 어긋난 항목」으로 남겨라.

### 3. ADR-031을 폐지 결정으로 갱신한다

**항 자체를 지우지 마라.** ADR은 결정의 역사이고, 이 항의 실측(노이즈 38개 중
스팬 3개, ③-1·③-2의 두 차례 정정)은 지워지면 다시 살 수 없는 관측이다.

ADR-031 머리의 「번호 정정」 주석 블록을 **「폐지」 주석으로 바꿔** 다음을 담아라
(문장은 네가 쓰되, 이 셋이 반드시 들어가야 한다):

1. **상태**: 이 항은 폐지되었다(superseded by ADR-030). 2026-08-25 사용자 결정.
2. **번호 레이스의 경위**: 병렬 세션 둘이 같은 번호로 각자 ADR-030을 썼고,
   머지 시 이 항을 ADR-031로 개번했다는 사실(지금 주석에 있는 내용을 살린다).
3. **무엇이 살아남았는가**: 구현(`src/lib/import/plan/`)은 삭제되었으나
   ① 「合計와 맞는 조합만 채택한다」는 자기 검산의 **아이디어**와
   ② 「스팬 1본 축은 검산이 원리상 아무것도 배제하지 못한다」(③-2 정정)는 **관측**,
   ③ 좌표 규약을 한 곳에 두는 원칙(④)은 `runs.ts`에 실제로 반영되어 남아 있다.
   이 항은 그 근거 문서로 남는다.

ADR-030 쪽에도 **한 문단**을 더해라: 伏図 트랙이 framing-plan 하나로 정리되었고,
경쟁 구현이었던 ADR-031이 폐지되었다는 사실과, **그 대가**를 적어라 —
framing-plan은 合計를 **선택적** 검산으로 쓰므로(`totalConfirmed`), 合計가 없는
도면에서도 위치 정합과 축척 일관성만으로 그리드를 낸다. ADR-031이 「合計 없으면
값을 내지 않는다」로 막던 자리가 열려 있다는 뜻이다. **이것을 고치라는 것이
아니다** — 열려 있다는 사실을 적으라는 것이다. 근거 없이 문턱을 조이면 실도면
커버리지가 조용히 줄어든다.

### 4. 문서 참조 정리

`docs/`와 `CLAUDE.md`·`AGENTS.md`에서 `plan/grid-parse`·`parseGrid`·
`dimensionTexts`·`axisLabels`를 **경로나 API로 가리키는** 서술이 있으면 갱신하라.
ADR-031 안의 자기 서술은 위 3의 폐지 주석이 처리하므로 손대지 마라.
`docs/MILESTONES.md`의 도면 인식 트랙 서술에 두 구현이 병존하는 것처럼 적혀
있으면 하나로 정리하라. **없으면 만들지 마라** — 찾은 것만 고친다.

## AC

1. `grep -rn "import/plan\b\|from '.*lib/import/plan/" src tests --include=*.ts --include=*.tsx` → 0건
   (`framing-plan`·`components/plan`은 매치되지 않는다. 매치되면 정규식을 좁혀라)
2. `ls src/lib/import/plan` → 디렉터리가 없거나 비어 있다
3. `npm run test` 전부 통과, `npm run test:golden` 전부 통과
4. `npx tsc --noEmit` 무출력, `npm run lint` errors 0
   (`route.test.ts:161`의 `_omitted` warning 1건은 기존 것이다. 그것만 남아야 한다)
5. 2의 이동된 가드가 **반증 가능하다**: `parseFramingPlan`의 라벨 정규식
   (`AXIS_LABEL_PATTERN`)을 `断面リスト`의 符号도 라벨로 받도록 임시로 느슨하게
   하면 그 테스트가 실패한다. 확인 후 원복하라.

## 산출물

`phases/14-plan-track-unify/step0-report.json`:

```json
{
  "removed": ["삭제한 파일 경로"],
  "guard_moved": {"from": "...", "to": "...", "measured": "네가 직접 돌려 확인한 4부의 grids·issues"},
  "controller_measurement_mismatch": "어긋난 항목 또는 none",
  "adr": {"031": "폐지 주석 요지", "030": "추가한 문단 요지"},
  "docs_touched": ["갱신한 문서"],
  "mutation": {"mutation": "AXIS_LABEL_PATTERN 완화", "failing_test": "...", "restored": true},
  "gates": {"test": "...", "golden": "...", "tsc": "...", "lint": "..."}
}
```

## 하지 말 것

- **`scripts/execute.py`를 실행하지 마라** — 하네스가 하네스를 부르는 재귀다(AGENTS.md).
- `src/lib/import/framing-plan/`의 **파서 로직을 고치지 마라.** 이 스텝은 폐지와
  가드 이동이다. 커버리지를 늘리거나 문턱을 조이는 변경은 범위 밖이다.
- ADR-031 항을 삭제하지 마라. ADR-030의 기존 문장도 고치지 마라 — **추가만** 한다.
- `runs.ts`를 건드리지 마라. origin 트랙의 좌표 규약 수정이 거기 살아 있고,
  그것이 이 폐지에서 지키려는 자산이다.
- 새 픽스처를 만들지 마라. 실도면 픽스처는 `tests/fixtures/section-import/textitems/`의
  8부가 전부다.
- `src/components/plan/`을 지우지 마라 — 이름이 비슷할 뿐 UI 컴포넌트다.
