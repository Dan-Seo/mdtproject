# Step 0 (verify): ADR-039의 전제를 반증하라

**역할**: 검증 전용이다. `docs/ADR.md`의 **ADR-039**를 읽고 아래 전제들을
원문 픽스처·코드·실행으로 **반증**하라. 대상 코드를 한 줄도 수정하지 마라.
반증이 성립하면 status **`refuted`**(정상 종결), 전부 버티면 `completed`.

## 반증 대상 전제

1. **(zero-count-was-wrong)** ADR-028·`CLAUDE.md`의 「片持床板·配力筋(두 원문
   0건)」에서 0건인 것은 `配力筋`뿐이고 「片持」는 두 원문에 여러 건 있다.
   `.cache/001178206.pdf`(積算基準)·`.cache/001888816.pdf`(標準仕様書)를
   직접 세어 **쪽수와 문면을 남겨라**. 문서 해시는 `docs/SOURCES.md`에 있다.
2. **(clauses-are-sufficient)** ADR-039가 인용한 다섯 조문이 실제로 그 문면인지
   원문에서 확인하라 — 定義（４）의 「片持床板等もこれらに準ずる」, 2（４）床板2)
   但書, 表5.3.4 L3 スラブ欄의 「（片持スラブの場合は25d）」, 表5.3.5 注1·2의
   포함/제외, 表5.3.1 注1. **한 글자라도 다르면 반증이다.**
3. **(l3-cell-structure)** 表5.3.4 L3 スラブ欄의 「10d かつ150mm以上（片持スラブ
   の場合は25d）」에서 **150mm 하한이 片持에도 딸리는지**를 원문의 칸 구조로
   판단하라. 딸리지 않는다고 읽히면 반증이다 — ADR-039 §5가 딸린다고 적었다.
   판단 근거(칸 병합·괄호의 걸림)를 적어라. 실무 영향(25d가 D10에서도 250mm라
   하한이 물지 않는다)도 함께 재어라.
4. **(la-rows-reusable)** `anchorage.La` 룰팩 행에 부재 조건이 없어 床板에서
   그대로 조회된다. 조건이 붙어 있어 재사용이 불가능하면 반증이다.
5. **(tip-rule-exists)** `measure.tip.length.addition`(value 0, 1通則1))이
   이미 있고 조건 없이 조회된다 — 片持의 先端에 그대로 쓸 수 있다.
6. **(fixture-has-no-cantilever-values)** `tests/fixtures/section-import/expected/`의
   yokohama-p15가 片持スラブリスト를 `scope: 対象外`로 두고 값 전사를 생략했다 —
   파서 대응의 골든이 설 자리가 없다(ADR-039 §7). 값이 실제로 전사돼 있으면 반증이다.
7. **(slab-run-assumes-two-supports)** 현행 `slabBay`·`resolveSlabEnd`·
   `slabRun`이 **양쪽 지지**를 전제한다는 것을 코드로 특정하라 — 어디가
   `startSupport`/`endSupport` 둘을 요구하는지, 한쪽만 있는 형상을 지금
   표현할 수 있는지. step 1이 이 목록을 쓴다.

## 하지 말 것

- 대상 코드 수정 금지. 새 파일은 검증 스크립트·본 report만.
- **`phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라** — 하네스가
  쓰는 기록이고 삭제 시도가 정책에 막혀 phase 25 step 0에서 하네스가 죽었다.
- **검증 스크립트를 `src/` 아래에 만들지 마라** — `phases/27-cantilever-slab/`
  안에 둬라. phase 26 step 0이 `src/lib/`에 빈 테스트 껍데기를 남겼다.
- `scripts/execute.py` 금지 — 재귀다.

## 산출물

`phases/27-cantilever-slab/step0-report.json`:
전제별 `{id, status: upheld|refuted, evidence[]}`, `verdict`, `summary`.
전제 7의 목록은 `twoSupportSites`로 따로 실어라.
