import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { extractTextPages } from '@/lib/import/pdf-text'
import { useAppStore } from '@/lib/store'

import planFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p7.json'
import { LazyPlanImport } from './LazyPlanImport'

vi.mock('@/lib/import/pdf-text', () => ({ extractTextPages: vi.fn() }))

const pdf = () => new File(['pdf'], 'plan.pdf', { type: 'application/pdf' })

describe('LazyPlanImport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(extractTextPages).mockResolvedValue([
      { ...planFixture.page, items: planFixture.items },
    ])
    useAppStore.setState({ project: createSampleProject(), locale: 'ja' })
  })

  /**
   * 初期表示にあるのは二つの釦とファイル入力だけだ — 伏図·軸組図·図面セットの
   * 本体はここに無い。これが崩れると解析器ごと初期ロードの転送バイトに戻る。
   */
  it('図面を選ぶまで候補の本体を描かない', () => {
    render(<LazyPlanImport />)

    expect(screen.getByTestId('plan-import-file')).toBeInTheDocument()
    expect(screen.getByTestId('drawing-set-files')).toHaveAttribute('multiple')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('伏図を選ぶと本体が来て通り芯の候補を出す', async () => {
    render(<LazyPlanImport />)

    fireEvent.change(screen.getByTestId('plan-import-file'), {
      target: { files: [pdf()] },
    })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // 殻は File を渡すだけで、読むのは本体だ — 渡した先で一度だけ読まれる。
    await waitFor(() => expect(extractTextPages).toHaveBeenCalledTimes(1))
  })

  it('図面セットを選ぶと本体が来てセットの面を並べる', async () => {
    render(<LazyPlanImport />)

    fireEvent.change(screen.getByTestId('drawing-set-files'), {
      target: { files: [pdf()] },
    })

    await waitFor(() =>
      expect(screen.getByTestId('drawing-set-pages')).toBeInTheDocument(),
    )
  })
})
