import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import type { ColumnSection } from '@/domain/model/member'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  type Project,
} from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import type { Rebar } from '@/domain/model/rebar'
import { generateColumnRebar } from '@/domain/rebar/column'
import { jpMlitRulePack } from '@/rulepack'

import {
  buildRebarScene,
  exportRebarGlb,
  rebarModelFileName,
} from './gltf'

function sampleInput(): { project: Project; rebars: Rebar[] } {
  const project = createSampleProject()
  const rebars = project.members.flatMap((member) => {
    if (member.kind !== '柱') return []

    const section = findSection(project, member.sectionId) as ColumnSection
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) throw new Error('Expected story')

    return generateColumnRebar(
      {
        member,
        section,
        story,
        beamDepthAbove: beamDepthAbove(project, member),
        ends: columnEnds(project, member),
      },
      jpMlitRulePack,
    )
  })

  return { project, rebars }
}

function instancedMeshes(scene: THREE.Scene): THREE.InstancedMesh[] {
  const found: THREE.InstancedMesh[] = []
  scene.traverse((object) => {
    if ((object as THREE.InstancedMesh).isInstancedMesh) {
      found.push(object as THREE.InstancedMesh)
    }
  })
  return found
}

describe('buildRebarScene', () => {
  it('draws every 鉄筋 segment of the 案件, not just the selected 部材', () => {
    const { project, rebars } = sampleInput()

    const scene = buildRebarScene({ project, rebars })
    const drawn = instancedMeshes(scene).reduce(
      (sum, mesh) => sum + mesh.count,
      0,
    )

    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBe(
      // 画面の建物ビューと同じ展開数 — 書き出しだけ間引くと、渡した模型と
      // 画面が食い違う。
      instancedMeshes(scene).reduce((sum, mesh) => sum + mesh.count, 0),
    )
  })

  it('uses the real bar diameter, not the display radius', () => {
    // 画面の半径は読みやすさのために太らせてある (rebarRadius: 最小 ⌀14・1.6倍)。
    // 渡す模型でそれを使うと D25 が ⌀40 の棒として計られる。
    const { project, rebars } = sampleInput()

    const scene = buildRebarScene({ project, rebars })
    const d25 = instancedMeshes(scene).find(({ name }) => name.includes('D25'))
    const geometry = d25?.geometry as THREE.CylinderGeometry

    expect(d25).toBeDefined()
    // 単位は m。D25 の半径は 12.5mm。
    expect(geometry.parameters.radiusTop).toBeCloseTo(0.0125, 6)
  })

  it('names each mesh by 役割 and 呼び名 so the file reads on its own', () => {
    const { project, rebars } = sampleInput()

    const names = instancedMeshes(buildRebarScene({ project, rebars })).map(
      ({ name }) => name,
    )

    expect(names.length).toBeGreaterThan(0)
    expect(names.every((name) => /^(主筋|帯筋) D\d+$/.test(name))).toBe(true)
  })

  it('puts the コンクリート outline on its own node so it can be hidden', () => {
    const { project, rebars } = sampleInput()
    const scene = buildRebarScene({ project, rebars })

    const concrete = scene.getObjectByName('コンクリート')
    const rebarGroup = scene.getObjectByName('鉄筋')

    expect(concrete).toBeDefined()
    expect(rebarGroup).toBeDefined()
    expect(concrete!.children.length).toBe(project.members.length)
  })

  it('measures in metres, matching the glTF convention', () => {
    const { project, rebars } = sampleInput()
    const scene = buildRebarScene({ project, rebars })
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())

    // サンプルは X 1スパン・Y 2スパンの 6000mm グリッド。柱せい 800 を
    // 足して X ≒ 6.8m・Z ≒ 12.8m。mm のまま出していれば1000倍ずれる。
    expect(size.x).toBeCloseTo(6.8, 1)
    expect(size.z).toBeCloseTo(12.8, 1)
  })

  it('survives a 案件 with no generated 鉄筋', () => {
    const project = createSampleProject()

    const scene = buildRebarScene({ project, rebars: [] })

    expect(instancedMeshes(scene)).toEqual([])
    expect(scene.getObjectByName('コンクリート')).toBeDefined()
  })
})

describe('rebarModelFileName', () => {
  it('names the file after the 案件', () => {
    expect(rebarModelFileName('サンプル案件 / RC 2階建て')).toBe(
      'サンプル案件 RC 2階建て.glb',
    )
  })
})

describe('exportRebarGlb', () => {
  it('downloads a valid binary glTF named after the 案件', async () => {
    const { project, rebars } = sampleInput()
    let blob: Blob | undefined
    let filename: string | undefined

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value
        return 'blob:kijun-test'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download
      })

    try {
      await exportRebarGlb({ project, rebars })
    } finally {
      click.mockRestore()
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }

    expect(filename).toBe('サンプル案件 RC 2階建て.glb')
    expect(blob?.type).toBe('model/gltf-binary')

    const buffer = await blob!.arrayBuffer()
    const header = new DataView(buffer)
    // GLB は magic 'glTF' + version 2 で始まる。ここが違えば読めるビューアは無い。
    expect(header.getUint32(0, true)).toBe(0x46546c67)
    expect(header.getUint32(4, true)).toBe(2)
    expect(header.getUint32(8, true)).toBe(buffer.byteLength)

    const jsonLength = header.getUint32(12, true)
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)),
    ) as {
      extensionsUsed?: string[]
      nodes: { name?: string }[]
      asset: { generator?: string }
    }

    // 1万本規模を一本ずつ書くとファイルが読めない大きさになる。画面と同じ
    // インスタンシングで出す。
    expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing')
    expect(json.nodes.map(({ name }) => name)).toContain('鉄筋')
    expect(json.nodes.map(({ name }) => name)).toContain('コンクリート')
  }, 30000)
})
