# Step 1: axis 블록을 테스트가 청구하게 하라 (골든 상호검증)

## 배경

`tests/fixtures/plan-import/expected/*-elevation.json`의 `elevations[].axis`
(通り芯 라벨·`spansMm`·`totalMm`, phase 36에서 전사)를 **아무 테스트도 읽지 않는다.**
확인된 사실 둘:

- `rg -n "spansMm|\.axis" tests/plan-import/corpus2-elevation.test.ts tests/plan-import/elevation.test.ts` → 0건
- `rg -n "axis|spansMm" src/lib/import/framing-plan/elevation.ts` → 0건 (파서가 만들지 않는다)

즉 30여 개의 전사 숫자가 **청구되지 않은 기대값**으로 앉아 있었고, 실제로 그 안에
결함이 하나 있었다(step 0에서 재현한 tsu 라벨 누락).

## 방침 — 파서에 axis를 만들게 하지 마라

軸組図 면에서 通り芯 격자를 뽑는 것은 **R15가 「부분 격자 오탐」으로 억제 중인 대상**이다.
이 phase는 파서를 늘리지 않는다. `axis`는 **전사 상호검증용 기준 데이터**로 청구한다 —
같은 건물의 伏図 격자 골든과 대조해, 두 전사 중 하나가 틀리면 실패하게 만든다.
이 대조는 실제 결함을 잡는다: 수정 전 tsu 값에 대해 아래 불변식 1이 실패한다.

## 할 일

`tests/plan-import/corpus2-elevation.test.ts`에 다음을 더하라 (새 파일을 만들어도 좋다).

1. `ElevationFixture` 타입에 `axis?: { labels: string[]; spansMm: number[]; totalMm: number | null }`를
   선언하라. 지금은 타입에 없어서 골든의 그 블록이 조용히 무시된다.

2. **불변식 1 — 자기 정합성.** `tests/fixtures/plan-import/expected/` 아래 **모든** 골든의
   모든 axis 블록(elevation의 `elevations[].axis`, grid의 `blocks[].x`·`blocks[].y`)에 대해
   - `labels.length === spansMm.length + 1`
   - `totalMm`이 `null`이 아니면 `sum(spansMm) === totalMm`
   골든 목록은 디렉터리를 읽어 만들어라. **파일명을 손으로 나열하지 마라** — 골든이 늘면
   자동으로 대상이 되어야 한다.

3. **불변식 2 — 같은 건물 伏図 격자와의 상호검증.** 아래 대응표를 테스트 안에 두고,
   각 elevation의 axis가 대응 grid 축의 **부분열**임을 확인하라.

   | elevation 골든 | grid 골든 | 축 |
   |---|---|---|
   | `hirosaki-kikyono-p25-elevation.json` | `hirosaki-kikyono-p21-grid.json` | `y` |
   | `tsu-kanritou-p21-elevation.json` | `tsu-kanritou-p16-grid.json` | `x` |
   | `karatsu-jikugumi1-p1-elevation.json` | `karatsu-fukuzu-p1-grid.json` | `y` |

   판정 규칙(그대로 구현하라):
   - grid 축을 **정방향 또는 역방향** 중 하나로 본다. 伏図와 회전된 軸組図는 페이지 순서가
     서로 뒤집혀 나타난다(ADR-030·`kijun-golden-axis-page-order`). 한쪽이라도 맞으면 통과다.
   - elevation의 `labels`는 그 방향의 grid `labels`의 **순서를 지키는 부분열**이어야 한다.
     (군데군데 축을 건너뛴다 — karatsu X3通り은 `Y3`에서 `Y6`으로 뛴다.)
   - 인접한 두 elevation 라벨 사이의 `spansMm[i]`는, grid에서 그 두 라벨 사이에 있는
     스팬들의 **합**과 같아야 한다. (karatsu `Y3→Y6` = 4069+1806+2204 = 8079)

4. **phase 38이 남긴 미청구 필드도 함께 청구하라.** phase 38 step 5가
   `ElevationFixture`에서 `levelsBottom`·`heightsBottomMm`를 지웠는데
   (전 계열을 대조하게 바뀌었으므로), 그 필드는 `tsu-kanritou-p21-elevation.json`에
   **아직 남아 있다.** 즉 `axis`와 같은 종류의 미청구 기대값이 이번 phase 직전에
   하나 더 생겼다. 골든에서 지우지 말고 **청구하라**:
   `levelsBottom`이 있으면 `levels`의 **꼬리**와 같아야 하고,
   `heightsBottomMm`이 있으면 `heightsMm`의 꼬리와 같아야 한다.
   (`levelsBottomNote`는 주석이므로 step 2의 `REFERENCE_ONLY`다.)

5. `axis`가 없는 elevation 항목(`tsu-kanritou-p21-elevation.json`의 두 번째,
   `tsu-kanritou-p22-elevation.json`의 둘)은 **건너뛰되, 건너뛴 개수를 assert하라** —
   미전사가 조용히 늘지 않게. 지금 값은 3이다(직접 세어 확인하고, 다르면 그 수를 쓰되
   report에 왜 다른지 적어라).

## 하지 말 것

- `src/`를 고치지 마라. 파서에 `axis`·`spansMm`를 만들지 마라.
- **골든(`tests/fixtures/**`)을 고치지 마라.** 골든은 Claude의 원본 전사다.
  대조가 실패하면 테스트를 골든에 맞추지 말고 `blocked`로 멈추고 무엇이 어긋났는지 적어라.
- 기대값을 테스트 파일에 리터럴로 박지 마라. 두 골든을 읽어 서로 대조하는 것이 전부다.
- `toHaveLength(...)`만으로 대조를 때우지 마라 — 값이 틀려도 통과한다.
- `scripts/execute.py`를 실행하지 마라. 하네스 프로세스를 죽이지 마라.

## AC

- `npx vitest run tests/plan-import/` 통과, 이어서 `npx vitest run` 전체 통과.
- `npm run lint`·`npx tsc --noEmit` 통과.
- **반증 가능성 실측.** 임시로 골든을 변조해 새 테스트가 **실제로 실패하는지** 재라.
  대상은 아래 **실재하는** 경로뿐이다 (다른 이름을 쓰지 마라):
  - `tests/fixtures/plan-import/expected/tsu-kanritou-p21-elevation.json`
  - `tests/fixtures/plan-import/expected/hirosaki-kikyono-p25-elevation.json`
  - `tests/fixtures/plan-import/expected/karatsu-jikugumi1-p1-elevation.json`
  변조는 두 종류를 각각 하라: ① `axis.spansMm`의 한 칸 `+1`, ② `axis.labels`의 한 개 삭제.
  `step1-report.json`의 `mutations` 배열에 `{ "file", "json_pointer", "before", "after",
  "exit_code", "failing_test" }`를 적고, **모두 원복한 뒤** `git diff -- tests/fixtures`가
  비었음을 `restoration.diff_empty`에 적어라.
- report에 `skipped_axis_count`(위 4항의 실측값)를 적어라.
