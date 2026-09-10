# Step 4: docs-sync — ADR-047과 대장 갱신

## 읽어야 할 파일
- `docs/ADR.md`(ADR-046 본문과 「ADR-046 구현 보충」 절, 번호 규약), `docs/RISKS.md` R10, `docs/MILESTONES.md` 도면 인식 행, `CLAUDE.md`와 `AGENTS.md`의 「도면 인식(로컬)」 행(둘은 같은 문장이어야 한다)
- step 0~3 report

## 작업
1. `docs/ADR.md` 끝에 **ADR-047** 추가: 「부분 취입의 支持不成立은 부재 단위 未対応으로 강등한다」.
   - 맥락: 2026-09-10 phase 44 브라우저 검증에서 tsu·yokohama 실물 PDF 반영 직후 3D·数量 페인이 `Missing … support 柱`·`No touching 大梁 found above 柱`로 비었다(근거: `phases/44-drawing-set-assembly/orchestration-report.md`, `phases/45-partial-import-unsupported/step0-report.json#/reproduction`). 실물 도면은 断面 미등록·미인식으로 항상 부분 취입이다.
   - 결정: `supportColumnSection`·`beamDepthAbove`의 두 검증을 `MemberUnsupportedError('支持柱なし' | '上部大梁なし')`로 낮춘다. 취입 계층에 엔진 불변식을 복제하지 않는다(기각한 대안: `applyFramingPlan`에서 柱 없는 大梁을 건너뛰기 — 규칙이 두 곳에 생겨 어긋난다). 내부 결함(`Rule not found`·`Section not found`·non-柱 section)은 계속 plain Error다(`unsupported.ts` 원칙).
   - 결과: 그 부재는 数量·3D에서 빠지고 未対応 고지에 사유와 할 일이 뜬다. 값을 지어내지 않는다. 검증: step 2 테스트·uc24 새 체크 4개.
2. `docs/RISKS.md` R10에 한 줄: 부분 취입은 부재 단위 강등으로 앱이 죽지 않지만, 断面 미인식 부재(tsu 断面リスト 0행·yokohama 14행)는 여전히 未対応이며 파서 커버리지 과제다(근거 경로 인용).
3. `docs/MILESTONES.md` 도면 인식 행과 `CLAUDE.md`·`AGENTS.md`의 같은 행에 「부분 취입은 支持柱なし·上部大梁なし 未対応으로 강등(ADR-047)」 한 구절을 **동일 문장**으로 추가.

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step4-report.json
npm run lint
```
그리고 아래를 `phases/45-partial-import-unsupported/step4-check.py`로 저장해 실행(0으로 끝나야 한다):
```python
import io
a = io.open('CLAUDE.md', encoding='utf-8').read(); b = io.open('AGENTS.md', encoding='utf-8').read()
ra = [l for l in a.splitlines() if l.startswith('| 도면 인식(로컬)')]
rb = [l for l in b.splitlines() if l.startswith('| 도면 인식(로컬)')]
assert ra and ra == rb, (ra, rb)
adr = io.open('docs/ADR.md', encoding='utf-8').read()
assert '### ADR-047' in adr and 'ADR-048' not in adr
print('docs ok')
```

## 산출물
`phases/45-partial-import-unsupported/step4-report.json`: `{ "adr": "ADR-047", "files": [...], "paths_verified": ["docs/ADR.md", "docs/RISKS.md", "docs/MILESTONES.md", "CLAUDE.md", "AGENTS.md"] }`

## 금지사항
- 수치를 새로 만들지 마라. 이유: 대장의 수치는 report에서만 가져온다(경로 인용).
- ADR-046 본문을 고치지 마라 — 보충은 새 ADR로만.
- 코드를 만지지 마라.
