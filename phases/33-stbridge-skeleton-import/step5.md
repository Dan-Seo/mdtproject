# Step 5: 이 코퍼스가 검증하지 못하는 것을 실측으로 확정해 남긴다

**전제**: step 4가 `completed`다(반증이면 이 스텝은 돌지 않는다).

## 배경
다음 phase가 断面(`StbSec*`)이나 부재 배치를 열지 말지를 판단하려면 「이 코퍼스가 무엇을 검증하고 무엇을 검증하지 못하는가」를 알아야 한다. 그 수치는 step 0이 이미 세어 `step0-report.json`의 `next_phase_facts`에 담아 두었다. 보고서 안에만 두면 다음 세션이 못 찾는다 — 픽스처 옆 문서에 실측으로 박는다.

ADR-018이 열린 근거가 「실도면 3부를 실제로 확보했다」였다. 断面 트랙이 그런 근거 없이 열리는 것을 이 문서 한 절이 막는다.

## 할 일
1. `tests/fixtures/stb-import/SOURCES.md`의 「## 이 코퍼스가 대표하지 못하는 것」 절을 `step0-report.json`·`step1-report.json`·`step3-report.json`의 **실측으로** 채워라. 반드시 담을 것:
   - **버전 분포**: 파일별 ST-Bridge 버전. ver 2.1 계열이 몇 건이고 그 크기가 얼마인지. `gh search`의 `total_count`(또는 「검색 불가」).
   - **구조 종별**: 파일별 `StbColumn@kind_structure`의 값별 분포. **RC 柱가 몇 건인지, S造가 몇 건인지 수치로.**
   - **RC 배근 요소 유무**: 파일별 `StbSecColumn_RC`·`StbSecBarColumn_RC_RectSame`·`StbSecBarColumnRectSameSimple`·`StbSecBarBeam_RC_Same`·`StbSecBarBeam_RC_ThreeTypes` 건수.
   - **부재 종별**: 파일별 `StbWall`·`StbSlab`·`StbBeam`·`StbBrace`·`StbFooting`·`StbPile` 건수. **Kijun의 부재 넷(柱·大梁·耐震壁·床板) 중 실물 근거가 있는 것과 없는 것을 명시하라.**
   - **符号 문제**: 파일별 `StbColumn@name`의 distinct 목록과 `StbSecColumn_RC@name`의 distinct 목록을 나란히 놓고, **둘이 같은 문자열인지**를 한 문장으로 적어라.
   - **かぶり厚さ**: `depth_cover`로 시작하는 속성을 가진 요소명 목록. 「2.0.x에도 かぶり가 있다」는 사실을 명시하라.
   - **通り芯 검산의 한계**: 파일별로 `StbNodeIdList`가 빈 축의 수와 전체 축 수, 그리고 `節点` `kind` 분포. 「축 위치를 節点 좌표로 검산할 수 있는 축이 전체의 몇 분의 몇인가」를 수치로 적고, `通り芯位置と節点の不一致`가 실물에서 몇 건 발화하는지 적어라.
   - **階의 한계**: 파일별 `StbStory@kind` 값 분포와, GL 기준 절대 표고가 `Story`의 누적합 모델에서 버려진다는 사실(예: 1FL이 0이 아닌 파일이 있다면 그 오프셋이 사라진다).
   - **로컬 전용 구간**: `.cache/`가 비면 어느 테스트가 스킵되고 그때 CI가 무엇을 덮지 못하는지(파일 → 중간표현 구간). 커밋된 중간표현 JSON 덕에 「중간표현 → 후보」 구간은 CI에서 상시 검증된다는 사실도 함께.
2. `tests/stb-import/sources-limits.test.ts`(node)를 만들어라. `SOURCES.md`를 읽어 다음을 단언한다 — **문서가 비어 있는 채로 통과하는 것을 막는 최소 가드다.**
   - 「## 이 코퍼스가 대표하지 못하는 것」 절이 존재하고, 그 절 안에 `step 5에서 실측으로 채운다`라는 자리표시 문구가 **남아 있지 않다**.
   - 그 절 안에 4개 실물 파일명이 전부 등장한다.
   - 그 절 안에 `kind_structure`·`StbSecColumn_RC`·`StbWall`·`StbNodeIdList` 네 문자열이 전부 등장한다.
   - SHA-256 표에 실물 4건과 XSD의 해시가 전부 있다(`` /`([a-f\d]{64})`/gu `` 로 세어 개수 하한을 단언).
3. `docs/SOURCES.md`에 ST-Bridge 항을 추가하라 — ver 2.1.1 사양서 PDF URL(https://www.building-smart.or.jp/meeting/buildall/structural-design/ 의 최신 항), XSD 배포 페이지 URL, 그리고 「.stb 코퍼스의 정본은 `tests/fixtures/stb-import/SOURCES.md`다」를 한 줄로. **`docs/SOURCES.md`의 기존 항목을 고치지 마라 — 끝에 더하기만 하라.**

## 하지 말 것
- `src/lib/import/stb/`의 코드를 고치지 마라. 이 스텝은 문서와 그 문서의 가드 테스트뿐이다.
- `tests/fixtures/stb-import/document/*.json`·`expected/*.json`을 고치지 마라.
- `docs/ADR.md`·`CLAUDE.md`·`AGENTS.md`·`docs/MILESTONES.md`·`docs/RISKS.md`를 수정하지 마라 — 그 넷은 Claude가 쓴다(`tests/docs/guardrail-sync.test.ts`가 `AGENTS.md`≡`CLAUDE.md`를 강제하므로 한쪽만 고치면 CI가 빨개진다).
- 수치를 추정하거나 반올림하지 마라. `step0-report.json`에 없는 값을 새로 만들려고 파서를 돌리지 마라 — 없으면 「미측정」이라고 적어라.
- `.cache/`의 원본을 커밋하지 마라. `.github/workflows/*`·`package.json`의 5개 스크립트 값을 바꾸지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC
`npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

그 위에:
1. 「## 이 코퍼스가 대표하지 못하는 것」 절에서 4개 실물 파일명 중 하나를 지우면 `tests/stb-import/sources-limits.test.ts`가 실패한다. 메시지를 report에 적고 **같은 턴 안에 원복**하라.
2. 자리표시 문구 `step 5에서 실측으로 채운다`를 되살리면 같은 테스트가 실패한다. 메시지를 적고 원복하라.
3. 그 절에 적힌 모든 수치가 `step0-report.json`에서 온 것이고, 대응하는 키를 report에 매핑해 적었다(문서의 값 ↔ 보고서의 경로).
4. `git diff main --stat -- src/lib/import/stb src/domain src/rulepack src/components docs/ADR.md CLAUDE.md AGENTS.md docs/MILESTONES.md docs/RISKS.md .github/workflows package.json` 이 **비어 있다**. 출력을 report에 붙여라.
5. 원복 후 `git status --porcelain`에 이 스텝의 산출물 외 변경이 0건이다.

## 산출물
`phases/33-stbridge-skeleton-import/step5-report.json`: `limits_section`(SOURCES.md에 적은 항목별 수치와 그 값이 온 step0-report.json의 키), `rc_coverage`(파일별 RC 柱 건수·S造 건수·RC 断面 건수), `mark_vs_section_mark`(파일별 `StbColumn@name` 목록과 `StbSecColumn_RC@name` 목록, 일치 여부), `member_coverage`(Kijun 부재 넷 중 실물 근거가 있는 것/없는 것), `axis_check_coverage`(검산 가능한 축 / 전체 축), `mutations`(흔들기 2건), `untouched_tracks`.

`summary`(한 줄): 「코퍼스의 한계를 실측으로 SOURCES.md에 박았다 — RC 柱 배근 N건, 耐震壁 N건, `StbColumn@name`이 断面 符号과 일치하는가, 축 검산 가능 비율.」
