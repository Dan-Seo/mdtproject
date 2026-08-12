# Step 3: docs-e2e

구현이 끝났다. 이 step은 **문서가 코드와 같은 말을 하게** 만들고, 브라우저에서
실제로 도는지 확인하는 프로브를 남긴다.

이 step을 소홀히 하면 다음 사람이 `CLAUDE.md`를 읽고 「연속 스팬은 미지원」이라고
믿는다. 문서와 코드가 어긋난 레포는 코드가 틀린 것과 같은 비용을 만든다.

## 읽어야 할 파일

- `CLAUDE.md` — 마일스톤 현황, 열린 리스크(특히 R7)
- `docs/ADR.md` · `docs/DESIGN.md` — 大梁 관련 절
- `tests/e2e/uc9-building-view.js` · `uc2-plan-selection.js` · `uc10-viewer-features.js`
- `phases/5-girder-continuous/index.json` — 앞 step들의 summary (실제로 무엇이 되었는지의 근거)

## 작업

### 1. `CLAUDE.md`

- **M3b 항목**을 갱신하라. M3b는 「다스팬 通し筋·カットオフ·継手位置·継手方式 + 수량
  단위 확장」인데 이번에 끝난 것은 **通し筋뿐이다.** 완료로 체크하지 마라 —
  끝난 것과 남은 것을 나눠 적어라. 남은 것: カットオフ·継手位置·継手方式·`箇所` 단위.
- **R7 대장**을 갱신하라. ②(大梁 연속 스팬 정착 이중 계상)는 **해소**다 —
  通し筋이 중간 접합부를 관통하므로 정착이 0번이다. 해소 사실과 근거를 적어라.
  ①·③의 상태는 건드리지 마라.
- **새 리스크를 등재하라 — 継手 미계상.** 런 전장이 定尺長さ를 넘어도 重ね継手를
  계상하지 않는다. 근거(`定尺長さ` 키가 룰팩·標準仕様書 어디에도 없음)와 다음 단계
  설계(定尺長さ를 断面一覧 입력으로 두는 ADR-012 계열 처리)를 함께 적어라.
  **물량이 과소 계상된다는 사실을 숨기지 마라.**
- M2가 여전히 미완이므로 大梁 산출값이 정식 물량이 아니라는 문구는 유지하라.

### 2. `docs/` 갱신

착수 시점에 확인한 결과 `docs/`에는 「연속 스팬 미지원」·「스팬 단위 산정」을 전제로
쓴 문장이 **없었다**(`連続`·`通し筋`·`미지원` 전수 검색 결과 해당 없음). 그러니
기본 기대는 **docs 무변경**이다.

앞 step들이 새로 만든 사실이 문서와 어긋난다면 그때만 고쳐라. 고칠 것이 없으면
없다고 step summary에 적어라 — **없는 결정을 새로 쓰지 마라.**

### 3. e2e 프로브

- `tests/e2e/uc9-building-view.js`: **모든** 大梁에 철근이 실렸는지 보는 체크를
  추가하라. 지금까지는 X방향만 있어도 통과했다.
- `tests/e2e/uc2-plan-selection.js`: Y방향(연속) 大梁을 클릭했을 때 미지원 문구가
  아니라 배근이 나오는지 확인하도록 갱신하라.
- 새 체크는 **실패 시 종료 코드가 0이 아니어야 한다.** `uc10-viewer-features.js`가
  그렇게 되어 있다 — 그 방식을 따르라. 로그만 찍고 통과하는 스크립트는 회귀를 못 잡는다.

실행:

```bash
npm run dev   # 별도 셸
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc9-building-view.js
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc2-plan-selection.js
npx dev-browser --browser kijun --timeout 90 run tests/e2e/uc10-viewer-features.js
```

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

그리고 위 e2e 3종이 통과할 것.

## 검증 절차

1. 위 AC 커맨드와 e2e를 실행한다.
2. 문서 대조: `CLAUDE.md`의 M3b·R7·리스크 항목을 소리 내어 읽고 **코드와 다른 문장이
   하나도 없는지** 확인하라. 특히 「연속 스팬은 미지원」이 남아 있지 않은지.
3. `phases/5-girder-continuous/index.json`의 step 3을 업데이트하고, 파일 끝에
   `"completed_at"`을 적어 phase를 닫아라.

## 금지사항

- **M3b를 완료로 체크하지 마라.** 이유: 継手·カットオフ·단위 확장이 남았다.
  다 끝난 것처럼 적으면 다음 사람이 남은 일을 못 본다.
- **継手 미계상을 문서에서 빼지 마라.** 이유: 물량이 과소 계상된다. 아는 사람이
  적어 두지 않으면 아무도 모른다.
- **코드를 새로 만들지 마라.** 이유: 이 step은 문서·프로브다. 구현이 부족하면
  `"blocked"`로 적고 무엇이 부족한지 남겨라.
