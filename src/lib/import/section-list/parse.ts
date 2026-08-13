import { BAR_SIZES, type BarSize } from '@/domain/model/member'

import type {
  CandidateIssue,
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

/** 후프 형상 기호(□·▤·▦)와 이음 하이픈 등 셀 머리의 장식만 벗긴다. */
function stripDecoration(value: string): string {
  return compact(value).replace(/^[-□▤▦]+/, '')
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
): { size: BarSize; pitchMm: number } | undefined {
  // 셀 전체가 단일 「径@ピッチ」일 때만 채택한다 — 부분 매치를 허용하면
  // 組数 접두사(「2-D13@100」)가 조용히 떨어져 1組로 절반 계상된다
  const match = stripDecoration(value).match(/^(D\d+)-?@(\d+)$/i)
  if (!match) return undefined
  const size = match[1].toUpperCase() as BarSize
  if (!barSizes.has(size)) return undefined
  const pitchMm = Number(match[2])
  // 4자리 피치는 인접 세그먼트가 붙은 잔재다(「D13@100」+「2」) — 확정하지 않는다
  return pitchMm > 999 || pitchMm <= 0 ? undefined : { size, pitchMm }
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
  // 4자리 초과는 셀 병합 잔재, 한 자리는 소수 표기(「0.8×0.8」→8×0)의 잔재다 —
  // 어느 쪽도 확정하지 않는다
  return b > 9999 || depth > 9999 || b < 10 || depth < 10
    ? undefined
    : { b, depth }
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

function addIssue(candidate: SectionCandidate, issue: CandidateIssue): void {
  if (!candidate.issues.includes(issue)) candidate.issues.push(issue)
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
    !allParsed ? '主筋解釈不能' : !complete ? '主筋位置欠落' : '主筋位置相違',
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
  // 位置는 균일한데 上下 径만 다른(실무에서 흔한) 셀을 「位置相違」로 몰면
  // 사용자가 원인을 오인한다 — 전용 사유 코드로 구분한다
  let sizeMismatch = false
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
  }

  for (const cell of topCells) {
    candidate.raw[`${topLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  for (const cell of bottomCells) {
    candidate.raw[`${bottomLabel}(${cell.position})`] = cleanedRebarRaw(cell.raw)
  }
  addIssue(
    candidate,
    sizeMismatch
      ? '主筋上下径相違'
      : allParsed && complete
        ? '主筋位置相違'
        : !allParsed
          ? '主筋解釈不能'
          : '主筋位置欠落',
  )
}

function setPitch(
  candidate: SectionCandidate,
  key: 'hoop' | 'stirrup',
  label: string,
  raw: string | undefined,
  folded: string | undefined,
): void {
  // 접힌 셀은 첫 줄만으로 확정하지 않는다 — 帯筋 ピッチ가 줄마다 다르면 本数가 틀린다
  if (folded !== undefined) {
    if (raw) candidate.raw[label] = cleanedRebarRaw(raw)
    candidate.raw[`${label}(折返し)`] = cleanedRebarRaw(folded)
    addIssue(candidate, '帯筋折返し')
    return
  }
  if (!raw) return
  const parsed = parsePitch(raw)
  if (parsed) {
    candidate[key] = parsed
    return
  }

  candidate.raw[label] = cleanedRebarRaw(raw)
  addIssue(candidate, '帯筋解釈不能')
}

function rowsBetween(rows: TextRow[], startY: number, endY: number): TextRow[] {
  return rows.filter((row) => row.y > startY && row.y < endY)
}

// 柱·大梁 블록의 알려진 라벨 행 전부 — 접힘 감지의 「다음 라벨 행」 판정에 쓴다.
// 腹筋은 파싱 대상이 아니지만 라벨 행이 맞으므로 접힘으로 오인하지 않게 넣는다
const ROW_LABELS = [
  '主筋',
  '帯筋',
  'HOOP',
  '断面',
  '位置',
  '上筋',
  '上端筋',
  '下筋',
  '下端筋',
  'ST',
  'STP',
  'あばら筋',
  'b×D',
  '腹筋',
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
    const mainRows = dataRows.filter((row) => exactLabel(row, ['主筋']))
    const hoopRows = dataRows.filter((row) => exactLabel(row, ['帯筋', 'HOOP']))
    // 라벨 존재만 보면 값 세그먼트가 없는 라벨 행이 scalarDimensions 폴백까지
    // 막아 원문 참고 표시가 통째로 사라진다 — 大梁 블록과 같은 조건을 쓴다
    const dimensionRows = dataRows.filter(
      (row) => exactLabel(row, ['断面']) && dataSegments(row, ['断面']).length > 0,
    )
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
    const dimensionValues = storyAmbiguous
      ? new Map<string, string>()
      : dimensionRow
        ? valuesByMark(dimensionRow, ['断面'], marks)
        : scalarDimensions(
            rows,
            slice.startY,
            mainRow?.y ?? slice.endY,
            marks,
          )
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
      ? exactLabel(hoopRow, ['帯筋', 'HOOP'])?.compact
      : undefined
    const hoopValues =
      hoopRow && hoopLabel ? valuesByMark(hoopRow, [hoopLabel], marks) : new Map()

    marks.forEach(({ mark }) => {
      if (storyAmbiguous) {
        // 값 없이 사유만 실은 후보를 남긴다 — 표가 조용히 사라지면 사용자는
        // 인식 실패와 구분할 수 없다. 階를 못 읽은 것과 階는 읽었으나 행이 겹인 것은
        // 사용자가 원도에서 확인할 곳이 다르므로 사유를 나눈다
        candidates.push({
          kind: kindFromMark(mark, titleText),
          mark,
          storyLabel: slice.storyLabel,
          raw: {},
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
        raw: {},
        issues: [],
      }
      setDimension(result, dimension, true)
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
    const dimensionRows = dataRows.filter(
      (row) =>
        exactLabel(row, ['断面', 'b×D']) &&
        dataSegments(row, ['断面', 'b×D']).length > 0,
    )
    const topRows = dataRows.filter((row) => exactLabel(row, ['上筋', '上端筋']))
    const bottomRows = dataRows.filter((row) =>
      exactLabel(row, ['下筋', '下端筋']),
    )
    const stirrupRows = dataRows.filter((row) =>
      exactLabel(row, ['ST', 'STP', 'あばら筋']),
    )
    // 柱 블록과 같은 방어 — 라벨 행이 겹이면 여러 층 블록이 합쳐진 것이다
    const storyAmbiguous =
      topRows.length > 1 ||
      bottomRows.length > 1 ||
      stirrupRows.length > 1 ||
      dimensionRows.length > 1
    const dimensionRow = storyAmbiguous ? undefined : dimensionRows[0]
    const topRow = storyAmbiguous ? undefined : topRows[0]
    const bottomRow = storyAmbiguous ? undefined : bottomRows[0]
    const stirrupRow = storyAmbiguous ? undefined : stirrupRows[0]
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
      ? exactLabel(stirrupRow, ['ST', 'STP', 'あばら筋'])?.compact
      : undefined
    const stirrupValues =
      stirrupRow && stirrupLabel
        ? valuesByMark(stirrupRow, [stirrupLabel], marks)
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

    for (const { mark } of marks) {
      if (storyAmbiguous) {
        candidates.push({
          kind: kindFromMark(mark, titleText),
          mark,
          storyLabel: slice.storyLabel,
          raw: {},
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
      // 柱 블록과 같은 이유 — 접힘도 「읽은 것이 있다」에 넣는다
      if (
        !dimension &&
        topCells.length === 0 &&
        bottomCells.length === 0 &&
        !stirrup &&
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
        raw: {},
        issues: [],
      }
      setDimension(result, dimension, false)
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
      if (stirrupLabel) {
        setPitch(
          result,
          'stirrup',
          stirrupLabel,
          stirrup,
          stirrupContinuations.get(mark),
        )
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
  // 타이틀은 인식했는데 符号 행을 못 읽은 표를 통째로 버리면, 화면에는
  // 「断面リスト가 없다」로 보여 사용자가 인식 실패와 구분할 수 없다.
  // 사유를 코드로 실어 보내고 문구는 표시부가 고른다 (CandidateIssue와 같은 규약)
  if (headerIndexes.length === 0) {
    return { listKind: anchor.listKind, candidates: [], issue: '符号行未認識' }
  }

  const candidates: SectionCandidate[] = []
  headerIndexes.forEach((headerIndex, index) => {
    const blockEnd = tableRows[headerIndexes[index + 1]]?.y ?? endY
    const parsed = anchor.listKind.includes('柱')
      ? parseColumnBlock(tableRows, headerIndex, blockEnd, anchor.titleText)
      : parseGirderBlock(tableRows, headerIndex, blockEnd, anchor.titleText)
    candidates.push(...parsed)
  })

  // 符号은 읽었으나 항목 행(断面·主筋·帯筋)을 하나도 못 읽은 표 — 「符号을 못
  // 읽었다」로 안내하면 사용자가 원도의 엉뚱한 곳을 본다
  return {
    listKind: anchor.listKind,
    candidates,
    ...(candidates.length === 0 ? { issue: '項目行未認識' as const } : {}),
  }
}

export function parseSectionLists(page: TextPage): ParsedSectionList[] {
  const rows = recoverRows(page.items)
  const anchors = titleAnchors(rows)
  const parsed: ParsedSectionList[] = []

  anchors.forEach((anchor) => {
    // 같은 y대역의 오른쪽 타이틀은 아래 표가 아니라 옆 표다 — x 경계가 된다
    const sameBand = Math.max(anchor.row.height, 1) * 2
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
    // 우측 경계도 중점 — 「이웃 x−40」 고정이면 중앙 정렬 타이틀을 가진 오른쪽 표의
    // 라벨열이 왼쪽 대역에 새어 들어와 셀 값에 이어붙는다
    const xEnd = rightNeighbor
      ? (anchor.x + rightNeighbor.x) / 2
      : Number.POSITIVE_INFINITY
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
