# Step 1: 開口補強筋 전사 입력을 모델·산정에 담는다 — 골든 먼저

**전제**: step 0은 `refuted`로 끝났다 — 開口의 壁·床板 제한이 검증기의
사실이 아니라 산정 경로·UI의 사실이라는 반례(柱에 openings를 넣은 JSON이
deserialize를 통과). 저자가 `docs/ADR.md`의 ADR-034에 정정 주석(2026-08-26)을
달아 해소했다 — 결정 자체(전사 입력·산정 경로)는 바뀌지 않는다. 이 반증은
닫혔으므로 이 스텝은 진행하라. **새로운** 반증 사유를 발견하면 `blocked`로
멈추고 사유를 적어라.

## 배경

`docs/ADR.md`의 ADR-029·ADR-034를 읽어라. 1通則8)은 開口補強筋을
設計図書에 위임하므로 값 전부(径·본수·設計長さ)가 전사 입력이다.
선례는 腹筋(`src/domain/rebar/girder.ts`)이다.

## 할 일

1. **골든 먼저 (TDD)** — `tests/golden/fixtures/quantity-r5-ch3.json`에
   1通則8) 補強筋 케이스를 더하라: 開口 있는 耐震壁 하나에
   `reinforcements` 두 건(서로 다른 径, 예: D13×4본과 D10×2본 — `BAR_SIZES`에
   실재하는 径만). 기대값은 손으로 유도해 `handDerivation`에 적어라 —
   質量 ＝ Σ(設計長さ × 본수 × 単位質量), 割増 1.04(기존 markup.rate 조회).
   単位質量 미입력 径의 kg가 null로 남는 것도 핀하라. 床板 개구에도 같은
   경로가 통하는 케이스 하나. **기존 케이스의 기대값 수정 금지** — 바꿔야
   통과한다면 `blocked`로 멈추고 사유를 적어라.
2. **모델** — `src/domain/model/member.ts`에
   `OpeningReinforcement { size: BarSize; count: number; lengthMm: number }`와
   `Opening.reinforcements?: OpeningReinforcement[]`,
   `src/domain/model/rebar.ts`의 `RebarRole`에 `'開口補強筋'` 추가(주석에
   1通則8) 위임과 전사 입력임을 적어라).
   `src/domain/model/project.ts` 검증: size는 `BAR_SIZES`의 값, count는 양의
   정수, lengthMm은 양의 유한수. 필드 없는 기존 레코드 호환·직렬화 왕복·
   불량값 거부를 테스트로 고정하라.
3. **산정** — 壁·床板의 rebar 생성 경로에서 `member.openings[].reinforcements`를
   role `'開口補強筋'`의 `Rebar`로 내라: size·count 그대로,
   設計長さ ＝ `lengthMm` 그대로(定着·余長을 더하지 마라), points는
   `[[0,0,0],[lengthMm,0,0]]`, shape `'straight'`, zones·placement 없음.
   ruleHits는 腹筋 방식(규준 행을 걸지 않는다)으로 하고 算出式에
   「設計図書 전사(1通則8) なお書)」와 전사값을 적어라. 質量·割増은 기존
   `aggregateQuantity`가 처리한다 — 특별 취급을 만들지 마라.
4. **加工長 대상에 넣지 마라** — 기존 fabrication 골든이 변하면 반칙이다.
5. **schemaVersion을 올리지 마라** — optional 추가라 기존 案件의 数量이
   변하지 않는다 (ADR-034 §6).
6. **뷰어 예외 (컴파일 강제)** — `src/lib/viewer/geometry.ts`의 `roleToLayer`는
   `RebarRole` 전수 매핑이라(step 0 report) role 추가만으로 컴파일이 깨진다.
   이 스텝에서 그 매핑에 한해 `'開口補強筋'`을 **그리지 않는** 처리(ADR-034
   §3 — 인스턴스를 만들지 않는다)를 함께 넣고, 補強筋 있는 부재로 지오메트리
   생성이 죽지 않고 해당 role의 인스턴스가 0인 것을 테스트로 고정하라.

## 하지 말 것

- `src/components/**` 수정 금지 — step 2다.
- `src/lib/**` 수정 금지 — 위 6의 뷰어 예외 한 곳만 허용.
- 룰팩(YAML) 신규 행 금지 — 이 값들은 규준에 없다 (ADR-034).
- 배근 규준 수치를 코드에 쓰지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/22-opening-reinforcement/step1-report.json`:
추가한 골든 케이스의 handDerivation 요지, 모델·검증·산정의 변경 파일 목록,
게이트 결과.
