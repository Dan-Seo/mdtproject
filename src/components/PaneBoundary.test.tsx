import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaneBoundary } from './PaneBoundary'

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: { captureException } }))

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('PaneBoundary', () => {
  beforeEach(() => {
    captureException.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children while nothing throws', () => {
    render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <p>数量内訳</p>
      </PaneBoundary>,
    )

    expect(screen.getByText('数量内訳')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('shows the reason instead of propagating the throw', () => {
    render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    expect(screen.getByText('このペインを表示できません')).toBeInTheDocument()
    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()
  })

  // 경계가 예외를 화면에서 삼키므로, 여기서 보고하지 않으면 룰팩 조회 실패 같은
  // 가장 실행 가능한 프로덕션 신호가 사용자 화면에서만 살고 끝난다.
  it('reports the swallowed error with the pane that died', () => {
    render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(1)
    const [error, properties] = captureException.mock.calls[0]
    expect((error as Error).message).toBe(
      'Rule not found: development.length',
    )
    expect(properties).toMatchObject({ pane: 'takeoff-pane-body' })
  })

  it('recovers once resetKey changes so a fixed input revives the pane', () => {
    const { rerender } = render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()

    rerender(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={1}
      >
        <p>数量内訳</p>
      </PaneBoundary>,
    )

    expect(screen.getByText('数量内訳')).toBeInTheDocument()
    expect(
      screen.queryByText('Story not found: 3F'),
    ).not.toBeInTheDocument()
  })

  it('stays failed while resetKey is unchanged', () => {
    const { rerender } = render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    rerender(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <p>数量内訳</p>
      </PaneBoundary>,
    )

    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()
    expect(screen.queryByText('数量内訳')).not.toBeInTheDocument()
  })
})
