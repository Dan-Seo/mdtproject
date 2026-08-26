# Step 1: 좌우 비대칭 칸을 후보로 담는다 — 골든 갱신 먼저

**전제**: step 0은 `refuted`로 끝났고(무정규화 전제의 반례), 저자가
`docs/ADR.md`의 ADR-033에 정정 주석(2026-08-26)을 달아 해소했다 — §2의
자동 대응은 「같은 `compact` 정규화를 지난 문자열끼리의 정확 일치」다.
이 반증은 닫혔으므로 이 스텝은 진행하라. **새로운** 반증 사유를 발견하면
`blocked`로 멈추고 사유를 적어라.

## 배경

`docs/ADR.md`의 ADR-032·ADR-033을 읽어라. 파서(`src/lib/import/section-list/
parse.ts`)의 `positionalGirderMain`은 좌우 다른 端部를
`主筋端部左右相違`로 거부한다. ADR-032로 모델이 비대칭을 담게 됐으므로,
이제 후보가 값을 실을 수 있다 — 단 **라벨은 원문 그대로**다 (ADR-033 §1).

## 할 일

1. **골든 갱신 먼저 (TDD)** — `tests/section-import/parse.test.ts`의 p14 대조에서
   바뀌는 것은 정확히 이것뿐이다:
   - G51 R階·G55 R階(비대칭 4칸×상하)가 `主筋端部左右相違`+빈칸 → **위치별
     본수＋원문 라벨 확정**으로 바뀐다. 기대값은
     `tests/fixtures/section-import/expected/yokohama-kanazawa-p14-girders.json`의
     전사(上筋 外端8/中央8/内端13 등)와 라벨 그대로다.
   - G51 R階의 カットオフ 「[2500]」이 `cutoffFromSupportFaceMm` 후보 2500으로
     확정된다 (内端 열 단독 — ADR-033 §4).
   - 확정 칸 수 핀을 그만큼 올린다. **그 외 기존 골든 기대값 수정 금지** —
     더 바꿔야 통과한다면 `blocked`로 멈추고 사유를 적어라.
   - expected 전사 파일은 수정하지 마라.
2. **`SectionCandidate.girderMain` 확장** (`types.ts`): 기존 대칭 필드는
   그대로 두고, 비대칭일 때만 갖는 형태를 더하라 —
   `asymmetricEnds?: { labels: [string, string], topCounts?: [number, number],
   bottomCounts?: [number, number] }` (labels는 표의 왼쪽 端·오른쪽 端 순,
   도면 원문). 상하 중 한쪽만 비대칭인 표도 담을 수 있어야 한다.
   `cutoffFromSupportFaceMm?: number`도 더하라.
3. **파서**: `positionalGirderMain`에서 좌우가 다르면 거부 대신 위 형태로
   확정하라. 단 —
   - 径이 전 칸에서 하나가 아니면 기존대로 미확정.
   - 위치 라벨이 셋(端·中央·端)이 아닌 표는 비대칭 확정을 시도하지 마라.
   - カットオフ 치수가 좌우 다르면 빈칸+원문 (ADR-033 §4).
   - `主筋端部左右相違` 이슈 코드는 「径 불일치 등으로 비대칭조차 확정 못 한」
     잔여 경로가 있으면 남기고, 전혀 안 쓰이게 되면 코드·locale에서 제거하라
     (이 변경이 만든 고아만).
4. 기존 대칭 표의 출력은 바꾸지 마라 — 기존 골든이 보증한다.

## 하지 말 것

- `src/components/**` 수정 금지 — step 2다.
- `src/domain/**` 수정 금지 — 모델은 phase 20이 끝냈다.
- expected 전사 파일 수정 금지.
- 배근 규준 수치 금지.
- `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.
- p14 골든이 비대칭 4칸×상하의 본수·라벨·カットオフ 2500을 절대값으로 핀하고,
  라벨을 뒤집거나 값을 지어내면 실패한다.
- 확정 칸 수 핀 갱신 포함. 기존 대칭 경로 출력 불변.

## 산출물

`phases/21-asym-import/step1-report.json`: 새로 확정된 칸 목록(부재·행·값·라벨),
바뀐 골든 핀 수, 잔여 `主筋端部左右相違` 경로 유무.
