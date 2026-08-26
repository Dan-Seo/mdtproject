# Step 0 (kind: verify): ADR-034의 전제를 반증하라

**이 스텝은 검증 전용이다. 대상을 고치지 마라.**
반증이 성립하면 `"refuted"`가 정상 종결이다 — summary에 요지를 적어라.
전제를 고치는 것은 저자(Claude)의 몫이다. 반증이 서지 않으면 `completed`에
무엇을 어떻게 대조했는지 적어라.

## 무엇을 검증하는가

Claude가 2026-08-26에 쓴 `docs/ADR.md`의 **ADR-034**가 딛고 선 사실 주장 넷.
다음 스텝이 이 전제 위에 開口補強筋 입력·산정을 만든다.

## 방법

1. **조문 위임** — `tests/golden/fixtures/quantity-r5-ch3.json`의 1通則8) 전사가
   「開口補強筋は設計図書により計測・計算する」를 포함하는 것. 그리고 골든
   픽스처들의 전사(quote·terms) 전체에서 「補強」을 검색해, 開口補強筋의
   형상·본수·길이를 규준이 직접 주는 조문이 **없다**는 ADR의 전제에 반례가
   있는지 확인하라.
2. **파이프라인 전제** — ① `openings`는 耐震壁·床板만 받는다
   (`src/domain/model/member.ts`), ② 内訳 고지 `takeoff.wallOpening`은 상시
   표시다(`src/components/quantity/TakeoffPane.tsx`), ③ 質量行은 `Rebar` →
   `aggregateQuantity`(`src/domain/quantity/index.ts`)로 나오고 単位質量은
   `Project.unitMass` 사용자 입력이다, ④ 腹筋 선례(`src/domain/rebar/girder.ts`)
   — 규준 행 없는 전사값의 ruleHits·算出式 처리가 ADR-034 §2의 서술과
   일치하는가.
3. **호환 전제** — `Opening`에 optional 배열 필드를 더해도 기존 案件의
   검증(`src/domain/model/project.ts`의 검증기)·직렬화가 거부하지 않고
   기존 数量이 변하지 않는 구조인지. 검증기가 미지 키를 거부하는 방식이면
   반증이다.
4. **뷰어 전제** — 壁·床板의 `Rebar`를 뷰어(`src/lib/viewer/geometry.ts`)가
   role 구분 없이 전부 그리는지(그렇다면 step 2가 skip을 반드시 넣어야 한다),
   아니면 role 화이트리스트인지. 실코드로 확인해 어느 쪽인지 report에 적어라
   — step 2의 작업량이 여기에 달려 있다.

## 하지 말 것

- `docs/ADR.md`·`src/**`·`tests/**`를 수정하지 마라.
- 스크래치 스크립트를 레포에 남기지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## 산출물

`phases/22-opening-reinforcement/step0-report.json`:
`{ "checks": [...], "verdict": "refuted | upheld", "summary": "..." }`
