# Step 7: 가드를 우회한 식별자를 없애고, 그 우회 자체를 막는다 (＋ R16 대장 누락)

**전제**: step 6이 `refuted`로 끝났다. 그 보고서(`step6-report.json`)는 **그대로 두어라** — 반증의 기록이다.

## 배경 — 무엇이 발견됐나
`src/lib/import/stb/types.ts`와 `apply.ts`의 두 타입 이름이 **유니코드 이스케이프로 쓰여 있다** — `Stb` 뒤의 `A`를 `\u0041`(같은 문자의 이스케이프 표기)로 적어 두었다. 직접 확인하라:

```
grep -rn '\\u' src/lib/import/stb/
```

TypeScript는 식별자 안의 유니코드 이스케이프를 허용하므로, 컴파일러에게 그것은 `StbApplyResult`·`StbApplyRefusal`과 **완전히 같은 이름**이다. 그런데 `scope-guard.test.ts`는 **원본 소스 문자열**에 `'StbApply'`가 들어 있는지를 `not.toContain`으로 검사하므로 이 표기는 가드를 그대로 통과한다. step 6의 `no-rulepack-territory` 전제도 같은 grep을 쓰므로 똑같이 통과했다 — 가드와 검증이 나란히 속았다.

**이 이름들 자체는 해롭지 않다.** `StbApply_RC_*` 요소를 읽는 코드는 어디에도 없고(ADR-043 실측 3·「하지 않는 것」), 이 타입은 반영 결과를 담을 뿐이다. 문제는 이름이 아니라 **기법**이다 — 같은 표기를 쓰면 진짜로 `depth_cover`를 읽는 코드도 가드와 검증을 나란히 통과한다. 가드가 막을 수 있다고 믿는 것을 못 막게 되는 것이 훨씬 나쁘다.

**원인의 절반은 사양이다.** step 2 사양이 타입 이름을 `StbApplyResult`로 못박으면서 동시에 「금지어 목록에서 무엇도 빼지 마라」고 했다 — 성립할 수 없는 둘을 같이 요구했다. 그때의 옳은 답은 이스케이프가 아니라 **`blocked`로 멈추고 모순을 보고하는 것**이었다. 이 스텝은 그 모순을 이름을 바꾸는 쪽으로 푼다.

## 할 일

### A. 식별자에서 이스케이프를 없앤다
1. `StbApplyResult` → **`StbSkeletonApplyResult`**, `StbApplyRefusal` → **`StbSkeletonApplyRefusal`**로 고쳐라. 이 이름들은 `StbApply`를 **부분문자열로 포함하지 않는다**(확인하라 — 포함하면 다른 이름을 골라야 한다).
2. 일관성을 위해 `STB_APPLY_REFUSALS` → **`STB_SKELETON_APPLY_REFUSALS`**로 함께 고쳐라. **배열 안의 값(사유 코드 문자열)은 바꾸지 마라** — 그것은 사용자에게 보이는 문면이고 로케일 키(`stbImport.refusal.<코드>`)의 일부다.
3. 참조하는 곳을 전부 따라가 고쳐라. 후보는 `src/lib/import/stb/types.ts`·`apply.ts`, `src/components/stb/StbImport.tsx`, `tests/stb-import/apply.test.ts`다. **`src/lib/import/framing-plan/`과 `src/components/plan/PlanImport.tsx`의 `PlanApplyResult`·`ElevationApplyRefusal`은 다른 타입이다 — 손대지 마라.**
4. `grep -rn '\\u' src/lib/import/stb/` 가 **0건**이 되어야 한다(테스트 파일 포함).

### B. 우회 자체를 막는다
`src/lib/import/stb/scope-guard.test.ts`에 검사를 하나 더하라 — **스캔 대상 소스에 유니코드 이스케이프 시퀀스(`\uXXXX`)가 하나도 없을 것.**

- 기존 `forbidden` 목록 검사는 그대로 두고, 그 옆에 나란히 두어라. **기존 검사를 고치거나 항목을 빼지 마라.**
- 실패 메시지에 **왜** 막는지를 적어라 — 「식별자 안의 유니코드 이스케이프는 위 금지어 검사를 통째로 무력화한다」는 취지로. 이유 없는 금지는 다음 사람이 지운다.
- 이 파일들에 유니코드 이스케이프가 필요한 정당한 이유는 없다(문자열 상수도 일본어를 그대로 쓴다). 예외 목록을 만들지 마라.

### C. R16이 대장 하나에만 있다
step 5가 `docs/RISKS.md`에 R16을 더했는데 `CLAUDE.md`의 「열린 리스크」 표는 아직 R15에서 끝난다. 표에 R16 행을 더하라.

- 형식은 그 표의 기존 행과 같게. 한 줄 요약이며, 근거·수치는 `docs/RISKS.md`에 있는 것을 넘지 마라.
- **`AGENTS.md`를 `CLAUDE.md`에서 다시 생성하라** — `tests/docs/guardrail-sync.test.ts`가 둘의 일치를 고정한다.
- `docs/RISKS.md`는 **손대지 마라.** 이미 옳다.

## 완료 조건 (AC)
1. `grep -rn '\\u' src/lib/import/stb/` 가 0건이다.
2. `grep -rn 'StbSkeletonApplyResult\|StbSkeletonApplyRefusal' src tests` 가 나오고, `npx tsc --noEmit`이 통과한다.
3. `scope-guard.test.ts`에 유니코드 이스케이프 금지 검사가 있고, **일부러 `apply.ts`의 식별자 하나를 이스케이프 표기로 되돌리면 그 검사가 실패한다**(확인 뒤 되돌려라). 이 확인 결과를 보고서에 적어라 — 실패하지 않으면 검사가 항진명제다.
4. `CLAUDE.md`와 `AGENTS.md`에 R16 행이 있고 `tests/docs/guardrail-sync.test.ts`가 통과한다.
5. `npm run lint`·`npm run test` 전부 통과. 테스트 수가 **줄지 않는다**(step 6 보고서의 97 파일 / 1,680 테스트가 기준선이다).

## 금지
- **바꿔도 되는 파일은 다음뿐이다**: `src/lib/import/stb/types.ts`, `src/lib/import/stb/apply.ts`, `src/lib/import/stb/scope-guard.test.ts`, `src/components/stb/StbImport.tsx`, `src/components/stb/StbImport.test.tsx`, `tests/stb-import/apply.test.ts`, `CLAUDE.md`, `AGENTS.md`. 그 밖의 파일이 `git diff --stat`에 나오면 되돌려라(하네스가 쓰는 `phases/34-stbridge-apply/*` 로그는 예외다).
- **동작을 바꾸지 마라.** 이 스텝은 이름 바꾸기와 검사 추가와 표 한 줄이다. `applyStbGrid`·`applyStbStories`의 로직, 사유 코드 **문자열 값**, 로케일 키·문면, 픽스처를 하나도 바꾸지 마라.
- `scope-guard.test.ts`의 기존 금지어 목록에서 무엇도 빼지 마라. 이름 충돌이 나면 **가드가 아니라 이름을 고쳐라.**
- `docs/` 아래를 고치지 마라(`CLAUDE.md`·`AGENTS.md`는 레포 루트다).
- `phases/34-stbridge-apply/step6-report.json`을 고치거나 지우지 마라.
- 사양의 요구가 서로 모순되면 **이스케이프·주석·목록 축소로 우회하지 말고 `blocked`로 멈추고 무엇이 모순인지 적어라.** 그것이 이 스텝이 존재하는 이유다.
