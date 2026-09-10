import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSampleProject } from '@/domain/model/sample-project'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import type { Section } from '@/domain/model/member'
import { applyElevation, applyFramingPlan } from '@/lib/import/framing-plan/apply'
import { assembleDrawingSet, reconcileAssessments } from '@/lib/import/drawing-set/reconcile'
import { resolveDrawingSetPlan, type DrawingSetChoices, type DrawingSetPlan } from '@/lib/import/drawing-set/plan'
import { applyDrawingSet } from '@/lib/import/drawing-set/apply'
import type { BlockRef, DrawingSetCandidate, DrawingSetPage, PageAssessment } from '@/lib/import/drawing-set/types'

const membership = { excludedPages: [], excludedBlocks: [] }
const key = (r: BlockRef) => `${r.source}#${r.pageNumber}#${r.index}`
function pages(set: string): DrawingSetPage[] {
  const g = JSON.parse(readFileSync(`tests/fixtures/drawing-set/expected/${set}.json`, 'utf8')) as { pages: { source: string; pageNumber: number; fixture: string }[] }
  return g.pages.map(p => {
    const f = JSON.parse(readFileSync(`tests/fixtures/section-import/textitems/${p.fixture}.json`, 'utf8'))
    return { source: p.source, pageNumber: p.pageNumber, page: { ...f.page, items: f.items } }
  })
}
function choices(c: DrawingSetCandidate): DrawingSetChoices {
  return { reference: { ...c.stories!.reference }, topLevelIndex: 0, bottomLevelIndex: c.stories!.levels.length - 1, discardMembers: true }
}
function plan(c: DrawingSetCandidate, ch = choices(c)): DrawingSetPlan {
  const r = resolveDrawingSetPlan(c, ch)
  expect(r).toHaveProperty('plan')
  if (!('plan' in r)) throw new Error(JSON.stringify(r))
  return r.plan
}
function synthetic(labels = ['RFL', '2FL', '1FL', 'GL'], titles = ['1階伏図', '2階伏図']): DrawingSetCandidate {
  const axis = (direction: 'X' | 'Y') => ({ direction, axes: [{ label: `${direction}1`, positionPt: 0 }, { label: `${direction}2`, positionPt: 100 }], spansMm: [4000], scalePtPerMm: 0.025, totalConfirmed: false })
  const a: PageAssessment = { source: 'test.pdf', pageNumber: 1, roles: ['伏図', '軸組図'], lists: [], grids: [], issues: { plan: [], elevation: [] }, blocks: titles.map(title => ({ title, xGrid: axis('X'), yGrid: axis('Y'), placements: [{ mark: 'C1', role: '格子点', ix: 0, iy: 0 }], unplacedMarks: [] })), elevations: [{ titles: ['frame'], levels: labels.map((s, positionPt) => ({ labels: [s], positionPt })), heightsMm: labels.slice(1).map(() => 3000), scalePtPerMm: 0.025 }] }
  return reconcileAssessments([a], membership)
}
function tsu() {
  const p = pages('tsu'); const all = assembleDrawingSet(p, membership)
  // 杭伏図 has no story key. Keep p16 included and exclude only its block.
  const excludedBlocks = all.blocks.filter(b => b.ref.pageNumber === 16 && b.block.title?.startsWith('杭伏図')).map(b => b.ref)
  expect(excludedBlocks).toHaveLength(1)
  return assembleDrawingSet(p, { excludedPages: [], excludedBlocks })
}

describe('drawing-set plan and apply', () => {
  it('composes the tsu set exactly, creates registered members, forwards section labels and is pure', () => {
    const c = tsu(); const ch = choices(c)
    ch.sectionStoryLabels = { 2: 'selected' }
    const beforeResolve = structuredClone({ c, ch })
    const p = plan(c, ch); const project = createSampleProject()
    expect({ c, ch }).toEqual(beforeResolve)
    const marks = new Map(c.blocks.flatMap(b => b.block.placements.map(m => [m.mark, m.role] as const)))
    project.sections = [...marks].map(([mark, role], i): Section => ({ ...project.sections.find(s => s.kind === (role === '格子点' ? '柱' : role === '辺' ? '大梁' : '床板'))!, id: `registered-${i}`, mark, storyLabel: 'selected' }))
    // A competing label proves the selected label is actually forwarded.
    project.sections.push(...project.sections.map(s => ({ ...s, id: `${s.id}-other`, storyLabel: 'other' })))
    const before = structuredClone({ c, ch, project, p })
    const result = applyDrawingSet(project, p)
    let manual = applyElevation(project, { candidate: c.stories!.candidate, topLevelIndex: ch.topLevelIndex, bottomLevelIndex: ch.bottomLevelIndex, discardMembers: true }).project
    const created = [...manual.stories]
    for (let i = 0; i < created.length; i++) {
      const levelIndex = ch.bottomLevelIndex - i
      for (const b of p.perStory.filter(b => b.levelIndex === levelIndex)) manual = applyFramingPlan(manual, { block: b.block, storyId: created[i].id, sectionStoryLabel: ch.sectionStoryLabels?.[levelIndex], discardOtherStories: false }).project
    }
    expect(result.project).toEqual(manual)
    const takeoff = buildTakeoff(result.project)
    const imported = result.project.members.filter(m => m.kind === '大梁')
    expect(result.project.members.some(m => m.kind === '柱')).toBe(false)
    expect(imported).toHaveLength(6)
    expect(takeoff.unsupportedMembers).toEqual(imported.map(m => ({
      memberId: m.id,
      mark: result.project.sections.find(s => s.id === m.sectionId)!.mark,
      storyName: '2FL',
      reason: '支持柱なし',
    })))
    const otherStories = { ...result.project, members: result.project.members.filter(m => !imported.some(g => g.id === m.id)) }
    expect(takeoff.lines.filter(line => line.storyName !== '2FL')).toEqual(buildTakeoff(otherStories).lines)
    expect(result.storiesApplied).toBe(5)
    expect(p.perStory).toHaveLength(1)
    expect(result.project.members.length).toBeGreaterThanOrEqual(1)
    expect(result.project.members.length).toBe(result.perStory.reduce((n, s) => n + ('applied' in s ? s.applied : 0), 0))
    expect(result.perStory.every(s => !('refusal' in s))).toBe(true)
    expect({ c, ch, project, p }).toEqual(before)
    expect(resolveDrawingSetPlan(c, ch)).toEqual({ plan: p })
    expect({ c, ch, project, p }).toEqual(before)
    console.log(JSON.stringify({ equivalence: { set: 'tsu', stories: result.storiesApplied, blocks: p.perStory.length, equal: true }, members_created: result.project.members.length }))
  })
  it('propagates elevation refusal with the original project reference', () => {
    const c = synthetic(); const project = createSampleProject()
    const r = applyDrawingSet(project, plan(c, { ...choices(c), discardMembers: false }))
    expect(r).toEqual({ project, refusal: '部材あり階置換不可', storiesApplied: 0, perStory: [] })
    expect(r.project).toBe(project)
  })
  it('checks missing grid and stories before reference and range', () => {
    const c = synthetic(); const ch = choices(c)
    expect(resolveDrawingSetPlan({ ...c, grid: null }, ch)).toMatchObject({ refusal: '通り芯未確定' })
    const kani = assembleDrawingSet(pages('kani'), membership)
    expect(kani.stories).toBeNull(); expect(kani.grid).not.toBeNull()
    for (const topLevelIndex of [0, -1, NaN]) expect(resolveDrawingSetPlan(kani, { ...ch, topLevelIndex })).toMatchObject({ refusal: '階未確定' })
  })
  it('invalidates choices after an actual yokohama reference switch', () => {
    const p = pages('yokohama')
    const ref = (pageNumber: number) => ({ source: p.find(x => x.pageNumber === pageNumber)!.source, pageNumber, index: 0 })
    const a = assembleDrawingSet(p, membership, ref(8)); const b = assembleDrawingSet(p, membership, ref(9))
    expect(a.stories!.levels).toEqual(b.stories!.levels)
    expect(a.stories!.heightsMm).not.toEqual(b.stories!.heightsMm)
    expect(resolveDrawingSetPlan(b, choices(a))).toMatchObject({ refusal: '基準不一致' })
  })
  it('rejects invalid ranges and manual indices', () => {
    const c = synthetic(); const ch = choices(c)
    for (const [topLevelIndex, bottomLevelIndex] of [[-1, 3], [0, 4], [2, 2], [2, 1], [0.5, 3], [0, NaN]]) expect(resolveDrawingSetPlan(c, { ...ch, topLevelIndex, bottomLevelIndex })).toMatchObject({ refusal: '階範囲不正' })
    for (const index of [0, 4, 1.5, NaN]) expect(resolveDrawingSetPlan(c, { ...ch, blockStories: { [key(c.blocks[0].ref)]: index } })).toMatchObject({ refusal: '階範囲不正' })
  })
  it('rejects unmatched blocks and final duplicates, but manual choices win', () => {
    const c = synthetic(); const ch = choices(c)
    const duplicate = resolveDrawingSetPlan(c, { ...ch, blockStories: { [key(c.blocks[1].ref)]: 2 } })
    expect(duplicate).toMatchObject({ refusal: '未解決の矛盾', detail: { conflicts: [{ code: '階重複ブロック', payload: { levelIndex: 2 } }] } })
    const swapped = plan(c, { ...ch, blockStories: { [key(c.blocks[0].ref)]: 1, [key(c.blocks[1].ref)]: 2 } })
    expect(swapped.perStory.map(s => s.ref.index)).toEqual([1, 0])
    const unknown = synthetic(undefined, ['unknown'])
    expect(resolveDrawingSetPlan(unknown, choices(unknown))).toMatchObject({ refusal: '階未対応ブロック', detail: { blocks: [unknown.blocks[0].ref] } })
  })
  it('recalculates duplicates and unique matches after user selection', () => {
    const c = synthetic(undefined, ['1階伏図', '1階伏図'])
    expect(c.conflicts[0].code).toBe('階重複ブロック')
    expect(plan(c, { ...choices(c), blockStories: { [key(c.blocks[1].ref)]: 1 } }).conflicts).toEqual([])
    const repeated = synthetic(['2FL', '1FL', '1FL', 'GL'], ['1階伏図'])
    expect(repeated.blocks[0].levelIndex).toBeUndefined()
    expect(plan(repeated, { ...choices(repeated), topLevelIndex: 1, bottomLevelIndex: 3 }).perStory[0].levelIndex).toBe(2)
  })
  it('applies identically named stories by floor index, in floor order', () => {
    const c = synthetic(['2FL', '1FL', '1FL', 'GL'], ['first', 'second'])
    c.blocks[1].block.placements[0].ix = 1
    const p = plan(c, { ...choices(c), blockStories: { [key(c.blocks[0].ref)]: 1, [key(c.blocks[1].ref)]: 2 } })
    // Application order comes from actual floors, even if plan entries are shuffled.
    p.perStory.reverse()
    const r = applyDrawingSet(createSampleProject(), p)
    expect(r.perStory).toMatchObject([{ levelIndex: 2, storyName: '1FL', storyId: 'story-2', applied: 1 }, { levelIndex: 1, storyName: '1FL', storyId: 'story-3', applied: 1 }])
    expect(r.project.members.map(m => m.storyId)).toEqual(['story-2', 'story-3'])
    expect(r.project.members.map(m => ({ storyId: m.storyId, ix: m.position.ix }))).toEqual([{ storyId: 'story-2', ix: 1 }, { storyId: 'story-3', ix: 0 }])
    expect(r.perStory.map(s => s.ref.index)).toEqual([1, 0])
  })
  it('preserves information conflicts but refuses a membership grid conflict', () => {
    const c = synthetic()
    const info = { code: '階未収録レベル' as const, blocking: false as const, evidence: [{ source: 'test.pdf', pageNumber: 1 }], payload: { series: c.stories!.reference, level: 'unknown' } }
    c.conflicts.push(info)
    expect(plan(c).conflicts).toEqual([info])
    c.conflicts.push({ code: '通り芯不一致', blocking: true, evidence: info.evidence, payload: { blocks: c.blocks.map(b => b.ref) } })
    expect(resolveDrawingSetPlan(c, choices(c))).toMatchObject({ refusal: '未解決の矛盾' })
  })
  it('reports unmapped indices without inventing story IDs', () => {
    const p = plan(synthetic()); p.perStory[0].levelIndex = 99
    const r = applyDrawingSet(createSampleProject(), p)
    expect(r.perStory).toContainEqual({ levelIndex: 99, storyName: p.perStory[0].storyName, ref: p.perStory[0].ref, unmapped: true })
  })
})
