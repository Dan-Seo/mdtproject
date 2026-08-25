import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import type { TextItem } from '@/lib/import/types'
import type { TextPage } from '@/lib/import/section-list/types'
import { useAppStore } from '@/lib/store'

import planFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p7.json'
import elevationFixture from '../../../tests/fixtures/section-import/textitems/yokohama-p8.json'

import { PlanImport } from './PlanImport'

const planPage: TextPage = { ...planFixture.page, items: planFixture.items }
const elevationPage: TextPage = {
  ...elevationFixture.page,
  items: elevationFixture.items,
}

function h(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 0, h: 8 }
}

function v(str: string, x: number, y: number): TextItem {
  return { str, x, y, w: 8, h: 0, rot: -90 }
}

function framingPage(xSpanMm: number, ySpanMm: number): TextPage {
  return {
    widthPt: 1000,
    heightPt: 1000,
    items: [
      h('X1', 0, -40),
      h('X2', 200, -40),
      h(String(xSpanMm), 100, -20),
      h('Y1', -40, 0),
      h('Y2', -40, 200),
      v(String(ySpanMm), -20, 100),
    ],
  }
}

beforeEach(() => {
  act(() => {
    useAppStore.setState({ project: createSampleProject() })
  })
})

function open(pages: TextPage[]) {
  render(<PlanImport initialPages={pages} />)
}

describe('PlanImport', () => {
  it('伏図에서 읽은 通り芯을 라벨과 스팬으로 보여준다', () => {
    open([planPage])

    const grid = screen.getByTestId('plan-import-grid-X-0')
    expect(grid.textContent).toContain('bX1')
    expect(grid.textContent).toContain('cX1')
    expect(grid.textContent).toContain('8700')
    expect(screen.getByTestId('plan-import-grid-Y-0').textContent).toContain(
      '10000',
    )
    expect(screen.queryByTestId('plan-import-section-story')).toBeNull()
  })

  it('断面一覧의 階 후보를 첫 등장 순서로 보여주고 기본값은 고르지 않음이다', () => {
    const base = createSampleProject()
    const source = base.sections.find((section) => section.kind === '柱')
    if (!source) throw new Error('sample has no 柱 section')

    act(() => {
      useAppStore.setState({
        project: {
          ...base,
          sections: [
            { ...source, id: 'section-C1-2階', mark: 'C1', storyLabel: '2階' },
            { ...source, id: 'section-C1-1階', mark: 'C1', storyLabel: '1階' },
            { ...source, id: 'section-C2-2階', mark: 'C2', storyLabel: '2階' },
          ],
        },
      })
    })

    open([framingPage(6000, 5000)])

    const picker = screen.getByTestId('plan-import-section-story')
    expect(picker).toHaveValue('')
    expect(
      [...picker.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['', '2階', '1階'])
  })

  it('모든 通り芯 후보와 블록마다 짝지어진 자기 通り芯을 보여준다', () => {
    open([framingPage(6000, 5000), framingPage(8000, 7000)])

    expect(screen.getByTestId('plan-import-grid-X-0').textContent).toContain(
      '6000',
    )
    expect(screen.getByTestId('plan-import-grid-X-1').textContent).toContain(
      '8000',
    )
    expect(screen.getByTestId('plan-import-grid-Y-0').textContent).toContain(
      '5000',
    )
    expect(screen.getByTestId('plan-import-grid-Y-1').textContent).toContain(
      '7000',
    )
    expect(
      screen.getByTestId('plan-import-block-grid-0-X').textContent,
    ).toContain('6000')
    expect(
      screen.getByTestId('plan-import-block-grid-0-Y').textContent,
    ).toContain('5000')
    expect(
      screen.getByTestId('plan-import-block-grid-1-X').textContent,
    ).toContain('8000')
    expect(
      screen.getByTestId('plan-import-block-grid-1-Y').textContent,
    ).toContain('7000')
    expect(
      [
        ...document.querySelectorAll(
          '[data-testid^="plan-import-block-grid-0-"]',
        ),
      ].map(
        (node) => node.getAttribute('data-testid'),
      ),
    ).toEqual(['plan-import-block-grid-0-X', 'plan-import-block-grid-0-Y'])
  })

  it('伏図 한 장마다 블록을 제목과 함께 보여준다', () => {
    open([planPage])

    expect(screen.getByText('2階床伏図1/100')).toBeTruthy()
    expect(screen.getByText('R階床伏図1/100')).toBeTruthy()
  })

  it('軸組図의 階高를 라벨과 함께 보여준다', () => {
    open([elevationPage])

    const elevation = screen.getByTestId('plan-import-elevation-0')
    expect(elevation.textContent).toContain('4480')
    expect(elevation.textContent).toContain('2FL')
    // 같은 높이의 라벨 둘은 둘 다 보인다 — 어느 쪽이 階인지 제품이 고르지 않는다
    expect(elevation.textContent).toContain('中央棟1FL')
    expect(elevation.textContent).toContain('基準GL')
  })

  it('読めなかった도면은 사유를 말한다 — 빈 화면으로 두지 않는다', () => {
    open([{ widthPt: 100, heightPt: 100, items: [] }])

    expect(screen.getByTestId('plan-import-issues').textContent).toBeTruthy()
  })

  it('다른 층에 부재가 있으면 通り芯을 말없이 바꾸지 않는다', async () => {
    // 샘플 案件에는 이미 여러 층의 부재가 있다. 격자 index는 스팬 배열에 매여
    // 있어서, 스팬을 바꾸면 손대지 않은 층이 조용히 다른 자리로 옮겨간다
    const before = useAppStore.getState().project
    open([planPage])

    fireEvent.click(screen.getByTestId('plan-import-apply-0'))

    await waitFor(() => {
      expect(screen.getByTestId('plan-import-result').textContent).toBeTruthy()
    })
    expect(useAppStore.getState().project.grid).toEqual(before.grid)
    // 동의를 묻는 칸은 거부를 본 뒤에 나온다
    expect(screen.getByTestId('plan-import-discard')).toBeTruthy()
  })

  it('동의하면 通り芯과 부재가 案件에 들어간다', async () => {
    open([planPage])

    fireEvent.click(screen.getByTestId('plan-import-apply-0'))
    await waitFor(() => screen.getByTestId('plan-import-discard'))
    fireEvent.click(screen.getByTestId('plan-import-discard'))
    fireEvent.click(screen.getByTestId('plan-import-apply-0'))

    await waitFor(() => {
      const { project } = useAppStore.getState()
      expect(project.grid.xSpans).toEqual([8700, 8700, 1200])
      expect(project.grid.ySpans).toEqual([5000, 6000, 10000, 6000, 5000])
    })
  })

  it('取入 결과를 넣지 못한 符号과 사유로 보고한다', async () => {
    open([planPage])

    fireEvent.click(screen.getByTestId('plan-import-apply-0'))
    await waitFor(() => screen.getByTestId('plan-import-discard'))
    fireEvent.click(screen.getByTestId('plan-import-discard'))
    fireEvent.click(screen.getByTestId('plan-import-apply-0'))

    await waitFor(() => {
      // 샘플 案件의 断面一覧에는 이 도면의 符号이 없다 — 지어내지 않고 사유를 말한다
      expect(screen.getByTestId('plan-import-result').textContent).toContain(
        'C51',
      )
    })
  })

  it('階高를 案件의 階로 넣는다 — 어느 레벨이 階인지는 사람이 고른다', async () => {
    open([elevationPage])

    // 中央棟1FL(index 3)에서 中央棟RCL(index 1)까지 → 1階 4480·2階 4100.
    // パラペット(1400)와 基礎(2690)는 階가 아니므로 범위 밖이다
    fireEvent.change(screen.getByTestId('plan-import-level-top-0'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByTestId('plan-import-level-bottom-0'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByTestId('plan-import-apply-elevation-0'))

    // 샘플 案件에 부재가 있어 한 번 거부된다 — 동의는 그 뒤에만 나온다
    await waitFor(() =>
      screen.getByTestId('plan-import-discard-members-0'),
    )
    fireEvent.click(screen.getByTestId('plan-import-discard-members-0'))
    fireEvent.click(screen.getByTestId('plan-import-apply-elevation-0'))

    await waitFor(() => {
      const { stories } = useAppStore.getState().project
      expect(stories.map((story) => story.height)).toEqual([4480, 4100])
      expect(stories.map((story) => story.name)).toEqual([
        '中央棟1FL／基準GL',
        '2FL',
      ])
    })
  })

  it('階高 반영 전에는 案件의 階를 건드리지 않는다', () => {
    const before = useAppStore.getState().project.stories
    open([elevationPage])

    expect(useAppStore.getState().project.stories).toBe(before)
  })

  it('PDF 읽기에 실패하면 案件을 건드리지 않고 말한다', async () => {
    const before = useAppStore.getState().project
    render(
      <PlanImport
        extractPages={vi.fn().mockRejectedValue(new Error('broken'))}
      />,
    )

    fireEvent.change(screen.getByTestId('plan-import-file'), {
      target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(useAppStore.getState().project).toBe(before)
  })
})
