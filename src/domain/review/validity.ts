import { resolveJoint, jointRebarMemberIds } from './joint'
import type { ImpactReport } from './impact'
import type { Project } from '../model/project'
import type {
  ElementRef,
  ReviewFingerprints,
  ReviewHumanStatus,
  ReviewItem,
} from './types'

export type StaleReasonKind = '入力変更' | '結果変更' | '対応状態変更' | '根拠変更' | '検査版変更' | '検査条件変更' | '対象変更' | '対象なし' | '対応要確認'

export interface StaleReason {
  kind: StaleReasonKind
  memberId?: string
  detail: string
}

export type ReviewValidity =
  | { state: '有効' }
  | { state: '再検討必要'; reasons: StaleReason[] }

export interface CurrentModel {
  project: Project
  fingerprints: ReviewFingerprints
  impact: ImpactReport | null
}

interface RefTargets {
  memberIds: string[]
  missing: ElementRef[]
  unresolved: ElementRef[]
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function elementRefTargets(refs: ElementRef[], project: Project): RefTargets {
  const memberIds: string[] = []
  const missing: ElementRef[] = []
  const unresolved: ElementRef[] = []
  const knownMembers = new Set(project.members.map(({ id }) => id))

  for (const ref of refs) {
    if (ref.kind === 'member') {
      if (knownMembers.has(ref.memberId)) memberIds.push(ref.memberId)
      else missing.push(ref)
      continue
    }
    if (ref.kind === 'joint') {
      const resolution = resolveJoint(project, ref.columnMemberId)
      if (resolution.status === 'unsupported') {
        missing.push(ref)
      } else {
        memberIds.push(...jointRebarMemberIds(project, resolution.joint))
      }
      continue
    }
    if (ref.kind === 'rebar') {
      const memberId = ref.rebarId.split('|', 1)[0]
      if (knownMembers.has(memberId)) memberIds.push(memberId)
      else missing.push(ref)
      continue
    }
    unresolved.push(ref)
  }

  return { memberIds: unique(memberIds), missing, unresolved }
}

export function itemTargetMemberIds(item: ReviewItem, project: Project): RefTargets {
  return elementRefTargets(item.targets, project)
}

function addReason(reasons: StaleReason[], reason: StaleReason): void {
  if (reasons.some(({ kind, memberId }) => kind === reason.kind && memberId === reason.memberId)) return
  reasons.push(reason)
}

export function fingerprintReasons(
  before: ReviewFingerprints,
  after: ReviewFingerprints,
  memberIds: string[],
  finding: boolean,
): StaleReason[] {
  const reasons: StaleReason[] = []
  const targetIds = unique(memberIds)
  const comparedIds = new Set(targetIds)

  for (const memberId of comparedIds) {
    const oldMember = before.members[memberId]
    const newMember = after.members[memberId]
    if (!oldMember || !newMember) {
      addReason(reasons, { kind: '対象変更', memberId, detail: `対象部材 ${memberId} の対応が変更されています` })
      continue
    }
    if (oldMember.input !== newMember.input) {
      addReason(reasons, { kind: '入力変更', memberId, detail: `入力が変更されています: ${memberId}` })
    }
    if (oldMember.result !== newMember.result) {
      addReason(reasons, { kind: '結果変更', memberId, detail: `算出結果が変更されています: ${memberId}` })
    }
    if ((oldMember.result === null) !== (newMember.result === null)) {
      addReason(reasons, { kind: '対応状態変更', memberId, detail: `対応状態が変更されています: ${memberId}` })
    }
  }
  if (targetIds.length === 0) {
    addReason(reasons, { kind: '対象なし', detail: '検討対象の部材がありません' })
  }
  if (before.rulepack !== after.rulepack && targetIds.length > 0) {
    addReason(reasons, { kind: '根拠変更', detail: 'ルールパックが変更されています' })
  }
  if (finding && before.checkVersion !== after.checkVersion) {
    addReason(reasons, { kind: '検査版変更', detail: '検査版が変更されています' })
  }
  if (finding && before.checkConditions !== after.checkConditions) {
    addReason(reasons, { kind: '検査条件変更', detail: '検査条件が変更されています' })
  }
  return reasons
}

export function itemValidity(item: ReviewItem, current: CurrentModel): ReviewValidity {
  const targets = itemTargetMemberIds(item, current.project)
  const reasons: StaleReason[] = []
  const targetIds = [...Object.keys(item.snapshot.fingerprints.members), ...targets.memberIds]
  if (targets.missing.length > 0 || targets.unresolved.length > 0) {
    addReason(reasons, {
      kind: '対象なし',
      detail: `対象を解決できません: ${[...targets.missing, ...targets.unresolved].map((ref) => ref.kind).join('・')}`,
    })
  }
  for (const reason of fingerprintReasons(
    item.snapshot.fingerprints,
    current.fingerprints,
    targetIds,
    item.finding !== undefined,
  )) addReason(reasons, reason)

  if (current.impact !== null) {
    for (const memberId of targets.memberIds) {
      const impact = current.impact.members.find(({ memberId: id }) => id === memberId)
      if (impact?.path.includes('id 変更の可能性 — 対応要確認')) {
        addReason(reasons, {
          kind: '対応要確認',
          memberId,
          detail: `id 変更の可能性 — 対応要確認: ${memberId}`,
        })
      }
    }
  }
  if (targets.memberIds.length === 0) {
    addReason(reasons, { kind: '対象なし', detail: '検討対象の部材がありません' })
  }

  return reasons.length === 0 ? { state: '有効' } : { state: '再検討必要', reasons }
}

export type EffectiveItemStatus = ReviewHumanStatus | '再検討必要'

export function effectiveItemStatus(item: ReviewItem, validity: ReviewValidity): EffectiveItemStatus {
  return validity.state === '再検討必要' ? validity.state : item.status
}

export function itemsNeedingRecheck(items: ReviewItem[], current: CurrentModel): ReviewItem[] {
  return items.filter((item) => itemValidity(item, current).state === '再検討必要')
}
