import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createSampleProject } from '@/domain/model/sample-project'
import { extractTextPages } from '@/lib/import/pdf-text'
import { assembleDrawingSet } from '@/lib/import/drawing-set/reconcile'
import { resolveDrawingSetPlan } from '@/lib/import/drawing-set/plan'
import { applyDrawingSet } from '@/lib/import/drawing-set/apply'
import { useAppStore } from '@/lib/store'
import p16 from '../../../tests/fixtures/section-import/textitems/tsu-p16.json'
import p20 from '../../../tests/fixtures/section-import/textitems/tsu-p20.json'
import p21 from '../../../tests/fixtures/section-import/textitems/tsu-p21.json'
import p22 from '../../../tests/fixtures/section-import/textitems/tsu-p22.json'
import other from '../../../tests/fixtures/section-import/textitems/yokohama-p7.json'
import { PlanImport } from './PlanImport'

vi.mock('@/lib/import/pdf-text', () => ({ extractTextPages: vi.fn() }))
const fixtures = [p16, p20, p21, p22]
const pages = fixtures.map(f => ({ ...f.page, items: f.items }))
const change = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } })
beforeEach(() => {
  vi.resetAllMocks()
  act(() => { useAppStore.getState().loadProject(createSampleProject()); useAppStore.setState({ locale: 'ja' }) })
})
async function load(extra = false) {
  vi.mocked(extractTextPages).mockResolvedValue([...pages, ...(extra ? [{ ...other.page, items: other.items }] : [])])
  render(<PlanImport />)
  fireEvent.change(screen.getByTestId('drawing-set-files'), { target: { files: [new File(['pdf'], 'set.pdf')] } })
  await waitFor(() => expect(screen.getByTestId('drawing-set-page-3')).toBeTruthy())
  const pile = [...screen.getByTestId('drawing-set-page-0').querySelectorAll('label')].find(l => l.textContent?.includes('杭伏図'))!
  fireEvent.click(pile.querySelector('input')!)
  change('drawing-set-level-top', '0')
  change('drawing-set-level-bottom', '5')
}
it('shows four roles and reference choices, composes only after explicit discard consent', async () => {
  const before = useAppStore.getState().project
  await load()
  expect(screen.getByTestId('drawing-set-files')).toHaveAttribute('multiple')
  expect(screen.getByTestId('drawing-set-pages').querySelectorAll('[data-testid^="drawing-set-page-"]:not(input)')).toHaveLength(4)
  expect(screen.getByTestId('drawing-set-reference').querySelectorAll('option').length).toBeGreaterThan(1)
  expect(useAppStore.getState().project).toBe(before)
  expect(screen.queryByTestId('drawing-set-discard-members')).toBeNull()
  fireEvent.click(screen.getByTestId('drawing-set-apply'))
  expect(useAppStore.getState().project).toBe(before)
  fireEvent.click(screen.getByTestId('drawing-set-discard-members'))
  const input = pages.map((page, i) => ({ source: 'set.pdf', pageNumber: i + 1, page }))
  const all = assembleDrawingSet(input, { excludedPages: [], excludedBlocks: [] })
  const c = assembleDrawingSet(input, { excludedPages: [], excludedBlocks: all.blocks.filter(b => b.block.title?.startsWith('杭伏図')).map(b => b.ref) })
  const resolved = resolveDrawingSetPlan(c, { reference: c.stories!.reference, topLevelIndex: 0, bottomLevelIndex: 5, discardMembers: true })
  if (!('plan' in resolved)) throw new Error(JSON.stringify(resolved))
  fireEvent.click(screen.getByTestId('drawing-set-apply'))
  expect(useAppStore.getState().project).toEqual(applyDrawingSet(before, resolved.plan).project)
  const state = useAppStore.getState()
  expect(state.project.stories.some(s => s.id === state.activeStoryId)).toBe(true)
  expect(state.hoverRowId).toBeNull()
  expect(screen.getByTestId('drawing-set-result').textContent).toContain('5')
})
it('exposes conflicting pages, allows exclusion, and clears choices on reference change', async () => {
  act(() => {
    const base = useAppStore.getState().project
    useAppStore.setState({ project: { ...base, sections: base.sections.map(s => ({ ...s, storyLabel: 'registered' })) } })
  })
  await load(true)
  expect(screen.getByTestId('drawing-set-conflicts').textContent).toContain('通り芯不一致')
  expect(screen.getByTestId('drawing-set-apply')).toBeDisabled()
  fireEvent.click(screen.getByTestId('drawing-set-page-include-4'))
  expect(screen.getByTestId('drawing-set-apply')).toBeEnabled()
  const picker = document.querySelector<HTMLSelectElement>('[data-testid^="drawing-set-block-story-"]')!
  expect(picker.value).not.toBe('')
  fireEvent.change(picker, { target: { value: '3' } })
  change('drawing-set-section-story-3', 'registered')
  const reference = screen.getByTestId('drawing-set-reference') as HTMLSelectElement
  const alternative = [...reference.options].find(o => o.value && o.value !== reference.value)!
  fireEvent.change(reference, { target: { value: alternative.value } })
  expect(screen.getByTestId('drawing-set-level-top')).toHaveValue('')
  expect(screen.getByTestId('drawing-set-level-bottom')).toHaveValue('')
  expect(picker).toHaveValue('')
  expect(screen.getByTestId('drawing-set-apply')).toBeDisabled()
  change('drawing-set-level-top', '0')
  change('drawing-set-level-bottom', '5')
  expect(screen.getByTestId('drawing-set-section-story-3')).toHaveValue('')
  expect(picker).toHaveValue('2')
  // Clearing an override must keep the options usable, so the user can recover.
  fireEvent.change(picker, { target: { value: '' } })
  expect(picker).toHaveValue('')
  expect(picker.options.length).toBeGreaterThan(1)
  expect(screen.getByTestId('drawing-set-apply')).toBeDisabled()
  fireEvent.change(picker, { target: { value: '3' } })
  expect(picker).toHaveValue('3')
  expect(screen.getByTestId('drawing-set-apply')).toBeEnabled()
})

it('keeps file identity and one-based page numbers across multiple PDFs', async () => {
  vi.mocked(extractTextPages).mockResolvedValueOnce(pages.slice(0, 2)).mockResolvedValueOnce(pages.slice(2))
  render(<PlanImport />)
  const files = [new File(['a'], 'plan.pdf'), new File(['b'], 'frame.pdf')]
  fireEvent.change(screen.getByTestId('drawing-set-files'), { target: { files } })
  await waitFor(() => expect(screen.getByTestId('drawing-set-page-3')).toBeTruthy())
  expect(extractTextPages).toHaveBeenNthCalledWith(1, files[0])
  expect(extractTextPages).toHaveBeenNthCalledWith(2, files[1])
  expect(screen.getByTestId('drawing-set-page-0').textContent).toContain('plan.pdf p.1')
  expect(screen.getByTestId('drawing-set-page-3').textContent).toContain('frame.pdf p.2')
})

it('does not retain hidden discard consent after the proposed range changes', async () => {
  const before = useAppStore.getState().project
  await load()
  fireEvent.click(screen.getByTestId('drawing-set-apply'))
  fireEvent.click(screen.getByTestId('drawing-set-discard-members'))
  change('drawing-set-level-top', '1')
  expect(screen.queryByTestId('drawing-set-discard-members')).toBeNull()
  fireEvent.click(screen.getByTestId('drawing-set-apply'))
  expect(useAppStore.getState().project).toBe(before)
  expect(screen.getByTestId('drawing-set-discard-members')).not.toBeChecked()
})

it('clearing the section filter removes it instead of filtering by an empty label', async () => {
  const base = createSampleProject()
  const before = { ...base, members: [], sections: base.sections.map(s => ({ ...s, storyLabel: 'registered' })) }
  act(() => useAppStore.getState().loadProject(before))
  await load()
  change('drawing-set-section-story-2', 'registered')
  change('drawing-set-section-story-2', '')
  fireEvent.click(screen.getByTestId('drawing-set-apply'))
  const input = pages.map((page, i) => ({ source: 'set.pdf', pageNumber: i + 1, page }))
  const all = assembleDrawingSet(input, { excludedPages: [], excludedBlocks: [] })
  const c = assembleDrawingSet(input, { excludedPages: [], excludedBlocks: all.blocks.filter(b => b.block.title?.startsWith('杭伏図')).map(b => b.ref) })
  const resolved = resolveDrawingSetPlan(c, { reference: c.stories!.reference, topLevelIndex: 0, bottomLevelIndex: 5 })
  if (!('plan' in resolved)) throw new Error(JSON.stringify(resolved))
  const expected = applyDrawingSet(before, resolved.plan).project
  expect(expected.members.length).toBeGreaterThan(0)
  expect(useAppStore.getState().project.members).toEqual(expected.members)
})
