import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import yokohamaFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p13.json'
import { LazySectionImport } from './LazySectionImport'

const page = { ...yokohamaFixture.page, items: yokohamaFixture.items }

vi.mock('@/lib/import/pdf-text', () => ({
  extractTextPages: vi.fn().mockResolvedValue([
    { ...yokohamaFixture.page, items: yokohamaFixture.items },
  ]),
}))

describe('LazySectionImport', () => {
  beforeEach(() => {
    useAppStore.setState({ project: createSampleProject(), locale: 'ja' })
  })

  /**
   * 初期表示にあるのは釦とファイル入力だけだ — 断面リストの本体はここに無い。
   * これが崩れると取込の本体が初期ロードの転送バイトに戻る。
   */
  it('PDF を選ぶまで候補の本体を描かない', () => {
    render(<LazySectionImport />)

    expect(screen.getByTestId('section-import-file')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('PDF を選ぶと本体が来て候補を出す', async () => {
    render(<LazySectionImport />)

    fireEvent.change(screen.getByTestId('section-import-file'), {
      target: { files: [new File(['pdf'], 'sections.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() =>
      expect(screen.getByTestId('section-import-candidate-C51-1階')).toBeVisible(),
    )
    expect(page.items.length).toBeGreaterThan(0)
  })
})
