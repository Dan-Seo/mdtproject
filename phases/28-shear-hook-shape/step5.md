# Step 5: 出典 쪽 번호를 원문에서 다시 끌어내고, 어긋남을 테스트로 막는다

**전제**: step 4가 `completed`다.

## 왜

step 3이 실은 `表5.3.1 注1`의 `printedPage`를 **28**로 넣었는데, 원문은 **27**이다.
`.cache/001888816.pdf`의 PDF 33쪽 꼬리말이 「…国土交通省大臣官房官庁営繕部 **27**」이고
그 쪽에 「片持ちスラブ先端…余長は4d 以上とする。」이 있다. PDF 34쪽 꼬리말이 28이며
그 쪽에는 이 문장이 없다.

**원인은 사양이다.** step3.md가 「印刷 28쪽」이라고 적었고, 「다르면 step 0을 따르라」는
단서는 step 0 보고서에 쪽 필드가 아예 없어 작동하지 않았다. 즉 **사람이 준 숫자가
검증 없이 전사됐다.** 그러니 이 스텝에서도 **여기 적힌 27을 그대로 믿지 마라** —
PDF 꼬리말에서 직접 끌어내고, 다르면 네가 읽은 값을 쓰고 그 사실을 보고하라.

두 군데를 한꺼번에 통과한 이유가 있다:

- `tests/golden/spec-fixture.test.ts:43`은 `printedPage > 0`만 본다. **오프셋을 안 본다.**
  같은 레포의 `tests/golden/quantity-measurement.test.ts:418`은 다른 픽스처에서
  이미 `expect(entry.pdfPage).toBe(entry.printedPage + 5)`로 오프셋을 박고 있다 —
  이쪽에만 없다.
- 그 구조 검사 루프는 `fixture.entries`만 돈다. `注1`은 `fixture.constraints`에 있어
  **루프에 아예 들어가지 않는다.**

실측: `entries` 112건은 전부 오프셋 ＋6, `constraints` 3건 중 2건이 ＋6이고
`表5.3.1 注1` 1건만 ＋5다. 115건 중 1건이 어긋나 있다.

## 할 일

1. **원문에서 쪽을 다시 끌어내라.** `.cache/001888816.pdf`에서 「片持ちスラブ先端」이
   있는 쪽을 찾고, **그 쪽의 꼬리말에 인쇄된 번호**를 `printedPage`로 삼아라.
   PDF에서 몇 번째 쪽인지를 `pdfPage`로 삼아라. 둘을 각각 **읽어서** 정하고,
   한쪽에서 다른 쪽을 계산하지 마라.
2. 고칠 곳은 둘이다 — `tests/golden/fixtures/spec-r7-ch5.json`의 해당 항과
   `tests/golden/spec-fixture.test.ts`의 `toMatchObject` 안에 박힌 값.
   **`quote`·`value`·`unit`·`confidence`·`imageRead`는 건드리지 마라** — 그 다섯은
   대조해서 맞았다.
3. **오프셋을 박아라.** `spec-fixture.test.ts`의 구조 검사가
   `pdfPage === printedPage + 6`을 확인하게 하라. `quantity-measurement.test.ts:418`이
   다른 픽스처에서 쓰는 것과 같은 모양이다 — 새 방식을 발명하지 말고 그것에 맞춰라.
   - 오프셋 상수는 **이 PDF의 앞붙이 쪽수**이지 규준 수치가 아니다. 주석에 그렇게 적어라.
   - `+ 6`이 정말 전 항에 성립하는지 먼저 세어 보고, 예외가 있으면 **고치지 말고**
     그 항을 보고서에 나열한 뒤 `blocked`로 끝내라. 예외를 통과시키려고 오프셋을
     느슨하게 만들지 마라.
4. **검사 범위를 넓혀라.** 지금 루프는 `fixture.entries`만 돈다. `pdfPage`와
   `printedPage`를 **가진 모든 항**(`constraints` 포함)이 같은 검사를 받게 하라.
   범위를 넓히지 않으면 이 결함이 그대로 재발한다.
5. **흔들어 보여라.** ① 어느 한 항의 `printedPage`를 1 틀리게 하면 새 검사가 실패하고,
   ② `constraints`의 항을 틀리게 해도 실패하는 것을 각각 확인하고, **실패 메시지를
   보고서에 적어라.** ②가 실패하지 않으면 4.가 안 된 것이다. 확인한 뒤 원복하라
   (`git status`가 깨끗함을 보여라).

## 하지 말 것

- `src/**` 수정 금지. 룰팩에 행을 만들지 마라.
- `confidence`를 `stated`로 올리지 마라 (R6).
- `quote` 문언을 고치지 마라 — 원문 대조를 이미 통과했다.
- 다른 114건의 쪽 번호를 「정리」하지 마라. 어긋난 것만 고친다.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`·`step*-report.json`을 지우지 마라.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- 픽스처의 쪽 인용 115건이 전부 같은 오프셋이다.
- 흔들기 두 건의 실패 메시지가 보고서에 있다.

## 산출물

`phases/28-shear-hook-shape/step5-report.json`: PDF에서 읽은 꼬리말 번호와 PDF 쪽,
고친 두 곳, 오프셋 검사가 덮는 항 수(전/후), 흔들기 두 건의 실패 메시지.
