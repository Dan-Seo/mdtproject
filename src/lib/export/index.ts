import type { Project } from '@/domain/model/project'
import {
  grandTotal,
  hasInferred,
  inferredRules,
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
}

export interface WorkbookSpec {
  filename: 'kijun-takeoff.xlsx'
  sheetName: string
  title: string
  columns: WorkbookColumnSpec[]
  rows: WorkbookRowSpec[]
  headerRowNumber: number
}

export interface TakeoffWorkbookInput {
  project: Project
  lines: QuantityLine[]
  locale: Locale
}

const COLUMN_COUNT = 16
const THREE_DECIMALS = '0.000'

const COLUMN_WIDTHS = [
  10, 12, 10, 12, 9, 13, 12, 10, 10, 15, 10, 16, 16, 36, 18, 64,
]

const exportCopy: Record<
  Locale,
  {
    sheetName: string
    sourceHeading: string
    scopeNotice: string
    modificationNotice: string
    unavailableEdition: string
    unavailableUrl: string
    unknownSection: string
    inferredList: string
  }
> = {
  ja: {
    sheetName: '数量内訳書',
    sourceHeading: '算出根拠',
    scopeNotice:
      '適用範囲: 国土交通省の官庁施設向け基準であり、民間工事では異なる場合があります。',
    modificationNotice:
      '改変表示: 本算出物はKijunが公開資料を加工・改変して作成した値です。',
    unavailableEdition: '版未確認',
    unavailableUrl: '原文URL未確保',
    unknownSection: '条項未確認',
    inferredList: '未確認項目',
  },
  ko: {
    sheetName: '수량 내역서',
    sourceHeading: '산출 근거',
    scopeNotice:
      '적용 범위: 국토교통성의 관청시설 기준이며, 민간공사에서는 다를 수 있습니다.',
    modificationNotice:
      '개변 표시: 이 산출물은 Kijun이 공개 자료를 가공·개변하여 만든 값입니다.',
    unavailableEdition: '판 미확인',
    unavailableUrl: '원문 URL 미확보',
    unknownSection: '조항 미확인',
    inferredList: '미확인 항목',
  },
}

function cell(
  value: WorkbookCellValue,
  options: Omit<WorkbookCellSpec, 'value'> = {},
): WorkbookCellSpec {
  return { value, ...options }
}

function row(
  kind: WorkbookRowKind,
  cells: WorkbookCellSpec[],
  id?: string,
): WorkbookRowSpec {
  if (cells.length > COLUMN_COUNT) {
    throw new Error(`Workbook row exceeds ${COLUMN_COUNT} columns`)
  }

  return {
    kind,
    id,
    cells: [
      ...cells,
      ...Array.from({ length: COLUMN_COUNT - cells.length }, () => cell(null)),
    ],
  }
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
    t(locale, 'takeoff.source'),
    t(locale, 'takeoff.note'),
    t(locale, 'export.formula'),
  ]
}

function dataRow(
  line: QuantityLine,
  locale: Locale,
  note: string,
): WorkbookRowSpec {
  return row(
    'data',
    [
      cell(line.storyName),
      cell(line.memberKind),
      cell(line.mark),
      cell(`${line.inferred ? '⚠ ' : ''}${line.role}`),
      cell(line.size),
      cell(shapeLabel(locale, line.shape)),
      cell(line.lengthMm / 1000, { numberFormat: THREE_DECIMALS }),
      cell(line.countPerMember, { numberFormat: '0' }),
      cell(line.places, { numberFormat: '0' }),
      cell(line.totalLengthMm / 1000, { numberFormat: THREE_DECIMALS }),
      cell(line.unitMassKgPerM, { numberFormat: THREE_DECIMALS }),
      cell(line.designKg, { numberFormat: THREE_DECIMALS }),
      cell(line.requiredKg, { numberFormat: THREE_DECIMALS }),
      cell(lineSources(line, locale)),
      cell(note),
      cell(line.formula),
    ],
    line.id,
  )
}

export function buildTakeoffWorkbook(
  input: TakeoffWorkbookInput,
): WorkbookSpec {
  const { project, lines, locale } = input
  const copy = exportCopy[locale]
  const rows: WorkbookRowSpec[] = []

  if (hasInferred(lines)) {
    rows.push(
      row('watermark', [cell('※ 未確認の規準値を含む — 検収前の参考値')]),
      row('watermark', [
        cell(
          `${copy.inferredList}: ${inferredRules(lines)
            .map((rule) => sourceLocation(rule, locale, true))
            .join(' / ')}`,
        ),
      ]),
    )
  }

  const headerRowNumber = rows.length + 1
  rows.push(
    row(
      'header',
      workbookHeaders(locale).map((header) => cell(header)),
    ),
    ...lines.map((line) =>
      dataRow(line, locale, project.notes?.[line.id] ?? ''),
    ),
  )

  const total = grandTotal(lines)
  rows.push(
    row('total', [
      cell(t(locale, 'takeoff.total')),
      ...Array.from({ length: 10 }, () => cell(null)),
      cell(total.designKg, { numberFormat: THREE_DECIMALS }),
      cell(total.requiredKg, { numberFormat: THREE_DECIMALS }),
    ]),
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
  )

  return {
    filename: 'kijun-takeoff.xlsx',
    sheetName: copy.sheetName,
    title: `${project.name} — ${copy.sheetName}`,
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
    rows,
    headerRowNumber,
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

export async function exportTakeoffXlsx(
  input: TakeoffWorkbookInput,
): Promise<void> {
  const spec = buildTakeoffWorkbook(input)
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = 'Kijun'
  workbook.title = spec.title

  const worksheet = workbook.addWorksheet(spec.sheetName, {
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
        ySplit: spec.headerRowNumber,
        showGridLines: false,
      },
    ],
  })

  worksheet.columns = spec.columns.map(({ width }) => ({ width }))

  for (const rowSpec of spec.rows) {
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
        wrapText: index === 13 || index === 15,
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
        COLUMN_COUNT,
      )
      worksheetRow.getCell(1).alignment = {
        vertical: 'middle',
        wrapText: true,
      }
    }

    if (rowSpec.kind === 'watermark') {
      worksheetRow.height = rowSpec === spec.rows[0] ? 24 : 54
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
        String(rowSpec.cells[13].value).split('\n').length,
        String(rowSpec.cells[15].value).split('\n').length,
      )
      worksheetRow.height = Math.max(32, (wrappedLineCount + 1) * 16)
      worksheetRow.getCell(13).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
      worksheetRow.getCell(13).border = {
        left: { style: 'medium', color: { argb: workbookColors.ink } },
      }
      if (String(rowSpec.cells[3].value).startsWith('⚠ ')) {
        worksheetRow.getCell(4).font = {
          color: { argb: workbookColors.error },
        }
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
      worksheetRow.getCell(13).fill = {
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
    from: { row: spec.headerRowNumber, column: 1 },
    to: { row: spec.headerRowNumber, column: COLUMN_COUNT },
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
