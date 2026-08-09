'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { ColumnSection, Member } from '@/domain/model/member'
import { findSection, type Story } from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { quantityLineId, type QuantityLine } from '@/domain/quantity'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import {
  CAMERA_FOV_DEGREES,
  easeOutCubic,
  fitCamera,
  flyInStartPose,
  lerpCameraFit,
  rebarRadius,
  rebarSegments,
  type Bounds,
  type CameraFit,
  type Point3,
} from './geometry'
import styles from './Viewer3D.module.css'

const MILLIMETRES_TO_SCENE = 0.001
const CYLINDER_RADIAL_SEGMENTS = 8
const CONTROLS_DAMPING = 0.08
const REBAR_COLOR = 0xb8b3a6
const HIGHLIGHT_COLOR = 0xf54e00
const OUTLINE_COLOR = 0x4a483c
const BACKGROUND_COLOR = 0x1b1a14
const CONCRETE_COLOR = 0x55524a
const GRID_COLOR_SOFT = 0x2a2820
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const LIGHT_DIRECTION = new THREE.Vector3(4, 8, 6).normalize()
const FLY_IN_DURATION_MS = 900
const TRANSITION_DURATION_MS = 550
const FLY_IN_YAW_RADIANS = -Math.PI / 9
const FLY_IN_DISTANCE_SCALE = 1.35
const AUTO_ROTATE_DELAY_MS = 8000
const AUTO_ROTATE_SPEED = 0.5

interface SelectedColumnView {
  member: Member
  section: ColumnSection
  story: Story
  rebars: Rebar[]
  rowIds: Map<Rebar['id'], QuantityLine['id']>
}

interface CameraTween {
  from: CameraFit
  to: CameraFit
  startedAt: number
  duration: number
}

interface ViewerRuntime {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  directionalLight: THREE.DirectionalLight
  envTexture: THREE.Texture
  content: THREE.Group | null
  contentMaterials: THREE.Material[]
  normalMaterial: THREE.MeshStandardMaterial | null
  highlightMaterial: THREE.MeshStandardMaterial | null
  pickableMeshes: THREE.Mesh[]
  // 카메라 연출 상태 — 씬 콘텐츠(rebuild 수명)가 아니라 마운트 수명이다.
  cameraTween: CameraTween | null
  lastInteractionAt: number
  initialFitDone: boolean
}

function vector(point: Point3): THREE.Vector3 {
  return new THREE.Vector3(...point).multiplyScalar(MILLIMETRES_TO_SCENE)
}

function disposeContent(runtime: ViewerRuntime): void {
  const { content } = runtime
  if (content === null) return

  const geometries = new Set<THREE.BufferGeometry>()
  content.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry)
    }
  })

  runtime.scene.remove(content)
  for (const geometry of geometries) geometry.dispose()
  for (const material of new Set(runtime.contentMaterials)) material.dispose()

  runtime.content = null
  runtime.contentMaterials = []
  runtime.normalMaterial = null
  runtime.highlightMaterial = null
  runtime.pickableMeshes = []
}

function columnBounds(view: SelectedColumnView): Bounds {
  const { section, story, rebars } = view
  const bounds: Bounds = {
    min: [0, 0, 0],
    max: [section.b, story.height, section.d],
  }

  for (const rebar of rebars) {
    const radius = rebarRadius(rebar.size)
    for (const segment of rebarSegments(rebar, section)) {
      for (const point of [segment.from, segment.to]) {
        for (let axis = 0; axis < point.length; axis += 1) {
          bounds.min[axis] = Math.min(bounds.min[axis], point[axis] - radius)
          bounds.max[axis] = Math.max(bounds.max[axis], point[axis] + radius)
        }
      }
    }
  }

  return bounds
}

function addMemberOutline(
  content: THREE.Group,
  view: SelectedColumnView,
  materials: THREE.Material[],
): void {
  const { section, story } = view
  const box = new THREE.BoxGeometry(
    section.b * MILLIMETRES_TO_SCENE,
    story.height * MILLIMETRES_TO_SCENE,
    section.d * MILLIMETRES_TO_SCENE,
  )
  const edges = new THREE.EdgesGeometry(box)
  const material = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR })
  const outline = new THREE.LineSegments(edges, material)

  box.dispose()
  outline.position.set(
    (section.b * MILLIMETRES_TO_SCENE) / 2,
    (story.height * MILLIMETRES_TO_SCENE) / 2,
    (section.d * MILLIMETRES_TO_SCENE) / 2,
  )
  content.add(outline)
  materials.push(material)
}

function addConcreteSolid(
  content: THREE.Group,
  view: SelectedColumnView,
  materials: THREE.Material[],
): void {
  const { section, story } = view
  const material = new THREE.MeshStandardMaterial({
    color: CONCRETE_COLOR,
    transparent: true,
    opacity: 0.14,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
  })
  const solid = new THREE.Mesh(
    new THREE.BoxGeometry(
      section.b * MILLIMETRES_TO_SCENE,
      story.height * MILLIMETRES_TO_SCENE,
      section.d * MILLIMETRES_TO_SCENE,
    ),
    material,
  )

  solid.position.set(
    (section.b * MILLIMETRES_TO_SCENE) / 2,
    (story.height * MILLIMETRES_TO_SCENE) / 2,
    (section.d * MILLIMETRES_TO_SCENE) / 2,
  )
  solid.receiveShadow = true
  content.add(solid)
  materials.push(material)
}

function addGround(
  content: THREE.Group,
  bounds: Bounds,
  materials: THREE.Material[],
): void {
  const centerX = ((bounds.min[0] + bounds.max[0]) / 2) * MILLIMETRES_TO_SCENE
  const centerZ = ((bounds.min[2] + bounds.max[2]) / 2) * MILLIMETRES_TO_SCENE
  const floorY = bounds.min[1] * MILLIMETRES_TO_SCENE
  const span =
    Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) *
    MILLIMETRES_TO_SCENE *
    3

  const grid = new THREE.GridHelper(span, 24, OUTLINE_COLOR, GRID_COLOR_SOFT)
  grid.position.set(centerX, floorY, centerZ)
  content.add(grid)
  materials.push(
    ...(Array.isArray(grid.material) ? grid.material : [grid.material]),
  )

  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.3 })
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(span, span),
    shadowMaterial,
  )
  plane.rotation.x = -Math.PI / 2
  // 그리드보다 살짝 아래 — z-fight 방지
  plane.position.set(centerX, floorY - 0.002, centerZ)
  plane.receiveShadow = true
  content.add(plane)
  materials.push(shadowMaterial)
}

function fitShadowToBounds(
  light: THREE.DirectionalLight,
  bounds: Bounds,
): void {
  const center = new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ).multiplyScalar(MILLIMETRES_TO_SCENE)
  const radius = Math.max(
    0.001,
    (Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ) /
      2) *
      MILLIMETRES_TO_SCENE,
  )

  light.position.copy(center).addScaledVector(LIGHT_DIRECTION, radius * 2.5)
  light.target.position.copy(center)
  light.target.updateMatrixWorld()

  const shadowCamera = light.shadow.camera
  shadowCamera.left = -radius * 1.4
  shadowCamera.right = radius * 1.4
  shadowCamera.top = radius * 1.4
  shadowCamera.bottom = -radius * 1.4
  shadowCamera.near = radius * 0.5
  shadowCamera.far = radius * 5
  shadowCamera.updateProjectionMatrix()
}

function createSegmentMesh(
  segment: ReturnType<typeof rebarSegments>[number],
  material: THREE.MeshStandardMaterial,
  rowId: QuantityLine['id'],
): THREE.Mesh | null {
  const from = vector(segment.from)
  const to = vector(segment.to)
  const direction = to.clone().sub(from)
  const length = direction.length()

  if (length === 0) return null

  const geometry = new THREE.CylinderGeometry(
    segment.radius * MILLIMETRES_TO_SCENE,
    segment.radius * MILLIMETRES_TO_SCENE,
    length,
    CYLINDER_RADIAL_SEGMENTS,
  )
  const mesh = new THREE.Mesh(geometry, material)

  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize())
  mesh.castShadow = true
  mesh.userData.rowId = rowId
  return mesh
}

function toSceneFit(fit: CameraFit): CameraFit {
  const scale = (point: Point3): Point3 => [
    point[0] * MILLIMETRES_TO_SCENE,
    point[1] * MILLIMETRES_TO_SCENE,
    point[2] * MILLIMETRES_TO_SCENE,
  ]

  return { position: scale(fit.position), target: scale(fit.target) }
}

function applyCameraFit(runtime: ViewerRuntime, fit: CameraFit): void {
  runtime.camera.position.set(...fit.position)
  runtime.controls.target.set(...fit.target)
  runtime.camera.lookAt(runtime.controls.target)
  runtime.camera.updateProjectionMatrix()
  runtime.controls.update()
}

function startCameraTween(runtime: ViewerRuntime, fittedMm: CameraFit): void {
  const to = toSceneFit(fittedMm)
  let from: CameraFit
  let duration: number

  if (runtime.initialFitDone) {
    from = {
      position: runtime.camera.position.toArray() as Point3,
      target: [
        runtime.controls.target.x,
        runtime.controls.target.y,
        runtime.controls.target.z,
      ],
    }
    duration = TRANSITION_DURATION_MS
  } else {
    from = flyInStartPose(to, FLY_IN_YAW_RADIANS, FLY_IN_DISTANCE_SCALE)
    duration = FLY_IN_DURATION_MS
    runtime.initialFitDone = true
  }

  runtime.cameraTween = {
    from,
    to,
    startedAt: performance.now(),
    duration,
  }
  applyCameraFit(runtime, from)
}

function applyHighlight(
  runtime: ViewerRuntime,
  hoverRowId: string | null,
): void {
  const { normalMaterial, highlightMaterial } = runtime
  if (normalMaterial === null || highlightMaterial === null) return

  for (const mesh of runtime.pickableMeshes) {
    mesh.material =
      hoverRowId !== null && mesh.userData.rowId === hoverRowId
        ? highlightMaterial
        : normalMaterial
  }
}

function rebuildScene(
  runtime: ViewerRuntime,
  view: SelectedColumnView | null,
  hoverRowId: string | null,
): void {
  disposeContent(runtime)
  if (view === null || view.rebars.length === 0) return

  const content = new THREE.Group()
  const normalMaterial = new THREE.MeshStandardMaterial({
    color: REBAR_COLOR,
    metalness: 0.6,
    roughness: 0.35,
  })
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    metalness: 0.6,
    roughness: 0.35,
    emissive: HIGHLIGHT_COLOR,
    emissiveIntensity: 0.35,
  })
  const materials: THREE.Material[] = [normalMaterial, highlightMaterial]
  const pickableMeshes: THREE.Mesh[] = []
  const bounds = columnBounds(view)

  addMemberOutline(content, view, materials)
  addConcreteSolid(content, view, materials)
  addGround(content, bounds, materials)

  for (const rebar of view.rebars) {
    const rowId = view.rowIds.get(rebar.id)
    if (rowId === undefined) {
      throw new Error(`QuantityLine not found for ${rebar.id}`)
    }

    for (const segment of rebarSegments(rebar, view.section)) {
      const mesh = createSegmentMesh(segment, normalMaterial, rowId)
      if (mesh === null) continue
      content.add(mesh)
      pickableMeshes.push(mesh)
    }
  }

  runtime.content = content
  runtime.contentMaterials = materials
  runtime.normalMaterial = normalMaterial
  runtime.highlightMaterial = highlightMaterial
  runtime.pickableMeshes = pickableMeshes
  runtime.scene.add(content)
  fitShadowToBounds(runtime.directionalLight, bounds)

  const fitted = fitCamera(bounds)
  const fogDistance =
    Math.hypot(
      fitted.position[0] - fitted.target[0],
      fitted.position[1] - fitted.target[1],
      fitted.position[2] - fitted.target[2],
    ) * MILLIMETRES_TO_SCENE
  runtime.scene.fog = new THREE.Fog(
    BACKGROUND_COLOR,
    fogDistance * 1.6,
    fogDistance * 4,
  )
  startCameraTween(runtime, fitted)
  applyHighlight(runtime, hoverRowId)
}

function selectedColumnView(
  memberId: string | null,
  selectedGroup: string | null,
  project: ReturnType<typeof useAppStore.getState>['project'],
  rebars: Rebar[],
  lines: QuantityLine[],
): SelectedColumnView | null {
  if (memberId === null || selectedGroup === null) return null

  const member = project.members.find(({ id }) => id === memberId)
  if (member === undefined || member.kind !== '柱') return null

  const section = findSection(project, member.sectionId)
  if (section.kind !== '柱') {
    throw new Error(`柱 member references a non-柱 section: ${member.id}`)
  }

  const story = project.stories.find(({ id }) => id === member.storyId)
  if (story === undefined) {
    throw new Error(`Story not found: ${member.storyId}`)
  }

  const selectedRebars = rebars.filter((rebar) => rebar.memberId === memberId)
  const selectedLineIds = new Set(
    lines.filter(({ groupId }) => groupId === selectedGroup).map(({ id }) => id),
  )
  const rowIds = new Map(
    selectedRebars
      .map((rebar) => [rebar.id, quantityLineId(selectedGroup, rebar)] as const)
      .filter(([, lineId]) => selectedLineIds.has(lineId)),
  )

  return { member, section, story, rebars: selectedRebars, rowIds }
}

export function Viewer3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ViewerRuntime | null>(null)
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
  const locale = useAppStore(({ locale }) => locale)
  const project = useAppStore(({ project }) => project)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectedGroup = useAppStore(({ sel }) => sel.group)
  const hoverRowId = useAppStore(({ hoverRowId: rowId }) => rowId)
  const { rebars, lines } = useTakeoff()
  const setHoverRowRef = useRef(setHoverRow)
  const hoverRowIdRef = useRef(hoverRowId)
  setHoverRowRef.current = setHoverRow
  hoverRowIdRef.current = hoverRowId

  const view = useMemo(
    () =>
      selectedColumnView(
        selectedMemberId,
        selectedGroup,
        project,
        rebars,
        lines,
      ),
    [lines, project, rebars, selectedGroup, selectedMemberId],
  )

  useEffect(() => {
    const mount = mountRef.current
    if (mount === null) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BACKGROUND_COLOR)

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEGREES,
      1,
      0.01,
      1000,
    )
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = styles.canvas
    mount.appendChild(renderer.domElement)

    // metalness는 반사할 환경이 있어야 산다 — RoomEnvironment를 PMREM으로 굽는다.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.environment = envTexture
    scene.environmentIntensity = 0.6

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = CONTROLS_DAMPING
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED

    scene.add(new THREE.HemisphereLight(0xffffff, 0x37352d, 0.5))
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8)
    directionalLight.position.set(4, 8, 6)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(2048, 2048)
    directionalLight.shadow.bias = -0.0005
    scene.add(directionalLight)
    scene.add(directionalLight.target)

    const runtime: ViewerRuntime = {
      scene,
      camera,
      renderer,
      controls,
      directionalLight,
      envTexture,
      content: null,
      contentMaterials: [],
      normalMaterial: null,
      highlightMaterial: null,
      pickableMeshes: [],
      cameraTween: null,
      lastInteractionAt: performance.now(),
      initialFitDone: false,
    }
    runtimeRef.current = runtime

    // 사용자가 잡으면 사용자가 이긴다 — 연출을 즉시 끊는다.
    controls.addEventListener('start', () => {
      runtime.cameraTween = null
      runtime.lastInteractionAt = performance.now()
    })

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {
        width: mount.clientWidth,
        height: mount.clientHeight,
      }
      if (width <= 0 || height <= 0) return

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    })
    observer.observe(mount)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const handleClick = (event: MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return

      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(runtime.pickableMeshes, false)[0]
      const rowId = hit?.object.userData.rowId
      if (typeof rowId === 'string') setHoverRowRef.current(rowId)
    }
    renderer.domElement.addEventListener('click', handleClick)

    let animationFrame = 0
    const renderFrame = () => {
      const tween = runtime.cameraTween
      if (tween !== null) {
        const progress = (performance.now() - tween.startedAt) / tween.duration
        const fit = lerpCameraFit(tween.from, tween.to, easeOutCubic(progress))
        camera.position.set(...fit.position)
        controls.target.set(...fit.target)
        if (progress >= 1) runtime.cameraTween = null
      }
      controls.autoRotate =
        runtime.cameraTween === null &&
        performance.now() - runtime.lastInteractionAt > AUTO_ROTATE_DELAY_MS
      controls.update()
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(renderFrame)
    }
    animationFrame = window.requestAnimationFrame(renderFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      renderer.domElement.removeEventListener('click', handleClick)
      observer.disconnect()
      disposeContent(runtime)
      envTexture.dispose()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    rebuildScene(runtime, view, hoverRowIdRef.current)
  }, [view])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    applyHighlight(runtime, hoverRowId)
  }, [hoverRowId])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    runtime.renderer.domElement.setAttribute(
      'aria-label',
      t(locale, 'viewer.canvas'),
    )
  }, [locale])

  const selectedKind = project.members.find(
    ({ id }) => id === selectedMemberId,
  )?.kind

  return (
    <div ref={mountRef} className={styles.viewer}>
      <div className={styles.meta}>
        <span className={styles.memberId}>
          {selectedMemberId ?? t(locale, 'viewer.selectMember')}
        </span>
        <span className={styles.scaleNotice}>
          {t(locale, 'viewer.scaleNotice')}
        </span>
      </div>
      {view === null && (
        <div className={styles.empty}>
          {selectedKind === '大梁'
            ? t(locale, 'viewer.girderPending')
            : t(locale, 'viewer.empty')}
        </div>
      )}
    </div>
  )
}
