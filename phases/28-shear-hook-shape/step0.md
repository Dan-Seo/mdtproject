# Step 0: ADR-040(정정판)의 전제를 반증하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 아래 전제를 하나씩
원문·코드로 대조하고, **어긋나는 것이 하나라도 있으면 `refuted`로 끝내라.**
고치라는 것이 아니라 **틀렸음을 보이라**는 것이다. 전부 성립하면 `completed`.

이 스텝은 `gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

## 앞선 반증

2026-08-27 이 phase의 첫 시도에서 너는 전제 둘을 반증했다
(`phases/28-shear-hook-shape/step0-report.json`이 그 기록이다):

- `points-not-read-by-quantity` — `quantityLineId`가 `points`를 읽는다
- `quantity-excludes-hook` — 原文 부분은 성립하나 「따라서 数量 불변」이라는
  복합 주장은 성립하지 않는다

**그 반증은 받아들여졌다.** ADR-040에 2026-08-27 정정이 붙어 実装이 바뀌었다 —
余長은 이제 `points`가 아니라 새 필드 `hookTails`에 들어간다. 아래 전제 목록은
그 정정을 반영한 것이다. **같은 것을 다시 반증할 필요는 없다.** 새 전제가
성립하는지를 보라.

## 읽을 것

- `docs/ADR.md`의 **ADR-040**(2026-08-27 정정 포함), ADR-019(작도 규칙), ADR-023
- `.cache/001888816.pdf` (公共建築工事標準仕様書 令和7年版) — 5.3.2, 表5.3.1.
  **PDF 페이지 ＝ 인쇄 페이지 ＋ 5.**
- `.cache/001178206.pdf` (公共建築数量積算基準) — 1通則2)
- `src/domain/quantity/index.ts`, `src/domain/model/project.ts`,
  `src/lib/export/index.ts`, `src/lib/viewer/geometry.ts`,
  `src/domain/rebar/column.ts`, `src/domain/rebar/girder.ts`,
  `src/rulepack/jp-mlit/bend.yaml`, `tests/golden/fixtures/fabrication-length.json`

## 전제 목록

| id | 전제 |
|---|---|
| `quantity-length-excludes-hook` | 数量積算基準 1通則2)가 フープ·スタラップ의 길이를 「断面の設計寸法による周長」으로 하고 「フックはないものとする」고 **원문에 명시**한다. 즉 `Rebar.length`의 계산에 훅이 들어가지 않는다. **이것은 길이 계산에 한정된 주장이다** — 行 키·id는 이 항목의 대상이 아니다. |
| `line-id-is-shape-key` | `QuantityLine.id`가 `quantityLineId`의 반환값 그대로이고, 그 안에 `points`가 들어 있다. 파일:행으로 보여라. |
| `notes-keyed-by-line-id` | `project.notes`가 `QuantityLine.id`를 키로 쓰고, `Project`에 실려 **직렬화·복원된다**. 즉 id가 바뀌면 저장된 案件의 메모가 그 행에서 떨어진다. 코드 경로로 보여라(`project.ts`의 필드·검증·갱신 함수, `lib/export`의 소비). **정말로 떨어지는지 실제 반례로 확인하라** — 메모를 붙인 뒤 id를 바꾸면 `''`가 나오는지. |
| `quantity-ignores-new-field` | `quantityLineId`·`aggregateQuantity`·`spliceLineId`가 읽는 `Rebar` 필드가 `role`·`length`·`count`·`splice`·`points`·`size`·`shape`·`memberId`·`formula`·`ruleHits`뿐이고, **그 밖의 필드를 더해도 行 키가 바뀌지 않는다**. 필드를 더해 보고 골든이 안 깨지는 것으로 끝내지 말고, 키를 만드는 코드가 열거형인지 전개형인지(스프레드·`Object.keys`가 섞여 있는지) 확인하라. |
| `viewer-reads-points0-as-cover` | `lib/viewer/geometry.ts`의 `:163`·`:237`·`:322`·`:445`·`:461`이 `rebar.points[0]`(또는 points 전체의 z 최대)을 かぶり·면 기준으로 읽는다. 즉 `points`의 **첫 원소와 순서가 계약**이다. 각 줄이 실제로 무엇을 기준으로 삼는지 적어라. |
| `polyline-consumers-are-two` | `Rebar.points`를 **폴리라인으로 그리는** 곳이 `lib/viewer/geometry.ts`의 edge 생성부와 `components/viewer/Viewer3D.tsx`의 두 곳뿐이다. 세 번째가 있으면 반증이다. |
| `hook-mandatory-for-shear-bars` | 標準仕様書 5.3.2(2)에 「帯筋、あばら筋及び幅止め筋」이 末端部にフックを付ける 대상으로 **열거**돼 있다. |
| `hook135-tail-is-6d` | 룰팩 `bend.hook135`의 값 6d의 근거가 表5.3.1의 **折曲げ図(이미지) 판독**이고, 그 표의 활자 열은 折曲げ内法直径(3d/4d/5d)뿐이다. |
| `note1-untranscribed` | 表5.3.1 注1이 `docs/ADR.md`에는 있으나 **`src/rulepack/**`·`tests/golden/fixtures/spec-r7-ch5.json`에는 없다**. |
| `rect-hoop-closed-today` | 지금 矩形 帯筋·あばら筋의 `points`가 4점·`closed: true`이고, 円形 帯筋도 `closed: true`다. |
| `deviation-ledger-matches` | `fabrication-length.json`의 두 `deviation-from-source` 케이스의 `missingMm`(156)이 `2 × 6d × 13`과 일치하고, `withHookTailMm`(2956·2056)이 `expectedFabricationLengthMm ＋ missingMm`과 일치한다. |
| `tail-direction-unspecified` | 表5.3.1도 5.3.2도 **훅을 어느 코너에 두는지**를 정하지 않는다. 원문에서 위치를 정하는 문언을 찾아보고 없음을 보여라. |

## 방법

- 원문 대조는 페이지 텍스트를 **인용**하라. 「그렇게 보인다」는 검증이 아니다.
- 코드 대조는 **반례가 되는 코드 경로**를 제시하라.
- 확인용으로 코드를 흔들었으면 **반드시 원복**하고 `git status`로 보여라.

## 산출물

`phases/28-shear-hook-shape/step0b-report.json`(이름이 `step0b`인 것은 첫 시도의
`step0-report.json`을 덮지 않기 위해서다 — **그 파일을 지우거나 고치지 마라**):

```json
{
  "premises": [
    {"id": "...", "verdict": "upheld|refuted", "evidence": "원문 인용 또는 파일:행", "note": "..."}
  ],
  "verdict": "upheld|refuted"
}
```

## 하지 말 것

- 대상 코드(`src/**`·`tests/**`·`docs/**`)를 수정하지 마라. **반증만 하라.**
- 첫 시도의 `step0-report.json`·`step0-codex.*.log`를 지우거나 고치지 마라 — 역사다.
- `scripts/execute.py` 금지 — 재귀다.

## 종결

전제가 전부 성립하면 `completed`. 하나라도 어긋나면 **`refuted`** —
무엇이 어떻게 어긋났는지 report에 적고 멈춰라. 고치지 마라.
