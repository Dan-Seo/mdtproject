import { describe, expect, it } from 'vitest'

import type { ReviewItem, WorkPackage } from './types'
import { assessImpact } from './impact'
import { packageReadiness } from './readiness'
import { cloneProject, reviewSnapshot, reviewViewerSnapshot, sampleProject } from '../../../tests/fixtures/review/snapshot'

function item(project = sampleProject(), status: ReviewItem['status'] = '確認済'): ReviewItem {
  const snapshot = reviewSnapshot(project)
  return {
    id: 'item-1',
    createdAt: '2026-09-17T10:00:00+09:00',
    updatedAt: '2026-09-17T10:00:00+09:00',
    targets: [{ kind: 'member', memberId: '1F-X1Y1' }],
    title: 'review',
    body: 'body',
    status,
    confirmations: [],
    snapshot: reviewViewerSnapshot(snapshot.fingerprints),
  }
}

function pkg(entry: WorkPackage['checklist'][number], assignee = 'reviewer'): WorkPackage {
  return {
    id: 'package-1',
    name: 'package',
    targets: [{ kind: 'member', memberId: '1F-X1Y1' }],
    assignee,
    dueDate: null,
    checklist: [entry],
    createdAt: '2026-09-17T10:00:00+09:00',
    updatedAt: '2026-09-17T10:00:00+09:00',
  }
}

function currentModel(project = sampleProject()) {
  const snapshot = reviewSnapshot(project)
  return { project, fingerprints: snapshot.fingerprints, impact: null }
}

describe('review package readiness', () => {
  it('is ready when required linked items are confirmed and valid', () => {
    const project = sampleProject()
    const entry = {
      id: 'check-1', label: 'joint', required: true, reviewItemIds: ['item-1'], status: '確認済' as const,
    }
    const result = packageReadiness(pkg(entry), [item(project)], currentModel(project))
    expect(result).toEqual(expect.objectContaining({ state: '準備完了', blockers: [], exceptions: [] }))
    expect(result.memberIds).toContain('1F-X1Y1')
  })

  it('reports missing item, unconfirmed item, stale model, and missing detail distinctly', () => {
    const project = sampleProject()
    const entry = {
      id: 'check-1', label: 'joint', required: true,
      reviewItemIds: ['deleted-item', 'item-1', 'item-2', 'item-3'], status: '確認済' as const,
    }
    const changed = cloneProject(project)
    changed.sections = changed.sections.map((section) =>
      section.id === 'section-C1' && section.kind === '柱' ? { ...section, b: 900 } : section,
    )
    const items = [item(project, '未確認'), item(project, '確認済'), item(project, '判断不可')]
      .map((reviewItem, index) => ({ ...reviewItem, id: `item-${index + 1}` }))
    const result = packageReadiness(pkg(entry), items, {
      ...currentModel(changed),
      impact: assessImpact(reviewSnapshot(project), reviewSnapshot(changed)),
    })
    expect(result.blockers.map(({ kind }) => kind)).toEqual(expect.arrayContaining([
      '関連する検討項目がない', '関連項目が未確認', '前モデルの検討が残っている', '必須の詳細情報が未入力',
    ]))
    expect(result.state).toBe('準備未完')
  })

  it('compares a confirmation fingerprint when no review item is linked', () => {
    const project = sampleProject()
    const entry = {
      id: 'check-1', label: 'joint', required: true, reviewItemIds: [], status: '確認済' as const,
      confirmation: { by: 'reviewer', at: '2026-09-17', note: '', fingerprints: reviewSnapshot(project).fingerprints },
    }
    const changed = cloneProject(project)
    changed.sections = changed.sections.map((section) =>
      section.id === 'section-C1' && section.kind === '柱' ? { ...section, b: 900 } : section,
    )
    const result = packageReadiness(pkg(entry), [], currentModel(changed))
    expect(result.state).toBe('準備未完')
    expect(result.blockers).toContainEqual(expect.objectContaining({ kind: '前モデルの検討が残っている' }))
  })

  it('keeps a held or excluded entry as an exception only with a reason', () => {
    const held = { id: 'check-1', label: 'held', required: true, reviewItemIds: [], status: '保留' as const, reason: '설계자 확인 대기' }
    const excluded = { id: 'check-1', label: 'excluded', required: true, reviewItemIds: [], status: '除外' as const, reason: '범위 밖' }
    expect(packageReadiness(pkg(held), [], currentModel()).state).toBe('準備完了（例外あり）')
    expect(packageReadiness(pkg(excluded), [], currentModel()).exceptions).toEqual([
      expect.objectContaining({ kind: '除外', reason: '범위 밖' }),
    ])
    expect(packageReadiness(pkg({ ...held, reason: undefined }), [], currentModel()).blockers).toContainEqual(
      expect.objectContaining({ kind: '理由のない保留' }),
    )
  })

  it('checks assignee and package targets, while ignoring optional entries', () => {
    const optional = { id: 'optional', label: 'optional', required: false, reviewItemIds: [], status: '未入力' as const }
    const missingTarget = pkg(optional, '')
    missingTarget.targets = [{ kind: 'member', memberId: 'missing-member' }]
    const result = packageReadiness(missingTarget, [], currentModel())
    expect(result.blockers.map(({ kind }) => kind)).toEqual(expect.arrayContaining(['担当者未入力', '対象部材なし']))
    expect(result.blockers).not.toContainEqual(expect.objectContaining({ entryId: 'optional', kind: '未入力' }))
  })
})
