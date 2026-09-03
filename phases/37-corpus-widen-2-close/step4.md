# Step 4: 断面リスト 파서의 위 층 값 끌어오기와 大梁 판정을 좁혀라

## 배경

phase 36 step 3·4의 `src/lib/import/section-list/parse.ts` Claude 검토:

1. **슬라이스 위 행 fallback**(≈2025·2316·2335) — 층 슬라이스 안에 `断面`·`腹筋` 행이
   없으면 `preSliceRows.slice(-1)`(슬라이스 앞의 마지막 그 행)을 쓴다. 표 머리의 공통
   행(첫 층 앞)을 쓰는 것은 정당하나, **앞 층 슬라이스 안의 행**도 잡히므로 어느 층의
   빈 셀에 앞 층 값이 조용히 들어갈 수 있다 — 「빈 셀에 기본값을 채우지 마라」와 같은
   종류의 지어내기다.
2. **`kindFromMark`**(≈326) — `/G\d/i`가 위치 무관이라 `FG1`·`FCG1`이 大梁リスト 제목
   아래 오면 大梁으로 승격된다(main은 `^G\d`). 층 접두(`2G1`·`RG1`·`B1G1`)와 ina의
   `GA`를 허용하려던 확장이 넓어졌다.

## 할 일

1. **테스트 먼저**(`src/lib/import/section-list/parse.test.ts`):
   - 합성 표 A: 표 머리(첫 층 앞)에 공통 `腹筋` 행 → 모든 층 후보에 반영.
   - 합성 표 B: 1층에 `腹筋` 행이 있고 2층에는 없음 → 2층 후보 `sideBar`는 `undefined`
     (1층 값을 물려받지 않는다). `断面`도 같은 두 경우.
   - `kindFromMark`: 大梁リスト 제목 아래 `FG1`·`FCG1` → `対象外`, `G1`·`2G1`·`RG1`·
     `B1G1`·`GA` → `大梁`.
   먼저 실패를 확인하라.
2. fallback을 **첫 층 슬라이스보다 앞의 행**(표 머리 영역)으로 제한하라. 앞 층 슬라이스에
   속한 행은 후보가 아니다.
3. `kindFromMark`를 「층 접두(`R`·`\d+`·`B\d*`)를 벗긴 뒤 `G`로 시작」으로 좁혀라.
4. 기존 골든 12개(section-import expected 전부)와 step 1이 더한 ojkk-p4 対象外 테스트가
   그대로 통과해야 한다. 어느 골든 면이 1·2의 fallback을 실제로 쓰는지 report에 적어라.
5. **step 1이 남긴 타입 우회를 고쳐라** — `tests/section-import/parse.test.ts` ≈1207의
   `(listSpec.entries ?? []) as unknown as ExpectedOutOfScopeEntry[]`는 TS2352(`{ mark }[] &
   (ExpectedWallEntry | ExpectedSlabEntry)[]`와 겹치지 않음)를 `unknown` 경유로 뭉갠 것이다.
   골든 `lists[]` 타입을 `listKind`별 판별 유니언으로 좁혀 캐스트 없이 통과시켜라. vitest는 타입을 검사하지 않으므로 **`npm run typecheck`를 직접 돌려** 0 오류를 확인하라.

## 하지 말 것

- 골든·픽스처를 고치지 마라. 어긋나면 report＋`blocked`.
- `framing-plan/**`·`runs.ts`·`textitems.ts`를 건드리지 마라.
- 特記 기본값을 채우지 마라. 2段筋 본수를 내지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test`·`npm run typecheck`·`npm run lint`(경고 0건 — `_omitted`는 main 기존이라 제외) 통과.
  새 단위 테스트 5건 이상이 위 두 규칙을 반증 가능하게 고정한다.

## 산출물

`phases/37-corpus-widen-2-close/step4-report.json`:

```json
{
  "fallback_rule": "",
  "fallback_pages": { "断面": [], "腹筋": [] },
  "kind_rule": "",
  "tests_added": 0,
  "existing_goldens_unchanged": true,
  "summary": "index.json summary와 같은 요지"
}
```
