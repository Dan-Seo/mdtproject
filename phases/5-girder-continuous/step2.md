# Step 2: viewer-run

도메인과 내역서가 런 단위로 돌기 시작했다. 이 step은 3D가 그것을 그대로 비추게 한다.
지금 화면에서 비어 있는 것은 連続スパン 大梁이고, 사용자가 「빠졌다」고 보는 부분이다.

## 읽어야 할 파일

- `src/components/viewer/Viewer3D.tsx` — `selectedMemberView`, `memberBounds`,
  `concreteBoxes`, `geometryKey`, 미지원 표시 경로, 建物 뷰 인스턴싱 루프
- `src/components/viewer/building.ts` · `building.test.ts` — 로컬→월드 매핑,
  `groupInstancesByRadius`
- `src/components/viewer/geometry.ts` · `geometry.test.ts` — 전개·zone 배칭
- `src/domain/model/project.ts` — step 0의 `girderRun`
- `docs/DESIGN.md` §7 — 좌표계 규약

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경 — 좌표계는 이미 맞다

生成器의 大梁 로컬 x 원점은 「런 시작 柱의 내측면」이다. 建物 뷰 매핑
(`X=[start.x+face+x, …]`)은 런 대표 부재의 시작점을 쓰므로 通し筋이 런 끝까지
뻗어도 **매핑식은 그대로 성립한다**. 새 매핑을 만들지 마라. 확인하고 넘어가라.

あばら筋은 각 부재에 귀속되므로 지금처럼 그 부재의 시작점으로 매핑된다.

## 작업

TDD로 진행하라. 테스트를 먼저 쓰고 구현하라.

### 1. `girderSupport` 호출부 제거 (step 0에서 시작한 것을 끝낸다)

`building.ts`의 미지원 대梁 건너뛰기, `Viewer3D.tsx`의 미지원 판정에서
`girderSupport` 호출을 없앤다. 미지원 여부의 유일한 출처는 `useTakeoff`가 모은
`unsupportedMembers`다 — 산정이 실패한 부재와 3D가 비는 부재가 갈리면 안 된다.

`building.ts`가 순수 함수라면 미지원 `memberId` 집합을 **인자로 받아라.**
모듈 안에서 다시 산정하지 마라.

### 2. 部材 뷰 — 런 전체를 보여준다

連続スパン의 한 스팬을 클릭하면 그 런 전체가 보여야 한다. 通し筋이 런 길이라
스팬 하나만 그리면 철근이 상자 밖으로 튀어나간다.

- `selectedMemberView`(大梁)는 부재가 아니라 **런**을 담아라. 런의 어느 부재를
  선택하든 같은 뷰가 나온다.
- `memberBounds`: 축 방향 길이는 `run.coreLengthMm`.
- `concreteBoxes`: 스팬마다 大梁 상자 + 지점 柱 스텁. **중간 柱도 스텁으로 그려라** —
  通し筋이 무엇을 관통하는지가 이 뷰의 요점이다.
- 표시 행(`rows`)은 런에 속한 **모든 부재**의 내역 행을 모아라. 通し筋 행은 런
  대표 부재에, あばら筋 행은 각 부재에 붙어 있다.
- `geometryKey`에 런 구성(부재 수·`coreLengthMm`)을 포함시켜라. 빠뜨리면 스팬이
  늘거나 줄어도 씬이 다시 그려지지 않는다. **이 PR 에서 같은 누락이 major 로
  한 번 나왔다 — 새 필드를 추가하면 키에 넣었는지 반드시 확인하라.**

### 3. 建物 뷰

- 미지원 필터를 `unsupportedMembers` 기반으로 바꾼 뒤, 連続スパン 大梁의 철근이
  실제로 인스턴스에 실리는지 확인하라.
- 通し筋은 런 대표 부재 하나에서 나오므로 인스턴스 수가 스팬 수만큼 늘지 않는다.
  그것이 맞다 — 관통하는 철근은 한 벌이다.

### 4. PR #10 리뷰 잔여 지적 2건 (이 step이 같은 코드를 건드린다)

**(a) 지점 柱 스텁이 大梁 윗면 위로 튀어나온다** — `concreteBoxes`가 스텁을 大梁
중앙 높이에 대칭 배치해 柱가 층 상단보다 `depth/2` 만큼 위로 그려진다. 建物 뷰의
柱 박스(`elevation..elevation+height`)와 같은 부재가 다른 형상으로 보인다.
스텁 상단을 大梁 상단(＝スラブ레벨＝층 상단)에 맞춰라:

```ts
const stubHeight = Math.min(story.height, section.depth * 2)
const stubCenterY = section.depth - stubHeight / 2
```

step 0에서 `girderSupportSections`로 바뀐 지점 치수 파생과 함께 처리하라.
런에서는 중간 柱 스텁에도 같은 높이 규칙을 적용한다.

**(b) `groupInstancesByRadius` 이름·주석이 실제와 어긋난다** — 그룹 키는 이미
`radius|layer`인데 이름은 반경만 말하고, 주석은 이미 구현된 레이어 토글을
「다음 step」이라고 가리킨다. `groupInstancesByLayerAndRadius`로 고치고 주석을
현재 사실로 바꿔라. 호출부(`Viewer3D.tsx`, `building.test.ts`)도 함께.

### 5. 테스트

`Viewer3D.test.tsx`:
- 「連続スパン 大梁을 선택하면 미지원 표시」 테스트는 **전제가 뒤집혔다.** 지우지 말고
  「런 전체가 그려진다」로 다시 써라.
- 런 중간 스팬을 선택해도 런 시작 스팬을 선택한 것과 같은 `geometryKey`가 나온다.
- 미지원 大梁(定着不成立 등)은 여전히 미지원 표시가 뜬다 — 미지원 경로 자체가
  사라지면 안 된다.

`building.test.ts`:
- 連続スパン 大梁의 철근 인스턴스가 존재하고 월드 좌표가 런 끝까지 뻗는다
- 미지원 부재는 콘크리트만 남고 철근 인스턴스가 없다

`geometry.test.ts`:
- 通し筋의 전개가 런 길이를 따르고 본수·간격은 단면 입력 그대로다

지점 스텁 높이:
- 스텁의 상단 y가 `section.depth`(大梁 상단)와 같다 — 部材 뷰와 建物 뷰가 같은
  부재를 같은 형상으로 그린다는 보증이다

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `npm run dev` 후 브라우저에서 직접 확인한다:
   - 建物 탭에서 **모든** 大梁에 철근이 보이는가? (전에는 Y방향이 외형선뿐이었다)
   - Y방향 大梁을 클릭하면 部材 뷰에 2스팬 + 중간 柱가 보이고 通し筋이 관통하는가?
   - 중간 접합부에 定着 색 구간이 **없는가**? (있으면 R7② 이중 계상이 되살아난 것)
   - 레이어 토글·단면 컷·호버 툴팁·범례가 그대로 도는가?
3. `phases/5-girder-continuous/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 런 뷰 구성·`geometryKey` 확장 항목·
     미지원 판정 출처 일원화를 적어라
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - 진행 불가 → `"status": "blocked"` + `"blocked_reason"`

## 금지사항

- **미지원 판정을 뷰어에서 다시 계산하지 마라.** 이유: 두 벌이 되면 内訳는 미지원인데
  3D는 지원으로 보이는 상태가 생긴다 — 이 PR 에서 실제로 났던 결함이다.
- **建物 뷰 매핑식을 새로 만들지 마라.** 이유: 기존 식이 런에도 그대로 성립한다.
- **`geometryKey`에 새 필드를 빠뜨리지 마라.** 이유: 같은 실수가 이미 major 로 나왔다.
- **domain points 를 뷰어에서 변형하지 마라.** 이유: 표시 과장은 반경·배치에만 (DESIGN §7).
