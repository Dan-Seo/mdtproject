import type { TextItem } from '@/lib/import/types'

export interface TextSegment {
  text: string
  compact: string
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
 * TextSegment.centerY와 같은 규약이다(ADR-030④ 「좌표 규약은 한 곳에」).
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
/** 글자 진행량(w)에 곱해 인접 판정 상한을 만드는 배수 — 세로 런의 y 간격과
 *  타이틀 앵커의 같은 행(대역) 판정 둘 다에 쓴다 */
export const PROXIMITY_MULTIPLIER = 2

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
    // 하한도 gapRatio에 맞춰 줄인다. 고정 4pt였다면 gapRatio를 좁혀도(라벨·치수용
    // 0.5 등) h≤8인 도면에서 min(h)*gapRatio≤4가 되어 하한이 이겨 좁힘이 무효가
    // 된다 — 배수를 좁히려는 의도가 고정 하한에 잠식되는 것이다. gapRatio가
    // 기본값(2.2)이면 4*(gapRatio/DEFAULT)=4로 그대로라 section-list 파서(항상
    // 기본값을 씀)의 동작은 바뀌지 않는다.
    const threshold = previous
      ? Math.max(
          4 * (gapRatio / DEFAULT_SEGMENT_GAP_RATIO),
          Math.min(previous.h, item.h) * gapRatio,
        )
      : 0

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
 */
export function verticalRuns(items: TextItem[]): VerticalRun[] {
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
      gap <= Math.max(previous.w, item.w) * PROXIMITY_MULTIPLIER
    if (!adjacent) flush()
    current.push(item)
  }
  flush()

  return runs
}
