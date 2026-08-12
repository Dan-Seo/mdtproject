import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { girderSpan } from '@/domain/model/project'
import { stirrupPositions } from '@/domain/rebar/stirrup-layout'
import { lookupRule } from '@/domain/rules/lookup'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { sourceLabel } from '@/lib/rule-source'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

const mocks = vi.hoisted(() => ({
  controlsDispose: vi.fn(),
  controlsTargetSet: vi.fn(),
  rendererDispose: vi.fn(),
  resizeDisconnect: vi.fn(),
  envTextureDispose: vi.fn(),
  rendererInstances: [] as Array<{
    localClippingEnabled: boolean
    shadowMap: { enabled: boolean; type: number }
    toneMapping: number
    outputColorSpace: string
  }>,
  pickableCounts: [] as number[],
  pickableMeshes: [] as import('three').Object3D[][],
  raycastIntersections: null as null | ((
    objects: import('three').Object3D[],
  ) => Array<{ object: import('three').Object3D; instanceId?: number }>),
  animationFrames: [] as FrameRequestCallback[],
  sceneObjects: [] as import('three').Object3D[],
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class WebGLRendererMock {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false, type: 0 }
    toneMapping = 0
    toneMappingExposure = 1
    outputColorSpace = ''
    localClippingEnabled = false

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
      mocks.pickableMeshes.push([...objects])
      if (mocks.raycastIntersections !== null) {
        return mocks.raycastIntersections(objects)
      }
      return objects.map((object) => ({ object }))
    }
  }

  class SceneMock extends actual.Scene {
    add(...objects: import('three').Object3D[]) {
      mocks.sceneObjects.push(...objects)
      return super.add(...objects)
    }
  }

  return {
    ...actual,
    PMREMGenerator: PMREMGeneratorMock,
    Raycaster: RaycasterMock,
    Scene: SceneMock,
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

import {
  ACESFilmicToneMapping,
  GridHelper,
  Group,
  InstancedMesh,
  Material,
  Mesh,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from 'three'

import { Viewer3D } from './Viewer3D'
import { REBAR_ZONE_COLORS } from './palette'

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

function latestContent(): Group {
  const content = mocks.sceneObjects
    .filter((object): object is Group => object instanceof Group)
    .at(-1)

  if (content === undefined) throw new Error('Viewer content was not built')
  return content
}

function clipTargetMaterials(content: Group): Material[] {
  const materials = new Set<Material>()

  content.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (!['main', 'hoop', 'concrete'].includes(object.userData.layer)) return

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of objectMaterials) materials.add(material)

    const baseMaterial: unknown = object.userData.baseMaterial
    if (baseMaterial instanceof Material) materials.add(baseMaterial)
  })

  return [...materials]
}

function runNextAnimationFrame(): void {
  const callback = mocks.animationFrames.shift()
  if (callback === undefined) throw new Error('Animation frame not scheduled')
  act(() => callback(performance.now()))
}

describe('Viewer3D', () => {
  beforeEach(() => {
    mocks.controlsDispose.mockClear()
    mocks.controlsTargetSet.mockClear()
    mocks.rendererDispose.mockClear()
    mocks.resizeDisconnect.mockClear()
    mocks.envTextureDispose.mockClear()
    mocks.rendererInstances.length = 0
    mocks.pickableCounts.length = 0
    mocks.pickableMeshes.length = 0
    mocks.raycastIntersections = null
    mocks.animationFrames.length = 0
    mocks.sceneObjects.length = 0
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      mocks.animationFrames.push(callback)
      return mocks.animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    useAppStore.setState({
      project: createSampleProject(),
      sel: { group: '1階|C|C1', memberId: '1F-X1Y1' },
      hoverRowId: null,
      activeStoryId: '1F',
      locale: 'ja',
      viewerMode: 'member',
      viewerLayers: { main: true, hoop: true, concrete: true },
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
    expect(renderer.localClippingEnabled).toBe(true)
  })

  it('creates every concrete and rebar material with one shared clip plane', () => {
    render(<Viewer3D />)

    const materials = clipTargetMaterials(latestContent())
    expect(materials.length).toBeGreaterThan(0)
    const planes = materials.flatMap((material) => material.clippingPlanes ?? [])

    expect(planes).toHaveLength(materials.length)
    expect(new Set(planes)).toHaveLength(1)
    expect(materials.every(({ clipShadows }) => clipShadows)).toBe(true)
  })

  it('keeps the shared plane at a large no-cut constant while disabled', () => {
    render(<Viewer3D />)

    const [material] = clipTargetMaterials(latestContent())
    expect(material.clippingPlanes).toHaveLength(1)
    expect(material.clippingPlanes?.[0].constant).toBeGreaterThanOrEqual(1e6)
  })

  it('does not attach local clipping to the ground grid', () => {
    render(<Viewer3D />)

    const grid = latestContent().children.find(
      (object): object is GridHelper => object instanceof GridHelper,
    )
    expect(grid).toBeDefined()
    const materials = Array.isArray(grid?.material)
      ? grid.material
      : [grid?.material]

    expect(
      materials.every(
        (material) =>
          material !== undefined && material.clippingPlanes === null,
      ),
    ).toBe(true)
  })

  it('updates clip axis and ratio without replacing material instances', () => {
    render(<Viewer3D />)

    const contentBefore = latestContent()
    const materialsBefore = clipTargetMaterials(contentBefore)

    fireEvent.click(screen.getByRole('button', { name: '断面カット' }))
    fireEvent.click(screen.getByRole('button', { name: 'Y軸' }))
    fireEvent.change(screen.getByRole('slider', { name: '切断位置' }), {
      target: { value: '0.75' },
    })

    expect(latestContent()).toBe(contentBefore)
    expect(clipTargetMaterials(latestContent())).toEqual(materialsBefore)
    const plane = materialsBefore[0].clippingPlanes?.[0]
    expect(plane?.normal.toArray()).toEqual([0, 1, 0])
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

  it('renders a supported 大梁 and maps a picked mesh to its 上端筋 row', () => {
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))
    const { result } = renderHook(() => useTakeoff())
    const topLine = result.current.lines.find(
      ({ groupId, role }) => groupId === '1階|G|G1' && role === '上端筋',
    )
    expect(topLine).toBeDefined()
    render(<Viewer3D />)

    const canvas = screen.getByLabelText('選択部材の配筋3D')
    fireEvent.click(canvas, { clientX: 320, clientY: 180 })

    expect(mocks.pickableCounts.at(-1)).toBeGreaterThan(0)
    expect(useAppStore.getState().hoverRowId).toBe(topLine?.id)
  })

  it('shows the selected supported 大梁 zone legend from zones and rule hits', () => {
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))
    const { result } = renderHook(() => useTakeoff())
    const top = result.current.rebars.find(
      ({ memberId, role }) =>
        memberId === '1F-G1-X1Y1-X' && role === '上端筋',
    )
    const lengthMm = top?.zones?.[0]
      ? top.zones[0].pathToMm - top.zones[0].pathFromMm
      : undefined
    expect(lengthMm).toBeDefined()

    const { container } = render(<Viewer3D />)

    // 룰 키는 산정부가 실어 보낸 값을 그대로 쓴다 — 여기 적어 두면 지배 항이
    // 바뀌었을 때 범례가 거짓말을 해도 테스트가 통과한다.
    const legend = screen.getByLabelText('定着・継手凡例')
    expect(legend).toHaveTextContent(
      `定着 ${String(top?.zones?.[0].ruleKey)} ${String(lengthMm)}`,
    )
    const swatch = container.querySelector('[data-zone-kind="定着"]')
    expect(swatch).toHaveStyle({
      backgroundColor: REBAR_ZONE_COLORS.定着,
    })

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })
    const anchorageMesh = mocks.pickableMeshes
      .at(-1)
      ?.find(({ userData }) => userData.zone === '定着')
    const material = anchorageMesh?.userData.baseMaterial as
      | import('three').MeshStandardMaterial
      | undefined
    expect(material?.color.getHexString()).toBe(
      REBAR_ZONE_COLORS.定着.slice(1),
    )
  })

  it('cites the source and flags an unconfirmed value on each legend chip', () => {
    // 出典 표시는 법적 의무다. 범례는 내역서와 달리 出典 열이 없으므로 칩이
    // 스스로 근거를 달아야 하고, 未確認(inferred) 값은 그렇다고 밝혀야 한다.
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))
    const { result } = renderHook(() => useTakeoff())
    const top = result.current.rebars.find(
      ({ memberId, role }) =>
        memberId === '1F-G1-X1Y1-X' && role === '上端筋',
    )
    const ruleKey = top?.zones?.[0].ruleKey
    const rule = top?.ruleHits.find(({ key }) => key === ruleKey)
    expect(rule?.confidence).toBe('inferred')

    render(<Viewer3D />)

    const legend = screen.getByLabelText('定着・継手凡例')
    expect(
      within(legend).getAllByLabelText('未確認の規準値').length,
    ).toBeGreaterThan(0)
    expect(legend).toHaveTextContent(sourceLabel(rule!))
  })

  it('shows the outer-end legend for a continuous-run owner', () => {
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-Y'))

    render(<Viewer3D />)

    expect(screen.getByLabelText('定着・継手凡例')).toBeInTheDocument()
  })

  it('shows the selected 柱 legend from 主筋 zones', () => {
    const anchorageRule = lookupRule(jpMlitRulePack, 'anchorage.L1', {
      fc: 24,
      grade: 'SD345',
      hook: false,
    })
    const expectedLengthMm = anchorageRule.value * 25

    render(<Viewer3D />)

    expect(screen.getByLabelText('定着・継手凡例')).toHaveTextContent(
      `定着 ${anchorageRule.key} ${expectedLengthMm}`,
    )
  })

  it('shows the あばら筋 input pitch and a different terminal gap', () => {
    const pitch = 120
    act(() => {
      useAppStore.getState().updateProject((project) => ({
        ...project,
        sections: project.sections.map((section) =>
          section.id === 'section-G1' && section.kind === '大梁'
            ? { ...section, stirrup: { ...section.stirrup, pitch } }
            : section,
        ),
      }))
      useAppStore.getState().selectMember('1F-G1-X1Y1-X')
    })
    const project = useAppStore.getState().project
    const member = project.members.find(
      ({ id }) => id === '1F-G1-X1Y1-X',
    )
    if (member === undefined) throw new Error('Sample 大梁 not found')
    const section = project.sections.find(
      ({ id }) => id === member.sectionId,
    )
    if (section === undefined || section.kind !== '大梁') {
      throw new Error('Sample 大梁 section not found')
    }
    const span = girderSpan(project, member)
    const { lastGapMm } = stirrupPositions(
      span.clear,
      pitch,
      section.stirrup.startOffsetMm,
    )
    expect(lastGapMm).not.toBe(pitch)

    render(<Viewer3D />)

    expect(screen.getByLabelText('定着・継手凡例')).toHaveTextContent(
      `あばら筋 @${pitch} (末端 ${lastGapMm})`,
    )
  })

  it('renders rebar instead of an unsupported reason for a continuous-run owner', () => {
    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-Y'))
    render(<Viewer3D />)

    expect(screen.queryByText(/連続スパン/)).not.toBeInTheDocument()
    const canvas = screen.getByLabelText('選択部材の配筋3D')
    fireEvent.click(canvas, { clientX: 320, clientY: 180 })
    expect(mocks.pickableCounts.at(-1)).toBeGreaterThan(0)
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

  it('records pointermove without raycasting until the next frame', () => {
    render(<Viewer3D />)
    const canvas = screen.getByLabelText('選択部材の配筋3D')

    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 90 })
    fireEvent.pointerMove(canvas, { clientX: 320, clientY: 180 })
    expect(mocks.pickableCounts).toHaveLength(0)

    runNextAnimationFrame()
    expect(mocks.pickableCounts).toHaveLength(1)
  })

  it('shows 役割・径・本数・加工長 from the hovered 部材 row', () => {
    const { result } = renderHook(() => useTakeoff())
    const mainLine = result.current.lines.find(
      ({ groupId, role }) => groupId === '1階|C|C1' && role === '主筋',
    )
    expect(mainLine).toBeDefined()
    render(<Viewer3D />)

    fireEvent.pointerMove(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })
    runNextAnimationFrame()

    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('役割')).toBeInTheDocument()
    expect(within(tooltip).getByText(mainLine?.role ?? '')).toBeInTheDocument()
    expect(within(tooltip).getByText('径')).toBeInTheDocument()
    expect(within(tooltip).getByText(mainLine?.size ?? '')).toBeInTheDocument()
    expect(within(tooltip).getByText('本数')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent(String(mainLine?.countPerMember))
    expect(within(tooltip).getByText('加工長')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent(`${mainLine?.lengthMm} mm`)
    // 加工長은 룰 유래 수치다 — 内訳 행과 같은 미확인 표시가 붙어야 한다.
    expect(mainLine?.inferred).toBe(true)
    expect(
      within(tooltip).getByLabelText('未確認の規準値'),
    ).toBeInTheDocument()
  })

  it('hides the 部材 tooltip when its rowId is stale', () => {
    render(<Viewer3D />)
    const canvas = screen.getByLabelText('選択部材の配筋3D')

    fireEvent.pointerMove(canvas, { clientX: 320, clientY: 180 })
    runNextAnimationFrame()
    expect(screen.getByRole('tooltip')).toBeVisible()

    const picked = mocks.pickableMeshes.at(-1)?.[0]
    expect(picked).toBeDefined()
    if (picked !== undefined) picked.userData.rowId = 'stale-row-id'
    fireEvent.pointerMove(canvas, { clientX: 321, clientY: 181 })
    runNextAnimationFrame()

    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible()
  })

  it('shows member id and 符号 for a hovered 建物 instance', () => {
    useAppStore.setState({
      viewerMode: 'building',
      sel: { group: '1階|C|C1', memberId: '1F-X2Y2' },
    })
    render(<Viewer3D />)
    const instance = latestContent().children.find(
      (object): object is InstancedMesh => object instanceof InstancedMesh,
    )
    expect(instance).toBeDefined()
    const memberId = instance?.userData.memberIds[0] as unknown
    expect(typeof memberId).toBe('string')
    mocks.raycastIntersections = () =>
      instance === undefined ? [] : [{ object: instance, instanceId: 0 }]

    fireEvent.pointerMove(screen.getByLabelText('建物全体の3D'), {
      clientX: 320,
      clientY: 180,
    })
    runNextAnimationFrame()

    const member = useAppStore
      .getState()
      .project.members.find(({ id }) => id === memberId)
    const section = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === member?.sectionId)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent(String(memberId))
    expect(tooltip).toHaveTextContent(section?.mark ?? '')
  })

  it('hides the tooltip on pointerleave', () => {
    render(<Viewer3D />)
    const canvas = screen.getByLabelText('選択部材の配筋3D')

    fireEvent.pointerMove(canvas, { clientX: 320, clientY: 180 })
    runNextAnimationFrame()
    expect(screen.getByRole('tooltip')).toBeVisible()

    fireEvent.pointerLeave(canvas)
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible()
  })

  it('skips hidden layer hits when hovering', () => {
    render(<Viewer3D />)
    fireEvent.click(screen.getByRole('button', { name: '主筋' }))

    fireEvent.pointerMove(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })
    runNextAnimationFrame()

    expect(screen.getByRole('tooltip')).toHaveTextContent('帯筋')
  })

  it('keeps clipped geometry hoverable as the documented MVP policy', () => {
    render(<Viewer3D />)
    fireEvent.click(screen.getByRole('button', { name: '断面カット' }))

    fireEvent.pointerMove(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })
    runNextAnimationFrame()

    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it('does not change store selection state while hovering', () => {
    render(<Viewer3D />)
    const selectionBefore = useAppStore.getState().sel
    const rowSelectionBefore = useAppStore.getState().hoverRowId

    fireEvent.pointerMove(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })
    runNextAnimationFrame()

    expect(useAppStore.getState().sel).toEqual(selectionBefore)
    expect(useAppStore.getState().hoverRowId).toBe(rowSelectionBefore)
  })

  it('hides only the hoop layer by switching mesh visibility', async () => {
    const THREE = await import('three')
    render(<Viewer3D />)

    const hoopToggle = screen.getByRole('button', { name: '帯筋・あばら筋' })
    expect(hoopToggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(hoopToggle)
    expect(hoopToggle).toHaveAttribute('aria-pressed', 'false')

    const content = mocks.sceneObjects
      .filter((object) => object instanceof THREE.Group)
      .at(-1)
    const mainMeshes: import('three').Object3D[] = []
    const hoopMeshes: import('three').Object3D[] = []
    content?.traverse((object) => {
      if (object.userData.layer === 'main') mainMeshes.push(object)
      if (object.userData.layer === 'hoop') hoopMeshes.push(object)
    })

    expect(mainMeshes.length).toBeGreaterThan(0)
    expect(hoopMeshes.length).toBeGreaterThan(0)
    expect(mainMeshes.every(({ visible }) => visible)).toBe(true)
    expect(hoopMeshes.every(({ visible }) => !visible)).toBe(true)
  })

  it('keeps concrete outlines visible when concrete solids are hidden', async () => {
    const THREE = await import('three')
    render(<Viewer3D />)

    fireEvent.click(screen.getByRole('button', { name: 'コンクリート' }))

    const content = mocks.sceneObjects
      .filter((object) => object instanceof THREE.Group)
      .at(-1)
    const concreteSolids: import('three').Object3D[] = []
    const concreteOutlines: import('three').Object3D[] = []
    content?.traverse((object) => {
      if (object.userData.layer !== 'concrete') return
      if (object instanceof THREE.LineSegments) concreteOutlines.push(object)
      if (object instanceof THREE.Mesh) concreteSolids.push(object)
    })

    expect(concreteSolids.length).toBeGreaterThan(0)
    expect(concreteOutlines.length).toBeGreaterThan(0)
    expect(concreteSolids.every(({ visible }) => !visible)).toBe(true)
    expect(concreteOutlines.every(({ visible }) => visible)).toBe(true)
  })

  it('skips hidden layer hits when picking', () => {
    const { result } = renderHook(() => useTakeoff())
    const hoopLine = result.current.lines.find(
      ({ groupId, role }) => groupId === '1階|C|C1' && role === '帯筋',
    )
    expect(hoopLine).toBeDefined()
    render(<Viewer3D />)

    fireEvent.click(screen.getByRole('button', { name: '主筋' }))
    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    expect(useAppStore.getState().hoverRowId).toBe(hoopLine?.id)
  })

  it('does not rebuild or recreate meshes when a layer is toggled', async () => {
    const THREE = await import('three')
    render(<Viewer3D />)

    const contentsBefore = mocks.sceneObjects.filter(
      (object) => object instanceof THREE.Group,
    )
    const contentBefore = contentsBefore.at(-1)
    const meshesBefore: import('three').Object3D[] = []
    contentBefore?.traverse((object) => {
      if (object.userData.layer !== undefined) meshesBefore.push(object)
    })

    fireEvent.click(screen.getByRole('button', { name: '帯筋・あばら筋' }))

    const contentsAfter = mocks.sceneObjects.filter(
      (object) => object instanceof THREE.Group,
    )
    const meshesAfter: import('three').Object3D[] = []
    contentsAfter.at(-1)?.traverse((object) => {
      if (object.userData.layer !== undefined) meshesAfter.push(object)
    })
    expect(contentsAfter).toHaveLength(contentsBefore.length)
    expect(contentsAfter.at(-1)).toBe(contentBefore)
    expect(meshesAfter).toEqual(meshesBefore)
  })

  it('builds one pickable mesh per row and contiguous zone, not per segment', () => {
    render(<Viewer3D />)

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    // 柱 C1 は 主筋の定着・コアと帯筋の3バッチ。セグメント単位には分けない。
    expect(mocks.pickableCounts.at(-1)).toBe(3)
  })

  it('restores each zone material after row highlighting is cleared', () => {
    render(<Viewer3D />)

    fireEvent.click(screen.getByLabelText('選択部材の配筋3D'), {
      clientX: 320,
      clientY: 180,
    })

    const anchorageMesh = mocks.pickableMeshes
      .at(-1)
      ?.find(({ userData }) => userData.zone === '定着')
    const coreMesh = mocks.pickableMeshes
      .at(-1)
      ?.find(({ userData }) => userData.zone === null)
    expect(anchorageMesh).toBeDefined()
    expect(coreMesh).toBeDefined()
    expect(anchorageMesh?.userData.layer).toBe('main')
    const baseMaterial = anchorageMesh?.userData.baseMaterial
    expect(baseMaterial).toBeDefined()
    expect(baseMaterial).not.toBe(coreMesh?.userData.baseMaterial)
    expect((anchorageMesh as import('three').Mesh).material).not.toBe(
      baseMaterial,
    )

    act(() => useAppStore.getState().setHoverRow(null))

    expect((anchorageMesh as import('three').Mesh).material).toBe(baseMaterial)
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

  it('rebuilds when the 帯筋 배치 moves without changing 本数', async () => {
    // 上部大梁せい 750→740이면 配置区間이 3450→3460이 되지만 本数는 36 그대로다.
    // 배치는 placement에서 나오므로, 키가 placement를 빼면 3D가 옛 위치를 유지한다.
    const THREE = await import('three')
    render(<Viewer3D />)

    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')

    act(() =>
      useAppStore.getState().updateProject((project) => ({
        ...project,
        sections: project.sections.map((section) =>
          section.id === 'section-G1' && section.kind === '大梁'
            ? { ...section, depth: 740 }
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
