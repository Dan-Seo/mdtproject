# Step 0: ADR-040의 전제를 반증하라 (검증 전용)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 아래 전제를 하나씩
원문·코드로 대조하고, **어긋나는 것이 하나라도 있으면 `refuted`로 끝내라.**
고치라는 것이 아니라 **틀렸음을 보이라**는 것이다. 전부 성립하면 `completed`.

## 읽을 것

- `docs/ADR.md`의 **ADR-040**(이 phase), ADR-019(작도 규칙), ADR-023(confidence)
- `.cache/001888816.pdf` (公共建築工事標準仕様書 令和7年版) — 5.3.2, 表5.3.1.
  **PDF 페이지 ＝ 인쇄 페이지 ＋ 5.**
- `.cache/001178206.pdf` (公共建築数量積算基準) — 1通則2)
- `src/domain/rebar/column.ts`, `src/domain/rebar/girder.ts`,
  `src/rulepack/jp-mlit/bend.yaml`, `tests/golden/fixtures/fabrication-length.json`

## 전제 목록

| id | 전제 |
|---|---|
| `quantity-excludes-hook` | 数量積算基準 1通則2)가 帯筋·あばら筋의 設計長さ에서 フック을 계상하지 않는다고 **원문에 명시**한다. 즉 `points`를 바꿔도 数量은 불변이다. |
| `points-not-read-by-quantity` | 数量·内訳 경로가 `Rebar.points`·`closed`를 **읽지 않는다**. `src/domain/quantity/**`·`src/lib/**`에서 실제로 확인하라(그레프로 끝내지 말고 호출 경로를 따라가라). |
| `hook-mandatory-for-shear-bars` | 標準仕様書 5.3.2(2)에 「帯筋、あばら筋及び幅止め筋」이 末端部にフックを付ける 대상으로 **열거**돼 있다. |
| `hook135-tail-is-6d` | 룰팩 `bend.hook135`의 값 6d의 근거가 表5.3.1의 **折曲げ図(이미지) 판독**이고, 그 표의 활자 열은 折曲げ内法直径(3d/4d/5d)뿐이다. 즉 6d는 활자 전사가 아니다. |
| `note1-text-exists` | 表5.3.1 **注1**의 문언이 「片持ちスラブ先端、壁筋の自由端側の先端で90°フック又は135°フックを用いる場合には、余長は4d 以上とする。」이고, 이것이 **활자**로 있다(이미지가 아니다). |
| `note1-is-conditional` | 그 注1이 「用いる場合には」라는 **조건절**이어서, 그 자리에 훅이 있는지 자체를 원문이 정하지 않는다. |
| `note1-untranscribed` | 이 注1이 `docs/ADR.md`에는 2026-08-27 ADR-037 보충으로 들어와 있으나, **`src/rulepack/**`·`tests/golden/fixtures/spec-r7-ch5.json`에는 없다**. 두 곳을 실제로 확인해 보고하라. |
| `rect-hoop-closed-today` | 지금 矩形 帯筋·あばら筋의 `points`가 4점·`closed: true`이고, 円形 帯筋도 `closed: true`다. |
| `deviation-ledger-matches` | `fabrication-length.json`의 두 `deviation-from-source` 케이스의 `missingMm`(156)이 `2 × 6d × 13`과 일치하고, `withHookTailMm`(2956·2056)이 `expectedFabricationLengthMm ＋ missingMm`과 일치한다. |
| `cantilever-rect-single-source` | phase 27의 리뷰 수정 뒤, 平面(`PlanEditor.tsx`)과 3D(`building.ts`)가 片持床板의 矩形을 **같은 도메인 함수**(`cantileverSlabRect`)에서만 얻는다. 두 곳에 같은 계산이 남아 있지 않음을 보이고, 그 함수를 흔들면 양쪽 테스트가 **모두** 깨지는지 확인하라(확인용 수정은 되돌려라). |
| `tail-direction-unspecified` | 表5.3.1도 5.3.2도 **훅을 어느 코너에 두는지**를 정하지 않는다. 원문에서 위치를 정하는 문언을 찾아보고 없음을 보여라. |

## 방법

- 원문 대조는 페이지 텍스트를 **인용**하라. 「그렇게 보인다」는 검증이 아니다.
- 코드 대조는 **반례가 되는 코드 경로**를 제시하라.
- 표·셀 구조가 걸리면 span 좌표까지 파고들어라(phase 27 step 0의 방식).

## 산출물

`phases/28-shear-hook-shape/step0-report.json`:

```json
{
  "premises": [
    {"id": "...", "verdict": "upheld|refuted", "evidence": "원문 인용 또는 파일:행", "note": "..."}
  ],
  "verdict": "upheld|refuted"
}
```

검증 스크립트를 쓸 거면 **`phases/28-shear-hook-shape/` 안에** 두어라.
`src/`·`tests/` 아래에 만들지 마라.

## 하지 말 것

- 대상 코드(`src/**`·`tests/**`·`docs/**`)를 수정하지 마라. **반증만 하라.**
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## 종결

전제가 전부 성립하면 `completed`. 하나라도 어긋나면 **`refuted`** —
무엇이 어떻게 어긋났는지 report에 적고 멈춰라. 고치지 마라.
