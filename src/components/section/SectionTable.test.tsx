import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { SectionTable } from './SectionTable'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/telemetry', () => ({ capture }))

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

  it('keeps a user change to 継手方式 in Project', () => {
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('G1 継手方式'), {
      target: { value: 'ガス圧接' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    expect(section?.spliceMethod).toBe('ガス圧接')
    expect(screen.getByLabelText('G1 継手方式')).toHaveValue('ガス圧接')
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

  it('ignores an emptied 初期オフセット instead of committing 0', () => {
    // Number('')는 0이라 하한이 0인 필드에서는 빈 값이 통과한다 — 지우는 순간
    // 本数(=물량)가 사용자가 의도하지 않은 시점에 바뀐다.
    render(<SectionTable />)

    fireEvent.change(screen.getByLabelText('G1 あばら筋 初期オフセット'), {
      target: { value: '' },
    })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.stirrup.startOffsetMm).toBe(50)
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
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'section',
    })
  })

  // 행 안의 입력칸을 클릭해 편집만 해도 onClick이 버블링돼 selectSection이
  // 다시 불린다. 선택이 이미 그 부재였으면 member_selected가 또 나가선
  // 안 된다 — source별 선택 수 비교가 section 쪽으로 부푼다.
  it('does not re-report member_selected when the row is already selected', () => {
    render(<SectionTable />)

    fireEvent.click(screen.getByTestId('section-row-section-G2'))
    expect(capture).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('section-row-section-G2'))
    expect(capture).toHaveBeenCalledTimes(1)
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
