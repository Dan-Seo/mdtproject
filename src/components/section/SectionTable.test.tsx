import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { SectionTable } from './SectionTable'

describe('SectionTable', () => {
  beforeEach(() => {
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

  it('keeps a user change to かぶり条件 in Project', () => {
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('C1 屋内外'), {
      target: { value: '屋内' },
    })
    fireEvent.change(screen.getByLabelText('C1 仕上げ'), {
      target: { value: '仕上げあり' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-C1')
    expect(section).toMatchObject({
      exposure: '屋内',
      finish: '仕上げあり',
    })
    expect(screen.getByLabelText('C1 屋内外')).toHaveValue('屋内')
    expect(screen.getByLabelText('C1 仕上げ')).toHaveValue('仕上げあり')
  })

  it('selects a representative member when a section row is clicked', () => {
    render(<SectionTable />)

    fireEvent.click(screen.getByTestId('section-row-section-G2'))

    expect(useAppStore.getState().sel.group).toBe('1階|G|G2')
    expect(useAppStore.getState().sel.memberId).toBe(
      '1F-G2-X1Y2-X',
    )
  })

  it('follows a selection changed outside the section pane', () => {
    render(<SectionTable />)

    act(() => useAppStore.getState().selectMember('1F-G2-X1Y2-X'))

    expect(screen.getByTestId('section-row-section-G2')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
