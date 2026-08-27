# Step 0: ADR-042의 전제를 반증하라 (검증 전용)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. 아래 전제를 하나씩
원문·코드로 대조하고, **어긋나는 것이 하나라도 있으면 `refuted`로 끝내라.**

이 스텝은 `gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

## 읽을 것

- `docs/ADR.md` ADR-005·ADR-012·**ADR-025**·ADR-029·**ADR-042**
- `.cache/001178206.pdf` (公共建築数量積算基準 令和5年改定).
  **PDF 페이지 ＝ 인쇄 페이지 ＋ 5.** 2（５）壁 2)는 인쇄 18〜19쪽.
- `src/domain/rebar/wall.ts`, `src/domain/model/member.ts`, `src/domain/model/rebar.ts`

## 전제 목록

| id | 전제 |
|---|---|
| `five-divisions` | 2)「壁（壁式構造）」이 「端部筋、縦筋、壁梁筋、横筋及び補強筋」의 **다섯 구분**을 요구한다. |
| `product-has-three` | 제품의 壁 역할이 `縦筋`·`横筋`·`開口補強筋` **셋뿐**이다(`src/domain/rebar/wall.ts`). 앞의 둘이 1)「壁式構造以外」의 조문이고, `開口補強筋`은 **2)-5의 補強筋이 아니라** 1通則8) なお書き·ADR-029·ADR-034의 **開口 단위 設計図書 전사 입력**이다 — `src/domain/model/rebar.ts`의 주석이 그렇게 적고 있다. **둘을 혼동하면 이 전제는 성립하지 않는다.** 셋이라는 수와 각각의 근거 조문을 파일:행으로 보여라. |
| `endbar-needs-topology` | 2)-1 ①이 端部를 「壁の端部及び壁と壁の接続する箇所のコーナー部」로 정하므로 **壁끼리의 접속 위상**이 있어야 한다. 제품의 壁 위치가 한 변(`GirderPosition`)이고 이웃 壁과의 접속을 **알지 못한다**는 것을 코드로 보여라. |
| `vertical-needs-foundation` | 2)-2 ②가 最下階의 縦筋을 **布基礎**의 배근 형태로 가른다. `基礎`가 ADR-005로 제품 범위 밖이고, 코드에 `基礎` 부재가 없다. |
| `vertical-count-needs-topology` | 2)-2 ⑥의 割付이 「壁の接続部及び縦補強筋の箇所数を差し引いた」라 위상이 필요하다. |
| `wallbeam-is-new-member` | 2)-3의 `壁梁`이 제품의 `MemberKind`(柱·大梁·耐震壁·床板)에 **없다**. |
| `horizontal-count-differs` | 2)-4 ③의 割付이 **1通則7)에 걸리지 않고** 「⌈壁高さ÷間隔⌉ **−1**」이다. 제품의 壁 横筋 割付은 `distributionCount`(`src/domain/rebar/measurement.ts`)를 거쳐 1通則7)의 加算 룰을 더하는 **＋1**임을 파일:행으로 보여라(＋1이 리터럴이 아니라 룰팩 값인 것도 함께 보여라). **1通則7)의 割付이 아닌 본수 — 도면 기재 그대로인 腹筋 같은 것(`src/domain/model/member.ts:249`) — 은 이 전제의 대상이 아니다.** |
| `reinforcement-is-design-doc` | 2)-5가 「補強筋は設計図書による」이다. |
| `no-wall-shiki-today` | 제품이 지금 壁式 물량을 **한 줄도 내지 않는다**. 어떤 입력으로도 **`端部筋`·`壁梁筋` 역할과 2)-5의 壁 전체 補強筋** 행이 나오지 않음을 코드 경로로 보여라. 기존 `開口補強筋`은 여기에 해당하지 않는다(위 `product-has-three`). |
| `ledger-contradiction` | `docs/ADR.md` ADR-025는 「만들지 않는다」인데 `docs/MILESTONES.md`(또는 `CLAUDE.md` 대장)는 「남은 것」으로 적고 있다 — **실제 문언을 인용**해 모순을 보여라. 모순이 이미 없다면 그렇게 보고하라(그 경우 이 항목만 `refuted`가 아니라 `note`로 적어라). |

## 산출물

`phases/31-wall-shiki-decision/step0-report.json`:
```json
{
  "premises": [{"id": "...", "verdict": "upheld|refuted", "evidence": "원문 인용 또는 파일:행"}],
  "verdict": "upheld|refuted"
}
```

## 하지 말 것

- 대상 코드(`src/**`·`tests/**`·`docs/**`)를 수정하지 마라. **반증만 하라.**
- 壁式 구현을 시작하지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 금지 — 재귀다.
