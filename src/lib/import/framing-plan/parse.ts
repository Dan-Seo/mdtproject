import { compact, recoverRows, verticalRuns, type TextSegment } from '../runs'
import type { TextItem, TextPage } from '../section-list/types'

import type {
  AxisCandidate,
  MemberPlacement,
  ParsedFramingPlan,
  PlanBlock,
  PlanGridCandidate,
  PlanGridIssue,
} from './types'

/**
 * 伏図의 通り芯 그리드와 부재 배치를 텍스트 레이어만으로 복원한다 (ADR-030).
 *
 * 실측(2026-08-23 스파이크, yokohama p5–p7·kani p38)이 준 구조:
 * 축 라벨은 한 밴드(같은 x 또는 같은 y)에 늘어서고, 스팬 치수 문자열은
 * 인접 라벨 좌표의 **중점**에 놓인다(실측 오차 ≤8pt). 전체 치수가 있으면
 * 첫-끝 중점에 놓여 합계 검증식이 된다. 부재 부호는 격자점(柱)·변의 중점
 * (大梁)·칸 중앙(床板) 중 하나에 놓인다. 벡터 선분은 쓰지 않는다 —
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
/**
 * 부재 부호. 断面リスト의 것(section-list의 MARK_PATTERN)에 S(床板)를 더했다 —
 * 伏図에는 스ラブ 부호가 나오고 리스트 표에는 나오지 않는다.
 */
const MARK_PATTERN = /^(?:C|G|FC|FG|B|CB|S|W)\d+[A-Z]?$/
/** 블록 제목. 「2階床伏図1/100」처럼 축척이 붙어 오므로 부분 일치로 본다 */
const BLOCK_TITLE_PATTERN = /伏図/

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
/**
 * 부호를 격자점·중점에 붙이는 허용 거리 ＝ 그 방향 **중앙값 스팬**의 이 비율.
 *
 * 인접 스팬을 쓰지 않는 이유가 있다: 실물 yokohama p7의 bX3–cX1은 1200mm(34pt)
 * 짜리 좁은 띠라, 인접 스팬 기준이면 허용이 8pt로 좁아져 引出線으로 20pt쯤
 * 비켜 적힌 柱 부호가 통째로 떨어진다. 중앙값은 그 좁은 띠 하나에 흔들리지 않는다.
 *
 * 1/4을 넘길 수는 없다 — 격자점과 중점이 반 스팬 간격이므로 1/4이 「어느 쪽에도
 * 붙일 수 있다」의 경계다. 그보다 크게 잡으면 어느 쪽인지 제품이 고르게 된다.
 */
const SNAP_RATIO = 0.25

interface LabelToken {
  label: string
  letter: 'X' | 'Y'
  x: number
  y: number
}

interface PositionedToken {
  text: string
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

/** 치수·축척까지 확인이 끝난 축 열. 그리드 정의와 블록이 둘 다 여기서 나온다 */
interface ValidatedSequence extends AxisSequence {
  direction: 'X' | 'Y'
  spansMm: number[]
  scalePtPerMm: number
  totalConfirmed: boolean
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
      letter: match[0].includes('X') ? 'X' : 'Y',
      x: (minX + maxX) / 2,
      y,
    })
  }

  return tokens
}

interface CollectedTokens {
  labels: LabelToken[]
  dimensions: DimensionToken[]
  marks: PositionedToken[]
  titles: PositionedToken[]
}

function collectTokens(page: TextPage): CollectedTokens {
  const labels: LabelToken[] = []
  const dimensions: DimensionToken[] = []
  const marks: PositionedToken[] = []
  const titles: PositionedToken[] = []

  const classify = (text: string, x: number, y: number) => {
    if (DIMENSION_PATTERN.test(text)) {
      dimensions.push({
        valueMm: Number.parseInt(text.replaceAll(',', ''), 10),
        x,
        y,
      })
      return
    }
    if (MARK_PATTERN.test(text)) {
      marks.push({ text, x, y })
      return
    }
    if (BLOCK_TITLE_PATTERN.test(text)) titles.push({ text, x, y })
  }

  for (const row of recoverRows(page.items)) {
    for (const segment of row.segments) {
      labels.push(...splitAxisLabels(segment, row.y))
      classify(segment.compact, segment.centerX, row.y)
    }
  }

  // 세로쓰기는 문자 좌표가 세로로 흐르므로 되가르기를 걸지 않는다 — 실측 코퍼스의
  // 세로 런은 치수뿐이고, 세로 라벨이 붙어 나오는 도면은 빈 후보로 실패한다 (R10)
  for (const run of verticalRuns(page.items)) {
    if (/^[a-z]?[XY]\d+$/.test(run.text)) {
      labels.push({
        label: run.text,
        letter: run.text.includes('X') ? 'X' : 'Y',
        x: run.x,
        y: run.y,
      })
      continue
    }
    classify(run.text, run.x, run.y)
  }

  return { labels, dimensions, marks, titles }
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
    if (
      band &&
      previous &&
      token[across] - previous[across] <= BAND_TOLERANCE_PT
    ) {
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

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

function validateSequence(
  sequence: AxisSequence,
  dimensions: DimensionToken[],
  issue: (code: PlanGridIssue) => void,
): ValidatedSequence | undefined {
  if (sequence.letters.size > 1) {
    issue('ラベル文字混在')
    return undefined
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
    return undefined
  }

  // 스팬별 실측 축척이 갈리면 치수 오배정이다 — 조용한 그리드를 내느니 실패한다
  const scales = spans.map(
    (span, i) =>
      (sequence.axes[i + 1].positionPt - sequence.axes[i].positionPt) /
      span.valueMm,
  )
  const medianScale = median(scales)
  if (
    scales.some(
      (scale) => Math.abs(scale / medianScale - 1) > SCALE_TOLERANCE_RATIO,
    )
  ) {
    issue('縮尺不整合')
    return undefined
  }

  // 전체 치수(첫-끝 중점)가 있으면 합계 검증식으로 쓴다 — 불일치는 오독 신호다
  const spanSum = spans.reduce((sum, span) => sum + span.valueMm, 0)
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
    return undefined
  }

  return {
    ...sequence,
    direction: [...sequence.letters][0],
    spansMm: spans.map((span) => span.valueMm),
    scalePtPerMm: medianScale,
    totalConfirmed: total !== undefined,
  }
}

function extent(axes: AxisCandidate[]): { min: number; max: number } {
  return {
    min: axes[0].positionPt,
    max: axes[axes.length - 1].positionPt,
  }
}

/** 점에서 구간까지의 거리. 구간 안이면 0 */
function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) return min - value
  if (value > max) return value - max
  return 0
}

/**
 * 부호가 붙는 자리를 만든다 — 격자점과 그 사이 중점이 번갈아 놓인 눈금이다.
 * 짝수 index가 격자점(index/2), 홀수가 중점(사이 (index-1)/2).
 */
function snapTargets(axes: AxisCandidate[]): number[] {
  const targets: number[] = []
  for (let i = 0; i < axes.length; i++) {
    targets.push(axes[i].positionPt)
    if (i + 1 < axes.length) {
      targets.push((axes[i].positionPt + axes[i + 1].positionPt) / 2)
    }
  }
  return targets
}

function spanLengths(axes: AxisCandidate[]): number[] {
  return axes
    .slice(1)
    .map((axis, i) => axis.positionPt - axes[i].positionPt)
}

interface Snap {
  index: number
  onNode: boolean
}

function snap(
  value: number,
  axes: AxisCandidate[],
  limit: number,
): Snap | undefined {
  const targets = snapTargets(axes)
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < targets.length; i++) {
    const distance = Math.abs(targets[i] - value)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  if (best < 0 || bestDistance > limit) return undefined
  return { index: best >> 1, onNode: best % 2 === 0 }
}

function placementFor(
  mark: string,
  x: Snap,
  y: Snap,
): MemberPlacement | undefined {
  if (x.onNode && y.onNode) {
    return { mark, role: '格子点', ix: x.index, iy: y.index }
  }
  if (!x.onNode && y.onNode) {
    return { mark, role: '辺', ix: x.index, iy: y.index, axis: 'X' }
  }
  if (x.onNode && !y.onNode) {
    return { mark, role: '辺', ix: x.index, iy: y.index, axis: 'Y' }
  }
  return { mark, role: 'ベイ', ix: x.index, iy: y.index }
}

function gridCandidate(sequence: ValidatedSequence): PlanGridCandidate {
  return {
    direction: sequence.direction,
    axes: sequence.axes,
    spansMm: sequence.spansMm,
    scalePtPerMm: sequence.scalePtPerMm,
    totalConfirmed: sequence.totalConfirmed,
  }
}

/**
 * 블록을 짓는다 — X 열 하나와 **가장 가까운** Y 열 하나를 짝짓는다.
 *
 * 고정 여백으로 「포함」을 판정하지 않는 이유: 라벨은 도면 바깥에 놓이므로
 * 여백이 필요한데(실물 156pt), 그 여백을 넓히면 옆 블록의 열까지 삼킨다.
 * 최근접은 그 사이를 재지 않고도 옳은 짝을 고른다.
 *
 * 같은 블록의 위·아래 라벨 띠는 축 위치가 같으므로 그 자리에서 하나로 접힌다.
 */
function buildBlocks(
  xSequences: ValidatedSequence[],
  ySequences: ValidatedSequence[],
  marks: PositionedToken[],
  titles: PositionedToken[],
): PlanBlock[] {
  const blocks: PlanBlock[] = []
  const seen = new Set<string>()

  for (const xSequence of xSequences) {
    const xExtent = extent(xSequence.axes)
    let paired: ValidatedSequence | undefined
    let pairedDistance = Number.POSITIVE_INFINITY
    for (const ySequence of ySequences) {
      const distance = distanceToRange(
        ySequence.across,
        xExtent.min,
        xExtent.max,
      )
      if (distance < pairedDistance) {
        paired = ySequence
        pairedDistance = distance
      }
    }
    if (!paired) continue

    const xGrid = gridCandidate(xSequence)
    const yGrid = gridCandidate(paired)
    const xAxes = xGrid.axes
    const yAxes = yGrid.axes
    const key = [xAxes, yAxes]
      .map((axes) =>
        axes
          .map((axis) => `${axis.label}@${Math.round(axis.positionPt)}`)
          .join(','),
      )
      .join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const xLimit = median(spanLengths(xAxes)) * SNAP_RATIO
    const yLimit = median(spanLengths(yAxes)) * SNAP_RATIO
    const yExtent = extent(yAxes)

    const placements: MemberPlacement[] = []
    const unplacedMarks: string[] = []
    for (const mark of marks) {
      // 블록 밖의 부호는 아예 보지 않는다 — 같은 페이지의 断面リスト가 섞인다.
      // 판정 여백을 스냅 허용과 같게 두어, 「블록 안인데 못 붙였다」와
      // 「블록 밖이다」가 같은 자로 갈리게 한다
      if (distanceToRange(mark.x, xExtent.min, xExtent.max) > xLimit) continue
      if (distanceToRange(mark.y, yExtent.min, yExtent.max) > yLimit) continue

      const x = snap(mark.x, xAxes, xLimit)
      const y = snap(mark.y, yAxes, yLimit)
      if (!x || !y) {
        if (!unplacedMarks.includes(mark.text)) unplacedMarks.push(mark.text)
        continue
      }
      const placement = placementFor(mark.text, x, y)
      if (placement) placements.push(placement)
    }

    // 제목은 블록의 가로 범위 안에 있는 것만 본다 — 나란히 선 두 伏図에서
    // 세로 거리만으로 고르면 옆 블록의 제목이 붙는다
    let title: string | undefined
    let titleDistance = Number.POSITIVE_INFINITY
    for (const candidate of titles) {
      if (distanceToRange(candidate.x, xExtent.min, xExtent.max) > 0) continue
      const distance = distanceToRange(candidate.y, yExtent.min, yExtent.max)
      if (distance < titleDistance) {
        title = candidate.text
        titleDistance = distance
      }
    }

    blocks.push({
      ...(title === undefined ? {} : { title }),
      xGrid,
      yGrid,
      xAxes,
      yAxes,
      placements,
      unplacedMarks,
    })
  }

  return blocks.sort(
    (a, b) =>
      a.xAxes[0].positionPt - b.xAxes[0].positionPt ||
      a.yAxes[0].positionPt - b.yAxes[0].positionPt,
  )
}

export function parseFramingPlan(page: TextPage): ParsedFramingPlan {
  const { labels, dimensions, marks, titles } = collectTokens(page)

  const issues: PlanGridIssue[] = []
  const issue = (code: PlanGridIssue) => {
    if (!issues.includes(code)) issues.push(code)
  }

  if (labels.length === 0) {
    return { grids: [], blocks: [], issues: ['通り芯ラベル未検出'] }
  }

  // 라벨 문자열이 가로로 놓여도 밴드(축의 늘어선 방향)는 세로일 수 있다 —
  // 두 방향 다 묶어 보고, 검증(중점 치수·축척)이 가짜 밴드를 걸러낸다.
  const validated = [
    ...axisSequences(labels, 'x'),
    ...axisSequences(labels, 'y'),
  ].flatMap((sequence) => {
    const result = validateSequence(sequence, dimensions, issue)
    return result ? [result] : []
  })

  const grids: PlanGridCandidate[] = []
  const seen = new Set<string>()
  for (const sequence of validated) {
    const candidate = gridCandidate(sequence)
    const key = [
      candidate.direction,
      candidate.axes.map((axis) => axis.label).join(','),
      candidate.spansMm.join(','),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    grids.push(candidate)
  }
  grids.sort(
    (a, b) =>
      a.direction.localeCompare(b.direction) ||
      a.axes[0].positionPt - b.axes[0].positionPt,
  )

  const blocks = buildBlocks(
    validated.filter((sequence) => sequence.direction === 'X'),
    validated.filter((sequence) => sequence.direction === 'Y'),
    marks,
    titles,
  )

  return { grids, blocks, issues }
}
