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

### 각 시나리오는 자기 記録을 지우고 시작한다

M4의 자동저장(IndexedDB) 때문에 **앞 시나리오의 편집이 뒤 시나리오로 흘러든다.** 실제로
`uc3`이 帯筋 피치를 바꾸면 `uc11`이 그 값을 물려받아 실패했다. 그래서 각 스크립트는 첫 착지
직후 `indexedDB.deleteDatabase("kijun")` → `reload`로 샘플 案件에 되돌린다. **새 시나리오를
쓸 때 이 네 줄을 빠뜨리면 순서에 따라 간헐적으로 깨진다.**

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
| `uc15-revisit.js` | 재방문 경로 — IndexedDB 자동저장→복원 · 案件 JSON 저장/불러오기 · 깨진 파일 거부 |
| `uc16-model-and-print.js` | glb 내보내기(magic·version·`EXT_mesh_gpu_instancing`·노드명) · PDF 인쇄 시점의 DOM |
| `uc17-stress-building.js` | **R4 계측 전용.** 5층 4×3 합성 案件의 建物 뷰 — draw call·삼각형·씬 재구축·편집 반영 |
| `uc18-shear-wall.js` | 耐震壁 — 断面一覧 입력(壁厚·縦筋·横筋·配筋層数) · 内訳 縦筋/横筋 행 · 開口部 미계상 고지(R14) · 平面에서 大梁와 겹치지 않게 선택 · 部材/建物 3D |
| `uc19-japan-specific.js` | 日本固有の形態・製品 — 高強度せん断補強筋(K13·S13)は帯筋にだけ · 円形柱の周長 πD·直径入力·円柱 3D |
| `uc20-slab.js` | 床板(スラブ) — 断面一覧の2方向×2面 입력 · 内訳 4행 · 単独床板↔連続床板으로 継手 조문 교체 · 開口部 미계상 고지(R14)에 床板 명시 · 平面에서 床板을 놓아도 大梁·壁이 선택 가능 · 部材/建物 3D |
| `uc21-opening.js` | 開口部(数量積算基準 1通則8)) — 平面에서 壁·床板을 골라야 입력이 뜨는 것 · 開口을 넣으면 内訳이 欠除量별로 갈리는 것 · 断たれた縦筋의 継手가 2（５）壁1)② 但書로 0か所가 되는 것 · 0.5㎡以下면 欠除가 사라지는 것 · 床板 開口가 平面에 실촌으로 그려지는 것 · 開口補強筋 미계상 고지(R14) · 部材/建物 3D |

### 자동저장을 지우고 시작한다

M4의 IndexedDB 자동저장(`src/lib/persist/indexeddb.ts`)은 앞선 走行을 다음 走行으로
넘긴다. 그래서 `uc15-revisit`을 뺀 모든 시나리오가 첫 `goto` 앞에서 `kijun` DB를
지우고 다시 연다 — 넣지 않으면 開口를 더하거나 断面을 바꾸는 시나리오가
「처음 한 번만 통과하는」 것이 된다(실제로 uc19·uc21이 그랬다). `uc15-revisit`은
그 저장 자체가 검증 대상이라 스스로 관리한다.

### uc17만 `next dev`가 필요하다

계측 훅 `__kijunViewerRuntime`·`__kijunStore`는 `process.env.NODE_ENV !== 'production'`
에서만 노출된다(도면 데이터가 든 전체 상태라 프로덕션에 내놓지 않는다). 나머지 시나리오는
`next start`(프로덕션 빌드)로 돌린다.

```bash
npx tsx scripts/perf/stress-fixture.ts 5 > /tmp/stress5.json
base64 -w0 /tmp/stress5.json > ~/.dev-browser/tmp/uc17-stress.json.b64
npm run dev -- -p 3000
dev-browser --browser kijun --timeout 300 run tests/e2e/uc17-stress-building.js
```

**dev 서버와 `next start`를 같은 트리에서 동시에 띄우지 말 것.** 같은 `.next`를 공유해
dev가 프로덕션 청크를 덮어쓰고, 그러면 지연 로드되는 청크(exceljs)만 404가 나서
`uc8`이 조용히 실패한다 — 초기 청크는 이미 받았으므로 다른 시나리오는 통과한다.
uc17을 돌린 뒤에는 `rm -rf .next && npm run build`로 되돌린다.

**uc17의 프레임 간격은 믿지 말 것.** 헤드리스 페이지는 `requestAnimationFrame`이 약 1Hz로
묶여서, 프레임 간격도 rAF를 기다리는 계측도 전부 「약 1000ms」로 나온다. 실제로 그 수치를
성능 문제로 오독했다가 draw call을 보고서야 원인을 알았다. 그래서 이 스크립트가 재는 것은
**draw call · 삼각형 수 · 씬 재구축 시간 · rAF를 기다리지 않는 편집 반영 시간** 넷뿐이다.

## 왜 유닛테스트로 안 되는가

jsdom에서 재현되지 않는 것만 여기에 둔다.

- **하이드레이션 타이밍** — 数量 표는 SSR HTML에 이미 있고 3D 캔버스는 하이드레이션 후에 생긴다.
  `canvas`를 기다리지 않고 DOM을 읽으면 하이드레이션 이전 상태를 본다.
- **실제 히트 테스트** — SVG 부재의 클릭 가능 영역이 시각적 마커와 일치하는지.
- **WebGL** — three.js 씬이 실제로 그려지는지. 환경맵(PMREM)·그림자·톤매핑은 유닛테스트에서
  `PMREMGenerator`/`WebGLRenderer`를 목으로 대체하므로, 실 GPU 동작은 여기(uc1·uc9)가 유일한 커버다.
- **파일 다운로드** — exceljs가 만든 Blob의 크기·MIME·파일명, GLTFExporter가 만든 GLB의 헤더.
- **IndexedDB** — jsdom에 없다. 자동저장·복원 경로(uc15)는 여기가 유일한 실커버다.
- **인쇄** — `window.print()` 시점의 DOM. 화면에 남지 않는 복제라 이 순간에만 볼 수 있다.

## 알려진 함정

- 수평 SVG `<line>`은 bbox 높이가 0이라 Playwright가 invisible로 판정한다. 大梁을 클릭하려면
  `{ force: true }`가 필요하다.
- `next dev`가 떠 있는 상태로 `npm run build`를 돌리면 같은 `.next`를 공유해 프리렌더가 깨진다.
  E2E를 돌린 뒤에는 dev 서버를 내리고 빌드할 것.
