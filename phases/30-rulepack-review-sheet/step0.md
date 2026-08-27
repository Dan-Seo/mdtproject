# Step 0: ADR-041의 전제를 반증하라 (검증 전용)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 아래 전제를 하나씩
룰팩·원문으로 대조하고, **어긋나는 것이 하나라도 있으면 `refuted`로 끝내라.**

이 스텝은 `gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

## 읽을 것

- `docs/ADR.md` ADR-015·**ADR-023**·**ADR-041**, `docs/RISKS.md` R6
- `src/rulepack/jp-mlit/*.yaml`, `src/rulepack/index.test.ts`
- `.cache/001888816.pdf` (標準仕様書 令和7年版) 5章 — 表5.3.2·5.3.4·5.3.5·5.3.6.
  **PDF 페이지 ＝ 인쇄 페이지 ＋ 5.**

## 전제 목록

| id | 전제 |
|---|---|
| `stated-is-zero` | 룰팩에 `confidence: stated`인 행이 **0행**이고, `src/rulepack/index.test.ts`가 그것을 고정한다. |
| `transcribed-count` | 지금 룰팩의 `confidence` 분포를 **세어서** 보고하라. 「`inferred` 178행」이라는 옛 기록은 이미 틀렸다 — 실제 수를 보고하는 것이 이 항목이다(수치가 다르면 `refuted`가 아니라 실제 수를 적어라). |
| `confidence-is-the-signal` | 검토 대기의 **권위 있는 신호는 `note` 문자열이 아니라 `confidence: transcribed`**다(ADR-023이 그렇게 정의한다). 「独立検討待ち」 note는 일부 행에만 붙은 장식이다 — 그 분포를 **세어서 보고하라**(수치가 예상과 달라도 `refuted`가 아니다). 반증 조건은 하나다: `transcribed`인데 검토 대기가 **아닌** 행이 있다면 그것을 보여라. |
| `two-source-populations` | `transcribed` 240행이 **두 원문**으로 갈린다 — `source.ref: spec`(標準仕様書 5章)과 `quantity`(数量積算基準). 각각 몇 행인지 세어 보고하고, **帯 구조로 되접히는 것은 `spec` 쪽뿐**이며 `quantity` 쪽은 単発 조문이라 되접히지 않는다는 것을 확인하라. |
| `band-structure` | 원문 표가 帯(band) 구조다 — Fc는 `18` / `21` / `24、27` / `30、33、36`, 径은 `D16以下` / `D19〜D38`. 룰팩은 그것을 fc·径으로 전개한 사본이다. |
| `fold-lossless` | 룰팩을 帯로 되접었을 때 **帯 안의 값이 전부 같다**(전개 불일치 0). 하나라도 다르면 그 키·조건을 나열하고 `refuted`. |
| `l1-l1h-identical` | `表5.3.2`(重ね継手)의 L1·L1h와 `表5.3.4`(定着)의 L1·L1h가 **한 칸도 빠짐없이 같다**. 같은 칸 수를 세어 보고하라. |
| `table536-column-equals-girder` | `表5.3.6`에서 柱와 大梁의 조건이 전부 같다. |
| `missing-cells` | 원문에 결번(欠番)이 있다 — 예: `Fc18 × SD390`, `SD390`의 `D10〜D16`. 실제 결번을 원문에서 확인해 나열하라. |
| `prior-verification-not-independent` | `tests/golden/fixtures/spec-r7-ch5.json`의 `source.verifications`가 덮는 칸 수를 **세어서** 보고하라. 그리고 그것이 전사자와 같은 인격의 재대조이므로 R6을 닫지 못한다는 것이 `docs/RISKS.md` R6에 적혀 있는지 확인하라. |
| `source-per-row` | 모든 룰팩 행이 `source`(문서·표·인쇄쪽)를 갖는다. 없는 행이 있으면 나열하라. |
| `agent-cannot-promote` | ADR-015·ADR-023·R6이 「전사자＝승인자는 독립 검토가 아니다」로 승격을 막고 있고, 이 phase가 **어떤 행도 승격하지 않는다**는 것이 ADR-041 §4에 적혀 있다. |

## 산출물

`phases/30-rulepack-review-sheet/step0b-report.json`(1차 반증분 `step0a-report.json`을 덮지 않기 위해서다):
```json
{
  "premises": [{"id": "...", "verdict": "upheld|refuted", "evidence": "...", "note": "..."}],
  "counts": {"byConfidence": {}, "byKey": {}},
  "verdict": "upheld|refuted"
}
```
검증 스크립트는 **`phases/30-rulepack-review-sheet/` 안에** 두어라.

## 하지 말 것

- 대상 코드(`src/**`·`tests/**`·`docs/**`)를 수정하지 마라. **반증만 하라.**
- 어떤 행의 `confidence`도 바꾸지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## 종결

전제가 전부 성립하면 `completed`. 하나라도 어긋나면 **`refuted`**.
