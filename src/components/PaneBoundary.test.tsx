import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaneBoundary } from './PaneBoundary'

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}))

vi.mock('@/lib/telemetry', () => ({ captureException }))

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

  // AppShell은 모든 페인의 resetKey에 project 하나를 넘긴다 — 어디를 편집해도
  // project 참조가 바뀌어 이 경계가 되살아난다. 근본 원인(예: 룰팩 공백)이
  // 아직 안 고쳐졌으면 되살아난 자식이 같은 메시지로 다시 던지고, 그때마다
  // captureException이 또 발화하면 사용자가 무관한 필드를 편집할 때마다
  // oncall 알림이 다시 쏘아진다.
  it('reports a persisting failure only once across repeated resets', () => {
    const { rerender } = render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(1)

    rerender(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={1}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(1)
  })

  // 근본 원인이 바뀌어 다른 메시지를 던지면 그건 새 신호이므로 다시 보고한다.
  it('reports again when the reason actually changes', () => {
    const { rerender } = render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    rerender(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={1}
      >
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(2)
  })

  // reportedReason이 복구 뒤에도 남아 있으면, 같은 원인이 다시 터지는
  // 새 사건을 dedup이 영원히 삼켜 재발 빈도가 관측에서 사라진다.
  it('reports again after a genuine recovery, even if the reason recurs', () => {
    const { rerender } = render(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={0}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(1)

    // resetKey 변경 + 자식이 더 이상 던지지 않음 = 진짜 복구.
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

    // 나중에 같은 원인이 새 사건으로 다시 터진다.
    rerender(
      <PaneBoundary
        label="このペインを表示できません"
        pane="takeoff-pane-body"
        resetKey={2}
      >
        <Boom message="Rule not found: development.length" />
      </PaneBoundary>,
    )

    expect(captureException).toHaveBeenCalledTimes(2)
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
