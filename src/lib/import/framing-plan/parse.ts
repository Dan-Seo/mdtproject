import { compact, recoverRows, verticalRuns, type TextSegment } from '../runs'
import type { TextItem, TextPage } from '../section-list/types'

import type {
  AxisCandidate,
  ParsedPlanGrids,
  PlanGridCandidate,
  PlanGridIssue,
} from './types'

/**
 * 伏図의 通り芯 그리드를 텍스트 레이어만으로 복원한다 (ADR-030).
 *
 * 실측(2026-08-23 스파이크, yokohama p5–p7·kani p38)이 준 구조:
 * 축 라벨은 한 밴드(같은 x 또는 같은 y)에 늘어서고, 스팬 치수 문자열은
 * 인접 라벨 좌표의 **중점**에 놓인다(실측 오차 ≤8pt). 전체 치수가 있으면
 * 첫-끝 중점에 놓여 합계 검증식이 된다. 벡터 선분은 쓰지 않는다 —
 * 一点鎖線이 짧은 조각으로 분해돼 있고 텍스트만으로 복원이 완결된다.
 */

/**
 * 通り芯 라벨 하나. 소문자 접두(b·c ＝ 棟 구분)는 실측 범위다 — 미지 표기(bX2A의
 * 「A」 같은 枝番)는 지어내지 않고 정직하게 놓친다 (R10).
 *
 * sticky 플래그는 「이 세그먼트가 라벨의 연속으로 남김없이 설명되는가」를 묻기
 * 위한 것이다 — 부분 일치를 라벨로 받으면 枝番 축이 조용히 본번으로 둔갑한다.
 */
const AXIS_LABEL_PATTERN = /[a-z]?[XY]\d+/y
/** 치수 문자열 — 쉼표 구분(6,000)과 무구분(8700) 둘 다 실물에 있다 */
const DIMENSION_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d{2,})$/

// 실측 기반 허용오차. 근거는 스파이크 실측값이고 ADR-030에 적었다.
/** 라벨을 같은 밴드로 보는 고정 좌표 허용오차. 실측 편차는 1pt 미만이다 */
const BAND_TOLERANCE_PT = 8
/** 치수 열이 라벨 밴드에서 떨어질 수 있는 거리. 실측 최대 50pt(kani X) */
const DIMENSION_WINDOW_PT = 60
/** 치수 중심과 인접 축 중점의 어긋남 허용. 실측 최대 8pt, 세부 치수 연쇄의
 *  최근접 오탐이 40pt라 그 사이에 둔다 */
const MIDPOINT_TOLERANCE_PT = 15
/** 스팬별 실측 축척(pt/mm)의 중앙값 대비 허용 편차. 실측 최대 0.5% */
const SCALE_TOLERANCE_RATIO = 0.03

interface LabelToken {
  label: string
  letter: 'X' | 'Y'
  x: number
  y: number
}

interface DimensionToken {
  valueMm: number
  x: number
  y: number
}

interface AxisSequence {
  letters: Set<'X' | 'Y'>
  /** positionPt가 어느 좌표인가 — 치수 매칭이 같은 좌표를 봐야 한다 */
  alongKey: 'x' | 'y'
  /** 밴드의 고정 좌표(평균) — 치수 창의 기준 */
  across: number
  axes: AxisCandidate[]
}

/**
 * 세그먼트 하나를 라벨의 연속으로 되가른다. `makeSegments`는 표의 칸을 묶으려고
 * 만든 규칙이라 인접한 두 通り芯을 한 덩이로 붙인다 — 실물 yokohama p7에서
 * `bX3`(34pt 간격)와 `cX1`이 「bX3cX1」이 됐다.
 *
 * 되가른 라벨의 좌표는 **그 라벨을 이룬 문자들에서** 다시 잰다. 등분·보간으로
 * 만들면 도면에 없는 위치를 제품이 정하는 것이 되고, 그 위치가 그대로 스팬
 * 치수의 중점 판정에 쓰인다.
 *
 * 세그먼트 전체가 라벨로 남김없이 설명될 때만 받는다.
 */
function splitAxisLabels(segment: TextSegment, y: number): LabelToken[] {
  // NFKC가 한 글자를 여러 글자로 펴는 경우가 있으므로 1:1을 가정하지 않고
  // 문자마다 텍스트상의 구간을 기록해 되찾는다
  let text = ''
  const spans: Array<{ start: number; end: number; item: TextItem }> = []
  for (const item of segment.items) {
    const piece = compact(item.str)
    if (piece === '') continue
    spans.push({ start: text.length, end: text.length + piece.length, item })
    text += piece
  }
  if (text === '') return []

  const tokens: LabelToken[] = []
  AXIS_LABEL_PATTERN.lastIndex = 0
  while (AXIS_LABEL_PATTERN.lastIndex < text.length) {
    const start = AXIS_LABEL_PATTERN.lastIndex
    const match = AXIS_LABEL_PATTERN.exec(text)
    if (!match) return []
    const end = AXIS_LABEL_PATTERN.lastIndex

    const owned = spans
      .filter((span) => span.start < end && span.end > start)
      .map((span) => span.item)
    if (owned.length === 0) return []

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    for (const item of owned) {
      if (item.x < minX) minX = item.x
      if (item.x + item.w > maxX) maxX = item.x + item.w
    }

    tokens.push({
      label: match[0],
      letter: (match[0].includes('X') ? 'X' : 'Y') as 'X' | 'Y',
      x: (minX + maxX) / 2,
      y,
    })
  }

  return tokens
}

interface CollectedTokens {
  labels: LabelToken[]
  dimensions: DimensionToken[]
}

function collectTokens(page: TextPage): CollectedTokens {
  const labels: LabelToken[] = []
  const dimensions: DimensionToken[] = []

  const push = (text: string, x: number, y: number) => {
    if (DIMENSION_PATTERN.test(text)) {
      dimensions.push({
        valueMm: Number.parseInt(text.replaceAll(',', ''), 10),
        x,
        y,
      })
    }
  }

  for (const row of recoverRows(page.items)) {
    for (const segment of row.segments) {
      labels.push(...splitAxisLabels(segment, row.y))
      push(segment.compact, segment.centerX, row.y)
    }
  }

  // 세로쓰기는 문자 좌표가 세로로 흐르므로 되가르기를 걸지 않는다 — 실측 코퍼스의
  // 세로 런은 치수뿐이고, 세로 라벨이 붙어 나오는 도면은 빈 후보로 실패한다 (R10)
  for (const run of verticalRuns(page.items)) {
    const match = /^[a-z]?[XY]\d+$/.exec(run.text)
    if (match) {
      labels.push({
        label: run.text,
        letter: run.text.includes('X') ? 'X' : 'Y',
        x: run.x,
        y: run.y,
      })
      continue
    }
    push(run.text, run.x, run.y)
  }

  return { labels, dimensions }
}

/**
 * 라벨들을 고정 좌표가 이어지는 밴드로 묶고, 밴드 안에서 위치 오름차순으로
 * 늘어놓은 뒤 라벨이 반복되는 자리에서 갈라 축 열을 만든다 — 한 페이지에
 * 같은 그리드의 伏図가 여러 블록 있으면(실물 p7) 같은 밴드에 열이 반복된다.
 */
function axisSequences(
  labels: LabelToken[],
  across: 'x' | 'y',
): AxisSequence[] {
  const along = across === 'x' ? 'y' : 'x'
  const sorted = [...labels].sort((a, b) => a[across] - b[across])
  const bands: LabelToken[][] = []

  for (const token of sorted) {
    const band = bands.at(-1)
    const previous = band?.at(-1)
    if (band && previous && token[across] - previous[across] <= BAND_TOLERANCE_PT) {
      band.push(token)
    } else {
      bands.push([token])
    }
  }

  const sequences: AxisSequence[] = []
  for (const band of bands) {
    if (band.length < 2) continue
    const ordered = [...band].sort((a, b) => a[along] - b[along])

    let current: LabelToken[] = []
    const flush = () => {
      if (current.length >= 2) {
        sequences.push({
          letters: new Set(current.map((token) => token.letter)),
          alongKey: along,
          across:
            current.reduce((total, token) => total + token[across], 0) /
            current.length,
          axes: current.map((token) => ({
            label: token.label,
            positionPt: token[along],
          })),
        })
      }
      current = []
    }

    for (const token of ordered) {
      if (current.some((seen) => seen.label === token.label)) flush()
      current.push(token)
    }
    flush()
  }

  return sequences
}

/** 인접 축 쌍의 중점에서, 라벨 밴드의 치수 창 안에 있는 치수를 찾는다 */
function dimensionAt(
  dimensions: DimensionToken[],
  used: Set<DimensionToken>,
  along: 'x' | 'y',
  across: 'x' | 'y',
  midpoint: number,
  bandAcross: number,
): DimensionToken | undefined {
  let best: DimensionToken | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (const token of dimensions) {
    if (used.has(token)) continue
    const alongDistance = Math.abs(token[along] - midpoint)
    if (alongDistance > MIDPOINT_TOLERANCE_PT) continue
    if (Math.abs(token[across] - bandAcross) > DIMENSION_WINDOW_PT) continue
    if (alongDistance < bestDistance) {
      best = token
      bestDistance = alongDistance
    }
  }

  return best
}

export function parseFramingPlanGrids(page: TextPage): ParsedPlanGrids {
  const { labels, dimensions } = collectTokens(page)

  const issues: PlanGridIssue[] = []
  const issue = (code: PlanGridIssue) => {
    if (!issues.includes(code)) issues.push(code)
  }

  if (labels.length === 0) {
    return { candidates: [], issues: ['通り芯ラベル未検出'] }
  }

  // 라벨 문자열이 가로로 놓여도 밴드(축의 늘어선 방향)는 세로일 수 있다 —
  // 두 방향 다 묶어 보고, 검증(중점 치수·축척)이 가짜 밴드를 걸러낸다.
  const sequences = [
    ...axisSequences(labels, 'x'),
    ...axisSequences(labels, 'y'),
  ]

  const candidates: PlanGridCandidate[] = []
  const seen = new Set<string>()

  for (const sequence of sequences) {
    if (sequence.letters.size > 1) {
      issue('ラベル文字混在')
      continue
    }
    const alongKey = sequence.alongKey
    const acrossKey: 'x' | 'y' = alongKey === 'y' ? 'x' : 'y'

    const used = new Set<DimensionToken>()
    const spans: DimensionToken[] = []
    for (let i = 0; i + 1 < sequence.axes.length; i++) {
      const midpoint =
        (sequence.axes[i].positionPt + sequence.axes[i + 1].positionPt) / 2
      const dimension = dimensionAt(
        dimensions,
        used,
        alongKey,
        acrossKey,
        midpoint,
        sequence.across,
      )
      if (!dimension) break
      used.add(dimension)
      spans.push(dimension)
    }
    if (spans.length < sequence.axes.length - 1) {
      issue('寸法欠落')
      continue
    }

    // 스팬별 실측 축척이 갈리면 치수 오배정이다 — 조용한 그리드를 내느니 실패한다
    const scales = spans.map(
      (span, i) =>
        (sequence.axes[i + 1].positionPt - sequence.axes[i].positionPt) /
        span.valueMm,
    )
    const sortedScales = [...scales].sort((a, b) => a - b)
    const medianScale = sortedScales[Math.floor(sortedScales.length / 2)]
    if (
      scales.some(
        (scale) => Math.abs(scale / medianScale - 1) > SCALE_TOLERANCE_RATIO,
      )
    ) {
      issue('縮尺不整合')
      continue
    }

    // 전체 치수(첫-끝 중점)가 있으면 합계 검증식으로 쓴다 — 불일치는 오독 신호다
    const spanSum = spans.reduce((total, span) => total + span.valueMm, 0)
    const first = sequence.axes[0].positionPt
    const last = sequence.axes.at(-1)?.positionPt ?? first
    const total = dimensionAt(
      dimensions,
      used,
      alongKey,
      acrossKey,
      (first + last) / 2,
      sequence.across,
    )
    if (total && total.valueMm !== spanSum) {
      issue('合計不一致')
      continue
    }

    const candidate: PlanGridCandidate = {
      direction: [...sequence.letters][0],
      axes: sequence.axes,
      spansMm: spans.map((span) => span.valueMm),
      scalePtPerMm: medianScale,
      totalConfirmed: total !== undefined,
    }
    const key = [
      candidate.direction,
      candidate.axes.map((axis) => axis.label).join(','),
      candidate.spansMm.join(','),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate)
  }

  candidates.sort(
    (a, b) =>
      a.direction.localeCompare(b.direction) ||
      a.axes[0].positionPt - b.axes[0].positionPt,
  )

  return { candidates, issues }
}
