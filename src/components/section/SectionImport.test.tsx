import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('creates a story-scoped section from a fully parsed candidate', () => {
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C51-2階')
    // 복제 고지는 어떤 값이 흘러드는지 필드 단위로 보여야 한다 — 符号만으로는
    // 사용자가 fc·강종·노출·初期オフセット을 확인하지 않은 채 물량에 들어가는 것을
    // 모른다 (初期オフセット은 ADR-012가 제품이 정하지 않는다고 못박은 입력이다)
    expect(row).toHaveTextContent(
      '未解析の欄はC1（fc24・SD345・屋外/仕上げなし・初期オフセット0mm）から複製',
    )
    // 신규 符号는 반영해도 어떤 Member에도 배정되지 않는다 — 산정 미반영을 명시
    expect(row).toHaveTextContent(
      '追加された符号はまだどの部材にも割り当てられていません（数量・3Dに未反映）',
    )

    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'C51' && storyLabel === '2階',
      )
    expect(section?.kind).toBe('柱')
    if (section?.kind !== '柱') throw new Error('Expected imported 柱 section')
    expect(section).toMatchObject({
      b: 800,
      d: 800,
      main: { count: 18, size: 'D25' },
      hoop: { size: 'D13', pitch: 100 },
    })
    // 階는 별도 필드다 — 符号에 붙이면 도면에 없는 符号(「C51(2階)」)이 内訳書로
    // 나가고, 内訳書는 이미 階별로 묶여 있어 階가 두 번 표시된다
    expect(section.mark).toBe('C51')
    expect(
      useAppStore
        .getState()
        .project.sections.map(({ mark }) => mark)
        .filter((mark) => mark.includes('(')),
    ).toEqual([])
  })

  it('keeps each story as its own section instead of overwriting', () => {
    render(<SectionImport initialPages={[yokohamaPage]} />)

    // C53은 두 층 모두 완전 후보다 — 두 번째 반영이 첫 번째를 덮어쓰면 안 된다
    fireEvent.click(
      within(
        screen.getByTestId('section-import-candidate-C53-2階'),
      ).getByRole('button', { name: '反映' }),
    )
    fireEvent.click(
      within(
        screen.getByTestId('section-import-candidate-C53-1階'),
      ).getByRole('button', { name: '反映' }),
    )

    const imported = useAppStore
      .getState()
      .project.sections.filter(({ mark }) => mark === 'C53')
      .map(({ storyLabel }) => storyLabel)
    expect(imported).toEqual(['2階', '1階'])
  })

  it('blocks approval for a new mark with unparsed fields', () => {
    const before = useAppStore.getState().project
    render(<SectionImport initialPages={[yokohamaPage]} />)

    // C51 1階의 帯筋은 S13(고강도)라 빈칸이다 — 신규 符号로는 반영 불가
    const row = screen.getByTestId('section-import-candidate-C51-1階')
    expect(row).toHaveTextContent('S13-@100')
    const apply = within(row).getByRole('button', { name: '反映' })
    expect(apply).toBeDisabled()
    expect(row).toHaveTextContent(
      '未解析の欄がある新規符号は反映できません（原文を参照）',
    )

    fireEvent.click(apply)
    expect(useAppStore.getState().project).toBe(before)
  })

  it('preserves blank fields when applying onto an existing story-scoped section', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        sections: [
          ...base.sections,
          {
            id: 'section-C51-1F',
            kind: '柱',
            mark: 'C51',
            storyLabel: '1階',
            b: 750,
            d: 750,
            fc: 24,
            grade: 'SD345',
            exposure: '屋内',
            finish: '仕上げあり',
            main: { size: 'D22', count: 12 },
            hoop: { size: 'D10', pitch: 150, startOffsetMm: 50 },
          },
        ],
      },
    })
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C51-1階')
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'C51' && storyLabel === '1階',
      )
    expect(section?.kind).toBe('柱')
    if (section?.kind !== '柱') throw new Error('Expected existing 柱 section')
    expect(section).toMatchObject({
      b: 800,
      d: 800,
      main: { count: 22, size: 'D25' },
      // 帯筋 후보는 빈칸(S13) — 기존 값을 덮지 않는다
      hoop: { size: 'D10', pitch: 150, startOffsetMm: 50 },
    })
  })

  it('ignores a stale extraction that resolves after a newer file', async () => {
    let resolveSlow!: (pages: TextPage[]) => void
    const slow = new Promise<TextPage[]>((resolve) => {
      resolveSlow = resolve
    })
    const extractPages = vi
      .fn<(file: File) => Promise<TextPage[]>>()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce([{ widthPt: 100, heightPt: 100, items: [] }])
    render(<SectionImport extractPages={extractPages} />)
    const input = screen.getByTestId('section-import-file')

    fireEvent.change(input, {
      target: {
        files: [new File(['a'], 'slow.pdf', { type: 'application/pdf' })],
      },
    })
    fireEvent.change(input, {
      target: {
        files: [new File(['b'], 'fast.pdf', { type: 'application/pdf' })],
      },
    })

    expect(
      await screen.findByText('認識できる断面リストが見つかりません'),
    ).toBeVisible()

    // 먼저 고른 파일이 늦게 끝나도 나중 파일의 결과를 덮지 않는다
    await act(async () => {
      resolveSlow([yokohamaPage])
      await slow
    })
    expect(
      screen.queryByTestId('section-import-candidate-C51-2階'),
    ).toBeNull()
    expect(
      screen.getByText('認識できる断面リストが見つかりません'),
    ).toBeVisible()
  })

  it('renders parser issues through the locale layer', () => {
    // 파서는 이슈 코드만 싣는다 — ko 사용자에게 일본어 완성 문장이 노출되면 안 된다
    useAppStore.setState({ locale: 'ko' })
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C51-1階')
    expect(row).toHaveTextContent(
      '帯筋/あばら筋을 대응하는 철근 径으로 해석할 수 없습니다.',
    )
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
