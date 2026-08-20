import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BAR_SIZES } from '@/domain/model/member'
import { createSampleProject } from '@/domain/model/sample-project'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  setUnitMass,
  type Project,
} from '@/domain/model/project'
import {
  aggregateQuantity,
  grandTotal,
  inferredRules,
  spliceTotals,
  type QuantityLine,
} from '@/domain/quantity'
import { generateColumnRebar } from '@/domain/rebar/column'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

import { buildTakeoffWorkbook, exportTakeoffXlsx } from './index'

/**
 * 単位質量は利用者入力で、サンプル案件には入っていない。kg 列を見る書き出し
 * テストはまずこれを通す — 合成値 1 kg/m なら設計数量は総延長(m)そのものだ。
 */
function withUnitMass(project: Project): Project {
  return BAR_SIZES.reduce((next, size) => setUnitMass(next, size, 1), project)
}

function sampleInput(): { project: Project; lines: QuantityLine[] } {
  const project = withUnitMass(createSampleProject())
  const rebars = project.members.flatMap((member) => {
    if (member.kind !== '柱') return []

    const section = findSection(project, member.sectionId)
    if (section.kind !== '柱') throw new Error('Expected 柱 section')

    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) throw new Error('Expected story')

    return generateColumnRebar(
      {
        member,
        section,
        story,
        beamDepthAbove: beamDepthAbove(project, member),
        ends: columnEnds(project, member),
      },
      jpMlitRulePack,
    )
  })

  return {
    project,
    lines: aggregateQuantity(project, rebars, jpMlitRulePack),
  }
}

describe('buildTakeoffWorkbook', () => {
  it('includes generated 大梁 rows in the exported kg totals', () => {
    const project = withUnitMass(createSampleProject())
    useAppStore.setState({ project })
    const { result } = renderHook(() => useTakeoff())
    const { lines } = result.current
    const girderLines = lines.filter(
      ({ memberKind }) => memberKind === '大梁',
    )
    const spec = buildTakeoffWorkbook({ project, lines, locale: 'ja' })
    const exportedGirderRows = spec.rows.filter(
      ({ kind, cells }) => kind === 'data' && cells[1].value === '大梁',
    )
    const totalRow = spec.rows.find(({ kind }) => kind === 'total')
    const total = grandTotal(lines)

    expect(girderLines.length).toBeGreaterThan(0)
    expect(exportedGirderRows).toHaveLength(girderLines.length)
    expect(exportedGirderRows.every(({ cells }) => Number(cells[11].value) > 0))
      .toBe(true)
    expect(totalRow?.cells[11].value).toBe(total.designKg)
    expect(totalRow?.cells[12].value).toBe(total.requiredKg)
  })

  it('puts the mandatory two-line watermark before every other row', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })

    expect(spec.rows.slice(0, 2).map(({ kind }) => kind)).toEqual([
      'watermark',
      'watermark',
    ])
    expect(spec.rows[0].cells[0].value).toBe(
      '※ 未確認の規準値を含む — 検収前の参考値',
    )
  })

  it('lists every inferred contribution with its rule name and source location', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const watermark = String(spec.rows[1].cells[0].value)

    for (const rule of inferredRules(input.lines)) {
      expect(watermark).toContain(rule.label)
      expect(watermark).toContain(rule.source.doc)
      if (rule.source.section) expect(watermark).toContain(rule.source.section)
    }
  })

  it('prefixes the item-name cell of exactly the inferred rows', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const dataRows = spec.rows.filter(({ kind }) => kind === 'data')

    expect(dataRows).toHaveLength(input.lines.length)
    // ⚠ は未確認の規準値（inferred）の印だ。全行に付いても一行も付かなくても
    // 印は意味を失う — 行ごとに一致していなければならない。帯筋の質量行は
    // 1通則2)・7)・9) だけで出るので stated だ。
    expect(
      dataRows.map(({ cells }) => String(cells[3].value).startsWith('⚠ ')),
    ).toEqual(input.lines.map(({ inferred }) => inferred))
    expect(input.lines.some(({ inferred }) => inferred)).toBe(true)
    expect(input.lines.some(({ inferred }) => !inferred)).toBe(true)
  })

  it('emits the seventeen DESIGN §4.2 columns in order and preserves display precision', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const header = spec.rows.find(({ kind }) => kind === 'header')
    const firstDataRow = spec.rows.find(({ kind }) => kind === 'data')

    expect(header?.cells.map(({ value }) => value)).toEqual([
      '階',
      '部材',
      '符号',
      '鉄筋',
      '径',
      '形状',
      '長さ (m)',
      '本数',
      '箇所',
      '総延長 (m)',
      'kg/m',
      '設計数量',
      '所要数量',
      '単位',
      '出典',
      '備考',
      '算出式',
    ])
    expect(header?.cells).toHaveLength(17)
    expect(firstDataRow?.cells[6].numberFormat).toBe('0.000')
    expect(firstDataRow?.cells[9].numberFormat).toBe('0.000')
    expect(firstDataRow?.cells[10].numberFormat).toBe('0.000')
    expect(firstDataRow?.cells[11].numberFormat).toBe('0.000')
    expect(firstDataRow?.cells[12].numberFormat).toBe('0.000')
  })

  it('adds a 箇所 total row per 継手 method beside the kg total', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const totals = spec.rows.filter(({ kind }) => kind === 'total')
    const [kgTotal, spliceTotal] = totals

    // 継手は質量に足せないので行を分ける。分けた行が kg 合計と同じ列に
    // 落ちていないと、単位だけ違う二つの合計が別々の欄に見える。
    expect(kgTotal?.cells[13].value).toBe('kg')
    expect(spliceTotal?.cells[13].value).toBe('箇所')
    expect(spliceTotal?.cells[0].value).toContain('重ね継手')
    expect(spliceTotal?.cells[11].value).toBe(
      spliceTotals(input.lines)[0].totalCount,
    )
    // 0.5か所（（３）梁2)）を丸めず、整数に余分な小数点も残さない。
    expect(spliceTotal?.cells[11].numberFormat).toBe('General')
  })

  it('writes the stored 備考 into the note column', () => {
    const input = sampleInput()
    const lineId = input.lines[0].id
    const spec = buildTakeoffWorkbook({
      ...input,
      project: { ...input.project, notes: { [lineId]: '要確認' } },
      locale: 'ja',
    })
    const rows = spec.rows.filter(({ kind }) => kind === 'data')
    const noted = rows.find(({ id }) => id === lineId)
    const others = rows.filter(({ id }) => id !== lineId)

    expect(noted?.cells[15].value).toBe('要確認')
    expect(others.every(({ cells }) => cells[15].value === '')).toBe(true)
  })

  it('includes source document names, editions, URLs, scope and modification notice', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const sourceText = spec.rows
      .filter(({ kind }) => kind === 'source' || kind === 'notice')
      .map(({ cells }) => cells[0].value)
      .join('\n')
    const sourceRules = input.lines.flatMap(({ rules }) => rules)
    const specRule = sourceRules.find(({ source }) => source.short === '標準仕様書')
    const quantityRule = sourceRules.find(
      ({ source }) => source.short === '数量積算基準',
    )

    for (const rule of [specRule, quantityRule]) {
      expect(rule).toBeDefined()
      expect(sourceText).toContain(rule!.source.doc)
      expect(sourceText).toContain(rule!.source.edition)
      expect(sourceText).toContain(rule!.source.url)
    }
    expect(sourceText).toContain('官庁施設')
    expect(sourceText).toContain('民間工事')
    expect(sourceText).toContain('加工・改変')
  })

  it('keeps the exported total equal to grandTotal without rounding the value', () => {
    const input = sampleInput()
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const totalRow = spec.rows.find(({ kind }) => kind === 'total')
    const total = grandTotal(input.lines)

    expect(totalRow?.cells[11].value).toBe(total.designKg)
    expect(totalRow?.cells[12].value).toBe(total.requiredKg)
  })

  it('materializes the spec as a browser-downloaded xlsx with its watermark intact', async () => {
    const input = sampleInput()
    let downloadedBlob: Blob | undefined
    let downloadedFilename: string | undefined
    const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    )
    const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      'revokeObjectURL',
    )

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob
        return 'blob:kijun-test'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download
      })

    try {
      await exportTakeoffXlsx({ ...input, locale: 'ja' })
    } finally {
      click.mockRestore()
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL')
      }
      if (originalRevokeObjectUrl) {
        Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL')
      }
    }

    expect(downloadedFilename).toBe('kijun-takeoff.xlsx')
    expect(downloadedBlob).toBeDefined()

    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    // exceljs の index.d.ts は自前で `interface Buffer extends ArrayBuffer` を
    // モジュール内に宣言している。load が取るのは Node の Buffer ではなく
    // ArrayBuffer なので、Blob の ArrayBuffer をそのまま渡す。
    await workbook.xlsx.load(await downloadedBlob!.arrayBuffer())
    const worksheet = workbook.getWorksheet('数量内訳書')

    expect(worksheet?.getCell('A1').value).toBe(
      '※ 未確認の規準値を含む — 検収前の参考値',
    )
    expect(worksheet?.getCell('A3').value).toBe('階')
    expect(worksheet?.getCell('Q3').value).toBe('算出式')
    // 網掛けは発注に使う 所要数量(M) に立てる。データ行と合計行で強調列が
    // 食い違うと同じシートの中で発注列が二つに見える。
    const spec = buildTakeoffWorkbook({ ...input, locale: 'ja' })
    const dataRowNumber = spec.rows.findIndex(({ kind }) => kind === 'data') + 1
    const totalRowNumber = spec.rows.findIndex(({ kind }) => kind === 'total') + 1
    expect(worksheet?.getRow(dataRowNumber).getCell(13).fill).toMatchObject({
      pattern: 'solid',
    })
    expect(worksheet?.getRow(dataRowNumber).getCell(15).fill).toMatchObject({
      pattern: 'none',
    })
    expect(worksheet?.getRow(totalRowNumber).getCell(13).fill).toMatchObject({
      pattern: 'solid',
    })
    // exceljs の動的 import は npm ci 直後の初回だけ既定の5秒を超えることがある。
  }, 20000)
})
