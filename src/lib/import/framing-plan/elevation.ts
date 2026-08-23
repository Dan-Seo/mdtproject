import { recoverRows, verticalRuns } from '../runs'
import type { TextPage } from '../section-list/types'

import type {
  ElevationCandidate,
  ElevationIssue,
  ElevationLevel,
  ParsedFrameElevations,
} from './types'

/**
 * 軸組図의 높이 방향을 텍스트 레이어만으로 복원한다 (ADR-030).
 *
 * 伏図와 달리 라벨 밴드를 앵커로 쓸 수 없다 — 실물 yokohama p8의 레벨 라벨은
 * 좌단 x가 108~198로 흩어지고 중심 x도 123~221로 흩어진다(글자 수에 따라
 * 들여쓰기가 달라진다). 대신 치수 열은 x가 한 값으로 곧게 선다.
 *
 * 그래서 앵커는 치수 열이고, 「치수는 자기가 재는 구간의 중점에 놓인다」는
 * 관계로 축척과 레벨 위치를 함께 푼다. 인접 두 치수 v0·v1의 간격은
 * (v0+v1)/2 × 축척이므로, 축척은 도면 표기를 믿지 않고 여기서 유도된다.
 */

const DIMENSION_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d{2,})$/
const ELEVATION_TITLE_PATTERN = /軸組/
/** 치수 열로 보는 x 허용오차(pt). 실물 p8의 열은 x가 한 값으로 곧다 */
const COLUMN_TOLERANCE_PT = 4
/** 레벨 라벨과 푼 레벨 위치의 어긋남 허용(pt). 실물 최대 4.1pt */
const LEVEL_TOLERANCE_PT = 15
/**
 * 레벨 라벨을 찾는 가로 창(pt) — 치수 열 중심에서의 거리.
 *
 * 도면 안의 부재 부호까지 레벨 라벨로 삼지 않기 위한 것이다. 실물 p8의 라벨
 * 블록은 치수 열에서 최대 62pt 떨어져 있고, 그 바깥 창 폭은 도면마다 다르다 (R10).
 */
const LABEL_WINDOW_PT = 150
/** 계열이 이어지는지 보는 축척 편차. 伏図 파서와 같은 값이다 */
const SCALE_TOLERANCE_RATIO = 0.03
/** 라벨이 붙은 레벨이 이보다 적으면 계열로 보지 않는다 — 부분 치수 열과의 유일한 구분 */
const MINIMUM_LABELLED_LEVELS = 2

interface Token {
  text: string
  x: number
  y: number
}

interface DimensionToken extends Token {
  valueMm: number
}

function tokens(page: TextPage): Token[] {
  const collected: Token[] = []
  for (const row of recoverRows(page.items)) {
    for (const segment of row.segments) {
      collected.push({ text: segment.compact, x: segment.centerX, y: row.y })
    }
  }
  for (const run of verticalRuns(page.items)) {
    collected.push({ text: run.text, x: run.x, y: run.y })
  }
  return collected
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

/** 치수를 x가 곧게 선 열로 묶는다 */
function dimensionColumns(dimensions: DimensionToken[]): DimensionToken[][] {
  const sorted = [...dimensions].sort((a, b) => a.x - b.x || a.y - b.y)
  const columns: DimensionToken[][] = []

  for (const token of sorted) {
    const column = columns.at(-1)
    if (column && Math.abs(column[0].x - token.x) <= COLUMN_TOLERANCE_PT) {
      column.push(token)
    } else {
      columns.push([token])
    }
  }

  return columns.map((column) => [...column].sort((a, b) => a.y - b.y))
}

/**
 * 한 열을 축척이 이어지는 최대 구간으로 나눈다. 같은 열에 위·아래 두 軸組図가
 * 실리면(실물 p8) 그 사이에서 유도 축척이 크게 튄다 — 열을 통째로 버리지 않고
 * 그 자리에서 자른다.
 */
function chains(column: DimensionToken[]): DimensionToken[][] {
  const result: DimensionToken[][] = []
  let current: DimensionToken[] = []
  let reference: number | undefined

  for (let i = 0; i + 1 < column.length; i++) {
    const scale =
      (2 * (column[i + 1].y - column[i].y)) /
      (column[i].valueMm + column[i + 1].valueMm)
    const continues =
      reference !== undefined &&
      Math.abs(scale / reference - 1) <= SCALE_TOLERANCE_RATIO

    if (continues) {
      current.push(column[i + 1])
    } else {
      if (current.length >= 2) result.push(current)
      current = [column[i], column[i + 1]]
      reference = scale
    }
  }
  if (current.length >= 2) result.push(current)

  return result
}

function levelsOf(
  chain: DimensionToken[],
  scale: number,
): Array<{ positionPt: number }> {
  const first = chain[0].y - (chain[0].valueMm * scale) / 2
  const positions = [first]
  for (const dimension of chain) {
    positions.push(positions[positions.length - 1] + dimension.valueMm * scale)
  }
  return positions.map((positionPt) => ({ positionPt }))
}

function verticalExtent(elevation: ElevationCandidate): {
  top: number
  bottom: number
} {
  return {
    top: elevation.levels[0].positionPt,
    bottom: elevation.levels[elevation.levels.length - 1].positionPt,
  }
}

/**
 * 세로 범위가 겹치는 계열은 **같은 구간의 서로 다른 읽기**다 — 실물 p8에서는
 * 階高 열(1400·4100·4480·2690) 옆에 部分 치수 열(190·150·2350)이 나란히 서고,
 * 그 부분 열도 근처 라벨 둘을 주워 계열의 조건을 만족한다. 둘 다 내면 사용자에게
 * 서로 어긋나는 階高가 동시에 보인다.
 *
 * 가장 넓게 읽은 것 하나만 남긴다. 階高 열은 軸組図의 높이 전체를 재고
 * 부분 열은 국소적이라, 세로 범위가 그 둘을 가장 크게 갈라 놓는다(실물에서
 * 359pt 대 38·52pt). 도면 형식이 이 전제를 깨면 계열이 하나 사라지고,
 * 값을 지어내는 대신 사용자가 손으로 넣는다 (R10).
 */
function withoutOverlaps(
  elevations: ElevationCandidate[],
): ElevationCandidate[] {
  const ranked = [...elevations].sort((a, b) => {
    const left = verticalExtent(a)
    const right = verticalExtent(b)
    return (
      right.bottom - right.top - (left.bottom - left.top) ||
      b.levels.length - a.levels.length
    )
  })

  const kept: ElevationCandidate[] = []
  for (const elevation of ranked) {
    const range = verticalExtent(elevation)
    const overlaps = kept.some((accepted) => {
      const other = verticalExtent(accepted)
      return range.top <= other.bottom && other.top <= range.bottom
    })
    if (!overlaps) kept.push(elevation)
  }

  return kept
}

export function parseFrameElevations(page: TextPage): ParsedFrameElevations {
  const collected = tokens(page)

  const dimensions: DimensionToken[] = []
  const labels: Token[] = []
  const titles: Token[] = []
  for (const token of collected) {
    if (DIMENSION_PATTERN.test(token.text)) {
      dimensions.push({
        ...token,
        valueMm: Number.parseInt(token.text.replaceAll(',', ''), 10),
      })
      continue
    }
    if (ELEVATION_TITLE_PATTERN.test(token.text)) {
      titles.push(token)
      continue
    }
    labels.push(token)
  }

  const elevations: ElevationCandidate[] = []
  for (const column of dimensionColumns(dimensions)) {
    for (const chain of chains(column)) {
      const scales = chain
        .slice(1)
        .map(
          (dimension, i) =>
            (2 * (dimension.y - chain[i].y)) /
            (chain[i].valueMm + dimension.valueMm),
        )
      const scale = median(scales)
      const positions = levelsOf(chain, scale)

      // 라벨은 가장 가까운 레벨 하나에만 붙는다 — 층이 얕으면 허용 범위가
      // 겹치는데, 겹치는 만큼 양쪽에 싣으면 없는 라벨이 생긴다
      const levels: ElevationLevel[] = positions.map(({ positionPt }) => ({
        labels: [],
        positionPt,
      }))
      for (const label of labels) {
        if (Math.abs(label.x - chain[0].x) > LABEL_WINDOW_PT) continue
        let nearest = -1
        let nearestDistance = Number.POSITIVE_INFINITY
        for (let i = 0; i < levels.length; i++) {
          const distance = Math.abs(levels[i].positionPt - label.y)
          if (distance < nearestDistance) {
            nearest = i
            nearestDistance = distance
          }
        }
        if (nearest < 0 || nearestDistance > LEVEL_TOLERANCE_PT) continue
        levels[nearest].labels.push(label.text)
      }

      const labelled = levels.filter((level) => level.labels.length > 0).length
      if (labelled < MINIMUM_LABELLED_LEVELS) continue

      elevations.push({
        titles: [],
        levels,
        heightsMm: chain.map((dimension) => dimension.valueMm),
        scalePtPerMm: scale,
      })
    }
  }

  const resolved = withoutOverlaps(elevations)

  if (resolved.length === 0) {
    return { elevations: [], issues: ['寸法列未検出'] }
  }

  resolved.sort((a, b) => a.levels[0].positionPt - b.levels[0].positionPt)

  // 제목은 가장 가까운 계열에 붙인다 — 한 계열이 여러 通り의 軸組図에 공통으로
  // 걸리므로(실물 p8은 좌단 치수 열 하나에 bY1·bY2·bY3 세 장) 1:1이 아니다
  for (const title of titles) {
    let nearest: ElevationCandidate | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const elevation of resolved) {
      const top = elevation.levels[0].positionPt
      const bottom = elevation.levels[elevation.levels.length - 1].positionPt
      const distance =
        title.y < top ? top - title.y : title.y > bottom ? title.y - bottom : 0
      if (distance < nearestDistance) {
        nearest = elevation
        nearestDistance = distance
      }
    }
    nearest?.titles.push(title.text)
  }

  const issues: ElevationIssue[] = []
  return { elevations: resolved, issues }
}
