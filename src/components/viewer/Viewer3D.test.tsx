import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useAppStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  controlsDispose: vi.fn(),
  rendererDispose: vi.fn(),
  resizeDisconnect: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class WebGLRendererMock {
    domElement = document.createElement('canvas')

    constructor() {
      this.domElement.getBoundingClientRect = () =>
        ({
          bottom: 360,
          height: 360,
          left: 0,
          right: 640,
          top: 0,
          width: 640,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    }

    setPixelRatio = vi.fn()
    setSize = vi.fn()
    render = vi.fn()
    dispose = mocks.rendererDispose
  }

  class RaycasterMock {
    setFromCamera = vi.fn()
    intersectObjects(objects: import('three').Object3D[]) {
      return objects.length === 0 ? [] : [{ object: objects[0] }]
    }
  }

  return {
    ...actual,
    Raycaster: RaycasterMock,
    WebGLRenderer: WebGLRendererMock,
  }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class OrbitControlsMock {
    target = { set: vi.fn() }
    enableDamping = false
    dampingFactor = 0
    update = vi.fn()
    dispose = mocks.controlsDispose
  },
}))

import { Viewer3D } from './Viewer3D'

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            bottom: 360,
            height: 360,
            left: 0,
            right: 640,
            top: 0,
            width: 640,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }

  unobserve() {}

  disconnect() {
    mocks.resizeDisconnect()
  }
}

describe('Viewer3D', () => {
  beforeEach(() => {
    mocks.controlsDispose.mockClear()
    mocks.rendererDispose.mockClear()
    mocks.resizeDisconnect.mockClear()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: '1階|C|C1', memberId: '1F-X1Y1' },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
    })
  })

  it('mounts and disposes WebGL resources without throwing', () => {
    const { unmount } = render(<Viewer3D />)

    expect(screen.getByLabelText('選択部材の配筋3D')).toBeInTheDocument()
    expect(screen.getByText('寸法判読用ではない')).toBeInTheDocument()

    expect(() => unmount()).not.toThrow()
    expect(mocks.controlsDispose).toHaveBeenCalledOnce()
    expect(mocks.rendererDispose).toHaveBeenCalledOnce()
    expect(mocks.resizeDisconnect).toHaveBeenCalledOnce()
  })

  it('translates its own chrome instead of hardcoding Japanese', () => {
    useAppStore.setState({
      sel: { group: null, memberId: null },
      locale: 'ko',
    })
    render(<Viewer3D />)

    expect(screen.getByText('부재를 선택')).toBeInTheDocument()
    expect(screen.getByText('치수 판독용이 아님')).toBeInTheDocument()
    expect(screen.getByText('배근 데이터 없음')).toBeInTheDocument()
  })

  it('says 大梁 is out of scope instead of showing an empty viewer', () => {
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))
    render(<Viewer3D />)

    expect(screen.getByText(/M3/)).toBeInTheDocument()
    expect(screen.queryByText('配筋データなし')).not.toBeInTheDocument()
  })

  it('maps a clicked rebar mesh back to its QuantityLine id', () => {
    render(<Viewer3D />)

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    expect(useAppStore.getState().hoverRowId).toBe('1階|C|C1|主筋')
  })
})
