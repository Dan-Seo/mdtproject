# Step 1: unsupported-support — 支持柱なし·上部大梁なし는 부재 단위 未対応으로, 大梁 런은 같은 断面일 때만 잇는다

## 읽어야 할 파일
- `phases/45-partial-import-unsupported/step0.md`·`step0-report.json`·`step0-report-r1.json`(census·counterexample)
- `src/domain/model/unsupported.ts` (머리 주석: 「사용자 입력만으로 도달할 수 있는 성립 불가 형상」만 이 오류로 감싼다)
- `src/domain/model/project.ts` — `supportColumnSection`·`girderSupportSections`·`girderSpan`·≈L728~752의 片持 경로(`supportColumnSection(..., true)` 호출 2곳)·`girderRun`(≈L1384~1450)·`slabRun`(≈L1240~1300)·`beamDepthAbove`(≈L1520~1550)
- `src/domain/model/project.test.ts` (`girderSpan`·`girderRun`·`beamDepthAbove`/`columnEnds` 테스트 블록)
- `src/locales/ja.json`·`ko.json`의 `takeoff.unsupported.*`, `src/lib/i18n.test.ts`의 `Record<UnsupportedReason, true>`
- `docs/ADR.md` — ADR-028 부근의 「連続する床板은 大梁의 런과 같은 형태로 잡는다」 단락(같은 断面이 연속의 조건), `CLAUDE.md` CRITICAL 규칙

## 작업 (TDD — 테스트를 먼저 빨갛게 만들고 구현)
1. **테스트 먼저** `src/domain/model/project.test.ts`:
   - `throws when either end support 柱 is missing`를 두 케이스(始端 없음·終端 없음)로 나누고 `toThrow(MemberUnsupportedError)` ＋ `reason === '支持柱なし'` ＋ 메시지에 부재 id 포함으로 조인다.
   - `beamDepthAbove`(또는 그것을 쓰는 `columnEnds`)에 「닿는 大梁이 없는 柱」 케이스: `MemberUnsupportedError`·`reason === '上部大梁なし'`. 닿는 大梁이 있으면 depth를 돌려주는 케이스가 없으면 추가.
   - `girderRun`: 같은 通り에 인접한 大梁 둘의 `sectionId`가 다르면 **각각 한 부재짜리 런**이 된다(둘 다 지점 柱 있음 — 1판 counterexample 형태). 같은 断面이면 기존대로 한 런. 세 개 G1·G2·G1이면 런 셋. 기존 「mixed sections throw」 테스트가 있으면 이 테스트로 **대체**한다(report에 명시).
   - 片持 경로의 기존 테스트가 「支持柱 없음 → `寸法不成立`」을 단언하면 `支持柱なし`로 바꾼다(목록을 report에). **内法 ≤ 0 → `寸法不成立`**은 그대로.
2. **구현** `unsupported.ts`: `UnsupportedReason`에 `'支持柱なし'`(大梁의 始端/終端 격자점에 柱가 없다)·`'上部大梁なし'`(柱에 닿는 大梁이 그 階에 없다)를 doc 주석과 함께 추가. 주석에 「図面セット·伏図의 부분 취입으로 도달한다 (ADR-047)」.
3. `project.ts`:
   - `supportColumnSection`의 `unsupported` 매개변수를 없애고 支持柱 없음은 항상 `MemberUnsupportedError('支持柱なし', message)`. 「柱 member references a non-柱 section」은 내부 결함이라 plain `Error` 유지. ≈L736·L744의 `true` 인자 제거.
   - `beamDepthAbove`의 `depths.length === 0` → `MemberUnsupportedError('上部大梁なし', ...)`.
   - `girderRun`: 후보 필터에 `candidate.sectionId === member.sectionId`를 더해 **같은 断面인 인접 부재만** 런으로 잇는다 — `slabRun`의 조건과 주석(「同一断面であることを連続の条件にする … 図面にない連続を作らない」)을 그대로 따른다. 그러면 mixed sections throw는 도달 불가가 되므로 **삭제**한다(죽은 검사를 남기지 않는다).
4. 로케일: `ja.json`·`ko.json`에 `takeoff.unsupported.reason.支持柱なし`·`plan.支持柱なし`·`reason.上部大梁なし`·`plan.上部大梁なし`. ja는 일본어, ko는 한국어(柱·大梁·断面은 원어). plan은 사용자가 할 일: 「その格子点の柱の断面を登録して再取込するか、柱を配置する」／「その柱に取り付く大梁の断面を登録して再取込するか、大梁を配置する」 취지. `i18n.test.ts`의 `Record<UnsupportedReason, true>`에 두 값을 추가한다.
5. 반증 가능성 기록: 구현 뒤 ①②의 throw를 **일시적으로** plain `Error`로 되돌리고, ③은 `sectionId` 조건을 빼서 1의 테스트가 빨갛게 되는 것을 확인하고 원복한다(실패 테스트명을 report의 `mutations`에. 원복 후 `git diff --stat`이 의도한 파일만).

## Acceptance Criteria
```bash
npx vitest run src/domain/model/project.test.ts src/domain/rebar src/lib/i18n.test.ts
npx tsc --noEmit
npm run lint
npx vitest run   # 전체 — 기존 테스트가 깨지면 이유를 report에 적고, 위 1의 범위 밖 테스트를 고쳐야 한다면 blocked
```

## 산출물
`phases/45-partial-import-unsupported/step1-report.json`: `{ "changed_files": [...], "tests_added": [...], "tests_tightened": [...], "tests_replaced": [...], "mutations": [{ "site": "supportColumnSection", "failing_tests": [...] }, { "site": "beamDepthAbove", "failing_tests": [...] }, { "site": "girderRun sectionId", "failing_tests": [...] }], "paths_verified": [...] }`

## 금지사항
- `Rule not found`·`Section not found`·`non-柱 section`·`storyNotFound` 같은 내부 결함을 `MemberUnsupportedError`로 감싸지 마라. 이유: `unsupported.ts` 머리 주석 — 결함이 「미지원 부재」로 흡수되면 화면에서 사라진다.
- 런을 断面 외의 기준(径·본수 일치 등)으로 잇지 마라. 이유: `slabRun` 주석대로 「断面이 같음」이 충분조건이고 도면에 없는 연속을 만들지 않는다.
- `src/lib/import/**`·`src/rulepack/**`·`tests/fixtures/**`·`src/domain/rebar/**`의 생성 로직을 만지지 마라. 이유: 이 phase는 엔진의 오류 등급과 런 조건만 바꾼다. 취입 계층에 엔진 불변식을 복제하지 않는다.
- 규준 수치 리터럴을 `.ts`에 쓰지 마라 (ADR-002). `src/domain`에 React·DOM을 import하지 마라.
- 테스트를 구현에 맞추지 마라 — 「구현을 되돌리면 실패하는가」가 기준이다.
