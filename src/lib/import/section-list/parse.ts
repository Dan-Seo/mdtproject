import {
  BAR_SIZES,
  SHEAR_BAR_SIZES,
  type BarSize,
  type ShearBarSize,
} from '@/domain/model/member'

import {
  compact,
  makeSegments,
  normalized,
  PROXIMITY_MULTIPLIER,
  recoverRows,
  verticalRuns,
  type TextRow,
  type TextSegment,
  type VerticalRun,
} from '../runs'

import type {
  CandidateIssue,
  ParsedSectionList,
  SectionCandidate,
  TextPage,
} from './types'

interface MarkColumn {
  mark: string
  centerX: number
  /** 같은 원문 셀에서 펼쳐진 부호를 값 배정 시 하나로 묶는다. */
  groupKey: string
  rawCell: string
}

interface PositionColumn {
  label: string
  rawLabel: string
  centerX: number
  mark: string
}

interface StoryRow {
  label: string
  row: TextRow
}

interface TitleAnchor {
  listKind: string
  /** 캡처가 아닌 타이틀 세그먼트 원문 — 対象外 판정은 여기를 본다 */
  titleText: string
  row: TextRow
  x: number
}

interface ParsedBar {
  size: BarSize
  count: number
}

const barSizes = new Set<BarSize>(BAR_SIZES)
// 帯筋・あばら筋だけが高強度せん断補強筋 (K13・S13) を取れる。主筋の barSizes と
// 分けているのは、主筋に入ると表5.3.4・表5.3.2 にない径を引くからだ (ADR-026)。
const shearBarSizes = new Set<ShearBarSize>(SHEAR_BAR_SIZES)

const TITLE_PATTERN =
  /(柱断面リスト|大梁断面リスト|小梁断面リスト|小梁リスト|片持梁リスト|片持スラブリスト|耐圧版リスト|壁リスト|スラブリスト|地中梁リスト|柱リスト|大梁リスト|梁リスト)/
const STORY_PATTERN = /^(?:RF|R階|\d+F|\d+階|地階)$/
const MARK_PATTERN = /^(?:(?:[A-Z]?\d*)?(?:FCG|CG|EW|BW|FS|CS|FC|FG|FB|CB|C|G|B|S|W)(?:\d+[A-Z]?|[A-Z])?|fg)$/i

/** 세로 런을 층 슬라이스에 배정할 때의 거리 상한 = 슬라이스 폭 × 이 값.
 *  배정 앵커가 층 라벨이던 동안에는 이 검사가 중간 층에서 항상 참이었다 —
 *  슬라이스가 맞닿아 있어(endY[i] == startY[i+1]) 라벨 최근접의 보로노이 경계가
 *  span/2와 정확히 일치했기 때문이다. 앵커를 표의 행으로 바꿔 상한이 실제로
 *  작동하게 됐다 (#32①, verticalsBySlice 참고) */
const SLICE_DISTANCE_LIMIT_RATIO = 0.5

/**
 * 표제란(도면 우하단 블록)의 図面名称 칸에는 그 도면의 이름이 들어간다 —
 * 「梁リスト」처럼 리스트 타이틀과 글자가 같다. 이것을 앵커로 잡으면 위 표가 거기서
 * 끊겨 마지막 층 블록의 데이터 행이 통째로 사라진다: 실물 ojkk p3에서 2F 7칸이
 * 조용히 없어졌고(符号 행은 경계 안, 데이터 행은 밖), 후보 0개짜리 유령 리스트가
 * 「인식 못 한 표가 있다」로 표시됐다.
 *
 * 라벨은 값과 따로 떨어지기도 하고(ojkk: 「図面名称」 다음 세그먼트가 「梁リスト」)
 * 한 덩이가 되기도 한다(yokohama: 「A1=1/30図面名称大梁断面リスト」) — 둘 다 본다.
 * 행 전체를 보지는 않는다: 표제란 띠는 도면 폭을 가로지르므로(ojkk 실측 x=893~1150)
 * 같은 y에 놓인 진짜 타이틀까지 함께 지워진다.
 */
const TITLE_BLOCK_LABELS = ['図面名称', '図面種別'] as const

function isTitleBlockField(
  rows: TextRow[],
  rowIndex: number,
  segmentIndex: number,
): boolean {
  const row = rows[rowIndex]
  const segment = row.segments[segmentIndex]
  if (
    TITLE_BLOCK_LABELS.some((label) => segment.compact.includes(label)) ||
    row.segments[segmentIndex - 1]?.compact.endsWith('図面名称') === true
  ) {
    return true
  }

  // 표제란은 도면 형식에 따라 「図面名称」·「図面種別」 라벨과 값이 서로 다른
  // 행으로 분리된다. 같은 y 행만 보면 값 안의 「スラブリスト」를 실제 리스트
  // 타이틀로 오인하므로, 바로 위의 가까운 라벨과 같은 표제란 열인지 확인한다.
  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const labelRow = rows[index]
    const distance = row.y - labelRow.y
    const rowBand = Math.max(row.height, labelRow.height) * 3
    if (distance > rowBand) break
    if (
      labelRow.segments.some(
        (label) =>
          TITLE_BLOCK_LABELS.includes(label.compact as (typeof TITLE_BLOCK_LABELS)[number]) &&
          segment.x >= label.x,
      )
    ) {
      return true
    }
  }
  return false
}

function titleAnchors(rows: TextRow[]): TitleAnchor[] {
  const anchors: TitleAnchor[] = []

  // 한 행에 타이틀이 여러 개면(좌우 병치) 전부 앵커로 잡는다
  for (const [rowIndex, row] of rows.entries()) {
    for (const [index, segment] of row.segments.entries()) {
      const match = segment.compact.match(TITLE_PATTERN)
      if (!match || isTitleBlockField(rows, rowIndex, index)) continue
      anchors.push({
        listKind: match[1],
        titleText: segment.compact,
        row,
        x: segment.x,
      })
    }
  }

  return anchors.sort(
    (left, right) => left.row.y - right.row.y || left.x - right.x,
  )
}

function exactLabel(row: TextRow, aliases: readonly string[]): TextSegment | undefined {
  const normalizedAliases = aliases.map(compact)
  const direct = row.segments.find((segment) =>
    normalizedAliases.includes(segment.compact),
  )
  if (direct) return direct

  // 표 형식이 아닌 PDF에서는 「腹筋2-D10」처럼 라벨과 값을 한 세그먼트에
  // 붙여 출력한다. 라벨을 못 찾았다고 행 전체를 버리지 않도록 라벨 접두만
  // 인식하고, 실제 값은 dataSegments가 접미를 따로 만든다.
  for (const segment of row.segments) {
    const alias = normalizedAliases.find(
      (candidate) =>
        segment.compact.startsWith(candidate) &&
        segment.compact.length > candidate.length,
    )
    if (alias) {
      return {
        ...segment,
        text: segment.text.slice(alias.length),
        compact: alias,
        endX: segment.x,
      }
    }
  }

  // PDF마다 「符号」·「箇所」·「STP.」가 인접 글리프 세그먼트로 갈라진다.
  // 행 복원 단계에서 무리하게 붙이면 다른 셀까지 합쳐질 수 있으므로, 여기서만
  // 인접 세그먼트의 라벨 후보를 조합하고 실제 셀 값의 배정은 기존 좌표를 쓴다.
  for (let start = 0; start < row.segments.length; start += 1) {
    let value = ''
    for (let end = start; end < row.segments.length; end += 1) {
      value += row.segments[end].compact
      if (normalizedAliases.includes(value)) {
        const first = row.segments[start]
        const last = row.segments[end]
        return {
          text: row.segments
            .slice(start, end + 1)
            .map((segment) => segment.text)
            .join(''),
          compact: value,
          items: row.segments
            .slice(start, end + 1)
            .flatMap((segment) => segment.items),
          x: first.x,
          endX: last.endX,
          centerX: (first.x + last.endX) / 2,
          centerY: (first.centerY + last.centerY) / 2,
        }
      }
      if (value.length >= Math.max(...normalizedAliases.map((alias) => alias.length))) {
        break
      }
    }
  }
  return undefined
}

/** 값이 같은 세그먼트에 붙은 「幅止め筋は…」 같은 備考를 구조화된 폭止め筋
 * 행으로 오인하지 않도록, 이 헬퍼는 행 안의 독립 라벨만 찾는다. */
function standaloneLabel(
  row: TextRow,
  aliases: readonly string[],
): TextSegment | undefined {
  const normalizedAliases = aliases.map(compact)
  return row.segments.find((segment) =>
    normalizedAliases.includes(segment.compact),
  )
}

function canonicalMark(value: string): string | undefined {
  const mark = compact(value)
  if (!MARK_PATTERN.test(mark)) return undefined
  return mark === 'fg' ? mark : mark.toUpperCase()
}

function markParts(value: string): string[] {
  return compact(value)
    .split(/[,、]/u)
    .map((part) => canonicalMark(part))
    .filter((part): part is string => part !== undefined)
}

function markColumns(row: TextRow): MarkColumn[] {
  const label = exactLabel(row, ['符号'])
  if (!label) return []

  return row.segments
    .filter((segment) => segment.centerX > label.endX)
    .flatMap((segment) => {
      const marks = markParts(segment.text)
      const groupKey = `${segment.x}:${segment.endX}`
      return marks.map((mark) => ({
        mark,
        centerX: segment.centerX,
        groupKey,
        rawCell: segment.text,
      }))
    })
}

function storyFromRow(row: TextRow): string | undefined {
  return row.segments
    .map((segment) => segment.compact)
    .find((value) => STORY_PATTERN.test(value))
}

/**
 * 회전된 리스트에서는 「R」·「2」와 「階」가 같은 행이 아니라 같은 열의
 * 연속 행으로 복원된다. 두 조각을 하나의 story 행으로만 합치고, 그 밖의
 * 숫자·문자는 층으로 승격하지 않는다 — 표의 치수나 범례를 층으로 만들면
 * 아래 데이터가 다른 층에 조용히 귀속된다.
 */
function storyRows(rows: TextRow[]): StoryRow[] {
  const result: StoryRow[] = []
  const seen = new Set<number>()

  rows.forEach((row, index) => {
    const direct = storyFromRow(row)
    if (direct !== undefined) {
      result.push({ label: direct, row })
      seen.add(index)
      return
    }

    const fragment = row.segments.find((segment) => /^(?:R|\d+)$/.test(segment.compact))
    // 스케치와 주기 텍스트가 같은 열 사이에 끼어도, 같은 x 열에서 가장 가까운
    // 「階」 조각만 결합한다. 다음 행만 보는 방식은 saiki 柱リスト처럼
    // 接合部帯筋·범위 표기가 층 조각과 suffix 사이에 놓인 형식을 놓친다.
    const suffixIndex = rows.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.segments.some(
          (segment) =>
            segment.compact === '階' &&
            fragment !== undefined &&
            Math.abs(fragment.x - segment.x) <= 1,
        ),
    )
    const suffix =
      suffixIndex >= 0
        ? rows[suffixIndex].segments.find((segment) => segment.compact === '階')
        : undefined
    if (
      fragment === undefined ||
      suffix === undefined ||
      Math.abs(fragment.x - suffix.x) > 1
    ) {
      return
    }

    const label = `${fragment.compact}階`
    if (!STORY_PATTERN.test(label) || seen.has(suffixIndex)) return
    result.push({ label, row })
    seen.add(index)
    seen.add(suffixIndex)
  })

  return result.sort((left, right) => left.row.y - right.row.y)
}

/**
 * 小梁·地中梁·基礎 리스트는 반영 대상이 아니다 (ADR-005). 캡처(listKind)는
 * 「基礎梁リスト」에서 「梁リスト」로 잘리므로 타이틀 원문을 본다.
 * 후보 분류와 인식 실패 안내가 같은 판정을 봐야 한다 — 한쪽만 고치면
 * 「후보는 対象外인데 실패 안내는 뜬다」로 조용히 갈라진다
 */
function isOutOfScopeList(titleText: string): boolean {
  return /小梁|地中梁|基礎|片持梁|片持スラブ|耐圧版/.test(titleText)
}

function kindFromMark(mark: string, titleText: string): SectionCandidate['kind'] {
  if (isOutOfScopeList(titleText)) return '対象外'
  // C1 계열은 층 접두(2C1, B1C1)까지 허용하되, FC1 같은 基礎柱 부호는
  // 기존 범위 판정처럼 柱候補로 승격하지 않는다.
  if (/^(?:C\d|\d+C\d|[A-EG-Z]\d+C\d)/i.test(mark)) return '柱'
  // 大梁은 허용된 층 접두만 벗긴 뒤 G로 시작하는 부호다. FG1·FCG1처럼
  // 부호 중간에 G가 있는 基礎系 부호를 大梁으로 승격하지 않는다.
  const markWithoutStoryPrefix = mark.replace(/^(?:R|\d+|B\d*)/i, '')
  if (/^G/i.test(markWithoutStoryPrefix)) return '大梁'
  return '対象外'
}

function median(values: number[]): number {
  if (values.length === 0) return 1
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function positionColumns(row: TextRow, marks: MarkColumn[]): PositionColumn[] {
  const label = exactLabel(row, ['位置'])
  if (!label || marks.length === 0) return []

  // 符号セルを複数の符号へ展開しても、位置列の割当単位は原文セルのまま。
  // 6符号を3列へ DP に渡すと空列を3つ作り、値を FG2/FG4/FB にだけ寄せて
  // FG1/FG3 の主筋を別値として扱うため、同じ groupKey を一列に戻す。
  const markGroups = marks.filter(
    (mark, index) =>
      marks.findIndex((candidate) => candidate.groupKey === mark.groupKey) ===
      index,
  )

  const positions = row.segments
    .filter((segment) => segment.centerX > label.endX)
    .map((segment) => ({
      label: segment.compact,
      rawLabel: segment.text,
      centerX: segment.centerX,
    }))
    .filter((position) => position.label.length > 0)

  if (positions.length === 0) return []

  const spacings = positions
    .slice(1)
    .map((position, index) => position.centerX - positions[index].centerX)
    .filter((spacing) => spacing > 0)
  const emptyPenalty = Math.pow(median(spacings) * 0.75, 2)
  const costs = Array.from({ length: markGroups.length + 1 }, () =>
    Array<number>(positions.length + 1).fill(Number.POSITIVE_INFINITY),
  )
  const choices = Array.from({ length: markGroups.length + 1 }, () =>
    Array<number>(positions.length + 1).fill(0),
  )
  costs[0][0] = 0

  for (let markIndex = 0; markIndex < markGroups.length; markIndex += 1) {
    for (let used = 0; used <= positions.length; used += 1) {
      if (!Number.isFinite(costs[markIndex][used])) continue
      for (let count = 0; used + count <= positions.length; count += 1) {
        const group = positions.slice(used, used + count)
        const mean =
          count === 0
            ? markGroups[markIndex].centerX
            : group.reduce((total, position) => total + position.centerX, 0) /
              count
        const spread =
          count === 0
            ? 0
            : group.reduce(
                (total, position) => total + Math.pow(position.centerX - mean, 2),
                0,
              ) / count
        const groupCost =
          count === 0
            ? emptyPenalty
            : Math.pow(mean - markGroups[markIndex].centerX, 2) + spread * 0.1
        const nextCost = costs[markIndex][used] + groupCost
        if (nextCost < costs[markIndex + 1][used + count]) {
          costs[markIndex + 1][used + count] = nextCost
          choices[markIndex + 1][used + count] = count
        }
      }
    }
  }

  const counts = Array<number>(markGroups.length).fill(0)
  let used = positions.length
  for (let markIndex = markGroups.length; markIndex > 0; markIndex -= 1) {
    const count = choices[markIndex][used]
    counts[markIndex - 1] = count
    used -= count
  }

  const result: PositionColumn[] = []
  let positionIndex = 0
  counts.forEach((count, markIndex) => {
    for (let index = 0; index < count; index += 1) {
      const position = positions[positionIndex]
      result.push({ ...position, mark: markGroups[markIndex].mark })
      positionIndex += 1
    }
  })
  return result
}

function dataSegments(row: TextRow, aliases: readonly string[]): TextSegment[] {
  const label = exactLabel(row, aliases)
  if (!label) return []
  const normalizedAliases = aliases.map(compact)
  const inlineSegments = row.segments.flatMap((segment) => {
    const alias = normalizedAliases.find(
      (candidate) =>
        segment.compact.startsWith(candidate) &&
        segment.compact.length > candidate.length,
    )
    if (!alias) return []
    const value = segment.compact.slice(alias.length)
    return [{ source: segment, value: { ...segment, text: value, compact: value } }]
  })
  return [
    ...row.segments
      .filter((segment) => segment.centerX > label.endX)
      .filter(
        (segment) => !inlineSegments.some(({ source }) => source === segment),
      ),
    ...inlineSegments.map(({ value }) => value),
  ]
}

function isDimensionRow(
  row: TextRow,
  aliases: readonly string[],
  marks: MarkColumn[],
): boolean {
  const label = exactLabel(row, aliases)
  const cells = dataSegments(row, aliases)
  if (label === undefined || cells.length === 0) return false

  // 도면 오른쪽의 단면도·철골 표가 같은 y행에 걸쳐 있어도, 현재 부호 열의
  // 거리 상한 안에서 배정되는 셀만 断面 행의 값으로 본다. 이를 생략하면
  // 「B.PL-36*460*460」 같은 다른 도면의 치수가 한 행으로 오인되어 층 블록이
  // 중복으로 판정된다.
  const targets = [
    ...new Map(
      marks.map(({ groupKey, centerX }) => [groupKey, { id: groupKey, centerX }]),
    ).values(),
  ]
  const scopedCells = [...valuesAtTargets(cells, targets).values()]
  if (scopedCells.length === 0) return false

  // 「断面」은 스케치의 제목으로도 쓰인다. 실제 단면 행은 符号 열 수만큼
  // 셀을 가지지만, 스케치의 X/Y·直交梁 표기는 일부 셀만 가지므로 그 행을
  // 断面 데이터로 세지 않는다. 값 자체가 불명확해도 원문을 raw로 보존해야
  // 하므로, 이 판정은 값의 파싱 성공 여부와 분리한다.
  if (label.compact !== '断面') return true
  return (
    scopedCells.some(
      (cell) =>
        parseDimension(cell) !== undefined ||
        parseCircularDimension(cell) !== undefined,
    ) || scopedCells.length >= targets.length
  )
}

function valuesAtTargets(
  segments: TextSegment[],
  targets: Array<{ id: string; centerX: number }>,
): Map<string, string> {
  const assigned = new Map<string, TextSegment[]>()
  if (targets.length === 0) return new Map()
  const bounded = boundedAnchors(targets)

  for (const segment of segments) {
    const target = bounded.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - segment.centerX) <
      Math.abs(closest.centerX - segment.centerX)
        ? candidate
        : closest,
    )
    // 열 간격을 넘어 떨어진 세그먼트는 이 표의 칸이 아니다. 오른쪽 끝 열은 표
    // 바깥의 글자를 전부 삼킨다 — 표제란이 표와 같은 행에 걸치면 「3-D22」가
    // 「3-D22一級建築士事務所…」가 되어 확정이던 칸이 解釈不能으로 뒤집힌다
    // (실물 ojkk p3 G5/2F). 열이 하나뿐이면 상한이 없다(limit=Infinity)
    if (Math.abs(target.centerX - segment.centerX) > target.limit) continue
    const existing = assigned.get(target.id) ?? []
    existing.push(segment)
    assigned.set(target.id, existing)
  }

  return new Map(
    [...assigned.entries()].map(([id, targetSegments]) => [
      id,
      targetSegments
        .sort((left, right) => left.x - right.x)
        .map((segment) => segment.text)
        .join(''),
    ]),
  )
}

function valuesByMark(
  row: TextRow,
  aliases: readonly string[],
  marks: MarkColumn[],
): Map<string, string> {
  const groups = [...new Map(
    marks.map(({ groupKey, centerX }) => [groupKey, { id: groupKey, centerX }]),
  ).values()]
  const values = valuesAtTargets(
    dataSegments(row, aliases),
    groups,
  )
  return new Map(
    marks.flatMap(({ mark, groupKey }) => {
      const value = values.get(groupKey)
      return value === undefined ? [] : [[mark, value] as const]
    }),
  )
}

function segmentsByMark(
  segments: TextSegment[],
  marks: MarkColumn[],
): Map<string, TextSegment[]> {
  const grouped = new Map<string, TextSegment[]>()
  if (marks.length === 0) return grouped

  for (const segment of segments) {
    const target = marks.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - segment.centerX) <
      Math.abs(closest.centerX - segment.centerX)
        ? candidate
        : closest,
    )
    const existing = grouped.get(target.mark) ?? []
    existing.push(segment)
    grouped.set(target.mark, existing)
  }
  return grouped
}

/**
 * 位置별 셀 값을 位置 인덱스로 되돌린다. 位置 열을 하나도 배정받지 못한 符号의 셀은
 * 배정 대상에서 뺀다 — 그대로 두면 그 셀이 최근접 位置(옆 符号의 열)에 붙어 남의 값을
 * 오염시킨다. 빠진 符号은 valuesByMark로 따로 읽는다.
 *
 * 符号 대역으로 먼저 가르지는 않는다. 실물 도면(yokohama G54)에서 符号 헤더 중심이
 * 열 경계와 어긋나 이웃 열 값이 대역 안으로 들어오는 경우가 있어, 대역 우선 배정은
 * 位置를 가진 符号의 셀까지 뭉갠다.
 */
function valuesByPosition(
  row: TextRow,
  aliases: readonly string[],
  positions: PositionColumn[],
  marks: MarkColumn[],
): Map<string, string> {
  const positionless = new Set(
    marks
      .filter(({ mark }) => !positions.some((position) => position.mark === mark))
      .map(({ mark }) => mark),
  )
  const segments = dataSegments(row, aliases)
  const assignable =
    positionless.size === 0
      ? segments
      : [...segmentsByMark(segments, marks)]
          .filter(([mark]) => !positionless.has(mark))
          .flatMap(([, group]) => group)

  return valuesAtTargets(
    assignable,
    positions.map((position, index) => ({
      id: String(index),
      centerX: position.centerX,
    })),
  )
}

/** 후프 형상 기호(□·▤·▦·▥)와 이음 하이픈 등 셀 머리의 장식만 벗긴다. */
function stripDecoration(value: string): string {
  return compact(value).replace(/^[-□▤▦▥⊟⊞]+/, '')
}

function decorationPrefix(value: string): string | undefined {
  return compact(value).match(/^([□▤▦▥⊟⊞]+)/)?.[1]
}

function isTwoLayerBar(value: string): boolean {
  const match = stripDecoration(value).match(/^\d+\/\d+-?(D\d+)$/i)
  return match !== null && barSizes.has(match[1].toUpperCase() as BarSize)
}

function parseBar(value: string): ParsedBar | undefined {
  // parsePitch와 같은 규약: 장식을 벗긴 셀 전체가 단일 「本数-径」일 때만 확정한다 —
  // 복수 표기(「4-D25+2-D22」)도, 잡문자가 붙은 「70016-D25」도 빈칸+원문 경로로 보낸다
  const match = stripDecoration(value).match(/^(\d+)-?(D\d+)$/i)
  if (!match) return undefined
  const size = match[2].toUpperCase() as BarSize
  if (!barSizes.has(size)) return undefined
  const count = Number(match[1])
  // 本数 3자리는 인접 치수선 숫자가 붙은 셀 병합 잔재(「70016-D25」)이고,
  // 0본은 물량 0인 부재를 만든다 — 어느 쪽도 확정하지 않는다
  return count > 99 || count <= 0 ? undefined : { count, size }
}

function parsePitch(
  value: string,
): { size: ShearBarSize; pitchMm: number } | undefined {
  // 셀 전체가 단일 「径@ピッチ」일 때만 채택한다 — 부분 매치를 허용하면
  // 組数 접두사(「2-D13@100」)가 조용히 떨어져 1組로 절반 계상된다.
  // 呼び名의 접두 영문자를 D로 한정하지 않는 것은 高強度せん断補強筋 때문이고,
  // 목록에 없는 呼び名은 아래 집합 검사에서 빈칸+원문으로 떨어진다 (R10)
  const match = stripDecoration(value).match(
    /^([A-Z]\d+(?:\.\d+)?)(?:-?@([\d,]+)|-?([\d,]+)@)$/i,
  )
  if (!match) return undefined
  const size = match[1].toUpperCase() as ShearBarSize
  if (!shearBarSizes.has(size)) return undefined
  const pitchText = match[2] ?? match[3]
  const pitchMm = Number(pitchText.replace(/,/g, ''))
  // 쉼표가 있는 네 자리 피치는 명시적인 자릿수 구분(예: 1,000)이다. 쉼표 없는
  // 네 자리 값은 기존과 같이 인접 세그먼트가 붙은 잔재로 보아 확정하지 않는다.
  if (pitchMm <= 0 || (pitchMm > 999 && !pitchText.includes(','))) return undefined
  return { size, pitchMm }
}

/**
 * compact된 特記를 「1.」부터 순차인 번호열로 먼저 가른다. 숫자가 피치에 붙어
 * 「@5002.」가 되어도 다음 번호가 2라는 사실이 오른쪽 경계를 증명한다.
 * 번호열이 없으면 표제 전체가 한 항목이며, 빈 항목은 번호열의 증명이 아니므로
 * 분리하지 않는다.
 */
function sequentialTitleItems(titleText: string): string[] {
  const text = compact(titleText)
  const firstMarker = text.indexOf('1.')
  if (firstMarker < 0) return [text]

  const items: string[] = []
  let itemStart = firstMarker + '1.'.length
  let nextNumber = 2

  while (true) {
    const marker = `${nextNumber}.`
    const boundary = text.indexOf(marker, itemStart)
    if (boundary < 0) {
      const lastItem = text.slice(itemStart)
      return lastItem.length > 0 ? [...items, lastItem] : [text]
    }

    const item = text.slice(itemStart, boundary)
    const nextStart = boundary + marker.length
    if (item.length === 0 || nextStart >= text.length) return [text]

    items.push(item)
    itemStart = nextStart
    nextNumber += 1
  }
}

function widthTieFromTitle(
  titleText: string,
): { value?: SectionCandidate['widthTie']; raw?: string } | undefined {
  const item = sequentialTitleItems(titleText).find((candidate) =>
    /(?:幅|巾)止(?:め)?筋/.test(candidate),
  )
  if (!item) return undefined

  const label = item.match(/(?:幅|巾)止(?:め)?筋/)
  if (!label || label.index === undefined) return undefined

  const raw = item.slice(label.index)
  // 항목 경계를 증명한 뒤에는 자릿수로 피치 끝을 추측하지 않는다. 幅止め筋 항목
  // 전체가 이 문법일 때만 확정하고, 뒤에 다른 特記가 붙으면 raw 경로로 보낸다.
  const match = raw.match(
    /^(?:幅|巾)止(?:め)?筋(?:は)?([A-Z]\d+(?:\.\d+)?)-?@(\d+)(?:とする)?[。.]*$/i,
  )
  if (!match) return { raw }

  const size = match[1].toUpperCase() as BarSize
  const pitchMm = Number(match[2])
  if (!barSizes.has(size) || pitchMm <= 0) return { raw }

  return {
    value: { size, pitchMm },
  }
}

// 4자리 초과는 셀 병합 잔재, 한 자리는 소수 표기(「0.8×0.8」→8×0)의 잔재다 —
// 어느 쪽도 확정하지 않는다
function inDimensionRange(b: number, depth: number): boolean {
  return b >= 10 && b <= 9999 && depth >= 10 && depth <= 9999
}

/**
 * 円形断面の「600φ」。φ・Φ・㎜表記のゆれだけを見る — 数値ひとつだけの
 * セル（スケッチの寸法線）は円と読まない。直径記号があることが根拠である。
 */
function parseCircularDimension(value: string): { diameter: number } | undefined {
  const match = normalized(value).match(/^(\d[\d,]*)\s*[φΦ]$|^[φΦ]\s*(\d[\d,]*)$/)
  if (!match) return undefined
  const diameter = Number((match[1] ?? match[2]).replace(/,/g, ''))
  return inDimensionRange(diameter, diameter) ? { diameter } : undefined
}

function parseDimension(value: string): { b: number; depth: number } | undefined {
  // 이웃 셀이 붙은 「800×800 900×900」에서 첫 매치를 취하면 두 번째 그룹이
  // 공백 너머 숫자까지 삼켜 b=800·depth=800900이 된다 — 다중 매치는 거부한다
  const matches = [
    ...normalized(value).matchAll(/[\d,]+\s*[x×*]\s*[\d,]+/gi),
  ]
  if (matches.length !== 1) return undefined
  const [bText, depthText] = matches[0][0].split(/[x×*]/i)
  const b = Number(bText.replace(/,/g, '').trim())
  const depth = Number(depthText.replace(/,/g, '').trim())
  return inDimensionRange(b, depth) ? { b, depth } : undefined
}

/**
 * 스케치에 붙은 가로·세로 치수를 짝지어 b×d를 읽는다. 断面 라벨 행이 없는 표에서는
 * 이 둘이 유일한 근거다. 한쪽만으로는 확정하지 않는다 — 단독 숫자를 정사각형으로
 * 승격하는 것은 도면에 없는 값을 만드는 것이다.
 */
function pairedDimension(
  horizontal: string,
  vertical: string,
): { b: number; depth: number } | undefined {
  if (!/^\d+$/.test(horizontal) || !/^\d+$/.test(vertical)) return undefined
  const b = Number(horizontal)
  const depth = Number(vertical)
  return inDimensionRange(b, depth) ? { b, depth } : undefined
}

/**
 * 확정하지 못한 셀에 남기는 원문 참고 표시. 머리의 장식만 벗기고 나머지는 그대로
 * 둔다 — 토큰만 뽑아 줄이면 「2-D13@100」의 @100처럼 원문 정보가 사라진다.
 *
 * 장식만으로 이루어진 셀은 벗기면 빈 문자열이 되므로 되살린다. 「―」는 「해당 없음」을
 * 뜻하는 값인데(yokohama p13 腹筋 행), 빈칸으로 내보내면 화면에서 「읽지 못한 셀」과
 * 구별되지 않는다.
 */
function cleanedRebarRaw(value: string): string {
  return stripDecoration(value) || compact(value)
}

function addIssue(candidate: SectionCandidate, issue: CandidateIssue): void {
  if (!candidate.issues.includes(issue)) candidate.issues.push(issue)
}

function setDimension(
  candidate: SectionCandidate,
  value: string | undefined,
  column: boolean,
  vertical?: string,
): void {
  if (!value) {
    // 세로만 읽힌 칸도 원문을 남긴다 — 조용히 버리면 사용자는 왜 断面이 비었는지
    // 알 수 없다. 확정하지 못한 칸은 빈칸+원문 참고가 이 파서의 규약이다
    if (vertical !== undefined) {
      candidate.raw['断面'] = compact(vertical)
      addIssue(candidate, '断面矩形不成立')
    }
    return
  }
  // 円形は柱にしかない。大梁の断面欄にφが来たらそれは読み違えなので確定しない。
  const circular = column ? parseCircularDimension(value) : undefined
  if (circular) {
    candidate.shape = '円形'
    candidate.b = circular.diameter
    candidate.d = circular.diameter
    return
  }

  const parsed =
    parseDimension(value) ??
    (vertical !== undefined ? pairedDimension(value, vertical) : undefined)
  if (parsed) {
    if (column) candidate.shape = '矩形'
    candidate.b = parsed.b
    if (column) candidate.d = parsed.depth
    else candidate.depth = parsed.depth
    return
  }

  // 단독 숫자는 b×d로 확정할 수 없다 — 스케치 치수선 숫자를 정사각형으로
  // 승격하면 값을 지어내는 것이 된다 (ADR-012 계열). 빈칸+원문으로 남긴다.
  // 세로도 읽었는데 짝짓기(pairedDimension)가 거부한 경우, 가로만 남기면
  // 원문 세로값이 조용히 사라진다 — 함께 남긴다
  candidate.raw['断面'] = compact(value)
  if (vertical !== undefined) candidate.raw['断面(縦)'] = compact(vertical)
  addIssue(candidate, '断面矩形不成立')
}

function setColumnMain(
  candidate: SectionCandidate,
  cells: Array<{ position?: string; raw: string }>,
  expectedCellCount: number,
): void {
  if (cells.length === 0) return
  const parsed = cells.map(({ raw }) => parseBar(raw))
  const allParsed = parsed.every((entry): entry is ParsedBar => entry !== undefined)
  const allEqual =
    allParsed &&
    parsed.every(
      (entry) => entry.count === parsed[0].count && entry.size === parsed[0].size,
    )
  const complete =
    expectedCellCount === 0 || cells.length === expectedCellCount

  if (allEqual && complete) {
    candidate.main = parsed[0]
    return
  }

  for (const cell of cells) {
    const key = cell.position ? `主筋(${cell.position})` : '主筋'
    candidate.raw[key] = cleanedRebarRaw(cell.raw)
  }
  addIssue(
    candidate,
    !allParsed
      ? cells.some(({ raw }) => isTwoLayerBar(raw))
        ? '2段筋未対応'
        : '主筋解釈不能'
      : !complete
        ? '主筋位置欠落'
        : '主筋位置相違',
  )
}

/**
 * 位置欄のラベルが指す区間。「Y3端」「外端」のように通り芯名や向きが付く表もあるが、
 * 末尾の「端」が端部を指すのは共通する。読めないラベルは undefined にして、
 * 端部・中央に読み替えない — 読み替えれば図面にない断面を作る。
 */
function positionZone(label: string): '端部' | '中央' | undefined {
  const normalizedLabel = compact(label)
  if (normalizedLabel.includes('中央')) return '中央'
  if (normalizedLabel.includes('端')) return '端部'
  return undefined
}

function isThreePositionLayout(
  cells: Array<{ position: string }>,
): boolean {
  const zones = cells.map(({ position }) => positionZone(position))
  return (
    cells.length === 3 &&
    zones[0] === '端部' &&
    zones[1] === '中央' &&
    zones[2] === '端部'
  )
}

function uniqueCount(bars: ParsedBar[]): number | undefined {
  const first = bars[0]
  if (first === undefined) return undefined
  return bars.every((bar) => bar.count === first.count)
    ? first.count
    : undefined
}

/**
 * 位置で本数を分けている表を、端部欄と中央欄の対として読む。
 *
 * 「Y3端／Y4端」のように両端が違う三欄表は、位置ラベルと左右の本数を
 * そのまま候補に載せる。二欄の端部・中央表は従来どおり単一の端部本数に
 * 畳み込む。径は全欄で一つに揃っている表だけを確定する。
 */
function positionalGirderMain(
  cells: Array<{ position: string; rawPosition?: string }>,
  top: ParsedBar[],
  bottom: ParsedBar[],
):
  | { girderMain: NonNullable<SectionCandidate['girderMain']> }
  | {
      girderMainAsymmetric: NonNullable<
        SectionCandidate['girderMainAsymmetric']
      >
    }
  | { issue: CandidateIssue }
  | undefined {
  const zones = cells.map(({ position }) => positionZone(position))
  if (zones.some((zone) => zone === undefined)) return undefined

  // 左端・中央・右端の三欄でない表は、左右非対称の端部として再解釈しない。
  // 端部・中央の二欄は従来どおり、単一の端部本数として扱う。
  const asymmetricLayout = isThreePositionLayout(cells)
  if (cells.length === 3 && !asymmetricLayout) return undefined

  const pick = (bars: ParsedBar[], zone: '端部' | '中央') =>
    bars.filter((_, index) => zones[index] === zone)
  const endTop = pick(top, '端部')
  const endBottom = pick(bottom, '端部')
  const centerTopCount = uniqueCount(pick(top, '中央'))
  const centerBottomCount = uniqueCount(pick(bottom, '中央'))
  if (
    centerTopCount === undefined ||
    centerBottomCount === undefined ||
    endTop.length === 0 ||
    endBottom.length === 0
  ) {
    if (
      endTop.length > 0 &&
      uniqueCount(endTop) === undefined &&
      !asymmetricLayout
    ) {
      return { issue: '主筋端部左右相違' }
    }
    if (
      endBottom.length > 0 &&
      uniqueCount(endBottom) === undefined &&
      !asymmetricLayout
    ) {
      return { issue: '主筋端部左右相違' }
    }
    return undefined
  }

  const size = top[0]?.size
  if (size === undefined) return undefined
  if (![...top, ...bottom].every((bar) => bar.size === size)) return undefined

  if (!asymmetricLayout) {
    const endTopCount = uniqueCount(endTop)
    const endBottomCount = uniqueCount(endBottom)
    if (endTopCount === undefined || endBottomCount === undefined) {
      return { issue: '主筋端部左右相違' }
    }
    return {
      girderMain: {
        size,
        topCount: centerTopCount,
        bottomCount: centerBottomCount,
        endTopCount,
        endBottomCount,
      },
    }
  }

  const endTopCounts = [top[0]?.count, top[2]?.count] as const
  const endBottomCounts = [bottom[0]?.count, bottom[2]?.count] as const
  if (
    endTopCounts[0] === undefined ||
    endTopCounts[1] === undefined ||
    endBottomCounts[0] === undefined ||
    endBottomCounts[1] === undefined
  ) {
    return undefined
  }

  const labels = [cells[0]?.position, cells[2]?.position] as const
  if (labels[0] === undefined || labels[1] === undefined) return undefined

  const asymmetric =
    endTopCounts[0] !== endTopCounts[1] ||
    endBottomCounts[0] !== endBottomCounts[1]
  if (asymmetric) {
    return {
      girderMainAsymmetric: {
        size,
        labels: [labels[0], labels[1]],
        topCounts: [endTopCounts[0], endTopCounts[1]],
        bottomCounts: [endBottomCounts[0], endBottomCounts[1]],
        topCenterCount: centerTopCount,
        bottomCenterCount: centerBottomCount,
      },
    }
  }

  return {
    girderMain: {
      size,
      topCount: centerTopCount,
      bottomCount: centerBottomCount,
      endTopCount: endTopCounts[0],
      endBottomCount: endBottomCounts[0],
    },
  }
}

function setGirderMain(
  candidate: SectionCandidate,
  topLabel: string,
  bottomLabel: string,
  topCells: Array<{ position: string; rawPosition?: string; raw: string }>,
  bottomCells: Array<{
    position: string
    rawPosition?: string
    raw: string
  }>,
  expectedCellCount: number,
): void {
  if (topCells.length === 0 && bottomCells.length === 0) return
  const top = topCells.map(({ raw }) => parseBar(raw))
  const bottom = bottomCells.map(({ raw }) => parseBar(raw))
  const allParsed = [...top, ...bottom].every(
    (entry): entry is ParsedBar => entry !== undefined,
  )
  const complete =
    top.length > 0 &&
    bottom.length > 0 &&
    (expectedCellCount === 0 ||
      (top.length === expectedCellCount && bottom.length === expectedCellCount))
  // 位置는 균일한데 上下 径만 다른(실무에서 흔한) 셀을 「位置相違」로 몰면
  // 사용자가 원인을 오인한다 — 전용 사유 코드로 구분한다
  let sizeMismatch = false
  let positionalIssue: CandidateIssue | undefined
  if (complete && allParsed) {
    const parsedTop = top as ParsedBar[]
    const parsedBottom = bottom as ParsedBar[]
    const firstTop = parsedTop[0]
    const firstBottom = parsedBottom[0]
    const topUniform =
      firstTop !== undefined &&
      parsedTop.every(
        (entry) =>
          entry.count === firstTop.count && entry.size === firstTop.size,
      )
    const bottomUniform =
      firstBottom !== undefined &&
      parsedBottom.every(
        (entry) =>
          entry.count === firstBottom.count && entry.size === firstBottom.size,
      )

    if (topUniform && bottomUniform && firstTop.size === firstBottom.size) {
      candidate.girderMain = {
        size: firstTop.size,
        topCount: firstTop.count,
        bottomCount: firstBottom.count,
      }
      return
    }
    sizeMismatch =
      topUniform && bottomUniform && firstTop.size !== firstBottom.size

    // 位置で本数が分かれた表。上下の位置欄が揃っている表だけを対として読む
    const aligned =
      topCells.length === bottomCells.length &&
      topCells.every(
        (cell, index) => cell.position === bottomCells[index].position,
      )
    const positional = aligned
      ? positionalGirderMain(topCells, parsedTop, parsedBottom)
      : undefined
    if (positional && 'girderMain' in positional) {
      candidate.girderMain = positional.girderMain
      return
    }
    if (positional && 'girderMainAsymmetric' in positional) {
      candidate.girderMainAsymmetric = positional.girderMainAsymmetric
      // step 2 전에는 이 후보를 반영하지 않지만, 확정한 위치별 값을 화면에서
      // 원문과 함께 대조할 수 있어야 한다. 값 자체는 별도 필드가 정본이다.
      for (const cell of topCells) {
        candidate.raw[`${topLabel}(${cell.position})`] = cleanedRebarRaw(
          cell.raw,
        )
      }
      for (const cell of bottomCells) {
        candidate.raw[`${bottomLabel}(${cell.position})`] = cleanedRebarRaw(
          cell.raw,
        )
      }
      // 비대칭 값은 새 필드에 보존했지만, 방향을 선택하기 전인 이 단계에서는
      // girderMain으로 반영할 수 없다. 기존 취입 화면의 차단 안내를 유지한다.
      addIssue(candidate, '主筋端部左右相違')
      return
    }
    positionalIssue = positional?.issue
  }

  for (const cell of topCells) {
    candidate.raw[`${topLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  for (const cell of bottomCells) {
    candidate.raw[`${bottomLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  const twoLayerMain = [...topCells, ...bottomCells].some(({ raw }) =>
    isTwoLayerBar(raw),
  )
  addIssue(
    candidate,
    positionalIssue ??
      (sizeMismatch
        ? '主筋上下径相違'
        : allParsed && complete
          ? '主筋位置相違'
          : !allParsed
            ? twoLayerMain
              ? '2段筋未対応'
              : '主筋解釈不能'
            : '主筋位置欠落'),
  )
}

function setPitch(
  candidate: SectionCandidate,
  key: 'hoop' | 'stirrup',
  label: string,
  raw: string | undefined,
  folded: string | undefined,
): void {
  // 접힌 셀은 첫 줄만으로 확정하지 않는다 — 帯筋 ピッチ가 줄마다 다르면 本数가 틀린다.
  // 主筋과 같은 규약으로 첫 줄이 없는 경우를 나눈다 — 접힘 없이도 살아남는 符号이
  // 생긴 뒤로는 「없는 둘째 줄을 찾아보라」는 안내가 실제로 도달한다
  if (folded !== undefined) {
    const wrapped = raw !== undefined && raw.length > 0
    if (wrapped) candidate.raw[label] = cleanedRebarRaw(raw as string)
    candidate.raw[`${label}(${wrapped ? '折返し' : '無ラベル行'})`] =
      cleanedRebarRaw(folded)
    addIssue(candidate, wrapped ? '帯筋折返し' : '帯筋ラベル行外')
    return
  }
  if (!raw) return
  const parsed = parsePitch(raw)
  if (parsed) {
    const shape = decorationPrefix(raw)
    if (shape !== undefined) candidate.raw[`${label}形状`] = shape
    candidate[key] = parsed
    return
  }

  candidate.raw[label] = cleanedRebarRaw(raw)
  addIssue(candidate, '帯筋解釈不能')
}

function setSideBar(
  candidate: SectionCandidate,
  raw: string | undefined,
): void {
  if (raw === undefined) return
  const value = compact(raw)
  // 空欄・横線は「その配筋がない」という正常な図面値であり、読取失敗ではない。
  if (value === '' || /^[-―]+$/.test(value)) return

  // 主筋と同じ 本数-径 文法を使う。腹筋は高強度せん断補強筋を取らない。
  const parsed = parseBar(raw)
  if (parsed) {
    candidate.sideBar = parsed
    return
  }

  candidate.raw['腹筋'] = cleanedRebarRaw(raw)
  addIssue(candidate, '腹筋解釈不能')
}

function setWidthTie(
  candidate: SectionCandidate,
  label: string,
  raw: string | undefined,
): void {
  if (raw === undefined) return
  const parsed = parsePitch(raw)
  if (parsed && barSizes.has(parsed.size as BarSize)) {
    candidate.widthTie = {
      size: parsed.size as BarSize,
      pitchMm: parsed.pitchMm,
    }
    return
  }
  candidate.raw[label] = cleanedRebarRaw(raw)
  addIssue(candidate, '幅止め筋解釈不能')
}

interface WallMarkGroup {
  marks: string[]
  centerX: number
}

const WALL_MARK_PATTERN = /(?:EW\d+[A-Z]?|W\d+[A-Z]?)/gi
const SLAB_MARK_PATTERN = /^(?:S|FS|CS)\d+[A-Z]?$/i

function marksInText(value: string): string[] {
  return [...value.matchAll(WALL_MARK_PATTERN)].map((match) =>
    match[0].toUpperCase(),
  )
}

function wallMarkGroups(row: TextRow): WallMarkGroup[] {
  const labels = row.segments.filter((segment) => segment.compact === '符号')
  for (const label of [...labels].reverse()) {
    const groups = row.segments
      .filter((segment) => segment.x > label.endX)
      .flatMap((segment) => {
        const marks = marksInText(segment.compact)
        return marks.length > 0 ? [{ marks, centerX: segment.centerX }] : []
      })
    if (groups.length > 0) return groups
  }
  return []
}

function valuesForWallGroups(
  row: TextRow,
  labelText: string,
  groups: WallMarkGroup[],
  split: (text: string) => string[],
  valueRow: TextRow = row,
): Map<string, string> {
  const label = [...row.segments]
    .reverse()
    .find((segment) => segment.compact === labelText)
  if (!label) return new Map()

  const values = valueRow.segments.filter((segment) =>
    valueRow === row ? segment.x > label.endX : true,
  )
  const result = new Map<string, string>()
  for (const segment of values) {
    const covered = groups.filter(
      (group) => group.centerX >= segment.x && group.centerX <= segment.endX,
    )
    if (covered.length === 0) continue
    const parts = split(segment.text)
    if (covered.length === parts.length) {
      covered.forEach((group, index) => {
        for (const mark of group.marks) result.set(mark, parts[index])
      })
      continue
    }
    if (covered.length === 1 && parts.length === covered[0].marks.length) {
      covered[0].marks.forEach((mark, index) => result.set(mark, parts[index]))
      continue
    }
    // A single mark with two thicknesses is ambiguous. Keep the complete cell
    // for every mark in the group; the caller will leave the typed field empty.
    for (const group of covered) {
      for (const mark of group.marks) result.set(mark, segment.text)
    }
  }
  return result
}

function wallThicknessParts(text: string): string[] {
  return normalized(text)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function wallBarParts(text: string): string[] {
  const value = compact(text)
  if (/[・･]/.test(value) || /[A-Z]\d+[A-Z]\d+/i.test(value)) return []
  return value.match(/[A-Z]\d+-?@\d+(?:\([^)]*\))?/gi) ?? []
}

function parseWallBar(value: string):
  | { size: BarSize; pitchMm: number; layers: 1 | 2 }
  | undefined {
  const match = compact(value).match(
    /^([A-Z]\d+)-?@(\d+)(?:\(([^)]*)\))?$/i,
  )
  if (!match) return undefined
  const size = match[1].toUpperCase() as BarSize
  const pitchMm = Number(match[2])
  if (!barSizes.has(size) || pitchMm <= 0) return undefined
  const note = match[3]
  if (!note) return undefined
  const layers = /ダブル|ﾀﾞﾌﾞﾙ/.test(normalized(note)) ? 2 : /シングル/.test(note) ? 1 : undefined
  return layers === undefined ? undefined : { size, pitchMm, layers }
}

function parseWallBlock(
  rows: TextRow[],
  titleText: string,
  endY: number,
): SectionCandidate[] {
  const header = rows.find((row) => wallMarkGroups(row).length > 0)
  if (!header) return []
  const groups = wallMarkGroups(header)
  const bodyRows = rows.filter((row) => row.y > header.y && row.y < endY)
  const dimensionRow = bodyRows
    .filter((row) =>
      row.segments.some((segment) => segment.compact === '断面'),
    )
    .at(-1)
  const verticalRow = bodyRows.find((row) =>
    row.segments.some((segment) => segment.compact === '縦筋'),
  )
  const horizontalRow = bodyRows.find((row) =>
    row.segments.some((segment) => segment.compact === '横筋'),
  )
  if (!dimensionRow && !verticalRow && !horizontalRow) return []

  const dimensionValueRow = dimensionRow
    ? bodyRows.find(
        (row) =>
          row.y > dimensionRow.y &&
          row.y < (verticalRow?.y ?? endY) &&
          row.segments.some((segment) =>
            groups.some(
              (group) =>
                group.centerX >= segment.x && group.centerX <= segment.endX,
            ),
          ),
      )
    : undefined
  const thicknesses = dimensionRow
    ? valuesForWallGroups(
        dimensionRow,
        '断面',
        groups,
        wallThicknessParts,
        dimensionValueRow,
      )
    : new Map<string, string>()
  const verticals = verticalRow
    ? valuesForWallGroups(verticalRow, '縦筋', groups, wallBarParts)
    : new Map<string, string>()
  const horizontals = horizontalRow
    ? valuesForWallGroups(horizontalRow, '横筋', groups, wallBarParts)
    : new Map<string, string>()

  return groups.flatMap(({ marks }) =>
    marks.map((mark): SectionCandidate => {
      const candidate: SectionCandidate = {
        kind: isOutOfScopeList(titleText) ? '対象外' : '耐震壁',
        mark,
        raw: {},
        issues: [],
      }
      const thickness = thicknesses.get(mark)
      if (thickness && /^\d+$/.test(thickness)) {
        candidate.thickness = Number(thickness)
      } else if (thickness) {
        candidate.raw['断面'] = thickness
        addIssue(candidate, '壁厚相違')
      }

      const setBar = (
        role: 'vertical' | 'horizontal',
        value: string | undefined,
      ) => {
        if (value === undefined) return
        const parsed = parseWallBar(value)
        if (!parsed) {
          candidate.raw[role === 'vertical' ? '縦筋' : '横筋'] = value
          addIssue(candidate, '壁筋解釈不能')
          return
        }
        if (candidate.layers !== undefined && candidate.layers !== parsed.layers) {
          candidate.raw[role === 'vertical' ? '縦筋' : '横筋'] = value
          addIssue(candidate, '壁筋解釈不能')
          return
        }
        candidate[role] = { size: parsed.size, pitchMm: parsed.pitchMm }
        candidate.layers = parsed.layers
      }
      setBar('vertical', verticals.get(mark))
      setBar('horizontal', horizontals.get(mark))
      return candidate
    }),
  )
}

function slabMark(row: TextRow): { mark: string; centerX: number } | undefined {
  const segment = row.segments.find((candidate) =>
    SLAB_MARK_PATTERN.test(candidate.compact),
  )
  return segment
    ? { mark: segment.compact.toUpperCase(), centerX: segment.centerX }
    : undefined
}

function slabBarCell(row: TextRow, centerX: number): TextSegment | undefined {
  return row.segments
    .filter((segment) => /@\d+/.test(compact(segment.text)))
    .sort(
      (left, right) =>
        Math.abs(left.centerX - centerX) - Math.abs(right.centerX - centerX),
    )[0]
}

function parseSlabBar(value: string): { size: BarSize; pitchMm: number } | undefined {
  const match = compact(value).match(/^([A-Z]\d+)-?@(\d+)$/i)
  if (!match) return undefined
  const size = match[1].toUpperCase() as BarSize
  const pitchMm = Number(match[2])
  return barSizes.has(size) && pitchMm > 0 ? { size, pitchMm } : undefined
}

function slabThickness(row: TextRow, centerX: number): number | undefined {
  const value = row.segments
    .filter((segment) => /^\d[\d,]*$/.test(compact(segment.text)))
    .sort(
      (left, right) =>
        Math.abs(left.centerX - centerX) - Math.abs(right.centerX - centerX),
    )[0]
    ?.compact
  return value === undefined ? undefined : Number(value.replace(/,/g, ''))
}

function nextHeaderY(rows: TextRow[], endY: number): number | undefined {
  return rows.find(
    (row) =>
      row.y >= endY &&
      row.segments.some((segment) => segment.compact.startsWith('符号')) &&
      !row.segments.some((segment) =>
        /短辺方向|長辺方向/.test(segment.compact),
      ),
  )?.y
}

function parseSlabBlock(
  rows: TextRow[],
  anchor: TitleAnchor,
  endY: number,
): SectionCandidate[] {
  const directionHeader = rows.find((row) =>
    row.segments.some((segment) => segment.compact === '短辺方向') &&
    row.segments.some((segment) => segment.compact === '長辺方向'),
  )
  const shortX = directionHeader?.segments.find(
    (segment) => segment.compact === '短辺方向',
  )?.centerX
  const longX = directionHeader?.segments.find(
    (segment) => segment.compact === '長辺方向',
  )?.centerX
  if (shortX === undefined || longX === undefined) return []

  const initialRows = rows.filter((row) => row.y > anchor.row.y)
  const firstMark = initialRows.map(slabMark).find(
    (mark): mark is { mark: string; centerX: number } => mark !== undefined,
  )
  if (!firstMark) return []
  const markRows = initialRows
    .map((row) => ({ row, mark: slabMark(row) }))
    .filter(
      (entry): entry is { row: TextRow; mark: { mark: string; centerX: number } } =>
        entry.mark !== undefined &&
        Math.abs(entry.mark.centerX - firstMark.centerX) <
          Math.max(20, Math.abs(shortX - firstMark.centerX)),
    )
  const bridgeTitle = rows.find(
    (row) =>
      Math.abs(row.y - endY) < 0.01 &&
      row.segments.some((segment) => /壁リスト/.test(segment.compact)),
  )
  const scanEnd = bridgeTitle ? nextHeaderY(rows, endY) ?? endY : endY
  const candidates = markRows.filter(({ row }) => row.y < scanEnd)
  if (candidates.length === 0) return []

  const thicknessHeader = rows.find((row) =>
    row.segments.some((segment) => /床厚|スラブ厚/.test(segment.compact)),
  )
  const thicknessX =
    thicknessHeader?.segments.find((segment) =>
      /床厚|スラブ厚/.test(segment.compact),
    )?.centerX ?? firstMark.centerX
  const outOfScope = isOutOfScopeList(anchor.titleText)

  return candidates.map(({ row, mark }, index) => {
    const nextY = candidates[index + 1]?.row.y ?? scanEnd
    const cantilever =
      mark.mark.startsWith('CS') &&
      rows.some(
        (candidateRow) =>
          candidateRow.y >= row.y - 1 &&
          candidateRow.y < nextY &&
          candidateRow.segments.some((segment) =>
            segment.compact.includes('片持ちスラブ'),
          ),
      )
    const candidate: SectionCandidate = {
      kind: outOfScope || cantilever ? '対象外' : '床板',
      mark: mark.mark,
      raw: {},
      issues: [],
    }
    const sectionRows = rows.filter(
      (candidateRow) => candidateRow.y > row.y - 20 && candidateRow.y < nextY,
    )
    const thickness = slabThickness(row, thicknessX)
    if (!outOfScope && thickness !== undefined) candidate.thickness = thickness

    if (outOfScope || cantilever) return candidate

    const faceRows = new Map<'top' | 'bottom', TextRow>()
    for (const face of ['top', 'bottom'] as const) {
      const labels = face === 'top' ? ['上端筋', '上筋'] : ['下端筋', '下筋']
      const faceRow = sectionRows
        .filter((candidateRow) =>
          candidateRow.segments.some((segment) =>
            labels.includes(segment.compact),
          ),
        )
        .sort((left, right) => Math.abs(left.y - row.y) - Math.abs(right.y - row.y))[0]
      if (faceRow) faceRows.set(face, faceRow)
    }

    for (const [face, faceRow] of faceRows) {
      for (const [axis, centerX] of [
        ['短辺方向', shortX],
        ['長辺方向', longX],
      ] as const) {
        const cell = slabBarCell(faceRow, centerX)
        const key = axis === '短辺方向' ? 'shortSide' : 'longSide'
        const rawKey = `${axis}(${face})`
        if (!cell) continue
        const parsed = parseSlabBar(cell.text)
        if (!parsed) {
          candidate.raw[rawKey] = cell.text
          addIssue(candidate, '床板筋解釈不能')
          continue
        }
        candidate[key] = {
          ...candidate[key],
          [face]: parsed,
        }
      }
    }
    return candidate
  })
}

function rowsBetween(rows: TextRow[], startY: number, endY: number): TextRow[] {
  return rows.filter((row) => row.y > startY && row.y < endY)
}

// 柱·大梁 블록의 알려진 라벨 행 전부 — 접힘 감지의 「다음 라벨 행」 판정에 쓴다.
const ROW_LABELS = [
  '主筋',
  '帯筋',
  'HOOP',
  'フープ',
  '接合部帯筋',
  '断面',
  '位置',
  '上筋',
  '上端筋',
  '下筋',
  '下端筋',
  'ST',
  'STP',
  'STP.',
  'あばら筋',
  'スターラップ',
  'B×D',
  'b×D',
  '形状断面',
  '寸法',
  '腹筋',
  '幅止筋',
  '巾止筋',
  '幅止め筋',
  '備考',
] as const

/** 本数-径 토큰(主筋 셀)과 径@ピッチ 토큰(帯筋·あばら筋 셀)을 구분해 접힘을 찾는다. */
const BAR_TOKEN = /\d+-?D\d+/i

const PITCH_TOKEN = /D\d+-?@\d+/i

/**
 * 라벨 행과 다음 라벨 행 사이의 무라벨 행에서 鉄筋 토큰을 마크별로 모은다.
 * 셀 내용이 줄바꿈으로 접히면 둘째 줄은 별도 행이 되어 라벨 행만 읽는 경로에서
 * 조용히 사라진다 — 첫 줄만으로 확정하면 2段筋 거부 방침이 줄바꿈 변형에서 샌다.
 */
function barContinuationByMark(
  dataRows: TextRow[],
  labelRow: TextRow,
  endY: number,
  marks: MarkColumn[],
  token: RegExp,
): Map<string, string> {
  const nextLabelY = dataRows
    .filter((row) => row.y > labelRow.y && exactLabel(row, ROW_LABELS))
    .reduce((min, row) => Math.min(min, row.y), endY)
  const merged = new Map<string, string>()

  for (const row of dataRows) {
    if (row.y <= labelRow.y || row.y >= nextLabelY) continue
    if (exactLabel(row, ROW_LABELS)) continue
    const barSegments = row.segments.filter((segment) =>
      token.test(segment.compact),
    )
    if (barSegments.length === 0) continue
    const values = valuesAtTargets(
      barSegments,
      marks.map(({ mark, centerX }) => ({ id: mark, centerX })),
    )
    for (const [mark, value] of values) {
      const existing = merged.get(mark)
      merged.set(mark, existing ? `${existing}/${value}` : value)
    }
  }

  return merged
}

function lastPositionRow(
  rows: TextRow[],
  headerY: number,
  beforeY: number,
): TextRow | undefined {
  return rows
    .filter(
      (row) =>
        row.y > headerY && row.y < beforeY && exactLabel(row, ['位置']),
    )
    .at(-1)
}

/**
 * 断面 라벨 행이 없는 표의 스케치 가로 치수. 창의 하한은 인식한 데이터 라벨 행 중
 * 가장 위다 — 라벨 하나에만 매어 두면 그 라벨을 못 읽은 표에서 창이 슬라이스 전체로
 * 열려 아래 행(備考 등)의 단독 숫자가 치수로 확정된다. 라벨 행을 하나도 인식하지
 * 못했으면 그 표에서 읽은 것이 없다는 뜻이므로 폴백을 돌리지 않는다.
 *
 * 상한에 슬라이스의 endY를 더 받지 않는다 — labelRows는 전부 rowsBetween(rows,
 * slice.startY, slice.endY)에서 나오므로 항상 y < slice.endY다. 그 endY를 다시
 * Math.min에 넣어도 절대 선택될 수 없어 있지도 않은 상한 보호처럼 읽혔다 (#35)
 */
function sketchDimensions(
  rows: TextRow[],
  startY: number,
  labelRows: Array<TextRow | undefined>,
  anchors: MarkColumn[],
): Map<string, string> {
  const labelYs = labelRows.flatMap((row) => (row ? [row.y] : []))
  if (labelYs.length === 0) return new Map()
  return scalarDimensions(rows, startY, Math.min(...labelYs), anchors)
}

/**
 * 스케치 치수를 배정할 열 앵커. 位置 열이 있으면 그것이다 — 符号 라벨은 칸 중앙에
 * 놓이지만 칸 폭은 부재마다 달라서, 중심 사이 중점을 경계로 쓰면 좁은 칸이 넓은 칸의
 * 끝을 먹는다. 실물 ojkk 大梁에서 G3(폭 85) 옆 G4(폭 42.5)가 G3의 세로 치수를
 * 가져갔다. 位置 열은 칸을 실제로 타일링하므로 폭이 다른 이웃과 붙어도 어긋나지 않는다.
 */
function markAnchors(
  marks: MarkColumn[],
  positions: PositionColumn[],
): MarkColumn[] {
  const seenGroups = new Set<string>()
  return marks.flatMap(({ mark, centerX, groupKey, rawCell }) => {
    if (seenGroups.has(groupKey)) return []
    seenGroups.add(groupKey)
    const own = positions.filter((position) => position.mark === mark)
    return own.length > 0
      ? own.map((position) => ({ mark, centerX: position.centerX, groupKey, rawCell }))
      : [{ mark, centerX, groupKey, rawCell }]
  })
}

/** 同じ符号セルから 펼친 부호는 스케치 치수의 하나의 앵커를 공유한다. 앵커 함수가
 * 첫 부호 하나만 반환하므로, 그 결과를 실제 후보 전부へ 복제한다. 표 셀을 읽는
 * valuesByMark는 이미 이 전개를 수행하므로 스케치 경로에만 적용한다.
 */
function expandMarkGroups(
  values: Map<string, string>,
  marks: MarkColumn[],
): Map<string, string> {
  const firstByGroup = new Map<string, string>()
  for (const { mark, groupKey } of marks) {
    if (!firstByGroup.has(groupKey)) firstByGroup.set(groupKey, mark)
  }
  return new Map(
    marks.flatMap(({ mark, groupKey }) => {
      const first = firstByGroup.get(groupKey)
      const value = first === undefined ? undefined : values.get(first)
      return value === undefined ? [] : [[mark, value] as const]
    }),
  )
}

/**
 * 앵커별 거리 상한. 칸 경계는 두 앵커 사이에 있으므로 앵커에서 경계까지의 거리는 그
 * 이웃까지의 간격보다 짧다 — 상한을 이웃 간격으로 잡는다. 이웃별로 재는 이유는 칸 폭이
 * 열마다 달라서다: 간격의 중앙값을 쓰면 자기 칸이 남들보다 넓은 열에서 실물 값이
 * 잘리고(ojkk 柱 FC1은 이웃 간격 85.1에 실측 51.7), 좌우 중 큰 쪽을 쓰면 촘촘한 열이
 * 반대편 먼 열의 상한을 물려받아 두 열 사이 빈 대역까지 먹는다.
 *
 * 앵커가 하나뿐이면 간격이 없어 상한이 Infinity가 된다 — 세로 짝짓기는 符号 2개
 * 이상을 따로 요구하고, 가로는 라벨 행 대역으로 이미 좁혀져 있으며, 셀 값은 열이
 * 하나면 그 열이 행 전체를 받는 것이 맞다.
 */
function boundedAnchors<T extends { centerX: number }>(
  anchors: T[],
): Array<T & { limit: number }> {
  const sorted = [...anchors].sort(
    (left, right) => left.centerX - right.centerX,
  )
  return sorted.map((anchor, index) => {
    const gaps = [
      index > 0 ? anchor.centerX - sorted[index - 1].centerX : undefined,
      index + 1 < sorted.length
        ? sorted[index + 1].centerX - anchor.centerX
        : undefined,
    ].filter((gap): gap is number => gap !== undefined)
    return { ...anchor, limit: Math.min(...gaps) }
  })
}

function scalarDimensions(
  rows: TextRow[],
  startY: number,
  endY: number,
  marks: MarkColumn[],
): Map<string, string> {
  if (marks.length === 0) return new Map()
  const numericSegments = rows
    .filter((row) => row.y > startY && row.y < endY)
    .flatMap((row) => row.segments)
    .filter((segment) => /^\d[\d\s,]*$/.test(normalized(segment.text)))

  // 열당 숫자 세그먼트가 정확히 1개일 때만 넘긴다 — 2개 이상을 이어붙이면
  // 「700」+「900」이 700900mm가 된다. 넘긴 값도 b×d로 확정되지는 않고
  // setDimension에서 빈칸+원문 참고로 남는다.
  const perMark = new Map<string, string[]>()
  const bounded = boundedAnchors(marks)
  for (const segment of numericSegments) {
    const target = bounded.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - segment.centerX) <
      Math.abs(closest.centerX - segment.centerX)
        ? candidate
        : closest,
    )
    // 세로 런과 같은 상한을 건다 — 한쪽만 상한이 없으면 스케치 대역의 아무 숫자나
    // 최근접 열에 붙어 이슈 없는 확정 b가 된다
    if (Math.abs(target.centerX - segment.centerX) > target.limit) continue
    const existing = perMark.get(target.mark) ?? []
    existing.push(segment.compact)
    perMark.set(target.mark, existing)
  }

  // 콤마는 자릿수 구분이다(parseDimension도 벗겨 받는다, verticalsByMark와 같은 규약) —
  // 여기서 「1,200」을 숫자가 아니라고 버리면 폭 1,000mm 이상인 부재를 놓친다
  return new Map(
    [...perMark.entries()].flatMap(([mark, values]) => {
      const text = values[0].replace(/,/g, '')
      return values.length === 1 && /^\d+$/.test(text)
        ? [[mark, text] as const]
        : []
    }),
  )
}

/**
 * 세로 치수를 열별로 모은다. scalarDimensions와 같은 규약 — 열당 정확히 1개일 때만
 * 넘긴다. 한 셀에 세로 숫자가 둘이면 어느 쪽이 断面인지 판정할 근거가 없다.
 */
function verticalsByMark(
  runs: VerticalRun[],
  anchors: MarkColumn[],
): Map<string, string> {
  // 라벨 행에 매인 가로 값과 달리 세로 런은 표 어디에나 있을 수 있어, 상한이 없으면
  // 남의 열 숫자가 이 열의 d로 확정된다. 符号이 하나면 열 간격을 잴 수 없다 —
  // 상한을 세울 근거가 없으니 짝짓지 않는다. 앵커 수로 재면 안 된다: 位置 열이
  // 한 符号을 여러 앵커로 늘리므로 단일 符号 표에서도 통과한다
  if (new Set(anchors.map(({ mark }) => mark)).size < 2) return new Map()
  const bounded = boundedAnchors(anchors)
  const perMark = new Map<string, string[]>()

  for (const run of runs) {
    // 콤마는 자릿수 구분이다(parseDimension도 벗겨 받는다). 여기서 「1,200」을
    // 숫자가 아니라고 버리면 카운트에서도 빠져 「열당 정확히 1개」 방어가 뚫린다
    const text = run.text.replace(/,/g, '')
    if (!/^\d+$/.test(text)) continue
    const target = bounded.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - run.x) < Math.abs(closest.centerX - run.x)
        ? candidate
        : closest,
    )
    if (Math.abs(target.centerX - run.x) > target.limit) continue
    const bucket = perMark.get(target.mark)
    if (bucket) bucket.push(text)
    else perMark.set(target.mark, [text])
  }

  return new Map(
    [...perMark.entries()].flatMap(([mark, values]) =>
      values.length === 1 ? [[mark, values[0]] as const] : [],
    ),
  )
}

/**
 * 「形状断面」だけを見出しにしたスケッチ型の柱表から、横に並ぶ b 寸法を拾う。
 * 通常の scalarDimensions はラベル行と主筋・フープ行の間を読むため、形状断面
 * が独立した行にある表では寸法を捨ててしまう。値は各符号の最近接かつ隣列の
 * 境界内に限り、同じ列の別寸法を連結しない。
 */
function sketchColumnHorizontalValues(
  rows: TextRow[],
  startY: number,
  endY: number,
  anchors: MarkColumn[],
): Map<string, string> {
  const numeric = rows
    .filter((row) => row.y > startY && row.y <= endY)
    .flatMap((row) => row.segments)
    .filter((segment) => /^\d[\d,]*$/.test(normalized(segment.text)))

  return new Map(
    boundedAnchors(anchors).flatMap((anchor) => {
      const candidates = numeric.filter(
        (segment) => Math.abs(segment.centerX - anchor.centerX) <= anchor.limit,
      )
      const nearest = candidates.sort(
        (left, right) =>
          Math.abs(left.centerX - anchor.centerX) -
          Math.abs(right.centerX - anchor.centerX),
      )[0]
      if (!nearest) return []
      return [[anchor.mark, normalized(nearest.text).replace(/,/g, '')] as const]
    }),
  )
}

/**
 * Fuji の柱スケッチは縦寸法が「形状断面」行の直上に立つ。横寸法と同じ列に
 * 置かれた数値のうち、形状断面に最も近い水平ランだけを符号へ対応させる。
 * 別の寸法列を同じ d に使わないため、y の最近接を先に固定する。
 */
function sketchColumnVerticalValues(
  verticals: VerticalRun[],
  shapeY: number,
  anchors: MarkColumn[],
): Map<string, string> {
  const numeric = verticals.filter((run) => /^\d[\d,]*$/.test(run.text))
  if (numeric.length === 0) return new Map()
  const nearestDistance = Math.min(
    ...numeric.map((run) => Math.abs(run.y - shapeY)),
  )
  const nearestRows = numeric.filter(
    (run) => Math.abs(Math.abs(run.y - shapeY) - nearestDistance) < 0.01,
  )

  return new Map(
    boundedAnchors(anchors).flatMap((anchor) => {
      const candidates = nearestRows.filter(
        (run) => Math.abs(run.x - anchor.centerX) <= anchor.limit,
      )
      const nearest = candidates.sort(
        (left, right) =>
          Math.abs(left.x - anchor.centerX) - Math.abs(right.x - anchor.centerX),
      )[0]
      if (!nearest) return []
      return [[anchor.mark, nearest.text.replace(/,/g, '')] as const]
    }),
  )
}

/**
 * 세로 치수를 층 슬라이스에 배정한다. 스케치의 세로 치수는 층 라벨 행보다 위에
 * 놓이기도 해서 슬라이스의 y대역(라벨 행 ~ 다음 라벨 행)으로 자르면 통째로 빠진다.
 *
 * 배정 앵커는 **표의 행 중 런에 가장 가까운 것**이고, 그 행이 든 슬라이스가 임자다.
 * 층 라벨을 앵커로 쓰면 둘이 함께 망가졌다 (#32①):
 *   - 슬라이스가 맞닿아 있어(endY[i] == startY[i+1]) 라벨 최근접의 보로노이 경계가
 *     span/2와 정확히 일치한다 — 아래 거리 상한이 중간 층에서 항상 참이 됐다.
 *   - 자기 층 데이터 행 사이에 있는 런이 더 가까운 아래 층 라벨로 넘어가, 그 층이
 *     남의 치수로 확정됐다.
 * 행을 앵커로 쓰면 라벨까지의 거리가 span/2를 넘을 수 있어 상한이 실제로 작동한다.
 *
 * rows에 표 밖 행을 넘기지 말 것 — 실물 ojkk p3의 2F 스케치에서는 표제란의
 * 図面名称 행이 세로 치수에서 0.6pt 거리라 층 라벨(12.3pt)보다 가깝다.
 *
 * 실물 5면 70건에서 이 배정은 층 라벨 최근접과 결과가 같다(전수 대조). 바뀌는 것은
 * 위 두 실패뿐이다.
 */
function verticalsBySlice(
  runs: VerticalRun[],
  slices: Array<{ startY: number; endY: number }>,
  rows: TextRow[],
): VerticalRun[][] {
  const buckets: VerticalRun[][] = slices.map(() => [])
  if (slices.length === 0) return buckets

  for (const run of runs) {
    const anchorY =
      rows.length > 0
        ? rows.reduce((closest, row) =>
            Math.abs(row.y - run.y) < Math.abs(closest.y - run.y) ? row : closest,
          ).y
        : run.y
    // 슬라이스는 맞닿아 정렬돼 있으므로, startY가 앵커 이하인 마지막 슬라이스가
    // 그 행을 담은 슬라이스다. 첫 슬라이스보다 위(머리행 등)면 첫 슬라이스로 본다
    let best = 0
    slices.forEach((slice, index) => {
      if (slice.startY <= anchorY) best = index
    })
    // 자기 블록의 마지막 행보다 아래에 있는 런은 어느 층의 것도 아니다. 그
    // 블록의 내용은 거기서 끝나고 다음 층 라벨까지는 빈칸인데, 대역만 보면 그
    // 빈칸도 아직 이 슬라이스라 아래 거리가 0이 되어 남의 치수가 조용히 확정된다.
    // 실물에서 세로 치수는 빈칸의 **아래쪽**, 자기 층 라벨 바로 위에 놓이므로
    // (실측 7.68~13.46pt, 5면 51건) 자기 블록의 첫 행보다도 위다 — 이 규칙에
    // 걸리지 않는다. 빈칸 위쪽에 뜬 숫자는 임자를 가릴 근거가 없으니 확정하지
    // 않고 원문으로 남긴다 (R10, PR #61 리뷰 major)
    // 자기 행의 범위는 endY 가 아니라 **다음 슬라이스의 startY** 로 끊는다.
    // 호출부가 마지막 슬라이스의 endY 를 tableBottom(= 표 바닥 행 자신의 y)으로
    // 자르므로, endY 를 배타 상한으로 쓰면 그 행이 빠져 최하층에서만 lastRowY 가
    // 한 행 위로 밀린다 (PR #61 리뷰 major)
    const bandEnd = slices[best + 1]?.startY ?? Number.POSITIVE_INFINITY
    const lastRowY = rows.reduce(
      (last, row) =>
        row.y >= slices[best].startY && row.y < bandEnd && row.y > last
          ? row.y
          : last,
      slices[best].startY,
    )
    if (run.y > lastRowY) continue

    // 자기 층 스케치가 아닌 런은 버린다. 거리 제한 없이 넣으면 어떤 숫자든 어느
    // 층엔가 붙어 이슈 없는 확정 d가 된다 — 미지 형식에서는 확정하지 않고 원문으로
    // 남는 쪽이 옳다 (R10)
    //
    // 거리는 라벨(startY) 한 점이 아니라 슬라이스 **대역**까지로 잰다. 앵커가 행인데
    // 상한만 라벨 기준이면 임자 슬라이스가 자기 런을 버린다 — 대역 하반부에 놓인
    // 런은 옳게 배정되고도 startY 에서 span/2 를 넘어 폐기된다 (PR #61 리뷰 major)
    const { startY, endY } = slices[best]
    const span = endY - startY
    const distance = Math.max(startY - run.y, run.y - endY, 0)
    if (distance <= span * SLICE_DISTANCE_LIMIT_RATIO) buckets[best].push(run)
  }

  return buckets
}

/**
 * 표의 실제 바닥 y를 구한다. 마지막 블록의 endY는 다음 타이틀이 없으면 페이지
 * 바닥까지 열려 있어, blockRows.at(-1)이 표 밖 표제란 텍스트(도면번호·축척 등)가
 * 될 수 있다 — 符号 열의 x대역(≤ tableRight) 안에 세그먼트가 있는 행으로 먼저
 * 좁혀야 표 밖 텍스트가 수집 창을 밀어내지 않는다 (#37, #33의 부작용)
 */
function tableBottomY(
  blockRows: TextRow[],
  marks: MarkColumn[],
  endY: number,
): number {
  return rowsWithinTable(blockRows, marks).at(-1)?.y ?? endY
}

/**
 * 표 안 행만 남긴다 — 符号 열의 x대역(≤ tableRight) 안에 세그먼트가 있는 행이다.
 * 표제란(図面名称·管理建築士 등)은 표와 같은 y대역에 걸쳐 있어 y로는 못 가른다.
 */
function rowsWithinTable(blockRows: TextRow[], marks: MarkColumn[]): TextRow[] {
  const tableRight = Math.max(...marks.map(({ centerX }) => centerX))
  return blockRows.filter((row) =>
    row.segments.some((segment) => segment.centerX <= tableRight),
  )
}

function parseColumnBlock(
  rows: TextRow[],
  headerIndex: number,
  endY: number,
  titleText: string,
  verticals: VerticalRun[],
): SectionCandidate[] {
  const header = rows[headerIndex]
  const marks = markColumns(header)
  if (marks.length === 0) return []
  const blockRows = rowsBetween(rows, header.y, endY)
  const stories = storyRows(blockRows)
  // 平屋 등 階 라벨이 없는 표는 大梁 블록과 같은 폴백으로 한 슬라이스 처리한다 —
  // 조기 반환하면 표가 통째로 「인식 불가」로 사라진다
  const slices: Array<{
    storyLabel: string | undefined
    startY: number
    endY: number
  }> =
    stories.length > 0
      ? stories.map((story, index) => ({
          storyLabel: story.label,
          startY: story.row.y,
          endY: stories[index + 1]?.row.y ?? endY,
        }))
      : [{ storyLabel: undefined, startY: header.y, endY }]
  // 수집 창을 표의 실제 행 범위로 닫는다. 가로 치수는 라벨 행 사이로 좁게 잘리므로
  // 같은 노출이 없다
  const tableBottom = tableBottomY(blockRows, marks, endY)
  const blockVerticals = verticalsBySlice(
    verticals.filter((run) => run.y > header.y && run.y < tableBottom),
    // 마지막 슬라이스의 endY는 표의 끝이 아니라 다음 타이틀·페이지 바닥이다.
    // 그대로 두면 그 층에서만 거리 상한이 층 간격의 몇 배로 벌어진다
    slices.map((slice) => ({
      startY: slice.startY,
      endY: Math.min(slice.endY, tableBottom),
    })),
    rowsWithinTable(blockRows, marks),
  )

  const candidates: SectionCandidate[] = []
  const preTableRows =
    stories.length > 0
      ? rows.filter(
          (row) => row.y > header.y && row.y < stories[0].row.y,
        )
      : []
  for (const [sliceIndex, slice] of slices.entries()) {
    const dataRows = rowsBetween(rows, slice.startY, slice.endY)
    const shapeRow =
      preTableRows
        .filter((row) => exactLabel(row, ['形状断面']))
        .at(-1) ??
      dataRows.find((row) => exactLabel(row, ['形状断面']))
    const mainRows = dataRows.filter((row) => exactLabel(row, ['主筋']))
    const hoopRows = dataRows.filter((row) =>
      exactLabel(row, ['帯筋', 'HOOP', 'フープ']),
    )
    // 라벨 존재만 보면 값 세그먼트가 없는 라벨 행이 scalarDimensions 폴백까지
    // 막아 원문 참고 표시가 통째로 사라진다 — 大梁 블록과 같은 조건을 쓴다
    const inSliceDimensionRows = dataRows.filter(
      (row) => isDimensionRow(row, ['断面', 'B×D', 'b×D'], marks),
    )
    // 일부 발주처는 階 행보다 먼저 공통 断面 행을 둔다. 해당 행을 놓치면
    // 3.5k 수치만 남아 b×d가 조용히 사라지므로, 슬라이스 직전의 가장 가까운
    // 断面 행을 쓰되 이전 층의 행을 여러 개 섞어 확정하지 않는다.
    const dimensionRows =
      inSliceDimensionRows.length > 0
        ? inSliceDimensionRows
        : preTableRows
            .filter((row) => isDimensionRow(row, ['断面', 'B×D', 'b×D'], marks))
            .slice(-1)
    // 한 슬라이스에 같은 라벨 행이 겹으로 있으면 여러 층 블록이 합쳐진 것이다 —
    // 階 라벨이 하나도 인식되지 않은 표(「一般階」)든 일부만 인식된 표(「1F」+「B1F」)든
    // 첫 행 값을 확정하면 나머지 층 값이 사유도 원문도 없이 사라진다
    const storyAmbiguous =
      mainRows.length > 1 || hoopRows.length > 1 || dimensionRows.length > 1
    const mainRow = storyAmbiguous ? undefined : mainRows[0]
    const hoopRow = storyAmbiguous ? undefined : hoopRows[0]
    const dimensionRow = storyAmbiguous ? undefined : dimensionRows[0]
    const positionRow =
      lastPositionRow(rows, header.y, slice.startY) ??
      dataRows.find((row) => exactLabel(row, ['位置']))
    const positions = positionRow ? positionColumns(positionRow, marks) : []
    const mainContinuations = mainRow
      ? barContinuationByMark(dataRows, mainRow, slice.endY, marks, BAR_TOKEN)
      : new Map<string, string>()
    const hoopContinuations = hoopRow
      ? barContinuationByMark(dataRows, hoopRow, slice.endY, marks, PITCH_TOKEN)
      : new Map<string, string>()
    // 스케치 치수는 가로·세로 모두 같은 열 앵커로 배정한다 — 한쪽만 符号 중심이면
    // 그쪽에서만 좁은 이웃 칸이 값을 가져간다
    const anchors = markAnchors(marks, positions)
    const rawDimensionValues = storyAmbiguous
      ? new Map<string, string>()
      : dimensionRow
        ? valuesByMark(dimensionRow, ['断面', 'B×D', 'b×D'], marks)
        : shapeRow
          ? sketchColumnHorizontalValues(
              rows,
              header.y,
              shapeRow.y,
              anchors,
            )
          : sketchDimensions(
              rows,
              slice.startY,
              [mainRow, hoopRow],
              anchors,
            )
    const dimensionValues = expandMarkGroups(rawDimensionValues, marks)
    // 断面 라벨 행이 있으면 세로 치수는 보지 않는다 — 라벨 행 값이 더 확실한 근거다
    const rawVerticalValues =
      storyAmbiguous || dimensionRow
        ? new Map<string, string>()
        : shapeRow
          ? sketchColumnVerticalValues(
              verticals,
              shapeRow.y,
              anchors,
            )
          : verticalsByMark(blockVerticals[sliceIndex], anchors)
    const verticalValues = expandMarkGroups(rawVerticalValues, marks)
    const mainByPosition =
      mainRow && positions.length > 0
        ? valuesByPosition(mainRow, ['主筋'], positions, marks)
        : new Map<string, string>()
    // 位置 열을 하나도 배정받지 못한 符号(DP가 옆 符号에 몰아준 경우)에도 셀은 있다 —
    // 폴백 없이 두면 그 符号의 主筋이 확정도 원문도 이슈도 없이 사라진다
    const mainByMark = mainRow
      ? valuesByMark(mainRow, ['主筋'], marks)
      : new Map<string, string>()
    const hoopLabel = hoopRow
      ? exactLabel(hoopRow, ['帯筋', 'HOOP', 'フープ'])?.compact
      : undefined
    const hoopValues =
      hoopRow && hoopLabel ? valuesByMark(hoopRow, [hoopLabel], marks) : new Map()

    marks.forEach(({ mark, rawCell }) => {
      if (storyAmbiguous) {
        // 값 없이 사유만 실은 후보를 남긴다 — 표가 조용히 사라지면 사용자는
        // 인식 실패와 구분할 수 없다. 階를 못 읽은 것과 階는 읽었으나 행이 겹인 것은
        // 사용자가 원도에서 확인할 곳이 다르므로 사유를 나눈다
        candidates.push({
          kind: kindFromMark(mark, titleText),
          mark,
          storyLabel: slice.storyLabel,
          raw: { 符号: rawCell },
          issues: [slice.storyLabel === undefined ? '階不明' : '項目行重複'],
        })
        return
      }
      const markPositions = positions
        .map((position, index) => ({ ...position, index }))
        .filter((position) => position.mark === mark)
      const mainCells =
        markPositions.length > 0
          ? markPositions
              .map((position) => ({
                position: position.label,
                raw: mainByPosition.get(String(position.index)),
              }))
              .filter(
                (cell): cell is { position: string; raw: string } =>
                  cell.raw !== undefined,
              )
          : mainByMark.has(mark)
            ? [{ raw: mainByMark.get(mark) as string }]
            : []
      const dimension = dimensionValues.get(mark)
      const hoop = hoopValues.get(mark)
      // 접힘 검사보다 먼저 떨어뜨리면, 값이 접힌 둘째 줄에만 있는 符号이
      // 사유도 원문도 없이 사라진다 — 접힘도 「읽은 것이 있다」에 넣는다
      if (
        !dimension &&
        mainCells.length === 0 &&
        !hoop &&
        !mainContinuations.has(mark) &&
        !hoopContinuations.has(mark)
      ) {
        return
      }

      const result: SectionCandidate = {
        kind: kindFromMark(mark, titleText),
        mark,
        storyLabel: slice.storyLabel,
        raw: { 符号: rawCell },
        issues: [],
      }
      setDimension(result, dimension, true, verticalValues.get(mark))
      const continuation = mainContinuations.get(mark)
      if (continuation !== undefined) {
        // 접힌 셀은 첫 줄만으로 확정하지 않는다 — 두 줄을 원문 참고로 남긴다
        for (const cell of mainCells) {
          const key =
            'position' in cell ? `主筋(${cell.position})` : '主筋'
          result.raw[key] = cleanedRebarRaw(cell.raw)
        }
        // 첫 줄이 아예 없으면 「접혀 있다」가 아니다 — 없는 접힘을 알리면
        // 사용자는 원도에서 존재하지 않는 둘째 줄을 찾는다
        const folded = mainCells.length > 0
        result.raw[folded ? '主筋(折返し)' : '主筋(無ラベル行)'] =
          cleanedRebarRaw(continuation)
        addIssue(result, folded ? '主筋折返し' : '主筋ラベル行外')
      } else {
        setColumnMain(result, mainCells, markPositions.length)
      }
      if (hoopLabel) {
        setPitch(result, 'hoop', hoopLabel, hoop, hoopContinuations.get(mark))
      }
      candidates.push(result)
    })
  }

  return candidates
}

function cellsForMark(
  values: Map<string, string>,
  positions: Array<PositionColumn & { index: number }>,
  mark: string,
): Array<{ position: string; rawPosition: string; raw: string }> {
  return positions
    .filter((position) => position.mark === mark)
    .map((position) => ({
      position: position.label,
      rawPosition: position.rawLabel,
      raw: values.get(String(position.index)),
    }))
    .filter(
      (cell): cell is {
        position: string
        rawPosition: string
        raw: string
      } => cell.raw !== undefined,
    )
}

function cutoffCellsByMark(
  rows: TextRow[],
  positions: PositionColumn[],
  marks: MarkColumn[],
): Map<string, Array<{ position?: string; raw: string }>> {
  const result = new Map<
    string,
    Array<{ position?: string; raw: string }>
  >()
  const positionTargets = positions.map((position, index) => ({
    id: String(index),
    centerX: position.centerX,
  }))
  const markTargets = marks.map(({ mark, centerX }) => ({
    id: mark,
    centerX,
  }))

  for (const segment of rows.flatMap((row) => row.segments)) {
    // NFKC로 全角 ［］를 半角 []에 접되, raw에는 원문 글자를 그대로 남긴다.
    // 안이 빈 表題의 「［］内は…」는 숫자 조건을 통과하지 않는다.
    if (!/^\[\d+\]$/.test(compact(segment.text))) continue

    const positionIndex = valuesAtTargets(
      [segment],
      positionTargets,
    ).keys().next().value as string | undefined
    const position =
      positionIndex === undefined ? undefined : positions[Number(positionIndex)]
    const mark =
      position?.mark ??
      (valuesAtTargets([segment], markTargets).keys().next().value as
        | string
        | undefined)
    if (mark === undefined) continue

    const cells = result.get(mark) ?? []
    cells.push({ position: position?.label, raw: segment.text })
    result.set(mark, cells)
  }

  return result
}

function cutoffFromSupportFace(
  cells: Array<{ position?: string; raw: string }>,
  positions: PositionColumn[],
): number | undefined {
  if (
    cells.length === 0 ||
    !isThreePositionLayout(positions.map(({ label }) => ({ position: label })))
  ) {
    return undefined
  }

  const leftLabel = positions[0]?.label
  const rightLabel = positions[2]?.label
  if (leftLabel === undefined || rightLabel === undefined) return undefined

  const values: number[] = []
  for (const cell of cells) {
    if (cell.position !== leftLabel && cell.position !== rightLabel) {
      return undefined
    }
    const match = compact(cell.raw).match(/^\[(\d+)\]$/)
    if (!match) return undefined
    const value = Number(match[1])
    if (!Number.isFinite(value)) return undefined
    values.push(value)
  }

  const first = values[0]
  return first !== undefined && values.every((value) => value === first)
    ? first
    : undefined
}

function parseGirderBlock(
  rows: TextRow[],
  headerIndex: number,
  endY: number,
  titleText: string,
  verticals: VerticalRun[],
): SectionCandidate[] {
  const header = rows[headerIndex]
  const marks = markColumns(header)
  if (marks.length === 0) return []
  const blockRows = rowsBetween(rows, header.y, endY)
  const stories = storyRows(blockRows)
  const slices =
    stories.length > 0
      ? stories.map((story, index) => ({
          storyLabel: story.label,
          startY: story.row.y,
          endY: stories[index + 1]?.row.y ?? endY,
        }))
      : [{ storyLabel: undefined, startY: header.y, endY }]
  // 柱 블록과 같은 이유로 수집 창과 슬라이스 상한을 표의 실제 행 범위로 닫는다
  const tableBottom = tableBottomY(blockRows, marks, endY)
  const blockVerticals = verticalsBySlice(
    verticals.filter((run) => run.y > header.y && run.y < tableBottom),
    slices.map((slice) => ({
      startY: slice.startY,
      endY: Math.min(slice.endY, tableBottom),
    })),
    rowsWithinTable(blockRows, marks),
  )
  const candidates: SectionCandidate[] = []
  const preTableRows =
    stories.length > 0
      ? rows.filter(
          (row) => row.y > header.y && row.y < stories[0].row.y,
        )
      : []

  for (const [sliceIndex, slice] of slices.entries()) {
    const dataRows = rowsBetween(rows, slice.startY, slice.endY)
    const inSliceDimensionRows = dataRows.filter(
      (row) => isDimensionRow(row, ['断面', 'B×D', 'b×D', '寸法'], marks),
    )
    const dimensionRows =
      inSliceDimensionRows.length > 0
        ? inSliceDimensionRows
        : preTableRows
            .filter((row) =>
              isDimensionRow(row, ['断面', 'B×D', 'b×D', '寸法'], marks),
            )
            .slice(-1)
    const topRows = dataRows.filter((row) => exactLabel(row, ['上筋', '上端筋']))
    const bottomRows = dataRows.filter((row) =>
      exactLabel(row, ['下筋', '下端筋']),
    )
    const stirrupRows = dataRows.filter((row) =>
      exactLabel(row, ['ST', 'STP', 'STP.', 'あばら筋', 'スターラップ']),
    )
    const inSliceSideBarRows = dataRows.filter((row) =>
      exactLabel(row, ['腹筋']),
    )
    const sideBarRows =
      inSliceSideBarRows.length > 0
        ? inSliceSideBarRows
        : preTableRows
            .filter((row) => exactLabel(row, ['腹筋']))
            .slice(-1)
    const widthTieRows = dataRows.filter((row) =>
      standaloneLabel(row, ['幅止筋', '巾止筋', '幅止め筋']),
    )
    const remarkRows = dataRows.filter((row) => exactLabel(row, ['備考']))
    // 柱 블록과 같은 방어 — 라벨 행이 겹이면 여러 층 블록이 합쳐진 것이다
    const storyAmbiguous =
      topRows.length > 1 ||
      bottomRows.length > 1 ||
      stirrupRows.length > 1 ||
      sideBarRows.length > 1 ||
      widthTieRows.length > 1 ||
      remarkRows.length > 1 ||
      dimensionRows.length > 1
    const dimensionRow = storyAmbiguous ? undefined : dimensionRows[0]
    const topRow = storyAmbiguous ? undefined : topRows[0]
    const bottomRow = storyAmbiguous ? undefined : bottomRows[0]
    const stirrupRow = storyAmbiguous ? undefined : stirrupRows[0]
    const sideBarRow = storyAmbiguous ? undefined : sideBarRows[0]
    const widthTieRow = storyAmbiguous ? undefined : widthTieRows[0]
    const remarkRow = storyAmbiguous ? undefined : remarkRows[0]
    const positionRow =
      lastPositionRow(rows, header.y, slice.startY) ??
      dataRows.find((row) => exactLabel(row, ['位置']))
    const positions = positionRow ? positionColumns(positionRow, marks) : []
    const indexedPositions = positions.map((position, index) => ({
      ...position,
      index,
    }))
    const cutoffCells = cutoffCellsByMark(dataRows, positions, marks)
    const dimensionLabel = dimensionRow
      ? exactLabel(dimensionRow, ['断面', 'B×D', 'b×D', '寸法'])?.compact
      : undefined
    // 断面 라벨 행이 없는 표(ojkk 大梁リスト)의 근거는 스케치 치수뿐이다 — 柱 블록과
    // 같은 폴백으로 가로 치수를 줍고, 세로(회전 문자열)와 짝지어야 b×D가 나온다
    const anchors = markAnchors(marks, positions)
    const rawDimensionValues = storyAmbiguous
      ? new Map<string, string>()
      : dimensionRow && dimensionLabel
        ? valuesByMark(dimensionRow, [dimensionLabel], marks)
        : sketchDimensions(
            rows,
            slice.startY,
            [topRow, bottomRow, stirrupRow],
            anchors,
          )
    const dimensionValues = expandMarkGroups(rawDimensionValues, marks)
    // 断面 라벨 행이 있으면 세로 치수는 보지 않는다 — 라벨 행 값이 더 확실한 근거다
    const rawVerticalValues =
      storyAmbiguous || dimensionRow
        ? new Map<string, string>()
        : verticalsByMark(blockVerticals[sliceIndex], anchors)
    const verticalValues = expandMarkGroups(rawVerticalValues, marks)
    const topLabel = topRow
      ? exactLabel(topRow, ['上筋', '上端筋'])?.compact
      : undefined
    const bottomLabel = bottomRow
      ? exactLabel(bottomRow, ['下筋', '下端筋'])?.compact
      : undefined
    // 柱 블록과 같은 폴백 — 位置 열을 배정받지 못한 符号의 셀도 남긴다
    const topByPosition =
      topRow && topLabel && positions.length > 0
        ? valuesByPosition(topRow, [topLabel], positions, marks)
        : new Map<string, string>()
    const topByMark =
      topRow && topLabel
        ? valuesByMark(topRow, [topLabel], marks)
        : new Map<string, string>()
    const bottomByPosition =
      bottomRow && bottomLabel && positions.length > 0
        ? valuesByPosition(bottomRow, [bottomLabel], positions, marks)
        : new Map<string, string>()
    const bottomByMark =
      bottomRow && bottomLabel
        ? valuesByMark(bottomRow, [bottomLabel], marks)
        : new Map<string, string>()
    const stirrupLabel = stirrupRow
      ? exactLabel(stirrupRow, ['ST', 'STP', 'STP.', 'あばら筋', 'スターラップ'])?.compact
      : undefined
    const stirrupValues =
      stirrupRow && stirrupLabel
        ? valuesByMark(stirrupRow, [stirrupLabel], marks)
        : new Map<string, string>()
    const sideBarValues = sideBarRow
      ? valuesByMark(sideBarRow, ['腹筋'], marks)
      : new Map<string, string>()
    const widthTieLabel = widthTieRow
      ? standaloneLabel(widthTieRow, ['幅止筋', '巾止筋', '幅止め筋'])?.compact
      : undefined
    const widthTieValues =
      widthTieRow && widthTieLabel
        ? valuesByMark(widthTieRow, [widthTieLabel], marks)
        : new Map<string, string>()
    const remarkValues = remarkRow
      ? valuesByMark(remarkRow, ['備考'], marks)
      : new Map<string, string>()
    // 접힌 셀(줄바꿈) 감지 — 柱 블록과 같은 방어를 上筋/下筋/あばら筋에도 건다
    const topContinuations = topRow
      ? barContinuationByMark(dataRows, topRow, slice.endY, marks, BAR_TOKEN)
      : new Map<string, string>()
    const bottomContinuations = bottomRow
      ? barContinuationByMark(dataRows, bottomRow, slice.endY, marks, BAR_TOKEN)
      : new Map<string, string>()
    const stirrupContinuations = stirrupRow
      ? barContinuationByMark(
          dataRows,
          stirrupRow,
          slice.endY,
          marks,
          PITCH_TOKEN,
        )
      : new Map<string, string>()

    for (const { mark, rawCell } of marks) {
      if (storyAmbiguous) {
        candidates.push({
          kind: kindFromMark(mark, titleText),
          mark,
          storyLabel: slice.storyLabel,
          raw: { 符号: rawCell },
          issues: [slice.storyLabel === undefined ? '階不明' : '項目行重複'],
        })
        continue
      }
      const markPositions = indexedPositions.filter(
        (position) => position.mark === mark,
      )
      const topCells =
        markPositions.length > 0
          ? cellsForMark(topByPosition, indexedPositions, mark)
          : topByMark.has(mark)
            ? [{ position: '全断面', raw: topByMark.get(mark) as string }]
            : []
      const bottomCells =
        markPositions.length > 0
          ? cellsForMark(bottomByPosition, indexedPositions, mark)
          : bottomByMark.has(mark)
            ? [{ position: '全断面', raw: bottomByMark.get(mark) as string }]
            : []
      const dimension = dimensionValues.get(mark)
      const stirrup = stirrupValues.get(mark)
      const sideBar = sideBarValues.get(mark)
      // 柱 블록과 같은 이유 — 접힘도 「읽은 것이 있다」에 넣는다
      if (
        !dimension &&
        topCells.length === 0 &&
        bottomCells.length === 0 &&
        !stirrup &&
        sideBar === undefined &&
        !cutoffCells.has(mark) &&
        !topContinuations.has(mark) &&
        !bottomContinuations.has(mark) &&
        !stirrupContinuations.has(mark)
      ) {
        continue
      }

      const result: SectionCandidate = {
        kind: kindFromMark(mark, titleText),
        mark,
        storyLabel: slice.storyLabel,
        raw: { 符号: rawCell },
        issues: [],
      }
      const cutoffMm = cutoffFromSupportFace(
        cutoffCells.get(mark) ?? [],
        markPositions,
      )
      setDimension(result, dimension, false, verticalValues.get(mark))
      const topFold = topContinuations.get(mark)
      const bottomFold = bottomContinuations.get(mark)
      if (topFold !== undefined || bottomFold !== undefined) {
        // 접힌 셀은 첫 줄만으로 확정하지 않는다 — 줄들을 원문 참고로 남긴다
        if (topLabel) {
          for (const cell of topCells) {
            result.raw[`${topLabel}(${cell.position})`] = cleanedRebarRaw(
              cell.raw,
            )
          }
        }
        if (bottomLabel) {
          for (const cell of bottomCells) {
            result.raw[`${bottomLabel}(${cell.position})`] = cleanedRebarRaw(
              cell.raw,
            )
          }
        }
        // 上下를 한 키에 몰면 양쪽이 접힌 표에서 下筋 줄이 上筋 줄을 덮는다.
        // 帯筋·ST와 같은 라벨 규약을 써 어느 행이 접혔는지도 남긴다.
        // 柱 블록과 같은 이유로 첫 줄이 없는 쪽은 접힘이라 부르지 않는다
        if (topFold !== undefined) {
          const folded = topCells.length > 0
          result.raw[
            `${topLabel ?? '上筋'}(${folded ? '折返し' : '無ラベル行'})`
          ] = cleanedRebarRaw(topFold)
          addIssue(result, folded ? '主筋折返し' : '主筋ラベル行外')
        }
        if (bottomFold !== undefined) {
          const folded = bottomCells.length > 0
          result.raw[
            `${bottomLabel ?? '下筋'}(${folded ? '折返し' : '無ラベル行'})`
          ] = cleanedRebarRaw(bottomFold)
          addIssue(result, folded ? '主筋折返し' : '主筋ラベル行外')
        }
      } else if (topLabel || bottomLabel) {
        // 한쪽 라벨만 인식돼도 읽어낸 셀은 남긴다 — setGirderMain이 上下 양쪽을
        // 요구하므로 「主筋位置欠落」이 붙고, 확정 없이 원문이 보존된다
        setGirderMain(
          result,
          topLabel ?? '上筋',
          bottomLabel ?? '下筋',
          topCells,
          bottomCells,
          markPositions.length,
        )
      }
      if (cutoffMm !== undefined) result.cutoffFromSupportFaceMm = cutoffMm
      if (stirrupLabel) {
        setPitch(
          result,
          'stirrup',
          stirrupLabel,
          stirrup,
          stirrupContinuations.get(mark),
        )
      }
      setSideBar(result, sideBar)
      setWidthTie(result, widthTieLabel ?? '幅止筋', widthTieValues.get(mark))
      const remark = remarkValues.get(mark)
      if (remark !== undefined) result.raw.備考 = compact(remark)
      for (const cell of cutoffCells.get(mark) ?? []) {
        const key = cell.position
          ? `カットオフ(${cell.position})`
          : 'カットオフ'
        result.raw[key] = cell.raw
      }
      candidates.push(result)
    }
  }

  return candidates
}

function parseTableRegion(
  rows: TextRow[],
  anchor: TitleAnchor,
  endY: number,
  xStart: number,
  xEnd: number,
  verticals: VerticalRun[],
): ParsedSectionList | undefined {
  const isSlabList = /スラブリスト|耐圧版リスト/.test(anchor.listKind)
  const isWallList = anchor.listKind === '壁リスト'
  // 영역을 y뿐 아니라 x대역으로도 잘라낸다 — 좌우로 나란한 리스트에서 옆 표의
  // 세그먼트가 섞이면 符号·라벨 매칭이 옆 표를 오염시킨다
  const tableRows = rows
    .filter(
      (row) =>
        row.y >= anchor.row.y && (isSlabList || row.y < endY),
    )
    .map((row) => {
      const items = row.items.filter(
        (item) =>
          isSlabList || isWallList || (item.x + item.w >= xStart && item.x < xEnd),
      )
      return items.length > 0
        ? { ...row, items, segments: makeSegments(items) }
        : undefined
    })
    .filter((row): row is TextRow => row !== undefined)
  const headerIndexes = tableRows
    .map((row, index) => ({ index, marks: markColumns(row) }))
    .filter(({ marks }) => marks.length > 0)
    .map(({ index }) => index)
  // 타이틀과 特記는 같은 표제 줄이어도 글자 크기·기준선 차이로 인접 복원 행이 될 수
  // 있다. 최초 符号 행 앞까지만 합쳐 표의 데이터 행은 건드리지 않는다.
  const titleLineText = compact(
    tableRows
      .slice(0, headerIndexes[0] ?? tableRows.length)
      .flatMap((row) => row.items)
      .map((item) => item.str)
      .join(''),
  )
  // 대상이 아닌 리스트를 못 읽었다고 알리면 정상 파싱된 도면에서도 실패 안내가 뜬다
  const outOfScope = isOutOfScopeList(anchor.titleText)
  if (isWallList || isSlabList) {
    const candidates =
      isWallList
        ? parseWallBlock(tableRows, anchor.titleText, endY)
        : parseSlabBlock(tableRows, anchor, endY)
    return {
      listKind: anchor.listKind,
      candidates,
      ...(candidates.length === 0 && !outOfScope
        ? { issue: '項目行未認識' as const }
        : {}),
    }
  }
  // 타이틀은 인식했는데 符号 행을 못 읽은 표를 통째로 버리면, 화면에는
  // 「断面リスト가 없다」로 보여 사용자가 인식 실패와 구분할 수 없다.
  // 사유를 코드로 실어 보내고 문구는 표시부가 고른다 (CandidateIssue와 같은 규약)
  if (headerIndexes.length === 0) {
    return outOfScope
      ? undefined
      : { listKind: anchor.listKind, candidates: [], issue: '符号行未認識' }
  }

  const candidates: SectionCandidate[] = []
  // 표의 x대역 밖 세로 문자열은 옆 표의 것이다 — 행과 같은 경계로 자른다
  const tableVerticals = verticals.filter(
    (run) => run.x >= xStart && run.x < xEnd,
  )
  headerIndexes.forEach((headerIndex, index) => {
    const blockEnd = tableRows[headerIndexes[index + 1]]?.y ?? endY
    const headerMarks = markColumns(tableRows[headerIndex])
    const rightmostMark = Math.max(
      ...headerMarks.map(({ centerX }) => centerX),
    )
    const sortedMarkCenters = headerMarks
      .map(({ centerX }) => centerX)
      .sort((left, right) => left - right)
    const trailingGap =
      sortedMarkCenters.length >= 2
        ? sortedMarkCenters.at(-1)! - sortedMarkCenters.at(-2)!
        : undefined
    // 다음 표의 왼쪽 라벨이 같은 y행에 끼어들어도, 현재 표의 마지막 부호와
    // 다음 표 제목 사이 중점 밖이면 현재 블록에 포함하지 않는다. 이웃 표가 없을
    // 때는 페이지 끝을 열어 두어 넓은 마지막 열의 스케치 치수를 보존한다.
    const localEnd = Number.isFinite(xEnd)
      ? (rightmostMark + xEnd) / 2
      : trailingGap === undefined
        ? Number.POSITIVE_INFINITY
        : rightmostMark + trailingGap
    const localRows = tableRows
      .slice(headerIndex)
      .map((row) => {
        const items = row.items.filter(
          (item) => item.x + item.w >= xStart && item.x < localEnd,
        )
        return items.length > 0
          ? { ...row, items, segments: makeSegments(items) }
          : undefined
      })
      .filter((row): row is TextRow => row !== undefined)
    const localVerticals = tableVerticals.filter(
      (run) => run.x < localEnd,
    )
    const parsed = anchor.listKind.includes('柱')
      ? parseColumnBlock(
          localRows,
          0,
          blockEnd,
          anchor.titleText,
          localVerticals,
        )
      : parseGirderBlock(
          localRows,
          0,
          blockEnd,
          anchor.titleText,
          localVerticals,
        )
    candidates.push(...parsed)
  })

  // 幅止め筋はリスト全体の特記であり、同じ大梁リストの全候補に効く。
  // 柱・小梁ではこの特記自体を読まない — 1通則3) の対象に柱はなく、小梁は範囲外。
  const hasGirder = candidates.some((candidate) => candidate.kind === '大梁')
  const widthTie = hasGirder
    ? widthTieFromTitle(titleLineText)
    : undefined
  if (widthTie) {
    for (const candidate of candidates) {
      if (candidate.kind !== '大梁') continue
      if (widthTie.value) candidate.widthTie = { ...widthTie.value }
      else if (widthTie.raw) {
        candidate.raw['幅止筋'] = widthTie.raw
        addIssue(candidate, '幅止め筋解釈不能')
      }
    }
  }

  // 符号은 읽었으나 항목 행(断面·主筋·帯筋)을 하나도 못 읽은 표 — 「符号을 못
  // 읽었다」로 안내하면 사용자가 원도의 엉뚱한 곳을 본다
  return {
    listKind: anchor.listKind,
    candidates,
    ...(candidates.length === 0 && !outOfScope
      ? { issue: '項目行未認識' as const }
      : {}),
  }
}

export function parseSectionLists(page: TextPage): ParsedSectionList[] {
  const rows = recoverRows(page.items)
  const verticals = verticalRuns(page.items)
  const anchors = titleAnchors(rows)
  const parsed: ParsedSectionList[] = []

  anchors.forEach((anchor) => {
    // 같은 y대역의 오른쪽 타이틀은 아래 표가 아니라 옆 표다 — x 경계가 된다
    const sameBand = Math.max(anchor.row.height, 1) * PROXIMITY_MULTIPLIER
    // 좌측 경계를 타이틀 x−40으로 고정하면 중앙 정렬 타이틀 표의 왼쪽 라벨열이
    // 잘린다 — 좌측 이웃 타이틀과의 중점을 쓰고, 이웃이 없으면 왼쪽을 열어 둔다
    const leftNeighbor = anchors
      .filter(
        (other) =>
          other !== anchor &&
          Math.abs(other.row.y - anchor.row.y) <= sameBand &&
          other.x < anchor.x,
      )
      .sort((left, right) => right.x - left.x)[0]
    const xStart = leftNeighbor
      ? (leftNeighbor.x + anchor.x) / 2
      : Number.NEGATIVE_INFINITY
    const rightNeighbor = anchors
      .filter(
        (other) =>
          other !== anchor &&
          Math.abs(other.row.y - anchor.row.y) <= sameBand &&
          other.x > anchor.x,
      )
      .sort((left, right) => left.x - right.x)[0]
    // 우측 경계는 이웃 표 제목의 시작점이다. 제목이 표의 중앙에 놓인 경우에는
    // 제목 사이 중점이 실제 열 경계보다 왼쪽으로 들어와 마지막 부호(ina の GA,
    // Fuji の B1C2)를 잘라낸다. 제목의 왼쪽 대역은 이미 xStart로 분리했으므로,
    // 오른쪽은 이웃 제목 자체만 제외하면 표의 마지막 열을 온전히 받을 수 있다.
    const xEnd = rightNeighbor ? rightNeighbor.x : Number.POSITIVE_INFINITY
    // 블록 끝은 이 x대역 안에서 아래에 오는 다음 타이틀
    const belowEnd = rightNeighbor
      ? (anchor.x + rightNeighbor.x) / 2
      : Number.POSITIVE_INFINITY
    const below = anchors
      .filter(
        (other) =>
          other.row.y - anchor.row.y > sameBand &&
          other.x >= xStart &&
          other.x < belowEnd,
      )
      .sort((left, right) => left.row.y - right.row.y)[0]
    const endY = below?.row.y ?? page.heightPt
    const result = parseTableRegion(
      rows,
      anchor,
      endY,
      xStart,
      xEnd,
      verticals,
    )
    if (result) parsed.push(result)
  })

  return parsed
}
