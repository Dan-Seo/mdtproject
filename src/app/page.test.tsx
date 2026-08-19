import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

// WebGL이 없는 jsdom에서는 3D 본문만 대체한다 — 페인 배선이 검증 대상이다.
vi.mock('@/components/viewer/Viewer3D', () => ({
  Viewer3D: () => <div data-testid="viewer3d" />,
}))

import Home from './page'

describe('Home', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
      viewerMode: 'member',
    })
  })

  // Viewer3D는 next/dynamic 경계 뒤에 있어 마운트 직후가 아니라 청크 해결 후에 나타난다.
  // 단언은 그대로 두고 비동기 조회로만 바꾼다.
  it('wires the viewer tabs into the 3D pane header', async () => {
    render(<Home />)

    expect(screen.getByRole('tab', { name: '部材' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '建物' })).toBeInTheDocument()
    expect(await screen.findByTestId('viewer3d')).toBeInTheDocument()
  })
})
