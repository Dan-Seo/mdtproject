import { BAR_SIZES, type BarSize } from '@/domain/model/member'

import type {
  ParsedSectionList,
  SectionCandidate,
  TextItem,
  TextPage,
} from './types'

interface TextSegment {
  text: string
  compact: string
  x: number
  endX: number
  centerX: number
}

interface TextRow {
  y: number
  height: number
  items: TextItem[]
  segments: TextSegment[]
}

interface MarkColumn {
  mark: string
  centerX: number
}

interface PositionColumn {
  label: string
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

const TITLE_PATTERN =
  /(柱断面リスト|大梁断面リスト|小梁断面リスト|地中梁リスト|柱リスト|大梁リスト|梁リスト)/
const STORY_PATTERN = /^(?:RF|R階|\d+F|\d+階)$/
const MARK_PATTERN = /^(?:(?:C|G|FC|FG|B|CB)\d+[A-Z]?|W\d+|fg)$/i

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[‐‑‒–—−]/g, '-')
}

function compact(value: string): string {
  return normalized(value).replace(/\s+/g, '')
}

function makeSegments(items: TextItem[]): TextSegment[] {
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

function recoverRows(items: TextItem[]): TextRow[] {
  const rows: Array<Omit<TextRow, 'segments'>> = []
  const horizontalItems = items
    .filter(
      (item) =>
        item.str.trim().length > 0 &&
        (item.rot === undefined || Math.abs(item.rot) < 0.01),
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

function titleAnchors(rows: TextRow[]): TitleAnchor[] {
  const anchors: TitleAnchor[] = []

  // 한 행에 타이틀이 여러 개면(좌우 병치) 전부 앵커로 잡는다
  for (const row of rows) {
    for (const segment of row.segments) {
      const match = segment.compact.match(TITLE_PATTERN)
      if (!match) continue
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
  return row.segments.find((segment) =>
    normalizedAliases.includes(segment.compact),
  )
}

function canonicalMark(value: string): string | undefined {
  const mark = compact(value)
  if (!MARK_PATTERN.test(mark)) return undefined
  return mark === 'fg' ? mark : mark.toUpperCase()
}

function markColumns(row: TextRow): MarkColumn[] {
  const label = exactLabel(row, ['符号'])
  if (!label) return []

  return row.segments
    .filter((segment) => segment.centerX > label.endX)
    .map((segment) => ({
      mark: canonicalMark(segment.text),
      centerX: segment.centerX,
    }))
    .filter((entry): entry is MarkColumn => entry.mark !== undefined)
}

function storyFromRow(row: TextRow): string | undefined {
  return row.segments
    .map((segment) => segment.compact)
    .find((value) => STORY_PATTERN.test(value))
}

function kindFromMark(mark: string, titleText: string): SectionCandidate['kind'] {
  // 小梁·地中梁·基礎 리스트의 부호가 C·G로 시작해도 반영 대상이 아니다 (ADR-005).
  // 캡처(listKind)는 「基礎梁リスト」에서 「梁リスト」로 잘리므로 타이틀 원문을 본다
  if (/小梁|地中梁|基礎/.test(titleText)) return '対象外'
  if (/^C\d/i.test(mark)) return '柱'
  if (/^G\d/i.test(mark)) return '大梁'
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

  const positions = row.segments
    .filter((segment) => segment.centerX > label.endX)
    .map((segment) => ({ label: segment.compact, centerX: segment.centerX }))
    .filter((position) => position.label.length > 0)

  if (positions.length === 0) return []

  const spacings = positions
    .slice(1)
    .map((position, index) => position.centerX - positions[index].centerX)
    .filter((spacing) => spacing > 0)
  const emptyPenalty = Math.pow(median(spacings) * 0.75, 2)
  const costs = Array.from({ length: marks.length + 1 }, () =>
    Array<number>(positions.length + 1).fill(Number.POSITIVE_INFINITY),
  )
  const choices = Array.from({ length: marks.length + 1 }, () =>
    Array<number>(positions.length + 1).fill(0),
  )
  costs[0][0] = 0

  for (let markIndex = 0; markIndex < marks.length; markIndex += 1) {
    for (let used = 0; used <= positions.length; used += 1) {
      if (!Number.isFinite(costs[markIndex][used])) continue
      for (let count = 0; used + count <= positions.length; count += 1) {
        const group = positions.slice(used, used + count)
        const mean =
          count === 0
            ? marks[markIndex].centerX
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
            : Math.pow(mean - marks[markIndex].centerX, 2) + spread * 0.1
        const nextCost = costs[markIndex][used] + groupCost
        if (nextCost < costs[markIndex + 1][used + count]) {
          costs[markIndex + 1][used + count] = nextCost
          choices[markIndex + 1][used + count] = count
        }
      }
    }
  }

  const counts = Array<number>(marks.length).fill(0)
  let used = positions.length
  for (let markIndex = marks.length; markIndex > 0; markIndex -= 1) {
    const count = choices[markIndex][used]
    counts[markIndex - 1] = count
    used -= count
  }

  const result: PositionColumn[] = []
  let positionIndex = 0
  counts.forEach((count, markIndex) => {
    for (let index = 0; index < count; index += 1) {
      const position = positions[positionIndex]
      result.push({ ...position, mark: marks[markIndex].mark })
      positionIndex += 1
    }
  })
  return result
}

function dataSegments(row: TextRow, aliases: readonly string[]): TextSegment[] {
  const label = exactLabel(row, aliases)
  if (!label) return []
  return row.segments.filter((segment) => segment.centerX > label.endX)
}

function valuesAtTargets(
  segments: TextSegment[],
  targets: Array<{ id: string; centerX: number }>,
): Map<string, string> {
  const assigned = new Map<string, TextSegment[]>()
  if (targets.length === 0) return new Map()

  for (const segment of segments) {
    const target = targets.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - segment.centerX) <
      Math.abs(closest.centerX - segment.centerX)
        ? candidate
        : closest,
    )
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
  return valuesAtTargets(
    dataSegments(row, aliases),
    marks.map(({ mark, centerX }) => ({ id: mark, centerX })),
  )
}

function valuesByPosition(
  row: TextRow,
  aliases: readonly string[],
  positions: PositionColumn[],
): Map<string, string> {
  return valuesAtTargets(
    dataSegments(row, aliases),
    positions.map((position, index) => ({
      id: String(index),
      centerX: position.centerX,
    })),
  )
}

/** 후프 형상 기호(□·▤·▦)와 이음 하이픈 등 셀 머리의 장식만 벗긴다. */
function stripDecoration(value: string): string {
  return compact(value).replace(/^[-□▤▦]+/, '')
}

function parseBar(value: string): ParsedBar | undefined {
  // 2段筋 등 복수 표기(「4-D25+2-D22」)를 첫 매치로 잘라 확정하지 않는다 —
  // 단일 표기일 때만 채택하고, 아니면 빈칸+원문 경로로 보낸다
  const matches = [...compact(value).matchAll(/(\d+)-?(D\d+)/gi)]
  if (matches.length !== 1) return undefined
  const size = matches[0][2].toUpperCase() as BarSize
  if (!barSizes.has(size)) return undefined
  return { count: Number(matches[0][1]), size }
}

function parsePitch(
  value: string,
): { size: BarSize; pitchMm: number } | undefined {
  // 셀 전체가 단일 「径@ピッチ」일 때만 채택한다 — 부분 매치를 허용하면
  // 組数 접두사(「2-D13@100」)가 조용히 떨어져 1組로 절반 계상된다
  const match = stripDecoration(value).match(/^(D\d+)-?@(\d+)$/i)
  if (!match) return undefined
  const size = match[1].toUpperCase() as BarSize
  if (!barSizes.has(size)) return undefined
  return { size, pitchMm: Number(match[2]) }
}

function parseDimension(value: string): { b: number; depth: number } | undefined {
  // 이웃 셀이 붙은 「800×800 900×900」에서 첫 매치를 취하면 두 번째 그룹이
  // 공백 너머 숫자까지 삼켜 b=800·depth=800900이 된다 — 다중 매치는 거부한다
  const matches = [
    ...normalized(value).matchAll(/(\d[\d,]*)\s*[x×]\s*(\d[\d,]*)/gi),
  ]
  if (matches.length !== 1) return undefined
  const b = Number(matches[0][1].replace(/,/g, ''))
  const depth = Number(matches[0][2].replace(/,/g, ''))
  // 부재 단면이 4자리 mm를 넘는 값은 셀 병합 잔재다 — 확정하지 않는다
  return b > 9999 || depth > 9999 ? undefined : { b, depth }
}

function cleanedRebarRaw(value: string): string {
  const stripped = stripDecoration(value)
  const tokens = [...stripped.matchAll(/(?:\d+-[A-Z]\d+|[A-Z]\d+-?@\d+)/gi)]
  // 장식을 벗긴 셀 전체가 단일 토큰일 때만 토큰 형태로 남긴다 — 부분 토큰으로
  // 줄이면 「2-D13@100」의 @100처럼 원문 정보가 참고 표시에서 사라진다
  return tokens.length === 1 && tokens[0][0] === stripped
    ? tokens[0][0]
    : stripped
}

function addIssue(candidate: SectionCandidate, message: string): void {
  if (!candidate.issues.includes(message)) candidate.issues.push(message)
}

function setDimension(
  candidate: SectionCandidate,
  value: string | undefined,
  column: boolean,
): void {
  if (!value) return
  const parsed = parseDimension(value)
  if (parsed) {
    candidate.b = parsed.b
    if (column) candidate.d = parsed.depth
    else candidate.depth = parsed.depth
    return
  }

  // 단독 숫자는 b×d로 확정할 수 없다 — 스케치 치수선 숫자를 정사각형으로
  // 승격하면 값을 지어내는 것이 된다 (ADR-012 계열). 빈칸+원문으로 남긴다.
  candidate.raw['断面'] = compact(value)
  addIssue(
    candidate,
    `断面「${compact(value)}」は矩形 b×d として解釈できません。`,
  )
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
      ? '主筋を対応する鉄筋径・本数として解釈できません。'
      : !complete
        ? '柱頭・柱脚の主筋を両方とも読み取れないため、主筋候補を空欄にしました。'
        : '柱頭と柱脚で主筋が異なるため、主筋候補を空欄にしました。',
  )
}

function setGirderMain(
  candidate: SectionCandidate,
  topLabel: string,
  bottomLabel: string,
  topCells: Array<{ position: string; raw: string }>,
  bottomCells: Array<{ position: string; raw: string }>,
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
  }

  for (const cell of topCells) {
    candidate.raw[`${topLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  for (const cell of bottomCells) {
    candidate.raw[`${bottomLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  addIssue(
    candidate,
    allParsed && complete
      ? '位置ごとに主筋が異なるため、主筋候補を空欄にしました。'
      : '主筋の位置別セルを確実に解釈できないため、主筋候補を空欄にしました。',
  )
}

function setPitch(
  candidate: SectionCandidate,
  key: 'hoop' | 'stirrup',
  label: string,
  raw: string | undefined,
): void {
  if (!raw) return
  const parsed = parsePitch(raw)
  if (parsed) {
    candidate[key] = parsed
    return
  }

  candidate.raw[label] = cleanedRebarRaw(raw)
  addIssue(
    candidate,
    `${label}「${cleanedRebarRaw(raw)}」は対応する鉄筋径として解釈できません。`,
  )
}

function rowsBetween(rows: TextRow[], startY: number, endY: number): TextRow[] {
  return rows.filter((row) => row.y > startY && row.y < endY)
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
  for (const segment of numericSegments) {
    const target = marks.reduce((closest, candidate) =>
      Math.abs(candidate.centerX - segment.centerX) <
      Math.abs(closest.centerX - segment.centerX)
        ? candidate
        : closest,
    )
    const existing = perMark.get(target.mark) ?? []
    existing.push(segment.compact)
    perMark.set(target.mark, existing)
  }

  return new Map(
    [...perMark.entries()].flatMap(([mark, values]) =>
      values.length === 1 && /^\d+$/.test(values[0])
        ? [[mark, values[0]] as const]
        : [],
    ),
  )
}

function parseColumnBlock(
  rows: TextRow[],
  headerIndex: number,
  endY: number,
  titleText: string,
): SectionCandidate[] {
  const header = rows[headerIndex]
  const marks = markColumns(header)
  if (marks.length === 0) return []
  const blockRows = rowsBetween(rows, header.y, endY)
  const stories: StoryRow[] = blockRows
    .map((row) => ({ label: storyFromRow(row), row }))
    .filter((entry): entry is StoryRow => entry.label !== undefined)
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

  const candidates: SectionCandidate[] = []
  for (const slice of slices) {
    const dataRows = rowsBetween(rows, slice.startY, slice.endY)
    const mainRow = dataRows.find((row) => exactLabel(row, ['主筋']))
    const hoopRow = dataRows.find((row) => exactLabel(row, ['帯筋', 'HOOP']))
    const dimensionRow = dataRows.find((row) => exactLabel(row, ['断面']))
    const positionRow =
      lastPositionRow(rows, header.y, slice.startY) ??
      dataRows.find((row) => exactLabel(row, ['位置']))
    const positions = positionRow ? positionColumns(positionRow, marks) : []
    const dimensionValues = dimensionRow
      ? valuesByMark(dimensionRow, ['断面'], marks)
      : scalarDimensions(
          rows,
          slice.startY,
          mainRow?.y ?? slice.endY,
          marks,
        )
    const mainByPosition =
      mainRow && positions.length > 0
        ? valuesByPosition(mainRow, ['主筋'], positions)
        : new Map<string, string>()
    const mainByMark =
      mainRow && positions.length === 0
        ? valuesByMark(mainRow, ['主筋'], marks)
        : new Map<string, string>()
    const hoopLabel = hoopRow
      ? exactLabel(hoopRow, ['帯筋', 'HOOP'])?.compact
      : undefined
    const hoopValues =
      hoopRow && hoopLabel ? valuesByMark(hoopRow, [hoopLabel], marks) : new Map()

    marks.forEach(({ mark }) => {
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
      if (!dimension && mainCells.length === 0 && !hoop) return

      const result: SectionCandidate = {
        kind: kindFromMark(mark, titleText),
        mark,
        storyLabel: slice.storyLabel,
        raw: {},
        issues: [],
      }
      setDimension(result, dimension, true)
      setColumnMain(result, mainCells, markPositions.length)
      if (hoopLabel) setPitch(result, 'hoop', hoopLabel, hoop)
      candidates.push(result)
    })
  }

  return candidates
}

function cellsForMark(
  values: Map<string, string>,
  positions: Array<PositionColumn & { index: number }>,
  mark: string,
): Array<{ position: string; raw: string }> {
  return positions
    .filter((position) => position.mark === mark)
    .map((position) => ({
      position: position.label,
      raw: values.get(String(position.index)),
    }))
    .filter(
      (cell): cell is { position: string; raw: string } => cell.raw !== undefined,
    )
}

function parseGirderBlock(
  rows: TextRow[],
  headerIndex: number,
  endY: number,
  titleText: string,
): SectionCandidate[] {
  const header = rows[headerIndex]
  const marks = markColumns(header)
  if (marks.length === 0) return []
  const blockRows = rowsBetween(rows, header.y, endY)
  const stories: StoryRow[] = blockRows
    .map((row) => ({ label: storyFromRow(row), row }))
    .filter((entry): entry is StoryRow => entry.label !== undefined)
  const slices =
    stories.length > 0
      ? stories.map((story, index) => ({
          storyLabel: story.label,
          startY: story.row.y,
          endY: stories[index + 1]?.row.y ?? endY,
        }))
      : [{ storyLabel: undefined, startY: header.y, endY }]
  const candidates: SectionCandidate[] = []

  for (const slice of slices) {
    const dataRows = rowsBetween(rows, slice.startY, slice.endY)
    const dimensionRow = dataRows.find(
      (row) =>
        exactLabel(row, ['断面', 'b×D']) &&
        dataSegments(row, ['断面', 'b×D']).length > 0,
    )
    const topRow = dataRows.find((row) => exactLabel(row, ['上筋', '上端筋']))
    const bottomRow = dataRows.find((row) => exactLabel(row, ['下筋', '下端筋']))
    const stirrupRow = dataRows.find((row) =>
      exactLabel(row, ['ST', 'STP', 'あばら筋']),
    )
    const positionRow =
      lastPositionRow(rows, header.y, slice.startY) ??
      dataRows.find((row) => exactLabel(row, ['位置']))
    const positions = positionRow ? positionColumns(positionRow, marks) : []
    const indexedPositions = positions.map((position, index) => ({
      ...position,
      index,
    }))
    const dimensionLabel = dimensionRow
      ? exactLabel(dimensionRow, ['断面', 'b×D'])?.compact
      : undefined
    const dimensionValues =
      dimensionRow && dimensionLabel
        ? valuesByMark(dimensionRow, [dimensionLabel], marks)
        : new Map<string, string>()
    const topLabel = topRow
      ? exactLabel(topRow, ['上筋', '上端筋'])?.compact
      : undefined
    const bottomLabel = bottomRow
      ? exactLabel(bottomRow, ['下筋', '下端筋'])?.compact
      : undefined
    const topValues =
      topRow && topLabel
        ? positions.length > 0
          ? valuesByPosition(topRow, [topLabel], positions)
          : valuesByMark(topRow, [topLabel], marks)
        : new Map<string, string>()
    const bottomValues =
      bottomRow && bottomLabel
        ? positions.length > 0
          ? valuesByPosition(bottomRow, [bottomLabel], positions)
          : valuesByMark(bottomRow, [bottomLabel], marks)
        : new Map<string, string>()
    const stirrupLabel = stirrupRow
      ? exactLabel(stirrupRow, ['ST', 'STP', 'あばら筋'])?.compact
      : undefined
    const stirrupValues =
      stirrupRow && stirrupLabel
        ? valuesByMark(stirrupRow, [stirrupLabel], marks)
        : new Map<string, string>()

    for (const { mark } of marks) {
      const markPositions = indexedPositions.filter(
        (position) => position.mark === mark,
      )
      const topCells =
        positions.length > 0
          ? cellsForMark(topValues, indexedPositions, mark)
          : topValues.has(mark)
            ? [{ position: '全断面', raw: topValues.get(mark) as string }]
            : []
      const bottomCells =
        positions.length > 0
          ? cellsForMark(bottomValues, indexedPositions, mark)
          : bottomValues.has(mark)
            ? [{ position: '全断面', raw: bottomValues.get(mark) as string }]
            : []
      const dimension = dimensionValues.get(mark)
      const stirrup = stirrupValues.get(mark)
      if (
        !dimension &&
        topCells.length === 0 &&
        bottomCells.length === 0 &&
        !stirrup
      ) {
        continue
      }

      const result: SectionCandidate = {
        kind: kindFromMark(mark, titleText),
        mark,
        storyLabel: slice.storyLabel,
        raw: {},
        issues: [],
      }
      setDimension(result, dimension, false)
      if (topLabel && bottomLabel) {
        setGirderMain(
          result,
          topLabel,
          bottomLabel,
          topCells,
          bottomCells,
          markPositions.length,
        )
      }
      if (stirrupLabel) {
        setPitch(result, 'stirrup', stirrupLabel, stirrup)
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
): ParsedSectionList | undefined {
  // 영역을 y뿐 아니라 x대역으로도 잘라낸다 — 좌우로 나란한 리스트에서 옆 표의
  // 세그먼트가 섞이면 符号·라벨 매칭이 옆 표를 오염시킨다
  const tableRows = rows
    .filter((row) => row.y >= anchor.row.y && row.y < endY)
    .map((row) => {
      const items = row.items.filter(
        (item) => item.x + item.w >= xStart && item.x < xEnd,
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
  if (headerIndexes.length === 0) return undefined

  const candidates: SectionCandidate[] = []
  headerIndexes.forEach((headerIndex, index) => {
    const blockEnd = tableRows[headerIndexes[index + 1]]?.y ?? endY
    const parsed = anchor.listKind.includes('柱')
      ? parseColumnBlock(tableRows, headerIndex, blockEnd, anchor.titleText)
      : parseGirderBlock(tableRows, headerIndex, blockEnd, anchor.titleText)
    candidates.push(...parsed)
  })

  return { listKind: anchor.listKind, candidates }
}

export function parseSectionLists(page: TextPage): ParsedSectionList[] {
  const rows = recoverRows(page.items)
  const anchors = titleAnchors(rows)
  const parsed: ParsedSectionList[] = []

  anchors.forEach((anchor) => {
    // 같은 y대역의 오른쪽 타이틀은 아래 표가 아니라 옆 표다 — x 경계가 된다
    const sameBand = Math.max(anchor.row.height, 1) * 2
    const xStart = anchor.x - 40
    const rightNeighbor = anchors
      .filter(
        (other) =>
          other !== anchor &&
          Math.abs(other.row.y - anchor.row.y) <= sameBand &&
          other.x > anchor.x,
      )
      .sort((left, right) => left.x - right.x)[0]
    const xEnd = rightNeighbor ? rightNeighbor.x - 40 : Number.POSITIVE_INFINITY
    // 블록 끝은 이 x대역 안에서 아래에 오는 다음 타이틀
    const below = anchors
      .filter(
        (other) =>
          other.row.y - anchor.row.y > sameBand &&
          other.x >= xStart &&
          other.x < xEnd,
      )
      .sort((left, right) => left.row.y - right.row.y)[0]
    const endY = below?.row.y ?? page.heightPt
    const result = parseTableRegion(rows, anchor, endY, xStart, xEnd)
    if (result) parsed.push(result)
  })

  return parsed
}
