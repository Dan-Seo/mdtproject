import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ResolvedSource, RuleEntry, RulePack } from '../../src/domain/rules/types'

type Primitive = string | number | boolean

type FoldKind =
  | 'fc-band'
  | 'size-band'
  | 'member-kind'
  | 'band'
  | 'grid'
  | 'single'

interface BandSpec {
  label: string
  values: readonly string[]
}

export interface FoldedCell {
  displayConditions: Record<string, Primitive>
  representative: RuleEntry
  originalEntries: RuleEntry[]
  originalIndices: number[]
  verification: boolean
}

export interface FoldedGroup {
  key: string
  source: ResolvedSource
  tableName: string
  kind: FoldKind
  originalCount: number
  foldedCount: number
  cells: FoldedCell[]
  missingCells: string[]
}

export interface ReviewSheet {
  groups: FoldedGroup[]
  originalRowCount: number
  foldedRowCount: number
  tableCount: number
  singletonCount: number
  byKey: Record<string, { before: number; after: number }>
  missingCells: string[]
  verification: {
    reviewCellCount: number
    note: string
  }
}

interface IndexedEntry {
  entry: RuleEntry
  index: number
}

const FC_BANDS: readonly BandSpec[] = [
  { label: 'Fc18', values: ['18'] },
  { label: 'Fc21', values: ['21'] },
  { label: 'Fc24、27', values: ['24', '27'] },
  { label: 'Fc30、33、36', values: ['30', '33', '36'] },
]

const DIAMETER_BANDS: readonly BandSpec[] = [
  { label: 'D16以下', values: ['D10', 'D13', 'D16'] },
  { label: 'D19〜D38', values: ['D19', 'D22', 'D25', 'D29', 'D32'] },
]

interface BendCellSpec {
  gradeLabel: string
  grades: readonly string[]
  diameterBand: BandSpec
}

// 表5.3.1's three original cells: the first two grade rows share the same
// bend diameter band, while SD390 starts at the second diameter band.
const BEND_CELL_SPECS: readonly BendCellSpec[] = [
  {
    gradeLabel: 'SD295・SD345',
    grades: ['SD295', 'SD345'],
    diameterBand: DIAMETER_BANDS[0],
  },
  {
    gradeLabel: 'SD295・SD345',
    grades: ['SD295', 'SD345'],
    diameterBand: DIAMETER_BANDS[1],
  },
  {
    gradeLabel: 'SD390',
    grades: ['SD390'],
    diameterBand: DIAMETER_BANDS[1],
  },
]

const INTERVAL_BANDS: readonly BandSpec[] = [
  { label: 'D10·D13', values: ['D10', 'D13'] },
  { label: 'D16·D19·D22·D25·D29·D32', values: ['D16', 'D19', 'D22', 'D25', 'D29', 'D32'] },
]

const COVER_MEMBER_BANDS: readonly BandSpec[] = [
  { label: '柱・大梁・耐震壁', values: ['柱', '大梁', '耐震壁'] },
  { label: '床板・雑壁', values: ['床板', '雑壁'] },
]

const NEVER_FOLD_KEYS = new Set(['measure.splice.length.factor'])

/**
 * This mirrors the existing `source.verifications` scope in
 * `tests/golden/fixtures/spec-r7-ch5.json`. It is provenance metadata for the
 * review sheet, not a second source of rule values. The marker deliberately
 * does not remove a cell from the reply field: the second read was by the same
 * person as the transcription and is not independent review.
 */
const VERIFIED_KEYS_BY_TABLE: Readonly<Record<string, readonly string[]>> = {
  '表5.3.2': ['lap.L1', 'lap.L1h'],
  '表5.3.4': [
    'anchorage.L1',
    'anchorage.L2',
    'anchorage.L1h',
    'anchorage.L2h',
  ],
  '表5.3.5': ['anchorage.La'],
}

const VERIFICATION_NOTE =
  'source.verifications の既存再対照（by=agent）は転写者と同じ人格による2回目の読みであり、独立検討ではない。'

function sourceSignature(source: ResolvedSource): string {
  return JSON.stringify([
    source.short,
    source.doc,
    source.edition,
    source.publisher,
    source.url,
    source.section,
    source.page,
  ])
}

function conditionSignature(conditions: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(conditions).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

function conditionWithout(
  conditions: RuleEntry['conditions'],
  omitted: string,
): string {
  return conditionSignature(
    Object.fromEntries(
      Object.entries(conditions).filter(([key]) => key !== omitted),
    ),
  )
}

function conditionWithoutMany(
  conditions: RuleEntry['conditions'],
  omitted: readonly string[],
): string {
  const omittedSet = new Set(omitted)
  return conditionSignature(
    Object.fromEntries(
      Object.entries(conditions).filter(([key]) => !omittedSet.has(key)),
    ),
  )
}

function tableName(section: string | null): string {
  if (section === null) return '出典未指定'
  const match = section.match(/^表\d+\.\d+\.\d+/)
  return match?.[0] ?? section
}

function stringCondition(
  entry: RuleEntry,
  name: string,
): string | undefined {
  const value = entry.conditions[name]
  return typeof value === 'string' ? value : undefined
}

function numberCondition(
  entry: RuleEntry,
  name: string,
): number | undefined {
  const value = entry.conditions[name]
  return typeof value === 'number' ? value : undefined
}

function assertConsistent(entries: readonly IndexedEntry[], context: string): void {
  const first = entries[0]?.entry
  if (!first) throw new Error(`${context}: empty fold cell`)

  for (const current of entries.slice(1)) {
    if (
      current.entry.value !== first.value ||
      current.entry.unit !== first.unit ||
      sourceSignature(current.entry.source) !== sourceSignature(first.source)
    ) {
      throw new Error(
        `${context}: 帯の値または単位が一致しません。代表値を選ばず、原文帯を見直してください`,
      )
    }
  }
}

function findBand(value: string, bands: readonly BandSpec[]): BandSpec | undefined {
  return bands.find((band) => band.values.includes(value))
}

function makeCell(
  entries: readonly IndexedEntry[],
  displayConditions: Record<string, Primitive>,
  table: string,
): FoldedCell {
  if (entries.length === 0) {
    throw new Error(`${table}: empty fold cell`)
  }
  assertConsistent(entries, `${table} ${entries[0].entry.key}`)
  const sorted = [...entries].sort((left, right) => left.index - right.index)
  return {
    displayConditions,
    representative: sorted[0].entry,
    originalEntries: sorted.map(({ entry }) => entry),
    originalIndices: sorted.map(({ index }) => index),
    verification: isVerifiedCell(table, sorted),
  }
}

function isVerifiedCell(table: string, entries: readonly IndexedEntry[]): boolean {
  const keys = VERIFIED_KEYS_BY_TABLE[table]
  return (
    keys !== undefined &&
    entries.length > 0 &&
    entries.every(({ entry }) => keys.includes(entry.key))
  )
}

function foldFcGroup(
  entries: readonly IndexedEntry[],
  table: string,
): { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] } {
  const grades: string[] = []
  for (const indexed of entries) {
    const grade = stringCondition(indexed.entry, 'grade')
    const fc = numberCondition(indexed.entry, 'fc')
    if (grade === undefined || fc === undefined) {
      throw new Error(`${table}: Fc帯の条件が不完全です`)
    }
    if (!grades.includes(grade)) grades.push(grade)
    if (!findBand(String(fc), FC_BANDS)) {
      throw new Error(`${table}: 알려지지 않은 Fc帯 ${String(fc)}`)
    }
  }

  const cells: FoldedCell[] = []
  const missingCells: string[] = []
  for (const grade of grades) {
    for (const band of FC_BANDS) {
      const members = entries.filter(
        ({ entry }) =>
          stringCondition(entry, 'grade') === grade &&
          band.values.includes(String(numberCondition(entry, 'fc'))),
      )
      if (members.length === 0) {
        missingCells.push(`${grade} × ${band.label}`)
        continue
      }
      if (members.length !== band.values.length) {
        throw new Error(
          `${table}: ${grade} の ${band.label} 帯が不完全です。値を代表させず失敗します`,
        )
      }
      assertConsistent(members, `${table} ${grade} ${band.label}`)
      const first = members[0].entry
      for (const member of members) {
        if (
          conditionWithout(member.entry.conditions, 'fc') !==
          conditionWithout(first.conditions, 'fc')
        ) {
          throw new Error(`${table}: ${grade} ${band.label} の条件が一致しません`)
        }
      }
      cells.push(makeCell(members, { grade, fcBand: band.label }, table))
    }
  }

  return { kind: 'fc-band', cells, missingCells }
}

function foldSizeGroup(
  entries: readonly IndexedEntry[],
  table: string,
): { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] } {
  const cells: FoldedCell[] = []
  const missingCells: string[] = []
  const knownSizes = new Set(INTERVAL_BANDS.flatMap(({ values }) => values))

  for (const indexed of entries) {
    const size = stringCondition(indexed.entry, 'size')
    if (size === undefined || !knownSizes.has(size)) {
      throw new Error(`${table}: 알려지지 않은 径条件을 접을 수 없습니다`)
    }
  }

  for (const band of INTERVAL_BANDS) {
    const members = entries.filter(({ entry }) =>
      band.values.includes(stringCondition(entry, 'size') ?? ''),
    )
    if (members.length !== band.values.length) {
      throw new Error(
        `${table}: ${band.label} 帯が不完全です。値を代表させず失敗します`,
      )
    }
    assertConsistent(members, `${table} ${band.label}`)
    const first = members[0].entry
    for (const member of members) {
      if (
        conditionWithout(member.entry.conditions, 'size') !==
        conditionWithout(first.conditions, 'size')
      ) {
        throw new Error(`${table}: ${band.label} の条件が一致しません`)
      }
    }
    cells.push(makeCell(members, { sizeBand: band.label }, table))
  }

  return { kind: 'size-band', cells, missingCells }
}

function foldBendGroup(
  entries: readonly IndexedEntry[],
  table: string,
): { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] } {
  const cells: FoldedCell[] = []
  const used = new Set<number>()

  for (const spec of BEND_CELL_SPECS) {
    const members = entries.filter(({ entry }) => {
      const grade = stringCondition(entry, 'grade')
      const size = stringCondition(entry, 'size')
      return spec.grades.includes(grade ?? '') && spec.diameterBand.values.includes(size ?? '')
    })
    const expectedCount = spec.grades.length * spec.diameterBand.values.length
    if (members.length !== expectedCount) {
      throw new Error(
        `${table}: ${spec.gradeLabel} ${spec.diameterBand.label} declared band is incomplete`,
      )
    }
    const first = members[0]?.entry
    if (!first) throw new Error(`${table}: empty bend fold cell`)
    for (const member of members) {
      if (
        conditionWithoutMany(member.entry.conditions, ['grade', 'size']) !==
        conditionWithoutMany(first.conditions, ['grade', 'size'])
      ) {
        throw new Error(
          `${table}: ${spec.gradeLabel} ${spec.diameterBand.label} has inconsistent conditions`,
        )
      }
      used.add(member.index)
    }
    cells.push(
      makeCell(
        members,
        {
          gradeBand: spec.gradeLabel,
          sizeBand: spec.diameterBand.label,
        },
        table,
      ),
    )
  }

  if (used.size !== entries.length) {
    throw new Error(`${table}: bend entry is outside the declared original cells`)
  }

  const grades = [
    ...new Set(
      entries
        .map(({ entry }) => stringCondition(entry, 'grade'))
        .filter((value): value is string => value !== undefined),
    ),
  ]
  const missingCells: string[] = []
  for (const grade of grades) {
    for (const band of DIAMETER_BANDS) {
      if (
        !entries.some(
          ({ entry }) =>
            stringCondition(entry, 'grade') === grade &&
            band.values.includes(stringCondition(entry, 'size') ?? ''),
        )
      ) {
        missingCells.push(`${grade} × ${band.label}`)
      }
    }
  }

  return { kind: 'grid', cells, missingCells }
}

function foldMemberKindGroup(
  entries: readonly IndexedEntry[],
  table: string,
): { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] } {
  const cells: FoldedCell[] = []
  const missingCells: string[] = []
  const knownKinds = new Set(COVER_MEMBER_BANDS.flatMap(({ values }) => values))
  const unknown = entries.find(({ entry }) => {
    const memberKind = stringCondition(entry, 'memberKind')
    return memberKind === undefined || !knownKinds.has(memberKind)
  })
  if (unknown) throw new Error(`${table}: 알려지지 않은 memberKind를 접을 수 없습니다`)

  const remainderGroups = new Map<string, IndexedEntry[]>()
  for (const indexed of entries) {
    const remainder = conditionWithout(indexed.entry.conditions, 'memberKind')
    const group = remainderGroups.get(remainder) ?? []
    group.push(indexed)
    remainderGroups.set(remainder, group)
  }

  for (const [remainder, remainderEntries] of remainderGroups) {
    const first = remainderEntries[0].entry
    const memberKind = stringCondition(first, 'memberKind')
    const band = COVER_MEMBER_BANDS.find(({ values }) =>
      values.includes(memberKind ?? ''),
    )
    if (!band) throw new Error(`${table}: cover 조건帯를 찾지 못했습니다`)
    const byKind = new Map(
      remainderEntries.map((indexed) => [
        stringCondition(indexed.entry, 'memberKind'),
        indexed,
      ]),
    )
    const missing = band.values.filter((kind) => !byKind.has(kind))
    if (missing.length > 0) {
      throw new Error(
        `${table}: ${band.label}의 memberKind가 빠졌습니다: ${missing.join('、')}`,
      )
    }
    if (byKind.size !== band.values.length) {
      throw new Error(`${table}: cover memberKind 帯に余分な 행이 있습니다`)
    }
    const members = band.values.map((kind) => byKind.get(kind)!)
    assertConsistent(members, `${table} ${band.label}`)
    cells.push(
      makeCell(
        members,
        {
          memberKinds: band.label,
          conditions: remainder,
        },
        table,
      ),
    )
  }

  return { kind: 'member-kind', cells, missingCells }
}

function genericCells(
  entries: readonly IndexedEntry[],
  table: string,
): { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] } {
  const cells = entries.map((indexed) =>
    makeCell([indexed], { conditions: conditionSignature(indexed.entry.conditions) }, table),
  )
  const missingCells: string[] = []

  if (entries.some(({ entry }) => entry.key === 'bend.inside-diameter')) {
    const grades = [
      ...new Set(
        entries
          .map(({ entry }) => stringCondition(entry, 'grade'))
          .filter((value): value is string => value !== undefined),
      ),
    ]
    for (const grade of grades) {
      for (const band of DIAMETER_BANDS) {
        if (
          !entries.some(
            ({ entry }) =>
              stringCondition(entry, 'grade') === grade &&
              band.values.includes(stringCondition(entry, 'size') ?? ''),
          )
        ) {
          missingCells.push(`${grade} × ${band.label}`)
        }
      }
    }
  }

  return { kind: 'grid', cells, missingCells }
}

function isTableLike(group: FoldedGroup): boolean {
  return group.kind !== 'single'
}

function rawGroups(pack: RulePack): IndexedEntry[][] {
  const groups: IndexedEntry[][] = []
  const indexes = new Map<string, IndexedEntry[]>()

  pack.entries.forEach((entry, index) => {
    if (NEVER_FOLD_KEYS.has(entry.key)) {
      groups.push([{ entry, index }])
      return
    }
    const id = `${entry.key}\u0000${sourceSignature(entry.source)}`
    const group = indexes.get(id) ?? []
    group.push({ entry, index })
    indexes.set(id, group)
  })

  const ordered = [...indexes.values()]
  return [...groups, ...ordered].sort(
    (left, right) => (left[0]?.index ?? 0) - (right[0]?.index ?? 0),
  )
}

function foldGroup(entries: readonly IndexedEntry[]): FoldedGroup {
  const first = entries[0]?.entry
  if (!first) throw new Error('empty rule pack group')
  const table = tableName(first.source.section)
  const tableSource = first.source.section?.startsWith('表') ?? false
  let folded: { kind: FoldKind; cells: FoldedCell[]; missingCells: string[] }

  if (NEVER_FOLD_KEYS.has(first.key)) {
    folded = genericCells(entries, table)
    folded.kind = 'single'
  } else if (
    first.key === 'measure.splice.interval' &&
    entries.every(({ entry }) => stringCondition(entry, 'size') !== undefined)
  ) {
    folded = foldSizeGroup(entries, table)
  } else if (first.key === 'bend.inside-diameter') {
    folded = foldBendGroup(entries, table)
  } else if (
    first.key === 'cover.minimum' &&
    entries.every(({ entry }) => stringCondition(entry, 'memberKind') !== undefined)
  ) {
    folded = foldMemberKindGroup(entries, table)
  } else if (
    entries.every(
      ({ entry }) =>
        numberCondition(entry, 'fc') !== undefined &&
        stringCondition(entry, 'grade') !== undefined,
    )
  ) {
    folded = foldFcGroup(entries, table)
  } else if (
    entries.length > 1 &&
    entries.every(({ entry }) => numberCondition(entry, 'band') !== undefined)
  ) {
    folded = genericCells(entries, table)
    folded.kind = 'band'
  } else if (entries.length > 1 || tableSource) {
    folded = genericCells(entries, table)
  } else {
    folded = genericCells(entries, table)
    folded.kind = 'single'
  }

  return {
    key: first.key,
    source: first.source,
    tableName: table,
    kind: folded.kind,
    originalCount: entries.length,
    foldedCount: folded.cells.length,
    cells: folded.cells,
    missingCells: folded.missingCells.map((missing) => `${first.key}: ${missing}`),
  }
}

export function foldRulePack(pack: RulePack): ReviewSheet {
  const groups = rawGroups(pack).map(foldGroup)
  const byKey = Object.fromEntries(
    [...new Set(groups.map((group) => group.key))].map((key) => {
      const matching = groups.filter((group) => group.key === key)
      return [
        key,
        {
          before: matching.reduce((sum, group) => sum + group.originalCount, 0),
          after: matching.reduce((sum, group) => sum + group.foldedCount, 0),
        },
      ]
    }),
  )
  const verificationCellCount = groups.reduce(
    (sum, group) =>
      sum + group.cells.filter((cell) => cell.verification).length,
    0,
  )
  const missingCells = groups.flatMap((group) => group.missingCells)

  return {
    groups,
    originalRowCount: pack.entries.length,
    foldedRowCount: groups.reduce((sum, group) => sum + group.foldedCount, 0),
    tableCount: new Set(groups.filter(isTableLike).map((group) => group.tableName)).size,
    singletonCount: groups.filter((group) => group.kind === 'single').length,
    byKey,
    missingCells,
    verification: {
      reviewCellCount: verificationCellCount,
      note: VERIFICATION_NOTE,
    },
  }
}

export function expandFoldedReviewSheet(sheet: ReviewSheet): RuleEntry[] {
  return sheet.groups
    .flatMap((group) => group.cells)
    .flatMap((cell) =>
      cell.originalEntries.map((entry, offset) => ({
        entry,
        index: cell.originalIndices[offset],
      })),
    )
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => entry)
}

function formatValue(entry: RuleEntry): string {
  return `${String(entry.value)} ${entry.unit}`
}

function formatConditions(conditions: Record<string, unknown>): string {
  return conditionSignature(conditions).replaceAll('|', '\\|')
}

function confidenceLabel(cells: readonly FoldedCell[]): string {
  const confidences = new Set(cells.flatMap((cell) =>
    cell.originalEntries.map((entry) => entry.confidence),
  ))
  if (confidences.size === 1) return [...confidences][0]
  return [...confidences].sort().join('/')
}

function confidenceMark(confidence: string): string {
  if (confidence === 'inferred') return '▲'
  if (confidence === 'transcribed') return '△'
  return '○'
}

function cellValue(cell: FoldedCell): string {
  const confidence = confidenceLabel([cell])
  const marker = cell.verification
    ? ' ※既存再対照（agent・独立検討ではない）'
    : ''
  return `${confidenceMark(confidence)} ${formatValue(cell.representative)} [${confidence}]${marker}`
}

function sourceLine(group: FoldedGroup): string {
  const { source } = group
  const edition = source.edition ? `・${source.edition}` : ''
  const page = source.page === null ? '印刷쪽 미특정' : `인쇄쪽 ${source.page}쪽`
  return `출처: ${source.doc}${edition} / ${source.section ?? '조항 미특정'} / ${page}`
}

function replyLine(): string {
  return '> 회신란: 전 칸 일치 / 불일치(칸을 적음). 재대조 표식이 있어도 회신 대상에서 제외하지 않는다.'
}

function renderFcGroup(group: FoldedGroup): string[] {
  const grades = [...new Set(group.cells.map((cell) => String(cell.displayConditions.grade)))]
  const lines = [
    '| grade \\ Fc帯 | Fc18 | Fc21 | Fc24、27 | Fc30、33、36 |',
    '|---|---:|---:|---:|---:|',
  ]
  for (const grade of grades) {
    const values = FC_BANDS.map((band) =>
      group.cells.find(
        (cell) =>
          cell.displayConditions.grade === grade &&
          cell.displayConditions.fcBand === band.label,
      ),
    )
    lines.push(`| ${grade} | ${values.map((cell) => cell ? cellValue(cell) : '— 결번').join(' | ')} |`)
  }
  return lines
}

function renderSizeGroup(group: FoldedGroup): string[] {
  return [
    '| 径帯 | 값 |',
    '|---|---:|',
    ...INTERVAL_BANDS.map((band) => {
      const cell = group.cells.find(
        (candidate) => candidate.displayConditions.sizeBand === band.label,
      )
      return `| ${band.label} | ${cell ? cellValue(cell) : '— 결번'} |`
    }),
  ]
}

function renderBendGroup(group: FoldedGroup): string[] {
  const gradeBands = [...new Set(BEND_CELL_SPECS.map((spec) => spec.gradeLabel))]
  return [
    '| 鉄筋種類帯 \\ 径帯 | D16以下 | D19〜D38 |',
    '|---|---:|---:|',
    ...gradeBands.map((gradeBand) => {
      const values = DIAMETER_BANDS.map((diameterBand) => {
        const cell = group.cells.find(
          (candidate) =>
            candidate.displayConditions.gradeBand === gradeBand &&
            candidate.displayConditions.sizeBand === diameterBand.label,
        )
        if (cell) return cellValue(cell)
        const missing = group.missingCells.some((value) =>
          value.endsWith(`× ${diameterBand.label}`) &&
          value.startsWith(`${gradeBand.split('・')[0]} `),
        )
        return missing ? '— (結番)' : '—'
      })
      return `| ${gradeBand} | ${values.join(' | ')} |`
    }),
  ]
}

function renderMemberGroup(group: FoldedGroup): string[] {
  return [
    '| 원문 부재帯 | 나머지 조건 | 값 |',
    '|---|---|---:|',
    ...group.cells.map(
      (cell) =>
        `| ${String(cell.displayConditions.memberKinds)} | ${String(cell.displayConditions.conditions)} | ${cellValue(cell)} |`,
    ),
  ]
}

function renderGenericGroup(group: FoldedGroup): string[] {
  return [
    '| 조건 | 값 |',
    '|---|---:|',
    ...group.cells.map(
      (cell) =>
        `| ${formatConditions(cell.representative.conditions)} | ${cellValue(cell)} |`,
    ),
  ]
}

function renderGroup(group: FoldedGroup): string[] {
  const lines = [
    `### ${group.tableName} — \`${group.key}\``,
    '',
    sourceLine(group),
    `룰팩 전개 행: ${group.originalCount} / 대조 시트 셀: ${group.foldedCount}`,
    '',
  ]
  if (group.kind === 'fc-band') lines.push(...renderFcGroup(group))
  else if (group.kind === 'size-band') lines.push(...renderSizeGroup(group))
  else if (group.key === 'bend.inside-diameter') lines.push(...renderBendGroup(group))
  else if (group.kind === 'member-kind') lines.push(...renderMemberGroup(group))
  else lines.push(...renderGenericGroup(group))
  lines.push('', replyLine())
  if (group.missingCells.length > 0) {
    lines.push(`결번: ${group.missingCells.join(' / ')}`)
  }
  lines.push('')
  return lines
}

export function renderReviewSheet(pack: RulePack): string {
  const sheet = foldRulePack(pack)
  const lines = [
    '# 룰팩 원문 표 단위 대조 시트',
    '',
    '이 문서는 `jpMlitRulePack`을 원문 표의 帯 단위로 되접어 사람이 대조할 비용을 줄이는 작업물이다. 어떤 `confidence`도 승격하지 않는다.',
    '',
    '## 집계',
    '',
    `- 룰팩 전체 행: ${sheet.originalRowCount}`,
    `- 되접은 검토 셀: ${sheet.foldedRowCount}`,
    `- 표·조항 단위: ${sheet.tableCount}`,
    `- 단발항: ${sheet.singletonCount}`,
    `- 기존 재대조 표식: ${sheet.verification.reviewCellCount}칸`,
    `- ${sheet.verification.note}`,
    '',
    '## 검토 순서',
    '',
    '1. `表5.3.2`와 `表5.3.4`의 L1·L1h가 한 칸도 빠짐없이 같은지 확인한다. 원문이 정말 같은지, 전사 때 복사됐는지에 따라 다수 행이 한꺼번에 좌우된다.',
    '2. `表5.3.6`에서 柱＝大梁 조건이 모두 동일한지 확인한다.',
    '3. 결번을 원문과 대조한다. 현재 확인된 결번은 룰팩에 없는 원문帯이며, 자동으로 채우지 않는다.',
    '',
    '## 표·조항 단위',
    '',
  ]

  for (const group of sheet.groups.filter(isTableLike)) {
    lines.push(...renderGroup(group))
  }

  lines.push('## 단발항', '', '표·조항帯로 되접지 않는 항은 한 줄씩 검토한다.', '')
  for (const group of sheet.groups.filter((candidate) => candidate.kind === 'single')) {
    const cell = group.cells[0]
    if (!cell) continue
    lines.push(
      `- \`${group.key}\` — ${formatValue(cell.representative)} / 조건 ${formatConditions(cell.representative.conditions)} / ${sourceLine(group)}${cell.verification ? ' / ※既存再対照（agent・独立検討ではない）' : ''}`,
    )
  }
  lines.push('', replyLine(), '')

  if (sheet.missingCells.length > 0) {
    lines.push('## 결번 대장', '', ...sheet.missingCells.map((missing) => `- ${missing}`), '')
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`
}

async function runCli(): Promise<void> {
  // The generator itself only accepts RulePack. This Vite SSR loader is solely
  // the package-script adapter that resolves the existing YAML raw-import
  // convention used by Vitest; it does not participate in folding or read PDF.
  const { createServer } = await import('vite')
  const yamlRawPlugin = {
    name: 'rulepack-yaml-raw',
    load(id: string): string | null {
      const path = id.split('?', 1)[0]
      if (!path.endsWith('.yaml')) return null
      return `export default ${JSON.stringify(readFileSync(path, 'utf8'))}`
    },
  }
  const server = await createServer({
    root: process.cwd(),
    plugins: [yamlRawPlugin],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const rulepackModule = await server.ssrLoadModule('/src/rulepack/index.ts') as {
      jpMlitRulePack: RulePack
    }
    process.stdout.write(renderReviewSheet(rulepackModule.jpMlitRulePack))
  } finally {
    await server.close()
  }
}

const invokedAsCli =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsCli) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
