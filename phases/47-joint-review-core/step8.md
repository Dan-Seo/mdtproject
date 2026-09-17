# Step 8: region-prefilter-fix — 영역 후보 축소가 利用者 あき 기준 안의 쌍을 떨어뜨리는 결함 수정

## 배경 (Claude 반례, 2026-09-17)
step 5의 `runGeometryCheck`는 XY(평면) 영역 후보를 `segmentIntersectsRegion(instance, regionMm)`로 고르는데, 이 함수는 세그먼트의 X/Z 범위를 **팽창 없이** 영역과 겹치는지만 본다. 쌍 broad phase는 `radius + max(NUMERICAL_TOLERANCE_MM, valueMm)`만큼 팽창하지만, 그 앞단의 영역 후보 축소가 팽창하지 않아 다음이 떨어진다:

- 샘플 案件 접합부 `1F-X2Y1`, `settings.clearance.valueMm = 40`: 전 대상 세그먼트 쌍을 `capsuleClearanceMm`로 직접 계산해 「최근접점 중점이 regionMm 안」인 것만 남기면 766건(干渉候補·接触·あき不足候補 합), `runGeometryCheck`는 738건 — **あき不足候補 28건 누락**, 잉여 0건.
- 누락 예: `1F-G1-X1Y1-X|stirrup` barIndex 51(x=5550, r 6.5)은 regionMm.x=[5575, 6425] 밖이라 후보에서 빠지지만, `1F-G1-X1Y1-X|bottom` 세그먼트(x=5600, r 12.5)와의 clearance는 50 − 6.5 − 12.5 = 31 < 40이고 중점 x≈5575는 영역 안이다. `1F-G2-X2Y1-Y|stirrup` barIndex 0(z=450)과 regionMm.z 상한 425도 같다.
- valueMm null·26에서는 누락 0건(31 > 26). 즉 결함은 **이용자 기준값이 커질수록** 드러난다 — 이용자가 기준을 40으로 넣으면 실제 후보 28건이 조용히 「あき不足候補なし（検査条件内）」에 묻힌다. 정보 부족≠합격 원칙 위반.

## 수정 (`src/lib/review/geometry-check.ts`만)
- 영역 후보 축소를 쌍 broad phase와 같은 규칙으로: 세그먼트의 X/Z 범위를 `instance.radius + padding`(padding = `Math.max(NUMERICAL_TOLERANCE_MM, settings.clearance?.valueMm ?? 0)`)만큼 팽창한 뒤 `regionMm`와 겹치는지 본다. (또는 영역 후보 축소를 없애고 쌍 broad phase＋중점 판정만 남겨도 된다 — 어느 쪽이든 아래 테스트가 판정한다.)
- `regionMm`·중점 판정·verdict·checkId 규칙은 바꾸지 마라. `pairsTested`는 실제 계산한 쌍 수 그대로.

## 부수 수정 (같은 step, 별도 커밋 불필요)
`src/domain/review/impact.ts`의 이용자 표시 문자열 세 곳에 한국어 「변경」이 섞여 있다(step 4 산출). 일본어 「変更」으로 고친다 — `'備考 변경'`→`'備考 変更'`, `'通り芯名 변경'`→`'通り芯名 変更'`, `` `${id} ${changed.join('・')} 변경` ``→`` `${id} ${changed.join('・')} 変更` ``. 다른 문구·로직은 손대지 마라. 테스트가 이 문자열을 고정하지 않으므로 `impact.test.ts`에 한 줄 추가: display-only 변경 report의 `displayOnly[].detail`과 member `変更` entity의 `detail`에 한글(U+AC00–U+D7A3)이 없다(`expect(detail).not.toMatch(/[가-힣]/)`).

## 테스트 (먼저 쓴다) — `src/lib/review/geometry-check.test.ts`에 추가
step 5 사양의 테스트 6을 실제로 만든다:
- 「영역·broad phase가 결과를 바꾸지 않는다」: `1F-X2Y1`에서 `jointRebarMemberIds`(未対応 제외)에 속한 인스턴스 전부를 `buildingLayout(project, rebars, unsupported, (size) => barDiameter(size)/2)`로 얻어, **모든 쌍**(같은 `rebarId`＋`barIndex`는 제외)을 `capsuleClearanceMm`로 계산하고 최근접점 중점의 X/Z가 `result.scope.regionMm` 안인 것만 kind(干渉候補 `< −tol` / 接触 `|c| ≤ tol` / あき不足候補 `tol < c < valueMm`)로 분류한 집합이, `runGeometryCheck(...).findings`의 `{kind, a, b}` 집합과 `toEqual`(순서 무관 — 정렬해 비교). `settings.clearance`를 `null`·`26`·`40`으로 세 번. 40에서 현재 구현은 28건 부족으로 **빨개져야 한다**(수정 전 실패를 report에 적는다).
- 기존 테스트(−22·25·24/26·exclusion·checkId·検査対象なし·1F-X1Y3·stress)는 전부 그대로 통과.

## 변이 확인
① 팽창을 다시 제거(`padding` 0) → 40 케이스가 빨개진다 ② 팽창에서 `instance.radius`를 빼면 접촉 경계에서 빨개지는지 확인하고 결과를 적는다(빨개지지 않으면 그 이유를 적는다 — 「반경만큼은 중점 판정이 흡수한다」 등).

## Acceptance Criteria
```bash
npx vitest run src/lib/review
npx tsc --noEmit
npm run lint
npx vitest run
```

## 산출물
`step8-report.json`: `{ "changed_files", "tests_added", "before_fix": { "clearance_40_missing": 28 }, "after_fix": { "clearance_40_missing": 0, "clearance_26_missing": 0, "clearance_null_missing": 0 }, "mutations": [...], "paths_verified": ["src/lib/review/geometry-check.ts", "src/lib/review/geometry-check.test.ts"] }`

## 금지사항
- 鉄筋のあき 기준값을 코드·룰팩에 넣지 마라(40·26·24는 테스트 입력이지 규준값이 아니다 — 주석에).
- `src/domain`·`src/lib/viewer`·`src/components`를 수정하지 마라. `segment-distance.ts`를 바꾸지 마라.
- 표시 반경(`rebarRadius`)으로 검사하지 마라.
- 「合格」「安全」「施工可能」 문자열을 만들지 마라.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.
