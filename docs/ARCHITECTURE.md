# 아키텍처

## 디렉토리 구조
```
src/
├── app/                  # Next.js App Router — 페이지 셸만. 전부 클라이언트 컴포넌트
│   └── api/oncall/       #   유일한 예외: 운영 알림 수신 라우트 (ADR-017)
├── components/
│   ├── plan/             # 평면 입력 에디터
│   ├── section/          # 부재 단면일람 테이블
│   ├── viewer/           # three.js 3D 뷰어
│   └── quantity/         # 물량 내역서 테이블
├── domain/               # 순수 TypeScript. React·DOM·three.js 의존 금지
│   ├── model/            # Project / Member / Rebar 타입
│   ├── rules/            # 룰팩 로더 + 조회 엔진
│   ├── rebar/            # 철근 생성기 (柱, 大梁)
│   └── quantity/         # 물량 집계 (設計数量 → 할증률 조회 → 所要数量)
├── rulepack/
│   └── jp-mlit/          # YAML 룰팩 (定着·重ね継手·折曲げ·かぶり·할증률)
├── lib/                  # 직렬화, IndexedDB, exceljs, glTF, i18n
└── locales/              # ja.json (기본), ko.json (fallback → ja)
tests/
└── golden/               # 標準仕様書·수량적산기준 표 ↔ 엔진 출력 대조
```

템플릿에 있던 `services/`(외부 API 래퍼)는 두지 않는다. 외부 API를 호출하지 않는다.
유일한 예외는 운영 알림 수신 라우트(`app/api/oncall`)의 GitHub API 호출이다 (ADR-017).

`types/`를 따로 두지 않고 `domain/model/`에 둔다. 타입과 그 타입을 다루는 순수 함수가 붙어 있는 편이 낫다.

## 패턴

**도메인은 UI를 모른다.** `src/domain/`은 React·DOM·three.js·Next.js를 import하지 않는다. Node에서 그대로 실행되고, 그래서 골든테스트가 브라우저 없이 돈다. 이 경계가 이 프로젝트에서 가장 중요한 규칙이다.

**룰 로직은 코드, 룰 수치는 데이터.** 어느 표를 볼지 결정하고 길이를 조합하는 것은 평범한 TS 함수로 쓴다. 그 함수가 읽는 **수치**는 `.ts` 파일에 리터럴로 나타나면 안 되고 전부 `rulepack/`의 YAML에서 조회한다.

이 분리는 취향이 아니다. 수치가 코드에 박히면 **항목 단위로 `confidence`를 붙일 수 없고** `inferred` 경고와 워터마크가 성립하지 않는다. 반대로 룰 DSL이나 평가기를 만들지도 않는다 — 로직은 함수로 충분하다.

룰팩 항목의 형태:

```yaml
- key: teichaku.L2
  conditions: { fc: 24, grade: SD345, hook: false }
  value: 35            # 배수(d)
  unit: d
  source:
    doc: 公共建築工事標準仕様書（建築工事編）令和7年版
    edition: 令和7年3月21日 国営建技第5号
    url: https://www.mlit.go.jp/gobuild/content/001888816.pdf
    page: null         # 원문 대조로 쪽을 특정하면 채운다
  confidence: inferred # stated | inferred — page가 null이면 stated일 수 없다
```

M0 이전에는 모든 항목이 `inferred`다. 쪽을 특정한 항목만 `stated`로 올린다.

`confidence: inferred`는 원문에 명시되지 않아 추론으로 채운 값이거나, 원문 대조를 아직 하지 않은 값이다. 이 목록이 곧 "일본 실무자를 만나면 물어볼 질문 목록"이다. `source.page`가 없는 항목이 `stated`일 수는 없다 — 로더가 이를 검사한다.

**할증률 룰은 부재 구분을 인자로 받는다.** 수량적산기준은 躯体 철근 4%(20쪽)와 별개로 흙막이벽 3%(13쪽)·말뚝 3%(14쪽)를 정한다. "모든 철근 4%"로 일반화하면 조용히 틀린 값이 나가므로, 지원 범위 밖의 부재 구분이 들어오면 값을 반환하지 않고 실패한다.

**출처 표시는 법적 의무다.** 근거 자료는 PDL1.0(공공데이터이용규약 제1.0판) 준거로 상업적 이용·가공이 가능하나, 출처 표시와 개변 사실 표시가 요구된다. 룰팩의 `source` 필드와 UI 하단 고지가 이 의무를 충족한다. `source.url`은 UI에서 **클릭 가능한 링크**로 노출한다 — 원문 대조 비용을 0으로 만드는 것이 ADR-003이 이 문서를 고른 이유다.

**서버 컴포넌트를 쓰지 않는다.** Next.js를 선택했지만 MVP에서 서버 렌더링의 이점이 없고, 캔버스·상태 중심 앱에서 RSC 경계는 방해만 된다. 계정·DB가 필요해지는 시점에 서버 컴포넌트를 도입한다.

## 데이터 흐름
```
평면 입력 + 단면일람
      ↓
Project (직렬화 가능한 순수 JSON)
      ↓
RebarGenerator(Member, RulePack) → Rebar[]           ← 규준 수치는 전부 룰팩 조회
      ↓
QuantityAggregator(Rebar[], RulePack) → QuantityLine[]
      設計数量 → 부재 구분별 할증률 조회 → 所要数量
      ↓
┌─────────────┬──────────────────┬─────────────┐
│ 내역서 테이블 │ three.js         │ exceljs      │
│              │ InstancedMesh    │ glTF export  │
└─────────────┴──────────────────┴─────────────┘
```

전 구간이 브라우저에서 돈다. 사용자 도면 데이터는 서버로 전송되지 않는다. 이는 성능 선택이 아니라 신뢰 선택이다 — 건설 도면과 물량은 기밀이다.

앱 자체는 Vercel에서 정적으로 배포되므로 "아웃바운드 요청 0"을 주장하지는 않는다. 주장하는 것은 **사용자 데이터가 나가지 않는다**는 것이며, 이는 서버 저장·전송 코드를 만들지 않음으로써 성립한다 (ADR-006).

`Rebar[]`와 `QuantityLine[]`은 **저장하지 않는다.** `Project`에서 매번 계산한다. 파생 상태를 저장하면 반드시 어긋난다.

## 상태 관리
- **도메인 상태**: `Project` 객체 하나. zustand 스토어 1개. 순수 JSON으로 직렬화 가능해야 한다 — 이것이 저장·불러오기·나중에 서버 도입까지의 이음매다.
- **파생 상태**: `Rebar[]`, `QuantityLine[]`은 메모이즈된 계산 결과. 스토어에 넣지 않는다.
- **선택 상태**: 평면·3D·내역서 세 패널이 공유하는 `selectedMemberId` / `selectedRebarId`. 스토어에 둔다.
- **3D 씬**: three.js 오브젝트는 React state에 넣지 않는다. `Rebar[]`가 바뀔 때 씬을 재구성한다. 층당 철근 개체가 1만 개 규모이므로 `InstancedMesh`를 쓴다.
- **영속화**: IndexedDB 자동 저장(디바운스) + JSON 파일 다운로드/업로드. 서버 저장 없음.
