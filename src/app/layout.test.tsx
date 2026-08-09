import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/lib/store'

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
  JetBrains_Mono: () => ({ variable: '--font-jetbrains-mono' }),
}))

import RootLayout from './layout'

describe('RootLayout', () => {
  beforeEach(() => {
    useAppStore.setState({ locale: 'ja' })
  })

  it('names the document so the browser tab is identifiable', () => {
    render(<RootLayout>{null}</RootLayout>)

    expect(document.title).toBe('Kijun 基準')
  })

  // React 19는 <html>을 문서 싱글턴으로 취급하므로 속성이 실제 documentElement에 반영된다.
  it('seeds the document language for the initial render', () => {
    render(<RootLayout>{null}</RootLayout>)

    expect(document.documentElement).toHaveAttribute('lang', 'ja')
  })
})
