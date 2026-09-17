# Step 7 (verify): refute-core — step 1~6을 반례로 반증한다. **고치지 마라.**

이 step은 검증 전용이다. 어긋남을 찾으면 status를 `refuted`로 두고 `summary`와 `step7-report.json`에 무엇이 어긋났는지 적어라. 대상을 고치지 마라 — 고치면 검증자가 구현자가 된다. 어긋남이 없으면 `completed`.

## 읽어야 할 것
- `phases/47-joint-review-core/README.md`(결정 1~10·완료 조건 12·샘플 사실)와 step1~6.md의 「금지사항」
- step1~6-report.json (자기 보고다 — 믿지 말고 대조하라)
- 비교 기준 SHA ＝ `git merge-base main HEAD`(가변 `main`이 아니라 이 phase의 분기점). `git diff <base>...HEAD --stat`과 각 파일 diff

## 반증 항목 (각각 실제로 실행하고 결과를 report에)
1. **범위**: diff에 사양에 없는 파일·기능(컴포넌트, 새 이벤트 `capture(`, 룰팩 YAML 변경, `PROJECT_SCHEMA_VERSION`·`DATABASE_VERSION` 변경, `Project` 타입 필드 추가, `package.json` 의존성)이 있는가. `git diff <base>...HEAD -- src/rulepack tests/golden/fixtures src/domain/rebar src/domain/quantity`가 `ruleIdentity` export 외에 비어 있는가.
2. **数量 불변**: `npm run test:golden` 통과, 그리고 base와 HEAD에서 `buildTakeoff(createSampleProject())`·`createStressProject({xSpanCount:4,ySpanCount:3,storyCount:2})`의 `lines`를 JSON으로 덤프해 **바이트 동일**. 방법: base는 `git worktree add`로 별도 트리(실행 중 트리를 바꾸지 마라). 덤프는 `npx tsx`가 아니라 **임시 vitest 파일**(`tests/tmp-takeoff-digest.test.ts` — YAML raw import는 vitest 로더가 처리한다; `npx tsx`는 `src/rulepack/index.ts`의 YAML import를 못 읽는다)을 양쪽 트리에 같은 내용으로 두고 `JSON.stringify(lines)`의 `hashString`(또는 파일로 써서 `cmp`)을 출력해 비교. 끝나면 임시 파일·worktree 제거.
3. **순수성(import 문 기준, 프로덕션 파일만)**: `src/domain/review/*.ts`(`*.test.ts` 제외)의 `import` 줄에 `@/lib`·`react`·`three`가 없고, 본문에 `Date.now(`·`crypto.` 호출이 없다(주석은 제외 — `grep -v '^\s*//'`). `src/lib/review/*.ts`의 `import` 줄에 `@/components`·`react`·`three` 없음.
4. **변이 재현**: 각 step report의 `mutations`에서 하나씩 골라(총 6건) 실제로 그 변이를 넣고 지목된 테스트가 빨개지는지 확인 후 `git checkout --`로 원복. 빨개지지 않으면 refuted.
5. **반례 — 완료 조건 12개(README) 중 코어에서 판정 가능한 것**:
   - (1) `1F-X2Y1` 上端筋 G1/G2 干渉候補의 `clearanceMm`가 −22±1e-6이고 `closestPoints` XY가 柱 평면 범위 안이며 두 BarRef가 다른 大梁인가.
   - (2) 같은 접합부 下端筋 수평 세그먼트 쌍 clearance 25: `valueMm 24`에서 없고 `26`에서 있는가. **추가 반례**: 두 수평 철근을 높이 차 48.5·반경 12.5/11로 두는 합성 案件(또는 위 쌍)에서 `valueMm: 26`일 때 broad phase가 그 쌍을 떨어뜨리지 않는가.
   - (3) 継手位置 등이 `unchecked`에 남는가. verdict 타입에 총괄 합격 값이 없는가. 柱만 남은 접합부에서 `検査対象なし`인가.
   - (4) 帯筋↔主筋 제외 상태에서 大梁 교차 干渉候補 유지·`excludedCounts.接触 > 0`인가. `kinds: ['接触']` 제외가 干渉候補를 제외하지 않는가.
   - (5) `section-G2` 피치 변경 시 `joint 1F-X1Y1` 항목은 유효하고 `joint 1F-X2Y1`·G2 대상 항목만 재검토인가; 案件名·備考·xLabels·`ClipState`·pose 변경으로 어떤 항목도 무효화되지 않는가; `enteredAt`만 바뀐 あき 기준은 무효화하지 않는가.
   - (6) `valueMm` 변경이 `finding` 있는 항목만 무효화하는가(`検査条件変更`). 접속 大梁 삭제 → `対象変更`인가.
   - (7) X-Ray의 `quantity.designCount`·`designLengthMm`가 `Rebar.count`·`length`와 같고 `shape`와 다른 필드인가. 형상 없는 역할에서 throw하지 않는가.
   - (8) `unitMass` 미입력 행이 `LineChange.mass`에서 `単位質量未入力`로, 값 0으로 나오지 않는가. 未対応 부재가 fingerprint `result: null`로, 귀속 철근 0개 정상 부재(런 동료)가 빈 배열 해시로 구분되는가.
   - (9) `serializeProjectFile` → `readProjectFile` round-trip 후 `items[].targets`·`snapshot.fingerprints`·`packages` `toEqual`; 빈 review 파일이 구 형식과 문자열 동일; `saveBundle`이 한 트랜잭션인가(`transaction` 호출 수).
   - (10) 필수 체크리스트가 확인된 패키지가 대상 柱 断面 변경 후 `準備完了`를 유지하지 않는가 — 연결 항목 있는 경우와 **연결 없는 `confirmation.fingerprints`** 경우 둘 다. 연결 항목이 `未確認`인데 `準備完了`가 되지 않는가.
   - (11) id가 바뀐 부재가 `対応要確認`으로 나오는가(삭제＋추가 아님); review 版 `2` 파일이 throw하는가; `rulepackFingerprint`가 `source.url` 변경에 반응하는가.
   - (12) 같은 입력의 `runGeometryCheck` 두 번이 `toEqual`이고 `rebarRadius`로 만든 레이아웃과 세그먼트 반경이 다른가. 후보 축소 on/off 결과가 같은가.
   각 항목은 **임시 vitest 파일**로 실행하고 원복한다(커밋에 남기지 않는다). 출력값을 report에 붙여라.
6. **테스트의 반증 가능성**: `src/domain/review/*.test.ts`·`src/lib/review/*.test.ts` 중 「구현 결과를 그대로 기대값으로 쓰는」 테스트(같은 새 구현의 출력을 계산해 `toEqual`/`toBeCloseTo` 기준으로 쓰는 것 — 단, 결정성 테스트(같은 입력 두 번)와 변경 전 픽스처 보존 테스트는 제외)가 있는가. 유도 주석 없는 수치 기대값이 있는가. 있으면 refuted 사유.
7. **문구**: 코드·타입에 「合格」「安全」「施工可能」「承認」이 판정 값으로 존재하는가(`grep`). 「確認済」 주석이 체크리스트 충족임을 밝히는가.

## Acceptance Criteria
```bash
npx vitest run
npm run test:golden
npx tsc --noEmit
npm run lint
python scripts/check-citations.py phases/47-joint-review-core/step*-report*.json
```

## 산출물
`step7-report.json`: `{ "verdict": "upheld" | "refuted", "base_sha": "...", "checks": [{ "id": 1..7, "result": "pass" | "fail", "evidence": "..." }], "counterexamples_run": [{ "case": 1, "command": "...", "output_excerpt": "..." }], "mutations_reproduced": [...], "paths_verified": [...] }`

## 금지사항
- 찾은 것을 고치지 마라. 이유: 교차검증 — 만든 쪽이 자기 것을 승인하지 않는 것과 같은 원리로, 검증자가 구현자가 되면 검증이 사라진다.
- 「돌려봤다」「통과했다」로 끝내지 마라 — 항목마다 실행한 명령과 출력 발췌.
- 실행하지 않은 검증을 했다고 쓰지 마라.
- 임시 파일·worktree를 커밋에 남기지 마라.
