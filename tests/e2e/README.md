# E2E 시나리오 (dev-browser)

실제 브라우저에서 UI 관통을 확인하는 유스케이스 시나리오. **`npm run test`에 포함되지 않는다** —
vitest가 아니라 [dev-browser](https://www.npmjs.com/package/dev-browser)의 QuickJS 샌드박스에서 돈다.

## 실행

```bash
npm run dev -- -p 3000        # 스크립트가 3000을 기대한다
dev-browser --browser kijun --timeout 90 run tests/e2e/uc1-initial-load.js
```

포트가 다르면 각 스크립트 상단의 `localhost:3000`을 고친다 (샌드박스에 `process.env`가 없어
환경변수로 받을 수 없다).

전부 순서대로 돌리려면:

```bash
for f in tests/e2e/uc*.js; do
  echo "===== $f"; dev-browser --browser kijun --timeout 90 run "$f"
done
```

## 시나리오

| 파일 | 검증 대상 |
|---|---|
| `uc1-initial-load.js` | 4패널 렌더 · M1 경고 배너 · 출처 고지 · 総計 ≠ 0 |
| `uc2-plan-selection.js` | 平面 柱/大梁 클릭 → 断面一覧·3D·数量 연동 |
| `uc3-section-edit-recalc.js` | 主筋 본수·帯筋 피치·断面 b 변경 시 数量 재계산 |
| `uc4-story-switch.js` | 층 전환 시 平面 갱신, 数量은 전 층 유지 |
| `uc5-span-edit.js` | スパン 증감 → 柱 개수·箇所 연동, 1개면 삭제 disabled |
| `uc6-locale.js` | ja↔ko 전환. 도메인 용어(柱·主筋·帯筋)는 일본어 유지 (ADR-008) |
| `uc7-source-and-formula.js` | 出典 chip·`inferred` ▲·算出式 전개 (출처 표시는 법적 의무) |
| `uc8-xlsx-export.js` | xlsx 다운로드 트리거 (Blob 가로채기) |
| `uc9-building-view.js` | 3D 페인 「部材｜建物」 탭 전환 · 建物 뷰 캔버스 · 부재 클릭 → 4페인 연동 |
| `uc10-viewer-features.js` | 部材 뷰 기능 4종 — 레이어 토글 · 断面カット · 호버 툴팁(실 레이캐스트) · 定着 범례 |
| `uc11-continuous-girder.js` | 連続スパン 大梁의 通し筋 — 미지원 고지 해소 · 런 길이 공존 · 산출식의 中間柱せい |
| `uc12-section-import.js` | PDF 断面リスト 취입 — 후보 제시 · 부재 행 단위 反映/無視 |
| `uc13-cutoff-splice.js` | カットオフ筋·継手方式 — 位置別 本数 입력 · 切り止め位置 · 3D 定着 미표시 고지 |
| `uc14-m3c-details.js` | 幅止め筋·腹筋 — 断面一覧 입력(大梁만) · 「なし」 断面 미계상 · 산출식의 조문/입력 표시 |
| `uc15-shear-wall.js` | 耐震壁 — 断面一覧 입력(壁厚·縦筋·横筋·配筋層数) · 内訳 縦筋/横筋 행 · 開口部 미계상 고지(R14) · 平面에서 大梁와 겹치지 않게 선택 · 部材/建物 3D |
| `uc16-japan-specific.js` | 日本固有の形態・製品 — 高強度せん断補強筋(K13·S13)は帯筋にだけ · 円形柱の周長 πD·直径入力·円柱 3D |
| `uc17-slab.js` | 床板(スラブ) — 断面一覧の2方向×2面 입력 · 内訳 4행 · 単独床板↔連続床板으로 継手 조문 교체 · 開口部 미계상 고지(R14)에 床板 명시 · 平面에서 床板을 놓아도 大梁·壁이 선택 가능 · 部材/建物 3D |
| `uc18-opening.js` | 開口部(数量積算基準 1通則8)) — 平面에서 壁·床板을 골라야 입력이 뜨는 것 · 開口을 넣으면 内訳이 欠除量별로 갈리는 것 · 断たれた縦筋의 継手가 2（５）壁1)② 但書로 0か所가 되는 것 · 0.5㎡以下면 欠除가 사라지는 것 · 床板 開口가 平面에 실촌으로 그려지는 것 · 開口補強筋 미계상 고지(R14) · 部材/建物 3D

## 왜 유닛테스트로 안 되는가

jsdom에서 재현되지 않는 것만 여기에 둔다.

- **하이드레이션 타이밍** — 数量 표는 SSR HTML에 이미 있고 3D 캔버스는 하이드레이션 후에 생긴다.
  `canvas`를 기다리지 않고 DOM을 읽으면 하이드레이션 이전 상태를 본다.
- **실제 히트 테스트** — SVG 부재의 클릭 가능 영역이 시각적 마커와 일치하는지.
- **WebGL** — three.js 씬이 실제로 그려지는지. 환경맵(PMREM)·그림자·톤매핑은 유닛테스트에서
  `PMREMGenerator`/`WebGLRenderer`를 목으로 대체하므로, 실 GPU 동작은 여기(uc1·uc9)가 유일한 커버다.
- **파일 다운로드** — exceljs가 만든 Blob의 크기·MIME·파일명.

## 알려진 함정

- 수평 SVG `<line>`은 bbox 높이가 0이라 Playwright가 invisible로 판정한다. 大梁을 클릭하려면
  `{ force: true }`가 필요하다.
- `next dev`가 떠 있는 상태로 `npm run build`를 돌리면 같은 `.next`를 공유해 프리렌더가 깨진다.
  E2E를 돌린 뒤에는 dev 서버를 내리고 빌드할 것.
