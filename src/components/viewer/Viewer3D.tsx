'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type {
  ColumnSection,
  GirderSection,
  Member,
} from '@/domain/model/member'
import {
  findSection,
  girderRun,
  girderSupportSections,
  storyNotFound,
  type GirderRun,
  type Project,
  type Story,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import type { UnsupportedReason } from '@/domain/model/unsupported'
import {
  massLines,
  quantityLineId,
  type MassQuantityLine,
  type QuantityLine,
} from '@/domain/quantity'
import type { RuleHit } from '@/domain/rules/types'
import {
  useTakeoff,
  type UnsupportedMember,
} from '@/lib/hooks/useTakeoff'
import { t } from '@/lib/i18n'
import { sourceLabel, sourceTooltip } from '@/lib/rule-source'
import {
  useAppStore,
  type ViewerLayer,
} from '@/lib/store'
import { capture } from '@/lib/telemetry'

import {
  buildingLayout,
  groupInstancesByLayerAndRadius,
  type BuildingLayout,
} from '@/lib/viewer/building'
import {
  CAMERA_FOV_DEGREES,
  clipPlaneForMm,
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
  type ClipAxis,
  type Point3,
} from '@/lib/viewer/geometry'
import { legendEntries } from './legend'
import { REBAR_ZONE_COLORS } from './palette'
import { ViewerLayerControls } from './ViewerTabs'
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
const CLIP_DISABLED_CONSTANT = 1e6
const CLIP_AXES: ClipAxis[] = ['x', 'y', 'z']

interface ClipState {
  enabled: boolean
  axis: ClipAxis
  ratio: number
}

type HoverTooltip =
  | {
      key: string
      kind: 'member'
      // 3D は継手を描かない（位置に根拠がない）ので、ホバーで当たるのは質量行だけだ。
      line: Pick<
        MassQuantityLine,
        | 'id'
        | 'role'
        | 'size'
        | 'countPerMember'
        | 'lengthMm'
        | 'confidence'
        | 'rules'
      >
    }
  | {
      key: string
      kind: 'building'
      memberId: string
      mark: string
    }

interface SelectedColumnView {
  kind: '柱'
  member: Member
  section: ColumnSection
  story: Story
  rebars: Rebar[]
  rowIds: Map<Rebar['id'], QuantityLine['id']>
}

interface SelectedGirderView {
  kind: '大梁'
  /** 런 대표 부재. 런 안의 어느 스팬을 골라도 같은 부재 뷰를 만든다. */
  member: Member
  section: GirderSection
  story: Story
  run: GirderRun
  /** 런 축방향 순서의 지점 柱 단면. 길이는 run.members.length + 1. */
  supportSections: ColumnSection[]
  rebars: Rebar[]
  rowIds: Map<Rebar['id'], QuantityLine['id']>
}

type SelectedSupportedMemberView = SelectedColumnView | SelectedGirderView

type SelectedMemberView =
  | { status: 'supported'; view: SelectedSupportedMemberView }
  | { status: 'unsupported'; member: Member; reason: UnsupportedReason }

type ViewerView =
  | { mode: 'member'; member: SelectedSupportedMemberView }
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
  clipPlane: THREE.Plane
  content: THREE.Group | null
  /**
   * 머티리얼은 씬 콘텐츠가 아니라 **마운트 수명**이다. 재구축마다 새로 만들어
   * 폐기하면 그때마다 WebGL 프로그램이 삭제·재링크된다 — 断面 편집 1회당
   * 프로그램 여럿이 다시 링크되고, 그 드라이버 스톨이 편집 지연의 대부분이었다.
   * 폐기는 언마운트에서 한 번만 한다.
   */
  materialPool: Map<MaterialKey, THREE.Material>
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

/**
 * 部材/建物 뷰의 철근 머티리얼은 파라미터가 같아도 항목을 나눈다. 建物은
 * InstancedMesh라 USE_INSTANCING 정의가 붙은 별도 프로그램이 필요하고, 하나를
 * 공유하면 탭을 오갈 때마다 그 사이를 오가며 프로그램을 다시 잡는다.
 * concrete/buildingConcrete도 opacity 값이 달라 같은 이유로 나뉜다.
 */
type MaterialKey =
  | 'rebarCore'
  | 'rebarAnchorage'
  | 'rebarHighlight'
  | 'buildingRebar'
  | 'outline'
  | 'concrete'
  | 'grid'
  | 'shadow'
  | 'buildingConcrete'
  | 'buildingConcreteSelected'

/** 풀에 있으면 그대로 쓰고 없으면 만들어 넣는다. 폐기는 언마운트에서만 한다. */
function pooledMaterial<T extends THREE.Material>(
  runtime: ViewerRuntime,
  key: MaterialKey,
  create: () => T,
): T {
  const cached = runtime.materialPool.get(key)
  if (cached !== undefined) return cached as T

  const created = create()
  runtime.materialPool.set(key, created)
  return created
}

/**
 * R4(InstancedMesh 1만 개 규모) 측정용 하네스가 실행 중인 페이지에서 읽는 훅.
 * 컴포넌트 클로저 밖에서는 renderer.info·프레임 타이밍에 닿을 방법이 없어서
 * 마운트 동안만 window에 노출한다 — 프로덕션 동작에는 영향이 없다.
 */
interface RebuildStats {
  lastRebuildMs: number | null
  rebuildCount: number
}
interface KijunViewerRuntimeHook {
  getRendererInfo(): { calls: number; triangles: number }
  getFrameTimestamps(): number[]
  getRebuildStats(): RebuildStats
}
type WindowWithViewerHook = Window & {
  __kijunViewerRuntime?: KijunViewerRuntimeHook
}

function vector(point: Point3): THREE.Vector3 {
  return new THREE.Vector3(...point).multiplyScalar(MILLIMETRES_TO_SCENE)
}

function applyClipPlane(
  plane: THREE.Plane,
  bounds: Bounds | null,
  clip: ClipState,
): void {
  if (!clip.enabled || bounds === null) {
    // 배열을 제거하지 않고 평면만 콘텐츠 밖으로 민다. clippingPlanes 변경은
    // 셰이더 재컴파일을 일으키므로 생성 이후에는 normal/constant만 바꾼다.
    plane.constant = CLIP_DISABLED_CONSTANT
    return
  }

  const { normal, constantMm } = clipPlaneForMm(
    bounds,
    clip.axis,
    clip.ratio,
  )
  plane.normal.set(...normal)
  plane.constant = constantMm * MILLIMETRES_TO_SCENE
}

function disposeContent(runtime: ViewerRuntime): void {
  const { content } = runtime
  if (content === null) return

  const geometries = new Set<THREE.BufferGeometry>()
  content.traverse((object) => {
    // InstancedMesh 도 Mesh 로 잡히지만 인스턴스 행렬 버퍼는 geometry 가 아니라
    // 자신이 쥐고 있다 — 여기서 풀지 않으면 씬을 다시 지을 때마다 GPU 에 쌓인다.
    if (object instanceof THREE.InstancedMesh) object.dispose()
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry)
    }
  })

  runtime.scene.remove(content)
  for (const geometry of geometries) geometry.dispose()
  // 머티리얼은 폐기하지 않는다 — materialPool이 소유하고 언마운트에서 한 번만 정리한다.

  runtime.content = null
  runtime.highlightMaterial = null
  runtime.concreteNormalMaterial = null
  runtime.concreteSelectedMaterial = null
  runtime.pickableMeshes = []
}

interface ConcreteBox {
  size: Point3
  center: Point3
}

function concreteBoxes(view: SelectedSupportedMemberView): ConcreteBox[] {
  if (view.kind === '柱') {
    const { section, story } = view
    return [
      {
        size: [section.b, story.height, section.d],
        center: [section.b / 2, story.height / 2, section.d / 2],
      },
    ]
  }

  const { section, run, story, supportSections } = view
  const stubHeight = Math.min(story.height, section.depth * 2)
  const beamCenterY = section.depth / 2
  const stubCenterY = section.depth - stubHeight / 2
  const centerZ = section.b / 2
  const boxes: ConcreteBox[] = []

  run.spans.forEach((span, index) => {
    // 런 좌표계 오프셋은 도메인이 준다 — 여기서 다시 누적하면 철근 배치와 갈린다.
    const coreOffsetMm = run.memberOffsetsMm[index]
    boxes.push({
      size: [span.clear, section.depth, section.b],
      center: [coreOffsetMm + span.clear / 2, beamCenterY, centerZ],
    })

    if (index === 0) {
      boxes.push({
        size: [
          span.startSupportLengthAlongAxisMm,
          stubHeight,
          span.axis === 'X' ? supportSections[0].d : supportSections[0].b,
        ],
        center: [
          -span.startSupportLengthAlongAxisMm / 2,
          stubCenterY,
          centerZ,
        ],
      })
    }

    boxes.push({
      size: [
        span.endSupportLengthAlongAxisMm,
        stubHeight,
        span.axis === 'X'
          ? supportSections[index + 1].d
          : supportSections[index + 1].b,
      ],
      center: [
        coreOffsetMm + span.clear + span.endSupportLengthAlongAxisMm / 2,
        stubCenterY,
        centerZ,
      ],
    })
  })

  return boxes
}

function memberBounds(view: SelectedSupportedMemberView): Bounds {
  const boxes = concreteBoxes(view)
  const first = boxes[0]
  const bounds: Bounds = {
    min: first.center.map(
      (coordinate, axis) => coordinate - first.size[axis] / 2,
    ) as Point3,
    max: first.center.map(
      (coordinate, axis) => coordinate + first.size[axis] / 2,
    ) as Point3,
  }

  for (const box of boxes.slice(1)) {
    for (let axis = 0; axis < box.center.length; axis += 1) {
      bounds.min[axis] = Math.min(
        bounds.min[axis],
        box.center[axis] - box.size[axis] / 2,
      )
      bounds.max[axis] = Math.max(
        bounds.max[axis],
        box.center[axis] + box.size[axis] / 2,
      )
    }
  }

  for (const rebar of view.rebars) {
    const radius = rebarRadius(rebar.size)
    for (const segment of rebarSegments(rebar, view.section)) {
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

function addMemberConcrete(
  content: THREE.Group,
  view: SelectedSupportedMemberView,
  runtime: ViewerRuntime,
): void {
  const outlineMaterial = pooledMaterial(
    runtime,
    'outline',
    () =>
      new THREE.LineBasicMaterial({
        color: OUTLINE_COLOR,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const concreteMaterial = pooledMaterial(
    runtime,
    'concrete',
    () =>
      new THREE.MeshStandardMaterial({
        color: CONCRETE_COLOR,
        transparent: true,
        opacity: 0.14,
        roughness: 0.9,
        metalness: 0,
        depthWrite: false,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )

  for (const box of concreteBoxes(view)) {
    const geometry = new THREE.BoxGeometry(
      box.size[0] * MILLIMETRES_TO_SCENE,
      box.size[1] * MILLIMETRES_TO_SCENE,
      box.size[2] * MILLIMETRES_TO_SCENE,
    )
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      outlineMaterial,
    )
    const solid = new THREE.Mesh(geometry, concreteMaterial)
    const center = vector(box.center)

    outline.position.copy(center)
    solid.position.copy(center)
    outline.userData.layer = 'concrete'
    solid.userData.layer = 'concrete'
    solid.receiveShadow = true
    content.add(outline, solid)
  }
}

function addGround(
  content: THREE.Group,
  bounds: Bounds,
  runtime: ViewerRuntime,
): void {
  const centerX = ((bounds.min[0] + bounds.max[0]) / 2) * MILLIMETRES_TO_SCENE
  const centerZ = ((bounds.min[2] + bounds.max[2]) / 2) * MILLIMETRES_TO_SCENE
  const floorY = bounds.min[1] * MILLIMETRES_TO_SCENE
  const span =
    Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) *
    MILLIMETRES_TO_SCENE *
    3

  const grid = new THREE.GridHelper(span, 24, OUTLINE_COLOR, GRID_COLOR_SOFT)
  // GridHelper는 머티리얼을 스스로 만든다. 처음 것을 풀에 넣어두고, 이후에는 갓
  // 만들어진 것을 버리고 풀의 것을 쓴다 — 아직 렌더된 적이 없어 프로그램을 잡기
  // 전이라 버려도 된다.
  const gridMaterial = pooledMaterial(runtime, 'grid', () =>
    Array.isArray(grid.material) ? grid.material[0] : grid.material,
  )
  if (grid.material !== gridMaterial) {
    for (const own of Array.isArray(grid.material)
      ? grid.material
      : [grid.material]) {
      own.dispose()
    }
    grid.material = gridMaterial
  }
  grid.position.set(centerX, floorY, centerZ)
  content.add(grid)

  const shadowMaterial = pooledMaterial(
    runtime,
    'shadow',
    () => new THREE.ShadowMaterial({ opacity: 0.3 }),
  )
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(span, span),
    shadowMaterial,
  )
  plane.rotation.x = -Math.PI / 2
  // 그리드보다 살짝 아래 — z-fight 방지
  plane.position.set(centerX, floorY - 0.002, centerZ)
  plane.receiveShadow = true
  content.add(plane)
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
  mesh.userData.layer = batch.layer
  mesh.userData.zone = batch.zone
  mesh.userData.baseMaterial = material
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
  const { highlightMaterial } = runtime
  if (highlightMaterial === null) return

  for (const mesh of runtime.pickableMeshes) {
    const baseMaterial: unknown = mesh.userData.baseMaterial
    if (!(baseMaterial instanceof THREE.Material)) continue

    mesh.material =
      hoverRowId !== null && mesh.userData.rowId === hoverRowId
        ? highlightMaterial
        : baseMaterial
  }
}

function isViewerLayer(value: unknown): value is ViewerLayer {
  return value === 'main' || value === 'hoop' || value === 'concrete'
}

function applyViewerLayers(
  runtime: ViewerRuntime,
  viewerLayers: Record<ViewerLayer, boolean>,
): void {
  runtime.content?.traverse((object) => {
    const layer: unknown = object.userData.layer
    if (!isViewerLayer(layer)) return

    // 제품 결정: 콘크리트를 꺼도 외곽선은 공간 참조로 남긴다. 철근만
    // 허공에 뜨는 상태를 피하기 위해 部材 와이어프레임과 建物 아웃라인은 숨기지 않는다.
    const persistentConcreteOutline =
      layer === 'concrete' && object instanceof THREE.LineSegments
    object.visible = persistentConcreteOutline || viewerLayers[layer]
  })
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current !== null) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function pickVisible(
  runtime: ViewerRuntime,
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
): THREE.Intersection<THREE.Object3D> | undefined {
  raycaster.setFromCamera(pointer, runtime.camera)
  // 알려진 한계(MVP 수용): Raycaster는 CPU 측이라 GPU 클리핑을 모르므로
  // 잘려나간 영역에도 클릭·호버가 걸린다. 레이어 visibility는 양쪽 모두 거른다.
  return raycaster
    .intersectObjects(runtime.pickableMeshes, false)
    .find(({ object }) => isEffectivelyVisible(object))
}

function memberIdFromHit(
  hit: THREE.Intersection<THREE.Object3D>,
): string | null {
  const { memberId, memberIds } = hit.object.userData
  const pickedMemberId =
    Array.isArray(memberIds) && typeof hit.instanceId === 'number'
      ? (memberIds[hit.instanceId] as unknown)
      : memberId
  return typeof pickedMemberId === 'string' ? pickedMemberId : null
}

function tooltipFromHit(
  hit: THREE.Intersection<THREE.Object3D> | undefined,
  view: ViewerView | null,
  lines: QuantityLine[],
  project: Project,
): HoverTooltip | null {
  if (hit === undefined || view === null) return null

  if (view.mode === 'member') {
    const rowId: unknown = hit.object.userData.rowId
    if (typeof rowId !== 'string') return null
    const line = massLines(lines).find(({ id }) => id === rowId)
    if (line === undefined) return null
    return { key: `row:${line.id}`, kind: 'member', line }
  }

  const memberId = memberIdFromHit(hit)
  if (memberId === null) return null
  const member = project.members.find(({ id }) => id === memberId)
  if (member === undefined) return null
  const section = project.sections.find(({ id }) => id === member.sectionId)
  if (section === undefined) return null
  return {
    key: `member:${memberId}`,
    kind: 'building',
    memberId,
    mark: section.mark,
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
  rebuildMemberScene(runtime, view.member, hoverRowId)
}

function rebuildMemberScene(
  runtime: ViewerRuntime,
  view: SelectedSupportedMemberView,
  hoverRowId: string | null,
): void {
  if (view.rebars.length === 0) {
    runtime.fittedTargetKey = null
    return
  }

  const content = new THREE.Group()
  const coreMaterial = pooledMaterial(
    runtime,
    'rebarCore',
    () =>
      new THREE.MeshStandardMaterial({
        color: REBAR_COLOR,
        metalness: 0.6,
        roughness: 0.35,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const anchorageMaterial = pooledMaterial(
    runtime,
    'rebarAnchorage',
    () =>
      new THREE.MeshStandardMaterial({
        color: REBAR_ZONE_COLORS.定着,
        metalness: 0.6,
        roughness: 0.35,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const highlightMaterial = pooledMaterial(
    runtime,
    'rebarHighlight',
    () =>
      new THREE.MeshStandardMaterial({
        color: HIGHLIGHT_COLOR,
        metalness: 0.6,
        roughness: 0.35,
        emissive: HIGHLIGHT_COLOR,
        emissiveIntensity: 0.35,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const zoneMaterials = {
    core: coreMaterial,
    定着: anchorageMaterial,
  } satisfies Record<'core' | NonNullable<RebarBatch['zone']>, THREE.MeshStandardMaterial>
  const pickableMeshes: THREE.Mesh[] = []
  const bounds = memberBounds(view)

  addMemberConcrete(content, view, runtime)
  addGround(content, bounds, runtime)

  // 通し筋은 런 원점 기준, あばら筋은 자기 스팬 원점 기준으로 만들어진다. 런을 한
  // 프레임에 그리므로 부재별 오프셋을 걸어 맞춘다 — 通し筋의 memberId는 런 대표
  // 부재라 오프셋 0이 되어 같은 조회로 함께 처리된다.
  const originOffsetOf = (memberId: string): number => {
    if (view.kind !== '大梁') return 0
    const index = view.run.members.findIndex(({ id }) => id === memberId)
    if (index === -1) {
      throw new Error(`Rebar member is outside its run: ${memberId}`)
    }
    return view.run.memberOffsetsMm[index]
  }

  const entries = view.rebars.map((rebar) => {
    const rowId = view.rowIds.get(rebar.id)
    if (rowId === undefined) {
      throw new Error(`QuantityLine not found for ${rebar.id}`)
    }
    return {
      rowId,
      rebar,
      originOffsetMm: originOffsetOf(rebar.memberId),
    }
  })

  for (const batch of rebarBatches(entries, view.section)) {
    const mesh = createBatchMesh(
      batch,
      batch.zone === null ? zoneMaterials.core : zoneMaterials[batch.zone],
    )
    if (mesh === null) continue
    content.add(mesh)
    pickableMeshes.push(mesh)
  }

  runtime.content = content
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
  // 파라미터는 部材 뷰의 철근과 같지만 **항목을 나눈다.** 여기는 InstancedMesh라
  // USE_INSTANCING 정의가 붙은 별도 프로그램이 필요하고, 하나를 공유하면 탭을
  // 오갈 때마다 그 사이를 오가며 프로그램을 다시 잡는다.
  const steelMaterial = pooledMaterial(
    runtime,
    'buildingRebar',
    () =>
      new THREE.MeshStandardMaterial({
        color: REBAR_COLOR,
        metalness: 0.6,
        roughness: 0.35,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const concreteMaterial = pooledMaterial(
    runtime,
    'buildingConcrete',
    () =>
      new THREE.MeshStandardMaterial({
        color: CONCRETE_COLOR,
        transparent: true,
        opacity: 0.18,
        roughness: 0.9,
        metalness: 0,
        depthWrite: false,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const concreteSelectedMaterial = pooledMaterial(
    runtime,
    'buildingConcreteSelected',
    () =>
      new THREE.MeshStandardMaterial({
        color: CONCRETE_COLOR,
        transparent: true,
        opacity: 0.18,
        roughness: 0.9,
        metalness: 0,
        depthWrite: false,
        emissive: HIGHLIGHT_COLOR,
        emissiveIntensity: 0.3,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
  const outlineMaterial = pooledMaterial(
    runtime,
    'outline',
    () =>
      new THREE.LineBasicMaterial({
        color: OUTLINE_COLOR,
        clippingPlanes: [runtime.clipPlane],
        clipShadows: true,
      }),
  )
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
    mesh.userData.layer = 'concrete'
    content.add(mesh)
    pickableMeshes.push(mesh)

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      outlineMaterial,
    )
    outline.position.copy(mesh.position)
    outline.userData.layer = 'concrete'
    content.add(outline)
  }

  // 철근은 표시 반경·레이어별 InstancedMesh — 단위 높이 실린더를 Y 스케일로 늘인다 (R4).
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const direction = new THREE.Vector3()

  for (const instances of groupInstancesByLayerAndRadius(
    layout.rebar,
  ).values()) {
    const { radius, layer } = instances[0]
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
    instanced.userData.layer = layer
    content.add(instanced)
    pickableMeshes.push(instanced)
  }

  addGround(content, layout.bounds, runtime)

  runtime.content = content
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
function geometryKey(view: SelectedSupportedMemberView): string {
  const sectionGeometry =
    view.kind === '柱'
      ? [view.section.b, view.section.d, view.section.hoop]
      : [
          view.section.b,
          view.section.depth,
          view.section.stirrup,
          view.run.members.length,
          view.run.coreLengthMm,
          view.run.members.map(({ id }) => id),
          view.run.spans.map((span) => [
            span.clear,
            span.startSupportLengthAlongAxisMm,
            span.endSupportLengthAlongAxisMm,
          ]),
          view.supportSections.map(({ b, d }) => [b, d]),
        ]

  return JSON.stringify([
    view.member.id,
    sectionGeometry,
    view.story.height,
    // placement는 배치의 유일한 출처다 — 빼면 本数가 같은 배치 변경(上部大梁せい
    // 미세 조정)이 씬을 옛 위치로 남긴다.
    view.rebars.map(
      ({ role, size, count, closed, points, zones, placement }) => [
        role,
        size,
        count,
        closed,
        points,
        zones,
        placement,
      ],
    ),
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

function selectedRows(
  memberIds: ReadonlySet<string>,
  selectedGroup: string,
  rebars: Rebar[],
  lines: QuantityLine[],
): Pick<SelectedSupportedMemberView, 'rebars' | 'rowIds'> {
  const selectedRebars = rebars.filter((rebar) =>
    memberIds.has(rebar.memberId),
  )
  const selectedLineIds = new Set(
    lines.filter(({ groupId }) => groupId === selectedGroup).map(({ id }) => id),
  )
  const rowIds = new Map(
    selectedRebars
      .map((rebar) => [rebar.id, quantityLineId(selectedGroup, rebar)] as const)
      .filter(([, lineId]) => selectedLineIds.has(lineId)),
  )

  return { rebars: selectedRebars, rowIds }
}

function runSupportSections(
  project: Project,
  run: GirderRun,
): ColumnSection[] {
  const firstMember = run.members[0]
  if (firstMember === undefined) {
    throw new Error('GirderRun must contain at least one member')
  }

  return [
    girderSupportSections(project, firstMember).start,
    ...run.members.map(
      (runMember) => girderSupportSections(project, runMember).end,
    ),
  ]
}

function selectedMemberView(
  memberId: string | null,
  selectedGroup: string | null,
  project: Project,
  rebars: Rebar[],
  lines: QuantityLine[],
  unsupportedMembers: UnsupportedMember[],
): SelectedMemberView | null {
  if (memberId === null || selectedGroup === null) return null

  const member = project.members.find(({ id }) => id === memberId)
  if (member === undefined) return null

  const section = findSection(project, member.sectionId)
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (story === undefined) {
    throw storyNotFound(member.storyId)
  }
  // 부재 종류를 가리지 않는다 — 柱도 断面一覧 입력에 따라 형상이 성립하지
  // 않을 수 있고, 그때 内訳는 未対応인데 3D만 지원으로 보이면 안 된다.
  const unsupported = unsupportedMembers.find(
    ({ memberId: unsupportedId }) => unsupportedId === memberId,
  )
  if (unsupported !== undefined) {
    return { status: 'unsupported', member, reason: unsupported.reason }
  }

  if (member.kind === '柱') {
    if (section.kind !== '柱') {
      throw new Error(`柱 member references a non-柱 section: ${member.id}`)
    }
    return {
      status: 'supported',
      view: {
        kind: '柱',
        member,
        section,
        story,
        ...selectedRows(new Set([member.id]), selectedGroup, rebars, lines),
      },
    }
  }

  if (section.kind !== '大梁') {
    throw new Error(`大梁 member references a non-大梁 section: ${member.id}`)
  }

  const run = girderRun(project, member)
  const owner = run.members.find(({ id }) => id === run.ownerId)
  if (owner === undefined) {
    throw new Error(`GirderRun owner not found: ${run.ownerId}`)
  }

  return {
    status: 'supported',
    view: {
      kind: '大梁',
      member: owner,
      section,
      story,
      run,
      supportSections: runSupportSections(project, run),
      ...selectedRows(
        new Set(run.members.map(({ id }) => id)),
        selectedGroup,
        rebars,
        lines,
      ),
    },
  }
}

/**
 * 出典 표시는 법적 의무라 범례도 内訳와 같은 근거를 달고 나온다.
 * 라벨·툴팁 형식은 `@/lib/rule-source`가 유일한 출처다 — 화면마다 다시 적으면
 * 같은 근거가 화면마다 다르게 보인다.
 */
function SourceLink({ rule }: { rule: RuleHit }) {
  const label = sourceLabel(rule)
  const title = sourceTooltip(rule)

  if (rule.source.url === null) {
    return (
      <span
        className={`${styles.legendSource} ${styles.legendSourceDisabled}`}
        role="link"
        aria-disabled="true"
        title={title}
      >
        {label}
      </span>
    )
  }

  return (
    <a
      className={styles.legendSource}
      href={rule.source.url}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
    >
      {label}
    </a>
  )
}

export function Viewer3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ViewerRuntime | null>(null)
  const tooltipKeyRef = useRef<string | null>(null)
  const rebuildStatsRef = useRef<RebuildStats>({
    lastRebuildMs: null,
    rebuildCount: 0,
  })
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null)
  const [clip, setClip] = useState<ClipState>({
    enabled: false,
    axis: 'x',
    ratio: 0.5,
  })
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
  const selectMember = useAppStore(({ selectMember }) => selectMember)
  const locale = useAppStore(({ locale }) => locale)
  const project = useAppStore(({ project }) => project)
  const selectedMemberId = useAppStore(({ sel }) => sel.memberId)
  const selectedGroup = useAppStore(({ sel }) => sel.group)
  const hoverRowId = useAppStore(({ hoverRowId: rowId }) => rowId)
  const viewerMode = useAppStore(({ viewerMode }) => viewerMode)
  const viewerLayers = useAppStore(({ viewerLayers }) => viewerLayers)
  const { rebars, lines, unsupportedMembers } = useTakeoff()
  const setHoverRowRef = useRef(setHoverRow)
  const selectMemberRef = useRef(selectMember)
  const selectedMemberIdRef = useRef(selectedMemberId)
  const hoverRowIdRef = useRef(hoverRowId)
  const viewerLayersRef = useRef(viewerLayers)
  const linesRef = useRef(lines)
  const projectRef = useRef(project)
  setHoverRowRef.current = setHoverRow
  selectMemberRef.current = selectMember
  selectedMemberIdRef.current = selectedMemberId
  hoverRowIdRef.current = hoverRowId
  viewerLayersRef.current = viewerLayers
  linesRef.current = lines
  projectRef.current = project

  // 建物 레이아웃은 선택과 무관하다 — 선택 변경마다 씬을 재구성하지 않는다.
  const unsupportedMemberIds = useMemo(
    () => new Set(unsupportedMembers.map(({ memberId }) => memberId)),
    [unsupportedMembers],
  )
  const layout = useMemo(
    () =>
      viewerMode === 'building'
        ? buildingLayout(project, rebars, unsupportedMemberIds)
        : null,
    [project, rebars, unsupportedMemberIds, viewerMode],
  )
  const selectedMember = useMemo(
    () =>
      viewerMode === 'member'
        ? selectedMemberView(
            selectedMemberId,
            selectedGroup,
            project,
            rebars,
            lines,
            unsupportedMembers,
          )
        : null,
    [
      lines,
      project,
      rebars,
      selectedGroup,
      selectedMemberId,
      unsupportedMembers,
      viewerMode,
    ],
  )
  const view = useMemo((): ViewerView | null => {
    if (layout !== null) return { mode: 'building', layout }
    if (selectedMember?.status === 'supported') {
      return { mode: 'member', member: selectedMember.view }
    }
    return null
  }, [layout, selectedMember])
  const clipBounds = useMemo((): Bounds | null => {
    if (view === null) return null
    return view.mode === 'building' ? view.layout.bounds : memberBounds(view.member)
  }, [view])
  const viewRef = useRef(view)
  viewRef.current = view
  const sceneKey = useMemo(() => {
    if (view === null) return ''
    if (view.mode === 'building') return `b:${buildingGeometryKey(project)}`
    return `m:${geometryKey(view.member)}`
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
    // 머티리얼별 clippingPlanes는 생성 때부터 고정한다. 이 플래그도 마운트
    // 이후 토글하지 않아 클립 on/off가 전 머티리얼 재컴파일로 번지지 않게 한다.
    renderer.localClippingEnabled = true
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
      clipPlane: new THREE.Plane(
        new THREE.Vector3(1, 0, 0),
        CLIP_DISABLED_CONSTANT,
      ),
      content: null,
      materialPool: new Map(),
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

    const frameTimestamps: number[] = []
    if (process.env.NODE_ENV !== 'production') {
      ;(window as WindowWithViewerHook).__kijunViewerRuntime = {
        getRendererInfo: () => ({
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        }),
        getFrameTimestamps: () => [...frameTimestamps],
        getRebuildStats: () => ({ ...rebuildStatsRef.current }),
      }
    }

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
    let hoverDirty = false
    const recordPointer = (
      clientX: number,
      clientY: number,
    ): DOMRect | null => {
      const bounds = renderer.domElement.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return null

      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      )
      return bounds
    }
    const updateTooltip = (next: HoverTooltip | null) => {
      const nextKey = next?.key ?? null
      if (tooltipKeyRef.current === nextKey) return
      tooltipKeyRef.current = nextKey
      setTooltip(next)
    }
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = recordPointer(event.clientX, event.clientY)
      if (bounds === null) {
        hoverDirty = false
        return
      }

      hoverDirty = true
      if (tooltipRef.current !== null) {
        tooltipRef.current.style.transform = `translate3d(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px, 0)`
      }
    }
    const handlePointerLeave = () => {
      hoverDirty = false
      updateTooltip(null)
    }
    const handleClick = (event: MouseEvent) => {
      if (recordPointer(event.clientX, event.clientY) === null) return
      const hit = pickVisible(runtime, raycaster, pointer)
      if (hit === undefined) return

      // 部材 뷰: 철근 → 내역서 행. 建物 뷰: 콘크리트/철근 → 부재 선택.
      const { rowId } = hit.object.userData
      if (typeof rowId === 'string') {
        setHoverRowRef.current(rowId)
        // 部材 뷰에서 3D가 하는 유일한 일이다 — 이게 안 쓰이면 ADR-016의 근거가 약해진다.
        capture('rebar_picked')
        return
      }
      const pickedMemberId = memberIdFromHit(hit)
      if (pickedMemberId !== null) {
        // 이미 선택된 부재를 다시 클릭해도 재발화하지 않는다 — plan·section·
        // takeoff와 같은 판정이라 source별 선택 수 비교가 어느 한쪽으로 부풀지 않는다.
        const changed = pickedMemberId !== selectedMemberIdRef.current
        selectMemberRef.current(pickedMemberId)
        if (changed) capture('member_selected', { source: 'viewer' })
      }
    }
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('click', handleClick)

    // 컨텍스트 손실은 던지지 않는다 — 캔버스가 그대로 얼어붙고 PaneBoundary도 걸리지
    // 않는다. 복구는 시도하지 않고(마운트가 씬을 소유한다) 보고만 한다.
    const handleContextLost = () => {
      capture('viewer_webgl_context_lost', {
        mode: viewRef.current?.mode ?? null,
      })
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)

    let animationFrame = 0
    const renderFrame = () => {
      if (hoverDirty) {
        hoverDirty = false
        const hit = pickVisible(runtime, raycaster, pointer)
        updateTooltip(
          tooltipFromHit(
            hit,
            viewRef.current,
            linesRef.current,
            projectRef.current,
          ),
        )
      }
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
      frameTimestamps.push(performance.now())
      if (frameTimestamps.length > 300) frameTimestamps.shift()
      animationFrame = window.requestAnimationFrame(renderFrame)
    }
    animationFrame = window.requestAnimationFrame(renderFrame)

    return () => {
      delete (window as WindowWithViewerHook).__kijunViewerRuntime
      window.cancelAnimationFrame(animationFrame)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost,
      )
      observer.disconnect()
      disposeContent(runtime)
      for (const material of runtime.materialPool.values()) material.dispose()
      runtime.materialPool.clear()
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
    tooltipKeyRef.current = null
    setTooltip(null)
    const rebuildStartedAt = performance.now()
    rebuildScene(runtime, viewRef.current, hoverRowIdRef.current)
    rebuildStatsRef.current = {
      lastRebuildMs: performance.now() - rebuildStartedAt,
      rebuildCount: rebuildStatsRef.current.rebuildCount + 1,
    }
    applyViewerLayers(runtime, viewerLayersRef.current)
  }, [sceneKey])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    applyClipPlane(runtime.clipPlane, clipBounds, clip)
  }, [clip, clipBounds])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime === null) return
    applyViewerLayers(runtime, viewerLayers)
  }, [viewerLayers])

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

  const unsupportedReason =
    selectedMember?.status === 'unsupported' ? selectedMember.reason : null
  const selectedSupported =
    selectedMember?.status === 'supported' ? selectedMember.view : null
  const entries =
    selectedSupported === null ? [] : legendEntries(selectedSupported.rebars)
  const spacing = (() => {
    if (selectedSupported === null) return null

    const role = selectedSupported.kind === '柱' ? '帯筋' : 'あばら筋'
    const rebar = selectedSupported.rebars.find(
      (candidate) => candidate.role === role,
    )
    // 피치도 placement에서 읽는다 — 단면에서 다시 집어오면 한 칩 안에 출처가
    // 둘이 되고, 배치 규칙이 도메인 밖에 한 벌 더 생긴다.
    return rebar?.placement === undefined
      ? null
      : {
          role,
          pitchMm: rebar.placement.pitchMm,
          lastGapMm: rebar.placement.lastGapMm,
        }
  })()

  return (
    <div ref={mountRef} className={styles.viewer}>
      <div className={styles.meta}>
        <span className={styles.memberId}>
          {selectedMemberId ?? t(locale, 'viewer.selectMember')}
        </span>
        <div className={styles.metaActions}>
          <span className={styles.scaleNotice}>
            {t(locale, 'viewer.scaleNotice')}
          </span>
          <div className={styles.layerControls}>
            <ViewerLayerControls />
          </div>
        </div>
      </div>
      <div
        className={styles.clipControls}
        role="group"
        aria-label={t(locale, 'viewer.clip.toggle')}
      >
        <button
          type="button"
          className={`${styles.clipButton} ${
            clip.enabled ? styles.clipButtonActive : ''
          }`}
          aria-pressed={clip.enabled}
          onClick={() =>
            setClip((current) => ({
              ...current,
              enabled: !current.enabled,
            }))
          }
        >
          {t(locale, 'viewer.clip.toggle')}
        </button>
        {CLIP_AXES.map((axis) => (
          <button
            key={axis}
            type="button"
            className={`${styles.clipButton} ${
              clip.axis === axis ? styles.clipButtonActive : ''
            }`}
            aria-pressed={clip.axis === axis}
            onClick={() => setClip((current) => ({ ...current, axis }))}
          >
            {t(locale, `viewer.clip.axis${axis.toUpperCase()}`)}
          </button>
        ))}
        <input
          className={styles.clipRange}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={clip.ratio}
          aria-label={t(locale, 'viewer.clip.position')}
          onChange={(event) => {
            const ratio = event.currentTarget.valueAsNumber
            setClip((current) => ({
              ...current,
              ratio,
            }))
          }}
        />
      </div>
      {entries.length > 0 && (
        <aside
          className={styles.legend}
          aria-label={t(locale, 'viewer.legend.title')}
        >
          <span className={styles.legendTitle}>
            {t(locale, 'viewer.legend.title')}
          </span>
          <ul className={styles.legendList}>
            {entries.map((entry) => (
              <li
                key={`${entry.kind}|${entry.ruleKey}|${entry.lengthMm}`}
                className={styles.legendChip}
              >
                <span
                  className={styles.legendSwatch}
                  data-zone-kind={entry.kind}
                  style={{ backgroundColor: REBAR_ZONE_COLORS[entry.kind] }}
                  aria-hidden="true"
                />
                {`${entry.kind} ${entry.ruleKey} ${entry.lengthMm}`}
                {entry.rule.confidence !== 'stated' && (
                  <span
                    className={
                      entry.rule.confidence === 'inferred'
                        ? styles.inferredMark
                        : styles.transcribedMark
                    }
                    role="img"
                    aria-label={
                      entry.rule.confidence === 'inferred'
                        ? '原文に値のない規準値'
                        : '独立検討待ちの規準値'
                    }
                    title={entry.rule.label}
                  >
                    {entry.rule.confidence === 'inferred' ? '▲' : '△'}
                  </span>
                )}
                <SourceLink rule={entry.rule} />
              </li>
            ))}
            {spacing !== null && (
              <li className={styles.legendSpacing}>
                {spacing.role} @{spacing.pitchMm}
                {spacing.lastGapMm !== spacing.pitchMm &&
                  ` (${t(locale, 'viewer.legend.terminal')} ${spacing.lastGapMm})`}
              </li>
            )}
          </ul>
        </aside>
      )}
      <div
        ref={tooltipRef}
        className={styles.tooltip}
        role="tooltip"
        hidden={tooltip === null}
      >
        {tooltip?.kind === 'member' ? (
          <dl className={styles.tooltipList}>
            <dt>{t(locale, 'viewer.tooltip.role')}</dt>
            <dd>{tooltip.line.role}</dd>
            <dt>{t(locale, 'viewer.tooltip.diameter')}</dt>
            <dd>{tooltip.line.size}</dd>
            <dt>{t(locale, 'viewer.tooltip.count')}</dt>
            <dd>{tooltip.line.countPerMember}</dd>
            <dt>{t(locale, 'viewer.tooltip.length')}</dt>
            <dd>
              {tooltip.line.lengthMm} mm
              {/* 設計長さ에는 룰 유래 수치가 섞인다 — 内訳 행과 같은 등급 표시를 단다. */}
              {tooltip.line.confidence !== 'stated' && (
                <span
                  className={
                    tooltip.line.confidence === 'inferred'
                      ? styles.inferredMark
                      : styles.transcribedMark
                  }
                  role="img"
                  aria-label={
                    tooltip.line.confidence === 'inferred'
                      ? '原文に値のない規準値'
                      : '独立検討待ちの規準値'
                  }
                  title={tooltip.line.rules
                    .filter(({ confidence }) =>
                      tooltip.line.confidence === 'inferred'
                        ? confidence === 'inferred'
                        : confidence !== 'stated',
                    )
                    .map(({ label }) => label)
                    .join('、')}
                >
                  {tooltip.line.confidence === 'inferred' ? '▲' : '△'}
                </span>
              )}
            </dd>
          </dl>
        ) : tooltip?.kind === 'building' ? (
          <dl className={styles.tooltipList}>
            <dt>{t(locale, 'viewer.tooltip.memberId')}</dt>
            <dd>{tooltip.memberId}</dd>
            <dt>{t(locale, 'viewer.tooltip.mark')}</dt>
            <dd>{tooltip.mark}</dd>
          </dl>
        ) : null}
      </div>
      {view === null && (
        <div className={styles.empty}>
          {unsupportedReason !== null
            ? `${t(locale, 'viewer.unsupported.title')}: ${t(
                locale,
                `viewer.unsupported.reason.${unsupportedReason}`,
              )} — ${t(
                locale,
                `viewer.unsupported.plan.${unsupportedReason}`,
              )}`
            : t(locale, 'viewer.empty')}
        </div>
      )}
    </div>
  )
}
