# Step 4: 일본 고유 형태·제품 트랙을 닫는다 (step 0·3의 반증은 사양 결함이었다)

**전제**: step 0과 step 3이 각각 반증했다. 두 보고서(`step0-report.json`·`step3-report.json`)는 **그대로 두어라** — 반증의 기록이다.

## 무엇이 반증됐고, 왜 그것이 코드의 결함이 아닌가
step 0의 `japan-remainder-is-decision-only`가 「`スパイラル`·`壁式構造`의 매칭 줄이 **전부 주석**일 것」을 요구했다. 실제로는 `壁式構造`가 `tests/golden/fixtures/quantity-r5-ch3.json`(13건)과 `tests/golden/quantity-measurement.test.ts`(2건)에 주석이 아닌 자리로 나온다.

그런데 그 15건의 정체는 이렇다:
- `"quote"` — `数量積算基準` 2（５）壁2) 등 **원문 조문의 전사**
- `"reason"` — 「ADR-042 §1-2. 壁式構造の壁は5区分と布基礎·壁梁를 동반하는 별개 마일스톤이며 … 부분 구현으로 부족 수량을 내지 않는다」 등 **만들지 않는다는 결정의 기록**

즉 **결정을 골든 픽스처에 박아 둔 것**이며, 반증이 아니라 그 결정의 가장 강한 증거다. 사양이 정당한 범주를 「주석」 하나로 좁힌 것이 틀렸다 — 실제 범주는 셋이다. step 3의 `closed-tracks-really-closed`도 같은 규칙을 물려받았고, 게다가 **step 2가 닫지도 않은 트랙**(일본 고유)의 검사를 닫힌 트랙에 걸었다. 둘 다 사양 결함이다.

**codex의 판정 자체는 옳았다.** 문언대로 재고 고치지 않고 기록했다. 고칠 것은 규칙이다.

## 판정 규칙 (이 스텝의 핵심)
어떤 용어가 코드베이스에 나온다는 사실만으로는 「만들었다」가 아니다. 정당한 범주는 셋이다:

1. **주석** — `//`·`*`로 시작하는 줄
2. **원문 조문의 전사** — 픽스처의 `quote`·`text` 같은 **데이터 필드**에 담긴 원문
3. **만들지 않는다는 결정의 기록** — `reason`·`status: deferred`·ADR 인용처럼, 그 항목을 **의도적으로 제외했다**고 적은 자리

이 셋 **밖**에서, 즉 **실제 동작을 만드는 자리**에 나오면 그때가 「만들었다」다: 식별자·타입·분기 조건·룰팩 `entries` 항목·로케일 문면·3D 형상 생성.

## 할 일

### A. 다시 재고 분류한다
`src/`와 `tests/`에서 아래를 찾아, **매칭된 줄 하나하나를** 위 네 범주(주석 / 원문 전사 / 결정 기록 / **구현**) 중 하나로 분류하라. 파일·행번호와 함께 보고서에 적어라.

- `スパイラル`
- `壁式構造`
- `機械式定着`
- `免震`

**「구현」으로 분류되는 줄이 하나라도 있으면 트랙을 닫지 말고 `blocked`로 멈추고 그 줄을 보고하라.** 세어서 0이어야 닫는다.

### B. 두 대장을 함께 넘긴다
A가 0건이면, step 2가 M3c·ST-Bridge에 한 것과 **같은 방식으로** 일본 고유 형태·제품 트랙을 닫아라.

- `docs/MILESTONES.md`의 `- [ ] **일본 고유 형태·제품 확장**` → `- [x]`, 그 줄에 완료 판정 근거 한 문장(날짜는 **오늘**). 형식은 step 2가 M3c·ST-Bridge에 쓴 것과 같게.
- `CLAUDE.md` 마일스톤 표의 `일본 고유 형태·제품` 행: 상태 `완료`, 남은 것 칸에는 **무엇을 만들지 않았는지 한 줄**(`壁式構造の壁`은 ADR-042의 별개 마일스톤, `スパイラル筋`의 継手·定着은 図5.3.5가 이미지, `機械式定着`은 전부 「特記による」).
- **`AGENTS.md`를 `CLAUDE.md`에서 다시 생성하라.**
- 본문의 「만들지 않는다」 서술을 **요약하거나 지우지 마라.**

### C. 확인
`npx vitest run tests/docs/ledger-sync.test.ts tests/docs/guardrail-sync.test.ts`가 통과한다. 통과하지 않으면 **테스트가 아니라 대장을 고쳐라.**

## 완료 조건 (AC)
1. A의 분류표가 보고서에 있다 — 매칭된 줄 **전부**에 파일·행번호·범주가 붙어 있다.
2. 「구현」 범주가 0건이다(아니면 닫지 않고 `blocked`).
3. `docs/MILESTONES.md`와 `CLAUDE.md` **양쪽**이 함께 바뀌었고, `AGENTS.md`가 재생성됐다.
4. `M2 룰팩`·`도면 인식(로컬)`·`M5` 행이 바뀌지 않았다.
5. `docs/RISKS.md`에 변경이 없다.
6. `npm run lint`·`npm run test` 통과. 테스트 수가 **줄지 않는다**.

## 산출물
`phases/35-ledger-reconciliation/step4-report.json`

```json
{
  "classification": [{"term":"", "file":"", "line":0, "category":"comment|quote|decision|implementation", "excerpt":""}],
  "implementation_count": 0,
  "closed": {"milestones_line":"", "claude_row":"", "not_built":""},
  "test_counts": {"files": 0, "tests": 0},
  "diffstat": "",
  "noticed": []
}
```

## 금지
- **바꿔도 되는 파일은 다음뿐이다**: `docs/MILESTONES.md`, `CLAUDE.md`, `AGENTS.md`. 그 밖의 것이 `git diff --stat`에 나오면 되돌려라(하네스 로그와 이 스텝의 보고서는 예외다).
- `src/`·`tests/` 아래를 하나도 고치지 마라. **골든 픽스처의 `quote`·`reason`을 지워 검사를 통과시키는 것은 이 스텝에서 가장 하면 안 되는 일이다** — 그것이 결정의 기록이다.
- `step0-report.json`·`step3-report.json`을 고치거나 지우지 마라.
- step 2가 이미 닫은 트랙을 다시 손대지 마라.
- 사양의 요구가 서로 모순되면 우회하지 말고 **`blocked`로 멈추고 무엇이 모순인지 적어라.**
