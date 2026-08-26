# Step 0 (kind: verify): ADR-033의 전제를 반증하라

**이 스텝은 검증 전용이다. 대상을 고치지 마라.**
반증이 성립하면 `"refuted"`가 정상 종결이다 — summary에 요지를 적어라.
전제를 고치는 것은 저자(Claude)의 몫이다. 반증이 서지 않으면 `completed`에
무엇을 어떻게 대조했는지 적어라.

## 무엇을 검증하는가

Claude가 2026-08-26에 쓴 `docs/ADR.md`의 **ADR-033**이 딛고 선 사실 주장 넷.
다음 스텝이 이 전제 위에 취입 경로를 만든다.

## 방법

1. **「始端 ＝ 축 인덱스 낮은 쪽」** — `src/domain/model/project.ts`의
   `girderRun`이 부재를 축 인덱스 오름차순으로 정렬하고, 런의 spans[0]·
   `memberOffsetsMm[0]`이 그 정렬의 첫 부재인지 코드로 확인하라. 내림차순이
   되는 경로(음수 인덱스·역순 배치 등)가 있으면 반증이다.
2. **「Grid 라벨은 도면 원문 그대로」** — 伏図 취입이 `Grid.xLabels`/`yLabels`에
   싣는 값이 파서 산출 원문이고, 어디에서도 정규화·개명하지 않는 것
   (`src/lib/import/framing-plan/**`·적용 경로).
3. **p14 라벨 실재** — `tests/fixtures/section-import/textitems/yokohama-p14.json`
   원시 재구성으로: G51의 위치 라벨이 「外端·中央·内端」, G55가 「Y2端·中央·
   Y3端」, G51 R階의 カットオフ 치수 「[2500]」이 **内端 열에만** 있는 것.
   (G51 2階는 대칭 11/7/11이므로 카ットオフ 치수가 없어도 반증이 아니다.)
4. **軸名 추출의 성립** — 「Y2端」에서 「Y2」를 떼는 규칙(끝의 「端」 제거)이
   p14의 실물 라벨 전부에서 軸名을 낳는지, 「外端」처럼 축 이름이 아닌 라벨과
   구분되는지. p13·p14의 모든 위치 라벨을 나열해 경계 사례(「全断面」 등)를
   report에 적어라.

## 하지 말 것

- `docs/ADR.md`·`src/**`·`tests/**`를 수정하지 마라.
- 스크래치 스크립트를 레포에 남기지 마라.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## 산출물

`phases/21-asym-import/step0-report.json`:
`{ "checks": [...], "verdict": "refuted | upheld", "summary": "..." }`
