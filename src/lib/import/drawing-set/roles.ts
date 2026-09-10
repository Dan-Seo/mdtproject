import { parseSectionLists } from '../section-list/parse'
import type { TextPage } from '../section-list/types'
import { parseFramingPlan } from '../framing-plan/parse'
import { parseFrameElevations } from '../framing-plan/elevation'
import { PAGE_ROLES, type DrawingSetPage, type PageAssessment, type PageOutputs } from './types'

export function runPageParsers(page: TextPage): PageOutputs {
  return { lists: parseSectionLists(page), plan: parseFramingPlan(page), elevations: parseFrameElevations(page) }
}

/** Roles describe parser output, never authority or eligibility for assembly. */
export function assessPageRoles(page: DrawingSetPage, outputs: PageOutputs): PageAssessment {
  const { lists, plan, elevations } = outputs
  const counts = [lists.length, plan.blocks.length, elevations.elevations.length]
  return {
    source: page.source, pageNumber: page.pageNumber,
    roles: PAGE_ROLES.filter((_, i) => counts[i] > 0),
    lists, blocks: plan.blocks, grids: plan.grids, elevations: elevations.elevations,
    issues: { plan: plan.issues, elevation: elevations.issues },
  }
}
