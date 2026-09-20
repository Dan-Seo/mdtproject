import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

// WebGL이 없는 jsdom에서는 3D 본문만 대체한다 — 페인 배선이 검증 대상이다.
vi.mock('@/components/viewer/Viewer3D', () => ({
  Viewer3D: () => <div data-testid="viewer3d" />,
}))

const { reviewPane, workPackageBoard } = vi.hoisted(() => ({
  reviewPane: vi.fn(),
  workPackageBoard: vi.fn(),
}))
vi.mock('@/components/review/ReviewPane', () => ({
  ReviewPane: () => {
    reviewPane()
    return <div data-testid="review-pane" />
  },
}))
vi.mock('@/components/review/WorkPackageBoard', () => ({
  WorkPackageBoard: () => {
    workPackageBoard()
    return <div data-testid="work-packages" />
  },
}))

import Home from './page'

describe('Home', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      locale: 'ja',
      viewerMode: 'member',
      takeoffTab: '内訳書',
    })
  })

  // Viewer3D는 next/dynamic 경계 뒤에 있어 마운트 직후가 아니라 청크 해결 후에 나타난다.
  // 단언은 그대로 두고 비동기 조회로만 바꾼다.
  it('wires the viewer tabs into the 3D pane header', async () => {
    render(<Home />)

    expect(screen.getByRole('tab', { name: '部材' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '建物' })).toBeInTheDocument()
    expect(await screen.findByTestId('viewer3d')).toBeInTheDocument()
    // 全ペインを jsdom で組み立てるので、73 ファイル並列の下では既定の 5 秒に
    // 収まらないことがある (実測 4.9 秒)。遅いのは描画であって待ち合わせでは
    // ないため、待つ時間だけを広げる。
  }, 20_000)

  // 두 페인은 Viewer3D와 같은 next/dynamic 경계 뒤에 있다 — 탭을 누른 뒤 청크가
  // 풀려야 마운트된다. 단언은 그대로 두고(누르기 전 0회 / 누른 뒤 정확히 1회)
  // 조회만 비동기로 바꾼다.
  it('mounts ReviewPane only on the 検討 tab', async () => {
    reviewPane.mockClear()
    render(<Home />)

    expect(reviewPane).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: '検討' }))
    await vi.waitFor(() => expect(reviewPane).toHaveBeenCalledTimes(1))
  })

  it('mounts WorkPackageBoard only on the 作業 tab', async () => {
    workPackageBoard.mockClear()
    render(<Home />)

    expect(workPackageBoard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: '作業' }))
    await vi.waitFor(() => expect(workPackageBoard).toHaveBeenCalledTimes(1))
  })
})
