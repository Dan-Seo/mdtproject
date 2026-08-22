import * as THREE from 'three'

import type { BarSize } from '@/domain/model/member'
import type { Project } from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { barDiameter } from '@/domain/rebar/girder-ends'
import {
  buildingLayout,
  type ConcreteBox,
  type RebarInstance,
} from '@/lib/viewer/building'

import { modelNotices } from '@/lib/export'
import { projectFileName } from '@/lib/persist/file'
import type { Locale } from '@/lib/store'

/** glTF は m で測る規約。製品の座標は mm なので、書き出す境目で一度だけ割る。 */
const MILLIMETRES_TO_METRES = 0.001
/** 画面より粗い。1万本規模で面数がそのままファイル容量になる。 */
const CYLINDER_RADIAL_SEGMENTS = 8
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export interface RebarModelInput {
  project: Project
  rebars: Rebar[]
  /** 注記の言語。出典・改変表示は模型にも載る (PDL1.0)。 */
  locale: Locale
  /** 配筋を展開できなかった部材。コンクリート外形だけ残し、鉄筋は描かない。 */
  unsupportedMemberIds?: ReadonlySet<string>
}

/**
 * 呼び名そのままの実半径 (m)。画面の rebarRadius は読みやすさのために
 * 最小 ⌀14・1.6倍に太らせた**表示値**で、渡す模型でそれを使うと D25 が
 * ⌀40 の棒として計られる。書き出しは実寸で出す。
 *
 * 呼び名の読み方そのものは domain の barDiameter に任せる — 書き写すと、
 * 規則が変わったとき 3D の実寸だけが黙って古いままになる。
 */
function trueRadiusMetres(size: BarSize): number {
  return (barDiameter(size) / 2) * MILLIMETRES_TO_METRES
}

function metres([x, y, z]: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).multiplyScalar(MILLIMETRES_TO_METRES)
}

/**
 * 1本ずつメッシュにすると、1万本規模で読めない大きさのファイルになる。
 * 画面の建物ビューと同じく、円柱ひとつ＋変換行列で出す
 * (glTF の EXT_mesh_gpu_instancing)。
 */
function instancedRebar(
  key: string,
  instances: RebarInstance[],
  material: THREE.Material,
): THREE.InstancedMesh {
  const { size, role } = instances[0]
  const radius = trueRadiusMetres(size)
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    1,
    CYLINDER_RADIAL_SEGMENTS,
  )
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length)
  mesh.name = `${role} ${size}`
  mesh.userData.groupKey = key

  // 長さ0の区間は来ない — pathRuns が同じ点の続きを区間にしないからだ
  // (geometry.test.ts が固定している)。来れば潰れた円柱 (scale 0) になり、
  // EXT_mesh_gpu_instancing の書き出しで Matrix4.decompose が 1/0 を掛けて
  // 回転が NaN のまま file に載る。ここで畳んで隠すより、上流の不変を頼る。
  instances.forEach((instance, index) => {
    const from = metres(instance.from)
    const to = metres(instance.to)
    const direction = to.clone().sub(from)
    const matrix = new THREE.Matrix4()

    matrix
      .makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          Y_AXIS,
          direction.clone().normalize(),
        ),
      )
      .scale(new THREE.Vector3(1, direction.length(), 1))
      .setPosition(from.clone().add(to).multiplyScalar(0.5))

    mesh.setMatrixAt(index, matrix)
  })

  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function concreteMesh(box: ConcreteBox, material: THREE.Material): THREE.Mesh {
  const [width, height, depth] = box.size
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      width * MILLIMETRES_TO_METRES,
      height * MILLIMETRES_TO_METRES,
      depth * MILLIMETRES_TO_METRES,
    ),
    material,
  )
  mesh.name = `${box.kind} ${box.memberId}`
  mesh.position.copy(metres(box.center))
  return mesh
}

/**
 * 役割と呼び名で分ける。同じ ⌀13 でも あばら筋 と 幅止め筋 は別のノードにする —
 * 受け取った側が図面と同じ言葉で拾えるようにするためだ (ADR-008)。
 */
function groupForExport(
  instances: RebarInstance[],
): Map<string, RebarInstance[]> {
  const groups = new Map<string, RebarInstance[]>()

  for (const instance of instances) {
    const key = `${instance.role}|${instance.size}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [instance])
    else group.push(instance)
  }

  return groups
}

/**
 * 案件まるごとの 3D 模型 (PRD §4)。画面のグリッド・地面・影は入れない —
 * 見せるための道具であって模型の一部ではない。
 */
export function buildRebarScene(input: RebarModelInput): THREE.Scene {
  const layout = buildingLayout(
    input.project,
    input.rebars,
    input.unsupportedMemberIds ?? new Set<string>(),
  )
  const scene = new THREE.Scene()
  scene.name = input.project.name
  // GLTFExporter は userData を extras として書き出す。glTF に表の行は無いので、
  // xlsx の透かし行・算出根拠ブロックと同じ内容をここに置く — 出典表示と改変
  // 表示は配布物に付く義務であって、書き出しの経路ごとに免れるものではない。
  scene.userData = modelNotices(
    input.rebars.flatMap(({ ruleHits }) => ruleHits),
    input.locale,
  )

  const rebarGroup = new THREE.Group()
  rebarGroup.name = '鉄筋'
  const rebarMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6,
    metalness: 0.6,
    roughness: 0.45,
  })
  rebarMaterial.name = '鉄筋'
  for (const [key, instances] of groupForExport(layout.rebar)) {
    rebarGroup.add(instancedRebar(key, instances, rebarMaterial))
  }

  const concreteGroup = new THREE.Group()
  concreteGroup.name = 'コンクリート'
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6d3cb,
    transparent: true,
    opacity: 0.25,
    roughness: 0.9,
  })
  concreteMaterial.name = 'コンクリート'
  for (const box of layout.boxes) {
    concreteGroup.add(concreteMesh(box, concreteMaterial))
  }

  scene.add(rebarGroup, concreteGroup)
  return scene
}

function disposeScene(scene: THREE.Scene): void {
  const materials = new Set<THREE.Material>()

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return

    mesh.geometry.dispose()
    for (const material of [mesh.material].flat()) materials.add(material)
    if ((object as THREE.InstancedMesh).isInstancedMesh) {
      ;(object as THREE.InstancedMesh).dispose()
    }
  })

  for (const material of materials) material.dispose()
}

export function rebarModelFileName(projectName: string): string {
  return projectFileName(projectName).replace(/\.json$/, '.glb')
}

export async function exportRebarGlb(input: RebarModelInput): Promise<void> {
  const scene = buildRebarScene(input)

  try {
    // 動的 import も try の中に置く。この釦が想定している失敗はまさに
    // 「three の塊が取れない」ことで、外に置くと1万本ぶんの
    // CylinderGeometry を掴んだまま捨てることになる。
    const { GLTFExporter } = await import(
      'three/examples/jsm/exporters/GLTFExporter.js'
    )
    const output = await new GLTFExporter().parseAsync(scene, { binary: true })
    const blob = new Blob([output as ArrayBuffer], {
      type: 'model/gltf-binary',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = rebarModelFileName(input.project.name)
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  } finally {
    // 1万本規模の円柱を GPU に残したままにしない。
    disposeScene(scene)
  }
}
