# Step 1: wallClass 区分 — 모델·룰팩·산정, 골든 먼저

**전제**: step 0이 `completed`(전제 유지)로 끝났을 때만 진행하라. `refuted`면
`blocked`로 멈추고 반증 요지를 적어라 — 저자의 ADR 정정을 기다린다.
진행 중 새로운 반증 사유가 나오면 `blocked`.

## 배경

`docs/ADR.md`의 ADR-025·028·029·036을 읽어라. 雑壁은 부재가 아니라
`WallSection.wallClass` 区分이다. 갈리는 것은 かぶり(表5.3.6)와 40d 하한
(5.3.4(3)(ｱ)) 둘뿐이고, kg가 변하는 것은 후자뿐이다.

## 할 일 (골든 먼저 — TDD)

1. **골든** — `tests/golden/fixtures/quantity-r5-ch3.json`에 耐力壁/
   耐力壁以外 쌍 케이스를 더하라: 같은 벽 하나를 `wallClass`만 바꿔
   두 번 계산한다. step 0 report가 특정한 **L1 ＜ 40d 조합**(fc·grade·径)을
   써서, 耐力壁은 継手長이 40d로 올라가고 耐力壁以外는 表5.3.2 L1 그대로인
   것을 kg 차이로 핀하라. `handDerivation`에 손 유도(継手長·본수·질량)를
   적어라. 耐力壁以外의 ruleHits에 `lap.wall.minimum`이 **없는 것**도
   핀하라. **기존 케이스의 기대값 수정 금지** — 바꿔야 통과한다면 `blocked`.
2. **모델** — `src/domain/model/member.ts`의 `WallSection`에
   `wallClass?: '耐力壁' | '耐力壁以外'`(주석: 設計図書 판단의 전사,
   없으면 耐力壁 — ADR-036). `src/domain/model/project.ts` 검증: optional,
   두 값만 허용, 불량값 거부·왕복·필드 없는 기존 레코드 호환을 테스트로
   고정하라. **schemaVersion을 올리지 마라** (optional 추가·기본값이 현행과
   동일이라 기존 案件의 数量이 변하지 않는다).
3. **룰팩** — `src/rulepack/jp-mlit/cover.yaml`에 表5.3.6
   「スラブ、耐力壁以外の壁」행을 `memberKind: 雑壁` 조건으로 2행
   (仕上げあり20·仕上げなし30, soilContact:false, exposure 조건 없음 —
   원문 구조) 추가하라. `source`는 기존 床板 행과 동일(表5.3.6,
   printedPage 33), `confidence: transcribed`. 같은 표의
   `spec-r7-ch5.json` fixture 행 `memberKinds`에 `"雑壁"`을 더하라 —
   spec-tables 테스트가 동시 수정을 강제한다. **다른 룰팩 행 신규·수정
   금지** — 특히 `lap.wall.minimum` 행은 건드리지 마라(적용 제외는 코드
   분기다, §4).
4. **산정 — かぶり** — `src/domain/rebar/wall.ts`의 cover 조회 조건에서
   `wallClass === '耐力壁以外'`이면 `memberKind: '雑壁'` 토큰으로 조회하라
   (기본은 현행 `耐震壁`). 20/30 행이 ruleHits에 실리는 것을 테스트로
   고정하라. かぶり가 kg에 영향이 없는 것은 골든 쌍이 이미 보증한다
   (継手 외 값 동일).
5. **산정 — 40d 하한** — `wallClass === '耐力壁以外'`이면
   `lap.wall.minimum`을 조회하지 않는다. 코드 주석과 算出式에 「5.3.4(3)(ｱ)
   は耐力壁限定 — 耐力壁以外は表5.3.2のみ（ADR-036の読み）」 취지를 적어라.
   ruleHits에서 그 행이 빠지는 것을 테스트로 고정하라.
6. **加工長·다른 부재의 골든이 변하면 반칙이다** — `blocked`로 멈춰라.

## 하지 말 것

- `src/components/**`·`src/lib/import/**` 수정 금지 — step 2다.
- `MemberKind`에 `雑壁` 추가 금지 — 부재가 아니다 (ADR-036 §1).
  `member.test.ts`의 kind 고정 테스트는 그대로 통과해야 한다.
- 부분 높이·부분 길이 형상 금지 (ADR-036 §5).
- 배근 규준 수치를 코드에 쓰지 마라. `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/24-wall-class/step1-report.json`:
골든 쌍의 handDerivation 요지(쓴 fc·grade·径와 継手長 차이), 변경 파일,
게이트 결과.
