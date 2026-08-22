import type { Project } from '@/domain/model/project'
import {
  grandTotal,
  hasUnverified,
  inferredRules,
  isMassLine,
  sizeSubtotals,
  spliceTotals,
  storySubtotals,
  type QuantityLine,
} from '@/domain/quantity'
import type { RebarShape } from '@/domain/model/rebar'
import type { ResolvedSource, RuleHit } from '@/domain/rules/types'
import { t } from '@/lib/i18n'
import type { Locale } from '@/lib/store'

export type WorkbookCellValue = string | number | null

export interface WorkbookCellSpec {
  value: WorkbookCellValue
  numberFormat?: string
  hyperlink?: string
}

export type WorkbookRowKind =
  | 'watermark'
  | 'header'
  | 'data'
  | 'subtotal'
  | 'total'
  | 'spacer'
  | 'source-heading'
  | 'source'
  | 'notice'

export interface WorkbookRowSpec {
  kind: WorkbookRowKind
  id?: string
  cells: WorkbookCellSpec[]
}

export interface WorkbookColumnSpec {
  width: number
  /**
   * 紙に載せるか。17列を A4 横に詰めると全部が読めなくなるので、出典と
   * 算出式は落とす — 出典の義務 (PDL1.0) は行ではなく算出根拠ブロックが
   * 果たすし、算出式は画面のディスクロージャで開ける。
   */
  printed: boolean
}

export interface WorkbookSheetSpec {
  name: string
  columns: WorkbookColumnSpec[]
  rows: WorkbookRowSpec[]
  headerRowNumber: number
  /** 所要数量の列 (1 起点) — 発注に使う数字がどれかを網掛けで示す。 */
  requiredColumn: number
  /** 折り返して高さを決める列 (1 起点)。無い列は行高を伸ばさない。 */
  wrapColumns: number[]
}

export interface WorkbookSpec {
  filename: 'kijun-takeoff.xlsx'
  title: string
  sheets: WorkbookSheetSpec[]
}

export interface TakeoffWorkbookInput {
  project: Project
  lines: QuantityLine[]
  locale: Locale
}

const COLUMN_COUNT = 17
const THREE_DECIMALS = '0.000'
// 継手の 0.5か所（（３）梁2)）が 1 に丸まると条文と違う数が内訳書に出る。
// '0.#' は書式に小数点そのものを含むので、整数の 108 が `108.` と描かれる。
const SPLICE_COUNT_FORMAT = 'General'

const COLUMN_WIDTHS = [
  10, 12, 10, 12, 9, 13, 12, 10, 10, 15, 10, 16, 16, 8, 36, 18, 64,
]
const SIZE_SUMMARY_COLUMN_WIDTHS = [10, 16, 16, 8]
const SIZE_SUMMARY_COLUMN_COUNT = SIZE_SUMMARY_COLUMN_WIDTHS.length
/** 所要数量の列番号 (1 起点)。シートごとに位置が違うので網掛けの基準に渡す。 */
const SIZE_SUMMARY_REQUIRED_COLUMN = 3
/** 列番号 (1 起点)。所要数量の網掛けと、出典・算出式の折り返しに使う。 */
const REQUIRED_COLUMN = 13
const SOURCE_COLUMN = 15
const FORMULA_COLUMN = 17

const exportCopy: Record<
  Locale,
  {
    sheetName: string
    sizeSheetName: string
    sourceHeading: string
    scopeNotice: string
    modificationNotice: string
    unavailableEdition: string
    unavailableUrl: string
    unknownSection: string
    inferredList: string
    transcribedOnly: string
  }
> = {
  ja: {
    sheetName: '数量内訳書',
    sizeSheetName: '径別集計',
    sourceHeading: '算出根拠',
    scopeNotice:
      '適用範囲: 国土交通省の官庁施設向け基準であり、民間工事では異なる場合があります。',
    modificationNotice:
      '改変表示: 本算出物はKijunが公開資料を加工・改変して作成した値です。',
    unavailableEdition: '版未確認',
    unavailableUrl: '原文URL未確保',
    unknownSection: '条項未確認',
    inferredList: '原文に値なし（推論）',
    transcribedOnly: '全て原文明示だが独立検討待ち（R6）',
  },
  ko: {
    sheetName: '수량 내역서',
    sizeSheetName: '경별 집계',
    sourceHeading: '산출 근거',
    scopeNotice:
      '적용 범위: 국토교통성의 관청시설 기준이며, 민간공사에서는 다를 수 있습니다.',
    modificationNotice:
      '개변 표시: 이 산출물은 Kijun이 공개 자료를 가공·개변하여 만든 값입니다.',
    unavailableEdition: '판 미확인',
    unavailableUrl: '원문 URL 미확보',
    unknownSection: '조항 미확인',
    inferredList: '원문에 값 없음(추론)',
    transcribedOnly: '전부 원문 명시이나 독립 검토 대기(R6)',
  },
}

function cell(
  value: WorkbookCellValue,
  options: Omit<WorkbookCellSpec, 'value'> = {},
): WorkbookCellSpec {
  return { value, ...options }
}

function rowWithin(
  columnCount: number,
  kind: WorkbookRowKind,
  cells: WorkbookCellSpec[],
  id?: string,
): WorkbookRowSpec {
  if (cells.length > columnCount) {
    throw new Error(`Workbook row exceeds ${columnCount} columns`)
  }

  return {
    kind,
    id,
    cells: [
      ...cells,
      ...Array.from({ length: columnCount - cells.length }, () => cell(null)),
    ],
  }
}

function row(
  kind: WorkbookRowKind,
  cells: WorkbookCellSpec[],
  id?: string,
): WorkbookRowSpec {
  return rowWithin(COLUMN_COUNT, kind, cells, id)
}

/** 径別集計は4列しかない — 内訳書の幅で埋めると空欄13列が結合幅に混ざる。 */
function sizeRow(
  kind: WorkbookRowKind,
  cells: WorkbookCellSpec[],
  id?: string,
): WorkbookRowSpec {
  return rowWithin(SIZE_SUMMARY_COLUMN_COUNT, kind, cells, id)
}

function shapeLabel(locale: Locale, shape: RebarShape): string {
  return t(locale, `shape.${shape}`)
}

function sourceLocation(
  rule: RuleHit,
  locale: Locale,
  includeLabel: boolean,
): string {
  const copy = exportCopy[locale]
  const location = [
    rule.source.doc,
    rule.source.edition ?? copy.unavailableEdition,
    rule.source.section ?? copy.unknownSection,
    rule.source.page === null ? null : `${rule.source.page}頁`,
  ]
    .filter(Boolean)
    .join(' / ')

  return includeLabel ? `${rule.label}（${location}）` : location
}

function lineSources(line: QuantityLine, locale: Locale): string {
  return line.rules
    .map((rule) => sourceLocation(rule, locale, false))
    .join('\n')
}

function sourceIdentity(source: ResolvedSource): string {
  return [source.doc, source.edition, source.publisher, source.url].join('\0')
}

function contributingSources(lines: QuantityLine[]): ResolvedSource[] {
  const sources = new Map<string, ResolvedSource>()

  for (const rule of lines.flatMap(({ rules }) => rules)) {
    const identity = sourceIdentity(rule.source)
    if (!sources.has(identity)) sources.set(identity, rule.source)
  }

  return [...sources.values()]
}

function sourceNotice(source: ResolvedSource, locale: Locale): string {
  const copy = exportCopy[locale]
  return [
    source.doc,
    source.edition ?? copy.unavailableEdition,
    source.publisher,
    source.url ?? copy.unavailableUrl,
  ].join(' / ')
}

function workbookHeaders(locale: Locale): string[] {
  return [
    t(locale, 'export.story'),
    t(locale, 'export.member'),
    t(locale, 'export.mark'),
    t(locale, 'takeoff.rebar'),
    t(locale, 'takeoff.diameter'),
    t(locale, 'takeoff.shape'),
    t(locale, 'takeoff.length'),
    t(locale, 'takeoff.count'),
    t(locale, 'takeoff.places'),
    t(locale, 'takeoff.totalLength'),
    t(locale, 'takeoff.unitMass'),
    t(locale, 'takeoff.designQuantity'),
    t(locale, 'takeoff.requiredQuantity'),
    t(locale, 'takeoff.unit'),
    t(locale, 'takeoff.source'),
    t(locale, 'takeoff.note'),
    t(locale, 'export.formula'),
  ]
}

/** 内訳の役割セルに付ける等級マーク — 画面の ▲/△ と同じ意味にそろえる。 */
function confidenceMark(confidence: QuantityLine['confidence']): string {
  if (confidence === 'inferred') return '▲ '
  if (confidence === 'transcribed') return '△ '
  return ''
}

function dataRow(
  line: QuantityLine,
  locale: Locale,
  note: string,
): WorkbookRowSpec {
  // 継手行は箇所で数えるので、長さ・質量の列は空欄にする。0 を書くと
  // 集計されて質量が過小に見える。
  const measured = isMassLine(line)
    ? [
        cell(shapeLabel(locale, line.shape)),
        cell(line.lengthMm / 1000, { numberFormat: THREE_DECIMALS }),
        cell(line.countPerMember, { numberFormat: '0' }),
        cell(line.places, { numberFormat: '0' }),
        cell(line.totalLengthMm / 1000, { numberFormat: THREE_DECIMALS }),
        cell(line.unitMassKgPerM, { numberFormat: THREE_DECIMALS }),
        cell(line.designKg, { numberFormat: THREE_DECIMALS }),
        cell(line.requiredKg, { numberFormat: THREE_DECIMALS }),
      ]
    : [
        cell(null),
        cell(null),
        cell(line.countPerMember, { numberFormat: SPLICE_COUNT_FORMAT }),
        cell(line.places, { numberFormat: '0' }),
        cell(null),
        cell(null),
        cell(line.totalCount, { numberFormat: SPLICE_COUNT_FORMAT }),
        cell(null),
      ]

  return row(
    'data',
    [
      cell(line.storyName),
      cell(line.memberKind),
      cell(line.mark),
      cell(
        `${confidenceMark(line.confidence)}${line.role}${
          isMassLine(line) ? '' : `　${t(locale, 'takeoff.splice')}（${line.method}）`
        }`,
      ),
      cell(line.size),
      ...measured,
      cell(line.unit),
      cell(lineSources(line, locale)),
      cell(note),
      cell(line.formula),
    ],
    line.id,
  )
}

/**
 * 「原文に値がない規準値を使った」警告と PDL1.0 の出典・改変表示。シートは
 * 単独でコピーされて発注に回るので、質量が載るシートには両方付ける。
 */
function watermarkRows(
  lines: QuantityLine[],
  locale: Locale,
): WorkbookRowSpec[] {
  if (!hasUnverified(lines)) return []

  // 警告は2行のままにする（DESIGN §4.2 — ヘッダ行の位置が動くと読み手側の
  // 参照が全部ずれる）。1行目でどちらの等級が混ざっているかを言い、2行目には
  // **原文に値がない項目だけ**を挙げる — 独立検討待ちは今ほぼ全行に付くので
  // 並べても読み手の作業リストにならない。
  const copy = exportCopy[locale]
  const inferred = inferredRules(lines)

  return [
    row('watermark', [
      cell('※ 独立検討が済んでいない規準値を含む — 検収前の参考値'),
    ]),
    row('watermark', [
      cell(
        inferred.length === 0
          ? copy.transcribedOnly
          : `${copy.inferredList}: ${inferred
              .map((rule) => sourceLocation(rule, locale, true))
              .join(' / ')}`,
      ),
    ]),
  ]
}

function footerRows(
  lines: QuantityLine[],
  locale: Locale,
): WorkbookRowSpec[] {
  const copy = exportCopy[locale]

  return [
    row('spacer', []),
    row('source-heading', [cell(copy.sourceHeading)]),
    ...contributingSources(lines).map((source) =>
      row('source', [
        cell(sourceNotice(source, locale), {
          hyperlink: source.url ?? undefined,
        }),
      ]),
    ),
    row('notice', [cell(copy.scopeNotice)]),
    row('notice', [cell(copy.modificationNotice)]),
  ]
}

/**
 * 階ごとの行と、その階を締める小計。画面の内訳書と同じ区切りで読めるように
 * する（docs/UX.md §4）。小計は **その上に並んだ行の和** として読まれるので、
 * 階をまたいだ位置には置けない — 行を階ごとにまとめ直してから並べる。
 */
function storyBlocks(
  input: TakeoffWorkbookInput,
): WorkbookRowSpec[] {
  const { project, lines, locale } = input
  const byStory = new Map<string, QuantityLine[]>()

  for (const line of lines) {
    const stored = byStory.get(line.storyName)
    if (stored) stored.push(line)
    else byStory.set(line.storyName, [line])
  }

  const subtotals = new Map(
    storySubtotals(lines).map((subtotal) => [subtotal.storyName, subtotal]),
  )

  return [...byStory].flatMap(([storyName, storyLines]) => {
    const subtotal = subtotals.get(storyName)
    if (!subtotal) throw new Error(`Story subtotal not found: ${storyName}`)

    return [
      ...storyLines.map((line) =>
        dataRow(line, locale, project.notes?.[line.id] ?? ''),
      ),
      row('subtotal', [
        cell(`${storyName}　${t(locale, 'export.subtotal')}`),
        ...Array.from({ length: 10 }, () => cell(null)),
        cell(subtotal.designKg, { numberFormat: THREE_DECIMALS }),
        cell(subtotal.requiredKg, { numberFormat: THREE_DECIMALS }),
        cell('kg'),
      ]),
    ]
  })
}

function takeoffSheet(input: TakeoffWorkbookInput): WorkbookSheetSpec {
  const { lines, locale } = input
  const copy = exportCopy[locale]
  const rows: WorkbookRowSpec[] = watermarkRows(lines, locale)
  const headerRowNumber = rows.length + 1
  const total = grandTotal(lines)

  rows.push(
    row(
      'header',
      workbookHeaders(locale).map((header) => cell(header)),
    ),
    ...storyBlocks(input),
    row('total', [
      cell(t(locale, 'takeoff.total')),
      ...Array.from({ length: 10 }, () => cell(null)),
      cell(total.designKg, { numberFormat: THREE_DECIMALS }),
      cell(total.requiredKg, { numberFormat: THREE_DECIMALS }),
      cell('kg'),
    ]),
    // 継手は質量に足せないので合計行を分ける。方式ごとに単価が違うので方式別に出す。
    ...spliceTotals(lines).map(({ method, totalCount }) =>
      row('total', [
        cell(`${t(locale, 'takeoff.total')}　${t(locale, 'takeoff.splice')}（${method}）`),
        ...Array.from({ length: 10 }, () => cell(null)),
        cell(totalCount, { numberFormat: SPLICE_COUNT_FORMAT }),
        cell(null),
        cell('箇所'),
      ]),
    ),
    ...footerRows(lines, locale),
  )

  return {
    name: copy.sheetName,
    columns: COLUMN_WIDTHS.map((width, index) => ({
      width,
      printed: index + 1 !== SOURCE_COLUMN && index + 1 !== FORMULA_COLUMN,
    })),
    rows,
    headerRowNumber,
    requiredColumn: REQUIRED_COLUMN,
    wrapColumns: [SOURCE_COLUMN, FORMULA_COLUMN],
  }
}

/**
 * 発注は径ごとに出すので、階も部材も跨いだ径別の和を別シートに立てる。
 * 内訳書シートを人が読んで足し直す作業がそのまま転記ミスになる。
 */
function sizeSummarySheet(input: TakeoffWorkbookInput): WorkbookSheetSpec {
  const { lines, locale } = input
  const copy = exportCopy[locale]
  const rows: WorkbookRowSpec[] = watermarkRows(lines, locale).map(
    ({ kind, cells }) => sizeRow(kind, [cells[0]]),
  )
  const headerRowNumber = rows.length + 1
  const total = grandTotal(lines)

  rows.push(
    sizeRow(
      'header',
      [
        t(locale, 'takeoff.diameter'),
        t(locale, 'takeoff.designQuantity'),
        t(locale, 'takeoff.requiredQuantity'),
        t(locale, 'takeoff.unit'),
      ].map((header) => cell(header)),
    ),
    ...sizeSubtotals(lines).map(({ size, designKg, requiredKg }) =>
      sizeRow(
        'data',
        [
          cell(size),
          cell(designKg, { numberFormat: THREE_DECIMALS }),
          cell(requiredKg, { numberFormat: THREE_DECIMALS }),
          cell('kg'),
        ],
        size,
      ),
    ),
    sizeRow('total', [
      cell(t(locale, 'takeoff.total')),
      cell(total.designKg, { numberFormat: THREE_DECIMALS }),
      cell(total.requiredKg, { numberFormat: THREE_DECIMALS }),
      cell('kg'),
    ]),
    ...footerRows(lines, locale).map(({ kind, cells }) =>
      sizeRow(kind, cells[0].value === null ? [] : [cells[0]]),
    ),
  )

  return {
    name: copy.sizeSheetName,
    columns: SIZE_SUMMARY_COLUMN_WIDTHS.map((width) => ({
      width,
      printed: true,
    })),
    rows,
    headerRowNumber,
    requiredColumn: SIZE_SUMMARY_REQUIRED_COLUMN,
    wrapColumns: [],
  }
}

export function buildTakeoffWorkbook(
  input: TakeoffWorkbookInput,
): WorkbookSpec {
  const copy = exportCopy[input.locale]

  return {
    filename: 'kijun-takeoff.xlsx',
    title: `${input.project.name} — ${copy.sheetName}`,
    sheets: [takeoffSheet(input), sizeSummarySheet(input)],
  }
}

const workbookColors = {
  canvas: 'FFF7F7F4',
  canvasSoft: 'FFFAFAF7',
  error: 'FFCF2D56',
  hairline: 'FFE6E5E0',
  ink: 'FF26251E',
  link: 'FF0563C1',
  white: 'FFFFFFFF',
}

function writeSheet(
  workbook: import('exceljs').Workbook,
  sheet: WorkbookSheetSpec,
): void {
  const columnCount = sheet.columns.length
  const worksheet = workbook.addWorksheet(sheet.name, {
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      orientation: 'landscape',
      paperSize: 9,
    },
    views: [
      {
        state: 'frozen',
        ySplit: sheet.headerRowNumber,
        showGridLines: false,
      },
    ],
  })

  worksheet.columns = sheet.columns.map(({ width }) => ({ width }))

  for (const rowSpec of sheet.rows) {
    const values = rowSpec.cells.map(({ value, hyperlink }) =>
      hyperlink && value !== null
        ? { text: String(value), hyperlink }
        : value,
    )
    const worksheetRow = worksheet.addRow(values)

    rowSpec.cells.forEach((cellSpec, index) => {
      const worksheetCell = worksheetRow.getCell(index + 1)
      if (cellSpec.numberFormat) worksheetCell.numFmt = cellSpec.numberFormat
      worksheetCell.alignment = {
        vertical: 'middle',
        wrapText: sheet.wrapColumns.includes(index + 1),
      }
      if (cellSpec.hyperlink) {
        worksheetCell.font = {
          color: { argb: workbookColors.link },
          underline: true,
        }
      }
    })

    if (
      rowSpec.kind === 'watermark' ||
      rowSpec.kind === 'source-heading' ||
      rowSpec.kind === 'source' ||
      rowSpec.kind === 'notice'
    ) {
      worksheet.mergeCells(
        worksheetRow.number,
        1,
        worksheetRow.number,
        columnCount,
      )
      worksheetRow.getCell(1).alignment = {
        vertical: 'middle',
        wrapText: true,
      }
    }

    if (rowSpec.kind === 'watermark') {
      worksheetRow.height = rowSpec === sheet.rows[0] ? 24 : 54
      worksheetRow.getCell(1).font = {
        bold: true,
        color: { argb: workbookColors.error },
      }
      worksheetRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
    }

    if (rowSpec.kind === 'header') {
      worksheetRow.height = 28
      worksheetRow.eachCell((worksheetCell) => {
        worksheetCell.font = {
          bold: true,
          color: { argb: workbookColors.ink },
        }
        worksheetCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: workbookColors.canvas },
        }
        worksheetCell.border = {
          bottom: {
            style: 'thin',
            color: { argb: workbookColors.hairline },
          },
        }
      })
    }

    if (rowSpec.kind === 'data') {
      const wrappedLineCount = Math.max(
        1,
        ...sheet.wrapColumns.map(
          (column) => String(rowSpec.cells[column - 1].value).split('\n').length,
        ),
      )
      worksheetRow.height = Math.max(32, (wrappedLineCount + 1) * 16)
      worksheetRow.getCell(sheet.requiredColumn).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
      worksheetRow.getCell(sheet.requiredColumn).border = {
        left: { style: 'medium', color: { argb: workbookColors.ink } },
      }
    }

    // 小計は「その階の締め」なので合計より弱く、けれど明細より強く見せる。
    if (rowSpec.kind === 'subtotal') {
      worksheetRow.height = 24
      worksheetRow.font = { bold: true, color: { argb: workbookColors.ink } }
      worksheetRow.eachCell((worksheetCell) => {
        worksheetCell.border = {
          top: { style: 'thin', color: { argb: workbookColors.hairline } },
        }
      })
      worksheetRow.getCell(sheet.requiredColumn).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
    }

    if (rowSpec.kind === 'total') {
      worksheetRow.height = 28
      worksheetRow.font = { bold: true, color: { argb: workbookColors.ink } }
      worksheetRow.eachCell((worksheetCell) => {
        worksheetCell.border = {
          top: { style: 'medium', color: { argb: workbookColors.ink } },
        }
      })
      worksheetRow.getCell(sheet.requiredColumn).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
    }

    if (rowSpec.kind === 'source-heading') {
      worksheetRow.height = 28
      worksheetRow.getCell(1).font = {
        bold: true,
        color: { argb: workbookColors.ink },
      }
      worksheetRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvas },
      }
    }

    if (rowSpec.kind === 'source' || rowSpec.kind === 'notice') {
      worksheetRow.height = 32
      if (!worksheetRow.getCell(1).font) {
        worksheetRow.getCell(1).font = { color: { argb: workbookColors.ink } }
      }
    }
  }

  worksheet.autoFilter = {
    from: { row: sheet.headerRowNumber, column: 1 },
    to: { row: sheet.headerRowNumber, column: columnCount },
  }
}

export async function exportTakeoffXlsx(
  input: TakeoffWorkbookInput,
): Promise<void> {
  const spec = buildTakeoffWorkbook(input)
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = 'Kijun'
  workbook.title = spec.title

  for (const sheet of spec.sheets) {
    writeSheet(workbook, sheet)
  }

  const output = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(output)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = spec.filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
