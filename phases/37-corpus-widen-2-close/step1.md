# Step 1: ojkk-p4 対象外 12칸을 골든 테스트로 고정하라

## 배경

phase 36에서 断面リスト 파서가 넓어지며 ojkk-p4 小梁リスト 9칸·片持梁リスト 3칸의
결과가 바뀌었는데(断面寸法 행을 읽게 됨), 対象外 영역이라 골든이 없어 **조용히**
바뀌었다. 값은 도면과 일치함을 step 0이 확인했다. 다시 조용히 바뀌지 않게 고정한다.

골든: `tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json`의
`lists[]` 중 `listKind` 「小梁リスト」·「片持梁リスト」의 `entries`.

## 할 일

1. `tests/section-import/parse.test.ts`에 테스트 하나를 추가하라 —
   「ojkk 小梁·片持梁リスト — 対象外 셀의 断面寸法·配筋을 전 셀 대조한다」.
   ina의 scopeOut 루프(같은 파일의 「ina 大梁·地中梁·小梁·柱リスト」 테스트)와 같은
   방식으로 **엄격 일치**:
   - 모든 entry: `kind === '対象外'`.
   - `b`·`depth`가 있는 entry: `{b, depth}` toEqual.
   - `上端筋`·`下端筋`가 문자열이면 `girderMain`의 `topCount-size`·`bottomCount-size`와
     일치. 객체(B2: 端部·中央)면 中央 → `topCount`·`bottomCount`, 端部 → `endTopCount`·
     `endBottomCount`.
   - `あばら筋`: `stirrup`의 `size@pitchMm`와 `normPitch` 후 일치.
   - `腹筋`이 있으면 `sideBar` `{count, size}` 일치, 없거나 `腹筋raw`면 `sideBar`가
     `undefined`.
   - CB1(`expected` 필드가 있는 entry): `b`·`depth`가 `undefined`, `issues`에
     `断面矩形不成立` 포함, `raw['断面']`을 NFKC 정규화한 문자열이 `断面raw_contains`의
     두 값을 모두 포함.
2. 테스트가 **골든을 보고 있는지** 확인하라 — 골든 사본에서 값 하나(예: FB3 depth)를
   바꿔 실패하는 것을 본 뒤 원복. `git status`로 확인.
3. `src/**`는 건드리지 마라. 파서가 골든과 어긋나면 골든을 고치지 말고 report에
   적고 `blocked`.

## 하지 말 것

- `src/**`·골든·픽스처를 고치지 마라.
- 기존 테스트를 바꾸지 마라 — 추가만.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC

- `npm run test` 통과, 추가 테스트가 12 entry를 전부 순회한다(루프 카운트를 report에).
- 골든 변조 시 실패 확인(report에 어느 값을 바꿨는지).

## 산출물

`phases/37-corpus-widen-2-close/step1-report.json`:

```json
{ "entries_checked": 12, "mutation": { "field": "", "failed": true, "restored": true }, "summary": "" }
```
