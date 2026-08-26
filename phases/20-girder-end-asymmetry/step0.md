# Step 0 (kind: verify): ADR-032의 분해 수식을 반증하라

**이 스텝은 검증 전용이다. 대상을 고치지 마라.**
반증이 성립하면 그것이 이 스텝의 **정상 종결**이다 — `index.json`의 status를
`"refuted"`로 쓰고 `summary`에 어느 식이 어떤 (s,c,e)에서 깨지는지 적어라.
수식을 고치는 것은 저자(Claude)의 몫이다. 반증이 서지 않으면 `completed`에
무엇을 어떻게 대조했는지 적어라.

## 무엇을 검증하는가

Claude가 2026-08-26에 쓴 `docs/ADR.md`의 **ADR-032 §3 분해 수식**과 그 전제.
다음 스텝이 이 수식을 그대로 구현하고 골든의 근거로 쓴다 — 수식이 틀리면
골든이 틀린 값을 고정하므로 **구현 전에** 반증을 시도한다.

## 방법

1. **수식 전수 반증** — 스크래치 스크립트로 s, c, e ∈ [0, 12]³ 전수 검사:
   - 각 항이 음수가 되는 조합이 있는가
   - 편측근(始端定着)과 편측근(終端定着)이 동시에 양수인 조합이 있는가
   - 불변식 셋이 깨지는 조합이 있는가:
     s ＝ 通し＋始端스텁＋편측(始) ／ c ＝ 通し＋中央＋편측(始)＋편측(終) ／
     e ＝ 通し＋終端스텁＋편측(終)
   - s＝e에서 현행 `splitGirderMainRow`(`src/domain/model/member.ts`)와
     동치인가: 通し＝throughCount이고, cutoffAt이 '端部'면 両스텁＝cutoffCount·
     中央筋＝0, '中央'이면 中央筋＝cutoffCount·両스텁＝0, 편측근＝0
2. **물리성**: 분해가 낳는 각 그룹이 연속한 한 구간의 본인가 — 「始端과 終端에는
   서는데 中央에 없는 한 본」 같은 비연속 항이 수식에서 나올 수 있는가
   (나온다면 반증. 예: s=6, c=4, e=9 가 両스텁 2·5로 갈라지는지, 아니면
   비연속 항이 생기는지)
3. **실물 전제 반증** — `tests/fixtures/section-import/textitems/yokohama-p14.json`
   원시 TextItem 재구성으로 ADR-032가 인용한 값 확인: G51 R階 上筋 8／8／13·
   下筋 8／8／11, G55 R階 上筋 4／5／8·下筋 4／5／5 (혼합형이 실물에 실재하는가)
4. ADR-032의 사실 주장 중 코드로 확인 가능한 것 — 예: 「기존 직렬화 그대로
   읽힌다」(`src/domain/model/project.ts`의 `isMainRow`가 startCount 없는
   레코드를 지금도 통과시키는가), 「현행 min/差 분해도 같은 해석을 암묵으로
   쓰고 있었다」

## 하지 말 것

- `docs/ADR.md`·`src/**`·`tests/**`를 수정하지 마라.
- 스크래치 스크립트를 레포에 남기지 마라 (커밋 금지 — /tmp 또는 node 원라이너).
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## 산출물

`phases/20-girder-end-asymmetry/step0-report.json`:

```json
{
  "checks": [{ "what": "...", "range": "...", "counterexamples": [] }],
  "verdict": "refuted | upheld",
  "summary": "index.json summary와 같은 요지"
}
```
