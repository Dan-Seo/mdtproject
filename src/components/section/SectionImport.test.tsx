import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import type { TextPage } from '@/lib/import/section-list/types'
import { useAppStore } from '@/lib/store'

import yokohamaFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p13.json'
import { SectionImport } from './SectionImport'

const yokohamaPage: TextPage = {
  ...yokohamaFixture.page,
  items: yokohamaFixture.items,
}

describe('SectionImport', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
    })
  })

  it('does not change Project before a candidate row is approved', () => {
    const before = useAppStore.getState().project

    render(<SectionImport initialPages={[yokohamaPage]} />)

    expect(screen.getByTestId('section-import-candidate-C51-1階')).toBeVisible()
    expect(useAppStore.getState().project).toBe(before)
  })

  it('keeps the file input usable after asynchronous extraction', async () => {
    const extractPages = vi.fn().mockResolvedValue([yokohamaPage])
    render(<SectionImport extractPages={extractPages} />)
    const input = screen.getByTestId('section-import-file')
    const file = new File(['pdf'], 'section-list.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(input, { target: { files: [file] } })

    expect(
      await screen.findByTestId('section-import-candidate-C51-1階'),
    ).toBeVisible()
    expect(extractPages).toHaveBeenCalledWith(file)
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('applies only parsed C51 fields and preserves the blank hoop field', () => {
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C51-1階')
    expect(row).toHaveTextContent('未解析の欄はC1から複製')
    expect(row).toHaveTextContent('S13-@100')

    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(({ mark }) => mark === 'C51')
    expect(section?.kind).toBe('柱')
    if (section?.kind !== '柱') throw new Error('Expected imported 柱 section')
    expect(section).toMatchObject({
      b: 800,
      d: 800,
      main: { count: 22, size: 'D25' },
      hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
    })
  })

  it('does not offer approval for 対象外 candidates', () => {
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const group = screen.getByTestId('section-import-out-of-scope')
    const row = within(group).getByTestId('section-import-candidate-B51-none')
    expect(row).toHaveTextContent('B51')
    expect(within(row).queryByRole('button', { name: '反映' })).toBeNull()
  })

  it('ignores one candidate without changing Project', () => {
    const before = useAppStore.getState().project
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C52-2階')
    fireEvent.click(within(row).getByRole('button', { name: '無視' }))

    expect(row).not.toBeVisible()
    expect(useAppStore.getState().project).toBe(before)
  })

  it('shows a non-throwing empty result when no section list is found', () => {
    render(
      <SectionImport
        initialPages={[{ widthPt: 100, heightPt: 100, items: [] }]}
      />,
    )

    expect(
      screen.getByText('認識できる断面リストが見つかりません'),
    ).toBeVisible()
  })
})
