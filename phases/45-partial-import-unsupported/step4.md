# Step 4: docs-sync — ADR-047과 대장 갱신

## 읽어야 할 파일
- `docs/ADR.md`(ADR-046 본문과 「ADR-046 구현 보충」 절, 번호 규약, ADR-028 부근의 「連続する床板은 大梁의 런과 같은 형태로 잡는다」 단락), `docs/RISKS.md` R10과 번호 규약, `docs/MILESTONES.md` 도면 인식 행, `CLAUDE.md`와 `AGENTS.md`의 「도면 인식(로컬)」 행과 「열린 리스크」 표(둘은 같은 문장이어야 한다)
- step 0~3 report(`step0-report-r1.json`·`step0-report-r2.json` 포함)

## 작업
1. `docs/ADR.md` 끝에 **ADR-047** 추가: 「부분 취입의 支持不成立은 부재 단위 未対応으로 강등하고, 大梁 런은 같은 断面일 때만 잇는다」.
   - 맥락: 2026-09-10 phase 44 브라우저 검증에서 tsu·yokohama 실물 PDF 반영 직후 3D·数量 페인이 `Missing … support 柱`·`No touching 大梁 found above 柱`로 비었다(근거: `phases/44-drawing-set-assembly/orchestration-report.md`, `phases/45-partial-import-unsupported/step0-report-r1.json#/reproduction`). phase 45 step 0의 두 판이 자리를 더 찾았다 — 인접 大梁의 断面이 다르면 `girderRun`이 지점이 다 있어도 plain Error(`step0-report-r1.json#/counterexample`), 같은 이름의 階 둘에 같은 符号·径이 다른 断面이면 `aggregateQuantity`가 plain Error(`step0-report-r2.json#/counterexample`). 실물 도면은 断面 미등록·미인식으로 항상 부분 취입이고, G1 옆에 G2가 오는 것은 보통이다.
   - 결정: ① `supportColumnSection`·`beamDepthAbove`의 검증을 `MemberUnsupportedError('支持柱なし' | '上部大梁なし')`로 낮춘다. ② `girderRun`은 `slabRun`과 같은 조건 — 인접 부재의 断面이 같을 때만 연속 — 으로 런을 나눈다. 「断面이 같음」은 通し筋의 충분조건이고 도면에 없는 연속을 만들지 않는다는 기존 원칙의 적용이다. mixed sections throw는 삭제. ③ 취입 계층에 엔진 불변식을 복제하지 않는다(기각한 대안: `applyFramingPlan`에서 柱 없는 大梁 건너뛰기 — 규칙이 두 곳에 생겨 어긋난다). 내부 결함(`Rule not found`·`Section not found`·non-柱 section)은 계속 plain Error다(`unsupported.ts` 원칙). ④ 같은 이름의 階 둘 ＋ 같은 符号 ＋ 径이 다른 断面의 `aggregateQuantity` throw는 **이번에 고치지 않는다** — `QuantityLine.id` 형식을 바꿔야 하고 그 id가 저장 案件의 備考 키라 이행이 필요하다(`step0-report.json#/deferred`). 실물 도면은 階 이름이 달라 닿지 않는다(`step0-report-r3.json`의 B8). ⑤ あばら筋 배치의 strict `gap > pitch` 비교가 부동소수 오차(pitch 100.1, 또는 pitch 100＋offset 0.1)로 거짓 양성을 내던 것은 허용오차 비교로 고쳤다(`step0-report-r3.json`·`step0-report-r4.json`, step 1 report). 「도달 가능한 plain throw의 완전한 목록」은 주장하지 않는다 — 부동소수 경계까지 세면 끝이 없어서다.
   - 결과: 未対応 부재는 数量·3D에서 빠지고 고지에 사유와 할 일이 뜬다. 断面이 갈리는 곳에서 런이 끊겨 양 끝에 定着이 붙는다. 값을 지어내지 않는다. 검증: step 1·2 테스트, uc24 새 체크 4개(step 3 report).
2. `docs/RISKS.md`: R10에 한 줄 — 부분 취입은 부재 단위 강등으로 앱이 죽지 않지만 断面リスト 미인식 부재는 未対応으로 남는다(파서 커버리지 과제, 수치는 쓰지 말 것). 그리고 새 항목 **R17**(번호는 파일의 마지막 항목 다음) — 취입이 만든 Project가 아직 닿을 수 있는 plain Error: 같은 이름의 階 둘에 같은 符号·径이 다른 断面이면 内訳 집계가 멎는다(`phases/45-partial-import-unsupported/step0-report-r2.json#/counterexample`). 실물 도면 값으로는 닿지 않으며, 완전한 목록은 아니다(step 0 네 판이 자리를 하나씩 더 찾았다 — `step0-report-r1.json`~`-r4.json`).
3. `docs/MILESTONES.md` 도면 인식 행과 `CLAUDE.md`·`AGENTS.md`의 같은 행에 「부분 취입은 支持柱なし·上部大梁なし 未対応으로 강등하고 大梁 런은 같은 断面일 때만 잇는다(ADR-047)」 한 구절을 **동일 문장**으로 추가. `CLAUDE.md`·`AGENTS.md`의 「열린 리스크」 표에 R17 행을 **동일 문장**으로 추가.

## Acceptance Criteria
```bash
python scripts/check-citations.py phases/45-partial-import-unsupported/step4-report.json
npm run lint
```
그리고 아래를 `phases/45-partial-import-unsupported/step4-check.py`로 저장해 실행(0으로 끝나야 한다):
```python
import io
a = io.open('CLAUDE.md', encoding='utf-8').read(); b = io.open('AGENTS.md', encoding='utf-8').read()
for prefix in ('| 도면 인식(로컬)', '| R17'):
    ra = [l for l in a.splitlines() if l.startswith(prefix)]
    rb = [l for l in b.splitlines() if l.startswith(prefix)]
    assert ra and ra == rb, (prefix, ra, rb)
adr = io.open('docs/ADR.md', encoding='utf-8').read()
assert '### ADR-047' in adr and 'ADR-048' not in adr
risks = io.open('docs/RISKS.md', encoding='utf-8').read()
assert 'R17' in risks
print('docs ok')
```

## 산출물
`phases/45-partial-import-unsupported/step4-report.json`: `{ "adr": "ADR-047", "risk": "R17", "files": [...], "paths_verified": ["docs/ADR.md", "docs/RISKS.md", "docs/MILESTONES.md", "CLAUDE.md", "AGENTS.md"] }`

## 금지사항
- 수치를 새로 만들지 마라. 이유: 대장의 수치는 report에서만 가져온다(경로 인용).
- ADR-046 본문을 고치지 마라 — 보충은 새 ADR로만.
- 코드를 만지지 마라.
