import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaneBoundary } from './PaneBoundary'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('PaneBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children while nothing throws', () => {
    render(
      <PaneBoundary label="このペインを表示できません" resetKey={0}>
        <p>数量内訳</p>
      </PaneBoundary>,
    )

    expect(screen.getByText('数量内訳')).toBeInTheDocument()
  })

  it('shows the reason instead of propagating the throw', () => {
    render(
      <PaneBoundary label="このペインを表示できません" resetKey={0}>
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    expect(screen.getByText('このペインを表示できません')).toBeInTheDocument()
    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()
  })

  it('recovers once resetKey changes so a fixed input revives the pane', () => {
    const { rerender } = render(
      <PaneBoundary label="このペインを表示できません" resetKey={0}>
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()

    rerender(
      <PaneBoundary label="このペインを表示できません" resetKey={1}>
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
      <PaneBoundary label="このペインを表示できません" resetKey={0}>
        <Boom message="Story not found: 3F" />
      </PaneBoundary>,
    )

    rerender(
      <PaneBoundary label="このペインを表示できません" resetKey={0}>
        <p>数量内訳</p>
      </PaneBoundary>,
    )

    expect(screen.getByText('Story not found: 3F')).toBeInTheDocument()
    expect(screen.queryByText('数量内訳')).not.toBeInTheDocument()
  })
})
