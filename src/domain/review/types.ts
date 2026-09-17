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

export type FindingKind = '干渉候補' | 'あき不足候補' | '接触'

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

export type ReviewHumanStatus = '未確認' | '確認済' | '保留' | '判断不可'

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
  source: '利用者入力'
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

export type ChecklistStatus = '未入力' | '未確認' | '確認済' | '保留' | '除外'

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
