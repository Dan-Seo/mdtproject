# Step 0 (verify): ADR-037의 전제를 반증하라

**역할**: 검증 전용이다. `docs/ADR.md`의 **ADR-037**을 읽고 아래 전제들을
코드·픽스처로 **반증**하라. 대상 코드를 한 줄도 수정하지 마라. 반증이
성립하면 status **`refuted`**(정상 종결), 전부 버티면 `completed`.

## 반증 대상 전제

1. **(always-two-anchorages)** `src/domain/rebar/wall.ts`의 `buildWallBars`는
   벽의 범위와 무관하게 **항상 양단에 定着**을 더한다(`pathLengthMm =
   bodyLengthMm + 2 * anchorageMm`). 자유단을 표현할 방법이 지금 없다 —
   실행 반례로 보여라: 벽 하나를 만들고 開口로 한쪽을 통째로 비워도
   横筋의 設計長さ에 定着이 2회 들어가는 것을 값으로 남겨라.
2. **(opening-workaround-misfires)** 경계에 접한 開口로 袖壁·腰壁을 흉내 내면
   개구 전용 조문이 잘못 발화한다. 최소 둘을 실행으로 특정하라 —
   ① `measure.splice.wall.opening`(縦筋 継手 0か所)이 어떤 조건에서 발화하는지,
   ② 1通則8)의 0.5㎡ 하한(`measure.opening.deduction.minimum.area`)이 작은
   袖壁 흉내를 무효화하는 경계 치수. 開口補強筋 고지 문면이 開口 유무로
   갈리는지도 확인하라.
3. **(schema-no-bump)** `Member`에 optional 필드를 더해도 기존 案件의 数量이
   변하지 않는다 — 현행 골든 전부와 직렬화 왕복이 불변임을 근거로 판단하라.
   변한다면 반증이다.
4. **(opening-origin-consumers)** `Opening.xMm/yMm`가 内法域 원점 기준임을
   코드로 확인하고, **内法域 치수를 읽는 코드를 전수로 특정하라** —
   `wallSpan`·`openingDeduction`·`wallLayerOffsets`·`src/lib/viewer/geometry.ts`의
   `carveBox`/`clipSegments`·`src/lib/viewer/building.ts`·`PlanEditor.tsx`.
   범위 도입 시 원점이 어긋날 지점을 목록으로 남겨라 — step 1~3이 그 목록을 쓴다.
5. **(no-auto-shape)** 断面リスト 壁 후보(`SectionCandidate`)와 伏図 배치 후보
   어디에도 벽의 높이·길이 치수 필드가 없다. 실도면 픽스처
   (`tests/fixtures/section-import/expected/`)에도 그 값이 없다 — 자동 판정 불가.
6. **(splice-rule-reusable)** `measure.splice.wall.opening`(0か所) 룰팩 행이
   이미 있고 조건 없이 조회된다 — 부분 높이 벽에 그대로 쓸 수 있어 룰팩
   신규 행이 0이다. 조건이 붙어 있어 재사용이 불가능하면 반증이다.
7. **(no-overlap-guard)** 같은 辺·같은 階에 벽 부재를 둘 이상 놓는 것을 지금
   막는 검사가 없다(도메인·UI 어디에도). 있으면 반증이다 — ADR-037 §7이
   「겹침 검사를 만들지 않는다」로 현행 유지를 전제한다.

## 하지 말 것

- 대상 코드 수정 금지. 새 파일은 검증 스크립트·본 report만.
- `scripts/execute.py` 금지 — 재귀다.

## 산출물

`phases/25-wall-extent/step0-report.json`:
전제별 `{id, status: upheld|refuted, evidence[]}`, `verdict`, `summary`.
전제 4의 목록은 `consumers`로 따로 실어라 — 파일·심볼·무엇을 읽는지.
