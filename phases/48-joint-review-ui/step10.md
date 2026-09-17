# Step 10: docs-sync — ADR-049·RISKS R18·MILESTONES·CLAUDE.md＝AGENTS.md·ARCHITECTURE·tests/e2e/README

## 읽어야 할 파일
- `docs/ADR.md` 말미(ADR-048 형식), `docs/RISKS.md`, `docs/MILESTONES.md`, `CLAUDE.md`·`AGENTS.md`(두 파일의 공유 절은 **같은 문장**), `tests/e2e/README.md`, `docs/ARCHITECTURE.md`
- phase 47·48의 step report(수치는 거기서만 인용 — `phases/47-joint-review-core/step*-report.json`, `phases/48-joint-review-ui/step*-report.json`)
- `src/domain/review/types.ts`(`REVIEW_SCHEMA_VERSION`·`reviewSchemaVersion` — 문서에 이 이름으로 쓴다)

## 쓸 것
### ADR-049: 접합부 검토 계층 — 検討 데이터는 `Project` 밖, 접합 관계는 산정 함수, 검사 기준은 利用者入力
결정 문장(각각 근거와 트레이드오프 한 줄). 아래 1~5는 반증자(phase 48 `spec-refutation.md`)의 제안을 채택한 문장이다:
1. `ReviewState`는 `Project`와 분리한 순수 JSON이며 같은 파일·IndexedDB에 별도 키(`review`)로 저장한다. `PROJECT_SCHEMA_VERSION` 불변. 검토 데이터가 없는 파일은 빈 검토로 열린다(検討 완료로 채우지 않는다). `reviewSchemaVersion` 불일치는 거부한다(조용한 이행 없음).
2. 첫 접합부 유형은 矩形 柱 1 ＋ 같은 階에서 그 격자점에 닿는 大梁(`touchesColumn`·`girderSupportSections`와 같은 위치 관계). 円形柱·壁·床板·他 階는 未対応으로 명시하며 bbox 근접으로 판정하지 않는다.
3. 형상 검사는 実寸 반경 캡슐 간 최소거리다. 干渉候補는 기하 사실이라 기준값이 없고, あき 기준은 룰팩이 아니라 `利用者入力`(출처·범위·시각 기록)이다. 결과는 「候補」이지 판정이 아니다. 룰팩에 鉄筋のあき 행을 넣지 않은 이유(원문 대조 미완·ADR-023).
4. 「確認済」·「準備完了」는 체크리스트 충족이다. 상태 사이의 자동 승격은 없다(検討項目 확인이 패키지를 준비완료로 만들지 않고, 준비완료가 확인을 만들지 않는다). 「合格」류 총괄 판정을 두지 않는다.
5. 로컬 전용. 검토 데이터는 텔레메트리 allowlist에 들어가지 않는다. 검토 UI는 `Project`의 断面·配筋 값을 바꾸지 않는다.
6. 검사하지 않는 것(継手位置·パネルゾーン帯筋·折曲げ内法直径·幅止め筋余長·開口補強筋)은 결과에 未検査로 항상 보인다.
7. 변경 영향은 `memberDependencies`(支持柱·上部大梁·連続スパン·上下階柱)로 전파하고 경로 문장을 낸다. 壁·床板은 `依存経路未追跡`이며 결과 차분으로만 잡는다.
8. 검토 항목의 유효성은 대상 부재의 입력·결과 fingerprint, 룰팩 fingerprint, 검사 版·검사 조건으로만 판정한다. 카메라·clip·layers·備考·案件名·通り芯名은 무효화 사유가 아니다.
9. 작업 패키지는 논리 단위이며 数量을 바꾸지 않고 kg를 내지 않는다.
10. **후속(만들지 않은 것 — 코드·타입·저장 키에 없다)**: 패키지＋dueDate가 4D 연결의 자연스러운 단위, 검토용 実寸 `buildingLayout`이 조립 경로 검사의 입력, `ElementRef`＋`ReviewSnapshot`이 BCF 대응 단위, 검토 모듈이 다른 구조 분야로의 확장 지점. 이 문단만이 그 연결의 기록이다.

### RISKS R18 (열림)
형상 검사의 가정: 呼び径＝外径, 主筋 위치가 작도 규칙(段配置 없음), 折曲げ 각 처리, 継手 미표시, 大梁 교차부 상하 관계 없음 → 干渉候補의 과검출·과소검출 가능. 사용자 입력 あき 기준의 出典 부재. 해소 조건: 設計図書 段配置·折曲げ 입력을 받는 후속. phase 47 step 7·8의 영역 프리필터 결함(반경＋padding 미확장으로 누락 → 수정)을 경위로 적는다(건수는 `phases/47-joint-review-core/step8-report.json`에서 인용).

### MILESTONES / CLAUDE.md·AGENTS.md
- 마일스톤 표에 「접합부 검토·변경 영향·작업 준비(VDC)」 행: 완료, 남은 것 R18·perf 실측 조건(step 9 report의 조건 문장 인용).
- 아키텍처 규칙에 한 줄: 「검토 데이터(`src/domain/review`)는 `Project` 밖이며 数量·룰팩을 바꾸지 않는다. 검사 기준값은 利用者入力뿐(ADR-049)」.
- 열린 리스크 표에 R18 한 줄.
- `docs/ARCHITECTURE.md` 디렉토리 트리에 `domain/review/`·`lib/review/`·`components/review/` 추가.

### tests/e2e/README.md: uc25·uc25-perf 두 줄(step 8·9가 추가했으면 확인만).

## Acceptance Criteria
```bash
npm run test:ci-scripts
python scripts/check-citations.py phases/48-joint-review-ui/step*-report*.json
diff <(sed -n '/## 아키텍처 규칙/,/## 개발 프로세스/p' CLAUDE.md) <(sed -n '/## 아키텍처 규칙/,/## 개발 프로세스/p' AGENTS.md)   # 비어야 함
grep -c "4D\|BCF" src/domain/review/types.ts src/lib/persist/indexeddb.ts   # 0 이어야 함
```

## 산출물
`step10-report.json`: `{ "changed_files", "adr": "ADR-049", "risk": "R18", "cited": [{ "claim": "...", "source": "phases/..#/pointer" }], "paths_verified": ["docs/ADR.md", "docs/RISKS.md", "docs/MILESTONES.md", "CLAUDE.md", "AGENTS.md", "docs/ARCHITECTURE.md"] }`

## 금지사항
- 수치는 report에서만 인용하라(지어내지 마라). 「구조 안전」「승인」을 완료 표현으로 쓰지 마라.
- 기존 ADR 문장을 삭제하지 마라(대체는 취소선＋대체 ADR 표기 선례).
- 코드를 바꾸지 마라(문서 step).
