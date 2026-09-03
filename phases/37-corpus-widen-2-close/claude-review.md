# phase 36·37 병합 전 Claude 검토 기록 (2026-09-03 18:45)

codex 산출(phase 36 step 0〜4, phase 37 step 1〜4)을 Claude가 하위 에이전트 diff 검토＋직접 확인으로
교차검증한 결과. 병합 판단의 근거이며, 아래 「후속」은 다음 phase 사양의 입력이다.

## 통과
- 금지 파일 범위(스텝별)·골든 무편집(codex 커밋)·도면/발주처/시트 조건 0·labels/spans `.reverse()` 0·`process.env` 0.
- 격자: `positionPt`는 행 기준선, 축척 검증은 원시 세그먼트 중심(`validationPositionsPt`), `scaleValid` strict,
  부분합은 `coveredSpanCount > unresolvedSpanCount`(과반) 규칙, 이슈 규칙·`fullTotals` 후보별 비교 단위테스트.
- 断面リスト: 표 머리 행 fallback을 첫 층 앞으로 제한(柱·大梁 둘 다), `kindFromMark` 층 접두 1회 제거 후 `^G`,
  합성 회귀 5건은 구 코드에서 실패(반증 가능). ojkk-p4 対象外 12칸 strict 대조, `as unknown as` 0건.
- 단독 실행: lint 0오류(기존 경고 1), typecheck·build 통과, 100파일 1,794 테스트 통과. e2e uc12 통과(fuji 스라브 3건).

## 후속 (다음 phase 사양으로)
1. **elevation.ts 라벨 열 군집이 실효 없음** — `displaced`(≈262-273)가 비선택 열의 화이트리스트 통과 토큰을
   전부 되살려 열 군집·순위(≈181-260)·`LABEL_COLUMN_GAP_PT`(:46, 근거 없음)가 결과에 영향이 없다. 실효 규칙은
   `isLevelLabel` 문자열 화이트리스트뿐. 죽은 복잡도를 걷어내거나 열 규칙을 실제로 작동시킬 것.
2. **레벨 화이트리스트 비대칭** — `/(?:FL|GL|RCL|(?:天端|下端|上端)$)/`: FL/GL은 부분일치, 天端계는 `$` 앵커라
   「梁天端(水下)」「基礎梁天端-20」(tsu 골든 notes에 실재)·「1SL」「G.L」이 탈락한다.
3. **`SHORT_TAIL_SCALE_TOLERANCE_RATIO = 0.49`** — tsu-p21 1170mm 한 면 상수(R15에 기록). 1170이 다른 치수 열(x≈160.5)에
   있어 중점 간격 모델이 안 맞는다 — 레벨 라벨 정렬로 잇거나 정직한 미검출로.
4. **`kindFromMark` `^G`** — 구 `^G\d`가 거부하던 `GB1`·`GW1`이 大梁으로 승격된다. `^G(?:\d|[A-Z]$)` 수준으로 좁힐지 결정.
5. **corpus2-elevation.test.ts 잔여** — `toHaveLength(2|3)` 리터럴, karatsu 제외를 골든 `levelNote`가 아닌 제목 리터럴로,
   ojkk-p4 CB1 `先端` 값은 `端部`/`中央` 분기라 미대조.
6. cc62ee8(codex step 3 커밋)에 Claude의 step5.md 편집이 쓸려 들어갔다(하네스 `git add -A`). 내용 무해.
