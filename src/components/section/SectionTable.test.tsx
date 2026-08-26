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

  it('toggles each 大梁主筋 row between symmetric and asymmetric端部 counts', () => {
    render(<SectionTable />)

    const toggle = screen.getByLabelText('G1 上筋 左右で違う')
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    let section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.main.top.startCount).toBe(section.main.top.endCount)

    fireEvent.change(screen.getByLabelText('G1 主筋 上 始端 本数'), {
      target: { value: '6' },
    })
    fireEvent.change(screen.getByLabelText('G1 主筋 上 終端 本数'), {
      target: { value: '7' },
    })

    section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.main.top).toMatchObject({
      startCount: 6,
      endCount: 7,
      centerCount: 4,
    })

    fireEvent.click(screen.getByLabelText('G1 上筋 左右で違う'))
    section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.main.top).toEqual({
      endCount: 7,
      centerCount: 4,
    })
  })

  // 幅止め筋·腹筋은 断面一覧에 없으면 그 배근이 없다는 뜻이라 optional 이다
  // (ADR-012). 그래서 「なし → 径을 고름」과 「이미 있는 径을 바꿈」이 서로 다른
  // 경로를 타는데, 후자가 빠져 있었다 — 径을 두 번째로 고르면 값이 버려졌다.
  it('keeps a second 腹筋 径 change, not just the first', () => {
    render(<SectionTable />)

    const select = screen.getByLabelText('G1 腹筋 径')
    fireEvent.change(select, { target: { value: 'D10' } })
    fireEvent.change(screen.getByLabelText('G1 腹筋 本数'), {
      target: { value: '4' },
    })
    fireEvent.change(select, { target: { value: 'D13' } })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.sideBar?.size).toBe('D13')
    // 径을 바꿨다고 이미 입력한 本数가 씨앗값으로 되돌아가면 안 된다
    expect(section.sideBar?.count).toBe(4)
    expect(select).toHaveValue('D13')
  })

  it('keeps a second 幅止め筋 径 change and holds the pitch', () => {
    render(<SectionTable />)

    const select = screen.getByLabelText('G1 幅止め筋 径')
    fireEvent.change(select, { target: { value: 'D10' } })
    fireEvent.change(screen.getByLabelText('G1 幅止め筋 ピッチ'), {
      target: { value: '600' },
    })
    fireEvent.change(select, { target: { value: 'D13' } })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.widthTie?.size).toBe('D13')
    expect(section.widthTie?.pitch).toBe(600)
    expect(select).toHaveValue('D13')
  })

  // ADR-012 — 断面一覧の値は入力だ。あばら筋のピッチを種に借りると、利用者が
  // 幅止め筋について一度も入れていない数字が 1通則7) の割付本数を決めてしまう。
  it('does not borrow the あばら筋 pitch when 幅止め筋 is switched back on', () => {
    render(<SectionTable />)

    const select = screen.getByLabelText('G1 幅止め筋 径')
    fireEvent.change(select, { target: { value: '' } })
    fireEvent.change(select, { target: { value: 'D13' } })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    expect(section.widthTie?.pitch).toBe(0)
    expect(section.widthTie?.pitch).not.toBe(section.stirrup.pitch)
  })

  it('drops the field entirely when 腹筋 is set back to なし', () => {
    render(<SectionTable />)

    const select = screen.getByLabelText('G1 腹筋 径')
    fireEvent.change(select, { target: { value: 'D10' } })
    fireEvent.change(select, { target: { value: '' } })

    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === 'section-G1')
    if (section?.kind !== '大梁') throw new Error('Expected 大梁 section')
    // undefined 로 두는 게 아니라 키 자체가 없어야 한다 — 直列化했을 때
    // 「배근 없음」과 「입력 안 함」이 같은 모양이 된다 (ADR-012)
    expect('sideBar' in section).toBe(false)
  })

  it('locks the 腹筋 number inputs while the field is なし', () => {
    render(<SectionTable />)

    // 「なし」인 동안 열어 두면 updater 가 current 를 그대로 돌려주므로 입력이
    // 아무 흔적 없이 사라진다. 조용한 no-op 대신 막는다.
    // 샘플 断面은 腹筋을 가지므로 처음엔 열려 있다.
    expect(screen.getByLabelText('G1 腹筋 本数')).toBeEnabled()

    fireEvent.change(screen.getByLabelText('G1 腹筋 径'), {
      target: { value: '' },
    })

    expect(screen.getByLabelText('G1 腹筋 本数')).toBeDisabled()
    expect(screen.getByLabelText('G1 腹筋 余長')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('G1 腹筋 径'), {
      target: { value: 'D13' },
    })

    expect(screen.getByLabelText('G1 腹筋 本数')).toBeEnabled()
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
