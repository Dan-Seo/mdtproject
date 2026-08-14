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

/** 세로쓰기(rot=-90) 문자열 하나. y는 세로 범위의 중앙이다. */
interface VerticalRun {
  text: string
  x: number
  y: number
}

const barSizes = new Set<BarSize>(BAR_SIZES)

const TITLE_PATTERN =
  /(柱断面リスト|大梁断面リスト|小梁断面リスト|地中梁リスト|柱リスト|大梁リスト|梁リスト)/
const STORY_PATTERN = /^(?:RF|R階|\d+F|\d+階)$/
const MARK_PATTERN = /^(?:(?:C|G|FC|FG|B|CB)\d+[A-Z]?|W\d+|fg)$/i

/**
 * 하이픈류를 半角 '-'로 접는다. CP932 0x815C(全角ダッシュ)의 표준 매핑이 U+2014와
 * U+2015로 갈리므로 둘 다 넣는다 — 실물 도면(yokohama p13)은 U+2015를 쓴다.
 *
 * 長音符(ー U+30FC)는 넣지 않는다. 하이픈이 아니라 가나 글자라서, 접으면
 * 「コンクリート」가 「コンクリ-ト」가 되어 확정하지 못한 셀에 붙이는 원문 참고
 * 표시가 망가진다 — kani p38에 실제로 들어 있다.
 */
function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[‐‑‒–—―−]/g, '-')
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

/**
 * 세로쓰기 문자열을 복원한다. `recoverRows`는 회전 아이템을 버린다 — 가로 행 복원에
 * 섞이면 행이 오염되기 때문이다. 그 결과 스케치 옆에 세로로 적힌 치수가 통째로 보이지
 * 않는데, 断面 라벨 행이 없는 표에서는 그것이 d의 유일한 근거다 (ojkk 柱リスト).
 *
 * rot=-90만 받는다. 읽기 순서가 y 내림차순인 것은 실물에서 확인한 값이고, 다른
 * 회전각은 순서가 뒤집힐 수 있다 — 「700」이 「007」이 되면 조용히 틀린 값이 된다.
 * 회전 텍스트에서 w는 가로 폭이 아니라 글자 진행량이므로 세로 간격으로 쓴다.
 */
function verticalRuns(items: TextItem[]): VerticalRun[] {
  const rotated = items
    .filter(
      (item) =>
        item.str.trim().length > 0 &&
        item.rot !== undefined &&
        Math.abs(item.rot + 90) < 0.01,
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
      Math.abs(previous.x - item.x) <= 1 &&
      gap >= 0 &&
      gap <= Math.max(previous.w, item.w) * 2
    if (!adjacent) flush()
    current.push(item)
  }
  flush()

  return runs
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

/**
 * 小梁·地中梁·基礎 리스트는 반영 대상이 아니다 (ADR-005). 캡처(listKind)는
 * 「基礎梁リスト」에서 「梁リスト」로 잘리므로 타이틀 원문을 본다.
 * 후보 분류와 인식 실패 안내가 같은 판정을 봐야 한다 — 한쪽만 고치면
 * 「후보는 対象外인데 실패 안내는 뜬다」로 조용히 갈라진다
 */
function isOutOfScopeList(titleText: string): boolean {
  return /小梁|地中梁|基礎/.test(titleText)
}

function kindFromMark(mark: string, titleText: string): SectionCandidate['kind'] {
  if (isOutOfScopeList(titleText)) return '対象外'
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

// 4자리 초과는 셀 병합 잔재, 한 자리는 소수 표기(「0.8×0.8」→8×0)의 잔재다 —
// 어느 쪽도 확정하지 않는다
function inDimensionRange(b: number, depth: number): boolean {
  return b >= 10 && b <= 9999 && depth >= 10 && depth <= 9999
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
  const parsed =
    parseDimension(value) ??
    (vertical !== undefined ? pairedDimension(value, vertical) : undefined)
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

/**
 * 断面 라벨 행이 없는 표의 스케치 가로 치수. 창의 하한은 인식한 데이터 라벨 행 중
 * 가장 위다 — 라벨 하나에만 매어 두면 그 라벨을 못 읽은 표에서 창이 슬라이스 전체로
 * 열려 아래 행(備考 등)의 단독 숫자가 치수로 확정된다. 라벨 행을 하나도 인식하지
 * 못했으면 그 표에서 읽은 것이 없다는 뜻이므로 폴백을 돌리지 않는다.
 */
function sketchDimensions(
  rows: TextRow[],
  startY: number,
  endY: number,
  labelRows: Array<TextRow | undefined>,
  anchors: MarkColumn[],
): Map<string, string> {
  const labelYs = labelRows.flatMap((row) => (row ? [row.y] : []))
  if (labelYs.length === 0) return new Map()
  return scalarDimensions(rows, startY, Math.min(...labelYs, endY), anchors)
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
  return marks.flatMap(({ mark, centerX }) => {
    const own = positions.filter((position) => position.mark === mark)
    return own.length > 0
      ? own.map((position) => ({ mark, centerX: position.centerX }))
      : [{ mark, centerX }]
  })
}

/**
 * 앵커별 거리 상한. 칸 경계는 두 앵커 사이에 있으므로 앵커에서 경계까지의 거리는 그
 * 이웃까지의 간격보다 짧다 — 상한을 이웃 간격으로 잡는다. 이웃별로 재는 이유는 칸 폭이
 * 열마다 달라서다: 간격의 중앙값을 쓰면 자기 칸이 남들보다 넓은 열에서 실물 값이
 * 잘리고(ojkk 柱 FC1은 이웃 간격 85.1에 실측 51.7), 좌우 중 큰 쪽을 쓰면 촘촘한 열이
 * 반대편 먼 열의 상한을 물려받아 두 열 사이 빈 대역까지 먹는다.
 *
 * 앵커가 하나뿐이면 간격이 없어 상한이 Infinity가 된다 — 세로 짝짓기는 符号 2개
 * 이상을 따로 요구하고, 가로는 라벨 행 대역으로 이미 좁혀져 있다.
 */
function boundedAnchors(
  anchors: MarkColumn[],
): Array<MarkColumn & { limit: number }> {
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

  return new Map(
    [...perMark.entries()].flatMap(([mark, values]) =>
      values.length === 1 && /^\d+$/.test(values[0])
        ? [[mark, values[0]] as const]
        : [],
    ),
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
 * 세로 치수를 층 슬라이스에 배정한다. 스케치의 세로 치수는 층 라벨 행보다 위에
 * 놓이기도 해서 슬라이스의 y대역(라벨 행 ~ 다음 라벨 행)으로 자르면 통째로 빠진다.
 * 가장 가까운 층 라벨에 붙인다 — 실물에서 층 간격의 1/10 이하로 붙어 있어 갈릴 여지가 없다.
 */
function verticalsBySlice(
  runs: VerticalRun[],
  slices: Array<{ startY: number; endY: number }>,
): VerticalRun[][] {
  const buckets: VerticalRun[][] = slices.map(() => [])
  if (slices.length === 0) return buckets

  for (const run of runs) {
    let best = 0
    slices.forEach((slice, index) => {
      if (Math.abs(slice.startY - run.y) < Math.abs(slices[best].startY - run.y))
        best = index
    })
    // 자기 층 스케치가 아닌 런은 버린다. 거리 제한 없이 최근접에 넣으면 어떤
    // 숫자든 어느 층엔가 붙어 이슈 없는 확정 d가 된다 — 미지 형식에서는 확정하지
    // 않고 원문으로 남는 쪽이 옳다 (R10)
    const span = slices[best].endY - slices[best].startY
    if (Math.abs(slices[best].startY - run.y) <= span / 2) buckets[best].push(run)
  }

  return buckets
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
  // 수집 창을 표의 실제 행 범위로 닫는다. 마지막 블록의 endY는 페이지 바닥까지
  // 열려 있어(다음 타이틀이 없으면 heightPt), 표 아래 스케치의 회전 숫자가 그대로
  // 딸려 들어온다 — 가로 치수는 라벨 행 사이로 좁게 잘리므로 같은 노출이 없다
  const tableBottom = blockRows.at(-1)?.y ?? endY
  const blockVerticals = verticalsBySlice(
    verticals.filter((run) => run.y > header.y && run.y < tableBottom),
    // 마지막 슬라이스의 endY는 표의 끝이 아니라 다음 타이틀·페이지 바닥이다.
    // 그대로 두면 그 층에서만 거리 상한이 층 간격의 몇 배로 벌어진다
    slices.map((slice) => ({
      startY: slice.startY,
      endY: Math.min(slice.endY, tableBottom),
    })),
  )

  const candidates: SectionCandidate[] = []
  for (const [sliceIndex, slice] of slices.entries()) {
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
    // 스케치 치수는 가로·세로 모두 같은 열 앵커로 배정한다 — 한쪽만 符号 중심이면
    // 그쪽에서만 좁은 이웃 칸이 값을 가져간다
    const anchors = markAnchors(marks, positions)
    const dimensionValues = storyAmbiguous
      ? new Map<string, string>()
      : dimensionRow
        ? valuesByMark(dimensionRow, ['断面'], marks)
        : sketchDimensions(
            rows,
            slice.startY,
            slice.endY,
            [mainRow, hoopRow],
            anchors,
          )
    // 断面 라벨 행이 있으면 세로 치수는 보지 않는다 — 라벨 행 값이 더 확실한 근거다
    const verticalValues =
      storyAmbiguous || dimensionRow
        ? new Map<string, string>()
        : verticalsByMark(blockVerticals[sliceIndex], anchors)
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
  verticals: VerticalRun[],
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
  // 柱 블록과 같은 이유로 수집 창과 슬라이스 상한을 표의 실제 행 범위로 닫는다
  const tableBottom = blockRows.at(-1)?.y ?? endY
  const blockVerticals = verticalsBySlice(
    verticals.filter((run) => run.y > header.y && run.y < tableBottom),
    slices.map((slice) => ({
      startY: slice.startY,
      endY: Math.min(slice.endY, tableBottom),
    })),
  )
  const candidates: SectionCandidate[] = []

  for (const [sliceIndex, slice] of slices.entries()) {
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
    // 断面 라벨 행이 없는 표(ojkk 大梁リスト)의 근거는 스케치 치수뿐이다 — 柱 블록과
    // 같은 폴백으로 가로 치수를 줍고, 세로(회전 문자열)와 짝지어야 b×D가 나온다
    const anchors = markAnchors(marks, positions)
    const dimensionValues = storyAmbiguous
      ? new Map<string, string>()
      : dimensionRow && dimensionLabel
        ? valuesByMark(dimensionRow, [dimensionLabel], marks)
        : sketchDimensions(
            rows,
            slice.startY,
            slice.endY,
            [topRow, bottomRow, stirrupRow],
            anchors,
          )
    // 断面 라벨 행이 있으면 세로 치수는 보지 않는다 — 라벨 행 값이 더 확실한 근거다
    const verticalValues =
      storyAmbiguous || dimensionRow
        ? new Map<string, string>()
        : verticalsByMark(blockVerticals[sliceIndex], anchors)
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
  verticals: VerticalRun[],
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
  // 대상이 아닌 리스트를 못 읽었다고 알리면 정상 파싱된 도면에서도 실패 안내가 뜬다
  const outOfScope = isOutOfScopeList(anchor.titleText)
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
    const parsed = anchor.listKind.includes('柱')
      ? parseColumnBlock(
          tableRows,
          headerIndex,
          blockEnd,
          anchor.titleText,
          tableVerticals,
        )
      : parseGirderBlock(
          tableRows,
          headerIndex,
          blockEnd,
          anchor.titleText,
          tableVerticals,
        )
    candidates.push(...parsed)
  })

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
