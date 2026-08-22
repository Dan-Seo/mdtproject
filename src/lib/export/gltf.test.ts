import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import type { ColumnSection } from '@/domain/model/member'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
} from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { buildingLayout } from '@/lib/viewer/building'
import { generateColumnRebar } from '@/domain/rebar/column'
import { jpMlitRulePack } from '@/rulepack'

import {
  type RebarModelInput,
  buildRebarScene,
  exportRebarGlb,
  rebarModelFileName,
} from './gltf'

function sampleInput(): RebarModelInput {
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

  return { project, rebars, locale: 'ja' }
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

    const scene = buildRebarScene({ project, rebars, locale: 'ja' })
    const drawn = instancedMeshes(scene).reduce(
      (sum, mesh) => sum + mesh.count,
      0,
    )

    expect(drawn).toBeGreaterThan(0)
    // 画面の建物ビューと同じ展開数 — 書き出しだけ間引くと、渡した模型と
    // 画面が食い違う。比べる先は画面側の産出 (buildingLayout) であって、
    // 同じ場面をもう一度数えたものではない。
    expect(drawn).toBe(
      buildingLayout(project, rebars, new Set<string>()).rebar.length,
    )
  })

  it('uses the real bar diameter, not the display radius', () => {
    // 画面の半径は読みやすさのために太らせてある (rebarRadius: 最小 ⌀14・1.6倍)。
    // 渡す模型でそれを使うと D25 が ⌀40 の棒として計られる。
    const { project, rebars } = sampleInput()

    const scene = buildRebarScene({ project, rebars, locale: 'ja' })
    const d25 = instancedMeshes(scene).find(({ name }) => name.includes('D25'))
    const geometry = d25?.geometry as THREE.CylinderGeometry

    expect(d25).toBeDefined()
    // 単位は m。D25 の半径は 12.5mm。
    expect(geometry.parameters.radiusTop).toBeCloseTo(0.0125, 6)
  })

  it('names each mesh by 役割 and 呼び名 so the file reads on its own', () => {
    const { project, rebars } = sampleInput()

    const names = instancedMeshes(buildRebarScene({ project, rebars, locale: 'ja' })).map(
      ({ name }) => name,
    )

    expect(names.length).toBeGreaterThan(0)
    expect(names.every((name) => /^(主筋|帯筋) D\d+$/.test(name))).toBe(true)
  })

  it('puts the コンクリート outline on its own node so it can be hidden', () => {
    const { project, rebars } = sampleInput()
    const scene = buildRebarScene({ project, rebars, locale: 'ja' })

    const concrete = scene.getObjectByName('コンクリート')
    const rebarGroup = scene.getObjectByName('鉄筋')

    expect(concrete).toBeDefined()
    expect(rebarGroup).toBeDefined()
    expect(concrete!.children.length).toBe(project.members.length)
  })

  it('measures in metres, matching the glTF convention', () => {
    const { project, rebars } = sampleInput()
    const scene = buildRebarScene({ project, rebars, locale: 'ja' })
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())

    // サンプルは X 1スパン・Y 2スパンの 6000mm グリッド。柱せい 800 を
    // 足して X ≒ 6.8m・Z ≒ 12.8m。mm のまま出していれば1000倍ずれる。
    expect(size.x).toBeCloseTo(6.8, 1)
    expect(size.z).toBeCloseTo(12.8, 1)
  })

  it('survives a 案件 with no generated 鉄筋', () => {
    const project = createSampleProject()

    const scene = buildRebarScene({ project, rebars: [], locale: 'ja' })

    expect(instancedMeshes(scene)).toEqual([])
    expect(scene.getObjectByName('コンクリート')).toBeDefined()
  })
})

describe('模型に載る注記', () => {
  // 出典表示と改変表示は PDL1.0 の義務だ。xlsx と印刷が負っていて glb だけが
  // 負わない、という抜け道を作らない。
  it('carries the 出典・改変・適用範囲 as scene extras', () => {
    const scene = buildRebarScene(sampleInput())
    const notices = scene.userData as {
      sources: string[]
      modification: string
      scope: string
    }

    expect(notices.sources.length).toBeGreaterThan(0)
    expect(notices.sources.join(' ')).toContain('公共建築')
    expect(notices.modification).toContain('改変')
    expect(notices.scope).toContain('民間工事')
  })

  it('carries the ADR-015 warning while any 規準値 is not independently reviewed', () => {
    const scene = buildRebarScene(sampleInput())

    expect((scene.userData as { warning?: string }).warning).toContain(
      '検収前の参考値',
    )
  })

  it('follows the locale of the 案件 view — warning included', () => {
    const notices = buildRebarScene({ ...sampleInput(), locale: 'ko' })
      .userData as { scope: string; warning?: string }

    expect(notices.scope).toContain('민간공사')
    // 一つの書き出しに二言語が混ざらない。
    expect(notices.warning).toContain('검수 전 참고값')
  })
})

describe('模型のノード名', () => {
  const hoopSize = 'D13'

  // 受け取った側は図面の言葉で拾う (ADR-008)。あばら筋 を「帯筋」と書いて
  // 渡すと、表示区分という製品の都合が相手の語彙に化ける。
  /**
   * 表示区分 (roleToLayer) は あばら筋・幅止め筋 を 帯筋 に、腹筋・カットオフ筋を
   * 主筋に畳む。この装置では同じ 呼び名・同じ表示区分で役割だけが違う2本を
   * 並べて、名前と束ね方が畳んだ方ではなく役割から来ることを確かめる。
   */
  function withStirrup(): RebarModelInput {
    const input = sampleInput()
    const hoop = input.rebars.find(({ role }) => role === '帯筋')
    if (!hoop) throw new Error('Expected a 帯筋 in the fixture')

    return {
      ...input,
      rebars: [...input.rebars, { ...hoop, id: `${hoop.id}|stirrup`, role: 'あばら筋' }],
    }
  }

  it('names nodes by 役割, not by the display layer', () => {
    const names = instancedMeshes(buildRebarScene(withStirrup())).map(
      ({ name }) => name,
    )

    expect(names).toContain(`あばら筋 ${hoopSize}`)
    expect(names).toContain(`帯筋 ${hoopSize}`)
  })

  it('splits the same 呼び名 when the 役割 differs', () => {
    const folded = instancedMeshes(buildRebarScene(sampleInput())).filter(
      ({ name }) => name.endsWith(hoopSize),
    )
    const split = instancedMeshes(buildRebarScene(withStirrup())).filter(
      ({ name }) => name.endsWith(hoopSize),
    )

    expect(folded).toHaveLength(1)
    expect(split).toHaveLength(2)
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
      await exportRebarGlb({ project, rebars, locale: 'ja' })
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
