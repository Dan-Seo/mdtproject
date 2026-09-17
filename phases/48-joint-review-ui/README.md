# Phase 48: joint-review-ui — 접합부 검토실·변경 영향·작업 준비 보드의 화면, 3D 접합부 모드, e2e, 문서

**전제**: main이 phase 47 머지 커밋 `e1031a2` 이후여야 한다(step 8 `region-prefilter-fix` 포함 — `git log --oneline | grep "phase 47"`로 확인). 코어의 함수·타입을 **그대로 쓴다** — 화면에서 규준 계산·의존 판정·검사 판정을 다시 쓰지 않는다. 코어 API의 실제 시그니처는 코드가 정본이다: `resolveJoint(project, columnMemberId)`(`src/domain/review/joint.ts`), `supportColumnIds(project, girderMemberId)`(같은 파일 — **이미 있다**, 새로 만들지 마라), `runGeometryCheck(input: CheckInput)`·`defaultExclusions(now)`(`src/lib/review/geometry-check.ts`), `assessImpact(baseline: TakeoffSnapshot, current: TakeoffSnapshot)`(`src/domain/review/impact.ts`), `itemValidity(item, current: CurrentModel): ReviewValidity`·`effectiveItemStatus(item, validity: ReviewValidity)`·`itemsNeedingRecheck`·`itemTargetMemberIds`(`validity.ts`), `packageReadiness(pkg, items, current)`(`readiness.ts`), `xrayForRow(rowId, rebars, project, lines)`·`rebarsUsingRule`(`src/lib/review/xray.ts`), `projectFingerprints(project, rebars, unsupportedMemberIds, pack, checkVersion, checkConditions)`·`checkConditionsFingerprint(settings, exclusions)`(`fingerprint.ts`), reducer `addItem`·`updateItem`·`confirmItem`·`holdItem`·`setClearance`·`addExclusion`·`removeExclusion`·`addPackage`·`updatePackage`·`setChecklistStatus`·`setBaseline`·`newReviewId(prefix, existingIds)`(`state.ts`), `memberWorldPoint(project, member)`(**두 인자** — `src/lib/viewer/building.ts`), 스토어 `setReview(updater)`·`loadProject(project, review?)`(`src/lib/store.ts`), 저장 `saveBundle`·`loadStoredBundle`(`src/lib/persist/indexeddb.ts`). `ReviewState`의 版 필드는 `reviewSchemaVersion`(`types.ts`)이며 `version`이 아니다. `buildTakeoff`는 `TakeoffResult{rebars, lines, unsupportedMembers}`를 돌려주고 `TakeoffSnapshot`이 아니다.

## 샘플 案件의 사실(phase 47 README와 동일 — 테스트·e2e는 이것만 쓴다)
- 柱 `1F-X2Y1`: 大梁 2개 — `1F-G1-X1Y1-X`(G1, 終端)·`1F-G2-X2Y1-Y`(G2, 始端). 上端筋 G1(D25) vs G2(D22) 수평 세그먼트 clearance **−22**(干渉候補), 下端筋 수평 세그먼트 **+25**(あき 기준 26 이상에서 あき不足候補). e2e·컴포넌트 테스트의 기본 접합부.
- 柱 `1F-X2Y2`: 大梁 3개(전부 G2). **4개인 柱는 없다.**
- 柱 `1F-X1Y3`: Y 런 終端 — 런 대표 `1F-G1-X1Y1-Y`의 上端筋이 검사 대상에 들어온다.
- `2F-X1Y1`: 위층 없음 → reference는 `1F-X1Y1`뿐.

## 공통 결정 (모든 step)
1. **단일 화면 유지(UX.md §3.2·§9).** 새 페이지·라우트·위저드·랜딩·대시보드·전역 배너를 만들지 않는다. 검토 UI는 内訳書 페인의 **페인-로컬 탭** 「内訳書｜検討｜作業」이고, 3D 페인은 「部材｜建物｜接合部」 세 번째 탭이다(StoryTabs·ViewerTabs 선례).
2. **표시부는 판정하지 않는다.** 화면은 위 코어 함수의 결과를 보여줄 뿐이다. `src/components/review/**`·`Viewer3D.tsx`에서 `lookupRule(`·`girderSpan(`·`capsuleClearanceMm(`·`memberDependencies(`·`memberInputs(`를 직접 부르지 않는다. 3D 치수를 계산 근거처럼 표시하지 않는다.
3. **상태를 합치지 않는다.** confidence 표시(△·▲, 기존 `ConfidenceWarning`·`sourceLabel`) / 검사 verdict 세 축(clash·clearance·contact) / 未検査·判断不可·検査対象なし / 사람의 status / 패키지 준비는 각각 다른 자리·다른 문구다.
4. **문구 규칙(정확히 이것).** 판정·상태를 나타내는 요소 — `data-review-verdict`(검사 verdict 세 줄), `data-review-status`(検討項目 배지), `data-package-state`(패키지 준비 배지), `data-blocker`(blocker 행) — 의 텍스트에 「合格」「安全」「承認」「施工可能」「適合」이 없다. **고지문**은 `data-review-notice` 요소에 두고 규칙의 검사 대상에서 제외한다: 検討項目 절 「確認済はチェックリストの充足を意味し、構造安全・法規適合・施工承認の判定ではない」, 作業 탭 「準備完了は登録したチェックリストの充足であり、法的な施工承認や構造安全の判定ではない」. 테스트는 (i) 위 네 속성 요소의 텍스트에 금지어가 없음, (ii) 두 고지문이 각 절에 존재함을 **둘 다** 확인한다. 페이지 전체·i18n 파일 전체를 금지어로 grep하지 않는다 — 기존 M1 고지(`AppShell.tsx`, `ja.json`의 「承認者」)가 있어 성립할 수 없다.
5. **원본 보호.** 검토용 입력(あき 기준·除外)은 `review.settings`·`review.exclusions`에만 쓴다. 기준안 고정은 `Project` 깊은 복사이며 편집은 항상 현재안에만 간다. 어떤 버튼도 `Project`의 断面·配筋 값을 자동으로 바꾸지 않는다(`updateProject`를 검토 UI가 부르지 않는다).
6. **로컬.** 새 `capture()` 이벤트를 만들지 않는다(검토 데이터가 라벨로도 새지 않게 — `src/lib/telemetry.ts` allowlist를 늘리지 않는다). 외부 요청 0.
7. **입력은 blur/Enter/저장 버튼에서 커밋한다.** `state.ts`의 모든 reducer는 입력·출력을 `parseReviewState`로 두 번 검증하고 `baseline.project`가 있으면 `parseProject`까지 돈다. 그러므로 텍스트 입력(あき 값·범위·메모·title·body·担当者·label·reason)은 **컴포넌트 로컬 state**로 받고 blur·Enter·「保存」에서만 `setReview`를 부른다. 키 입력마다 reducer를 부르는 코드는 금지(테스트로 고정: 타이핑 5회에 `setReview` 호출 0, blur에 1).
8. **파생값의 계산 시점.** `useReviewModel`의 `projectFingerprints`·`assessImpact`는 `useMemo`(project·takeoff·baseline 의존)이며 **検討·作業 탭이 마운트된 동안만** 계산된다(内訳書 탭에서는 훅을 부르지 않는다). 검사(`runGeometryCheck`)는 「検査を実行」에서만, 선택 접합부 하나에만 돈다. 자동 재검사 없음. 비동기로 만들지 않는다(동기 — step 6에서 실측).
9. **성능 목표(phase 48의 UX 목표 — 규준값·코드 규칙 아님).** 프로덕션 빌드·headless dev-browser·5층 스트레스 案件(`npx tsx scripts/perf/stress-fixture.ts 5`)에서 워밍업 1회 후 3회 중앙값: 접합부 탭 진입 ≤ 1500 ms, 「検査を実行」 클릭→findings 표 렌더 ≤ 3000 ms, 断面 `b` 입력 커밋→비교 절 갱신 ≤ 3000 ms, 탭 전환 ≤ 500 ms. 초과하면 step 6은 `error`로 끝내고 수치와 병목 후보를 report에 적는다(통과시키려고 목표를 올리지 않는다).
10. i18n: `ja.json`이 기본, `ko.json`은 같은 키를 전부 갖되 도메인 용어(柱·大梁·主筋·帯筋·定着·継手·かぶり)는 일본어 그대로(ADR-008). **소스의 일본어 리터럴은 원어 그대로 쓴다 — 유니코드 이스케이프 금지**(phase 47에서 codex가 이스케이프로 써서 Claude가 되돌렸다).
11. **후속 연결 지점(4D·BCF·조립 검사·타 분야)은 코드·타입·저장 키·UI에 넣지 않는다.** ADR-049의 「후속」 절 문장으로만 남긴다(step 7).

## 스텝
| step | 이름 | 산출 |
|---|---|---|
| 1 | viewer-state-and-joint-layout | 스토어(joint 모드·clip 이동·pose·focus·탭), ViewerTabs 3탭, `joint-layout.ts`(순수)＋독립 좌표·bounds 오라클 테스트 |
| 2 | viewer-joint-scene | Viewer3D 접합부 씬·参考 박스·마커(위치 오라클)·pose 캡처/복원·未対応 패널 |
| 3 | review-tabs-joint-xray | ReviewTabs·`useReviewModel`(`toSnapshot`)·検討 탭 (a) 接合部 (b) X-Ray |
| 4 | review-check | 検討 탭 (c) 形状検査(あき·除外·実行·verdict·findings·마커 연동) |
| 5 | review-items | 検討 탭 (d) 検討項目(생성·確認·保留·判断不可·再現·필터)·고지 |
| 6 | review-compare | 検討 탭 (e) 基準案 고정·비교 |
| 7 | work-packages | 「作業」 탭(패키지·체크리스트·준비 상태)·고지 |
| 8 | e2e-flow | `tests/e2e/uc25-joint-review.js` 19단계(부정 assertion 포함)＋회귀 7개 |
| 9 | perf-browser | `tests/e2e/uc25-perf.js` 실측(샘플·스트레스 5층, 워밍업＋3회 중앙값) |
| 10 | docs-sync | ADR-049, RISKS R18, MILESTONES, CLAUDE.md＝AGENTS.md, ARCHITECTURE, e2e README |
| 11 | refute-ui (verify) | 반증 — 실행 가능한 오라클·변이 1건 실투입. e2e·perf 재실행은 Claude 몫 |

각 step은 하네스 1800초 한도 안에서 끝나야 하므로 화면 절 단위로 나눴다. 한 step이 시간 초과로 `error`가 되면 그 step만 재실행한다.

## 반증 반영(2026-09-17, Herdr codex 반증 `spec-refutation.md`)
- `memberWorldPoint(project, member, { role })` → 두 인자 계약으로 정정(step 1). `supportColumnIds` 신설 → 기존 함수 재사용.
- `1F-X2Y2` 「大梁 4개」 전제 → 삭제. 기본 접합부를 `1F-X2Y1`(2개)로.
- step 1·2가 1800초 초과 → 4개로 분할.
- 금지어 규칙과 고지문의 모순 → 결정 4로 요소 한정.
- 키 입력마다 reducer → 결정 7. `runGeometryCheck`의 전 건물 `buildingLayout` 비용 → 결정 9의 실측 목표로 잡고, 코어를 바꾸지 않는다(초과 시 phase 49에서 레이아웃 재사용).
- `jointLayout`↔`buildingLayout` `toEqual`만으로는 공통 오류를 못 잡는다 → step 1에 독립 좌표 오라클(帯筋 x ＝ 通り芯 x − b/2 ＋ かぶり ＋ r) 추가.
- e2e에 저장 형태·구 파일·版 불일치·clip/pose 후 checkId 불변의 부정 assertion 추가(step 6). step 8의 반례마다 오라클·실패 조건 명시.
- 4D/BCF 연결 지점 → 코드에서 제거, ADR 문장만(결정 11). ADR-049 문장은 반증자 제안 5건을 채택(step 7).
- step 8 의존 → 전제로 명시(머지됨).

## 반증 반영 v2(2026-09-17, `spec-refutation-v2.md`, verdict refuted)
- `review.version` → 실제 필드 `reviewSchemaVersion`(step 8·10). `effectiveItemStatus(item, current)` → `(item, itemValidity(item, current))`(step 5). `finding: null` → 필드 생략(step 5). `toggleLayer` → `toggleViewerLayer`(step 5). `buildTakeoff`는 `TakeoffResult` → `toSnapshot`으로 변환 규칙 명시(step 3).
- 版 불일치 시 「readProjectFile 메시지가 보인다」 → 현행 `ProjectActions`는 메시지를 버리고 `project.loadFailed`만 보이므로 그 문구로 검사, 동작 변경 없음(step 8).
- 1800초: step 3→3·4, step 5→6·7, e2e→8·9로 분할, verify에서 e2e·perf 재실행 제거(Claude가 재실행).
- 반증 불가 테스트: bounds 합집합 오라클(step 1), 마커 양 끝·중점 오라클(step 2), 패키지 카드 「数量」 부재(step 7), checkId＋findings·verdict 텍스트 동일(step 8), 표시부 금지를 import 경로로도 검사(step 11).
- 「worktree의 phase 47 index가 pending」 → 반증자가 본 worktree(`wt47`, 7725378)의 문제이고, 하네스는 main(`e1031a2` 이후)에서 돈다. 전제 확인 명령을 README 첫 줄에 유지.
- 채택하지 않음: `jointLayout`↔`buildingLayout` `toEqual` 테스트 삭제 — 독립 오라클(2·8) 옆에 보조로 둔다(공통 helper 회귀 감지용).
