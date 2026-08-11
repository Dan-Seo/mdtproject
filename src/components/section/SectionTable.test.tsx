import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { SectionTable } from './SectionTable'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('posthog-js', () => ({ default: { capture } }))

describe('SectionTable', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  it('keeps a user change to 柱 主筋 count in Project', () => {
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('C1 主筋 本数'), {
      target: { value: '10' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-C1')
    expect(section?.kind).toBe('柱')
    if (section?.kind !== '柱') throw new Error('Expected 柱 section')
    expect(section.main.count).toBe(10)
    expect(screen.getByLabelText('C1 主筋 本数')).toHaveValue(10)
  })

  it('selects a representative member when a section row is clicked', () => {
    render(<SectionTable />)

    fireEvent.click(screen.getByTestId('section-row-section-G2'))

    expect(useAppStore.getState().sel.group).toBe('1階|G|G2')
    expect(useAppStore.getState().sel.memberId).toBe(
      '1F-G2-X1Y2-X',
    )
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'section',
    })
  })

  it('follows a selection changed outside the section pane', () => {
    render(<SectionTable />)

    act(() => useAppStore.getState().selectMember('1F-G2-X1Y2-X'))

    expect(screen.getByTestId('section-row-section-G2')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  // 断面表의 입력은 onChange라 키 입력마다 들어온다. 필요한 것은 편집 횟수가 아니라
  // "이 세션에서 断面表를 손댔는가"이므로, 타이핑이 이벤트 폭주가 되면 안 된다.
  it('reports the section edit once however many keystrokes land', () => {
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('C1 符号'), {
      target: { value: 'C2' },
    })
    fireEvent.change(screen.getByLabelText('C2 符号'), {
      target: { value: 'C3' },
    })
    // 符号를 고쳤으니 파생 라벨도 따라 바뀐다.
    fireEvent.change(screen.getByLabelText('C3 主筋 本数'), {
      target: { value: '10' },
    })

    expect(
      capture.mock.calls.filter(([name]) => name === 'section_edited'),
    ).toHaveLength(1)
  })
})
