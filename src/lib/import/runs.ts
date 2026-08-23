import type { TextItem } from '@/lib/import/section-list/types'

export interface TextSegment {
  text: string
  compact: string
  x: number
  endX: number
  centerX: number
}

export interface TextRow {
  y: number
  height: number
  items: TextItem[]
  segments: TextSegment[]
}

/** 세로쓰기(rot=-90) 문자열 하나. y는 세로 범위의 중앙이다. */
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

export function makeSegments(items: TextItem[]): TextSegment[] {
  const sorted = [...items].sort((left, right) => left.x - right.x)
  const groups: TextItem[][] = []

  for (const item of sorted) {
    const group = groups.at(-1)
    const previous = group?.at(-1)
    const threshold = previous
      ? Math.max(4, Math.min(previous.h, item.h) * 2.2)
      : 0

    if (!group || !previous || item.x - (previous.x + previous.w) > threshold) {
      groups.push([item])
    } else {
      group.push(item)
    }
  }

  return groups.map((group) => {
    const x = Math.min(...group.map((item) => item.x))
    const endX = Math.max(...group.map((item) => item.x + item.w))
    const text = group.map((item) => item.str).join('')
    return { text, compact: compact(text), x, endX, centerX: (x + endX) / 2 }
  })
}

export function recoverRows(items: TextItem[]): TextRow[] {
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
    .map((row) => ({ ...row, segments: makeSegments(row.items) }))
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
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const item of current) {
      if (item.y < minY) minY = item.y
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
