'use client'

import { useEffect, useMemo, useRef } from 'react'
import posthog from 'posthog-js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { ColumnSection, Member } from '@/domain/model/member'
import { findSection, type Project, type Story } from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { quantityLineId, type QuantityLine } from '@/domain/quantity'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'

import {
  buildingLayout,
  groupInstancesByRadius,
  type BuildingLayout,
} from './building'
import {
  CAMERA_FOV_DEGREES,
  easeOutCubic,
  fitCamera,
  flyInStartPose,
  lerpCameraFit,
  rebarBatches,
  rebarRadius,
  rebarSegments,
  type RebarBatch,
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

type ViewerView =
  | { mode: 'member'; column: SelectedColumnView }
  | { mode: 'building'; layout: BuildingLayout }

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
  concreteNormalMaterial: THREE.MeshStandardMaterial | null
  concreteSelectedMaterial: THREE.MeshStandardMaterial | null
  pickableMeshes: THREE.Mesh[]
  // 카메라 연출 상태 — 씬 콘텐츠(rebuild 수명)가 아니라 마운트 수명이다.
  cameraTween: CameraTween | null
  lastInteractionAt: number
  initialFitDone: boolean
  /** 마지막으로 카메라를 맞춘 대상(부재/모드). 같은 대상을 편집하는 동안은 시점을 뺏지 않는다. */
  fittedTargetKey: string | null
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
  runtime.concreteNormalMaterial = null
  runtime.concreteSelectedMaterial = null
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

/**
 * 한 내역서 행의 모든 세그먼트를 **하나의 지오메트리**로 합친다. 기둥 1개가
 * 세그먼트 156개인데 메시로 156개를 만들면 드로우콜도 156회이고, 편집 때마다
 * 그만큼 폐기·재생성한다. 강조 단위가 어차피 행이므로 행이 곧 메시다.
 */
function createBatchMesh(
  batch: RebarBatch,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = []

  for (const segment of batch.segments) {
    const from = vector(segment.from)
    const to = vector(segment.to)
    const direction = to.clone().sub(from)
    const length = direction.length()

    if (length === 0) continue

    const part = new THREE.CylinderGeometry(
      segment.radius * MILLIMETRES_TO_SCENE,
      segment.radius * MILLIMETRES_TO_SCENE,
      length,
      CYLINDER_RADIAL_SEGMENTS,
    )
    const placement = new THREE.Matrix4()
      .makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          Y_AXIS,
          direction.normalize(),
        ),
      )
      .setPosition(from.clone().add(to).multiplyScalar(0.5))

    part.applyMatrix4(placement)
    parts.push(part)
  }

  if (parts.length === 0) return null

  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()

  if (merged === null) return null

  const mesh = new THREE.Mesh(merged, material)
  mesh.castShadow = true
  mesh.userData.rowId = batch.rowId
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

/** 建物 뷰에서 선택 부재의 콘크리트만 강조 재질로 스왑한다. */
function applyBuildingSelection(
  runtime: ViewerRuntime,
  selectedMemberId: string | null,
): void {
  const { concreteNormalMaterial, concreteSelectedMaterial } = runtime
  if (concreteNormalMaterial === null || concreteSelectedMaterial === null) {
    return
  }

  for (const mesh of runtime.pickableMeshes) {
    const memberId: unknown = mesh.userData.memberId
    if (typeof memberId !== 'string') continue
    mesh.material =
      memberId === selectedMemberId
        ? concreteSelectedMaterial
        : concreteNormalMaterial
  }
}

/**
 * 콘텐츠 바운즈에 그림자·fog를 맞춘다 — 두 모드 공통. 시점은 대상(부재/모드)이
 * 바뀔 때만 다시 잡는다. 같은 부재의 단면을 손보는 동안 카메라가 튀면
 * 사용자가 맞춰 둔 각도를 매 입력마다 잃는다 (docs/UX.md §4.2).
 */
function frameContent(
  runtime: ViewerRuntime,
  bounds: Bounds,
  targetKey: string,
): void {
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

  if (runtime.fittedTargetKey !== targetKey) {
    startCameraTween(runtime, fitted)
    runtime.fittedTargetKey = targetKey
  }
}

function rebuildScene(
  runtime: ViewerRuntime,
  view: ViewerView | null,
  hoverRowId: string | null,
): void {
  disposeContent(runtime)
  if (view === null) {
    runtime.fittedTargetKey = null
    return
  }

  if (view.mode === 'building') {
    rebuildBuildingScene(runtime, view.layout)
    return
  }
  rebuildMemberScene(runtime, view.column, hoverRowId)
}

function rebuildMemberScene(
  runtime: ViewerRuntime,
  view: SelectedColumnView,
  hoverRowId: string | null,
): void {
  if (view.rebars.length === 0) {
    runtime.fittedTargetKey = null
    return
  }

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

  const entries = view.rebars.map((rebar) => {
    const rowId = view.rowIds.get(rebar.id)
    if (rowId === undefined) {
      throw new Error(`QuantityLine not found for ${rebar.id}`)
    }
    return { rowId, rebar }
  })

  for (const batch of rebarBatches(entries, view.section)) {
    const mesh = createBatchMesh(batch, normalMaterial)
    if (mesh === null) continue
    content.add(mesh)
    pickableMeshes.push(mesh)
  }

  runtime.content = content
  runtime.contentMaterials = materials
  runtime.normalMaterial = normalMaterial
  runtime.highlightMaterial = highlightMaterial
  runtime.pickableMeshes = pickableMeshes
  runtime.scene.add(content)
  frameContent(runtime, bounds, `member:${view.member.id}`)
  applyHighlight(runtime, hoverRowId)
}

function rebuildBuildingScene(
  runtime: ViewerRuntime,
  layout: BuildingLayout,
): void {
  const content = new THREE.Group()
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: REBAR_COLOR,
    metalness: 0.6,
    roughness: 0.35,
  })
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: CONCRETE_COLOR,
    transparent: true,
    opacity: 0.18,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
  })
  const concreteSelectedMaterial = new THREE.MeshStandardMaterial({
    color: CONCRETE_COLOR,
    transparent: true,
    opacity: 0.18,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
    emissive: HIGHLIGHT_COLOR,
    emissiveIntensity: 0.3,
  })
  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR })
  const materials: THREE.Material[] = [
    steelMaterial,
    concreteMaterial,
    concreteSelectedMaterial,
    outlineMaterial,
  ]
  const pickableMeshes: THREE.Mesh[] = []

  for (const box of layout.boxes) {
    const geometry = new THREE.BoxGeometry(
      box.size[0] * MILLIMETRES_TO_SCENE,
      box.size[1] * MILLIMETRES_TO_SCENE,
      box.size[2] * MILLIMETRES_TO_SCENE,
    )
    const mesh = new THREE.Mesh(geometry, concreteMaterial)
    mesh.position.copy(vector(box.center))
    mesh.receiveShadow = true
    mesh.userData.memberId = box.memberId
    content.add(mesh)
    pickableMeshes.push(mesh)

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      outlineMaterial,
    )
    outline.position.copy(mesh.position)
    content.add(outline)
  }

  // 철근은 표시 반경별 InstancedMesh — 단위 높이 실린더를 Y 스케일로 늘인다 (R4).
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const direction = new THREE.Vector3()

  for (const [radius, instances] of groupInstancesByRadius(layout.rebar)) {
    const geometry = new THREE.CylinderGeometry(
      radius * MILLIMETRES_TO_SCENE,
      radius * MILLIMETRES_TO_SCENE,
      1,
      CYLINDER_RADIAL_SEGMENTS,
    )
    const instanced = new THREE.InstancedMesh(
      geometry,
      steelMaterial,
      instances.length,
    )
    const memberIds: string[] = []

    instances.forEach((instance, index) => {
      const from = vector(instance.from)
      const to = vector(instance.to)
      direction.copy(to).sub(from)
      const length = Math.max(direction.length(), Number.EPSILON)
      if (direction.lengthSq() === 0) direction.copy(Y_AXIS)
      position.copy(from).add(to).multiplyScalar(0.5)
      quaternion.setFromUnitVectors(Y_AXIS, direction.normalize())
      scale.set(1, length, 1)
      matrix.compose(position, quaternion, scale)
      instanced.setMatrixAt(index, matrix)
      memberIds.push(instance.memberId)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.castShadow = true
    instanced.userData.memberIds = memberIds
    content.add(instanced)
    pickableMeshes.push(instanced)
  }

  addGround(content, layout.bounds, materials)

  runtime.content = content
  runtime.contentMaterials = materials
  runtime.concreteNormalMaterial = concreteMaterial
  runtime.concreteSelectedMaterial = concreteSelectedMaterial
  runtime.pickableMeshes = pickableMeshes
  runtime.scene.add(content)
  frameContent(runtime, layout.bounds, 'building')
}

/**
 * 씬을 다시 지을 이유가 되는 값만 모은 키. `Project`가 바뀔 때마다 `rebars`·
 * `lines` 배열은 새로 만들어지므로 참조 비교로는 매번 재생성된다 — 備考 한 글자에
 * 기둥 전체를 폐기하고 다시 만들지 않으려면 내용으로 비교해야 한다.
 */
function geometryKey(view: SelectedColumnView): string {
  return JSON.stringify([
    view.member.id,
    view.section.b,
    view.section.d,
    view.section.hoop,
    view.story.height,
    view.rebars.map(({ role, size, count, closed, points }) => [
      role,
      size,
      count,
      closed,
      points,
    ]),
    [...view.rowIds],
  ])
}

/** 建物 뷰의 재구성 사유: 격자·층·단면·부재 구성이 바뀔 때만. 備考는 들어가지 않는다. */
function buildingGeometryKey(project: Project): string {
  return JSON.stringify([
    project.grid,
    project.stories,
    project.sections,
    project.members,
  ])
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
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const locale = useAppStore(({ locale }) => locale)
  const project = useAppStore(({ project }) => project)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectedGroup = useAppStore(({ sel }) => sel.group)
  const hoverRowId = useAppStore(({ hoverRowId: rowId }) => rowId)
  const viewerMode = useAppStore(({ viewerMode }) => viewerMode)
  const { rebars, lines } = useTakeoff()
  const setHoverRowRef = useRef(setHoverRow)
  const selectMemberRef = useRef(selectMember)
  const hoverRowIdRef = useRef(hoverRowId)
  setHoverRowRef.current = setHoverRow
  selectMemberRef.current = selectMember
  hoverRowIdRef.current = hoverRowId

  // 建物 레이아웃은 선택과 무관하다 — 선택 변경마다 씬을 재구성하지 않는다.
  const layout = useMemo(
    () => (viewerMode === 'building' ? buildingLayout(project, rebars) : null),
    [project, rebars, viewerMode],
  )
  const column = useMemo(
    () =>
      viewerMode === 'member'
        ? selectedColumnView(
            selectedMemberId,
            selectedGroup,
            project,
            rebars,
            lines,
          )
        : null,
    [lines, project, rebars, selectedGroup, selectedMemberId, viewerMode],
  )
  const view = useMemo((): ViewerView | null => {
    if (layout !== null) return { mode: 'building', layout }
    if (column !== null) return { mode: 'member', column }
    return null
  }, [column, layout])
  const viewRef = useRef(view)
  viewRef.current = view
  const sceneKey = useMemo(() => {
    if (view === null) return ''
    if (view.mode === 'building') return `b:${buildingGeometryKey(project)}`
    return `m:${geometryKey(view.column)}`
  }, [project, view])

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
      concreteNormalMaterial: null,
      concreteSelectedMaterial: null,
      pickableMeshes: [],
      cameraTween: null,
      lastInteractionAt: performance.now(),
      initialFitDone: false,
      fittedTargetKey: null,
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
      if (hit === undefined) return

      // 部材 뷰: 철근 → 내역서 행. 建物 뷰: 콘크리트/철근 → 부재 선택.
      const { rowId, memberId, memberIds } = hit.object.userData
      if (typeof rowId === 'string') {
        setHoverRowRef.current(rowId)
        // 部材 뷰에서 3D가 하는 유일한 일이다 — 이게 안 쓰이면 ADR-016의 근거가 약해진다.
        posthog.capture('rebar_picked')
        return
      }
      const pickedMemberId =
        Array.isArray(memberIds) && typeof hit.instanceId === 'number'
          ? (memberIds[hit.instanceId] as unknown)
          : memberId
      if (typeof pickedMemberId === 'string') {
        selectMemberRef.current(pickedMemberId)
        posthog.capture('member_selected', { source: 'viewer' })
      }
    }
    renderer.domElement.addEventListener('click', handleClick)

    // 컨텍스트 손실은 던지지 않는다 — 캔버스가 그대로 얼어붙고 PaneBoundary도 걸리지
    // 않는다. 복구는 시도하지 않고(마운트가 씬을 소유한다) 보고만 한다.
    const handleContextLost = () => {
      posthog.capture('viewer_webgl_context_lost', {
        mode: viewRef.current?.mode ?? null,
      })
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)

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
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost,
      )
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
    rebuildScene(runtime, viewRef.current, hoverRowIdRef.current)
  }, [sceneKey])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    applyHighlight(runtime, hoverRowId)
  }, [hoverRowId])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    applyBuildingSelection(runtime, selectedMemberId)
  }, [selectedMemberId, view])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    runtime.renderer.domElement.setAttribute(
      'aria-label',
      t(
        locale,
        viewerMode === 'building' ? 'viewer.canvasBuilding' : 'viewer.canvas',
      ),
    )
  }, [locale, viewerMode])

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
