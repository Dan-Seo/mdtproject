import type { BarSize } from '@/domain/model/member'

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
  row: TextRow
  x: number
}

interface ParsedBar {
  size: BarSize
  count: number
}

const BAR_SIZES = new Set<BarSize>([
  'D10',
  'D13',
  'D16',
  'D19',
  'D22',
  'D25',
  'D29',
  'D32',
])

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

  for (const row of rows) {
    for (const segment of row.segments) {
      const match = segment.compact.match(TITLE_PATTERN)
      if (!match) continue
      anchors.push({ listKind: match[1], row, x: segment.x })
      break
    }
  }

  return anchors
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

function kindFromMark(mark: string): SectionCandidate['kind'] {
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

function parseBar(value: string): ParsedBar | undefined {
  const match = compact(value).match(/(\d+)-?(D\d+)/i)
  if (!match) return undefined
  const size = match[2].toUpperCase() as BarSize
  if (!BAR_SIZES.has(size)) return undefined
  return { count: Number(match[1]), size }
}

function parsePitch(
  value: string,
): { size: BarSize; pitchMm: number } | undefined {
  const match = compact(value).match(/(D\d+)-?@(\d+)/i)
  if (!match) return undefined
  const size = match[1].toUpperCase() as BarSize
  if (!BAR_SIZES.has(size)) return undefined
  return { size, pitchMm: Number(match[2]) }
}

function parseDimension(value: string): { b: number; depth: number } | undefined {
  const match = normalized(value).match(/(\d[\d\s,]*)\s*[x×]\s*(\d[\d\s,]*)/i)
  if (!match) return undefined
  return {
    b: Number(match[1].replace(/[\s,]/g, '')),
    depth: Number(match[2].replace(/[\s,]/g, '')),
  }
}

function cleanedRebarRaw(value: string): string {
  const valueCompact = compact(value)
  return (
    valueCompact.match(/(?:\d+-[A-Z]\d+|[A-Z]\d+-?@\d+)/i)?.[0] ??
    valueCompact.replace(/^[-□▤▦]+/, '')
  )
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

  if (column && /^\d+$/.test(compact(value))) {
    const side = Number(compact(value))
    candidate.b = side
    candidate.d = side
    return
  }

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
  const numericSegments = rows
    .filter((row) => row.y > startY && row.y < endY)
    .flatMap((row) => row.segments)
    .filter((segment) => /^\d[\d\s,]*$/.test(normalized(segment.text)))
  const assigned = valuesAtTargets(
    numericSegments,
    marks.map(({ mark, centerX }) => ({ id: mark, centerX })),
  )

  return new Map(
    [...assigned.entries()].filter(([, value]) => /^\d+$/.test(compact(value))),
  )
}

function parseColumnBlock(
  rows: TextRow[],
  headerIndex: number,
  endY: number,
): SectionCandidate[] {
  const header = rows[headerIndex]
  const marks = markColumns(header)
  if (marks.length === 0) return []
  const blockRows = rowsBetween(rows, header.y, endY)
  const stories: StoryRow[] = blockRows
    .map((row) => ({ label: storyFromRow(row), row }))
    .filter((entry): entry is StoryRow => entry.label !== undefined)
  if (stories.length === 0) return []

  const candidates: SectionCandidate[] = []
  stories.forEach((story, storyIndex) => {
    const storyEnd = stories[storyIndex + 1]?.row.y ?? endY
    const dataRows = rowsBetween(rows, story.row.y, storyEnd)
    const mainRow = dataRows.find((row) => exactLabel(row, ['主筋']))
    const hoopRow = dataRows.find((row) => exactLabel(row, ['帯筋', 'HOOP']))
    const dimensionRow = dataRows.find((row) => exactLabel(row, ['断面']))
    const positions = positionColumns(
      lastPositionRow(rows, header.y, story.row.y) ?? header,
      marks,
    )
    const dimensionValues = dimensionRow
      ? valuesByMark(dimensionRow, ['断面'], marks)
      : scalarDimensions(
          rows,
          story.row.y,
          mainRow?.y ?? storyEnd,
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
        kind: kindFromMark(mark),
        mark,
        storyLabel: story.label,
        raw: {},
        issues: [],
      }
      setDimension(result, dimension, true)
      setColumnMain(result, mainCells, markPositions.length)
      if (hoopLabel) setPitch(result, 'hoop', hoopLabel, hoop)
      candidates.push(result)
    })
  })

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
        kind: kindFromMark(mark),
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
): ParsedSectionList | undefined {
  const tableRows = rows.filter(
    (row) =>
      row.y >= anchor.row.y &&
      row.y < endY &&
      row.items.some((item) => item.x + item.w >= anchor.x - 40),
  )
  const headerIndexes = tableRows
    .map((row, index) => ({ index, marks: markColumns(row) }))
    .filter(({ marks }) => marks.length > 0)
    .map(({ index }) => index)
  if (headerIndexes.length === 0) return undefined

  const candidates: SectionCandidate[] = []
  headerIndexes.forEach((headerIndex, index) => {
    const blockEnd = tableRows[headerIndexes[index + 1]]?.y ?? endY
    const parsed = anchor.listKind.includes('柱')
      ? parseColumnBlock(tableRows, headerIndex, blockEnd)
      : parseGirderBlock(tableRows, headerIndex, blockEnd)
    candidates.push(...parsed)
  })

  return { listKind: anchor.listKind, candidates }
}

export function parseSectionLists(page: TextPage): ParsedSectionList[] {
  const rows = recoverRows(page.items)
  const anchors = titleAnchors(rows)
  const parsed: ParsedSectionList[] = []

  anchors.forEach((anchor, index) => {
    const nextY = anchors[index + 1]?.row.y ?? page.heightPt
    const result = parseTableRegion(rows, anchor, nextY)
    if (result) parsed.push(result)
  })

  return parsed
}
