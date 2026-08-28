import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { applyStbGrid, applyStbStories } from '@/lib/import/stb/apply'
import type { StbSkeletonCandidate } from '@/lib/import/stb/types'
import { useAppStore } from '@/lib/store'
import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import { StbImport } from './StbImport'

function candidate(): StbSkeletonCandidate {
  return {
    version: '2.1.1',
    projectName: 'STB sample',
    grids: [
      {
        direction: 'X',
        groupName: 'X axes',
        axes: [{ label: 'X1' }, { label: 'X2' }],
        spansMm: [6000],
      },
      {
        direction: 'Y',
        groupName: 'Y axes',
        axes: [{ label: 'Y1' }, { label: 'Y2' }],
        spansMm: [5000],
      },
    ],
    stories: [
      { name: '1階', heightMm: 4000 },
      { name: 'RFL', heightMm: 3600 },
    ],
    unsupported: [{ name: 'StbArcAxes', count: 2 }],
    issues: ['対応外の階種別'],
  }
}

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
    })
  })
})

function open(initialCandidate = candidate()) {
  render(<StbImport initialCandidate={initialCandidate} />)
}

describe('StbImport', () => {
  it('shows the candidate and independently applies its grid and stories', async () => {
    const before = {
      ...useAppStore.getState().project,
      members: [],
    }
    act(() => useAppStore.setState({ project: before }))
    const expectedGrid = applyStbGrid(before, candidate()).project.grid
    const expectedStories = applyStbStories(before, candidate()).project.stories

    open()

    expect(screen.getByTestId('stb-import-file')).toHaveAttribute('accept', '.stb')
    expect(screen.getByTestId('stb-import-version')).toHaveTextContent('2.1.1')
    expect(screen.getByTestId('stb-import-project-name')).toHaveTextContent(
      'STB sample',
    )
    expect(screen.getByTestId('stb-import-grid-X')).toHaveTextContent('X1')
    expect(screen.getByTestId('stb-import-grid-X')).toHaveTextContent('6000')
    expect(screen.getByTestId('stb-import-stories')).toHaveTextContent('1階')
    expect(screen.getByTestId('stb-import-stories')).toHaveTextContent('4000')

    fireEvent.click(screen.getByTestId('stb-import-apply-grid'))
    fireEvent.click(screen.getByTestId('stb-import-apply-stories'))

    await waitFor(() => {
      expect(useAppStore.getState().project.grid).toEqual(expectedGrid)
      expect(useAppStore.getState().project.stories).toEqual(expectedStories)
    })
    expect(useAppStore.getState().project.name).toBe(before.name)
    expect(screen.getByTestId('stb-import-grid-result')).toHaveTextContent('2')
    expect(screen.getByTestId('stb-import-stories-result')).toHaveTextContent('2')
  })

  it('keeps issues and unsupported elements visible after approval', async () => {
    open()

    fireEvent.click(screen.getByTestId('stb-import-apply-grid'))
    fireEvent.click(screen.getByTestId('stb-import-apply-stories'))

    await waitFor(() => {
      expect(screen.getByTestId('stb-import-issues')).toHaveTextContent(
        '対応していない階種別です',
      )
    })
    expect(screen.getByTestId('stb-import-unsupported')).toHaveTextContent(
      'StbArcAxes',
    )
    expect(screen.getByTestId('stb-import-unsupported')).toHaveTextContent('2')
  })

  it('does not change the project until grid discard is explicitly confirmed', async () => {
    const before = useAppStore.getState().project
    open()

    fireEvent.click(screen.getByTestId('stb-import-apply-grid'))

    await waitFor(() => {
      expect(screen.getByTestId('stb-import-grid-result')).toHaveTextContent(
        '部材があるため通り芯を置き換えられません',
      )
    })
    expect(useAppStore.getState().project).toBe(before)
    expect(screen.getByTestId('stb-import-discard-grid')).not.toBeChecked()

    fireEvent.click(screen.getByTestId('stb-import-discard-grid'))
    fireEvent.click(screen.getByTestId('stb-import-apply-grid'))

    await waitFor(() => {
      expect(useAppStore.getState().project.grid).toEqual(
        applyStbGrid(before, candidate(), { discardMembers: true }).project.grid,
      )
    })
    expect(useAppStore.getState().project.members).toEqual([])
    expect(useAppStore.getState().project.name).toBe(before.name)
  })

  it('does not change the project until story discard is explicitly confirmed', async () => {
    const before = useAppStore.getState().project
    open()

    fireEvent.click(screen.getByTestId('stb-import-apply-stories'))

    await waitFor(() => {
      expect(screen.getByTestId('stb-import-stories-result')).toHaveTextContent(
        '部材があるため階を置き換えられません',
      )
    })
    expect(useAppStore.getState().project).toBe(before)
    expect(screen.getByTestId('stb-import-discard-stories')).not.toBeChecked()

    fireEvent.click(screen.getByTestId('stb-import-discard-stories'))
    fireEvent.click(screen.getByTestId('stb-import-apply-stories'))

    await waitFor(() => {
      expect(useAppStore.getState().project.stories).toEqual(
        applyStbStories(before, candidate(), { discardMembers: true }).project
          .stories,
      )
    })
    expect(useAppStore.getState().project.members).toEqual([])
    expect(useAppStore.getState().project.name).toBe(before.name)
  })

  it('does not render an approval button for an empty grid or story candidate', () => {
    open({ ...candidate(), grids: [], stories: [] })

    expect(screen.queryByTestId('stb-import-apply-grid')).toBeNull()
    expect(screen.queryByTestId('stb-import-apply-stories')).toBeNull()
  })

  it('renders in both locales and keeps the new key set symmetric', () => {
    const keys = [
      'stbImport.open',
      'stbImport.file',
      'stbImport.title',
      'stbImport.chooseAnother',
      'stbImport.close',
      'stbImport.loading',
      'stbImport.error',
      'stbImport.version',
      'stbImport.projectName',
      'stbImport.grids',
      'stbImport.gridX',
      'stbImport.gridY',
      'stbImport.stories',
      'stbImport.height',
      'stbImport.applyGrid',
      'stbImport.applyStories',
      'stbImport.discardMembersGrid',
      'stbImport.discardMembersStories',
      'stbImport.appliedGrid',
      'stbImport.appliedStories',
      'stbImport.unsupported',
      'stbImport.issues',
      'stbImport.none',
      'stbImport.refusal.通り芯候補なし',
      'stbImport.refusal.階候補なし',
      'stbImport.refusal.部材あり通り芯置換不可',
      'stbImport.refusal.部材あり階置換不可',
    ] as const

    for (const key of keys) {
      expect(ja[key], `ja is missing ${key}`).toBeTruthy()
      expect(ko[key], `ko is missing ${key}`).toBeTruthy()
    }

    open()
    expect(screen.getByTestId('stb-import-title')).toHaveTextContent(
      'ST-Bridgeから骨格を読む',
    )

    act(() => useAppStore.getState().setLocale('ko'))
    expect(screen.getByTestId('stb-import-title')).toHaveTextContent(
      'ST-Bridge에서 골격 읽기',
    )
  })
})
