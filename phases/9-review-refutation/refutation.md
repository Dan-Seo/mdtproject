# Step 0 반증 결과 — plan-import 리뷰

## 결론

주장 ①·②의 결함은 모두 재현됐고, 주장 ③의 아키텍처 위반은 찾지 못했다. 따라서 세 주장은 모두 옳으며 반증에 실패했다. 구현 코드와 기존 테스트는 고치지 않았고, 재현에 쓴 임시 테스트·타입체크 파일·결과 JSON은 실행 후 삭제했다.

## ① `PlanImport.tsx`가 블록이 속하지 않은 通り芯을 案件에 쓴다

### 틀렸다면 보여야 할 것

다음 중 하나가 확인돼야 했다.

- 실물·합성 입력에서 같은 방향 후보가 둘 이상 생기지 않는다.
- `PlanBlock`이 자기 `PlanGridCandidate`를 들고 있거나, `applyFramingPlan`이 `block.xAxes`·`block.yAxes`와 전달받은 그리드의 라벨·스팬을 대조해 불일치를 거부한다.
- `PlanImport`가 PDF 한 페이지만 받는다.

### 코드 확인

- `src/lib/import/pdf-text.ts:21,27-28`은 `TextPage[]`를 만들고 `1 .. document.numPages`를 모두 순회한다. 따라서 여러 페이지를 받는다.
- `src/components/plan/PlanImport.tsx:209-218`은 모든 `pages`를 파싱한 뒤 `plans.flatMap((plan) => plan.grids)`와 `plans.flatMap((plan) => plan.blocks)`로 접고, `grids.find(...)`로 첫 X·첫 Y만 고른다.
- `src/components/plan/PlanImport.tsx:250-258`은 어느 `block`을 눌러도 위에서 고른 동일한 `xGrid`·`yGrid`를 `applyFramingPlan`에 넘긴다.
- `src/lib/import/framing-plan/types.ts:57-67`의 `PlanBlock`은 `xAxes`·`yAxes`만 가지며 스팬을 갖지 않는다.
- `src/lib/import/framing-plan/apply.ts:45-57,112-188`은 전달받은 `xGrid.spansMm`·`yGrid.spansMm`로 案件의 `Grid`를 만들지만, `block.xAxes`·`block.yAxes`와 그리드 후보를 대조하지 않는다.

### 실행 확인

실물 `tests/fixtures/section-import/textitems/yokohama-p7.json`은 파서 결과가 `grids: 2`, `blocks: 2`였다. 이 실물 한 페이지는 두 블록의 그리드 정의가 같아서 결함을 발화시키지는 않지만, 한 페이지에 여러 블록이 생기는 경로를 확인한다.

이어 각각 X·Y 스팬이 6000과 8000인 합성 `TextPage` 두 장을 만들고, `PlanImport.tsx:215-218`과 똑같이 평탄화·`find`한 뒤 두 번째 블록을 `applyFramingPlan`에 넘겼다. 임시 Vitest가 기록한 결과는 다음과 같았다.

```json
{
  "synthetic": {
    "grids": 4,
    "blocks": 2,
    "firstSelectedXSpans": [6000],
    "firstSelectedYSpans": [6000],
    "secondBlockOwnPageXSpans": [8000],
    "secondBlockOwnPageYSpans": [8000]
  },
  "applyResult": {
    "projectGrid": {
      "xSpans": [6000],
      "ySpans": [6000],
      "xLabels": ["X1", "X2"],
      "yLabels": ["Y1", "Y2"]
    },
    "refusal": null,
    "skipped": [],
    "applied": 1
  }
}
```

`grids.length > 2`가 실제로 나왔고 두 번째 블록의 8000 스팬 대신 첫 페이지의 6000 스팬이 조용히 적용됐다. `refusal`은 없고 `skipped`도 비었다. 주장 ①은 옳다.

## ② `applyFramingPlan`의 부재 id가 大梁 방향을 잃는다

### 틀렸다면 보여야 할 것

다음 중 하나가 확인돼야 했다.

- `parseFramingPlan`이 같은 符号·같은 `(ix, iy)`의 X방향 辺과 Y방향 辺을 동시에 만들 수 없다.
- 두 배치가 서로 다른 id를 받는다.
- 중복 제거에서 덮어쓰지 않거나, 사라진 배치가 `skipped`에 남는다.

### 코드 확인

- `src/lib/import/framing-plan/parse.ts:434-449`의 `placementFor`는 `(x 중점, y 축)`을 X방향 辺으로, `(x 축, y 중점)`을 Y방향 辺으로 만든다. 두 부호 토큰이 한 격자점에서 직교하는 두 변의 중점에 있으면 같은 `mark`·`ix`·`iy`와 서로 다른 `axis`가 성립한다.
- `src/lib/import/framing-plan/apply.ts:151-166`의 id는 ``${storyId}-${placement.mark}-${placement.ix}-${placement.iy}``여서 `axis`를 잃는다.
- `src/lib/import/framing-plan/apply.ts:169-170`은 `Map.set(member.id, member)`로 뒤의 값을 앞의 값 위에 쓴다. 이 경로는 `skipped`를 추가하지 않는다.

### 실행 확인

합성 1×1 그리드에서 같은 `G1`을 X변 중점과 Y변 중점에 각각 놓아 파싱하고 취입했다. 임시 Vitest가 기록한 결과는 다음과 같았다.

```json
{
  "placements": [
    { "mark": "G1", "role": "辺", "ix": 0, "iy": 0, "axis": "X" },
    { "mark": "G1", "role": "辺", "ix": 0, "iy": 0, "axis": "Y" }
  ],
  "applyResult": {
    "applied": 1,
    "skipped": [],
    "members": [
      {
        "id": "1F-G1-0-0",
        "position": { "axis": "Y", "ix": 0, "iy": 0 }
      }
    ]
  }
}
```

두 배치가 실제로 파싱됐지만 Y방향 하나만 남았고 `skipped`는 비었다.

`as Member`가 타입 검사를 가렸는지도 별도로 확인했다. `apply.ts:151-166`의 객체 리터럴을 그대로 복제하되 `as Member`만 뺀 임시 `.ts` 파일을 프로젝트 타입체크에 포함해 `npm run typecheck`를 실행한 결과는 다음과 같이 exit 0이었다.

```text
> kijun@0.1.0 typecheck
> tsc --noEmit
```

`Member.id`는 일반 `string`이고 id 유일성이나 `axis` 포함을 타입으로 표현하지 않으므로, 캐스트가 없어도 tsc는 이 충돌을 잡지 않는다. 주장 ②는 옳다.

## ③ 그 둘 말고 아키텍처 규칙 위반은 없다

### 틀렸다면 보여야 할 것

`origin/main..main`의 `src/` 추가분에서 네트워크 전송 호출, `src/domain/`의 금지 의존, 배근 규준 수치 리터럴, 룰팩 `stated` 행 중 하나라도 나와야 했다.

### 코드·실행 확인

`git diff -U0 origin/main..main -- src`의 추가행과 현재 룰팩을 기계적으로 검사한 결과는 다음과 같았다.

```text
changed_src_files=25
added_network_calls=0
domain_forbidden_imports=0
added_rebar_rule_term_lines=0
changed_rulepack_files=0
stated_yaml_rows=0
```

- 변경된 `src/` 25파일에는 `fetch`·`XMLHttpRequest`·`WebSocket`·`sendBeacon`·`axios`·`repository_dispatch` 추가가 없었다. `PlanImport`는 기존 `extractTextPages`를 통해 사용자가 고른 `File.arrayBuffer()`를 pdf.js로 로컬 파싱할 뿐 서버로 보내지 않는다.
- 전체 `src/domain/**/*.ts`에서 React·Next·three import가 0건이었다. 이 diff의 `src/domain/` 변경은 `project.ts`의 JSON 배열인 `Grid.xLabels`·`Grid.yLabels`와 그 테스트뿐이다.
- diff에 `定着`·`重ね継手`·`折曲げ`·`かぶり厚さ`·`割増率` 및 관련 룰 키를 포함한 수치 추가가 0건이었다. `parse.ts`·`elevation.ts`의 pt·비율 상수는 PDF 텍스트 기하의 허용오차이고 배근 규준값이 아니다.
- `origin/main..main`에서 `src/rulepack/` 변경 파일은 0개이고, 현재 YAML의 `confidence: stated`도 0행이었다.

`npx vitest run src/rulepack/index.test.ts --reporter=verbose`도 다음처럼 `stated` 0행 고정을 포함한 6개 테스트를 모두 통과했다.

```text
✓ |domain| src/rulepack/index.test.ts > jpMlitRulePack > claims no independently reviewed value while R6 is open
Test Files  1 passed (1)
Tests  6 passed (6)
```

지정된 네 범위에서 추가 아키텍처 위반은 발견되지 않았다. 주장 ③은 옳다.

## 임시 재현물 정리

다음 임시 파일은 결과를 읽은 뒤 모두 삭제했으며 커밋에 포함하지 않는다.

- `src/lib/import/framing-plan/refutation.tmp.test.ts`
- `src/lib/import/framing-plan/refutation-typecheck.tmp.ts`
- `phases/9-review-refutation/.tmp-refutation-results.json`

재현 테스트 실행 결과는 `Test Files 1 passed (1), Tests 2 passed (2)`였다. 결함을 고치는 변경이나 영구 테스트 추가는 하지 않았다.
