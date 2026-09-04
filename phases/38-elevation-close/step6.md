# Step 6: 이 phase의 산출을 반증하라 (검증 전용·게이트)

step 1〜5는 codex가 만든 것이다. 만든 쪽이 자기 것을 승인하지 않는다 — 여기서는
**통과를 확인하지 말고 반증을 시도하라.** 반증이 성립하면 고치지 말고 `refuted`로 끝낸다.

## 반증 항목

1. **사양 위반** — `git diff main...HEAD`에서 ① 도면·발주처·시트 이름으로 갈라지는 조건,
   ② 골든·픽스처 편집, ③ 사양에 없는 새 상수, ④ `process.env` 잔재, ⑤ 사양이 금지한 파일
   변경이 있는가.
2. **골든 변조** — `tests/fixtures/plan-import/expected/`의 골든 값(라벨 문자열·階高·스팬)을
   한 칸씩 바꾸면 대응 테스트가 실패하는가. tsu-p21·tsu-p22·hirosaki·karatsu에서 각 4건 이상
   변조하고 전부 실패를 확인한 뒤 원복하라. 실패하지 않는 칸이 하나라도 있으면 반증 성립이다.
3. **회귀 범위** — main 대비 36면 스윕에서 변한 면이 **tsu-p21·tsu-p22 둘뿐**인가.
   다른 면이 변했으면 그 면·계열·값을 적어라(반증 성립).
4. **기존 14면** — `tests/plan-import/parse.test.ts`·`tests/section-import/parse.test.ts`의
   기존 기대가 그대로인가(伏図 격자·断面リスト는 이 phase의 대상이 아니다).
5. **상수 유래** — `SHORT_DIMENSION_SCALE_TOLERANCE_RATIO`가 실측 최댓값에 붙어 있지 않은가.
   0.45·0.5·1.0·5.0·20.0에서 36면 출력 해시를 직접 재보고, step 3 report의 무차별 구간 주장이
   맞는지 확인하라. 틀리면 반증 성립.
6. **테스트가 파서에 맞춰졌는가** — `toHaveLength(리터럴)`, 하드코딩 라벨 문자열,
   `parsed[i]`→`golden[j]` 재배치 배열, 원하는 라벨만 남기는 필터가 있는가.
7. **순서 대응 규칙의 반례** — 라벨↔레벨 대응에서 ① yokohama-p8·p9의 `["中央棟1FL","基準GL"]`
   겹침이 유지되는가, ② karatsu-jikugumi1·2의 `GL`이 살아 있는가, ③ 합성 items로 라벨이
   레벨보다 많은 경우·적은 경우를 만들어 값을 지어내지 않는지 확인하라.
8. **lint·typecheck·전체 테스트**를 돌리고 결과를 적어라. (`next dev`가 떠 있는 채로
   `npm run build`를 돌리지 마라 — `.next`가 덮인다.)

## 산출

`phases/38-elevation-close/step6-report.json` — 항목별 `holds`(반증 성립 여부)·증거.
하나라도 반증이 성립하면 스텝 status는 `refuted`(게이트라 step 7이 막힌다).

## 하지 말 것

- 제품 코드·테스트·골든을 고치지 마라. 반증이 성립하면 **그대로 두고** 무엇이 어긋났는지 적어라.
- 임시 변조는 반드시 원복하라. 커밋은 report 하나뿐이다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.
