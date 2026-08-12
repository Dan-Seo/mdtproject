# Step 6: anchorage-legend

뷰어 기능 ④·phase 마지막 칸: 정착·継手 범례. 部材 뷰의 zone 색(step 1)이 무엇을 뜻하는지 HTML 오버레이 범례로 설명한다 — 색 스와치 + kind별 길이 칩(`定着 L2 875` 등) + あばら筋 피치 주석. **모든 수치는 데이터에서 읽는다** — 하드코딩 금지.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `src/components/viewer/Viewer3D.tsx` — 部材 뷰 선택 부재 도출, zone 머티리얼(step 1의 색 상수), 오버레이 UI 배치(step 3·4의 컨트롤)
- `src/domain/model/rebar.ts` — `RebarZone`(kind·경로거리), `Rebar.rules`(RuleHit — 룰 키·값·출처)
- `src/domain/rebar/girder.ts` · `column.ts` — zones·rules를 어떻게 방출하는지 (범례의 데이터 원천)
- `src/domain/rebar/stirrup-layout.ts` — `StirrupLayout.lastGapMm` (마지막 잔여 간격)
- `src/lib/hooks/useTakeoff.ts` — rebars 접근 경로
- `src/locales/ja.json` · `ko.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. zone 색 상수의 단일화

- step 1이 zone 머티리얼 색(定着 청록·重ね継手 황색)을 Viewer3D 안에 뒀다면, 범례와 머티리얼이 **같은 상수를 import**하도록 공유 모듈(예: `src/components/viewer/palette.ts` 또는 기존 상수 위치)로 올려라. 색이 두 곳에 적히면 반드시 어긋난다.

### 2. 범례 데이터 수집 (순수 함수)

```ts
export interface LegendEntry {
  kind: '定着' | '重ね継手'
  lengthMm: number        // zone의 경로거리 폭 (pathToMm − pathFromMm)
  ruleKey?: string        // 해당 길이를 만든 룰 키 (예: 'anchorage.L1') — rules에서 대조
}
export function legendEntries(rebars: Rebar[]): LegendEntry[]
```

- 선택 부재의 rebars에서 zones를 수집해 kind·길이별로 중복 제거한다. 길이가 다른 같은 kind(예: 양단 정착 방식이 다른 大梁)는 **별개 엔트리**다.
- `ruleKey`는 `Rebar.rules`의 RuleHit와 대조해 붙인다 — 있으면 범례에 룰 키를 함께 표기(산출 근거 소명, UC4). 대조 실패 시 생략 (에러 아님).
- 뷰어에서 `lookupRule`을 호출하지 마라 — zones·rules가 이미 답을 들고 있다.

### 3. 범례 UI (HTML 오버레이)

- 部材 뷰에서 zones 있는 부재 선택 시 표시: kind별 색 스와치 + `定着 L2 875` 형식 칩. 수치는 `legendEntries` 결과 그대로.
- あばら筋/帯筋 행: 입력 피치(`@100`)를 표시하고, `lastGapMm`이 피치와 다르면 잔여 간격을 구분 표기 (예: `@100 (末端 50)`) — 입력값과 산출 배치의 차이를 숨기지 않는다.
- zones 없는 부재(또는 미지원 大梁)에서는 범례를 그리지 않는다.
- i18n: `viewer.legend.*` (ja 기본·ko 대응, 도메인 용어 원어 유지).
- 3D 공간 치수선(스프라이트·CSS 3D 투영)은 만들지 않는다 — HTML 범례가 사양이다.

### 4. 테스트

- `legendEntries` 단위 테스트: 大梁 rebars → 定着 엔트리(길이는 **테스트 내 `lookupRule` 유도값**과 일치 — 하드코딩 기대값 금지, `column.test.ts` 선례), 양단 방식 상이 시 별개 엔트리, zones 없는 입력 → 빈 배열.
- `Viewer3D.test.tsx`: 지원 大梁 선택 → 범례 표시(칩 텍스트에 룰 키·길이), 미지원 大梁 → 범례 없음, 柱 선택 → 主筋 zones 기반 범례. 스와치 색이 zone 머티리얼 상수와 동일 소스인지(공유 상수 import) 확인.
- あばら筋 잔여 간격 표기: `lastGapMm ≠ pitch` 케이스.

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 범례 수치가 전부 zones·rules·입력에서 유래하는가? (하드코딩·뷰어 재계산 0)
   - 색 상수가 단일 소스인가?
3. `phases/4-girder-viewer/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 legendEntries 스키마·색 상수 위치·잔여 간격 표기 방식을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`
4. phase 전 step 완료 시점이므로, `phases/4-girder-viewer/index.json` 전체 status가 일관된지(completed 아닌 step이 없는지) 확인하라.

## 금지사항

- **범례 수치를 하드코딩하지 마라 (`定着 L2 875` 등).** 이유: 데이터 원천은 rebar.zones·rules다. 룰팩이 갱신되면 하드코딩 범례는 3D와 다른 거짓말을 한다.
- **뷰어에서 정착·継手 길이를 재계산(lookupRule 호출)하지 마라.** 이유: 도메인이 zones로 이미 준다. 두 벌 계산은 불일치의 씨앗이다.
- **3D 스프라이트·CSS 3D 투영 치수선을 만들지 마라.** 이유: HTML 범례가 사양이다 (유지보수 최소 결정).
- **建物 뷰에 범례를 확장하지 마라.** 이유: 요청 밖 기능이다. 部材 뷰만이 스코프다.
- 기존 테스트를 깨뜨리지 마라.
