import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  controlsDispose: vi.fn(),
  rendererDispose: vi.fn(),
  resizeDisconnect: vi.fn(),
  envTextureDispose: vi.fn(),
  rendererInstances: [] as Array<{
    shadowMap: { enabled: boolean; type: number }
    toneMapping: number
    outputColorSpace: string
  }>,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class WebGLRendererMock {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false, type: 0 }
    toneMapping = 0
    toneMappingExposure = 1
    outputColorSpace = ''

    constructor() {
      mocks.rendererInstances.push(this)
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

  // 실 PMREM은 WebGL 컨텍스트가 필요하다. 환경맵의 실 동작은 e2e가 커버한다.
  class PMREMGeneratorMock {
    fromScene = () => ({ texture: { dispose: mocks.envTextureDispose } })
    dispose = vi.fn()
  }

  class RaycasterMock {
    setFromCamera = vi.fn()
    intersectObjects(objects: import('three').Object3D[]) {
      return objects.length === 0 ? [] : [{ object: objects[0] }]
    }
  }

  return {
    ...actual,
    PMREMGenerator: PMREMGeneratorMock,
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
    addEventListener = vi.fn()
    dispose = mocks.controlsDispose
  },
}))

vi.mock('three/examples/jsm/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class RoomEnvironmentMock {},
}))

import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'

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
    mocks.envTextureDispose.mockClear()
    mocks.rendererInstances.length = 0
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: '1階|C|C1', memberId: '1F-X1Y1' },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
      viewerMode: 'member',
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
    expect(mocks.envTextureDispose).toHaveBeenCalledOnce()
  })

  it('enables shadows, tone mapping, colour space and an environment map', () => {
    render(<Viewer3D />)

    const [renderer] = mocks.rendererInstances
    expect(renderer.shadowMap.enabled).toBe(true)
    expect(renderer.shadowMap.type).toBe(PCFSoftShadowMap)
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)
    expect(renderer.outputColorSpace).toBe(SRGBColorSpace)
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

  it('renders the building view and picks a member back into the selection', () => {
    useAppStore.setState({
      viewerMode: 'building',
      sel: { group: '1階|C|C1', memberId: '1F-X2Y2' },
    })
    render(<Viewer3D />)

    const canvas = screen.getByLabelText('建物全体の3D')
    fireEvent.click(canvas, { clientX: 320, clientY: 180 })

    // RaycasterMock은 첫 pickable(첫 콘크리트 박스 = 1F-X1Y1)을 반환한다.
    expect(useAppStore.getState().sel.memberId).toBe('1F-X1Y1')
  })

  it('maps a clicked rebar mesh back to its QuantityLine id', () => {
    const { result } = renderHook(() => useTakeoff())
    const mainLine = result.current.lines.find(
      ({ groupId, role }) => groupId === '1階|C|C1' && role === '主筋',
    )
    expect(mainLine).toBeDefined()
    render(<Viewer3D />)

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    expect(useAppStore.getState().hoverRowId).toBe(mainLine?.id)
  })
})
