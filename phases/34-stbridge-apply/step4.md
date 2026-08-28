# Step 4: 화면에 붙이고 브라우저에서 실제로 통과시킨다

**전제**: step 3이 `completed`.

## 배경
컴포넌트가 있어도 마운트되지 않으면 사용자에게는 없는 것이다. 그리고 jsdom 테스트가 통과해도 실제 브라우저에서 파일 입력·`TextDecoder`·`DOMParser`가 다르게 도는 경로가 남는다 — 그것을 닫는 것이 이 스텝이다.

**빌드 순서를 반드시 지켜라: `npm run build` → dev 서버 기동 → e2e.**
`next dev`가 떠 있는 채로 `npm run build`를 돌리면 둘이 같은 `.next`를 써서 빌드가 dev 서버의 청크를 덮고 화면이 통째로 안 뜬다. 그런데 **`curl`은 200을 돌려준다**(HTML 셸은 나가고 청크만 404다). 그래서 「서버는 살아 있는데 e2e만 실패」로 보여 원인을 코드에서 찾게 된다. 이미 밟았으면 dev 서버를 죽이고 `rm -rf .next && npm run build` 후 다시 띄워라.

## 할 일
1. `src/app/page.tsx`의 `planActions`에 `<StbImport />`를 더하라. **`planActions`다** — 通り芯과 階는 平面 페인의 것이다. step 0 기록 항목 9가 적은 슬롯 목록과 현재 내용을 보고, 기존 항목의 순서를 바꾸지 마라.
2. `tests/e2e/uc23-stb-import.js`를 쓰라. 형식은 step 0 기록 항목 8이 적은 `uc22-plan-import.js`를 그대로 따른다.
   - 넣을 파일은 `tests/fixtures/stb-import/synthetic/mini-utf8.stb`다. **실물 코퍼스를 쓰지 마라** — `.cache/`에 있어 CI에 없다.
   - 확인할 것: ① 후보가 화면에 뜬다(축 라벨 `X1`·`X2`·`X3`·`Y1`·`Y2`와 階 이름) ② 「通り芯」 승인 후 平面의 격자가 3×2가 된다 ③ 「階」 승인 후 `StoryTabs`의 階가 2개가 되고 이름이 `1FL`·`2FL`이다 ④ `unsupported` 목록 자리가 화면에 있다.
   - **화면이 실제로 무엇을 보이는지는 step 3이 정한 마크업이 정한다.** 이 사양의 문면과 다르면 코드를 따르라.
3. 실행: `npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc23-stb-import.js`
   - 브라우저에서 파일 입력에 파일을 넣는 방법이 `dev-browser`에 없으면, 그 사실을 `note`에 적고 **후보 표시까지만** 검증하는 형태로 낮춰 쓰되 **무엇을 검증하지 못했는지 e2e 파일 맨 위 주석에 남겨라.** 검증하지 못한 것을 검증한 것처럼 쓰지 마라. 이 경우에도 status는 `completed`다(도구 한계는 반증이 아니다).
4. 끝나면 dev 서버와 헤드리스 브라우저 프로세스를 정리하라. 고아 `chrome-headless-shell`이 남으면 CPU를 계속 태운다.

## 완료 조건 (AC)
1. `npm run build`가 통과한다.
2. `uc23-stb-import.js`가 통과한다(또는 3의 단서에 따라 낮춘 범위로 통과하고 그 사실이 파일 주석과 보고서에 적혀 있다).
3. `npm run test`·`npm run lint`·`npx tsc --noEmit` 전부 통과.
4. `npm run lighthouse`의 예산을 새로 깨지 않는다 — **로컬에서 이 명령은 EPERM으로 실패하는 것이 정상이므로 돌리지 마라.** 대신 `StbImport`가 `src/app/page.tsx`의 초기 번들에 three.js 같은 무거운 것을 새로 끌어들이지 않는지만 확인해 적어라(새 의존 없음이면 그렇게 적으면 된다).

## 금지
- **`package.json`에 의존을 더하지 마라.** XML 파서·인코딩 변환 라이브러리는 이미 필요 없다(ADR-043 「하지 않는 것」).
- `.github/workflows/`를 고치지 마라.
- e2e를 통과시키려고 `src/lib/import/stb/` 아래를 고치지 마라. 고쳐야 하면 무엇이 어긋났는지 적고 `blocked`.
- 하네스 프로세스(`scripts/execute.py`)와 그 자식을 `taskkill`·`kill`·`Stop-Process`로 끊지 마라. dev 서버와 브라우저만 정리한다.
- `scripts/execute.py`를 실행하지 마라.
