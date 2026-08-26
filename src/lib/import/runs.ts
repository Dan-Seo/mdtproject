import type { TextItem } from '@/lib/import/types'

export interface TextSegment {
  text: string
  compact: string
  /** 이 세그먼트를 이룬 문자들(x 오름차순). 붙어버린 토큰을 실좌표로 되가를 때 쓴다 */
  items: TextItem[]
  x: number
  endX: number
  centerX: number
  /**
   * 세그먼트 자신의 글리프만으로 잰 세로 중심(pt). row.y・row.height(행 전체
   * 집계값)를 쓰면 같은 행에 다른 高さ・y의 글자가 섞였을 때 어긋난다 — 항상
   * 이 세그먼트의 값에서 구한다. y는 베이스라인(textitems.ts)이므로 글자 하나는
   * [y-h, y] 구간을 차지한다 — 평균 y에서 최댓값 h의 절반을 빼는 셈법은 서로 다른
   * 글리프의 통계(평균과 최댓값)를 섞어 실제 바운딩 박스와 어긋난다. 그래서
   * top(글자들의 y-h 중 최솟값)・bottom(y의 최댓값)을 직접 재 그 중점을 쓴다.
   */
  centerY: number
}

export interface TextRow {
  y: number
  height: number
  items: TextItem[]
  segments: TextSegment[]
}

/**
 * 세로쓰기(rot=-90) 문자열 하나. y는 바운딩 박스의 세로 중심이다 —
 * TextSegment.centerY와 같은 규약이다(ADR-031④ 「좌표 규약은 한 곳에」).
 * 글자 원점(y)들의 단순 평균이 아니다: rot=-90에서 y는 진행 방향(-y) 기준
 * 뒤쪽 끝(원점)이고, 앞쪽 끝은 자신의 w(진행량)만큼 더 나간 y-w다
 * (textitems.ts: directionY=-1이므로 다음 글자의 y는 이 글자의 y-w) —
 * makeSegments의 endX가 x+w로 앞쪽 끝을 구하는 것과 같은 셈이다. 원점만
 * 평균 내면 마지막 글자 폭의 절반만큼 중심이 뒤(y가 큰 쪽)로 치우친다.
 * 계산은 flush() 참고.
 */
export interface VerticalRun {
  text: string
  x: number
  y: number
}

// 세로 런·행 복원 휴리스틱에서 되풀이되는 리터럴 상수. 흩어져 있으면 R10(포맷
// 커버리지 확대)에서 어느 값을 손봐야 하는지 한 곳에서 안 보인다 (#32④)
/** 회전각 허용오차(deg). 0도(가로)·-90도(세로) 판정 둘 다에 쓴다 */
const ROTATION_TOLERANCE_DEG = 0.01
/** 세로 런에서 같은 열로 보는 x 허용오차(pt) */
const COLUMN_TOLERANCE_PT = 1
/** 행 높이에 곱해 「같은 대역」 상한을 만드는 배수 — 섹션리스트 타이틀 앵커의
 *  같은 행 판정(parse.ts)에 쓴다. 세로 런은 이 값을 쓰지 않는다:
 *  `VERTICAL_RUN_GAP_RATIO` 참고 (#72 🟠) */
export const PROXIMITY_MULTIPLIER = 2

/**
 * 세로 런의 인접 판정 배수. **원점 사이 거리**(`previous.y - item.y`)에 곱한다 —
 * 한 pdf.js 아이템 안의 글자는 이 거리가 구조상 정확히 1w다(`toTextItems`가
 * `y + directionY * characterWidth * index`로 놓고 그 characterWidth를 w로 싣는다).
 *
 * 실측(회전 문자열을 가진 픽스처 3부 ＝ kani-p38·ojkk-p2·ojkk-p3, 같은 열의 인접
 * 307쌍): 토큰 **내부** 간격은 예외 없이 `gap/max(w) = 1.0000` 정확히, 토큰 **사이**의
 * 최솟값은 `2.0000` 정확히다(kani-p38 x≈1625.92의 「150」「50」). 쓸 수 있는 창은
 * 개구간 (1w, 2w)뿐이고 1.5는 그 한가운데 — 양 끝에서 0.5w씩 떨어진다.
 *
 * 옛 기본값 2는 그 창의 **상단 그 자체**라 이 한 쌍이 부동소수 잔차 1 ULP로 갈렸다.
 * 붙는 쪽으로 넘어가면 「150」＋「50」이 「15050」이 되어 DIMENSION을 **통과한다** —
 * 거절이 아니라 날조가 후보 풀에 들어간다(ADR-031 트레이드오프 (4)).
 *
 * 배수를 생략하는 호출부(`parseSectionLists`)도 이 값을 그대로 쓴다. 픽스처 5부의
 * `verticalRuns` 출력은 배수 2와 1.5에서 **완전히 같다**(런 84/19/32/0/0, text·x·y까지
 * 바이트 동일) — 안전한 쪽으로 옮기는 비용이 0이라 두 호출부를 함께 옮겼다.
 * 14면으로 넓혀 같은 열 인접 1,697쌍을 다시 재니 `gap/max(w)` 최솟값은 6자리
 * 반올림 1.000000(원시 0.9999999999999634), 1.5~2.0 구간은 yokohama-p7의
 * 한 쌍뿐이었다. 배수 1.5에서는 `RSL(水下)+300,bY6通り側`와 `RSL(水下)±0`
 * 두 런이고, 2에서는 하나로 붙는다. 숫자 후보를 만들지는 않는 라벨 병합이지만,
 * 1.5를 고른 이유 자체를 넓힌 코퍼스에서도 확인한다.
 *
 * 規準 수치가 아니라 도면 판독 임계값이라 룰팩이 아니라 여기 상수로 둔다.
 */
export const VERTICAL_RUN_GAP_RATIO = 1.5

/**
 * 하이픈류를 半角 '-'로 접는다. CP932 0x815C(全角ダッシュ)의 표준 매핑이 U+2014와
 * U+2015로 갈리므로 둘 다 넣는다 — 실물 도면(yokohama p13)은 U+2015를 쓴다.
 *
 * 長音符(ー U+30FC)는 넣지 않는다. 하이픈이 아니라 가나 글자라서, 접으면
 * 「コンクリート」가 「コンクリ-ト」가 되어 확정하지 못한 셀에 붙이는 원문 참고
 * 표시가 망가진다 — kani p38에 실제로 들어 있다.
 */
export function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[‐‑‒–—―−]/g, '-')
}

export function compact(value: string): string {
  return normalized(value).replace(/\s+/g, '')
}

/**
 * 인접 판정 배수의 기본값. 섹션리스트 파서가 지금까지 이 값으로 동작해 왔고,
 * gapRatio를 생략하는 호출(섹션리스트 쪽)은 전부 이 값을 그대로 쓴다 — 바꾸면
 * 그 파서의 행 나눔이 달라진다.
 */
const DEFAULT_SEGMENT_GAP_RATIO = 2.2

export function makeSegments(
  items: TextItem[],
  gapRatio: number = DEFAULT_SEGMENT_GAP_RATIO,
): TextSegment[] {
  const sorted = [...items].sort((left, right) => left.x - right.x)
  const groups: TextItem[][] = []

  for (const item of sorted) {
    const group = groups.at(-1)
    const previous = group?.at(-1)
    // 문턱은 글자 높이의 배수 하나뿐이다 — 절대 하한(옛 `Math.max(4, …)`)은
    // 두지 않는다. 이유가 둘이다.
    //
    // (1) 어떤 형태로 써도 죽은 가지가 된다. 하한을 gapRatio에 비례시키면
    //     `4*(r/2.2) > min(h)*r ⟺ min(h) < 4/2.2 = 1.8182pt`로 **r이 약분돼**
    //     배수와 무관해지고, 픽스처 5부의 글자 높이는 4.26~14.16pt라 어느
    //     호출부에서도 이기지 못한다. 고정 4pt로 되돌리면 이번엔 반대로
    //     좁힌 배수(0.5)를 h≤8pt 도면에서 통째로 잠식한다.
    // (2) 지킬 것이 있다는 가정 자체가 실측에서 무너진다. 「한 토큰이 여러
    //     pdf.js 아이템으로 쪼개져 작은 절대 간격이 남는」 사례는 코퍼스에
    //     실재한다 — yokohama-p14 y≈315.84의 「650x1000」이 `650`·`x`·`1`·`000`
    //     네 아이템으로 온다. 그런데 **붙여야 할 간격(`1`→`000`)과 갈라야 할
    //     간격(`650`→`x`, `x`→`1`)이 전부 정확히 4.9770pt로 같다.** 어떤 하한도
    //     둘을 가르지 못한다 — 「1000」을 살리는 값은 「x1000」도 함께 만든다.
    //     하한이 지킬 수 있었을 유일한 실물이 원리적으로 지킬 수 없는 것이다.
    //
    // 같은 아이템 안의 글자는 간격이 **정확히 0**이다(toTextItems가
    // `x = 원점 + characterWidth*index`로 놓고 그 characterWidth를 w로 싣는다).
    // 그래서 이 문턱이 가르는 것은 언제나 아이템 **사이**이고, 문턱을 좁혔을 때의
    // 실패는 병합이 아니라 분리 — 지어내지 않고 거절하는 쪽이다.
    const threshold = previous ? Math.min(previous.h, item.h) * gapRatio : 0

    if (!group || !previous || item.x - (previous.x + previous.w) > threshold) {
      groups.push([item])
    } else {
      group.push(item)
    }
  }

  return groups.map((group) => {
    const text = group.map((item) => item.str).join('')
    // 세그먼트의 바운딩 박스로 x·endX·centerY를 잰다(y는 베이스라인이라 글자
    // 하나는 [y-h, y] 구간). spread(Math.min(...)/Math.max(...))는 안 쓴다 —
    // 인자 수가 글리프 수를 그대로 따라가 스택 한도에서 RangeError가 된다
    // (verticalRuns의 flush()와 같은 이유. x·endX는 한 번 이 이유로 고쳐진
    // centerY 옆에 spread인 채로 남아 있었다 — #32 이월 지적 (b)).
    let x = Number.POSITIVE_INFINITY
    let endX = Number.NEGATIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const item of group) {
      if (item.x < x) x = item.x
      if (item.x + item.w > endX) endX = item.x + item.w
      if (item.y - item.h < top) top = item.y - item.h
      if (item.y > bottom) bottom = item.y
    }
    return {
      text,
      compact: compact(text),
      items: group,
      x,
      endX,
      centerX: (x + endX) / 2,
      centerY: (top + bottom) / 2,
    }
  })
}

export function recoverRows(items: TextItem[], gapRatio?: number): TextRow[] {
  const rows: Array<Omit<TextRow, 'segments'>> = []
  const horizontalItems = items
    .filter(
      (item) =>
        item.str.trim().length > 0 &&
        (item.rot === undefined || Math.abs(item.rot) < ROTATION_TOLERANCE_DEG),
    )
    .sort((left, right) => left.y - right.y || left.x - right.x)

  for (const item of horizontalItems) {
    let closest: Omit<TextRow, 'segments'> | undefined
    let closestDistance = Number.POSITIVE_INFINITY

    for (const row of rows) {
      const distance = Math.abs(row.y - item.y)
      const tolerance = Math.max(1, Math.min(row.height, item.h) * 0.3)
      if (distance <= tolerance && distance < closestDistance) {
        closest = row
        closestDistance = distance
      }
    }

    if (closest) {
      closest.items.push(item)
      closest.y =
        closest.items.reduce((total, rowItem) => total + rowItem.y, 0) /
        closest.items.length
      closest.height = Math.max(closest.height, item.h)
    } else {
      rows.push({ y: item.y, height: item.h, items: [item] })
    }
  }

  return rows
    .sort((left, right) => left.y - right.y)
    .map((row) => ({ ...row, segments: makeSegments(row.items, gapRatio) }))
}

/**
 * 세로쓰기 문자열을 복원한다. `recoverRows`는 회전 아이템을 버린다 — 가로 행 복원에
 * 섞이면 행이 오염되기 때문이다. 그 결과 스케치 옆에 세로로 적힌 치수가 통째로 보이지
 * 않는데, 断面 라벨 행이 없는 표에서는 그것이 d의 유일한 근거다 (ojkk 柱リスト).
 *
 * rot=-90만 받는다. 읽기 순서가 y 내림차순인 것은 실물에서 확인한 값이고, 다른
 * 회전각은 순서가 뒤집힐 수 있다 — 「700」이 「007」이 되면 조용히 틀린 값이 된다.
 * 회전 텍스트에서 w는 가로 폭이 아니라 글자 진행량이므로 세로 간격으로 쓴다.
 *
 * `originGapRatio`는 인접 판정 배수이지만 **makeSegments의 `gapRatio`와 재는 대상이
 * 다르다**: makeSegments는 진행량을 뺀 여백(`x - (previous.x + w)`)에 곱하고, 여기서는
 * 원점 사이 거리(`previous.y - y`)에 곱한다. 그래서 같은 수를 넣어도 같은 뜻이 아니고
 * — 토큰 내부 간격이 가로에서는 거의 0인데 세로에서는 정확히 1w다 — 세로 배수는 1을
 * 넘어야 한다. 이름이 「原点間隔의 배수」라고 재는 대상을 이고 있는 이유가 이것이다:
 * 둘 다 `gapRatio: number`이면 호출부가 0.5와 1.5를 맞바꿔 넣어도 타입이 막지 못한다.
 *
 * **두 축이 서로 다르게 느슨했던 것이 아니다.** 세로 조건을 가로의 척도로 옮기면
 * `여백 ≤ w·(배수−1)`이고, 배수 2·w≈0.5h(픽스처 5부의 숫자 글리프 실측 w/h는
 * 0.4977~0.5226)에서 그 값은 0.5h ― 伏図 파서가 쓰는 가로 문턱(`min(h)·0.5`)과
 * **같다**. 옛 기본값 2의 결함은 느슨함이 아니라 경계가 실측값과 정확히 겹친 것이다
 * (`VERTICAL_RUN_GAP_RATIO` 참고).
 */
export function verticalRuns(
  items: TextItem[],
  originGapRatio: number = VERTICAL_RUN_GAP_RATIO,
): VerticalRun[] {
  const rotated = items
    .filter(
      (item) =>
        item.str.trim().length > 0 &&
        item.rot !== undefined &&
        Math.abs(item.rot + 90) < ROTATION_TOLERANCE_DEG,
    )
    .sort((left, right) => left.x - right.x || right.y - left.y)

  const runs: VerticalRun[] = []
  let current: TextItem[] = []

  const flush = () => {
    if (current.length === 0) return
    // spread(Math.min(...))는 인자 수가 사용자 PDF의 글리프 수를 그대로 따라가
    // 스택 한도에서 RangeError가 된다 — 렌더 경로라 임포트가 통째로 죽는다
    //
    // minY는 item.y - item.w(자신의 진행량만큼 앞쪽으로 더 나간 끝)의 최솟값이다.
    // 원점(y) 그대로를 쓰면 마지막 글자의 원점(=그 글자의 뒤쪽 끝)에서 멈춰
    // 앞쪽 끝을 놓친다 — VerticalRun.y의 규약 설명 참고. maxY는 보정이 없다:
    // 첫 글자의 원점이 이미 런 전체의 뒤쪽 바깥 끝이라 더 나갈 데가 없다.
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const item of current) {
      if (item.y - item.w < minY) minY = item.y - item.w
      if (item.y > maxY) maxY = item.y
    }
    runs.push({
      text: compact(current.map((item) => item.str).join('')),
      x: current[0].x,
      y: (minY + maxY) / 2,
    })
    current = []
  }

  for (const item of rotated) {
    const previous = current.at(-1)
    // 정렬이 x 우선이라, x가 1pt 이내로 다른 두 런의 경계에서는 y가 거꾸로 온다.
    // 하한이 없으면 그 음수 간격이 검사를 무조건 통과해 서로 다른 층의 치수가
    // 이어붙는다 — 「600」+「500」이 600500이 되어 두 층이 다 사라진다
    const gap = previous === undefined ? -1 : previous.y - item.y
    const adjacent =
      previous !== undefined &&
      Math.abs(previous.x - item.x) <= COLUMN_TOLERANCE_PT &&
      gap >= 0 &&
      gap <= Math.max(previous.w, item.w) * originGapRatio
    if (!adjacent) flush()
    current.push(item)
  }
  flush()

  return runs
}
