# Step 6: takeoff-ui-notice

3-girder-domain의 마지막 칸이다. 내역서 페인의 「大梁은 M3 대응 예정」 고지를 내리고, 그 자리에 **미지원 부재 고지**(n건·사유)를 올린다. 大梁 물량이 처음으로 내역서·Excel에 나타나는 step이다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/UX.md` — 내역서 페인의 고지·경고 표시 원칙
- `src/components/quantity/TakeoffPane.tsx` — `hasGirder` 기반 M3 보류 고지 블록과 `takeoff.girderPending` 사용부
- `src/components/quantity/TakeoffPane.test.tsx` — 보류 고지를 고정한 테스트 (교체 대상)
- `src/lib/hooks/useTakeoff.ts` — step 5의 `unsupportedMembers`
- `src/locales/ja.json` · `ko.json` — `takeoff.girderPending` 키와 명명 규약
- `src/lib/export/` — Excel export가 lines를 소비하는 방식 (수정 불요 확인용)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `src/components/quantity/TakeoffPane.tsx`

- `hasGirder` 기반 M3 보류 고지 블록을 제거한다.
- `unsupportedMembers.length > 0`일 때 고지를 표시한다: 건수 + 부재 목록(符号·층) + 사유(`連続スパン`) + 「M3b(通し筋)で対応予定」 취지. 기존 고지의 시각 스타일(정보성 notice)을 재사용하라.
- 미지원 사유는 도메인이 준 값(`reason`)을 그대로 보여준다 — UI에서 재해석하지 않는다.

### 2. i18n — `src/locales/ja.json` · `ko.json`

- `takeoff.girderPending` 삭제.
- `takeoff.unsupported.*` 신설 (예: `takeoff.unsupported.title`, `takeoff.unsupported.reason.連続スパン` — 기존 키 명명 규약을 따르되 도메인 용어는 일본어 원어 유지, ADR-008). ja가 기본, ko는 대응 번역(도메인 용어는 원어 유지).

### 3. 테스트

- `TakeoffPane.test.tsx`: 보류 고지 테스트를 교체한다 — ① 샘플(2×3 그리드)에서 X大梁 3행(上端筋·下端筋·あばら筋)이 표에 있다 ② Y大梁 미지원 고지가 건수·사유와 함께 보인다 ③ 미지원 부재의 행은 표에 없다 ④ `takeoff.girderPending` 문구는 더 이상 없다.
- Excel export 테스트: 大梁 행이 kg 집계에 포함되는지 1케이스 확인 (export 코드는 lines 제네릭 소비라 무변경이어야 정상 — 변경이 필요해 보이면 원인을 의심하라).

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
   - ja가 기본 로케일이고 도메인 용어가 원어인가? (ADR-008)
   - inferred 경고·워터마크 장치를 건드리지 않았는가? (ADR-015 — 大梁 행도 자동으로 이 장치를 통과한다)
   - 뷰어(`viewer.girderPending`)는 그대로인가? (다음 phase의 스코프 — 이 시점엔 뷰어가 아직 大梁을 못 그린다)
3. `phases/3-girder-domain/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 신설 i18n 키와 고지 구성, 大梁 행이 내역서·Excel에 나타남을 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **`viewer.girderPending`을 삭제하지 마라.** 이유: 뷰어의 大梁 렌더는 다음 phase(4-girder-viewer)다. 지금 지우면 뷰어가 빈 화면과 함께 침묵한다.
- **Excel 양식을 확장하지 마라(箇所 열 등).** 이유: M3b(수량 단위 확장)의 스코프다.
- **미지원 부재를 표에 0값 행으로 넣지 마라.** 이유: 0은 "계산했더니 0"으로 읽힌다. 미계산과 0을 섞으면 내역서가 거짓말을 한다.
- 기존 테스트를 깨뜨리지 마라.
