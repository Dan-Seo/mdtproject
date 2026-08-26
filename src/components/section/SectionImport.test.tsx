import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import type { WallSection } from '@/domain/model/member'
import type { TextPage } from '@/lib/import/section-list/types'
import { useAppStore } from '@/lib/store'

import ojkkGirderFixture from '../../../tests/fixtures/section-import/textitems/ojkk-p3.json'
import yokohamaFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p13.json'
import yokohamaGirderFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p14.json'
import ojkkWallSlabFixture from '../../../tests/fixtures/section-import/textitems/ojkk-p4.json'
import { SectionImport } from './SectionImport'

const ojkkGirderPage: TextPage = {
  ...ojkkGirderFixture.page,
  items: ojkkGirderFixture.items,
}

const yokohamaPage: TextPage = {
  ...yokohamaFixture.page,
  items: yokohamaFixture.items,
}

/**
 * 大梁リストの頁。未解析の欄が残る候補がこちらにしかないので、その系統の
 * テストはこの頁を読む — 柱リストは高強度せん断補強筋 (ADR-026) と円形柱
 * (ADR-027) が入って全欄が埋まった。
 */
const yokohamaGirderPage: TextPage = {
  ...yokohamaGirderFixture.page,
  items: yokohamaGirderFixture.items,
}

const ojkkWallSlabPage: TextPage = {
  ...ojkkWallSlabFixture.page,
  items: ojkkWallSlabFixture.items,
}

/** 타이틀은 읽히고 符号 행만 인식되지 않는 표. */
const headerlessPage: TextPage = {
  widthPt: 400,
  heightPt: 200,
  items: [
    { str: '柱断面リスト', x: 10, y: 5, w: 70, h: 8 },
    { str: '記号', x: 10, y: 20, w: 20, h: 8 },
    { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
  ],
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

  it('clones the same 符号 of another 階 rather than the first 柱', () => {
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
            shape: '矩形',
            storyLabel: '1階',
            b: 800,
            d: 800,
            fc: 30,
            grade: 'SD390',
            exposure: '屋内',
            finish: '仕上げあり',
            spliceMethod: '重ね継手',
            main: { size: 'D25', count: 22 },
            hoop: { size: 'D13', pitch: 100, startOffsetMm: 50 },
          },
        ],
      },
    })
    render(<SectionImport initialPages={[yokohamaPage]} />)

    const row = screen.getByTestId('section-import-candidate-C51-2階')
    // 복제원은 무관한 C1이 아니라 같은 符号의 다른 階다 — 파싱되지 않는
    // fc·강종·노출·初期オフセット은 같은 기둥 쪽이 맞을 확률이 높다
    expect(row).toHaveTextContent(
      '未解析の欄はC51(1階)（fc30・SD390・屋内/仕上げあり・初期オフセット50mm）から複製',
    )

    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'C51' && storyLabel === '2階',
      )
    if (section?.kind !== '柱') throw new Error('Expected imported 柱 section')
    expect(section.fc).toBe(30)
    expect(section.grade).toBe('SD390')
    expect(section.hoop.startOffsetMm).toBe(50)
  })

  it('blocks approval for a new mark with unparsed fields', () => {
    const before = useAppStore.getState().project
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    // G51 R階는 端部 主筋이 좌우로 다르다(外端 8-D25 / 内端 13-D25) — 어느 쪽이
    // 런의 始端인지 정할 수 없어 빈칸이므로 신규 符号로는 반영 불가다 (R13)
    const row = screen.getByTestId('section-import-candidate-G51-R階')
    expect(row).toHaveTextContent('13-D25')
    const apply = within(row).getByRole('button', { name: '反映' })
    expect(apply).toBeDisabled()
    expect(row).toHaveTextContent(
      '未解析の欄がある新規符号は反映できません（原文を参照）',
    )

    fireEvent.click(apply)
    expect(useAppStore.getState().project).toBe(before)
  })

  it('automatically maps 通り芯型端部 labels to 始端 by grid order', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        grid: { ...base.grid, yLabels: ['Y1', 'Y 2', 'Y3'] },
      },
    })
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G55-R階')
    const direction = within(row).getByTestId(
      'section-import-girder-direction-G55',
    )
    expect(direction).toHaveValue('first')
    expect(row).toHaveTextContent('通り芯ラベルの順序で自動決定')
    expect(within(row).getByRole('button', { name: '反映' })).not.toBeDisabled()

    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G55' && storyLabel === 'R階',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.main).toMatchObject({
      size: 'D25',
      top: { startCount: 4, centerCount: 5, endCount: 8 },
      bottom: { startCount: 4, centerCount: 5, endCount: 5 },
    })
  })

  it('reverses automatic 始端 mapping when grid labels are reversed', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        grid: { ...base.grid, yLabels: ['Y3', 'Y2', 'Y1'] },
      },
    })
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G55-R階')
    expect(
      within(row).getByTestId('section-import-girder-direction-G55'),
    ).toHaveValue('second')
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G55' && storyLabel === 'R階',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.main.top).toMatchObject({
      startCount: 8,
      centerCount: 5,
      endCount: 4,
    })
  })

  it('requires a manual 始端 choice when Grid has no matching labels', () => {
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G55-R階')
    const direction = within(row).getByTestId(
      'section-import-girder-direction-G55',
    )
    expect(direction).toHaveValue('')
    expect(row).not.toHaveTextContent('通り芯ラベルの順序で自動決定')
    expect(within(row).getByRole('button', { name: '反映' })).toBeDisabled()

    fireEvent.change(direction, { target: { value: 'second' } })
    expect(within(row).getByRole('button', { name: '反映' })).not.toBeDisabled()
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G55' && storyLabel === 'R階',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.main.top).toMatchObject({
      startCount: 8,
      centerCount: 5,
      endCount: 4,
    })
  })

  it('does not auto-resolve 外端/内端 labels and applies cutoff with manual choice', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        grid: { ...base.grid, xLabels: ['外', '内'] },
      },
    })
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G51-R階')
    const direction = within(row).getByTestId(
      'section-import-girder-direction-G51',
    )
    expect(direction).toHaveValue('')
    expect(row).not.toHaveTextContent('通り芯ラベルの順序で自動決定')
    expect(within(row).getByRole('button', { name: '反映' })).toBeDisabled()

    fireEvent.change(direction, { target: { value: 'first' } })
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G51' && storyLabel === 'R階',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.main).toMatchObject({
      size: 'D25',
      top: { startCount: 8, centerCount: 8, endCount: 13 },
      bottom: { startCount: 8, centerCount: 8, endCount: 11 },
      cutoffFromSupportFaceMm: 2500,
    })
  })

  it('applies asymmetric fields and preserves other existing story-scoped values', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        sections: [
          ...base.sections,
          {
            id: 'section-G51-RF',
            kind: '大梁',
            mark: 'G51',
            storyLabel: 'R階',
            b: 500,
            depth: 700,
            fc: 24,
            grade: 'SD345',
            exposure: '屋内',
            finish: '仕上げあり',
            spliceMethod: '重ね継手',
            main: {
              size: 'D22',
              top: { endCount: 4, centerCount: 4 },
              bottom: { endCount: 4, centerCount: 4 },
              cutoffFromSupportFaceMm: 1500,
            },
            stirrup: { size: 'D10', pitch: 150, startOffsetMm: 50 },
          },
        ],
      },
    })
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G51-R階')
    fireEvent.change(
      within(row).getByTestId('section-import-girder-direction-G51'),
      { target: { value: 'first' } },
    )
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G51' && storyLabel === 'R階',
      )
    expect(section?.kind).toBe('大梁')
    if (section?.kind !== '大梁') throw new Error('Expected existing 大梁 section')
    expect(section).toMatchObject({
      b: 650,
      depth: 800,
      // 비대칭 主筋은 수동으로 始端을 정한 뒤 반영한다.
      main: {
        size: 'D25',
        top: { startCount: 8, centerCount: 8, endCount: 13 },
        bottom: { startCount: 8, centerCount: 8, endCount: 11 },
        cutoffFromSupportFaceMm: 2500,
      },
      stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
    })
  })

  it('applies ojkk 腹筋 and 幅止め筋 onto an existing 大梁 section', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        sections: base.sections.map((section) => {
          if (section.kind !== '大梁' || section.mark !== 'G1') return section
          const next = { ...section, storyLabel: 'RF' }
          delete next.sideBar
          delete next.widthTie
          return next
        }),
      },
    })
    render(<SectionImport initialPages={[ojkkGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G1-RF')
    expect(row).toHaveTextContent('腹筋 2-D10')
    expect(row).toHaveTextContent('幅止め筋 D10@1000')
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G1' && storyLabel === 'RF',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.sideBar).toEqual({
      size: 'D10',
      count: 2,
      extraLengthMm: 0,
    })
    expect(section.widthTie).toEqual({ size: 'D10', pitch: 1000 })
  })

  it('keeps the entered 腹筋 余長 while updating parsed size and count', () => {
    const base = createSampleProject()
    useAppStore.setState({
      project: {
        ...base,
        sections: base.sections.map((section) =>
          section.kind === '大梁' && section.mark === 'G1'
            ? {
                ...section,
                storyLabel: 'RF',
                sideBar: {
                  size: 'D13',
                  count: 4,
                  extraLengthMm: 120,
                },
              }
            : section,
        ),
      },
    })
    render(<SectionImport initialPages={[ojkkGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G1-RF')
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(
        ({ mark, storyLabel }) => mark === 'G1' && storyLabel === 'RF',
      )
    if (section?.kind !== '大梁') throw new Error('Expected imported 大梁 section')
    expect(section.sideBar).toEqual({
      size: 'D10',
      count: 2,
      extraLengthMm: 120,
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
    render(<SectionImport initialPages={[yokohamaGirderPage]} />)

    const row = screen.getByTestId('section-import-candidate-G51-R階')
    expect(row).toHaveTextContent(
      '양단의 主筋이 서로 달라 어느 쪽이 시작단인지 정할 수 없어 빈칸으로 두었습니다.',
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

  it('distinguishes a recognized list with no 符号 row from no list at all', () => {
    render(<SectionImport initialPages={[headerlessPage]} />)

    // 「리스트 자체가 없다」와 「리스트는 찾았지만 符号 행을 못 읽었다」는
    // 사용자가 할 일이 다르다 — 후자는 원도의 그 표를 확인하면 된다
    expect(
      screen.getByText(/符号の行を認識できませんでした/),
    ).toHaveTextContent('柱断面リスト')
    expect(
      screen.queryByText('認識できる断面リストが見つかりません'),
    ).toBeNull()
  })

  it('applies 端部欄 as 位置別 主筋本数 onto the 大梁 section', () => {
    render(
      <SectionImport
        initialPages={[
          {
            widthPt: 480,
            heightPt: 240,
            items: [
              { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
              { str: '符号', x: 10, y: 20, w: 20, h: 8 },
              { str: 'G1', x: 140, y: 20, w: 12, h: 8 },
              { str: '位置', x: 10, y: 32, w: 20, h: 8 },
              { str: '端部', x: 90, y: 32, w: 20, h: 8 },
              { str: '中央', x: 200, y: 32, w: 20, h: 8 },
              { str: '上筋', x: 10, y: 56, w: 20, h: 8 },
              { str: '5-D25', x: 90, y: 56, w: 32, h: 8 },
              { str: '4-D25', x: 200, y: 56, w: 32, h: 8 },
              { str: '下筋', x: 10, y: 70, w: 20, h: 8 },
              { str: '4-D25', x: 90, y: 70, w: 32, h: 8 },
              { str: '4-D25', x: 200, y: 70, w: 32, h: 8 },
            ],
          },
        ]}
      />,
    )

    const before = useAppStore
      .getState()
      .project.sections.find(({ mark }) => mark === 'G1')
    if (before?.kind !== '大梁') throw new Error('Expected 大梁 section')
    const cutoffBefore = before.main.cutoffFromSupportFaceMm
    const sideBarBefore = before.sideBar
    const widthTieBefore = before.widthTie

    const row = screen.getByTestId('section-import-candidate-G1-none')
    expect(row).toHaveTextContent('端部 上5・下4')
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(({ mark }) => mark === 'G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.main).toMatchObject({
      size: 'D25',
      top: { endCount: 5, centerCount: 4 },
      bottom: { endCount: 4, centerCount: 4 },
    })
    // カットオフ位置は断面リストから読まない — 反映が元の入力を
    // 動かさないことを見る。埋めれば図面にない長さで質量を出す。
    expect(section.main.cutoffFromSupportFaceMm).toBe(cutoffBefore)
    // 후보의 undefined는 「없음」과 「못 읽음」을 구분하지 못하므로 기존 수기 입력을
    // 지우지 않는다. phase 6의 「빈칸은 기존값 유지」 규약이다.
    expect(section.sideBar).toEqual(sideBarBefore)
    expect(section.widthTie).toEqual(widthTieBefore)
  })

  it('does not allow a new 床板 candidate before its direction is selected', () => {
    render(<SectionImport initialPages={[ojkkWallSlabPage]} />)

    const row = screen.getByTestId('section-import-candidate-FS4-none')
    expect(
      within(row).getByTestId('section-import-slab-direction-FS4'),
    ).toHaveValue('')
    expect(within(row).getByRole('button', { name: '反映' })).toBeDisabled()
    expect(
      useAppStore.getState().project.sections.some(({ mark }) => mark === 'FS4'),
    ).toBe(false)
  })

  it.each([
    ['x', 100, 150],
    ['y', 150, 100],
  ] as const)(
    'maps 短辺 to the selected %s direction and 長辺 to the other direction',
    (direction, xPitch, yPitch) => {
      render(<SectionImport initialPages={[ojkkWallSlabPage]} />)

      const row = screen.getByTestId('section-import-candidate-FS4-none')
      fireEvent.change(
        within(row).getByTestId('section-import-slab-direction-FS4'),
        { target: { value: direction } },
      )
      expect(within(row).getByRole('button', { name: '反映' })).not.toBeDisabled()
      fireEvent.click(within(row).getByRole('button', { name: '反映' }))

      const section = useAppStore
        .getState()
        .project.sections.find(({ mark }) => mark === 'FS4')
      expect(section?.kind).toBe('床板')
      if (section?.kind !== '床板') throw new Error('Expected imported 床板 section')
      expect(section).toMatchObject({
        thickness: 150,
        x: {
          top: { size: 'D13', pitch: xPitch },
          bottom: { size: 'D10', pitch: xPitch },
        },
        y: {
          top: { size: 'D13', pitch: yPitch },
          bottom: { size: 'D10', pitch: yPitch },
        },
      })
    },
  )

  it('blocks a new 壁 candidate when its thickness is unparsed', () => {
    render(<SectionImport initialPages={[ojkkWallSlabPage]} />)

    const row = screen.getByTestId('section-import-candidate-EW15-none')
    expect(within(row).getByRole('button', { name: '反映' })).toBeDisabled()
    expect(row).toHaveTextContent(
      '未解析の欄がある新規符号は反映できません（原文を参照）',
    )
  })

  it('preserves existing WallSection fields when applying parsed wall fields', () => {
    const base = createSampleProject()
    const existing: WallSection = {
      id: 'section-EW15',
      kind: '耐震壁',
      mark: 'EW15',
      thickness: 240,
      fc: 30,
      grade: 'SD390',
      exposure: '屋外',
      finish: '仕上げなし',
      spliceMethod: '重ね継手',
      layers: 2,
      vertical: { size: 'D13', pitch: 250, startOffsetMm: 40 },
      horizontal: { size: 'D13', pitch: 250, startOffsetMm: 60 },
    }
    useAppStore.setState({
      project: { ...base, sections: [...base.sections, existing] },
    })

    render(<SectionImport initialPages={[ojkkWallSlabPage]} />)
    const row = screen.getByTestId('section-import-candidate-EW15-none')
    expect(within(row).getByRole('button', { name: '反映' })).not.toBeDisabled()
    fireEvent.click(within(row).getByRole('button', { name: '反映' }))

    const section = useAppStore
      .getState()
      .project.sections.find(({ mark }) => mark === 'EW15')
    expect(section?.kind).toBe('耐震壁')
    if (section?.kind !== '耐震壁') throw new Error('Expected existing 耐震壁 section')
    expect(section).toMatchObject({
      thickness: 240,
      fc: 30,
      grade: 'SD390',
      exposure: '屋外',
      finish: '仕上げなし',
      layers: 1,
      vertical: { size: 'D10', pitch: 150, startOffsetMm: 40 },
      horizontal: { size: 'D10', pitch: 150, startOffsetMm: 60 },
    })
  })

  it('names the unreadable list even when another list produced candidates', () => {
    render(<SectionImport initialPages={[yokohamaPage, headerlessPage]} />)

    // 부분 실패가 가장 위험하다 — 다른 표가 읽히면 실패한 표는 화면에서
    // 사라지고 사용자는 그 표를 반영했다고 믿는다
    expect(screen.getByTestId('section-import-candidate-C51-2階')).toBeVisible()
    expect(
      screen.getByText(/符号の行を認識できませんでした/),
    ).toHaveTextContent('柱断面リスト')
  })

  it('points at the item rows when the 符号 header was read but nothing else', () => {
    render(
      <SectionImport
        initialPages={[
          {
            widthPt: 400,
            heightPt: 200,
            items: [
              { str: '大梁断面リスト', x: 10, y: 5, w: 80, h: 8 },
              { str: '符号', x: 10, y: 20, w: 20, h: 8 },
              { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
              { str: 'RC規格', x: 10, y: 34, w: 30, h: 8 },
              { str: 'A種', x: 115, y: 34, w: 20, h: 8 },
            ],
          },
        ]}
      />,
    )

    // 符号은 읽었다 — 「符号 행을 못 읽었다」로 안내하면 엉뚱한 곳을 보게 된다
    expect(
      screen.getByText(/項目の行を認識できませんでした/),
    ).toHaveTextContent('大梁断面リスト')
    expect(screen.queryByText(/符号の行を認識できませんでした/)).toBeNull()
  })
})
