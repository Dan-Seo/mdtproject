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

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('posthog-js', () => ({ default: { capture } }))

const mocks = vi.hoisted(() => ({
  controlsDispose: vi.fn(),
  controlsTargetSet: vi.fn(),
  rendererDispose: vi.fn(),
  resizeDisconnect: vi.fn(),
  envTextureDispose: vi.fn(),
  rendererInstances: [] as Array<{
    shadowMap: { enabled: boolean; type: number }
    toneMapping: number
    outputColorSpace: string
  }>,
  pickableCounts: [] as number[],
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
      mocks.pickableCounts.push(objects.length)
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
    target = { set: mocks.controlsTargetSet }
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
    capture.mockClear()
    mocks.controlsDispose.mockClear()
    mocks.controlsTargetSet.mockClear()
    mocks.rendererDispose.mockClear()
    mocks.resizeDisconnect.mockClear()
    mocks.envTextureDispose.mockClear()
    mocks.rendererInstances.length = 0
    mocks.pickableCounts.length = 0
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

  // 컨텍스트 손실은 예외를 던지지 않는다 — 뷰어가 조용히 얼어붙고 경계도 걸리지 않으므로
  // 여기서 보고하지 않으면 프로덕션에 흔적이 남지 않는다 (R4: 층당 철근 1만 개).
  it('reports a lost WebGL context instead of freezing in silence', () => {
    render(<Viewer3D />)

    fireEvent(
      screen.getByLabelText('選択部材の配筋3D'),
      new Event('webglcontextlost'),
    )

    expect(capture).toHaveBeenCalledWith('viewer_webgl_context_lost', {
      mode: 'member',
    })
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
    expect(capture).toHaveBeenCalledWith('member_selected', {
      source: 'viewer',
    })
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
    // 3D 철근 → 내역서 행. 部材 뷰에서 3D가 하는 유일한 일이고 ADR-016 전제의 증거다.
    expect(capture).toHaveBeenCalledWith('rebar_picked')
  })

  it('builds one pickable mesh per takeoff row instead of one per segment', () => {
    render(<Viewer3D />)

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    // 柱 C1 は 主筋 と 帯筋 の 2 行。セグメントは 156 本ある。
    expect(mocks.pickableCounts.at(-1)).toBe(2)
  })

  it('does not re-frame the camera while an unrelated field is edited', () => {
    render(<Viewer3D />)
    const framesAfterMount = mocks.controlsTargetSet.mock.calls.length
    expect(framesAfterMount).toBeGreaterThan(0)

    act(() =>
      useAppStore
        .getState()
        .updateProject((project) => ({
          ...project,
          notes: { '1階|C|C1|主筋': '要確認' },
        })),
    )

    expect(mocks.controlsTargetSet.mock.calls).toHaveLength(framesAfterMount)
  })

  it('does not tear the scene down when a non-geometry field changes', async () => {
    const THREE = await import('three')
    render(<Viewer3D />)

    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')

    act(() =>
      useAppStore
        .getState()
        .updateProject((project) => ({
          ...project,
          notes: { '1階|C|C1|主筋': '要確認' },
        })),
    )

    expect(dispose).not.toHaveBeenCalled()
    dispose.mockRestore()
  })

  it('rebuilds the scene when the 断面 actually changes', async () => {
    const THREE = await import('three')
    render(<Viewer3D />)

    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')

    act(() =>
      useAppStore.getState().updateProject((project) => ({
        ...project,
        sections: project.sections.map((section) =>
          section.id === 'section-C1' && section.kind === '柱'
            ? { ...section, hoop: { ...section.hoop, pitch: 200 } }
            : section,
        ),
      })),
    )

    expect(dispose).toHaveBeenCalled()
    dispose.mockRestore()
  })

  it('keeps the camera while the 断面 of the selected member is edited', () => {
    render(<Viewer3D />)
    const framesAfterMount = mocks.controlsTargetSet.mock.calls.length

    act(() =>
      useAppStore.getState().updateProject((project) => ({
        ...project,
        sections: project.sections.map((section) =>
          section.id === 'section-C1' && section.kind === '柱'
            ? { ...section, main: { ...section.main, count: 20 } }
            : section,
        ),
      })),
    )

    expect(mocks.controlsTargetSet.mock.calls).toHaveLength(framesAfterMount)
  })

  it('re-frames the camera when a different member is selected', () => {
    render(<Viewer3D />)
    const framesAfterMount = mocks.controlsTargetSet.mock.calls.length

    act(() => useAppStore.getState().selectMember('2F-X2Y2'))

    expect(
      mocks.controlsTargetSet.mock.calls.length,
    ).toBeGreaterThan(framesAfterMount)
  })
})
