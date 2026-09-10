import { PROJECT_SCHEMA_VERSION, type Project } from '@/domain/model/project'
import { applyElevation } from '../framing-plan/apply'
import type { ElevationCandidate, PlanBlock } from '../framing-plan/types'
import { compact } from '../runs'
import { storyKey, storyLabelFromTitle, storyNameKey } from '../story-label'
import { assessPageRoles, runPageParsers } from './roles'
import type { BlockAssignment, Conflict, DrawingSetCandidate, DrawingSetMembership, DrawingSetPage, Evidence, PageAssessment, SeriesRef, SetGridClaim } from './types'

const samePage = (a: Evidence, b: Evidence) => a.source === b.source && a.pageNumber === b.pageNumber
const sameRef = (a: SeriesRef, b: SeriesRef) => samePage(a, b) && a.index === b.index
function evidence(refs: Evidence[]): Evidence[] {
  return refs.reduce<Evidence[]>((out, r) => {
    if (!out.some(e => samePage(e, r))) out.push({ source: r.source, pageNumber: r.pageNumber })
    return out
  }, [])
}
function gridValues(b: PlanBlock): Omit<SetGridClaim, 'evidence'> {
  return { xLabels: b.xGrid.axes.map(a => a.label), xSpansMm: [...b.xGrid.spansMm], yLabels: b.yGrid.axes.map(a => a.label), ySpansMm: [...b.yGrid.spansMm] }
}
function reconcileGrid(blocks: BlockAssignment[], conflicts: Conflict[]): SetGridClaim | null {
  if (!blocks.length) return null
  const groups = new Map<string, BlockAssignment[]>()
  for (const b of blocks) {
    const key = JSON.stringify(gridValues(b.block))
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  if (groups.size === 1) return { ...gridValues(blocks[0].block), evidence: evidence(blocks.map(b => b.ref)) }
  // A strict majority identifies outliers, but never authorizes a partial grid.
  const majority = [...groups.values()].find(g => g.length > blocks.length / 2)
  const differing = blocks.filter(b => !majority?.includes(b)).map(b => b.ref)
  conflicts.push({ code: '通り芯不一致', blocking: true, evidence: evidence(differing), payload: { blocks: differing } })
  return null
}

function labelLevels(c: ElevationCandidate): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  c.levels.forEach((level, index) => level.labels.forEach(raw => {
    const label = compact(raw)
    const indices = map.get(label) ?? new Set<number>()
    indices.add(index); map.set(label, indices)
  }))
  return map
}
function compareSeries(reference: { ref: SeriesRef; candidate: ElevationCandidate }, series: { ref: SeriesRef; candidate: ElevationCandidate }): Conflict[] {
  const result: Conflict[] = []
  const r = reference.candidate; const s = series.candidate
  const rl = labelLevels(r); const sl = labelLevels(s)
  const pairs: { ri: number; si: number }[] = []
  const sources = evidence([reference.ref, series.ref])
  s.levels.forEach((level, si) => {
    const targets = new Set<number>()
    for (const raw of level.labels) {
      const key = compact(raw); const indices = rl.get(key)
      if (indices?.size === 1 && sl.get(key)?.size === 1) targets.add([...indices][0])
    }
    if (targets.size === 1) pairs.push({ ri: [...targets][0], si })
    else if (level.labels.length) result.push({ code: '階未収録レベル', blocking: false, evidence: sources, payload: { series: series.ref, level: level.labels.join('／') } })
  })
  // Uniqueness belongs to each label in each series. Separate aliases may map
  // to the same reference level; their differing heights still need comparison.
  const sum = (heights: number[], a: number, b: number) => heights.slice(Math.min(a, b), Math.max(a, b)).reduce((total, h) => total + h, 0) * (a <= b ? 1 : -1)
  for (let i = 1; i < pairs.length; i++) {
    const a = pairs[i - 1]; const b = pairs[i]
    const top = a.ri <= b.ri ? a : b; const bottom = a.ri <= b.ri ? b : a
    const referenceMm = sum(r.heightsMm, top.ri, bottom.ri)
    const seriesMm = sum(s.heightsMm, top.si, bottom.si)
    if (referenceMm !== seriesMm) result.push({ code: '階高不一致', blocking: false, evidence: sources, payload: { reference: reference.ref, series: series.ref, levelA: r.levels[top.ri].labels.join('／'), levelB: r.levels[bottom.ri].labels.join('／'), referenceMm, seriesMm } })
  }
  return result
}

export function reconcileAssessments(assessments: PageAssessment[], membership: DrawingSetMembership, reference?: SeriesRef): DrawingSetCandidate {
  const included = assessments.filter(p => !membership.excludedPages.some(e => samePage(e, p)))
  const blocks: BlockAssignment[] = included.flatMap(p => p.blocks.flatMap((block, index) => {
    const ref = { source: p.source, pageNumber: p.pageNumber, index }
    return membership.excludedBlocks.some(e => sameRef(e, ref)) ? [] : [{ ref, block, evidence: evidence([ref]) }]
  }))
  const conflicts: Conflict[] = []
  const grid = reconcileGrid(blocks, conflicts)
  const allSeries = included.flatMap(p => p.elevations.map((candidate, index) => ({ ref: { source: p.source, pageNumber: p.pageNumber, index }, candidate })))
  const labelCount = (c: ElevationCandidate) => c.levels.filter(l => l.labels.length > 0).length
  const eligible = allSeries.filter(s => labelCount(s.candidate) >= 2).sort((a, b) => labelCount(b.candidate) - labelCount(a.candidate))
  const selected = reference ? eligible.find(s => sameRef(s.ref, reference)) : eligible[0]
  const stories = selected ? { reference: selected.ref, candidate: selected.candidate, levels: selected.candidate.levels.map(l => l.labels.join('／')), heightsMm: [...selected.candidate.heightsMm], evidence: evidence([selected.ref]) } : null
  if (selected) {
    for (const s of allSeries) if (s !== selected) conflicts.push(...compareSeries(selected, s))
    // No real Project is involved. The existing apply function alone names floors.
    const empty: Project = { schemaVersion: PROJECT_SCHEMA_VERSION, name: '', grid: { xSpans: [], ySpans: [] }, stories: [], sections: [], members: [] }
    const bottomLevelIndex = selected.candidate.levels.length - 1
    const future = applyElevation(empty, { candidate: selected.candidate, topLevelIndex: 0, bottomLevelIndex }).project.stories
    for (const b of blocks) {
      const label = b.block.title === undefined ? undefined : storyLabelFromTitle(b.block.title)
      const key = label === undefined ? undefined : storyKey(label)
      if (key === undefined) continue
      b.storyKey = key
      const matches = future.flatMap((s, index) => storyNameKey(s.name) === key ? [{ levelIndex: bottomLevelIndex - index, storyName: s.name }] : [])
      if (matches.length === 1) Object.assign(b, matches[0])
    }
    const assigned = new Map<number, BlockAssignment[]>()
    for (const b of blocks) if (b.levelIndex !== undefined) assigned.set(b.levelIndex, [...(assigned.get(b.levelIndex) ?? []), b])
    for (const [levelIndex, group] of assigned) if (group.length > 1) conflicts.push({ code: '階重複ブロック', blocking: true, evidence: evidence(group.map(b => b.ref)), payload: { levelIndex, storyName: group[0].storyName!, blocks: group.map(b => b.ref) } })
  }
  return { pages: assessments, membership, referenceChoices: eligible.map(s => s.ref), grid, stories, blocks, conflicts }
}

export function assembleDrawingSet(pages: DrawingSetPage[], membership: DrawingSetMembership, reference?: SeriesRef): DrawingSetCandidate {
  return reconcileAssessments(pages.map(p => assessPageRoles(p, runPageParsers(p.page))), membership, reference)
}
