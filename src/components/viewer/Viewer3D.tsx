'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { ColumnSection, Member } from '@/domain/model/member'
import { findSection, type Story } from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import type { QuantityLine } from '@/domain/quantity'
import { useTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'

import {
  CAMERA_FOV_DEGREES,
  fitCamera,
  rebarRadius,
  rebarSegments,
  type Bounds,
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
const Y_AXIS = new THREE.Vector3(0, 1, 0)

interface SelectedColumnView {
  member: Member
  section: ColumnSection
  story: Story
  rebars: Rebar[]
  rowIds: Map<Rebar['role'], QuantityLine['id']>
}

interface ViewerRuntime {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  content: THREE.Group | null
  contentMaterials: THREE.Material[]
  normalMaterial: THREE.MeshStandardMaterial | null
  highlightMaterial: THREE.MeshStandardMaterial | null
  pickableMeshes: THREE.Mesh[]
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
    for (const point of rebar.points) {
      for (let axis = 0; axis < point.length; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis], point[axis] - radius)
        bounds.max[axis] = Math.max(bounds.max[axis], point[axis] + radius)
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
  mesh.userData.rowId = rowId
  return mesh
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
    metalness: 0.35,
    roughness: 0.5,
  })
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    metalness: 0.35,
    roughness: 0.5,
  })
  const materials: THREE.Material[] = [normalMaterial, highlightMaterial]
  const pickableMeshes: THREE.Mesh[] = []

  addMemberOutline(content, view, materials)

  for (const rebar of view.rebars) {
    const rowId = view.rowIds.get(rebar.role)
    if (rowId === undefined) {
      throw new Error(`QuantityLine not found for ${rebar.id}`)
    }

    for (const segment of rebarSegments(rebar)) {
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

  const fitted = fitCamera(columnBounds(view))
  runtime.camera.position.copy(vector(fitted.position))
  runtime.controls.target.set(
    fitted.target[0] * MILLIMETRES_TO_SCENE,
    fitted.target[1] * MILLIMETRES_TO_SCENE,
    fitted.target[2] * MILLIMETRES_TO_SCENE,
  )
  runtime.camera.lookAt(runtime.controls.target)
  runtime.camera.updateProjectionMatrix()
  runtime.controls.update()
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
  const selectedLines = lines.filter(({ groupId }) => groupId === selectedGroup)
  const rowIds = new Map(
    selectedLines.map((line) => [line.role, line.id]),
  )

  return { member, section, story, rebars: selectedRebars, rowIds }
}

export function Viewer3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ViewerRuntime | null>(null)
  const setHoverRow = useAppStore(({ setHoverRow }) => setHoverRow)
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
    renderer.domElement.className = styles.canvas
    renderer.domElement.setAttribute('aria-label', '選択部材の配筋3D')
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = CONTROLS_DAMPING

    scene.add(new THREE.HemisphereLight(0xffffff, 0x37352d, 1.4))
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2)
    directionalLight.position.set(4, 8, 6)
    scene.add(directionalLight)

    const runtime: ViewerRuntime = {
      scene,
      camera,
      renderer,
      controls,
      content: null,
      contentMaterials: [],
      normalMaterial: null,
      highlightMaterial: null,
      pickableMeshes: [],
    }
    runtimeRef.current = runtime

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

  return (
    <div ref={mountRef} className={styles.viewer}>
      <div className={styles.meta}>
        <span className={styles.memberId}>
          {selectedMemberId ?? '部材を選択'}
        </span>
        <span className={styles.scaleNotice}>寸法判読用ではない</span>
      </div>
      {view === null && <div className={styles.empty}>配筋データなし</div>}
    </div>
  )
}
