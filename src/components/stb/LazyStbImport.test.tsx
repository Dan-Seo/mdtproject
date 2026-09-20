import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { LazyStbImport } from './LazyStbImport'

const stb = `<?xml version="1.0" encoding="UTF-8"?>
<ST_BRIDGE xmlns="https://www.building-smart.or.jp/dl" version="2.0.2">
  <StbModel><StbMembers/></StbModel>
</ST_BRIDGE>`

describe('LazyStbImport', () => {
  beforeEach(() => {
    useAppStore.setState({ project: createSampleProject(), locale: 'ja' })
  })

  /**
   * 初期表示にあるのは釦とファイル入力だけだ — .stb の解析器はここに無い。
   */
  it('ファイルを選ぶまで候補の本体を描かない', () => {
    render(<LazyStbImport />)

    expect(screen.getByTestId('stb-import-file')).toHaveAttribute(
      'accept',
      '.stb',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('.stb を選ぶと本体が来て候補を出す', async () => {
    render(<LazyStbImport />)

    fireEvent.change(screen.getByTestId('stb-import-file'), {
      target: { files: [new File([stb], 'model.stb')] },
    })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
