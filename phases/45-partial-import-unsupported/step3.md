# Step 3: e2e-panes-alive — uc24가 반영 뒤 패널을 닫고 페인이 살아 있는지 단언한다

## 읽어야 할 파일
- `tests/e2e/README.md`(DB 초기화 관례·build→dev→e2e 순서·uc17 주의), `tests/e2e/uc24-drawing-set.js` 전체, `tests/e2e/uc9-building-view.js`(部材｜建物 탭·캔버스 대기 방법)
- `src/components/quantity/TakeoffPane.tsx` ≈L715~745(`data-testid="unsupported-notice"`), `src/locales/ja.json`의 `pane.failure`·`takeoff.unsupported.reason.支持柱なし`
- `src/components/plan/PlanImport.tsx`의 図面セット 패널 닫기 버튼(`閉じる`)과 그 testid(없으면 텍스트로 찾는다)
- step 1·2 report

## 작업
1. `tests/e2e/uc24-drawing-set.js`를 확장한다(기존 10개 체크는 그대로). 두 번째 `反映` 뒤:
   - 패널을 닫는다(`閉じる`).
   - `panesRenderAfterApply`: `document.body.textContent`에 `pane.failure` 문구 「このペインを表示できません」가 없다.
   - `buildingTabPresentAfterApply`: 3D 페인의 `部材`·`建物` 탭(uc9가 쓰는 셀렉터)이 존재한다.
   - `unsupportedNoticeListsSkippedGirders`: `[data-testid='unsupported-notice']`가 있고 `li`가 6개이며 각 항목에 `takeoff.unsupported.reason.支持柱なし`의 ja 문구가 들어 있다(문구는 스크립트 상단 상수로 두되 주석에 로케일 키를 적는다).
   - `buildingViewRendersAfterApply`: `建物` 탭을 눌러 uc9와 같은 방식으로 캔버스가 그려지는 것을 기다린다.
   - 결과 JSON 출력에 새 체크를 넣고 실패 시 `FAILED CHECKS`로 throw하는 기존 규약을 따른다.
2. 실행 절차(순서 엄수 — dev 서버가 뜬 채로 build 금지):
```bash
npm run lint && npx tsc --noEmit && npx vitest run
netstat -ano | findstr :3000      # 비어 있어야 한다. 남의 서버면 blocked — 죽이지 마라
npm run build
node -e "const fs=require('fs');const d=(process.env.HOME||process.env.USERPROFILE)+'/.dev-browser/tmp/';fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+'uc24-dwg-tsu-kanritou.pdf.b64',fs.readFileSync('.cache/dwg-tsu-kanritou.pdf').toString('base64'));fs.writeFileSync(d+'uc24-tsu.json.b64',fs.readFileSync('tests/fixtures/drawing-set/expected/tsu.json').toString('base64'))"
npm run dev -- -p 3000    # 백그라운드. 출력을 head 등으로 파이프하지 마라(막히면 서버가 조용히 멎는다)
npx dev-browser --browser kijun --timeout 240 run tests/e2e/uc24-drawing-set.js
```
   끝나면 **자기가 띄운** dev 서버 PID만 종료하고 `npx dev-browser stop`.
3. e2e 출력 JSON(체크 결과)과 스크린샷 경로를 `step3-report.json`에 그대로 넣는다.

## Acceptance Criteria
```bash
npx dev-browser --browser kijun --timeout 240 run tests/e2e/uc24-drawing-set.js   # ALL CHECKS PASSED, 14개 체크 전부 true
node -e "require('fs').readFileSync('tests/e2e/uc24-drawing-set.js','utf8').includes('panesRenderAfterApply')||process.exit(1)"
```

## 산출물
`phases/45-partial-import-unsupported/step3-report.json`: `{ "e2e": { "checks": {...}, "exit_code": 0, "screenshot": "..." }, "dev_server": { "port": 3000, "pid_stopped": true }, "paths_verified": ["tests/e2e/uc24-drawing-set.js"] }`

## 금지사항
- 제품 코드(`src/**`)를 고치지 마라. 이유: step 1·2가 끝난 상태에서 페인이 살아 있어야 정상이다. 죽어 있으면 그 자체가 발견이므로 `blocked`로 두고 에러 문구·스택을 report에 적어라.
- 파일명·페이지 번호로 면을 고르는 제품 로직을 넣지 마라(기존 주석대로 testid로 고른다).
- `.cache/dwg-tsu-kanritou.pdf`가 없으면 blocked. 이유: 실물 PDF는 커밋되지 않는다.
- 3000 포트에 남의 서버가 있으면 죽이지 말고 blocked.
