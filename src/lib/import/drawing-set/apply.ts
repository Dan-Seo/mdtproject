import type { Project } from '@/domain/model/project'
import { applyElevation, applyFramingPlan, type PlanApplyResult } from '../framing-plan/apply'
import type { ElevationApplyRefusal, PlanApplyRefusal } from '../framing-plan/types'
import type { DrawingSetPlan } from './plan'
import type { BlockRef } from './types'

export interface DrawingSetApplyResult {
  project: Project
  refusal?: ElevationApplyRefusal
  storiesApplied: number
  perStory: Array<
    | { levelIndex: number; storyName: string; storyId: string; ref: BlockRef; applied: number; skipped: PlanApplyResult['skipped']; refusal?: PlanApplyRefusal }
    | { levelIndex: number; storyName: string; ref: BlockRef; unmapped: true }
  >
}

export function applyDrawingSet(project: Project, plan: DrawingSetPlan): DrawingSetApplyResult {
  const elevation = applyElevation(project, plan.elevation)
  if (elevation.refusal) return { project, refusal: elevation.refusal, storiesApplied: 0, perStory: [] }
  let current = elevation.project
  const perStory: DrawingSetApplyResult['perStory'] = []
  // The existing elevation loop emits one Story per floor, bottom to top.
  // Match those indices, never names or invented IDs.
  const actual = new Map(current.stories.map((s, i) => [plan.elevation.bottomLevelIndex - i, s]))
  const apply = (b: DrawingSetPlan['perStory'][number]) => {
    const { levelIndex, storyName, ref } = b
    const story = actual.get(levelIndex)
    if (!story) { perStory.push({ levelIndex, storyName, ref, unmapped: true }); return }
    const result = applyFramingPlan(current, { block: b.block, storyId: story.id, sectionStoryLabel: b.sectionStoryLabel, discardOtherStories: false })
    current = result.project
    perStory.push({ levelIndex, storyName, storyId: story.id, ref, applied: result.applied, skipped: result.skipped, ...(result.refusal ? { refusal: result.refusal } : {}) })
  }
  for (const levelIndex of actual.keys()) for (const b of plan.perStory) if (b.levelIndex === levelIndex) apply(b)
  for (const b of plan.perStory) if (!actual.has(b.levelIndex)) apply(b)
  return { project: current, storiesApplied: elevation.applied, perStory }
}
