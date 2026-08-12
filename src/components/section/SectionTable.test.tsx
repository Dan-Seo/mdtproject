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

  it('keeps a user change to あばら筋 初期オフセット in Project', () => {
    // 規準에 값이 없는 배치값이므로 룰팩이 아니라 断面一覧이 정한다 (ADR-012).
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('G1 あばら筋 初期オフセット'), {
      target: { value: '75' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.stirrup.startOffsetMm).toBe(75)
  })

  it('keeps a user change to 帯筋 初期オフセット in Project', () => {
    // 帯筋 오프셋도 本数(=물량)를 좌우하므로 제품 상수가 아니라 입력이다.
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('C1 帯筋 初期オフセット'), {
      target: { value: '50' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-C1')
    if (section?.kind !== '柱') throw new Error('Expected 柱 section')
    expect(section.hoop.startOffsetMm).toBe(50)
  })

  it('accepts 0 for 初期オフセット, unlike 寸法・ピッチ fields', () => {
    // 柱의 기본값이 0이다 — min=1인 공용 입력을 그대로 쓰면 입력조차 못 한다.
    render(<SectionTable />)

    const offset = screen.getByLabelText('G1 あばら筋 初期オフセット')
    expect(offset).toHaveAttribute('min', '0')
    fireEvent.change(offset, { target: { value: '0' } })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.stirrup.startOffsetMm).toBe(0)
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
