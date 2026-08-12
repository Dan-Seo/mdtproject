# Step 1: member-view-girder

部材 뷰가 大梁을 그린다. 「大梁の配筋は M3 で対応予定」 폴백을 내리고, 선택된 大梁의 콘크리트(clear span + **양단 지점 柱 스텁**)와 배근(zone 색 구분 포함)을 렌더한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — §7 전체 (좌표계·외형 표현·재질·카메라)
- `src/components/viewer/Viewer3D.tsx` — 部材 뷰 구축부: 선택 부재 뷰 도출(현재 柱 전용), 콘크리트 외형(와이어프레임+반투명 솔리드), 철근 메시 생성(`userData.rowId`), 하이라이트 스왑, 大梁 폴백 분기
- `src/components/viewer/Viewer3D.test.tsx` — "大梁 is out of scope" 테스트 (교체 대상), RaycasterMock·rAF 모킹 패턴
- `src/components/viewer/geometry.ts` — step 0의 `RebarBatch`(zone·layer)·전개 함수
- `src/domain/model/project.ts` — `girderSpan`(지점 柱 치수)·`girderSupport`
- `src/lib/hooks/useTakeoff.ts` — rebars·lines·unsupportedMembers
- `src/locales/ja.json` · `ko.json` — `viewer.girderPending`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라 (Viewer3D.test.tsx 갱신 먼저).

### 1. 선택 부재 뷰 유니온

현재 柱 전용 도출 함수를 柱/大梁 판별 유니온으로 확장하라. 大梁 분기는 `girderSpan`·`girderSupport`를 쓴다:
- **지원 大梁**: 콘크리트 = clear span 박스(`[clear, depth, b]`) + **양단 柱 스텁**(지점 柱 단면 치수로, 층高 일부만 — 定着이 콘크리트 안에 들어가는지 눈으로 확인하는 용도). 스텁도 기존 와이어프레임+반투명 스타일.
- **미지원 大梁**(連続スパン): 배근을 그리지 않고 미지원 문구를 보여준다 (신규 i18n `viewer.unsupported.*` — takeoff의 사유 표기와 정합).
- 柱 분기는 기존 그대로.

### 2. 철근 렌더 — zone 색 구분

- step 0의 `rebarBatches()`가 주는 배치 단위로 메시를 만든다. zone별 머티리얼: 코어(기존 철근색), `定着`(청록 계열), `重ね継手`(황색 계열) — 구체 색상은 기존 팔레트(무채색+포인트 1색 원칙, PRD 디자인 절)와 조화롭게 선택하되 **선택 강조색(#f54e00)과 뚜렷이 구분**할 것.
- 각 메시 `userData`에 `rowId`·`layer`·기본 머티리얼 참조(또는 키)를 저장하고, 하이라이트 해제 시 **원래 zone 머티리얼로 복원**하라 — 일괄 기본색 복원은 zone 색을 지운다.
- 씬 재구축 트리거(현재 구현이 쓰는 방식 그대로)에 大梁 형상 필드(b·depth·stirrup·clear)와 zones가 반영되게 하라.

### 3. 폴백 제거

- 大梁 폴백 분기와 `viewer.girderPending` 키(ja/ko)를 제거한다 (미지원 大梁 문구는 신규 키로 대체).

### 4. 테스트 — `Viewer3D.test.tsx`

- "大梁 out of scope" 테스트 교체 → 지원 大梁 선택 시: 캔버스 존재, pickable 메시 > 0, 클릭 피킹이 上端筋 행 rowId로 이어짐.
- 미지원 大梁 선택 시: 미지원 문구 표시, 철근 메시 없음.
- 柱 선택 시 pickable 수가 zone 분리 배칭 반영값으로 갱신됨 (기존 테스트 수치 갱신).
- 하이라이트 on→off 후 zone 머티리얼 복원.

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
   - 좌표계가 §7 규칙(mm→×0.001, Y=높이)대로인가?
   - 도메인을 뷰어에서 재계산하지 않는가? (정착 길이 등은 rebar.zones가 원천)
   - 철근 径을 색으로 구분하지 않는가? (PRD 디자인 원칙 — zone 색은 구간 구분이지 径 구분이 아니다)
3. `phases/4-girder-viewer/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 뷰 유니온 구조·지점 柱 스텁·zone 머티리얼 키·girderPending 제거를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **미지원 大梁을 "그럴듯하게" 스팬별 계산으로 그리지 마라.** 이유: R7 ② — 틀린 형상의 전시는 틀린 물량보다 나쁘다.
- **建物 뷰를 수정하지 마라.** 이유: step 2의 스코프다.
- **머티리얼을 렌더 루프에서 생성·dispose하지 마라.** 이유: 프레임 드랍과 셰이더 재컴파일. 생성은 씬 구축 시 1회.
- 기존 테스트를 깨뜨리지 마라.
