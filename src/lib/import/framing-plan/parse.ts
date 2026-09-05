import {
  compact,
  recoverRows,
  verticalRuns,
  VERTICAL_RUN_GAP_RATIO,
  type TextSegment,
  type VerticalRun,
} from '../runs'
import type { TextItem } from '../types'
import type { TextPage } from '../section-list/types'

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
const SIMPLE_AXIS_LABEL_PATTERN = /^(?:[A-Z](?:')?|\d{1,2})$/
const SIMPLE_NUMERIC_LABEL_PATTERN = /^\d$/
/** 치수 문자열 — 쉼표 구분(6,000)과 무구분(8700) 둘 다 실물에 있다 */
export const DIMENSION_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d{2,})$/
/**
 * 부재 부호. 断面リスト의 것(section-list의 MARK_PATTERN)에 S(床板)를 더했다 —
 * 伏図에는 스ラブ 부호가 나오고 리스트 표에는 나오지 않는다.
 */
const MARK_PATTERN = /^(?:C|G|FC|FG|B|CB|S|W)\d+[A-Z]?$/
/** 블록 제목. 「2階床伏図1/100」처럼 축척이 붙어 오므로 부분 일치로 본다 */
const BLOCK_TITLE_PATTERN = /伏図|柱芯線図/

// 실측 기반 허용오차. 근거는 스파이크 실측값이고 ADR-030에 적었다.
/** 라벨을 같은 밴드로 보는 고정 좌표 허용오차. 실측 편차는 1pt 미만이다 */
const BAND_TOLERANCE_PT = 8
/** 치수 열이 라벨 밴드에서 떨어질 수 있는 거리. 실측 최대 50pt(kani X) */
const DIMENSION_WINDOW_PT = 60
/** 치수 중심과 인접 축 중점의 어긋남 허용. 36면의 반환 격자·블록에서 실측한
 *  채택 이탈 최댓값 A는 10.379846pt(saiki-p2, X 2–1, 「700」)다.
 *  같은 치수 창(라벨 밴드 ±60pt)의 미채택 경쟁 이탈 최솟값 B는
 *  0.018265pt(hirosaki-p25, Y Y8–Y9, 「24000」合計)다. 合計 미확인 축만
 *  보아도 B는 6.180000pt(karatsu-fukuzu-p1, Y Y1–Y0, 「180」)이므로
 *  A ≤ 15 < B는 불성립이다. 중점 거리만의 안전 여백을 주장하지 않는다.
 *  T=4/6/15/30/40에서 격자 면은 23/23/26/26/26, 블록 면은 7/15/16/16/16.
 *  골든 7면의 전체 출력은 T=6만 15와 같고 4·30·40은 다르다(30은 issues만).
 *  재현·좌표 근거: phases/42-plan-grid-soundness/step0-report.json */
const MIDPOINT_TOLERANCE_PT = 15
/** 스팬별 실측 축척(pt/mm)의 중앙값 대비 허용 편차. 실측 최대 0.5% */
const SCALE_TOLERANCE_RATIO = 0.03
/**
 * 伏図 후보의 실측 축척 범위: 1:1000–1:10 (pt/mm = 72 / 25.4 / 분모).
 * 建築工事設計図書作成基準 R2 §4.2, 인쇄 p9의 基礎伏図·各階床伏図는
 * 1:100·1:200, 확대는 1:10까지 허용한다: https://www.mlit.go.jp/common/001157950.pdf
 * 축소 PDF도 읽도록 1:200의 선형 5배 축소까지 범위를 연다(A0→A4는 4배).
 * 이는 배근 규준값이 아니라 제품의 인식 범위다. 그 밖은 근사하지 않는다.
 * 36면의 나머지 53후보는 0.009448–0.028350 pt/mm로, 하한 대비 3.33배,
 * 상한까지 10.00배 여유가 있다. 코퍼스 극값으로 경계를 정하지 않았다.
 * 재계측·한계: phases/42-plan-grid-soundness/step1-report.json
 */
const MIN_PLAN_SCALE_PT_PER_MM = 72 / 25.4 / 1000
const MAX_PLAN_SCALE_PT_PER_MM = 72 / 25.4 / 10
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
/**
 * X·Y 열 짝지음 상한 ＝ X 通り芯의 중앙값 실측 스팬 × 이 비율.
 * 페이지 축척에 따라 함께 변하고, Y 라벨 띠가 대표 스팬 1.5칸보다 멀면
 * 같은 伏図이라는 기하 근거가 없으므로 블록을 내지 않는다.
 */
const GRID_PAIRING_DISTANCE_RATIO = 1.5

interface LabelToken {
  label: string
  letter?: 'X' | 'Y'
  /** prefix가 없는 숫자·알파벳 라벨은 방향을 이름만으로 알 수 없다 */
  simpleKind?: 'numeric' | 'alpha'
  x: number
  y: number
  /** 세그먼트의 원시 바운딩 박스 중심. strict 축척 검증에만 사용한다. */
  rawY: number
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
  simpleKinds: Set<'numeric' | 'alpha'>
  /** positionPt가 어느 좌표인가 — 치수 매칭이 같은 좌표를 봐야 한다 */
  alongKey: 'x' | 'y'
  /** 밴드의 고정 좌표(평균) — 치수 창의 기준 */
  across: number
  /** 밴드가 끊겨 같은 축을 이어 붙인 경우 구간별 원래 밴드 좌표 */
  axisAcross: number[]
  /** 같은 라벨이 여러 밴드에 있었을 때 치수 열을 시도할 좌표 */
  axisAcrossOptions: number[][]
  axes: AxisCandidate[]
  /** 라벨 세그먼트의 원시 중심으로 잰 축 위치 — 공개 후보 좌표와 분리한다 */
  validationPositionsPt: number[]
}

/** 치수·축척까지 확인이 끝난 축 열. 그리드 정의와 블록이 둘 다 여기서 나온다 */
interface ValidatedSequence extends AxisSequence {
  direction?: 'X' | 'Y'
  spansMm: number[]
  scalePtPerMm: number
  totalConfirmed: boolean
}

type DirectedSequence = ValidatedSequence & { direction: 'X' | 'Y' }

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
function splitAxisLabels(
  segment: TextSegment,
  y: number,
  rowSegments: TextSegment[],
): LabelToken[] {
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
  if (/^[a-z]?[XY]/.test(text)) {
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
        rawY: segment.centerY,
      })
    }
  }

  if (tokens.length > 0) return tokens

  const simple = compact(text)
  if (!SIMPLE_AXIS_LABEL_PATTERN.test(simple)) return []

  // `56`처럼 하나의 pdf.js 세그먼트에 두 개의 한 자리 라벨이 붙는 경우만
  // 실제 문자 좌표로 되가른다. 10·11 같은 두 자리 라벨은 주변에 연속된 한
  // 자리 라벨이 있을 때만 쪼개므로, 일반 치수 문자열을 축으로 오인하지 않는다.
  if (
    simple.length === 2 &&
    /^[0-9]{2}$/.test(simple) &&
    segment.items.length === 2 &&
    segment.items.every((item) => SIMPLE_NUMERIC_LABEL_PATTERN.test(compact(item.str)))
  ) {
    const nearbyNumbers = rowSegments
      .filter((candidate) => candidate !== segment)
      .map((candidate) => compact(candidate.text))
      .filter((candidate) => SIMPLE_NUMERIC_LABEL_PATTERN.test(candidate))
      .map((candidate) => Number(candidate))
    const first = Number(simple[0])
    const second = Number(simple[1])
    const min = Math.min(...nearbyNumbers)
    const max = Math.max(...nearbyNumbers)
    const fillsGap =
      nearbyNumbers.length > 0 &&
      first + 1 === second &&
      min < first &&
      max > second
    if (fillsGap) {
      return segment.items.map((item) => {
        const piece = compact(item.str)
        return {
          label: piece,
          simpleKind: 'numeric',
          x: item.x + item.w / 2,
          y,
          rawY: segment.centerY,
        }
      })
    }
  }

  return [
    {
      label: simple,
      simpleKind: /^[0-9]+$/.test(simple) ? 'numeric' : 'alpha',
      x: segment.centerX,
      y,
      rawY: segment.centerY,
    },
  ]
}

interface CollectedTokens {
  labels: LabelToken[]
  dimensions: DimensionToken[]
  marks: PositionedToken[]
  titles: PositionedToken[]
}

/**
 * CMap이 글자마다 별도 아이템을 만든 세로 치수를 보완한다. `verticalRuns`의
 * 공개 문턱은 바꾸지 않고, 그 결과가 한 글자씩 남은 경우에만 같은 열의 인접
 * 조각을 다시 이어 붙인다. 조각 안쪽의 최소 간격을 기준으로 삼고 기존 세로
 * 런의 배수(`VERTICAL_RUN_GAP_RATIO`)를 그대로 사용하므로, 페이지 크기나
 * 발주처에 종속된 절대 좌표 문턱을 만들지 않는다.
 */
function mergeVerticalFragments(items: TextItem[]): VerticalRun[] {
  const runs = verticalRuns(items)
  const columns = new Map<number, VerticalRun[]>()
  for (const run of runs) {
    const column = columns.get(run.x)
    if (column) column.push(run)
    else columns.set(run.x, [run])
  }

  const merged: VerticalRun[] = []
  for (const column of columns.values()) {
    const ordered = [...column].sort((left, right) => right.y - left.y)
    const oneCharGaps = ordered
      .slice(1)
      .map((run, index) => ordered[index].y - run.y)
      .filter(
        (gap, index) =>
          gap > 0 &&
          ordered[index].text.length === 1 &&
          ordered[index + 1].text.length === 1,
      )
    const baseGap = Math.min(...oneCharGaps)
    if (!Number.isFinite(baseGap)) {
      merged.push(...ordered)
      continue
    }

    let current: VerticalRun[] = []
    const flush = () => {
      if (current.length === 0) return
      merged.push({
        text: current.map((run) => run.text).join(''),
        x: current[0].x,
        y:
          current.reduce((total, run) => total + run.y, 0) / current.length,
      })
      current = []
    }

    for (const run of ordered) {
      const previous = current.at(-1)
      const gap = previous ? previous.y - run.y : Number.POSITIVE_INFINITY
      const adjacent =
        previous !== undefined &&
        previous.text.length === 1 &&
        run.text.length === 1 &&
        gap <= baseGap * VERTICAL_RUN_GAP_RATIO
      if (!adjacent) flush()
      current.push(run)
    }
    flush()
  }

  return merged
}

function collectTokens(page: TextPage): CollectedTokens {
  const labels: LabelToken[] = []
  const dimensions: DimensionToken[] = []
  const marks: PositionedToken[] = []
  const titles: PositionedToken[] = []

  const classify = (text: string, x: number, y: number) => {
    const normalizedText = compact(text)
    if (
      DIMENSION_PATTERN.test(normalizedText) &&
      !SIMPLE_AXIS_LABEL_PATTERN.test(normalizedText)
    ) {
      dimensions.push({
        valueMm: Number.parseInt(normalizedText.replaceAll(',', ''), 10),
        x,
        y,
      })
      return
    }
    if (MARK_PATTERN.test(normalizedText)) {
      marks.push({ text: normalizedText, x, y })
      return
    }
    if (BLOCK_TITLE_PATTERN.test(normalizedText)) {
      titles.push({ text: normalizedText, x, y })
    }
  }

  for (const row of recoverRows(page.items)) {
    for (const segment of row.segments) {
      labels.push(...splitAxisLabels(segment, row.y, row.segments))
      classify(segment.compact, segment.centerX, row.y)
    }
  }

  // 세로쓰기는 문자 좌표가 세로로 흐르므로 되가르기를 걸지 않는다 — 실측 코퍼스의
  // 세로 런은 치수뿐이고, 세로 라벨이 붙어 나오는 도면은 빈 후보로 실패한다 (R10)
  for (const run of mergeVerticalFragments(page.items)) {
    const normalizedText = compact(run.text)
    if (/^[a-z]?[XY]\d+$/.test(normalizedText)) {
      labels.push({
        label: normalizedText,
        letter: normalizedText.includes('X') ? 'X' : 'Y',
        x: run.x,
        y: run.y,
        rawY: run.y,
      })
      continue
    }
    classify(normalizedText, run.x, run.y)
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
          letters: new Set(
            current.flatMap((token) =>
              token.letter === undefined ? [] : [token.letter],
            ),
          ),
          simpleKinds: new Set(
            current.flatMap((token) =>
              token.simpleKind === undefined ? [] : [token.simpleKind],
            ),
          ),
          alongKey: along,
          across:
            current.reduce((total, token) => total + token[across], 0) /
            current.length,
          axisAcross: current.map((token) => token[across]),
          axisAcrossOptions: current.map((token) => [token[across]]),
          axes: current.map((token) => ({
            label: token.label,
            positionPt: token[along],
          })),
          validationPositionsPt: current.map((token) =>
            along === 'x' ? token.x : token.rawY,
          ),
        })
      }
      current = []
    }

    for (const token of ordered) {
      const currentHasNamedLabels = current.some(
        (seen) => seen.letter !== undefined,
      )
      const tokenHasNamedLabel = token.letter !== undefined
      const currentSimpleKinds = new Set(
        current.flatMap((seen) =>
          seen.simpleKind === undefined ? [] : [seen.simpleKind],
        ),
      )
      const tokenChangesLabelForm =
        current.length > 0 &&
        (currentHasNamedLabels !== tokenHasNamedLabel ||
          (currentSimpleKinds.size > 0 &&
            token.simpleKind !== undefined &&
            !currentSimpleKinds.has(token.simpleKind)))
      if (tokenChangesLabelForm) flush()
      if (current.some((seen) => seen.label === token.label)) flush()
      current.push(token)
    }
    flush()
  }

  return sequences
}

/**
 * 라벨 하나가 다른 대역으로 밀려도, 같은 축의 끝 라벨이 같은 위치에서
 * 이어지면 한 열로 접는다. Karatsu 후쿠즈에서는 Y6~Y2가 한쪽 대역에,
 * Y2~Y0가 다른 대역에 있어 Y1만 한쪽에 빠져 있다. 대역 전체를 넓혀 버리면
 * 옆 도면을 삼키므로, 끝 라벨·좌표가 모두 겹치는 경우에만 접는다.
 */
function mergeAxisSequences(sequences: AxisSequence[]): AxisSequence[] {
  const merged = [...sequences]
  let changed = true

  while (changed) {
    changed = false
    outer: for (let leftIndex = 0; leftIndex < merged.length; leftIndex++) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < merged.length;
        rightIndex++
      ) {
        const left = merged[leftIndex]
        const right = merged[rightIndex]
        if (left.alongKey !== right.alongKey) continue
        if (
          left.letters.size !== right.letters.size ||
          [...left.letters].some((letter) => !right.letters.has(letter)) ||
          left.simpleKinds.size !== right.simpleKinds.size ||
          [...left.simpleKinds].some((kind) => !right.simpleKinds.has(kind))
        ) {
          continue
        }

        const joins = (
          first: AxisSequence,
          second: AxisSequence,
        ): AxisSequence | undefined => {
          const firstAxis = first.axes.at(-1)
          const secondAxis = second.axes[0]
          if (
            !firstAxis ||
            !secondAxis ||
            firstAxis.label !== secondAxis.label ||
            Math.abs(firstAxis.positionPt - secondAxis.positionPt) >
              MIDPOINT_TOLERANCE_PT
          ) {
            return undefined
          }
          const axes = [...first.axes, ...second.axes.slice(1)]
          if (
            axes.length <= Math.max(first.axes.length, second.axes.length) ||
            axes.some(
              (axis, index) =>
                index > 0 &&
                axis.positionPt <= axes[index - 1].positionPt,
            )
          ) {
            return undefined
          }
          const axisAcross = [
            ...first.axisAcross,
            ...second.axisAcross.slice(1),
          ]
          const axisAcrossOptions = [
            ...first.axisAcrossOptions,
            ...second.axisAcrossOptions.slice(1),
          ]
          return {
            letters: new Set(first.letters),
            simpleKinds: new Set(first.simpleKinds),
            alongKey: first.alongKey,
            across:
              axisAcross.reduce((total, value) => total + value, 0) /
              axisAcross.length,
            axisAcross,
            axisAcrossOptions,
            axes,
            validationPositionsPt: [
              ...first.validationPositionsPt,
              ...second.validationPositionsPt.slice(1),
            ],
          }
        }

        const union = (): AxisSequence | undefined => {
          const shared = left.axes.some((leftAxis) =>
            right.axes.some(
              (rightAxis) =>
                rightAxis.label === leftAxis.label &&
                Math.abs(rightAxis.positionPt - leftAxis.positionPt) <=
                  MIDPOINT_TOLERANCE_PT,
            ),
          )
          if (!shared) return undefined

          const entries = [...left.axes, ...right.axes]
            .map((axis, index) => ({
              axis,
              validationPositionPt:
                index < left.axes.length
                  ? left.validationPositionsPt[index]
                  : right.validationPositionsPt[index - left.axes.length],
              acrossOptions:
                index < left.axes.length
                  ? left.axisAcrossOptions[index]
                  : right.axisAcrossOptions[index - left.axes.length],
            }))
            .sort((firstEntry, secondEntry) =>
              firstEntry.axis.positionPt - secondEntry.axis.positionPt,
            )
          const unique: typeof entries = []
          for (const entry of entries) {
            const duplicate = unique.find(
              (seen) =>
                seen.axis.label === entry.axis.label &&
                Math.abs(seen.axis.positionPt - entry.axis.positionPt) <=
                  MIDPOINT_TOLERANCE_PT,
            )
            if (duplicate) {
              duplicate.acrossOptions = [
                ...new Set([...duplicate.acrossOptions, ...entry.acrossOptions]),
              ]
            } else {
              unique.push(entry)
            }
          }
          if (unique.length <= Math.max(left.axes.length, right.axes.length)) {
            return undefined
          }
          const axisAcrossOptions = unique.map((entry) => entry.acrossOptions)
          const axisAcross = axisAcrossOptions.map(
            (options) => options[0] ?? left.across,
          )
          return {
            letters: new Set(left.letters),
            simpleKinds: new Set(left.simpleKinds),
            alongKey: left.alongKey,
            across:
              axisAcross.reduce((total, value) => total + value, 0) /
              axisAcross.length,
            axisAcross,
            axisAcrossOptions,
            axes: unique.map((entry) => entry.axis),
            validationPositionsPt: unique.map(
              (entry) => entry.validationPositionPt,
            ),
          }
        }

        const joined = joins(left, right) ?? joins(right, left) ?? union()
        if (!joined) continue
        merged.splice(rightIndex, 1)
        merged.splice(leftIndex, 1, joined)
        changed = true
        break outer
      }
    }
  }

  return merged
}

/** 인접 축 쌍의 중점에서, 라벨 밴드의 치수 창 안에 있는 치수를 모은다 */
function dimensionCandidatesAt(
  dimensions: DimensionToken[],
  used: Set<DimensionToken>,
  along: 'x' | 'y',
  across: 'x' | 'y',
  midpoint: number,
  bandAcross: number,
): DimensionToken[] {
  return dimensions
    .filter((token) => {
      if (used.has(token)) return false
    const alongDistance = Math.abs(token[along] - midpoint)
      return (
        alongDistance <= MIDPOINT_TOLERANCE_PT &&
        Math.abs(token[across] - bandAcross) <= DIMENSION_WINDOW_PT
      )
    })
    .sort(
      (left, right) =>
        Math.abs(left[along] - midpoint) - Math.abs(right[along] - midpoint),
    )
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

interface DimensionSolution {
  spans: DimensionToken[]
  scalePtPerMm: number
  scaleValid: boolean
  midpointDistance: number
}

/**
 * 같은 중점에 여러 치수 열이 놓인 경우를 최근접 하나로 자르지 않는다. 각
 * 조합을 축척 검증까지 통과시킨 뒤, 값 배열이 하나로 수렴할 때만 후보를
 * 만든다. 이로써 Fuji의 벽면 열과 스팬 열을 구별하고, Hirosaki의 전체
 * 치수가 한 인접 중점과 겹치는 경우에도 전체 치수를 스팬으로 소비하지 않는다.
 */
function dimensionSolutions(
  sequence: AxisSequence,
  dimensions: DimensionToken[],
): DimensionSolution[] {
  const choices: DimensionToken[][] = []
  for (let i = 0; i + 1 < sequence.axes.length; i++) {
    const midpoint =
      (sequence.axes[i].positionPt + sequence.axes[i + 1].positionPt) / 2
    const candidates = dimensionCandidatesAtAcrossOptions(
      dimensions,
      new Set(),
      sequence.alongKey,
      sequence.alongKey === 'y' ? 'x' : 'y',
      midpoint,
      [
        ...(sequence.axisAcrossOptions[i] ?? []),
        ...(sequence.axisAcrossOptions[i + 1] ?? []),
      ],
    )
    if (candidates.length === 0) return []
    choices.push(candidates)
  }

  const solutions: DimensionSolution[] = []
  const selected: DimensionToken[] = []
  const used = new Set<DimensionToken>()

  const visit = (index: number) => {
    if (solutions.length >= 4096) return
    if (index === choices.length) {
      const scales = selected.map(
        (span, i) =>
          (sequence.validationPositionsPt[i + 1] -
            sequence.validationPositionsPt[i]) /
          span.valueMm,
      )
      const medianScale = median(scales)
      const outlierCount = scales.filter(
        (scale) => Math.abs(scale / medianScale - 1) > SCALE_TOLERANCE_RATIO,
      ).length
      solutions.push({
        spans: [...selected],
        scalePtPerMm: medianScale,
        midpointDistance: selected.reduce(
          (total, span, spanIndex) =>
            total +
              Math.abs(
                span[sequence.alongKey] -
                  (sequence.axes[spanIndex].positionPt +
                    sequence.axes[spanIndex + 1].positionPt) /
                    2,
              ),
          0,
        ),
        scaleValid: outlierCount === 0,
      })
      return
    }

    for (const candidate of choices[index]) {
      if (used.has(candidate)) continue
      used.add(candidate)
      selected.push(candidate)
      visit(index + 1)
      selected.pop()
      used.delete(candidate)
      if (solutions.length >= 4096) return
    }
  }

  visit(0)
  const unique = new Map<string, DimensionSolution>()
  for (const solution of solutions) {
    const key = solution.spans.map((span) => span.valueMm).join(',')
    if (!unique.has(key)) unique.set(key, solution)
  }
  return [...unique.values()]
}

function totalCandidates(
  sequence: AxisSequence,
  dimensions: DimensionToken[],
  used: Set<DimensionToken>,
  firstIndex: number,
  lastIndex: number,
): DimensionToken[] {
  const midpoint =
    (sequence.axes[firstIndex].positionPt +
      sequence.axes[lastIndex].positionPt) /
    2
  return dimensionCandidatesAtAcrossOptions(
    dimensions,
    used,
    sequence.alongKey,
    sequence.alongKey === 'y' ? 'x' : 'y',
    midpoint,
    [
      ...(sequence.axisAcrossOptions[firstIndex] ?? []),
      ...(sequence.axisAcrossOptions[lastIndex] ?? []),
    ],
  )
}

interface PartialTotal {
  firstIndex: number
  lastIndex: number
  token: DimensionToken
}

/**
 * 축의 한쪽 끝에서 시작하는 연속 구간의 부분 합만 쓴다. 부분 합이 확인하는
 * 스팬보다 미확정 스팬이 많으면 작은 국소 합을 전체 축의 근거로 오인하기
 * 쉬우므로 무시한다(예: Karatsu의 4,010·4,165). 내부 구간은 부분합과
 * 축을 혼동하기 쉽기 때문에 쓰지 않는다.
 */
function partialTotal(
  sequence: AxisSequence,
  solution: DimensionSolution,
  dimensions: DimensionToken[],
): PartialTotal | undefined {
  const spanCount = solution.spans.length
  const used = new Set(solution.spans)

  const hasMoreConfirmedThanUnresolved = (coveredSpanCount: number) => {
    const unresolvedSpanCount = spanCount - coveredSpanCount
    return coveredSpanCount > unresolvedSpanCount
  }

  for (let lastIndex = sequence.axes.length - 2; lastIndex >= 1; lastIndex--) {
    const coveredSpanCount = lastIndex
    const covered = solution.spans
      .slice(0, lastIndex)
      .reduce((sum, span) => sum + span.valueMm, 0)
    if (!hasMoreConfirmedThanUnresolved(coveredSpanCount)) continue
    const match = totalCandidates(
      sequence,
      dimensions,
      used,
      0,
      lastIndex,
    ).find((candidate) => candidate.valueMm === covered)
    if (match) return { firstIndex: 0, lastIndex, token: match }
  }

  for (let firstIndex = 1; firstIndex < sequence.axes.length - 1; firstIndex++) {
    const coveredSpanCount = sequence.axes.length - 1 - firstIndex
    const covered = solution.spans
      .slice(firstIndex)
      .reduce((sum, span) => sum + span.valueMm, 0)
    if (!hasMoreConfirmedThanUnresolved(coveredSpanCount)) continue
    const match = totalCandidates(
      sequence,
      dimensions,
      used,
      firstIndex,
      sequence.axes.length - 1,
    ).find((candidate) => candidate.valueMm === covered)
    if (match) {
      return {
        firstIndex,
        lastIndex: sequence.axes.length - 1,
        token: match,
      }
    }
  }

  return undefined
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
  const solutions = dimensionSolutions(sequence, dimensions)
  if (solutions.length === 0) {
    const hasEverySpanCandidate = sequence.axes
      .slice(0, -1)
      .every((axis, index) => {
        const midpoint =
          (axis.positionPt + sequence.axes[index + 1].positionPt) / 2
        return (
          dimensionCandidatesAtAcrossOptions(
            dimensions,
            new Set(),
            sequence.alongKey,
            sequence.alongKey === 'y' ? 'x' : 'y',
            midpoint,
            [
              ...(sequence.axisAcrossOptions[index] ?? []),
              ...(sequence.axisAcrossOptions[index + 1] ?? []),
            ],
          ).length > 0
        )
      })
    issue(hasEverySpanCandidate ? '縮尺不整合' : '寸法欠落')
    return undefined
  }

  const fullTotals = solutions.map((solution) => {
    const used = new Set(solution.spans)
    const spanSum = solution.spans.reduce((sum, span) => sum + span.valueMm, 0)
    const candidates =
      sequence.axes.length >= 3
        ? totalCandidates(
            sequence,
            dimensions,
            used,
            0,
            sequence.axes.length - 1,
          )
        : []
    return {
      solution,
      spanSum,
      candidates,
      matching: candidates.some((candidate) => candidate.valueMm === spanSum),
    }
  })
  const matchingTotals = fullTotals.filter((candidate) => candidate.matching)
  if (matchingTotals.length > 0) {
    const unique = new Map<string, (typeof matchingTotals)[number]>()
    for (const candidate of matchingTotals) {
      const key = candidate.solution.spans.map((span) => span.valueMm).join(',')
      if (!unique.has(key)) unique.set(key, candidate)
    }
    if (unique.size > 1) {
      issue('寸法列曖昧')
      return undefined
    }
    const selected = [...unique.values()][0]
    return {
      ...sequence,
      direction: [...sequence.letters][0],
      spansMm: selected.solution.spans.map((span) => span.valueMm),
      scalePtPerMm: selected.solution.scalePtPerMm,
      totalConfirmed: true,
    }
  }

  const scaleValidTotals = fullTotals.filter(
    ({ solution }) => solution.scaleValid,
  )
  if (scaleValidTotals.length === 0) {
    issue('縮尺不整合')
    return undefined
  }

  const closestDistance = Math.min(
    ...scaleValidTotals.map(({ solution }) => solution.midpointDistance),
  )
  const closestScaleValidTotals = scaleValidTotals.filter(
    ({ solution }) => solution.midpointDistance === closestDistance,
  )

  const maximumSpan = Math.max(
    ...closestScaleValidTotals.flatMap((candidate) =>
      candidate.solution.spans.map((span) => span.valueMm),
    ),
  )
  const conflictingTotals = closestScaleValidTotals.some(
    ({ candidates, spanSum }) =>
      candidates.some(
        (candidate) =>
          candidate.valueMm >= maximumSpan && candidate.valueMm !== spanSum,
      ),
  )
  if (conflictingTotals) {
    issue('合計不一致')
    return undefined
  }

  const partials = closestScaleValidTotals
    .map(({ solution }) => partialTotal(sequence, solution, dimensions))
    .filter((candidate): candidate is PartialTotal => candidate !== undefined)
  if (partials.length > 0) {
    const first = partials[0]
    const same = partials.every(
      (candidate) =>
        candidate.firstIndex === first.firstIndex &&
        candidate.lastIndex === first.lastIndex &&
        candidate.token.valueMm === first.token.valueMm,
    )
    if (!same) {
      issue('寸法列曖昧')
      return undefined
    }
    const solution = closestScaleValidTotals[0]?.solution
    if (!solution) return undefined
    return {
      ...sequence,
      direction: [...sequence.letters][0],
      axes: sequence.axes.slice(first.firstIndex, first.lastIndex + 1),
      spansMm: solution.spans
        .slice(first.firstIndex, first.lastIndex)
        .map((span) => span.valueMm),
      scalePtPerMm: solution.scalePtPerMm,
      totalConfirmed: true,
    }
  }

  const unique = new Map<string, DimensionSolution>()
  for (const solution of closestScaleValidTotals.map(
    ({ solution }) => solution,
  )) {
    const key = solution.spans.map((span) => span.valueMm).join(',')
    if (!unique.has(key)) unique.set(key, solution)
  }
  if (unique.size > 1) {
    issue('寸法列曖昧')
    return undefined
  }
  const selected = [...unique.values()][0]

  return {
    ...sequence,
    direction: [...sequence.letters][0],
    spansMm: selected.spans.map((span) => span.valueMm),
    scalePtPerMm: selected.scalePtPerMm,
    totalConfirmed: false,
  }
}

function dimensionCandidatesAtAcrossOptions(
  dimensions: DimensionToken[],
  used: Set<DimensionToken>,
  along: 'x' | 'y',
  across: 'x' | 'y',
  midpoint: number,
  acrossOptions: number[],
): DimensionToken[] {
  const candidates = new Map<DimensionToken, number>()
  for (const bandAcross of acrossOptions) {
    for (const candidate of dimensionCandidatesAt(
      dimensions,
      used,
      along,
      across,
      midpoint,
      bandAcross,
    )) {
      const distance = Math.abs(candidate[along] - midpoint)
      const previous = candidates.get(candidate)
      if (previous === undefined || distance < previous) {
        candidates.set(candidate, distance)
      }
    }
  }
  return [...candidates.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([candidate]) => candidate)
}

/**
 * 접두가 없는 라벨은 문자열만으로 X·Y를 결정할 수 없다. 같은 페이지의
 * 서로 직교한 두 축이 모두 있으면, 두 축의 실측 총 길이가 긴 쪽을 X로
 * 정한다. 축의 이름을 발주처 관행으로 추측하지 않고, 이미 검증한 치수와
 * 기하만 사용한다. 한 축만 남은 경우에는 숫자/알파벳 표기의 관례를
 * 보조적으로 사용하되, 기존처럼 두 축 후보를 모두 검사한 뒤에만 낸다.
 */
function directSequences(
  sequences: ValidatedSequence[],
): DirectedSequence[] {
  const directed = sequences.filter(
    (sequence): sequence is DirectedSequence => sequence.direction !== undefined,
  )
  const undirected = sequences.filter(
    (sequence) => sequence.direction === undefined,
  )
  if (undirected.length === 0) return directed

  const alongX = undirected.filter((sequence) => sequence.alongKey === 'x')
  const alongY = undirected.filter((sequence) => sequence.alongKey === 'y')

  // 같은 방향으로 놓인 숫자·알파벳 축은 숫자를 X, 알파벳을 Y로 읽는다.
  // 이 판정은 단순한 표기 관례가 아니라 실제로 두 축이 서로 짝지어지는지
  // 확인한 뒤에만 적용한다. Ina에서는 A·B 대역 하나가 숫자 1·2·3 대역의
  // 옆에 있고, 다른 A·B 대역은 별도 표의 잡음이라 거리 검사가 그것을 고른다.
  const numeric = undirected.filter((sequence) =>
    sequence.simpleKinds.has('numeric'),
  )
  const alpha = undirected.filter((sequence) =>
    sequence.simpleKinds.has('alpha'),
  )
  const hasPairedParallelAxes = numeric.some((numericSequence) =>
    alpha.some(
      (alphaSequence) =>
        numericSequence.alongKey === alphaSequence.alongKey &&
        distanceToRange(
          alphaSequence.across,
          extent(numericSequence.axes).min,
          extent(numericSequence.axes).max,
        ) <=
          median(spanLengths(numericSequence.axes)) *
            GRID_PAIRING_DISTANCE_RATIO,
    ),
  )
  if (hasPairedParallelAxes) {
    return [
      ...directed,
      ...undirected.map((sequence) => ({
        ...sequence,
        direction: (sequence.simpleKinds.has('numeric') ? 'X' : 'Y') as
          | 'X'
          | 'Y',
      })),
    ]
  }

  if (alongX.length > 0 && alongY.length > 0) {
    const sum = (sequence: ValidatedSequence) =>
      sequence.spansMm.reduce((total, span) => total + span, 0)
    const xLength = median(alongX.map(sum))
    const yLength = median(alongY.map(sum))
    const xAlong: 'x' | 'y' = xLength >= yLength ? 'x' : 'y'
    return [
      ...directed,
      ...undirected.map((sequence) => ({
        ...sequence,
        direction: (sequence.alongKey === xAlong ? 'X' : 'Y') as 'X' | 'Y',
      })),
    ]
  }

  return [
    ...directed,
    ...undirected.map((sequence) => ({
      ...sequence,
      direction: (sequence.simpleKinds.has('numeric') ? 'X' : 'Y') as 'X' | 'Y',
    })),
  ]
}

function sameAxisTail(
  candidate: AxisSequence,
  other: AxisSequence,
): boolean {
  if (candidate === other || candidate.alongKey !== other.alongKey) return false
  if (candidate.axes.length >= other.axes.length) return false
  return candidate.axes.every((axis) =>
    other.axes.some(
      (otherAxis) =>
        otherAxis.label === axis.label &&
        Math.abs(otherAxis.positionPt - axis.positionPt) <=
          MIDPOINT_TOLERANCE_PT,
    ),
  )
}

function sameAxes(left: AxisCandidate[], right: AxisCandidate[]): boolean {
  return (
    left.length === right.length &&
    left.every((axis, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        axis.label === other.label &&
        Math.abs(axis.positionPt - other.positionPt) <= MIDPOINT_TOLERANCE_PT
      )
    })
  )
}

/**
 * A broken label band can expose the same run three times (for example
 * E-D-C-B-A, D-C-B-A and C-B-A).  The middle run has no independent
 * evidence: it is enclosed by two longer/shorter copies of the same tail.
 * Keep the two boundary runs and discard only that redundant middle copy.
 */
function suppressIntermediateSequences<T extends AxisSequence>(
  sequences: T[],
): T[] {
  return sequences.filter((candidate) => {
    const firstPosition = candidate.axes[0]?.positionPt
    if (firstPosition === undefined) return true
    const hasLongerPrefix = sequences.some((other) =>
      sameAxisTail(candidate, other) &&
      sameAxes(other.axes.slice(-candidate.axes.length), candidate.axes),
    )
    const hasShorterSuffix = sequences.some((other) =>
      sameAxes(candidate.axes.slice(1), other.axes),
    )
    if (hasLongerPrefix && hasShorterSuffix) return false

    const matchingStarts = sequences
      .filter((other) => sameAxisTail(candidate, other))
      .map((other) => other.axes[0]?.positionPt)
      .filter((position): position is number => position !== undefined)
    return !(
      matchingStarts.some((position) => position < firstPosition) &&
      matchingStarts.some((position) => position > firstPosition)
    )
  })
}

function suppressEndpointSubsets<T extends AxisSequence>(sequences: T[]): T[] {
  return sequences.filter((candidate) => {
    const first = candidate.axes[0]
    const last = candidate.axes.at(-1)
    if (!first || !last) return true

    return !sequences.some((other) => {
      if (other === candidate || other.alongKey !== candidate.alongKey) {
        return false
      }
      if (other.axes.length <= candidate.axes.length) return false
      const otherFirst = other.axes[0]
      const otherLast = other.axes.at(-1)
      return (
        otherFirst?.label === first.label &&
        otherLast?.label === last.label &&
        otherFirst !== undefined &&
        otherLast !== undefined &&
        Math.abs(otherFirst.positionPt - first.positionPt) <=
          MIDPOINT_TOLERANCE_PT &&
        Math.abs(otherLast.positionPt - last.positionPt) <=
          MIDPOINT_TOLERANCE_PT
      )
    })
  })
}

function extent(axes: AxisCandidate[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const axis of axes) {
    if (axis.positionPt < min) min = axis.positionPt
    if (axis.positionPt > max) max = axis.positionPt
  }
  return { min, max }
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
    .map((axis, i) => Math.abs(axis.positionPt - axes[i].positionPt))
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
): MemberPlacement {
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

function gridCandidate(sequence: DirectedSequence): PlanGridCandidate {
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
  xSequences: DirectedSequence[],
  ySequences: DirectedSequence[],
  marks: PositionedToken[],
  titles: PositionedToken[],
  issue: (code: PlanGridIssue) => void,
): PlanBlock[] {
  const blocks: PlanBlock[] = []
  if (xSequences.length === 0 || ySequences.length === 0) return blocks

  const seen = new Set<string>()
  const claimedY = new Map<ValidatedSequence, string>()
  const enforceUniqueY = ySequences.length > 1 || xSequences.length > 1

  for (const xSequence of xSequences) {
    const xSequenceExtent = extent(xSequence.axes)
    const xKey = xSequence.axes
      .map((axis) => `${axis.label}@${Math.round(axis.positionPt)}`)
      .join(',')
    let paired: DirectedSequence | undefined
    let pairedDistance = Number.POSITIVE_INFINITY
    let tied = false
    for (const ySequence of ySequences) {
      const claimedBy = claimedY.get(ySequence)
      if (enforceUniqueY && claimedBy !== undefined && claimedBy !== xKey) {
        continue
      }
      const yExtent = extent(ySequence.axes)
      const distance = Math.max(
        distanceToRange(
          ySequence.across,
          xSequenceExtent.min,
          xSequenceExtent.max,
        ),
        distanceToRange(xSequence.across, yExtent.min, yExtent.max),
      )
      if (distance < pairedDistance) {
        paired = ySequence
        pairedDistance = distance
        tied = false
      } else if (distance === pairedDistance) {
        tied = true
      }
    }
    const pairingLimit = paired
      ? Math.max(
          median(spanLengths(xSequence.axes)),
          median(spanLengths(paired.axes)),
        ) * GRID_PAIRING_DISTANCE_RATIO
      : Number.POSITIVE_INFINITY
    if (!paired || tied || pairedDistance > pairingLimit) {
      issue('通り芯対応不明')
      continue
    }
    if (enforceUniqueY) claimedY.set(paired, xKey)

    const xGrid = gridCandidate(xSequence)
    const yGrid = gridCandidate(paired)
    const xAxes = xSequence.alongKey === 'x' ? xGrid.axes : yGrid.axes
    const yAxes = xSequence.alongKey === 'y' ? xGrid.axes : yGrid.axes
    const xExtent = extent(xAxes)
    const yExtent = extent(yAxes)
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
      placements.push(placementFor(mark.text, x, y))
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
      placements,
      unplacedMarks,
    })
  }

  const titledBlocks = blocks.filter((block) => block.title !== undefined)
  const selectedBlocks = titledBlocks.length > 0 ? titledBlocks : blocks

  return selectedBlocks.sort(
    (a, b) =>
      extent(a.xGrid.axes).min - extent(b.xGrid.axes).min ||
      extent(a.yGrid.axes).min - extent(b.yGrid.axes).min,
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
  const rawSequences = mergeAxisSequences([
    ...axisSequences(labels, 'x'),
    ...axisSequences(labels, 'y'),
  ])
  const validated = rawSequences.flatMap((sequence) => {
    const result = validateSequence(sequence, dimensions, issue)
    if (!result) return []
    // 치수 선택(전체·부분 合計 포함)이 끝난 열을 검사한다. 범위에 맞는 다른
    // 치수로 바꿔 끼우거나, 같은 좌표의 축을 삭제해 격자를 만들지 않는다.
    if (
      result.axes.some(
        (axis, index) =>
          index > 0 && axis.positionPt === result.axes[index - 1].positionPt,
      )
    ) {
      issue('通り芯座標重複')
      return []
    }
    if (
      !Number.isFinite(result.scalePtPerMm) ||
      result.scalePtPerMm < MIN_PLAN_SCALE_PT_PER_MM ||
      result.scalePtPerMm > MAX_PLAN_SCALE_PT_PER_MM
    ) {
      issue('縮尺範囲外')
      return []
    }
    return [result]
  })
  const namedSequences = validated.filter((sequence) => sequence.letters.size > 0)
  const filteredValidated = validated.filter((sequence) => {
    if (!sequence.simpleKinds.has('numeric') || sequence.letters.size > 0) {
      return true
    }
    // Section-list pages can contain two numeric values in a band that look
    // like axes. If the same positions are already occupied by a named axis,
    // the numeric pair is a duplicate annotation, not a second grid.
    return !namedSequences.some(
      (named) =>
        named.alongKey === sequence.alongKey &&
        sequence.axes.every((axis) =>
          named.axes.some(
            (namedAxis) =>
              Math.abs(namedAxis.positionPt - axis.positionPt) <=
              MIDPOINT_TOLERANCE_PT,
          ),
        ),
    )
  })
  if (filteredValidated.length === 0) {
    const hasPrefixedAxisLabel = labels.some(
      (label) => label.letter !== undefined,
    )
    // 숫자·문자형 라벨도 치수 선택 뒤 확인한 기하 실패는 그대로 알린다.
    const geometryIssues = issues.filter(
      (code) => code === '通り芯座標重複' || code === '縮尺範囲外',
    )
    return {
      grids: [],
      blocks: [],
      issues: hasPrefixedAxisLabel
        ? issues
        : geometryIssues.length > 0
          ? geometryIssues
          : ['通り芯ラベル未検出'],
    }
  }
  const directed = suppressEndpointSubsets(
    suppressIntermediateSequences(directSequences(filteredValidated)),
  )

  const grids: PlanGridCandidate[] = []
  const seen = new Set<string>()
  for (const sequence of directed) {
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
    directed.filter((sequence) => sequence.direction === 'X'),
    directed.filter((sequence) => sequence.direction === 'Y'),
    marks,
    titles,
    issue,
  )
  return { grids, blocks, issues }
}
