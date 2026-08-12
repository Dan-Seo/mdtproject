# Step 3: docs-e2e

트랙 첫 단계의 마감: 문서를 코드 상태에 맞추고, 리스크를 등재하고, e2e를 재확인한다.

## 읽어야 할 파일

- `CLAUDE.md` — 마일스톤 현황·열린 리스크 절
- `docs/ADR.md` — ADR-018
- `phases/6-section-import/index.json` — step 0~2의 summary (문서에 적을 사실의 출처)
- `tests/fixtures/section-import/SOURCES.md`

## 작업

### 1. CLAUDE.md 갱신

- 「도면 인식(로컬)」 항목을 **끝난 것 / 남은 것**으로 나눠 갱신하라 (M3b 항목의 문체를 따라라):
  - 끝난 것: TextItem 픽스처 5부(발주처 상이 3부)·2단 파서·취입 패널(부재 행 단위 反映/無視)·실검증 `tests/e2e/uc12-section-import.js`
  - 남은 것: 표 형식 커버리지 확대(수집 계속), 位置별 상이값의 흡수(M3b カットオフ 입력 선결),
    階 라벨과 제품 Story의 대응(현재는 라벨 표시만), M3b 신규 필드(定尺長さ·継手方式) 파싱
- 열린 리스크에 **R9**를 등재하라: 「파서가 실물 3부 포맷에 과적합 — 미지 형식은 빈 배열로
  정직 실패하지만, 사용자에겐 '인식 불가'로 보인다. 수집 확대로 커버리지를 넓히고,
  실패 도면은 (사용자 동의 없이는) 수집할 수 없으므로 R3(사용자 접점 0)과 결합된 리스크다」
  — 문구는 다듬되 취지를 유지하라.

### 2. docs 정합 확인

- `docs/ARCHITECTURE.md`·`docs/DESIGN.md`·`docs/UX.md`에서 「도면 인식을 하지 않는다」
  단정 문장이 남아 있으면 ADR-018 참조로 갱신하라. **형상 인식을 하지 않는다는 문장은
  여전히 참이다 — 지우지 마라.** 断面リスト 값 취입만 달라졌다.
- `docs/SOURCES.md`는 규준 근거 목록이다 — 검증 도면을 거기 넣지 마라
  (`tests/fixtures/section-import/SOURCES.md`가 따로 있다). 대신 SOURCES.md 하단에
  픽스처 출처 파일로의 링크 한 줄은 허용된다.

### 3. e2e 재확인

```bash
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc11-continuous-girder.js
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc12-section-import.js
```

uc11(기존 기능 회귀)과 uc12(신규)가 모두 통과해야 한다.

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc11-continuous-girder.js
npx dev-browser --browser kijun --timeout 120 run tests/e2e/uc12-section-import.js
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. CLAUDE.md의 트랙 항목이 실제 코드 상태와 일치하는지 대조하라 (뒤처진 문서가 R7①의 재발 형태다).
3. `phases/6-section-import/index.json`의 step 3을 업데이트한다 (규칙 동일).

## 금지사항

- **구현 코드를 바꾸지 마라.** 이유: 이 step은 문서·검증 마감이다. e2e가 깨지면 step 2의
  결함이다 — status를 error로 하고 error_message에 무엇이 깨졌는지 적어라.
- **R8·R9를 해소된 것처럼 쓰지 마라.** 이유: 남은 것은 남은 것으로 적는 것이 이 문서의 가치다.
