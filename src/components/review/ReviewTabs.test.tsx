import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from '@/lib/store'

import { ReviewTabs } from './ReviewTabs'

describe('ReviewTabs', () => {
  beforeEach(() => {
    useAppStore.setState({ locale: 'ja', takeoffTab: '内訳書' })
  })

  it('renders the three review tabs and changes the store tab', () => {
    render(<ReviewTabs />)

    expect(screen.getByRole('tablist', { name: '内訳書切替' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '内訳書' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '検討' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '作業' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: '検討' }))

    expect(useAppStore.getState().takeoffTab).toBe('検討')

    fireEvent.click(screen.getByRole('tab', { name: '作業' }))

    expect(useAppStore.getState().takeoffTab).toBe('作業')
  })
})
