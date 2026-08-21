import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

const { capture, captureException } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/telemetry', () => ({ capture, captureException }))

import { AppShell } from './AppShell'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

/** Throws off the current Project, exactly like the domain helpers do. */
function BoomUntilRenamed() {
  const name = useAppStore(({ project }) => project.name)
  if (name !== '別案件') throw new Error('Story not found: 3F')
  return <p>平面の中身</p>
}

describe('AppShell', () => {
  beforeEach(() => {
    capture.mockClear()
    captureException.mockClear()
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all four pane headers', () => {
    render(<AppShell />)

    expect(
      screen.getByRole('heading', { name: '平面エディタ' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '部材断面一覧' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '3Dビュー' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '数量内訳書' }),
    ).toBeInTheDocument()
  })

  it('renders plan actions in the plan pane header', () => {
    render(<AppShell planActions={<button type="button">2階</button>} />)

    expect(screen.getByRole('button', { name: '2階' })).toBeInTheDocument()
  })

  it('renders viewer actions in the viewer pane header', () => {
    render(<AppShell viewerActions={<button type="button">建物</button>} />)

    expect(screen.getByRole('button', { name: '建物' })).toBeInTheDocument()
  })

  it('renders takeoff actions in the takeoff pane header', () => {
    render(
      <AppShell takeoffActions={<button type="button">書き出し</button>} />,
    )

    expect(screen.getByRole('button', { name: '書き出し' })).toBeInTheDocument()
  })

  it('renders the source notice and the prominent M1 warning banner', () => {
    render(<AppShell />)

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      '公共建築工事標準仕様書',
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      '公共建築数量積算基準',
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('改変')
    // 배너는 「지금 무엇이 확인 안 됐는지」를 말해야 한다. 전사는 끝났으므로
    // 「原文抽出前の仮値」는 더 이상 사실이 아니다 (ADR-023).
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('独立検討')
    expect(banner).toHaveTextContent('検収・発注には使用しないでください')
    expect(banner).not.toHaveTextContent('原文抽出前')
  })

  it('does not use role=alert for the always-present M1 banner', () => {
    render(<AppShell />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('contains a throwing pane so the other three keep working', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppShell
        plan={<Boom message="Story not found: 3F" />}
        section={<p>部材断面一覧の中身</p>}
        viewer={<p>3Dの中身</p>}
        takeoff={<p>数量内訳の中身</p>}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Story not found: 3F')
    expect(screen.getByText('部材断面一覧の中身')).toBeInTheDocument()
    expect(screen.getByText('3Dの中身')).toBeInTheDocument()
    expect(screen.getByText('数量内訳の中身')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '平面エディタ' }),
    ).toBeInTheDocument()
  })

  it('contains a throwing pane action without losing the pane body', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppShell
        takeoffActions={<Boom message="Takeoff header requires one rate" />}
        takeoff={<p>数量内訳の中身</p>}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Takeoff header requires one rate',
    )
    expect(screen.getByText('数量内訳の中身')).toBeInTheDocument()
  })

  it('revives a failed pane once the offending input is fixed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<AppShell plan={<BoomUntilRenamed />} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Story not found: 3F')

    act(() =>
      useAppStore
        .getState()
        .updateProject((project) => ({ ...project, name: '別案件' })),
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('平面の中身')).toBeInTheDocument()
  })

  it('switches locale immediately without navigation', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '한국어' }))

    expect(
      screen.getByRole('heading', { name: '평면 에디터' }),
    ).toBeInTheDocument()
    expect(useAppStore.getState().locale).toBe('ko')
  })

  it('reports the locale switch', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '한국어' }))

    expect(capture).toHaveBeenCalledWith('locale_changed', { locale: 'ko' })
  })

  // 이미 활성인 언어를 다시 눌러도 전환이 아니다 — member_selected와
  // 발화 기준을 맞춘다 (10차 리뷰 minor).
  it('does not report when clicking the already-active language', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    expect(capture).not.toHaveBeenCalled()
  })

  it('publishes the active locale on the document element', () => {
    render(<AppShell />)
    expect(document.documentElement).toHaveAttribute('lang', 'ja')

    fireEvent.click(screen.getByRole('button', { name: '한국어' }))

    expect(document.documentElement).toHaveAttribute('lang', 'ko')
  })

  it('shows the scope notice in Korean once the locale is ko', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '한국어' }))

    expect(screen.getByRole('contentinfo')).toHaveTextContent('관청시설')
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent(
      '官庁施設向けの基準であり',
    )
  })
})
