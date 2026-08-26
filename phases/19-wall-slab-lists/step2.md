# Step 2: 취입 화면 반영 — 耐震壁・床板 후보를 断面一覧으로

## 배경

step 1이 壁·スラブ 후보를 낸다. 취입 화면(`src/components/section/
SectionImport.tsx`)은 `ImportableSection = ColumnSection | GirderSection`으로
막혀 있고, 그 주석의 이유(「壁リスト는 아직 파싱하지 않으므로」)는 step 1로
사라졌다. 이 스텝이 반영 경로를 연다.

## 할 일

1. `ImportableSection`에 `WallSection`·`SlabSection`을 추가하고 낡은 주석을
   정정하라. 매칭 키 (符号, 部材, 階)는 그대로다 — 이번 두 리스트에는 階 열이
   없으므로 storyLabel 없는 매칭이 그대로 성립해야 한다.
2. `missingParsedFields` 확장 — 신규 符号 반영 허용 조건:
   - 耐震壁: thickness·layers·vertical·horizontal 전부 파싱됨
   - 床板: thickness와 短辺·長辺×上·下 4칸 전부 파싱됨, **그리고 방향 선택
     완료** (아래 3)
3. **슬래브 방향은 사용자가 고른다**: 후보의 값은 短辺/長辺인데 `SlabSection`은
   x/y다. 취입 화면의 床板 후보 행에 「短辺=X方向 / 短辺=Y方向」 선택을 두고,
   **기본은 미선택·미선택이면 반영 불가**로 하라. 자동으로 한쪽을 고르면 도면에
   없는 방향을 제품이 만드는 것이다 (ADR-004와 같은 원리). 선택 문구는 기존
   locale 문자열 체계에 추가하라.
4. `applyParsedFields` 확장 — 기존 규칙 그대로: 기존 Section에는 파싱된 칸만
   덮고 빈칸은 기존값 유지. 신규 Section의 나머지 필드(fc·grade·exposure·
   finish·spliceMethod·startOffsetMm 등)는 기존 신규 생성 흐름의 기본값 정책을
   따르라 — 새 정책을 발명하지 마라.
5. 테스트: 반영 로직 단위 테스트를 기존 관례대로. 최소한 —
   - 방향 미선택 床板 후보는 반영 불가, 선택하면 短辺 값이 고른 축(x 또는 y)에
     실리고 長辺 값이 반대 축에 실린다 (뒤집힘 회귀)
   - 빈칸 있는 신규 벽 후보(EW15 — 두께 미확정)는 반영 불가
   - 기존 WallSection에 벽 후보를 반영하면 파싱된 칸만 바뀐다
6. 대장 갱신: `CLAUDE.md`·`AGENTS.md`의 「부재 확장(耐震壁·床板)」 행에서
   「壁リスト·スラブリスト 파서」를 빼고, 도면 인식 트랙 잔여에 「주기형(스케치
   인출선) 壁リスト 미지원」을 반영하라 — 표의 다른 행과 길이·어투를 맞춰라.
   `docs/RISKS.md` R10에 주기형 壁リスト(yokohama-p15)가 표 파서 범위 밖임을
   한 줄 추기하라.

## 하지 말 것

- `src/domain/**` 수정 금지.
- 파서(step 1 산출)를 이 스텝에서 고치지 마라 — 반영에서 파서 결함을 발견하면
  `blocked`로 멈추고 사유를 적어라.
- 사용자 도면 데이터를 서버로 보내는 코드를 만들지 마라 (전부 브라우저).
- 브라우저 e2e(uc12) 확장은 하지 않는다 — 별건이다. 검증은 단위 테스트로.
- `scripts/execute.py`를 실행하지 마라 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- 위 5의 세 회귀 테스트가 존재하고, 구현을 흔들면(예: 방향 매핑을 뒤집으면)
  실패한다.
- 대장·R10 갱신 포함.

## 산출물

`phases/19-wall-slab-lists/step2-report.json`: 추가한 반영 경로 요약,
방향 선택 UI 문구(locale 키), 갱신 파일 목록.
