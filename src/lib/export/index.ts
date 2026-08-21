import type { Project } from '@/domain/model/project'
import {
  grandTotal,
  hasUnverified,
  inferredRules,
  isMassLine,
  spliceTotals,
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

const COLUMN_COUNT = 17
const THREE_DECIMALS = '0.000'
// 継手の 0.5か所（（３）梁2)）が 1 に丸まると条文と違う数が内訳書に出る。
// '0.#' は書式に小数点そのものを含むので、整数の 108 が `108.` と描かれる。
const SPLICE_COUNT_FORMAT = 'General'

const COLUMN_WIDTHS = [
  10, 12, 10, 12, 9, 13, 12, 10, 10, 15, 10, 16, 16, 8, 36, 18, 64,
]
/** 列番号 (1 起点)。所要数量の網掛けと、出典・算出式の折り返しに使う。 */
const REQUIRED_COLUMN = 13
const SOURCE_COLUMN = 15
const FORMULA_COLUMN = 17

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
    transcribedOnly: string
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
    inferredList: '原文に値なし（推論）',
    transcribedOnly: '全て原文明示だが独立検討待ち（R6）',
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

export function buildTakeoffWorkbook(
  input: TakeoffWorkbookInput,
): WorkbookSpec {
  const { project, lines, locale } = input
  const copy = exportCopy[locale]
  const rows: WorkbookRowSpec[] = []

  if (hasUnverified(lines)) {
    // 警告は2行のままにする（DESIGN §4.2 — ヘッダ行の位置が動くと読み手側の
    // 参照が全部ずれる）。1行目でどちらの等級が混ざっているかを言い、2行目には
    // **原文に値がない項目だけ**を挙げる — 独立検討待ちは今ほぼ全行に付くので
    // 並べても読み手の作業リストにならない。
    const inferred = inferredRules(lines)
    rows.push(
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
        wrapText:
          index === SOURCE_COLUMN - 1 || index === FORMULA_COLUMN - 1,
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
        String(rowSpec.cells[SOURCE_COLUMN - 1].value).split('\n').length,
        String(rowSpec.cells[FORMULA_COLUMN - 1].value).split('\n').length,
      )
      worksheetRow.height = Math.max(32, (wrappedLineCount + 1) * 16)
      worksheetRow.getCell(REQUIRED_COLUMN).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: workbookColors.canvasSoft },
      }
      worksheetRow.getCell(REQUIRED_COLUMN).border = {
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
      worksheetRow.getCell(REQUIRED_COLUMN).fill = {
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
