import type { Member } from '../model/member'
import { memberGroupKey, type Project } from '../model/project'
import type { Rebar } from '../model/rebar'
import {
  isMassLine,
  type QuantityLine,
} from '../quantity'
import { memberDependencies, type Dependency } from './dependency'
import { canonicalJson } from './fingerprint'
import type { ReviewFingerprints } from './types'

export interface TakeoffSnapshot {
  project: Project
  rebars: Rebar[]
  lines: QuantityLine[]
  unsupportedMemberIds: ReadonlySet<string>
  fingerprints: ReviewFingerprints
}

export type EntityChange =
  | { kind: 'member'; change: '追加' | '削除' | '変更' | '対応要確認'; memberId: string; fields?: string[]; detail: string }
  | { kind: 'section'; change: '追加' | '削除' | '変更'; sectionId: string; fields: string[]; detail: string }
  | { kind: 'story'; change: '追加' | '削除' | '変更'; storyId: string; fields: string[]; detail: string }
  | { kind: 'grid'; change: '変更'; detail: string }
  | { kind: 'unitMass'; change: '変更'; sizes: string[]; detail: string }
  | { kind: 'rulepack'; change: '変更'; detail: string }
  | { kind: 'displayOnly'; what: '案件名' | '備考' | '通り芯名'; detail: string }

export type ImpactCategory = '入力' | '形状' | '数量' | '対応状態' | '根拠'

export interface MemberImpact {
  memberId: string
  categories: ImpactCategory[]
  path: string[]
  support: { before: '対応' | '未対応'; after: '対応' | '未対応' }
}

export type MassState = '算出' | '単位質量未入力'

export interface LineChange {
  lineId: string
  change: '追加' | '削除' | '変更'
  fields: string[]
  mass?: {
    before: MassState | null
    after: MassState | null
    beforeKg: number | null
    afterKg: number | null
  }
}

export interface ImpactReport {
  entities: EntityChange[]
  members: MemberImpact[]
  lines: LineChange[]
  rulepackChanged: boolean
  checkVersionChanged: boolean
  displayOnly: EntityChange[]
}

const MEMBER_FIELDS = [
  'kind',
  'memberClass',
  'sectionId',
  'storyId',
  'position',
  'cantilever',
  'openings',
  'wallExtent',
] as const

const LINE_FIELDS = [
  'groupId',
  'storyName',
  'memberKind',
  'mark',
  'sectionLabel',
  'role',
  'size',
  'places',
  'confidence',
  'formula',
  'unit',
  'shape',
  'lengthMm',
  'countPerMember',
  'totalLengthMm',
  'unitMassKgPerM',
  'designKg',
  'requiredKg',
  'method',
  'totalCount',
] as const

function valueOf(record: unknown, field: string): unknown {
  return (record as Record<string, unknown>)[field]
}

function sameValue(before: unknown, after: unknown): boolean {
  return Object.is(before, after) || (
    before !== null && after !== null &&
    typeof before === 'object' && typeof after === 'object' &&
    canonicalJson(before) === canonicalJson(after)
  )
}

function changedFields(before: unknown, after: unknown, fields: readonly string[]): string[] {
  return fields.filter((field) => !sameValue(valueOf(before, field), valueOf(after, field)))
}

function displayValue(value: unknown): string {
  if (value === undefined) return 'なし'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return canonicalJson(value)
}

function detailForFields(label: string, before: unknown, after: unknown, fields: readonly string[]): string {
  const field = fields[0] ?? '変更'
  return `${label} ${field} ${displayValue(valueOf(before, field))}→${displayValue(valueOf(after, field))}`
}

function samePosition(before: Member, after: Member): boolean {
  return before.kind === after.kind &&
    before.storyId === after.storyId &&
    canonicalJson(before.position) === canonicalJson(after.position)
}

function memberGridSpans(project: Project, member: Member): unknown {
  if ('axis' in member.position) {
    return member.position.axis === 'X'
      ? { axis: 'X', span: project.grid.xSpans[member.position.ix] }
      : { axis: 'Y', span: project.grid.ySpans[member.position.iy] }
  }
  return {
    x: [project.grid.xSpans[member.position.ix - 1], project.grid.xSpans[member.position.ix]]
      .filter((value): value is number => value !== undefined),
    y: [project.grid.ySpans[member.position.iy - 1], project.grid.ySpans[member.position.iy]]
      .filter((value): value is number => value !== undefined),
  }
}

function mapById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]))
}

function supports(snapshot: TakeoffSnapshot, memberId: string, present: boolean): '対応' | '未対応' {
  return present && !snapshot.unsupportedMemberIds.has(memberId) ? '対応' : '未対応'
}

function dependencyFor(
  project: Project,
  memberId: string,
  dependency: Dependency,
): Dependency | undefined {
  const resolution = memberDependencies(project, memberId)
  if (resolution.status === 'untracked') return undefined
  return resolution.dependencies.find(
    ({ memberId: candidateId, via }) => candidateId === dependency.memberId && via === dependency.via,
  )
}

function dependencyReadsChanged(
  baseline: Project,
  current: Project,
  dependentMemberId: string,
  dependency: Dependency,
): boolean {
  const before = dependencyFor(baseline, dependentMemberId, dependency)
  return before === undefined || canonicalJson(before.reads) !== canonicalJson(dependency.reads)
}

function memberGroupId(project: Project, member: Member): string | null {
  try {
    return memberGroupKey(project, member)
  } catch {
    return null
  }
}

function lineTouchesMember(line: QuantityLine, project: Project, member: Member): boolean {
  const groupId = memberGroupId(project, member)
  return groupId !== null && line.groupId === groupId
}

function lineMassState(line: QuantityLine | undefined): MassState | null {
  if (!line || !isMassLine(line)) return null
  return line.designKg === null || line.unitMassKgPerM === null
    ? '単位質量未入力'
    : '算出'
}

function lineChange(
  before: QuantityLine | undefined,
  after: QuantityLine | undefined,
): LineChange | null {
  if (!before && !after) return null
  if (!before || !after) {
    const line = after ?? before!
    return {
      lineId: line.id,
      change: before ? '削除' : '追加',
      fields: [...LINE_FIELDS],
      ...(isMassLine(line) || (before && isMassLine(before))
        ? {
            mass: {
              before: lineMassState(before),
              after: lineMassState(after),
              beforeKg: before && isMassLine(before) ? before.designKg : null,
              afterKg: after && isMassLine(after) ? after.designKg : null,
            },
          }
        : {}),
    }
  }

  const fields = changedFields(before, after, LINE_FIELDS)
  if (fields.length === 0) return null
  const result: LineChange = { lineId: after.id, change: '変更', fields }
  if (isMassLine(before) || isMassLine(after)) {
    const beforeMass = isMassLine(before) ? before.designKg : null
    const afterMass = isMassLine(after) ? after.designKg : null
    if (beforeMass !== afterMass || lineMassState(before) !== lineMassState(after)) {
      result.mass = {
        before: lineMassState(before),
        after: lineMassState(after),
        beforeKg: beforeMass,
        afterKg: afterMass,
      }
    }
  }
  return result
}

function addCategory(categories: ImpactCategory[], category: ImpactCategory): void {
  if (!categories.includes(category)) categories.push(category)
}

function changedRecordEntities<T extends { id: string }>(
  kind: 'section' | 'story',
  beforeValues: T[],
  afterValues: T[],
  fields: readonly string[],
): EntityChange[] {
  const before = mapById(beforeValues)
  const after = mapById(afterValues)
  const entities: EntityChange[] = []
  for (const [id, value] of after) {
    const old = before.get(id)
    if (!old) {
      entities.push({ kind, change: '追加', [`${kind}Id`]: id, fields: [...fields], detail: `${id} 追加` } as EntityChange)
      continue
    }
    const changed = changedFields(old, value, fields)
    if (changed.length > 0) {
      entities.push({
        kind,
        change: '変更',
        [`${kind}Id`]: id,
        fields: changed,
        detail: detailForFields(kind === 'section' ? (value as { mark?: string }).mark ?? id : id, old, value, changed),
      } as EntityChange)
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) {
      entities.push({ kind, change: '削除', [`${kind}Id`]: id, fields: [...fields], detail: `${id} 削除` } as EntityChange)
    }
  }
  return entities
}

function displayChanges(baseline: Project, current: Project): EntityChange[] {
  const changes: EntityChange[] = []
  if (baseline.name !== current.name) {
    changes.push({ kind: 'displayOnly', what: '案件名', detail: `案件名 ${baseline.name}→${current.name}` })
  }
  if (canonicalJson(baseline.notes ?? {}) !== canonicalJson(current.notes ?? {})) {
    changes.push({ kind: 'displayOnly', what: '備考', detail: '備考 변경' })
  }
  if (canonicalJson({ x: baseline.grid.xLabels ?? null, y: baseline.grid.yLabels ?? null }) !== canonicalJson({ x: current.grid.xLabels ?? null, y: current.grid.yLabels ?? null })) {
    changes.push({ kind: 'displayOnly', what: '通り芯名', detail: '通り芯名 변경' })
  }
  return changes
}

function directGridMembers(baseline: Project, current: Project): Set<string> {
  const ids = new Set<string>()
  const before = mapById(baseline.members)
  for (const member of current.members) {
    const old = before.get(member.id)
    if (old && canonicalJson(memberGridSpans(baseline, old)) !== canonicalJson(memberGridSpans(current, member))) {
      ids.add(member.id)
    }
  }
  return ids
}

export function assessImpact(baseline: TakeoffSnapshot, current: TakeoffSnapshot): ImpactReport {
  const entities: EntityChange[] = []
  const baselineMembers = mapById(baseline.project.members)
  const currentMembers = mapById(current.project.members)
  const replacementPairs = new Map<string, string>()
  const usedCurrentIds = new Set<string>()
  const addedIds = [...currentMembers.keys()].filter((id) => !baselineMembers.has(id))
  const removedIds = [...baselineMembers.keys()].filter((id) => !currentMembers.has(id))

  for (const removedId of removedIds) {
    const oldMember = baselineMembers.get(removedId)!
    const candidates = addedIds.filter((addedId) => {
      if (usedCurrentIds.has(addedId)) return false
      return samePosition(oldMember, currentMembers.get(addedId)!)
    })
    if (candidates.length === 1) {
      replacementPairs.set(removedId, candidates[0])
      usedCurrentIds.add(candidates[0])
    }
  }

  for (const [id, member] of currentMembers) {
    const old = baselineMembers.get(id)
    if (!old) {
      if ([...replacementPairs.values()].includes(id)) {
        entities.push({ kind: 'member', change: '対応要確認', memberId: id, detail: `${id} id 変更の可能性` })
      } else {
        entities.push({ kind: 'member', change: '追加', memberId: id, detail: `${id} 追加` })
      }
      continue
    }
    const changed = changedFields(old, member, MEMBER_FIELDS)
    if (changed.length > 0) {
      entities.push({ kind: 'member', change: '変更', memberId: id, fields: changed, detail: `${id} ${changed.join('・')} 변경` })
    }
  }
  for (const id of baselineMembers.keys()) {
    if (currentMembers.has(id)) continue
    if (replacementPairs.has(id)) {
      entities.push({ kind: 'member', change: '対応要確認', memberId: id, detail: `${id} id 変更の可能性` })
    } else {
      entities.push({ kind: 'member', change: '削除', memberId: id, detail: `${id} 削除` })
    }
  }

  const sectionFields = ['kind', 'mark', 'storyLabel', 'shape', 'b', 'd', 'depth', 'thickness', 'fc', 'grade', 'exposure', 'finish', 'spliceMethod', 'main', 'hoop', 'stirrup', 'widthTie', 'sideBar', 'layers', 'vertical', 'horizontal', 'x', 'y']
  const storyFields = ['name', 'height']
  entities.push(...changedRecordEntities('section', baseline.project.sections, current.project.sections, sectionFields))
  entities.push(...changedRecordEntities('story', baseline.project.stories, current.project.stories, storyFields))

  const spansChanged = canonicalJson(baseline.project.grid.xSpans) !== canonicalJson(current.project.grid.xSpans) ||
    canonicalJson(baseline.project.grid.ySpans) !== canonicalJson(current.project.grid.ySpans)
  if (spansChanged) entities.push({ kind: 'grid', change: '変更', detail: '通り芯スパン変更' })

  const beforeMass = baseline.project.unitMass ?? {}
  const afterMass = current.project.unitMass ?? {}
  const massSizes = [...new Set([...Object.keys(beforeMass), ...Object.keys(afterMass)])]
    .filter((size) => !Object.is(valueOf(beforeMass, size), valueOf(afterMass, size)))
    .sort()
  if (massSizes.length > 0) entities.push({ kind: 'unitMass', change: '変更', sizes: massSizes, detail: `単位質量 ${massSizes.join('・')} 変更` })

  const rulepackChanged = baseline.fingerprints.rulepack !== current.fingerprints.rulepack
  if (rulepackChanged) entities.push({ kind: 'rulepack', change: '変更', detail: 'ルールパック変更' })
  const displayOnly = displayChanges(baseline.project, current.project)
  entities.push(...displayOnly)

  const direct = new Map<string, string[]>()
  const addDirect = (memberId: string, path: string): void => {
    const existing = direct.get(memberId) ?? []
    if (!existing.includes(path)) existing.push(path)
    direct.set(memberId, existing)
  }
  for (const [id, member] of currentMembers) {
    const before = baselineMembers.get(id)
    if (before && changedFields(before, member, MEMBER_FIELDS).length > 0) addDirect(id, `${id} 部材入力変更`)
  }
  for (const entity of entities) {
    if (entity.kind === 'section' && entity.change !== '削除') {
      for (const member of currentMembers.values()) {
        if (member.sectionId === entity.sectionId) addDirect(member.id, entity.detail)
      }
    }
    if (entity.kind === 'story' && entity.change !== '削除') {
      for (const member of currentMembers.values()) {
        if (member.storyId === entity.storyId) addDirect(member.id, entity.detail)
      }
    }
    if (entity.kind === 'member' && entity.change === '変更') addDirect(entity.memberId, entity.detail)
  }
  if (spansChanged) {
    for (const id of directGridMembers(baseline.project, current.project)) addDirect(id, '通り芯スパン変更')
  }
  for (const id of addedIds) addDirect(id, `${id} 追加`)
  for (const id of removedIds) addDirect(id, `${id} 削除`)

  const paths = new Map<string, string[]>(direct)
  const depth = new Map<string, number>([...direct.keys()].map((id) => [id, 0]))
  const queue = [...direct.keys()]
  const currentResolutions = new Map<string, ReturnType<typeof memberDependencies>>()
  while (queue.length > 0) {
    const changedMemberId = queue.shift()!
    const changedDepth = depth.get(changedMemberId) ?? 0
    for (const member of currentMembers.values()) {
      if (member.id === changedMemberId) continue
      let resolution = currentResolutions.get(member.id)
      if (!resolution) {
        resolution = memberDependencies(current.project, member.id)
        currentResolutions.set(member.id, resolution)
      }
      if (resolution.status === 'untracked') continue
      const dependencies = resolution.dependencies.filter(({ memberId }) => memberId === changedMemberId)
      for (const dependency of dependencies) {
        const allowed = changedDepth === 0 || (dependency.via === '連続スパン' && changedDepth < 2)
        if (!allowed || !dependencyReadsChanged(baseline.project, current.project, member.id, dependency)) continue
        if (paths.has(member.id)) continue
        paths.set(member.id, [
          ...(paths.get(changedMemberId) ?? [`${changedMemberId} 変更`]),
          `${dependency.via} ${dependency.detail}`,
        ])
        depth.set(member.id, changedDepth + 1)
        queue.push(member.id)
      }
    }
  }

  const baselineLines = mapById(baseline.lines)
  const currentLines = mapById(current.lines)
  const lineChanges = [...new Set([...baselineLines.keys(), ...currentLines.keys()])]
    .map((id) => lineChange(baselineLines.get(id), currentLines.get(id)))
    .filter((change): change is LineChange => change !== null)
  const unitMassOnlyLineChanges = massSizes.length > 0 && lineChanges.length > 0 && lineChanges.every(({ fields }) =>
    fields.every((field) => field === 'unitMassKgPerM' || field === 'designKg' || field === 'requiredKg'),
  )

  const memberIds = [...new Set([...baselineMembers.keys(), ...currentMembers.keys()])]
  const members: MemberImpact[] = []
  const baselineFingerprints = baseline.fingerprints.members
  const currentFingerprints = current.fingerprints.members
  for (const memberId of memberIds) {
    const beforeFingerprint = baselineFingerprints[memberId]
    const afterFingerprint = currentFingerprints[memberId]
    const inputChanged = beforeFingerprint !== undefined && afterFingerprint !== undefined && beforeFingerprint.input !== afterFingerprint.input
    const resultChanged = beforeFingerprint !== undefined && afterFingerprint !== undefined && beforeFingerprint.result !== afterFingerprint.result
    const responseChanged = (beforeFingerprint?.result === null) !== (afterFingerprint?.result === null)
    const touchedByLine = !unitMassOnlyLineChanges && lineChanges.some((change) => {
      const beforeMember = baselineMembers.get(memberId)
      const afterMember = currentMembers.get(memberId)
      return (beforeMember && lineTouchesMember(baselineLines.get(change.lineId) ?? ({ groupId: '' } as QuantityLine), baseline.project, beforeMember)) ||
        (afterMember && lineTouchesMember(currentLines.get(change.lineId) ?? ({ groupId: '' } as QuantityLine), current.project, afterMember))
    })
    const currentMember = currentMembers.get(memberId)
    const resolution = currentMember ? memberDependencies(current.project, memberId) : null
    const untrackedResult = resultChanged && resolution?.status === 'untracked'
    const categories: ImpactCategory[] = []
    if (inputChanged || paths.has(memberId)) addCategory(categories, '入力')
    if (resultChanged) addCategory(categories, '形状')
    if (touchedByLine) addCategory(categories, '数量')
    const beforeSupport = supports(baseline, memberId, baselineMembers.has(memberId))
    const afterSupport = supports(current, memberId, currentMembers.has(memberId))
    if (responseChanged || beforeSupport !== afterSupport) addCategory(categories, '対応状態')
    if (rulepackChanged) addCategory(categories, '根拠')
    const path = [...(paths.get(memberId) ?? [])]
    if (untrackedResult && !path.includes('依存経路未追跡 — 結果差分で検出')) path.push('依存経路未追跡 — 結果差分で検出')
    if (paths.has(memberId) && !resultChanged && !rulepackChanged && beforeSupport === afterSupport) {
      categories.splice(0, categories.length, '入力')
      if (!path.includes('結果は不変')) path.push('結果は不変')
    }
    if (replacementPairs.has(memberId) || [...replacementPairs.values()].includes(memberId)) {
      if (!path.includes('id 変更の可能性 — 対応要確認')) path.push('id 変更の可能性 — 対応要確認')
      addCategory(categories, '対応状態')
    }
    if (categories.length > 0 || path.length > 0) {
      members.push({ memberId, categories, path, support: { before: beforeSupport, after: afterSupport } })
    }
  }

  return {
    entities,
    members,
    lines: lineChanges,
    rulepackChanged,
    checkVersionChanged: baseline.fingerprints.checkVersion !== current.fingerprints.checkVersion,
    displayOnly,
  }
}
