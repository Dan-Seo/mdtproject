# Step 2: 취입 반영과 断面一覧 편집 — R13을 닫는다

## 배경

step 1의 비대칭 후보를 `GirderSection.main.top/bottom.startCount`로 잇는다.
방향 결정은 ADR-033 §2다 — 通り芯형 정확 일치만 자동, 그 외는 사용자 선택,
기본 미선택=반영 불가. 슬래브 短辺=X/Y(phase 19)와 같은 규율이고, 그 구현
(`SectionImport.tsx`의 slabDirection 상태·select·미선택 gating)을 관례로 따르라.

## 할 일

1. **취입 반영** (`src/components/section/SectionImport.tsx`):
   - 소비 대상은 step 1의 `girderMainAsymmetric` 필드다 — 방향이 정해지면
     labels/topCounts/bottomCounts/中央 값으로 `GirderMainRow`(startCount·
     endCount·centerCount)를 조립한다.
   - 비대칭 후보 행에 방향 결정을 더하라:
     - **자동**: 두 端 라벨이 「〈軸名〉端」이고 軸名 둘이 `project.grid`의
       같은 축 라벨(`xLabels`/`yLabels`)에 정확히 존재하면 축 순서로 결정.
       비교는 양변을 같은 `compact()` 정규화(ADR-033 정정 주석)로 하라
       (始端=인덱스 낮은 쪽). 근거 문구를 행에 표시하고, 사용자가 select로
       뒤집을 수 있게 하라 (ADR-033 §3).
     - **수동**: 그 외(「外端/内端」 포함)는 「〈라벨〉=始端 / 〈라벨〉=終端」
       select. 기본 미선택이면 반영 불가.
   - `missingParsedFields`·`applyParsedFields`·`applyCandidate` 확장:
     방향이 정해진 비대칭 후보는 `startCount`(始端側)와 `endCount`(終端側)·
     `centerCount`를 채우고, 대칭 후보는 기존 경로 그대로.
     `cutoffFromSupportFaceMm` 후보가 있으면 기존 칸 규칙(파싱된 칸만 덮기)
     으로 반영하라.
   - locale 문구는 기존 체계(`sectionImport.*`)에 추가하라 (ja·ko).
2. **断面一覧 편집** (`src/components/section/SectionTable.tsx`):
   - `GirderMainCountInput`의 端部 자리를 비대칭이 입력 가능하게 넓혀라 —
     행마다 「左右で違う」 전환을 두고, 대칭이면 지금처럼 端部 하나,
     비대칭이면 始端·終端 둘을 편집한다. 비대칭→대칭 전환은 `startCount`
     삭제, 대칭→비대칭 전환은 `startCount`를 `endCount`로 초기화해 시작하라
     (값을 지어내지 않는다 — 기존값 복제일 뿐).
   - 표시·라벨은 기존 폼 관례(NumberInput·sectionMarkLabel)를 따르라.
3. **테스트** — 기존 관례대로. 최소한:
   - 通り芯형(Y2端/Y3端) 후보: grid에 Y2·Y3 라벨이 있으면 자동 결정되어
     Y2端 값이 `startCount` 쪽에 실린다. 라벨 순서를 뒤집은 grid에서는 반대로
     실린다 (자동 대응 회귀).
   - grid에 라벨이 없으면 미선택=반영 불가, 선택하면 고른 쪽이 始端에 실린다.
   - 「外端/内端」 후보는 자동 결정되지 않는다.
   - 断面一覧에서 비대칭 전환·입력·대칭 복귀가 `startCount`를 위 규칙대로
     넣고 지운다.
4. **대장 갱신**: `CLAUDE.md`·`AGENTS.md`의 R13 행과 도면 인식 트랙 잔여에서
   「좌우 상이 8칸(R13)」을 정리하고, `docs/RISKS.md` R13을 **해소**로 옮겨라
   — 잔여(다스팬×비대칭은 의도적 불성립, カットオフ 좌우 상이 치수 미지원,
   nesting 해석의 R2)를 남겨 적는 것 포함. 어투·길이는 다른 행과 맞춰라.

## 하지 말 것

- `src/domain/**` 수정 금지 — 모델·산정은 phase 20이 끝냈다. 파서(step 1
  산출)도 이 스텝에서 고치지 마라 — 결함을 발견하면 `blocked`.
- 建物 外/内 추정 등 라벨 자동 해석을 넓히지 마라 — 정확 일치 자동뿐이다.
- 사용자 도면 데이터를 서버로 보내는 코드를 만들지 마라.
- 브라우저 e2e 확장은 하지 않는다 — 검증은 단위 테스트로.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- 위 3의 회귀 테스트가 존재하고, 자동 대응의 축 순서를 뒤집으면 실패한다.
- 대장·R13 갱신 포함.

## 산출물

`phases/21-asym-import/step2-report.json`: 방향 결정 경로 요약(자동/수동 각각),
locale 키, 갱신 파일 목록.
