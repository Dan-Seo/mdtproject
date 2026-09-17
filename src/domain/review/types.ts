import type { Project } from '../model/project'

export const REVIEW_SCHEMA_VERSION = 1

export type ElementRef =
  | { kind: 'member'; memberId: string }
  | { kind: 'joint'; columnMemberId: string }
  | { kind: 'rebar'; rebarId: string }
  | { kind: 'quantityLine'; lineId: string }

export interface ViewerPose {
  position: [number, number, number]
  target: [number, number, number]
}

export interface ClipState {
  enabled: boolean
  axis: 'x' | 'y' | 'z'
  ratio: number
}

export type ViewerLayers = Record<'main' | 'hoop' | 'concrete', boolean>

export interface MemberFingerprint {
  input: string
  result: string | null
}

export interface ReviewFingerprints {
  rulepack: string
  checkVersion: number
  checkConditions: string | null
  members: Record<string, MemberFingerprint>
}

export interface ReviewSnapshot {
  capturedAt: string
  fingerprints: ReviewFingerprints
  viewer: {
    mode: 'member' | 'building' | 'joint'
    pose: ViewerPose | null
    clip: ClipState
    layers: ViewerLayers
    selection: { group: string | null; memberId: string | null; rowId: string | null }
  }
}

export type FindingKind = '\u5E72\u6E09\u5019\u88DC' | '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC' | '\u63A5\u89E6'

export interface RecordedFinding {
  checkId: string
  findingId: string
  kind: FindingKind
  clearanceMm: number
  a: { memberId: string; rebarId: string; role: string; barIndex: number; segmentIndex: number }
  b: { memberId: string; rebarId: string; role: string; barIndex: number; segmentIndex: number }
  closestPoints: [[number, number, number], [number, number, number]]
  basis: string
}

export type ReviewHumanStatus = '\u672A\u78BA\u8A8D' | '\u78BA\u8A8D\u6E08' | '\u4FDD\u7559' | '\u5224\u65AD\u4E0D\u53EF'

export interface Confirmation {
  by: string
  at: string
  note: string
}

export interface ReviewItem {
  id: string
  createdAt: string
  updatedAt: string
  targets: ElementRef[]
  title: string
  body: string
  status: ReviewHumanStatus
  holdReason?: string
  confirmations: Confirmation[]
  snapshot: ReviewSnapshot
  finding?: RecordedFinding
}

export interface ClearanceBasis {
  valueMm: number
  source: '\u5229\u7528\u8005\u5165\u529B'
  scope: string
  enteredAt: string
  note: string
}

export interface CheckExclusion {
  id: string
  scope: {
    sameMemberOnly: boolean
    roles: [string, string]
    kinds: FindingKind[]
    memberIds?: string[]
  }
  reason: string
  createdAt: string
}

export type ChecklistStatus = '\u672A\u5165\u529B' | '\u672A\u78BA\u8A8D' | '\u78BA\u8A8D\u6E08' | '\u4FDD\u7559' | '\u9664\u5916'

export interface ChecklistConfirmation extends Confirmation {
  fingerprints: ReviewFingerprints
}

export interface ChecklistEntry {
  id: string
  label: string
  required: boolean
  reviewItemIds: string[]
  status: ChecklistStatus
  reason?: string
  confirmation?: ChecklistConfirmation
}

export interface WorkPackage {
  id: string
  name: string
  targets: ElementRef[]
  assignee: string
  dueDate: string | null
  checklist: ChecklistEntry[]
  createdAt: string
  updatedAt: string
}

export interface Baseline {
  label: string
  capturedAt: string
  project: Project
  fingerprints: ReviewFingerprints
}

export interface ReviewState {
  reviewSchemaVersion: typeof REVIEW_SCHEMA_VERSION
  baseline: Baseline | null
  settings: { clearance: ClearanceBasis | null }
  exclusions: CheckExclusion[]
  items: ReviewItem[]
  packages: WorkPackage[]
}
