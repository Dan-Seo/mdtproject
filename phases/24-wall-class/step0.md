# Step 0 (verify): ADR-036의 전제를 반증하라

**역할**: 검증 전용이다. `docs/ADR.md`의 **ADR-036**을 읽고 아래 전제들을
코드·픽스처로 **반증**하라. 대상 코드를 한 줄도 수정하지 마라. 반증이
성립하면 status **`refuted`**(정상 종결), 전부 버티면 `completed`.

## 반증 대상 전제

1. **(cover-no-kg)** `cover.minimum`은 壁의 設計長さ·本数(kg)에 나타나지
   않고, 3D 층 오프셋(`wallLayerOffsets`)과 ダブル 성립 가드
   (`寸法不成立`)에만 쓰인다 — **실행 반례로 확인하라**: cover 값이 다른
   모의 룰팩 둘로 `generateWallRebar`를 돌려 kg 동일·가드 거동 차이를 보여라.
2. **(lap-floor-unconditional)** `lap.wall.minimum`(40d)의 원문
   (`src/rulepack/jp-mlit/lap.yaml`의 source 인용)은 「耐力壁の鉄筋の」로
   한정하는데, `src/domain/rebar/wall.ts`는 무조건 조회·적용한다.
   表5.3.2 `lap.L1` ＜ 40d가 성립하는 fc·grade·径 조합을 룰팩에서 찾아
   그 조합에서 하한이 실제로 무는(継手長이 40d로 올라가는) 실행 예를 남겨라.
   그런 조합이 룰팩에 없다면 그것도 반증이다 — ADR-036 §4의 「kg가 달라지는
   유일한 지점」이 공집합이 된다.
3. **(no-auto-classification)** 断面リスト 파서는 壁 후보의 kind를 무조건
   `耐震壁`으로 확정하고 備考 행을 읽지 않는다. 실도면 픽스처
   (`tests/fixtures/section-import/expected/`)의 雑壁 표기는 備考 자유
   텍스트뿐이다.
4. **(lookup-no-ambiguity)** `lookupRule`은 조건 최다 일치 우선·동점이면
   throw다. `memberKind: 雑壁` 조건의 cover 행 2개를 추가해도 기존
   耐震壁·床板 조회와 동점·오적중이 생기지 않는다 — 모의 룰팩으로 확인하라.
5. **(import-preserve)** 断面リスト 취입이 기존 `WallSection`을 갱신할 때
   어떤 필드를 덮는지 특정하라(`SectionImport.tsx`의 applyCandidate 경로).
   후보에 없는 필드(예: 장래의 `wallClass` 같은 비전사 필드)가 보존되는지
   덮이는지 실행으로 확인하라 — ADR-036 §2 「취입은 wallClass를 덮지
   않는다」의 성립 조건이다.
6. **(fixture-coupling)** `spec-r7-ch5.json` 表5.3.6 「スラブ、耐力壁以外の壁」
   행의 `memberKinds`에 항목을 더하면 `tests/golden/spec-tables.test.ts`가
   룰팩 동시 수정을 강제한다(한쪽만 고치면 실패한다).

## 하지 말 것

- 대상 코드 수정 금지. 새 파일은 검증 스크립트·본 report만.
- `scripts/execute.py` 금지 — 재귀다.

## 산출물

`phases/24-wall-class/step0-report.json`:
전제별 `{id, status: upheld|refuted, evidence[]}`, `verdict`, `summary`.
전제 2의 「L1 ＜ 40d 조합」은 찾은 조합(fc·grade·径)을 명시하라 — step 1
골든 케이스가 그 조합을 쓴다.
