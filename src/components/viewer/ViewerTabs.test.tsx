import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/lib/store'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/telemetry', () => ({ capture }))

import { ViewerTabs } from './ViewerTabs'

describe('ViewerTabs', () => {
  beforeEach(() => {
    capture.mockClear()
    useAppStore.setState({ locale: 'ja', viewerMode: 'member' })
  })

  it('renders 部材/建物 tabs with the current mode selected', () => {
    render(<ViewerTabs />)

    expect(screen.getByRole('tab', { name: '部材' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: '建物' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('switches the store mode on click', () => {
    render(<ViewerTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '建物' }))

    expect(useAppStore.getState().viewerMode).toBe('building')
  })

  it('reports the mode switch', () => {
    render(<ViewerTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '建物' }))

    expect(capture).toHaveBeenCalledWith('viewer_mode_changed', {
      mode: 'building',
    })
  })

  // 이미 활성인 탭을 다시 눌러도 전환이 아니다 — member_selected와 발화
  // 기준을 맞춘다 (9차 리뷰 nit).
  it('does not report when clicking the already-active tab', () => {
    render(<ViewerTabs />)

    fireEvent.click(screen.getByRole('tab', { name: '部材' }))

    expect(capture).not.toHaveBeenCalled()
  })

  it('translates the tab labels instead of hardcoding Japanese', () => {
    useAppStore.setState({ locale: 'ko' })
    render(<ViewerTabs />)

    expect(
      screen.getByRole('tablist', { name: '표시 전환' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '부재' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '건물' })).toBeInTheDocument()
  })
})
