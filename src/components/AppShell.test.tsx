import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

import { AppShell } from './AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
    })
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
    expect(screen.getByRole('alert')).toHaveTextContent(
      '原文抽出前の仮値',
    )
  })

  it('switches locale immediately without navigation', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '한국어' }))

    expect(
      screen.getByRole('heading', { name: '평면 에디터' }),
    ).toBeInTheDocument()
    expect(useAppStore.getState().locale).toBe('ko')
  })
})
