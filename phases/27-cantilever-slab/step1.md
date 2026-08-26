# Step 1: 片持床板 — 모델·룰팩·산정, 골든 먼저

**전제**: step 0이 `completed`(전제 유지)로 끝났을 때만 진행하라. `refuted`면
`blocked`로 멈추고 반증 요지를 적어라 — 저자의 ADR 정정을 기다린다.

## 배경

`docs/ADR.md`의 ADR-005·028·029·037·**039**를 읽어라. 片持床板은 부재가 아니라
**지지 조건이 하나뿐인 床板**이다. 갈리는 것은 넷 — 위치·치수(支持辺＋
projection), 자유단의 定着(없음), L3의 25d, 投影의 La.

## 할 일 (골든 먼저 — TDD)

1. **골든** — `tests/golden/fixtures/quantity-r5-ch3.json`에 片持床板 케이스를
   더하라(최소 2건).
   - **내미는 방향의 主筋**: 設計長さ ＝ projection ＋ 支持辺 쪽 定着 **1회**,
     先端은 1通則1)로 加算 0. 上端筋은 折曲げ면 投影 **La**, 下端筋은 L3
     **25d**(＋150mm 하한, step 0 §3의 판단대로). 割付은 支持辺의 内法長さ.
   - **支持辺과 나란한 방향**: 定着 **0회**, 割付은 projection.
   - 継手는 1通則4)(길이 기반)이고 連続床板 区分表에 걸리지 않는 것을 핀하라.
   `handDerivation`에 손 유도(定着 회수·割付 本数·設計長さ·질량)와 출처
   조항을 적어라. **기존 케이스의 기대값 수정 금지** — 바꿔야 통과하면 `blocked`.
2. **모델** — `Member.cantilever?: { side: '正' | '負'; projectionMm: number }`
   (ADR-039 §2, 주석에 「支持辺의 축에 직교하는 通り芯 index가 커지는 쪽이 正」).
   `kind: '床板'`이면서 position이 `GirderPosition` 형태면 片持다.
   `project.ts` 검증: optional·두 값·양수 유한, 床板 이외가 들면 거부,
   `cantilever`가 있는데 position이 ベイ이거나 그 반대면 거부. 왕복·기존
   레코드 호환을 테스트로 고정하라. **schemaVersion을 올리지 마라.**
3. **룰팩** — 表5.3.4 L3 スラブ欄의 「（片持スラブの場合は25d）」를
   `src/rulepack/jp-mlit/anchorage.yaml`에 `片持スラブ` 조건으로 실어라.
   150mm 하한의 재사용 여부는 step 0 §3의 판단을 따르고, 재사용이 안 되면
   같은 조건의 행을 하나 더 만들어라. `source`는 기존 L3 행과 같은 자리
   (表5.3.4, printedPage 동일), `confidence: transcribed`, `note`도 기존
   형식을 따르라. `spec-r7-ch5.json`의 해당 항목에서 「片持スラブを作らないので
   取らない」 취지의 `reason`을 지우고 **entries로 옮겨라** — spec-tables
   테스트가 룰팩과의 동시 수정을 강제한다. `La`·`measure.tip.length.addition`은
   **신규 행 없이 기존 행을 조회**하라. 다른 룰팩 행 신규·수정 금지.
4. **기하** — 片持床板의 内法(폭 ＝ 支持辺 内法長さ, 길이 ＝ projection)을 내는
   경로를 만들어라. step 0의 `twoSupportSites` 목록이 무대다. 양쪽 지지를
   전제한 코드가 한쪽 지지에서 조용히 잘못된 값을 내지 않게 하라 —
   불가능한 형상은 `MemberUnsupportedError('寸法不成立')`다(plain Error 금지,
   ADR-038 §3). 支持辺에 大梁·양 끝 柱가 없으면 그렇게 떨어진다.
5. **산정** — 자유단 定着 0회(ADR-039 §4), L3 25d, 投影 La, 継手 1通則4).
   算出式에 자유단과 근거 조항을 적어라. 連続床板 런에 片持가 섞여 들어가지
   않게 하라 — 片持는 언제나 단독이다.
6. **다른 부재의 골든이 변하면 반칙이다** — `blocked`로 멈춰라.

## 하지 말 것

- `src/components/**`·`src/lib/viewer/**`·`src/lib/import/**` 수정 금지.
- `MemberKind` 추가 금지. 부분 폭 片持·片持梁·小梁 금지 (ADR-039 §7).
- 5.3.4(5)(ｲ)(c)의 「柱せいの3/4」를 끌어오지 마라 (ADR-039 §5).
- 배근 규준 수치를 코드에 쓰지 마라.
- **`phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.**
- **검증 스크립트를 `src/` 아래에 만들지 마라** — phase 디렉터리 안에 둬라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/27-cantilever-slab/step1-report.json`:
골든 케이스의 handDerivation 요지, 룰팩 신규 행, 변경 파일, 게이트 결과.
