import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assembleDrawingSet, reconcileAssessments } from '@/lib/import/drawing-set/reconcile'
import { assessPageRoles, runPageParsers } from '@/lib/import/drawing-set/roles'
import type { BlockRef, DrawingSetCandidate, DrawingSetPage, PageAssessment, SeriesRef } from '@/lib/import/drawing-set/types'
import { CLAIMED, REFERENCE_ONLY } from './claims'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
interface GoldenPage { fixture: string; source: string; pageNumber: number; roles: string[]; listKinds: string[]; blockTitles: string[] }
interface Gap { path: string; direction: 'missing' | 'extra' | 'both' }
interface Golden { set: string; pages: GoldenPage[]; knownGaps: Gap[]; unsure: { path: string }[]; storiesReference: { fixture: string; titles: string[] } | null }
const membership = { excludedPages: [], excludedBlocks: [] }
const sets = ['yokohama', 'hirosaki', 'ina', 'kani', 'tsu']
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const title = (s: string) => s.normalize('NFKC').replace(/\s/g, '').replace(/(?:S=)?1\/\d+$/, '')
function normalize(value: Json, path = ''): Json {
  if (typeof value === 'string') return /(?:blockTitle|blockTitles|titles)(?:\[\d+\])?$/.test(path) ? title(value) : value
  if (Array.isArray(value)) return value.map((v, i) => normalize(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, path ? `${path}.${k}` : k)]))
  return value
}
// Null denotes no claim. Empty collections have no primitive leaves.
function leaves(value: Json, path = '', out = new Map<string, Json>()): Map<string, Json> {
  if (value === null) return out
  if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out))
  else if (typeof value === 'object') Object.entries(value).forEach(([k, v]) => leaves(v, path ? `${path}.${k}` : k, out))
  else out.set(path, value)
  return out
}
const under = (leaf: string, tree: string) => leaf === tree || leaf.startsWith(`${tree}.`) || leaf.startsWith(`${tree}[`)
function valuePaths(value: Json, path = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    if (!value.length) out.add(`${path}[]`)
    value.forEach(v => valuePaths(v, `${path}[]`, out))
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => valuePaths(v, path ? `${path}.${k}` : k, out))
  } else out.add(path)
  return out
}
function projection(c: DrawingSetCandidate, g: Golden): Json {
  const page = (r: SeriesRef | BlockRef) => g.pages.find(p => p.source === r.source && p.pageNumber === r.pageNumber)!
  const assessment = (r: SeriesRef) => c.pages.find(p => p.source === r.source && p.pageNumber === r.pageNumber)!
  const series = (r: SeriesRef) => ({ fixture: page(r).fixture, titles: assessment(r).elevations[r.index].titles })
  const block = (r: BlockRef) => ({ fixture: page(r).fixture, ...(assessment(r).blocks[r.index].title === undefined ? {} : { blockTitle: assessment(r).blocks[r.index].title! }) })
  return {
    pages: c.pages.map((p, i) => ({ fixture: g.pages[i].fixture, source: p.source, pageNumber: p.pageNumber, roles: p.roles, listKinds: p.lists.map(l => l.listKind), blockTitles: p.blocks.flatMap(b => b.title === undefined ? [] : [b.title]) })),
    grid: c.grid ? { xLabels: c.grid.xLabels, xSpansMm: c.grid.xSpansMm, yLabels: c.grid.yLabels, ySpansMm: c.grid.ySpansMm } : null,
    stories: c.stories ? { levels: c.stories.levels, heightsMm: c.stories.heightsMm } : null,
    storiesReference: c.stories ? series(c.stories.reference) : null,
    blockToStory: c.blocks.flatMap(b => b.levelIndex === undefined ? [] : [{ ...block(b.ref), storyName: b.storyName! }]),
    unmatchedBlocks: c.blocks.flatMap(b => b.levelIndex === undefined ? [block(b.ref)] : []),
    conflicts: c.conflicts.map(f => {
      let payload: Json
      switch (f.code) {
        case '通り芯不一致': payload = { blocks: f.payload.blocks.map(block) }; break
        case '階高不一致': payload = { ...f.payload, reference: series(f.payload.reference), series: series(f.payload.series) }; break
        case '階未収録レベル': payload = { ...f.payload, series: series(f.payload.series) }; break
        case '階重複ブロック': payload = { storyName: f.payload.storyName, blocks: f.payload.blocks.map(block) }; break
      }
      return { code: f.code, blocking: f.blocking, evidence: f.evidence.map(e => ({ ...e })), payload }
    }),
  }
}
function expected(g: Golden): Json {
  const raw = g as unknown as Record<string, Json>
  return { ...Object.fromEntries(['grid', 'stories', 'storiesReference', 'blockToStory', 'unmatchedBlocks'].map(k => [k, raw[k]])), pages: g.pages.map(p => ({ fixture: p.fixture, source: p.source, pageNumber: p.pageNumber, roles: p.roles, listKinds: p.listKinds, blockTitles: p.blockTitles })), conflicts: (raw.conflicts as Record<string, Json>[]).map(f => Object.fromEntries(Object.entries(f).filter(([key]) => key !== 'note'))) }
}
function loadPages(g: Golden): DrawingSetPage[] {
  return g.pages.map(p => { const f = read(`tests/fixtures/section-import/textitems/${p.fixture}.json`); return { source: p.source, pageNumber: p.pageNumber, page: { ...f.page, items: f.items } } })
}
describe('drawing-set golden claims', () => {
  it('claims every golden value path exactly once, with no ghost registration', () => {
    const paths = new Set(sets.flatMap(s => [...valuePaths(read(`tests/fixtures/drawing-set/expected/${s}.json`))]))
    const ledger = [...CLAIMED, ...REFERENCE_ONLY]
    expect(new Set(ledger.map(x => x.path)).size).toBe(ledger.length)
    expect(new Set(ledger.map(x => x.path))).toEqual(paths)
    for (const set of sets) {
      const g = read(`tests/fixtures/drawing-set/expected/${set}.json`)
      const core = [...valuePaths(g)].filter(p => /^(grid|stories|blockToStory|conflicts)(?:\.|\[|$)/.test(p))
      expect(core.some(p => CLAIMED.some(x => x.path === p)), `${set} has no substantive claim`).toBe(true)
    }
    for (const entry of CLAIMED) expect(entry.test).toBe('primitive claims and live directional gaps')
  })
  for (const set of sets) it(`${set}: primitive claims and live directional gaps`, () => {
    const g: Golden = read(`tests/fixtures/drawing-set/expected/${set}.json`)
    const c = assembleDrawingSet(loadPages(g), membership)
    const actual = leaves(normalize(projection(c, g)))
    const wanted = leaves(normalize(expected(g)))
    expect(new Set(g.knownGaps.map(x => x.path)).size).toBe(g.knownGaps.length)
    const extra = [...actual].filter(([p, v]) => !g.knownGaps.some(x => x.direction !== 'missing' && under(p, x.path)) && wanted.get(p) !== v)
    const missing = [...wanted].filter(([p, v]) => !g.knownGaps.some(x => x.direction !== 'extra' && under(p, x.path)) && !g.unsure.some(x => under(p, x.path)) && actual.get(p) !== v)
    expect(extra, `${set}: unregistered output claims`).toEqual([])
    expect(missing, `${set}: missing golden claims`).toEqual([])
    for (const gap of g.knownGaps) {
      if (gap.direction !== 'extra') expect([...wanted].some(([p, v]) => under(p, gap.path) && actual.get(p) !== v), `${set} stale missing ${gap.path}`).toBe(true)
      if (gap.direction !== 'missing') expect([...actual].some(([p, v]) => under(p, gap.path) && wanted.get(p) !== v), `${set} stale extra ${gap.path}`).toBe(true)
    }
    if (!g.storiesReference || g.knownGaps.some(x => x.path === 'storiesReference' && x.direction === 'missing')) {
      expect(c.stories).toBeNull()
    } else {
      const p = g.pages.find(p => p.fixture === g.storiesReference!.fixture)!
      const a = c.pages.find(a => a.source === p.source && a.pageNumber === p.pageNumber)!
      const matches = a.elevations.flatMap((e, index) => g.storiesReference!.titles.every(t => e.titles.map(title).includes(title(t))) ? [{ source: p.source, pageNumber: p.pageNumber, index }] : [])
      expect(matches).toHaveLength(1)
      expect(c.stories?.reference).toEqual(matches[0])
    }
  })
})

function synthetic(): PageAssessment[] {
  const axis = (direction: 'X' | 'Y') => ({ direction, axes: [{ label: `${direction}1`, positionPt: 0 }, { label: `${direction}2`, positionPt: 100 }], spansMm: [4000], scalePtPerMm: 0.025, totalConfirmed: false })
  return [1, 2, 3].map(pageNumber => ({ source: 'synthetic.pdf', pageNumber, roles: ['伏図', '軸組図'], lists: [], blocks: [{ title: `${pageNumber}階伏図`, xGrid: axis('X'), yGrid: axis('Y'), placements: [], unplacedMarks: [] }], grids: [], elevations: [{ titles: [`frame-${pageNumber}`], levels: ['RFL', '3FL', '2FL', '1FL', 'GL'].map((s, i) => ({ labels: [s], positionPt: i * 100 })), heightsMm: [3000, 3100, 3200, 100], scalePtPerMm: 0.025 }], issues: { plan: [], elevation: [] } }))
}
describe('reconciliation perturbations', () => {
  it('preserves all diagnostic output and describes multiple roles', () => {
    const g: Golden = read('tests/fixtures/drawing-set/expected/kani.json')
    const p = loadPages(g)[0]; const o = runPageParsers(p.page); const a = assessPageRoles(p, o)
    expect(a.roles).toEqual(['断面リスト', '伏図'])
    expect(a.lists).toBe(o.lists); expect(a.blocks).toBe(o.plan.blocks); expect(a.grids).toBe(o.plan.grids)
    expect(a.elevations).toBe(o.elevations.elevations)
    expect(a.issues).toEqual({ plan: o.plan.issues, elevation: o.elevations.issues })
  })
  it('identifies an outlier span and restores the grid after block exclusion', () => {
    const a = synthetic(); a[1].blocks[0].xGrid.spansMm[0]++
    const c = reconcileAssessments(a, membership)
    expect(c.grid).toBeNull()
    expect(c.conflicts).toContainEqual({ code: '通り芯不一致', blocking: true, evidence: [{ source: 'synthetic.pdf', pageNumber: 2 }], payload: { blocks: [{ source: 'synthetic.pdf', pageNumber: 2, index: 0 }] } })
    const d = reconcileAssessments(a, { ...membership, excludedBlocks: [c.blocks[1].ref] })
    expect(d.grid?.xSpansMm).toEqual([4000]); expect(d.conflicts).toEqual([])
  })
  it('reports all blocks on a tie and ignores diagnostic grids and drawing coordinates', () => {
    const a = synthetic().slice(0, 2); a[1].blocks[0].yGrid.spansMm[0]++
    expect(reconcileAssessments(a, membership).conflicts[0].payload).toEqual({ blocks: a.map(p => ({ source: p.source, pageNumber: p.pageNumber, index: 0 })) })
    a[1].blocks[0].yGrid.spansMm[0]--; a[1].blocks[0].xGrid.axes[0].positionPt = 99
    a[1].blocks[0].xGrid.scalePtPerMm = 5; a[1].blocks[0].xGrid.totalConfirmed = true
    a[0].grids = [{ ...a[0].blocks[0].xGrid, spansMm: [999] }]
    expect(reconcileAssessments(a, membership).grid?.xSpansMm).toEqual([4000])
  })
  it('compares cumulative common intervals with reference names', () => {
    const a = synthetic(); a[1].elevations[0].heightsMm[1]++
    const c = reconcileAssessments(a, membership)
    expect(c.conflicts).toContainEqual({ code: '階高不一致', blocking: false, evidence: [{ source: 'synthetic.pdf', pageNumber: 1 }, { source: 'synthetic.pdf', pageNumber: 2 }], payload: { reference: c.stories!.reference, series: { source: 'synthetic.pdf', pageNumber: 2, index: 0 }, levelA: '3FL', levelB: '2FL', referenceMm: 3100, seriesMm: 3101 } })
    a[1].elevations[0].levels.splice(2, 1); a[1].elevations[0].heightsMm.splice(1, 2, 6301)
    expect(reconcileAssessments(a, membership).conflicts[0].payload).toMatchObject({ levelA: '3FL', levelB: '1FL', referenceMm: 6300, seriesMm: 6301 })
  })
  it('preserves individually unique split aliases and exposes their height differences', () => {
    const a = synthetic().slice(0, 2)
    a.forEach(p => { p.blocks = [] })
    const r = a[0].elevations[0]; const s = a[1].elevations[0]
    r.levels = [['2FL'], ['1FL', 'GL'], ['基礎下端']].map((labels, positionPt) => ({ labels, positionPt }))
    r.heightsMm = [3000, 200]
    s.levels = ['2FL', '1FL', 'GL', '基礎下端'].map((label, positionPt) => ({ labels: [label], positionPt }))
    s.heightsMm = [3000, 100, 100]
    const c = reconcileAssessments(a, membership, { source: 'synthetic.pdf', pageNumber: 1, index: 0 })
    expect(c.conflicts.map(f => ({ code: f.code, payload: f.payload }))).toEqual([
      { code: '階高不一致', payload: { reference: c.stories!.reference, series: { source: 'synthetic.pdf', pageNumber: 2, index: 0 }, levelA: '1FL／GL', levelB: '1FL／GL', referenceMm: 0, seriesMm: 100 } },
      { code: '階高不一致', payload: { reference: c.stories!.reference, series: { source: 'synthetic.pdf', pageNumber: 2, index: 0 }, levelA: '1FL／GL', levelB: '基礎下端', referenceMm: 200, seriesMm: 100 } },
    ])
  })
  for (const kind of ['unknown', 'reference-duplicate', 'series-duplicate', 'alias-conflict']) it(`rejects ambiguous level correspondence: ${kind}`, () => {
    const a = synthetic(); const r = a[0].elevations[0]; const s = a[1].elevations[0]
    if (kind === 'unknown') s.levels[2].labels = ['unknown']
    if (kind === 'reference-duplicate') r.levels[1].labels = ['2FL']
    if (kind === 'series-duplicate') s.levels[1].labels = ['2FL']
    if (kind === 'alias-conflict') { s.levels[2].labels = ['2FL', '1FL']; s.levels[3].labels = ['other'] }
    expect(reconcileAssessments(a, membership).conflicts).toContainEqual(expect.objectContaining({ code: '階未収録レベル', blocking: false, payload: { series: { source: 'synthetic.pdf', pageNumber: 2, index: 0 }, level: s.levels[2].labels.join('／') } }))
  })
  it('requires unique story keys, records duplicate blocks by level index, and never assigns the top', () => {
    const a = synthetic(); a[1].blocks[0].title = '1階伏図'
    const c = reconcileAssessments(a, membership)
    expect(c.conflicts[0]).toMatchObject({ code: '階重複ブロック', payload: { levelIndex: 3, storyName: '1FL', blocks: [c.blocks[0].ref, c.blocks[1].ref] } })
    a[1].blocks[0].title = '9階伏図'; a[2].blocks[0].title = 'R階伏図'
    const d = reconcileAssessments(a, membership)
    expect(d.blocks[1].levelIndex).toBeUndefined(); expect(d.blocks[2].storyName).toBeUndefined(); expect(d.conflicts).toEqual([])
    a[0].elevations[0].levels[2].labels = ['1FL']
    expect(reconcileAssessments(a, membership).blocks[0].levelIndex).toBeUndefined()
  })
  it('orders reference choices stably, honors explicit references, and excludes pages only from voting', () => {
    const a = synthetic(); a[1].elevations.push(structuredClone(a[1].elevations[0]))
    const c = reconcileAssessments(a, membership)
    expect(c.referenceChoices.map(r => [r.pageNumber, r.index])).toEqual([[1, 0], [2, 0], [2, 1], [3, 0]])
    const d = reconcileAssessments(a, { ...membership, excludedPages: [{ source: 'synthetic.pdf', pageNumber: 1 }] }, c.referenceChoices[2])
    expect(d.pages).toEqual(a); expect(d.blocks).toHaveLength(2); expect(d.stories?.reference).toEqual(c.referenceChoices[2])
    expect(reconcileAssessments([], membership)).toMatchObject({ grid: null, stories: null, referenceChoices: [], blocks: [], conflicts: [] })
  })
})
