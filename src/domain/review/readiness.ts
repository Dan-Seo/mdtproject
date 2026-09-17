import type { Project } from '../model/project'
import { canonicalJson } from './fingerprint'
import {
  elementRefTargets,
  fingerprintReasons,
  itemValidity,
  type CurrentModel,
} from './validity'
import type {
  ChecklistEntry,
  ElementRef,
  ReviewItem,
  WorkPackage,
} from './types'

export type ReadinessState = '準備未完' | '準備完了' | '準備完了（例外あり）'
export type BlockerKind = '前モデルの検討が残っている' | '必須の詳細情報が未入力' | '確認記録がない' | '関連項目が未確認' | '関連する検討項目がない' | '未入力' | '判断不可' | '理由のない保留' | '担当者未入力' | '対象部材なし'

export interface Blocker {
  entryId: string | null
  kind: BlockerKind
  detail: string
}

export interface Exception {
  entryId: string
  kind: '保留' | '除外'
  reason: string
}

export interface PackageReadiness {
  state: ReadinessState
  blockers: Blocker[]
  exceptions: Exception[]
  memberIds: string[]
  missingTargets: ElementRef[]
}

function addMissing(targets: ElementRef[], additions: ElementRef[]): void {
  for (const target of additions) {
    if (!targets.some((candidate) => canonicalJson(candidate) === canonicalJson(target))) targets.push(target)
  }
}

function addBlocker(blockers: Blocker[], blocker: Blocker): void {
  if (!blockers.some(({ entryId, kind, detail }) => entryId === blocker.entryId && kind === blocker.kind && detail === blocker.detail)) blockers.push(blocker)
}

function confirmationIsCurrent(
  entry: ChecklistEntry,
  pkg: WorkPackage,
  project: Project,
  current: CurrentModel,
): boolean {
  if (!entry.confirmation) return false
  const targets = elementRefTargets(pkg.targets, project)
  if (targets.memberIds.length === 0 || targets.missing.length > 0 || targets.unresolved.length > 0) return false
  return fingerprintReasons(
    entry.confirmation.fingerprints,
    current.fingerprints,
    targets.memberIds,
    false,
  ).length === 0 && targets.memberIds.every((memberId) => {
    const before = entry.confirmation!.fingerprints.members[memberId]
    const after = current.fingerprints.members[memberId]
    return before !== undefined && after !== undefined && canonicalJson(before) === canonicalJson(after)
  })
}

export function packageReadiness(
  pkg: WorkPackage,
  items: ReviewItem[],
  current: CurrentModel,
): PackageReadiness {
  const blockers: Blocker[] = []
  const exceptions: Exception[] = []
  const memberIds: string[] = []
  const missingTargets: ElementRef[] = []
  const itemById = new Map(items.map((item) => [item.id, item]))

  const packageTargets = elementRefTargets(pkg.targets, current.project)
  memberIds.push(...packageTargets.memberIds)
  addMissing(missingTargets, [...packageTargets.missing, ...packageTargets.unresolved])
  if (missingTargets.length > 0) {
    addBlocker(blockers, { entryId: null, kind: '対象部材なし', detail: 'パッケージの対象部材がありません' })
  }
  if (pkg.assignee.trim() === '') addBlocker(blockers, { entryId: null, kind: '担当者未入力', detail: '担当者を入力してください' })

  for (const entry of pkg.checklist) {
    if (!entry.required) continue
    if (entry.status === '未入力' || entry.status === '未確認') {
      addBlocker(blockers, { entryId: entry.id, kind: '未入力', detail: `${entry.label} が未入力です` })
      continue
    }
    if (entry.status === '保留' || entry.status === '除外') {
      if (entry.reason && entry.reason.trim() !== '') {
        exceptions.push({ entryId: entry.id, kind: entry.status, reason: entry.reason })
      } else {
        addBlocker(blockers, { entryId: entry.id, kind: '理由のない保留', detail: `${entry.label} の保留・除外理由がありません` })
      }
      continue
    }
    if (entry.status !== '確認済') continue

    if (entry.reviewItemIds.length > 0) {
      for (const reviewItemId of entry.reviewItemIds) {
        const item = itemById.get(reviewItemId)
        if (!item) {
          addBlocker(blockers, { entryId: entry.id, kind: '関連する検討項目がない', detail: `${entry.label}: ${reviewItemId} がありません` })
          continue
        }
        if (itemValidity(item, current).state === '再検討必要') {
          addBlocker(blockers, { entryId: entry.id, kind: '前モデルの検討が残っている', detail: `${entry.label}: ${reviewItemId} を再検討してください` })
        }
        if (item.status === '未確認' || item.status === '保留') {
          addBlocker(blockers, { entryId: entry.id, kind: '関連項目が未確認', detail: `${entry.label}: ${reviewItemId} が未確認です` })
        }
        if (item.status === '判断不可') {
          addBlocker(blockers, { entryId: entry.id, kind: '必須の詳細情報が未入力', detail: `${entry.label}: ${reviewItemId} の詳細情報が必要です` })
        }
      }
    } else if (!entry.confirmation) {
      addBlocker(blockers, { entryId: entry.id, kind: '確認記録がない', detail: `${entry.label} の確認記録がありません` })
    } else if (!confirmationIsCurrent(entry, pkg, current.project, current)) {
      addBlocker(blockers, { entryId: entry.id, kind: '前モデルの検討が残っている', detail: `${entry.label} の確認後にモデルが変更されています` })
    }
  }

  const state: ReadinessState = blockers.length > 0
    ? '準備未完'
    : exceptions.length > 0
      ? '準備完了（例外あり）'
      : '準備完了'
  return { state, blockers, exceptions, memberIds: [...new Set(memberIds)], missingTargets }
}
