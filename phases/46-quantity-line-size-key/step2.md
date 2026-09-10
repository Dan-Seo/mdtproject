# Step 2: docs-sync — ADR-048과 R17 종결

## 읽어야 할 파일
- `docs/ADR.md` ADR-019·ADR-040·ADR-047(④ 유보 문장)과 번호 규약, `docs/RISKS.md` R17, `CLAUDE.md`·`AGENTS.md`의 「열린 리스크」 표 R17 행(둘은 같은 문장이어야 한다)
- `phases/46-quantity-line-size-key/step1-report.json`

## 작업
1. `docs/ADR.md` 끝에 **ADR-048** 추가: 「数量行의 鍵에 規格(径)을 넣고, 저장된 備考는 구 鍵으로 읽어 이행한다」.
   - 맥락: R17 — `memberGroupKey`가 `story.name`을 쓰므로 같은 이름의 階 둘에 같은 符号·径이 다른 断面이 오면 `quantityLineId`가 같아져 「Inconsistent size or shape」 plain Error로 内訳 전체가 멎었다(`phases/45-partial-import-unsupported/step0-report-r2.json#/counterexample`). 数量積算基準 1通則 前文의 「規格、形状、寸法等ごとに」에서 規格(径)이 鍵에 빠져 있던 것이 원인.
   - 결정: ① `quantityLineId`·`spliceLineId`의 맨 끝에 `径${size}` 세그먼트. 충돌 검사는 삭제(shape 처리는 `step1-report.json#/shape_decision` 인용). ② `schemaVersion`은 올리지 않는다. `noteFor`가 새 鍵 → 구 鍵(`legacyQuantityLineId`, 맨 끝 세그먼트 제거) 순으로 읽고, `setNote`는 새 鍵에 쓰며 구 鍵을 지운다. 충돌 案件에서 구 鍵을 공유하던 두 행은 한쪽을 편집하면 다른 쪽의 구 備考가 사라진다 — 두 행이 한 備考를 계속 공유하는 것보다 낫다고 판단(기각한 대안: schemaVersion 12＋적재 시 전 행 재계산 이행 — `deserializeProject`가 배근 엔진을 부르게 되어 모델과 엔진이 결합된다; `story.id` 기반 群 鍵 — 문제는 群이 아니라 規格이고 표시 단위가 흔들린다). ③ `memberGroupKey`는 그대로.
   - 결과: 数量 값은 무변화(골든 통과). 같은 이름의 階 충돌은 径별 두 행으로 갈린다. R17 종결.
2. `docs/RISKS.md` R17을 **종결**로 바꾼다(문장은 「해소 — ADR-048」 형식, 다른 종결 항목과 같은 꼴). 「완전한 목록이라고 주장하지 않는다」 구절은 유지한다 — 종결되는 것은 그 counterexample 하나다.
3. `CLAUDE.md`·`AGENTS.md`의 「열린 리스크」 표 R17 행을 **동일 문장**으로 종결 상태로 갱신. ADR-047 본문은 고치지 않는다.

## Acceptance Criteria
아래를 `phases/46-quantity-line-size-key/step2-check.py`로 저장해 실행(0으로 끝나야 한다):
```python
import io
a = io.open('CLAUDE.md', encoding='utf-8').read(); b = io.open('AGENTS.md', encoding='utf-8').read()
ra = [l for l in a.splitlines() if l.startswith('| R17')]
rb = [l for l in b.splitlines() if l.startswith('| R17')]
assert ra and ra == rb and 'ADR-048' in ra[0], (ra, rb)
adr = io.open('docs/ADR.md', encoding='utf-8').read()
assert '### ADR-048' in adr and 'ADR-049' not in adr
risks = io.open('docs/RISKS.md', encoding='utf-8').read()
assert 'R17' in risks and 'ADR-048' in risks
print('docs ok')
```
```bash
python scripts/check-citations.py phases/46-quantity-line-size-key/step2-report.json
```

## 산출물
`phases/46-quantity-line-size-key/step2-report.json`: `{ "adr": "ADR-048", "risk": "R17 closed", "files": [...], "paths_verified": ["docs/ADR.md", "docs/RISKS.md", "CLAUDE.md", "AGENTS.md", "phases/46-quantity-line-size-key/step1-report.json"] }`

## 금지사항
- 수치를 새로 만들지 마라. 코드를 만지지 마라. ADR-047 본문을 고치지 마라.
