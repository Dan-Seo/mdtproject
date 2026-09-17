import { isRecord, parseProject } from '../model/project'
import {
  REVIEW_SCHEMA_VERSION,
  type Baseline,
  type CheckExclusion,
  type ChecklistConfirmation,
  type ChecklistEntry,
  type ChecklistStatus,
  type ClearanceBasis,
  type Confirmation,
  type FindingKind,
  type ReviewHumanStatus,
  type ReviewItem,
  type ReviewState,
  type WorkPackage,
} from './types'

const HUMAN_STATUSES: readonly ReviewHumanStatus[] = [
  '\u672A\u78BA\u8A8D',
  '\u78BA\u8A8D\u6E08',
  '\u4FDD\u7559',
  '\u5224\u65AD\u4E0D\u53EF',
]
const FINDING_KINDS: readonly FindingKind[] = [
  '\u5E72\u6E09\u5019\u88DC',
  '\u3042\u304D\u4E0D\u8DB3\u5019\u88DC',
  '\u63A5\u89E6',
]
const CHECKLIST_STATUSES: readonly ChecklistStatus[] = [
  '\u672A\u5165\u529B',
  '\u672A\u78BA\u8A8D',
  '\u78BA\u8A8D\u6E08',
  '\u4FDD\u7559',
  '\u9664\u5916',
]

function invalid(path: string): never {
  throw new Error(`Invalid ReviewState.${path}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path)
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path)
  return value
}

function nonEmptyString(value: unknown, path: string): string {
  const result = string(value, path)
  if (result.length === 0) invalid(path)
  return result
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(path)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path)
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return string(value, path)
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined) string(value, path)
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
  const result = string(value, path)
  if (!values.includes(result as T)) invalid(path)
  return result as T
}

function uniqueIds(values: unknown[], path: string): void {
  const ids = new Set<string>()
  values.forEach((value, index) => {
    const id = string(record(value, `${path}[${index}]`).id, `${path}[${index}].id`)
    if (ids.has(id)) invalid(`${path}[${index}].id`)
    ids.add(id)
  })
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => string(entry, `${path}[${index}]`))
}

function vector(value: unknown, path: string): [number, number, number] {
  const values = array(value, path)
  if (values.length !== 3) invalid(path)
  return [
    finite(values[0], `${path}[0]`),
    finite(values[1], `${path}[1]`),
    finite(values[2], `${path}[2]`),
  ]
}

function validateElementRef(value: unknown, path: string): void {
  const ref = record(value, path)
  const kind = string(ref.kind, `${path}.kind`)
  if (kind === 'member') string(ref.memberId, `${path}.memberId`)
  else if (kind === 'joint') string(ref.columnMemberId, `${path}.columnMemberId`)
  else if (kind === 'rebar') string(ref.rebarId, `${path}.rebarId`)
  else if (kind === 'quantityLine') string(ref.lineId, `${path}.lineId`)
  else invalid(`${path}.kind`)
}

function validateFingerprints(value: unknown, path: string): void {
  const fingerprints = record(value, path)
  string(fingerprints.rulepack, `${path}.rulepack`)
  finite(fingerprints.checkVersion, `${path}.checkVersion`)
  nullableString(fingerprints.checkConditions, `${path}.checkConditions`)
  const members = record(fingerprints.members, `${path}.members`)
  for (const [memberId, fingerprintValue] of Object.entries(members)) {
    const fingerprint = record(fingerprintValue, `${path}.members.${memberId}`)
    string(fingerprint.input, `${path}.members.${memberId}.input`)
    nullableString(fingerprint.result, `${path}.members.${memberId}.result`)
  }
}

function validatePose(value: unknown, path: string): void {
  const pose = record(value, path)
  vector(pose.position, `${path}.position`)
  vector(pose.target, `${path}.target`)
}

function validateSnapshot(value: unknown, path: string): void {
  const snapshot = record(value, path)
  string(snapshot.capturedAt, `${path}.capturedAt`)
  validateFingerprints(snapshot.fingerprints, `${path}.fingerprints`)

  const viewer = record(snapshot.viewer, `${path}.viewer`)
  oneOf(viewer.mode, ['member', 'building', 'joint'], `${path}.viewer.mode`)
  if (viewer.pose !== null) validatePose(viewer.pose, `${path}.viewer.pose`)

  const clip = record(viewer.clip, `${path}.viewer.clip`)
  boolean(clip.enabled, `${path}.viewer.clip.enabled`)
  oneOf(clip.axis, ['x', 'y', 'z'], `${path}.viewer.clip.axis`)
  finite(clip.ratio, `${path}.viewer.clip.ratio`)

  const layers = record(viewer.layers, `${path}.viewer.layers`)
  boolean(layers.main, `${path}.viewer.layers.main`)
  boolean(layers.hoop, `${path}.viewer.layers.hoop`)
  boolean(layers.concrete, `${path}.viewer.layers.concrete`)

  const selection = record(viewer.selection, `${path}.viewer.selection`)
  nullableString(selection.group, `${path}.viewer.selection.group`)
  nullableString(selection.memberId, `${path}.viewer.selection.memberId`)
  nullableString(selection.rowId, `${path}.viewer.selection.rowId`)
}

function validateConfirmation(value: unknown, path: string): void {
  const confirmation = record(value, path)
  string(confirmation.by, `${path}.by`)
  string(confirmation.at, `${path}.at`)
  string(confirmation.note, `${path}.note`)
}

function validateFindingEndpoint(value: unknown, path: string): void {
  const endpoint = record(value, path)
  string(endpoint.memberId, `${path}.memberId`)
  string(endpoint.rebarId, `${path}.rebarId`)
  string(endpoint.role, `${path}.role`)
  finite(endpoint.barIndex, `${path}.barIndex`)
  finite(endpoint.segmentIndex, `${path}.segmentIndex`)
}

function validateFinding(value: unknown, path: string): void {
  const finding = record(value, path)
  string(finding.checkId, `${path}.checkId`)
  string(finding.findingId, `${path}.findingId`)
  oneOf(finding.kind, FINDING_KINDS, `${path}.kind`)
  finite(finding.clearanceMm, `${path}.clearanceMm`)
  validateFindingEndpoint(finding.a, `${path}.a`)
  validateFindingEndpoint(finding.b, `${path}.b`)
  const points = array(finding.closestPoints, `${path}.closestPoints`)
  if (points.length !== 2) invalid(`${path}.closestPoints`)
  vector(points[0], `${path}.closestPoints[0]`)
  vector(points[1], `${path}.closestPoints[1]`)
  string(finding.basis, `${path}.basis`)
}

function validateItem(value: unknown, path: string): void {
  const item = record(value, path)
  string(item.id, `${path}.id`)
  string(item.createdAt, `${path}.createdAt`)
  string(item.updatedAt, `${path}.updatedAt`)
  array(item.targets, `${path}.targets`).forEach((target, index) => {
    validateElementRef(target, `${path}.targets[${index}]`)
  })
  string(item.title, `${path}.title`)
  string(item.body, `${path}.body`)
  const status = oneOf(item.status, HUMAN_STATUSES, `${path}.status`)
  if (status === '\u4FDD\u7559') nonEmptyString(item.holdReason, `${path}.holdReason`)
  else optionalString(item.holdReason, `${path}.holdReason`)
  array(item.confirmations, `${path}.confirmations`).forEach((confirmation, index) => {
    validateConfirmation(confirmation, `${path}.confirmations[${index}]`)
  })
  validateSnapshot(item.snapshot, `${path}.snapshot`)
  if (item.finding !== undefined) validateFinding(item.finding, `${path}.finding`)
}

function validateClearance(value: unknown, path: string): void {
  const clearance = record(value, path)
  const valueMm = finite(clearance.valueMm, `${path}.valueMm`)
  if (valueMm <= 0) invalid(`${path}.valueMm`)
  if (clearance.source !== '\u5229\u7528\u8005\u5165\u529B') invalid(`${path}.source`)
  string(clearance.scope, `${path}.scope`)
  string(clearance.enteredAt, `${path}.enteredAt`)
  string(clearance.note, `${path}.note`)
}

function validateExclusion(value: unknown, path: string): void {
  const exclusion = record(value, path)
  string(exclusion.id, `${path}.id`)
  const scope = record(exclusion.scope, `${path}.scope`)
  boolean(scope.sameMemberOnly, `${path}.scope.sameMemberOnly`)
  const roles = array(scope.roles, `${path}.scope.roles`)
  if (roles.length !== 2) invalid(`${path}.scope.roles`)
  string(roles[0], `${path}.scope.roles[0]`)
  string(roles[1], `${path}.scope.roles[1]`)
  const kinds = array(scope.kinds, `${path}.scope.kinds`)
  if (kinds.length === 0) invalid(`${path}.scope.kinds`)
  kinds.forEach((kind, index) => oneOf(kind, FINDING_KINDS, `${path}.scope.kinds[${index}]`))
  if (scope.memberIds !== undefined) stringArray(scope.memberIds, `${path}.scope.memberIds`)
  nonEmptyString(exclusion.reason, `${path}.reason`)
  string(exclusion.createdAt, `${path}.createdAt`)
}

function validateChecklistConfirmation(value: unknown, path: string): void {
  validateConfirmation(value, path)
  validateFingerprints(record(value, path).fingerprints, `${path}.fingerprints`)
}

function validateChecklist(value: unknown, path: string): void {
  const entry = record(value, path)
  string(entry.id, `${path}.id`)
  string(entry.label, `${path}.label`)
  boolean(entry.required, `${path}.required`)
  stringArray(entry.reviewItemIds, `${path}.reviewItemIds`)
  const status = oneOf(entry.status, CHECKLIST_STATUSES, `${path}.status`)
  if (status === '\u4FDD\u7559' || status === '\u9664\u5916') {
    nonEmptyString(entry.reason, `${path}.reason`)
  } else {
    optionalString(entry.reason, `${path}.reason`)
  }
  if (entry.confirmation !== undefined) {
    validateChecklistConfirmation(entry.confirmation, `${path}.confirmation`)
  }
  if (status === '\u78BA\u8A8D\u6E08' && stringArray(entry.reviewItemIds, `${path}.reviewItemIds`).length === 0 && entry.confirmation === undefined) {
    invalid(`${path}.confirmation`)
  }
}

function validatePackage(value: unknown, path: string): void {
  const workPackage = record(value, path)
  string(workPackage.id, `${path}.id`)
  string(workPackage.name, `${path}.name`)
  array(workPackage.targets, `${path}.targets`).forEach((target, index) => {
    validateElementRef(target, `${path}.targets[${index}]`)
  })
  string(workPackage.assignee, `${path}.assignee`)
  nullableString(workPackage.dueDate, `${path}.dueDate`)
  const checklist = array(workPackage.checklist, `${path}.checklist`)
  uniqueIds(checklist, `${path}.checklist`)
  checklist.forEach((entry, index) => validateChecklist(entry, `${path}.checklist[${index}]`))
  string(workPackage.createdAt, `${path}.createdAt`)
  string(workPackage.updatedAt, `${path}.updatedAt`)
}

function validateBaseline(value: unknown, path: string): void {
  const baseline = record(value, path)
  string(baseline.label, `${path}.label`)
  string(baseline.capturedAt, `${path}.capturedAt`)
  parseProject(baseline.project)
  validateFingerprints(baseline.fingerprints, `${path}.fingerprints`)
}

function validateReviewState(value: Record<string, unknown>): void {
  if (value.reviewSchemaVersion !== REVIEW_SCHEMA_VERSION) {
    throw new Error(`Unsupported ReviewState reviewSchemaVersion; expected ${REVIEW_SCHEMA_VERSION}`)
  }
  if (value.baseline !== null) validateBaseline(value.baseline, 'baseline')

  const settings = record(value.settings, 'settings')
  if (settings.clearance !== null) validateClearance(settings.clearance, 'settings.clearance')

  const exclusions = array(value.exclusions, 'exclusions')
  uniqueIds(exclusions, 'exclusions')
  exclusions.forEach((exclusion, index) => validateExclusion(exclusion, `exclusions[${index}]`))

  const items = array(value.items, 'items')
  uniqueIds(items, 'items')
  items.forEach((item, index) => validateItem(item, `items[${index}]`))

  const packages = array(value.packages, 'packages')
  uniqueIds(packages, 'packages')
  packages.forEach((workPackage, index) => validatePackage(workPackage, `packages[${index}]`))
}

export function emptyReviewState(): ReviewState {
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    baseline: null,
    settings: { clearance: null },
    exclusions: [],
    items: [],
    packages: [],
  }
}

export function parseReviewState(value: unknown): ReviewState {
  if (value === undefined || value === null) return emptyReviewState()
  const state = record(value, '')
  validateReviewState(state)
  return state as unknown as ReviewState
}

function validated(state: ReviewState): ReviewState {
  return parseReviewState(state)
}

function itemIndex(state: ReviewState, id: string): number {
  const index = state.items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error(`ReviewState.items id not found: ${id}`)
  return index
}

function packageIndex(state: ReviewState, id: string): number {
  const index = state.packages.findIndex((workPackage) => workPackage.id === id)
  if (index < 0) throw new Error(`ReviewState.packages id not found: ${id}`)
  return index
}

export function addItem(state: ReviewState, item: ReviewItem): ReviewState {
  const current = validated(state)
  if (current.items.some((entry) => entry.id === item.id)) {
    throw new Error(`ReviewState.items duplicate id: ${item.id}`)
  }
  return validated({ ...current, items: [...current.items, item] })
}

export function updateItem(
  state: ReviewState,
  id: string,
  patch: Partial<Omit<ReviewItem, 'id'>>,
): ReviewState {
  const current = validated(state)
  const index = itemIndex(current, id)
  const items = current.items.slice()
  items[index] = { ...items[index], ...patch, id }
  return validated({ ...current, items })
}

export function confirmItem(
  state: ReviewState,
  id: string,
  confirmation: Confirmation,
): ReviewState {
  const current = validated(state)
  const index = itemIndex(current, id)
  const item = current.items[index]
  const items = current.items.slice()
  items[index] = {
    ...item,
    status: '\u78BA\u8A8D\u6E08',
    updatedAt: confirmation.at,
    confirmations: [...item.confirmations, confirmation],
  }
  return validated({ ...current, items })
}

export function holdItem(state: ReviewState, id: string, reason: string): ReviewState {
  const current = validated(state)
  const index = itemIndex(current, id)
  const items = current.items.slice()
  items[index] = { ...items[index], status: '\u4FDD\u7559', holdReason: reason }
  return validated({ ...current, items })
}

export function setClearance(state: ReviewState, basis: ClearanceBasis | null): ReviewState {
  const current = validated(state)
  return validated({ ...current, settings: { clearance: basis } })
}

export function addExclusion(state: ReviewState, exclusion: CheckExclusion): ReviewState {
  const current = validated(state)
  if (current.exclusions.some((entry) => entry.id === exclusion.id)) {
    throw new Error(`ReviewState.exclusions duplicate id: ${exclusion.id}`)
  }
  return validated({ ...current, exclusions: [...current.exclusions, exclusion] })
}

export function removeExclusion(state: ReviewState, id: string): ReviewState {
  const current = validated(state)
  if (!current.exclusions.some((entry) => entry.id === id)) {
    throw new Error(`ReviewState.exclusions id not found: ${id}`)
  }
  return validated({
    ...current,
    exclusions: current.exclusions.filter((entry) => entry.id !== id),
  })
}

export function addPackage(state: ReviewState, workPackage: WorkPackage): ReviewState {
  const current = validated(state)
  if (current.packages.some((entry) => entry.id === workPackage.id)) {
    throw new Error(`ReviewState.packages duplicate id: ${workPackage.id}`)
  }
  return validated({ ...current, packages: [...current.packages, workPackage] })
}

export function updatePackage(
  state: ReviewState,
  id: string,
  patch: Partial<Omit<WorkPackage, 'id'>>,
): ReviewState {
  const current = validated(state)
  const index = packageIndex(current, id)
  const packages = current.packages.slice()
  packages[index] = { ...packages[index], ...patch, id }
  return validated({ ...current, packages })
}

export function setChecklistStatus(
  state: ReviewState,
  packageId: string,
  entryId: string,
  status: ChecklistStatus,
  extra: { reason?: string; confirmation?: ChecklistConfirmation } = {},
): ReviewState {
  const current = validated(state)
  const packagePosition = packageIndex(current, packageId)
  const workPackage = current.packages[packagePosition]
  const entryPosition = workPackage.checklist.findIndex((entry) => entry.id === entryId)
  if (entryPosition < 0) {
    throw new Error(`ReviewState.checklist id not found: ${entryId}`)
  }

  const checklist = workPackage.checklist.slice()
  const entry: ChecklistEntry = { ...checklist[entryPosition], status }
  if (status !== '\u4FDD\u7559' && status !== '\u9664\u5916') delete entry.reason
  if (status !== '\u78BA\u8A8D\u6E08') delete entry.confirmation
  if (extra.reason !== undefined) entry.reason = extra.reason
  if (extra.confirmation !== undefined) entry.confirmation = extra.confirmation
  checklist[entryPosition] = entry

  const packages = current.packages.slice()
  packages[packagePosition] = { ...workPackage, checklist }
  return validated({ ...current, packages })
}

export function setBaseline(state: ReviewState, baseline: Baseline | null): ReviewState {
  const current = validated(state)
  return validated({ ...current, baseline })
}

export function newReviewId(prefix: string, existingIds: Iterable<string>): string {
  const used = new Set(existingIds)
  let counter = 1
  let id = `${prefix}-${counter}`
  while (used.has(id)) {
    counter += 1
    id = `${prefix}-${counter}`
  }
  return id
}
