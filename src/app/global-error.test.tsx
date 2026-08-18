import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: { captureException } }))

import GlobalError from './global-error'

describe('GlobalError', () => {
  beforeEach(() => {
    captureException.mockClear()
  })

  // 이 화면이 뜨는 시점은 스토어를 포함해 앱 전체가 죽었을 수 있는 최악의
  // 장애다 — 이 captureException이 빠지면 관측 사각이 가장 심각한 곳에 생긴다.
  it('reports the crash that killed the whole app', () => {
    const error = Object.assign(new Error('Rule not found: development.length'), {
      digest: 'abc123',
    })

    render(<GlobalError error={error} reset={() => {}} />)

    expect(captureException).toHaveBeenCalledWith(error)
  })

  // 루트 레이아웃은 lang="ja"(layout.tsx)다. 최상위 크래시 화면만 다른
  // 언어로 뜨면 실제 장애 시 사용자가 보는 유일한 화면이 제품과 어긋난다.
  // 스토어가 죽어 있을 수 있으므로 t()에 기대지 않는 정적 ja 문구를 쓴다.
  it('matches the root layout language instead of falling back to English', () => {
    const error = new Error('boom')

    render(<GlobalError error={error} reset={() => {}} />)

    expect(document.documentElement).toHaveAttribute('lang', 'ja')
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
