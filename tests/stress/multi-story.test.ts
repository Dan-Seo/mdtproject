import { describe, expect, it } from 'vitest'

import type { ColumnSection, GirderSection } from '@/domain/model/member'
import {
  beamDepthAbove,
  columnEnds,
  deserializeProject,
  findSection,
  girderRun,
  serializeProject,
  setUnitMass,
  type Project,
} from '@/domain/model/project'
import { BAR_SIZES } from '@/domain/model/member'
import type { Rebar } from '@/domain/model/rebar'
import { createStressProject } from '@/domain/model/stress-project'
import {
  aggregateQuantity,
  grandTotal,
  sizeSubtotals,
  storySubtotals,
} from '@/domain/quantity'
import { generateColumnRebar } from '@/domain/rebar/column'
import { generateGirderRebar } from '@/domain/rebar/girder'
import { buildingLayout } from '@/components/viewer/building'
import { buildTakeoffWorkbook } from '@/lib/export'
import { buildRebarScene } from '@/lib/export/gltf'
import { jpMlitRulePack } from '@/rulepack'

/** DESIGN.md §11 の M4 行「2層 3×3 多スパン」を含む、階を積んだ規模。 */
const SPAN_COUNT = { x: 4, y: 3 }
const STRESS_STORIES = 5
/** sample-project の C1 断面 — stress-project.ts がそのまま複製している。 */
const COLUMN_MAIN_BAR_COUNT = 12

/** useTakeoff.ts の buildTakeoff と同じ部材走査。 */
function generateAllRebar(project: Project): Rebar[] {
  const rebars: Rebar[] = []
  const processed = new Set<string>()

  for (const member of project.members) {
    if (member.kind === '大梁' && processed.has(member.id)) continue

    const section = findSection(project, member.sectionId)
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) throw new Error(`Story not found: ${member.storyId}`)

    if (member.kind === '柱') {
      rebars.push(
        ...generateColumnRebar(
          {
            member,
            section: section as ColumnSection,
            story,
            beamDepthAbove: beamDepthAbove(project, member),
            ends: columnEnds(project, member),
          },
          jpMlitRulePack,
        ),
      )
      continue
    }

    const run = girderRun(project, member)
    for (const runMember of run.members) processed.add(runMember.id)
    rebars.push(
      ...generateGirderRebar(
        { run, section: section as GirderSection },
        jpMlitRulePack,
      ),
    )
  }

  return rebars
}

function stressProject(storyCount: number): Project {
  const project = createStressProject({
    xSpanCount: SPAN_COUNT.x,
    ySpanCount: SPAN_COUNT.y,
    storyCount,
  })

  // 単位質量は利用者入力で、合成案件には入っていない。合計を見る検査は
  // 質量が出ないと素通りするので、算術がそのまま読める合成値を入れる。
  return BAR_SIZES.reduce((next, size) => setUnitMass(next, size, 1), project)
}

function elapsed(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

describe('多層・多スパンのストレス (R4)', () => {
  it('gives every 階 above the base the same rebar, and never mixes 階', () => {
    // 階をまたぐ通し筋は無い（girderRun は storyId で切る）ので、上階は
    // どれも同じ本数になる。基礎に載る最下階だけが 定着 のぶん増える —
    // columnEnds が 定着 を積み重ねの最下端にだけ付けるからだ (R7①)。
    const project = stressProject(STRESS_STORIES)
    const layout = buildingLayout(project, generateAllRebar(project), new Set())
    const storyOf = new Map(
      project.members.map(({ id, storyId }) => [id, storyId]),
    )

    const perStory = new Map<string, number>()
    for (const { memberId } of layout.rebar) {
      const storyId = storyOf.get(memberId)
      // 部材 id が案件に無ければ、どこかの階から漏れた実体だ。
      expect(storyId, memberId).toBeDefined()
      perStory.set(storyId!, (perStory.get(storyId!) ?? 0) + 1)
    }

    const counts = project.stories.map(({ id }) => perStory.get(id) ?? 0)
    const [base, ...above] = counts
    console.log(
      `building-view rebar instances: ${counts.join(' / ')} ` +
        `(total ${layout.rebar.length})`,
    )

    expect(new Set(above).size).toBe(1)
    // 定着 は柱1本の主筋1本につき1区間ぶん。それ以外の差は説明できない。
    const baseColumnCount = project.members.filter(
      ({ kind, storyId }) => kind === '柱' && storyId === project.stories[0].id,
    ).length
    expect(base - above[0]).toBe(baseColumnCount * COLUMN_MAIN_BAR_COUNT)

    // R4 の「層当たり鉄筋1万個規模」を階のぶんだけ積んだ状態。
    expect(above[0]).toBeGreaterThan(8000)
    expect(layout.rebar.length).toBe(counts.reduce((sum, n) => sum + n, 0))
  })

  it('keeps the whole M4 pipeline within a sane budget at ~50k instances', () => {
    const project = stressProject(STRESS_STORIES)
    let rebars: Rebar[] = []
    let lines: ReturnType<typeof aggregateQuantity> = []

    const rebarMs = elapsed(() => {
      rebars = generateAllRebar(project)
    })
    const quantityMs = elapsed(() => {
      lines = aggregateQuantity(project, rebars, jpMlitRulePack)
    })
    const layoutMs = elapsed(() => {
      buildingLayout(project, rebars, new Set())
    })
    const workbookMs = elapsed(() => {
      buildTakeoffWorkbook({ project, lines, locale: 'ja' })
    })
    let sceneMs = 0
    const scene = (() => {
      let built: ReturnType<typeof buildRebarScene> | null = null
      sceneMs = elapsed(() => {
        built = buildRebarScene({ project, rebars })
      })
      return built!
    })()

    console.log(
      `${STRESS_STORIES}F: rebar=${rebarMs.toFixed(0)}ms ` +
        `quantity=${quantityMs.toFixed(0)}ms layout=${layoutMs.toFixed(0)}ms ` +
        `workbook=${workbookMs.toFixed(0)}ms gltfScene=${sceneMs.toFixed(0)}ms`,
    )

    // 本当に崩れたときだけ落ちる緩い上限だ — 正確な数字はコンソールを見る。
    expect(rebarMs).toBeLessThan(4000)
    expect(quantityMs).toBeLessThan(4000)
    expect(layoutMs).toBeLessThan(4000)
    expect(workbookMs).toBeLessThan(4000)
    expect(sceneMs).toBeLessThan(8000)
    expect(scene.children.length).toBeGreaterThan(0)
  })

  it('reconciles 階小計・径別集計・合計 across every 階', () => {
    // 内訳書の三つの読み方が食い違えば、読み手はどれを信じるかを自分で
    // 決めることになる。階が積まるとその食い違いが初めて見える。
    const project = stressProject(STRESS_STORIES)
    const lines = aggregateQuantity(
      project,
      generateAllRebar(project),
      jpMlitRulePack,
    )
    const total = grandTotal(lines)
    const byStory = storySubtotals(lines)
    const bySize = sizeSubtotals(lines)

    expect(byStory).toHaveLength(STRESS_STORIES)
    expect(total.designKg).not.toBeNull()
    expect(
      byStory.reduce((sum, { designKg }) => sum + designKg!, 0),
    ).toBeCloseTo(total.designKg!, 6)
    expect(bySize.reduce((sum, { designKg }) => sum + designKg!, 0)).toBeCloseTo(
      total.designKg!,
      6,
    )
  })

  it('writes one 小計 row per 階 into the workbook, in 階 order', () => {
    const project = stressProject(STRESS_STORIES)
    const lines = aggregateQuantity(
      project,
      generateAllRebar(project),
      jpMlitRulePack,
    )
    const spec = buildTakeoffWorkbook({ project, lines, locale: 'ja' })
    const subtotalNames = spec.sheets[0].rows
      .filter(({ kind }) => kind === 'subtotal')
      .map(({ cells }) => cells[0].value)

    expect(subtotalNames).toEqual(
      project.stories.map(({ name }) => `${name}　小計`),
    )
  })

  it('round-trips a multi-storey 案件 through the save format', () => {
    // 自動保存も JSON 書き出しも serializeProject を通る。階が積まると
    // 直列化できない値が混ざりやすくなる（Map・関数・Date）。
    const project = stressProject(STRESS_STORIES)

    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('exports every 階 into the 3D model', () => {
    const project = stressProject(STRESS_STORIES)
    const rebars = generateAllRebar(project)
    const scene = buildRebarScene({ project, rebars })

    let instanced = 0
    scene.traverse((object) => {
      const mesh = object as { isInstancedMesh?: boolean; count?: number }
      if (mesh.isInstancedMesh === true) instanced += mesh.count ?? 0
    })

    expect(instanced).toBe(
      buildingLayout(project, rebars, new Set()).rebar.length,
    )
    expect(scene.getObjectByName('コンクリート')?.children.length).toBe(
      project.members.length,
    )
  })
})
