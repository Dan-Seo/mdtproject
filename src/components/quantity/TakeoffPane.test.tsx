import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setUnitMass } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import {
  grandTotal,
  massLines,
  spliceLines,
  storySubtotals,
} from '@/domain/quantity'
import { exportTakeoffXlsx } from '@/lib/export'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'

import {
  TakeoffActions,
  TakeoffPane,
  TakeoffTable,
} from './TakeoffPane'

vi.mock('@/lib/export', () => ({
  exportTakeoffXlsx: vi.fn().mockResolvedValue(undefined),
}))

const { capture, captureException } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/telemetry', () => ({ capture, captureException }))

function takeoffLines() {
  const { result } = renderHook(() => useTakeoff())
  return result.current.lines
}

/**
 * 単位質量は利用者入力なので、サンプル案件には入っていない。質量列を見る
 * テストはまずこれを呼ぶ — 合成値 1 kg/m なら設計数量は総延長(m)そのものだ。
 */
function enterUnitMass(value = 1) {
  const sizes = [...new Set(massLines(takeoffLines()).map(({ size }) => size))]

  act(() => {
    useAppStore
      .getState()
      .updateProject((project) =>
        sizes.reduce((next, size) => setUnitMass(next, size, value), project),
      )
  })
}

function takeoffResult() {
  const { result } = renderHook(() => useTakeoff())
  return result.current
}

// 行 id は加工長・本数まで含むので、書き下さずに集計結果から引く。
function lineFor(role: '主筋' | '帯筋' | '上端筋') {
  const groupId = role === '上端筋' ? '1階|G|G1' : '1階|C|C1'
  const line = massLines(takeoffLines()).find(
    (candidate) => candidate.groupId === groupId && candidate.role === role,
  )

  if (!line) throw new Error(`QuantityLine not found: ${role}`)
  return line
}

const UNAVAILABLE_SOURCE = '有償規格'

/**
 * 原文URLを持たない出典（有償規格など）はリンクにできない。今のルールパックは
 * 全行がURLを持つので、その表示は合成のルール行で確かめる。
 */
function lineWithUnavailableSource() {
  const line = lineFor('主筋')
  const [cited] = line.rules

  return {
    ...line,
    rules: [
      {
        ...cited,
        source: {
          ...cited.source,
          short: UNAVAILABLE_SOURCE,
          section: null,
          page: null,
          url: null,
        },
      },
    ],
  }
}

function spliceLineFor(role: '主筋' | '上端筋') {
  const groupId = role === '上端筋' ? '1階|G|G1' : '1階|C|C1'
  const line = spliceLines(takeoffLines()).find(
    (candidate) => candidate.groupId === groupId && candidate.role === role,
  )

  if (!line) throw new Error(`継手 QuantityLine not found: ${role}`)
  return line
}

describe('TakeoffPane', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
    })

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.mocked(exportTakeoffXlsx).mockClear()
    capture.mockClear()
    captureException.mockClear()
  })

  it('renders the DESIGN §4 headers in order with the 単位 column', () => {
    render(<TakeoffPane />)

    const headers = within(screen.getByTestId('takeoff-head'))
      .getAllByRole('columnheader')
      .map((header) => header.textContent)

    expect(headers).toEqual([
      '鉄筋',
      '径',
      '形状',
      '長さ (m)',
      '本数',
      '箇所',
      '総延長 (m)',
      'kg/m',
      // 単位が kg と箇所に分かれたので、見出しから (kg) を外して単位列を持つ。
      '設計数量',
      '所要数量',
      '単位',
      '出典',
      '備考',
    ])
  })

  it('formats 長さ in metres with three decimal places', () => {
    const lines = takeoffLines()
    const line = lineFor('主筋')

    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent(
      (line.lengthMm / 1000).toFixed(3),
    )
  })

  it('localises the 形状 label instead of hardcoding Japanese', () => {
    const lines = takeoffLines()
    const lineId = lineFor('主筋').id
    useAppStore.setState({ locale: 'ko' })

    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    expect(within(row).getByLabelText('직선')).toBeInTheDocument()
    expect(within(row).queryByLabelText('直線')).not.toBeInTheDocument()
  })

  it('renders continuous 大梁 rows without a stale 連続スパン notice', () => {
    const { lines, unsupportedMembers } = takeoffResult()
    const supportedGirderLines = lines.filter(
      ({ groupId }) => groupId === '1階|G|G1',
    )

    render(<TakeoffPane />)

    // arrayContaining은 상위집합이면 통과한다 — 通し筋이 런당 1행이 아니라
    // 부재당 1행으로 중복 생성되는 회귀를 못 잡는다. 행 구성을 그대로 박는다.
    // 単スパンのランは 1通則4) で 0か所なので継手行を持たず、2スパンのランだけが持つ。
    expect(
      supportedGirderLines.map(({ role, unit }) => `${role}:${unit}`),
    ).toEqual([
      '上端筋:kg',
      '上端筋:箇所',
      '下端筋:kg',
      '下端筋:箇所',
      'あばら筋:kg',
      '幅止め筋:kg',
      '腹筋:kg',
      '上端筋:kg',
      '上端筋:箇所',
      '下端筋:kg',
      '下端筋:箇所',
    ])
    for (const line of supportedGirderLines) {
      expect(screen.getByTestId(`quantity-line-${line.id}`)).toBeInTheDocument()
    }

    expect(unsupportedMembers).toHaveLength(0)
    // 未対応部材 고지만 없어야 한다. role='note' 전체를 막으면 継手 미계상처럼
    // 정당한 고지가 새로 붙을 때 이 테스트가 그걸 막는 쪽으로 작동한다.
    expect(
      screen.queryByTestId('unsupported-plan'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/未対応部材/)).not.toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getAllByTestId(/^quantity-line-/)).toHaveLength(
      lines.length,
    )
    expect(within(table).queryByText('連続スパン')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        '大梁の配筋は M3 で対応予定 — 現在の数量には含まれません。',
      ),
    ).not.toBeInTheDocument()
  })

  it('states a follow-up per reason instead of claiming M3b for all', () => {
    // 定着 불성립은 通し筋으로 해소되지 않는다 — 전 건에 「M3b で対応予定」을
    // 붙이면 고지가 거짓이 된다.
    useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.kind === '柱' ? { ...section, b: 300, d: 300 } : section,
      ),
    }))

    render(<TakeoffPane />)

    // 継手位置 고지도 role=note라 역할만으로는 좁혀지지 않는다.
    const notice = screen.getByTestId('unsupported-notice')
    expect(notice).toHaveTextContent('定着が支点柱に収まらない')
    expect(notice).not.toHaveTextContent('M3b')
    expect(notice).toHaveTextContent('見直し')
  })

  it('does not retain the removed 連続スパン follow-up', () => {
    useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.kind === '柱' ? { ...section, b: 300, d: 300 } : section,
      ),
    }))

    render(<TakeoffPane />)

    const plan = screen.getByTestId('unsupported-plan')
    expect(plan.textContent?.split(' / ')).toHaveLength(1)
    expect(plan).not.toHaveTextContent('連続スパン')
    expect(plan).not.toHaveTextContent('M3b')
  })

  it('omits the unsupported-member notice when every member is supported', () => {
    // 柱만 남기면 beamDepthAbove가 실패하므로, 부재가 없는 신규 안건 상태로 본다.
    useAppStore.setState({
      project: { ...createSampleProject(), members: [] },
    })

    render(<TakeoffPane />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('always shows that the 継手位置 is undetermined', () => {
    // 箇所数는 계상했지만 위치는 근거가 없다(表5.3.3은 원문에서 이미지). 접어야
    // 보이는 산출식에만 두면 3D에 継手가 없는 이유를 알 수 없다 — 継手 행이 있으면
    // 항상 보여야 한다. 그리고 「미계상」이라고 말하면 이제 거짓이다.
    render(<TakeoffPane />)

    const notice = screen.getByTestId('splice-position-notice')
    expect(notice).toHaveTextContent('継手位置')
    expect(notice).toHaveTextContent('表5.3.3')
    expect(notice).not.toHaveTextContent('未計上')
  })

  it('does not show the 継手位置 notice when nothing carries a 継手', () => {
    useAppStore.setState({
      project: { ...createSampleProject(), members: [] },
    })

    render(<TakeoffPane />)

    expect(
      screen.queryByTestId('splice-position-notice'),
    ).not.toBeInTheDocument()
  })

  it('shows that カットオフ筋 の定着 is left out of the 3D when one exists', () => {
    // 3D に描かれる長さが設計長さより短い理由は、折りたたまれた算出式の中に
    // だけ置くと読まれない — 継手位置の告知と同じ扱いにする。
    const project = createSampleProject()
    useAppStore.setState({
      project: {
        ...project,
        sections: project.sections.map((section) =>
          section.kind === '大梁'
            ? {
                ...section,
                main: {
                  ...section.main,
                  top: { endCount: 6, centerCount: 4 },
                },
              }
            : section,
        ),
      },
    })

    render(<TakeoffPane />)

    const notice = screen.getByTestId('cutoff-anchorage-notice')
    expect(notice).toHaveTextContent('カットオフ筋')
    expect(notice).toHaveTextContent('定着')
  })

  it('does not show the カットオフ notice when 端部と中央 hold the same count', () => {
    render(<TakeoffPane />)

    expect(
      screen.queryByTestId('cutoff-anchorage-notice'),
    ).not.toBeInTheDocument()
  })

  it('renders the 継手 row in 箇所 and leaves the mass columns empty', () => {
    // 単位が違う行を同じ列に混ぜると、内訳書の合計が意味を失う。
    const line = spliceLineFor('主筋')

    render(<TakeoffTable lines={takeoffLines()} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)
    const cells = within(row).getAllByRole('cell')

    expect(within(row).getByRole('button')).toHaveTextContent('継手（重ね継手）')
    expect(cells[8]).toHaveTextContent(String(line.totalCount))
    expect(cells[10]).toHaveTextContent('箇所')
    // 長さ・総延長・kg/m・所要数量は値を持たない。
    for (const index of [3, 6, 7, 9]) {
      expect(cells[index]).toHaveTextContent('—')
    }
  })

  it('keeps two chips citing one table when their tooltips differ', () => {
    // 문헌 위치만으로 묶으면 Map이 뒤엣것을 남긴다 — 같은 표의 다른 행
    // (지배 룰)이 툴팁에서 사라진다.
    const line = lineFor('主筋')
    const [governing] = line.rules
    const sameTable = {
      ...governing,
      key: `${governing.key}.alt`,
      label: `${governing.label}（別条件）`,
    }

    render(
      <TakeoffTable lines={[{ ...line, rules: [governing, sameTable] }]} />,
    )

    const titles = within(screen.getByTestId(`quantity-line-${line.id}`))
      .getAllByRole('link')
      .map((chip) => chip.getAttribute('title'))

    expect(titles).toHaveLength(2)
    expect(titles.some((title) => title?.includes(sameTable.label))).toBe(true)
  })

  it('collapses chips that would render identically', () => {
    const line = lineFor('主筋')
    const [governing] = line.rules

    render(
      <TakeoffTable
        lines={[{ ...line, rules: [governing, { ...governing }] }]}
      />,
    )

    expect(
      within(screen.getByTestId(`quantity-line-${line.id}`)).getAllByRole(
        'link',
      ),
    ).toHaveLength(1)
  })

  it('marks a row by its confidence tier — ▲ inferred, △ transcribed, none stated', () => {
    // 세 등급이 화면에서 갈려야 한다. 예전에는 ▲ 하나뿐이라 전 행에 붙었고,
    // 그래서 ▲ 가 아무것도 가리키지 못했다 (ADR-023).
    const lines = takeoffLines()
    const inferredLine = { ...lines[0], confidence: 'inferred' as const }
    const transcribedLine = { ...lines[1], confidence: 'transcribed' as const }
    const statedLine = { ...lines[1], confidence: 'stated' as const }

    const { rerender } = render(<TakeoffTable lines={[inferredLine]} />)
    const inferredRow = () =>
      within(screen.getByTestId(`quantity-line-${inferredLine.id}`))

    expect(inferredRow().getByLabelText('原文に値のない規準値')).toHaveTextContent(
      '▲',
    )
    expect(
      inferredRow().queryByLabelText('独立検討待ちの規準値'),
    ).not.toBeInTheDocument()

    rerender(<TakeoffTable lines={[transcribedLine]} />)
    const transcribedRow = () =>
      within(screen.getByTestId(`quantity-line-${transcribedLine.id}`))

    expect(
      transcribedRow().getByLabelText('独立検討待ちの規準値'),
    ).toHaveTextContent('△')
    expect(
      transcribedRow().queryByLabelText('原文に値のない規準値'),
    ).not.toBeInTheDocument()

    rerender(<TakeoffTable lines={[statedLine]} />)
    const statedRow = () =>
      within(screen.getByTestId(`quantity-line-${statedLine.id}`))

    expect(
      statedRow().queryByLabelText('原文に値のない規準値'),
    ).not.toBeInTheDocument()
    expect(
      statedRow().queryByLabelText('独立検討待ちの規準値'),
    ).not.toBeInTheDocument()
  })

  it('does not select or expand a row when a source link is clicked', () => {
    const lineId = lineFor('主筋').id
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.click(within(row).getAllByRole('link')[0])

    expect(useAppStore.getState().sel).toEqual({
      group: null,
      memberId: null,
    })
    expect(screen.queryByTestId(`formula-${lineId}`)).not.toBeInTheDocument()
  })

  it('updates hoverRowId without changing sel', () => {
    const lineId = lineFor('主筋').id
    useAppStore.setState({
      sel: { group: '2階|C|C1', memberId: '2F-X2Y2' },
    })
    const initialSelection = useAppStore.getState().sel
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.mouseEnter(row)

    expect(useAppStore.getState().hoverRowId).toBe(lineId)
    expect(useAppStore.getState().sel).toEqual(initialSelection)

    fireEvent.mouseLeave(row)

    expect(useAppStore.getState().hoverRowId).toBeNull()
    expect(useAppStore.getState().sel).toEqual(initialSelection)
  })

  it('drives the highlight axis from keyboard focus, not only hover', () => {
    useAppStore.setState({
      sel: { group: '2階|C|C1', memberId: '2F-X2Y2' },
    })
    const initialSelection = useAppStore.getState().sel
    render(<TakeoffPane />)

    const lineId = lineFor('主筋').id
    const row = screen.getByTestId(`quantity-line-${lineId}`)
    // 포커스는 행이 아니라 첫 칸 컨트롤에 온다 — tr에는 tabIndex가 없어 브라우저에서
    // 행 자체는 포커스를 받지 못한다. 행에 직접 쏘면 도달 불가능한 상태를 검증하게 된다.
    // tr의 onFocus/onBlur가 이걸 받는 건 focusin/focusout이 버블링되기 때문이다.
    const disclosure = within(row).getByRole('button')
    fireEvent.focus(disclosure)

    expect(useAppStore.getState().hoverRowId).toBe(lineId)
    expect(useAppStore.getState().sel).toEqual(initialSelection)

    fireEvent.blur(disclosure)

    expect(useAppStore.getState().hoverRowId).toBeNull()
    expect(useAppStore.getState().sel).toEqual(initialSelection)
  })

  it('expands the exact domain formula when a rebar row is clicked', () => {
    const lines = takeoffLines()
    const line = lineFor('帯筋')
    render(<TakeoffTable lines={lines} />)

    fireEvent.click(screen.getByTestId(`quantity-line-${line.id}`))

    expect(screen.getByTestId(`formula-${line.id}`)).toHaveTextContent(
      line.formula,
    )
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'takeoff',
    })
  })

  // toggleLine은 이미 선택된 그룹의 행을 펼치고 접는 것도 selectQuantityGroup을
  // 거친다. 선택이 실제로 바뀌지 않았는데도 매번 발화하면 source별 선택 수
  // 비교가 takeoff 쪽으로 부풀어, 계측을 붙이는 이 PR에서 계측값 자체가 깨진다.
  it('reports member_selected only when the selected group actually changes', () => {
    const lines = takeoffLines()
    const line = lineFor('帯筋')
    render(<TakeoffTable lines={lines} />)

    const cell = screen.getByTestId(`quantity-line-${line.id}`)
    fireEvent.click(cell)
    expect(capture).toHaveBeenCalledTimes(1)

    // 같은 행을 다시 눌러 펼침/접힘만 토글한다 — 선택 그룹은 그대로다.
    fireEvent.click(cell)
    expect(capture).toHaveBeenCalledTimes(1)
  })

  // groupId만 비교하면, plan·section·viewer에서 같은 그룹의 다른 柱(예:
  // X2Y1)를 이미 골라둔 상태에서 takeoff 행을 눌러 대표 부재로 되돌아가도
  // memberId가 실제로 바뀌었는데 발화하지 않는다 (9차 리뷰 minor).
  it('reports member_selected when memberId changes even if the group stays the same', () => {
    const lines = takeoffLines()
    const line = lineFor('帯筋')
    useAppStore.setState({ sel: { group: '1階|C|C1', memberId: '1F-X2Y1' } })
    render(<TakeoffTable lines={lines} />)

    fireEvent.click(screen.getByTestId(`quantity-line-${line.id}`))

    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'takeoff',
    })
  })

  // row(role=row)의 aria-expanded는 treegrid 안에서만 유효하다 — 평범한 table에서는
  // 보조기술이 읽지 못한다. 펼침 상태는 실제 컨트롤이 들고 있어야 한다.
  it('carries the disclosure state on a real control, not on the row', () => {
    const lines = takeoffLines()
    const line = lineFor('帯筋')
    render(<TakeoffTable lines={lines} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)
    expect(row).not.toHaveAttribute('aria-expanded')

    // 한 번의 클릭이 한 번만 토글되어야 한다 — 버튼 클릭이 행으로 버블링되면 두 번 뒤집혀
    // 아무 일도 일어나지 않는다.
    fireEvent.click(within(row).getByRole('button', { expanded: false }))

    expect(screen.getByTestId(`formula-${line.id}`)).toHaveTextContent(
      line.formula,
    )
    expect(
      within(screen.getByTestId(`quantity-line-${line.id}`)).getByRole('button'),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders story subtotals and the grand total from domain helpers', () => {
    enterUnitMass()
    const lines = takeoffLines()
    const subtotals = storySubtotals(lines)
    const total = grandTotal(lines)
    render(<TakeoffTable lines={lines} />)

    for (const subtotal of subtotals) {
      const row = screen.getByTestId(`story-subtotal-${subtotal.storyName}`)
      const cells = within(row).getAllByRole('cell')
      expect(cells[0]).toHaveTextContent(subtotal.designKg!.toFixed(3))
      expect(cells[1]).toHaveTextContent(subtotal.requiredKg!.toFixed(3))
    }

    const totalCells = within(screen.getByTestId('grand-total')).getAllByRole(
      'cell',
    )
    expect(totalCells[0]).toHaveTextContent(total.designKg!.toFixed(3))
    expect(totalCells[1]).toHaveTextContent(total.requiredKg!.toFixed(3))
  })

  it('selects a representative member and scrolls to external selections', () => {
    render(<TakeoffPane />)

    fireEvent.click(screen.getByTestId('quantity-group-1階|C|C1'))
    expect(useAppStore.getState().sel).toEqual({
      group: '1階|C|C1',
      memberId: '1F-X1Y1',
    })

    act(() => useAppStore.getState().selectMember('2F-X2Y2'))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByTestId('quantity-group-2階|C|C1')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('renders unavailable sources as disabled chips instead of links', () => {
    const line = lineWithUnavailableSource()
    render(<TakeoffTable lines={[line]} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)
    const chip = within(row).getByText(UNAVAILABLE_SOURCE)

    expect(chip).toHaveAttribute('aria-disabled', 'true')
    expect(chip).toHaveAttribute('title', expect.stringContaining('未確保'))
    expect(chip.closest('a')).toBeNull()
  })

  it('keeps one chip per rule row when a table is cited twice', () => {
    // 大梁 上端筋은 大梁의 かぶり와 端部条件을 판정한 지점 柱의 かぶり를 둘 다
    // 조회한다 — 가리키는 표는 같은 表5.3.6이지만 근거 행은 서로 다르다.
    // 하나로 접으면 남은 칩의 툴팁이 나머지 한 행을 대신 말하게 된다.
    const lineId = lineFor('上端筋').id
    render(<TakeoffPane />)

    const row = screen.getByTestId(`quantity-line-${lineId}`)
    const titles = within(row)
      .getAllByText('標準仕様書 表5.3.6')
      .map((chip) => chip.getAttribute('title'))

    expect(titles).toHaveLength(2)
    expect(
      titles.some((title) => title?.includes('柱の最小かぶり厚さ')),
    ).toBe(true)
    expect(
      titles.some((title) => title?.includes('大梁の最小かぶり厚さ')),
    ).toBe(true)
  })

  it('stores a typed 備考 in the Project instead of dropping it', () => {
    render(<TakeoffPane />)

    const lineId = lineFor('主筋').id
    const row = screen.getByTestId(`quantity-line-${lineId}`)
    fireEvent.change(within(row).getByLabelText(`${lineId} 備考`), {
      target: { value: '要確認' },
    })

    expect(useAppStore.getState().project.notes).toEqual({
      [lineId]: '要確認',
    })
    expect(
      within(screen.getByTestId(`quantity-line-${lineId}`)).getByLabelText(
        `${lineId} 備考`,
      ),
    ).toHaveValue('要確認')
  })

  it('keeps an unavailable source chip reachable by keyboard', () => {
    const line = lineWithUnavailableSource()
    render(<TakeoffTable lines={[line]} />)

    const row = screen.getByTestId(`quantity-line-${line.id}`)

    expect(within(row).getByText(UNAVAILABLE_SOURCE)).toHaveAttribute(
      'tabindex',
      '0',
    )
  })

  it('shows the rulepack markup and exports the current project as xlsx', async () => {
    render(<TakeoffActions />)

    expect(screen.getByText('割増 4%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))

    await waitFor(() => expect(exportTakeoffXlsx).toHaveBeenCalledOnce())
    expect(exportTakeoffXlsx).toHaveBeenCalledWith({
      project: useAppStore.getState().project,
      lines: expect.any(Array),
      locale: 'ja',
    })
  })

  // 파일이 실제로 내려간 뒤에만 발화해야 퍼널의 마지막 칸이 "받았다"를 뜻한다.
  // 미검증 룰팩 항목이 섞인 채로도 내보내는지가 ADR-015가 걸어둔 가설이다.
  it('reports the export only after the workbook resolves, with the inferred rules it carried', async () => {
    render(<TakeoffActions />)

    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))
    expect(capture).not.toHaveBeenCalledWith(
      'takeoff_exported',
      expect.anything(),
    )

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('takeoff_exported', {
        locale: 'ja',
        size_bucket: expect.any(String),
        // has_inferred 는 「원문에 값이 없는 근거를 썼는가」 그대로다.
        // has_unverified 는 独立検討 대기까지 포함한 넓은 쪽이라 지금은 항상 참이다.
        has_inferred: expect.any(Boolean),
        has_unverified: expect.any(Boolean),
        inferred_rules: expect.any(Array),
      }),
    )
  })

  // line_count 원값은 부재 수·철근 종류에서 파생된 모델 규모라 도면에서 나온
  // 값이다. 「치수·본수는 도면 데이터라 내보내지 않는다」는 exportWorkbook의
  // 주석과 어긋나므로 원문 없이도 복원 못 하는 버킷으로만 보낸다.
  it('buckets the model size instead of sending the raw line count', async () => {
    render(<TakeoffActions />)

    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'takeoff_exported',
        expect.objectContaining({ size_bucket: 'small' }),
      ),
    )
    const [, properties] = capture.mock.calls.find(
      ([event]) => event === 'takeoff_exported',
    )!
    expect(properties).not.toHaveProperty('line_count')
  })

  it('reports a failed export instead of dropping the rejection', async () => {
    const failure = new Error('exceljs chunk failed to load')
    vi.mocked(exportTakeoffXlsx).mockRejectedValueOnce(failure)

    render(<TakeoffActions />)
    fireEvent.click(screen.getByRole('button', { name: '書き出し' }))

    await waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(failure, {
        stage: 'takeoff_export',
      }),
    )
    expect(capture).toHaveBeenCalledWith('takeoff_export_failed', {
      locale: 'ja',
    })
    expect(capture).not.toHaveBeenCalledWith(
      'takeoff_exported',
      expect.anything(),
    )
  })
})

describe('単位質量の入力', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: null, memberId: null },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  it('leaves the mass columns empty until a 単位質量 is entered', () => {
    const line = lineFor('主筋')
    render(<TakeoffPane />)

    const cells = within(
      screen.getByTestId(`quantity-line-${line.id}`),
    ).getAllByRole('cell')

    // 総延長は規準（1通則2)・7)）で出るが、単位質量・設計数量・所要数量は出ない。
    expect(cells[6]).not.toHaveTextContent('—')
    expect(cells[7]).toHaveTextContent('—')
    expect(cells[8]).toHaveTextContent('—')
    expect(cells[9]).toHaveTextContent('—')
    expect(
      within(screen.getByTestId('grand-total')).getAllByRole('cell')[0],
    ).toHaveTextContent('—')
  })

  it('asks for exactly the 径 the takeoff needs, in ascending order', () => {
    const sizes = [...new Set(massLines(takeoffLines()).map(({ size }) => size))]
    render(<TakeoffPane />)

    const inputs = within(screen.getByTestId('unit-mass-input')).getAllByRole(
      'spinbutton',
    )

    expect(inputs.map((input) => input.getAttribute('data-size'))).toEqual(
      [...sizes].sort(
        (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
      ),
    )
  })

  it('computes the mass from what the user typed', () => {
    const line = lineFor('主筋')
    render(<TakeoffPane />)

    fireEvent.change(screen.getByLabelText(`${line.size} 単位質量`), {
      target: { value: '2' },
    })

    expect(useAppStore.getState().project.unitMass?.[line.size]).toBe(2)
    const cells = within(
      screen.getByTestId(`quantity-line-${line.id}`),
    ).getAllByRole('cell')
    expect(cells[7]).toHaveTextContent('2.000')
    expect(cells[8]).toHaveTextContent(
      ((line.totalLengthMm / 1000) * 2).toFixed(3),
    )
  })

  it('treats a cleared field as "not entered", not as zero', () => {
    const line = lineFor('主筋')
    render(<TakeoffPane />)
    const input = screen.getByLabelText(`${line.size} 単位質量`)

    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.change(input, { target: { value: '' } })

    expect(useAppStore.getState().project.unitMass?.[line.size]).toBeUndefined()
    expect(
      within(screen.getByTestId(`quantity-line-${line.id}`)).getAllByRole(
        'cell',
      )[8],
    ).toHaveTextContent('—')
  })

  it('says why the product does not ship the values', () => {
    render(<TakeoffPane />)

    expect(screen.getByTestId('unit-mass-notice')).toHaveTextContent(
      'JIS G 3112',
    )
  })
})
