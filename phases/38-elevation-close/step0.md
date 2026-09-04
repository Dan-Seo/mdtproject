# Step 0: 이 phase의 근거 주장과 phase 37 문서를 반증하라 (검증 전용·게이트)

이 스텝은 **구현이 아니라 반증**이다. 아래 주장은 전부 Claude가 실측으로 세운 것이고,
step 1〜5는 이 주장 위에 서 있다. 하나라도 성립하지 않으면 사양이 틀린 것이므로
**고치지 말고** 무엇이 어긋났는지 적고 `refuted`로 끝내라 (게이트라 뒤 스텝이 막힌다).
전부 성립하면 `completed`.

측정은 **독립 재현**이어야 한다. 「사양에 그렇게 적혀 있다」는 근거가 아니다.
36면 픽스처는 `tests/fixtures/section-import/textitems/*.json`(page + items)이고,
`parseFrameElevations({ ...fixture.page, items: fixture.items })`로 그대로 돌아간다.

## C1 — 레벨 라벨 열 군집은 출력에 영향이 없다

`src/lib/import/framing-plan/elevation.ts`의 `labelColumns`·`selectLabelColumn`·
`LABEL_COLUMN_GAP_PT`(=`COLUMN_TOLERANCE_PT * 4`)는 죽은 복잡도다. `selectLabelColumn`이
고른 열 밖의 토큰을 `displaced`가 전부 되살리므로, 결과는 「창 안 ＋ `isLevelLabel` 통과 ＋
최근접 레벨이 허용 범위 안」과 같다.

반증법: 파일 **사본**(`.cache/` 등 커밋 밖)에서 그 셋을 걷어내고 라벨 후보를
`horizontalDistance(label, chain[0].x) <= LABEL_WINDOW_PT`로만 거른 뒤, 36면 전부에서
`JSON.stringify(parseFrameElevations(page))`를 원본과 비교하라. **한 면이라도 다르면 C1은 반증**이다.

## C2 — `SHORT_TAIL_SCALE_TOLERANCE_RATIO = 0.49`는 tsu 한 면 상수다

tsu-p21의 1,170 꼬리가 이 상수의 유일한 사용자이고 편차가 상한에 붙어 있다.
재현할 값: tsu-p21에서 1,170을 붙일 때 `|실제 간격/기대 간격 − 1| ≈ 0.488`,
hirosaki-p25의 2,310은 `≈ 0.0006`. 두 값을 직접 계산해 적어라(소수 4자리).
0.49를 0.45로 낮추면 tsu만 꼬리를 잃고 hirosaki는 그대로여야 한다(확인 후 원복).

## C3 — 레벨 화이트리스트에 대한 phase 37 후속 기록(claude-review.md 2번)은 틀렸다

`isLevelLabel`은 `/(?:FL|GL|RCL|(?:天端|下端|上端)$)/`다. claude-review.md는
「梁天端(水下)·基礎梁天端-20이 탈락한다」고 적었으나, 36면 실측에서 `梁天端`(tsu-p21 12회)·
`基礎梁天端`(tsu-p21 2회)는 **통과한다**. 실제로 탈락하는 것은 `1SL`(tsu ×2)·`2SL`(saiki-p2)·
`SL+756.70`·`RSL+760.00`(ina-p6) 계열과 문장형(`5.B.PL下端は基礎梁天端+50とする`)이다.
반대로 화이트리스트는 **문장도 통과시킨다** — `・基礎梁天端から1FLまでは打増しとする。`(tsu-p21),
`支持地盤は、GL-900以下の弱風化花崗岩層とする`(karatsu-fukuzu) 등.

반증법: 36면의 모든 행 세그먼트·세로 런 문자열을 모아 `isLevelLabel` 통과/탈락으로 갈라
위 문자열들이 각각 어느 쪽인지 확인하라. 통과 문장의 예를 최소 2개, 탈락한 SL 계열의 예를
최소 2개 report에 적어라.

## C4 — tsu 두 면의 실제 레벨 계열은 6레벨·5구간이고, 현행 파서는 그것을 못 낸다

원문(300dpi 크롭, ADR-010 준용 전사)은 위→아래로
`パラペット天端 / RFL(水下) / 2FL / 1FL / 設計GL / 基礎下端`이고 구간은
`600 · 3,500 · 3,500 · 150 · 1,170`이다. 골든 두 개가 이미 그렇게 적혀 있다:
`tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json`(항목 2개: Y3 블록, Y1·Y2 블록),
`…/tsu-kanritou-p22-elevation.json`(항목 2개: X1·X2·X3 블록, X4·X5 블록).

현행 파서 실측(재현할 것):
- tsu-p21 Y1·Y2 블록 — 구간 `[600,3500,3500,150]`(1,170 없음), 라벨
  `[["パラペット天端","RFL(水下)"],[],["2FL"],["1FL","設計GL"],["基礎下端"]]`.
- tsu-p21 Y3 블록 — 구간 `[600,3500,3500,150,1170]`, 라벨 `[[パラペット天端,RFL(水下)],[],[2FL],[1FL],[設計GL],[基礎下端]]`.
- tsu-p22 두 블록 — 둘 다 `[600,3500,3500,150]`.

즉 **같은 도면·같은 계열인데 블록마다 결과가 다르다.** 이것이 step 2·3이 고치는 것이다.

## C5 — phase 37에서 Claude가 직접 쓴 문서·장부가 코드·픽스처와 일치한다

교차검증 규칙 ②(Claude가 쓴 것은 codex가 반증한다)의 대상이다. 다음을 대조하라.
- `docs/RISKS.md` R15의 「階高 SHORT_TAIL 허용오차 0.49는 tsu 한 면 상수」 — C2와 같은가.
- `docs/RISKS.md` R10 잔여 목록의 각 항목이 코드·픽스처에 실제로 남아 있는가
  (2段筋 본수 미지원, 特記 기본값 미채움, 壁·スラブ·shibata 大梁 미전사).
- `docs/ADR.md` ADR-045의 두 결정이 `src/lib/import/section-list/parse.ts`의 실제 동작인가.
- `phases/37-corpus-widen-2-close/step6-report.json`의 `numbers_used`에 있는 값들이
  코드·골든에서 실제로 나오는가(임의 5개를 골라 확인).

## 산출

`phases/38-elevation-close/step0-report.json`:
```
{"verdict":"refuted"|"not_refuted",
 "claims":{"C1":{"holds":true,"evidence":[...]}, ... },
 "notes":"..."}
```
`holds`는 **주장이 성립함**을 뜻한다. 하나라도 `false`면 `verdict:"refuted"`이고 스텝 status는 `refuted`.

## 하지 말 것

- 제품 코드·테스트·골든·문서를 고치지 마라. 이 스텝의 커밋은 report 하나뿐이다.
- 임시 사본·스크립트는 `.cache/`에 두고 커밋하지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.
