import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/lib/store'

// 폰트는 자기 호스팅 서브셋이라 next/font/local이다 (src/app/fonts/README.md).
// 로더는 Next 컴파일러 전용이므로 vitest에서는 변수명만 돌려주는 더미로 바꾼다.
vi.mock('next/font/local', () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
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
