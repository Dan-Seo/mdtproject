'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  buildTakeoffWorkbook,
  type WorkbookRowSpec,
  type WorkbookSheetSpec,
} from '@/lib/export'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { capture, sizeBucket } from '@/lib/telemetry'

import styles from './TakeoffPrint.module.css'

/**
 * 印刷用の複製は body 直下に出す。アプリのシェルは height:100vh・
 * overflow:hidden の格子なので、その中に置くと1ページ目で切られる。
 */
export const PRINT_ROOT_ID = 'kijun-print-root'
/**
 * 印刷中だけ body に付ける。この印が無いまま Ctrl+P を押した人には画面を
 * そのまま印刷させる — 印刷用の複製が居ないのに他を全部隠すと白紙が出る。
 */
export const PRINTING_BODY_CLASS = 'kijun-printing'

/** 段落として1行に伸ばす行 — 警告・出典・注記。表の桁には乗らない。 */
const BANNER_KINDS: WorkbookRowSpec['kind'][] = [
  'watermark',
  'source-heading',
  'source',
  'notice',
]

function cellText(value: string | number | null): string {
  if (value === null) return ''
  // 画面と書き出しの桁を合わせる (docs/UX.md §3)。
  return typeof value === 'number' ? value.toFixed(3) : value
}

function PrintedSheet({ sheet }: { sheet: WorkbookSheetSpec }) {
  const printedColumns = sheet.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.printed)
  const header = sheet.rows.find(({ kind }) => kind === 'header')
  const banners = sheet.rows.filter(({ kind }) => BANNER_KINDS.includes(kind))
  const body = sheet.rows.filter(
    ({ kind }) => kind === 'data' || kind === 'subtotal' || kind === 'total',
  )

  return (
    <section className={styles.sheet}>
      {banners
        .filter(({ kind }) => kind === 'watermark')
        .map((banner, index) => (
          <p key={`watermark-${index}`} className={styles.watermark}>
            {cellText(banner.cells[0].value)}
          </p>
        ))}

      <table className={styles.table}>
        <caption className={styles.caption}>{sheet.name}</caption>
        <colgroup>
          {printedColumns.map(({ column, index }) => (
            <col key={index} style={{ width: `${column.width}ch` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {printedColumns.map(({ index }) => (
              <th key={index} scope="col">
                {cellText(header?.cells[index].value ?? null)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr
              key={row.id ?? `${row.kind}-${rowIndex}`}
              className={
                row.kind === 'data' ? styles.dataRow : styles.summaryRow
              }
            >
              {printedColumns.map(({ index }) => (
                <td
                  key={index}
                  className={
                    index + 1 === sheet.requiredColumn
                      ? styles.requiredCell
                      : undefined
                  }
                >
                  {cellText(row.cells[index].value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {banners
        .filter(({ kind }) => kind !== 'watermark')
        .map((banner, index) => (
          <p
            key={`note-${index}`}
            className={
              banner.kind === 'source-heading'
                ? styles.sourceHeading
                : styles.note
            }
          >
            {cellText(banner.cells[0].value)}
          </p>
        ))}
    </section>
  )
}

/**
 * PDF は追加のライブラリではなくブラウザの印刷経路で出す。日本語の字形が
 * OS のフォントでそのまま出るし、束ねる CJK サブセットも要らない。
 */
export function TakeoffPrint() {
  const project = useAppStore(({ project }) => project)
  const locale = useAppStore(({ locale }) => locale)
  const { lines } = useTakeoff()
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!printing) return

    document.body.classList.add(PRINTING_BODY_CLASS)
    try {
      // 押した時点ではなく、印刷対象が組み上がってから記録する。
      window.print()
      capture('takeoff_printed', {
        locale,
        size_bucket: sizeBucket(lines.length),
      })
    } finally {
      // 複製を画面に残すと、行数ぶんの DOM が編集のたびに再描画される。
      document.body.classList.remove(PRINTING_BODY_CLASS)
      setPrinting(false)
    }
  }, [printing, locale, lines.length])

  const spec = printing
    ? buildTakeoffWorkbook({ project, lines, locale })
    : null

  return (
    <>
      <button
        type="button"
        className={styles.printButton}
        onClick={() => setPrinting(true)}
      >
        {t(locale, 'takeoff.print')}
      </button>
      {spec !== null
        ? createPortal(
            <div id={PRINT_ROOT_ID} className={styles.printRoot}>
              <h1 className={styles.title}>{spec.title}</h1>
              {spec.sheets.map((sheet) => (
                <PrintedSheet key={sheet.name} sheet={sheet} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
