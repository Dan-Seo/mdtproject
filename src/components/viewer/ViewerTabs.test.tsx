import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from '@/lib/store'

import { ViewerTabs } from './ViewerTabs'

describe('ViewerTabs', () => {
  beforeEach(() => {
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
