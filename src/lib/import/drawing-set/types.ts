import type { ParsedSectionList, TextPage } from '../section-list/types'
import type { ElevationCandidate, ElevationIssue, ParsedFrameElevations, ParsedFramingPlan, PlanBlock, PlanGridCandidate, PlanGridIssue } from '../framing-plan/types'

export const PAGE_ROLES = ['断面リスト', '伏図', '軸組図'] as const
export type PageRole = (typeof PAGE_ROLES)[number]
export interface DrawingSetPage { source: string; pageNumber: number; page: TextPage }
export interface PageOutputs { lists: ParsedSectionList[]; plan: ParsedFramingPlan; elevations: ParsedFrameElevations }
export interface PageAssessment {
  source: string
  pageNumber: number
  roles: PageRole[]
  lists: ParsedSectionList[]
  blocks: PlanBlock[]
  /** Diagnostic output only; blocks supply the grids used for reconciliation. */
  grids: PlanGridCandidate[]
  elevations: ElevationCandidate[]
  issues: { plan: PlanGridIssue[]; elevation: ElevationIssue[] }
}
export interface Evidence { source: string; pageNumber: number }
export interface SeriesRef extends Evidence { index: number }
export interface BlockRef extends Evidence { index: number }
export interface DrawingSetMembership { excludedPages: Evidence[]; excludedBlocks: BlockRef[] }
export const SET_CONFLICTS = ['通り芯不一致', '階高不一致', '階未収録レベル', '階重複ブロック'] as const
export type SetConflict = (typeof SET_CONFLICTS)[number]
export type Conflict =
  | { code: '通り芯不一致'; blocking: true; evidence: Evidence[]; payload: { blocks: BlockRef[] } }
  | { code: '階高不一致'; blocking: false; evidence: Evidence[]; payload: { reference: SeriesRef; series: SeriesRef; levelA: string; levelB: string; referenceMm: number; seriesMm: number } }
  | { code: '階未収録レベル'; blocking: false; evidence: Evidence[]; payload: { series: SeriesRef; level: string } }
  | { code: '階重複ブロック'; blocking: true; evidence: Evidence[]; payload: { levelIndex: number; storyName: string; blocks: BlockRef[] } }
export interface SetGridClaim { xLabels: string[]; xSpansMm: number[]; yLabels: string[]; ySpansMm: number[]; evidence: Evidence[] }
export interface SetStoriesClaim { reference: SeriesRef; candidate: ElevationCandidate; levels: string[]; heightsMm: number[]; evidence: Evidence[] }
export interface BlockAssignment { ref: BlockRef; block: PlanBlock; evidence: Evidence[]; levelIndex?: number; storyName?: string; storyKey?: string }
export interface DrawingSetCandidate {
  pages: PageAssessment[]
  membership: DrawingSetMembership
  referenceChoices: SeriesRef[]
  grid: SetGridClaim | null
  stories: SetStoriesClaim | null
  blocks: BlockAssignment[]
  conflicts: Conflict[]
}
