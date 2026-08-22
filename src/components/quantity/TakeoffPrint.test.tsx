import { readFileSync } from 'node:fs'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BAR_SIZES } from '@/domain/model/member'
import { setUnitMass } from '@/domain/model/project'
import { useAppStore } from '@/lib/store'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telemetry')>()),
  capture,
  captureException: vi.fn(),
}))

import { PRINT_ROOT_ID, PRINTING_BODY_CLASS, TakeoffPrint } from './TakeoffPrint'

/**
 * ブラウザが紙に起こすのは print() の瞬間の DOM だ。呼び出しの中で複製を
 * 取っておく — 押し終わった後の DOM を見ても、そこにはもう何も無い。
 */
function capturePrintedDocument(): { current: HTMLElement | null } {
  const captured: { current: HTMLElement | null } = { current: null }

  vi.spyOn(window, 'print').mockImplementation(() => {
    const root = document.getElementById(PRINT_ROOT_ID)
    captured.current =
      root === null ? null : (root.cloneNode(true) as HTMLElement)
  })

  return captured
}

async function print(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'PDF 書き出し' }))
  await waitFor(() => expect(window.print).toHaveBeenCalled())
}

beforeEach(() => {
  capture.mockClear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore
    .getState()
    .updateProject((project) =>
      BAR_SIZES.reduce((next, size) => setUnitMass(next, size, 1), project),
    )
})

describe('TakeoffPrint', () => {
  it('opens the browser print dialog', async () => {
    capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    expect(window.print).toHaveBeenCalledTimes(1)
  })

  it('prints the 内訳書 and the 径別集計 as two tables', async () => {
    const printed = capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    const captions = within(printed.current!)
      .getAllByRole('table')
      .map((table) => table.querySelector('caption')?.textContent)
    expect(captions).toEqual(['数量内訳書', '径別集計'])
  })

  it('carries the watermark and the 出典 block onto the paper', async () => {
    const printed = capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    // ADR-015 の警告と PDL1.0 の出典・改変表示は紙に出ないと意味がない。
    expect(printed.current!.textContent).toContain('検収前の参考値')
    expect(printed.current!.textContent).toContain('算出根拠')
    expect(printed.current!.textContent).toContain('加工・改変')
    expect(printed.current!.textContent).toContain('官庁施設')
  })

  it('leaves 出典 and 算出式 off the paper but keeps 所要数量', async () => {
    const printed = capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    const headers = [
      ...within(printed.current!)
        .getAllByRole('table')[0]
        .querySelectorAll('thead th'),
    ].map((cell) => cell.textContent)

    expect(headers).not.toContain('算出式')
    expect(headers).not.toContain('出典')
    expect(headers).toContain('所要数量')
  })

  it('shows the 階小計 rows so the paper reads like the screen', async () => {
    const printed = capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    expect(printed.current!.textContent).toContain('1階　小計')
    expect(printed.current!.textContent).toContain('2階　小計')
  })

  // 桁は列ごとに違う。数だからと一律に丸めると、紙だけ「12.000本」
  // 「0.500か所」になって画面とも xlsx とも食い違う。
  it('keeps 設計本数 and 継手箇所 unrounded while 質量 stays at 3 decimals', async () => {
    const printed = capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    const cells = [...printed.current!.querySelectorAll('td')].map(
      ({ textContent }) => textContent ?? '',
    )

    expect(cells).toContain('12')
    expect(cells).not.toContain('12.000')
    expect(cells.some((text) => /^[0-9]+[.][0-9]{3}$/.test(text))).toBe(true)
  })

  it('hides the rest of the page only while printing', async () => {
    const seen: boolean[] = []
    vi.spyOn(window, 'print').mockImplementation(() => {
      seen.push(document.body.classList.contains(PRINTING_BODY_CLASS))
    })
    render(<TakeoffPrint />)

    await print()

    // 印が付いていない状態で Ctrl+P を押した人には画面をそのまま印刷させる —
    // 複製が居ないのに他を全部隠すと白紙が出る。
    expect(seen).toEqual([true])
    expect(document.body.classList.contains(PRINTING_BODY_CLASS)).toBe(false)
  })

  it('takes the 内訳書 back out of the document once the dialog closes', async () => {
    capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    // 複製を画面に残すと、行数ぶんの DOM が編集のたびに再描画される。
    await waitFor(() => {
      expect(document.getElementById(PRINT_ROOT_ID)).toBeNull()
    })
  })

  it('records the outcome, not the click', async () => {
    capturePrintedDocument()
    render(<TakeoffPrint />)

    await print()

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('takeoff_printed', {
        locale: 'ja',
        size_bucket: expect.any(String) as string,
      }),
    )
  })
})


/**
 * 印刷経路の id・body クラスは、この二定数と `globals.css`・e2e の生文字列に
 * 分かれて三箇所にある。片方を改名しても型検査は通ってしまい、印刷だけが
 * 白紙や無装飾になる — 定数を唯一の出所として、残り二箇所を突き合わせる。
 */
describe('印刷経路の目印', () => {
  // 「一度でも出れば通る」では足りない。目印は CSS に三度・e2e に五度出るので、
  // 一箇所だけ改名しても残りが定数と一致してしまう — 直し漏れが
  // `body.kijun-printing > *:not(#kijun-print-root)` なら複製ごと隠れて、
  // この試験が止めるはずだった白紙印刷がそのまま出る。出現を全部数え上げ、
  // 定数以外の名前が残っていないことを見る。
  const namesIn = (source: string, pattern: RegExp) => [
    ...new Set([...source.matchAll(pattern)].map(([, name]) => name)),
  ]

  const word = '[A-Za-z0-9_-]+'
  // 走査は定数から組む。`kijun-` を直に書くと、その外へ正しく改名した時に
  // 何も拾えず空になって、直っているのに落ちる。
  const prefix = PRINT_ROOT_ID.split('-')[0]
  // e2e は引用符の種類まで見る。一種類だけ数えると、書き方の違う出現が
  // 数から漏れて改名の直し漏れをまた通してしまう。
  const quotes = ['"', "'", '`'].join('')

  it('keeps globals.css and the e2e script on the exported names', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(namesIn(css, new RegExp(`#(${word})`, 'g'))).toEqual([PRINT_ROOT_ID])
    expect(namesIn(css, new RegExp(`body[.](${word})`, 'g'))).toEqual([
      PRINTING_BODY_CLASS,
    ])

    const e2e = readFileSync('tests/e2e/uc16-model-and-print.js', 'utf8')
    const quoted = new RegExp(`[${quotes}](${prefix}-${word})[${quotes}]`, 'g')
    expect(namesIn(e2e, quoted).sort()).toEqual(
      [PRINTING_BODY_CLASS, PRINT_ROOT_ID].sort(),
    )
  })
})
