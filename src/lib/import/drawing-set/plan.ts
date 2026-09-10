import { PROJECT_SCHEMA_VERSION, type Project } from '@/domain/model/project'
import { applyElevation, type ElevationApplyOptions } from '../framing-plan/apply'
import type { PlanBlock } from '../framing-plan/types'
import { storyKey, storyLabelFromTitle, storyNameKey } from '../story-label'
import type { BlockRef, Conflict, DrawingSetCandidate, SeriesRef } from './types'

export interface DrawingSetChoices {
  /** Identity of the reference series on which these choices were made. */
  reference: SeriesRef
  topLevelIndex: number
  bottomLevelIndex: number
  discardMembers?: boolean
  /** BlockRef key (source#pageNumber#index) to the future Story's floor level. */
  blockStories?: Record<string, number>
  sectionStoryLabels?: Record<number, string>
}
export const PLAN_REFUSALS = ['基準不一致', '通り芯未確定', '階未確定', '未解決の矛盾', '階未対応ブロック', '階範囲不正'] as const
export type PlanRefusal = (typeof PLAN_REFUSALS)[number]
export interface DrawingSetPlan {
  elevation: ElevationApplyOptions
  stories: Array<{ levelIndex: number; storyName: string }>
  perStory: Array<{ levelIndex: number; storyName: string; block: PlanBlock; ref: BlockRef; sectionStoryLabel?: string }>
  conflicts: Conflict[]
}

export function resolveDrawingSetPlan(candidate: DrawingSetCandidate, choices: DrawingSetChoices): { plan: DrawingSetPlan } | { refusal: PlanRefusal; detail: unknown } {
  if (!candidate.grid) return { refusal: '通り芯未確定', detail: null }
  if (!candidate.stories) return { refusal: '階未確定', detail: null }
  const reference = candidate.stories.reference
  // SeriesRef is a flat value object; property order does not affect identity.
  if (!choices.reference || choices.reference.source !== reference.source || choices.reference.pageNumber !== reference.pageNumber || choices.reference.index !== reference.index) {
    return { refusal: '基準不一致', detail: { reference, selected: choices.reference } }
  }
  const elevation: ElevationApplyOptions = {
    candidate: candidate.stories.candidate,
    topLevelIndex: choices.topLevelIndex,
    bottomLevelIndex: choices.bottomLevelIndex,
    discardMembers: choices.discardMembers,
  }
  const empty: Project = { schemaVersion: PROJECT_SCHEMA_VERSION, name: '', grid: { xSpans: [], ySpans: [] }, stories: [], sections: [], members: [] }
  // Delegate both range validation and floor naming to the existing semantics.
  const future = applyElevation(empty, elevation)
  if (future.refusal) return { refusal: '階範囲不正', detail: { topLevelIndex: choices.topLevelIndex, bottomLevelIndex: choices.bottomLevelIndex } }
  const stories = future.project.stories.map((s, i) => ({ levelIndex: choices.bottomLevelIndex - i, storyName: s.name }))
  const perStory: DrawingSetPlan['perStory'] = []
  const unmatched: BlockRef[] = []
  for (const b of candidate.blocks) {
    const label = b.block.title === undefined ? undefined : storyLabelFromTitle(b.block.title)
    const key = label === undefined ? undefined : storyKey(label)
    const matches = key === undefined ? [] : stories.filter(s => storyNameKey(s.storyName) === key)
    let story = matches.length === 1 ? matches[0] : undefined
    const blockKey = `${b.ref.source}#${b.ref.pageNumber}#${b.ref.index}`
    if (choices.blockStories && Object.prototype.hasOwnProperty.call(choices.blockStories, blockKey)) {
      const levelIndex = choices.blockStories[blockKey]
      story = stories.find(s => s.levelIndex === levelIndex)
      if (!story) return { refusal: '階範囲不正', detail: { block: b.ref, levelIndex } }
    }
    if (!story) unmatched.push(b.ref)
    else perStory.push({ ...story, block: b.block, ref: b.ref, ...(choices.sectionStoryLabels?.[story.levelIndex] === undefined ? {} : { sectionStoryLabel: choices.sectionStoryLabels[story.levelIndex] }) })
  }
  if (unmatched.length) return { refusal: '階未対応ブロック', detail: { blocks: unmatched } }
  const duplicates: Conflict[] = []
  for (const story of stories) {
    const group = perStory.filter(b => b.levelIndex === story.levelIndex)
    if (group.length > 1) duplicates.push({ code: '階重複ブロック', blocking: true, evidence: group.reduce<Array<{ source: string; pageNumber: number }>>((out, b) => {
      if (!out.some(e => e.source === b.ref.source && e.pageNumber === b.ref.pageNumber)) out.push({ source: b.ref.source, pageNumber: b.ref.pageNumber })
      return out
    }, []), payload: { ...story, blocks: group.map(b => b.ref) } })
  }
  if (duplicates.length) return { refusal: '未解決の矛盾', detail: { conflicts: duplicates } }
  const gridConflicts = candidate.conflicts.filter(c => c.code === '通り芯不一致')
  if (gridConflicts.length) return { refusal: '未解決の矛盾', detail: { conflicts: gridConflicts } }
  return { plan: { elevation, stories, perStory: perStory.sort((a, b) => b.levelIndex - a.levelIndex), conflicts: candidate.conflicts.filter(c => !c.blocking) } }
}
