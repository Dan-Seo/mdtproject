import { describe, expect, it } from 'vitest'

import type { ReviewItem } from './types'
import { assessImpact } from './impact'
import {
  cloneProject,
  reviewSnapshot,
  reviewViewerSnapshot,
  sampleProject,
} from '../../../tests/fixtures/review/snapshot'
import {
  effectiveItemStatus,
  elementRefTargets,
  itemTargetMemberIds,
  itemValidity,
  itemsNeedingRecheck,
} from './validity'

function item(
  project = sampleProject(),
  target: ReviewItem['targets'][number] = { kind: 'member', memberId: '1F-X1Y1' },
  overrides: Partial<ReviewItem> = {},
): ReviewItem {
  const snapshot = reviewSnapshot(project)
  const targetMemberIds = elementRefTargets([target], project).memberIds
  snapshot.fingerprints = {
    ...snapshot.fingerprints,
    members: Object.fromEntries(targetMemberIds.map((memberId) => [memberId, snapshot.fingerprints.members[memberId]])),
  }
  return {
    id: 'item-1',
    createdAt: '2026-09-17T10:00:00+09:00',
    updatedAt: '2026-09-17T10:00:00+09:00',
    targets: [target],
    title: 'review',
    body: 'body',
    status: '未確認',
    confirmations: [],
    snapshot: reviewViewerSnapshot(snapshot.fingerprints),
    ...overrides,
  }
}

describe('review validity', () => {
  it('expands a joint to its column and connected girder-run members', () => {
    const reviewItem = item(sampleProject(), { kind: 'joint', columnMemberId: '1F-X1Y1' })
    const result = itemTargetMemberIds(reviewItem, sampleProject())
    expect(result.memberIds).toContain('1F-X1Y1')
    expect(result.memberIds).toContain('1F-G1-X1Y1-X')
    expect(result.missing).toEqual([])
  })

  it('marks a support column and its beam as stale, but not an unrelated G2 pitch', () => {
    const baselineProject = sampleProject()
    const changedProject = cloneProject(baselineProject)
    changedProject.sections = changedProject.sections.map((section) =>
      section.id === 'section-C1' && section.kind === '柱'
        ? { ...section, b: 900 }
        : section,
    )
    const current = reviewSnapshot(changedProject)
    const currentModel = {
      project: changedProject,
      fingerprints: current.fingerprints,
      impact: assessImpact(reviewSnapshot(baselineProject), current),
    }
    const jointItem = item(baselineProject, { kind: 'joint', columnMemberId: '1F-X1Y1' })
    const unrelatedItem = item(baselineProject, { kind: 'member', memberId: '1F-G2-X1Y2-X' })

    expect(itemValidity(jointItem, currentModel)).toEqual(expect.objectContaining({
      state: '再検討必要',
      reasons: expect.arrayContaining([
        expect.objectContaining({ kind: '入力変更' }),
        expect.objectContaining({ kind: '結果変更' }),
      ]),
    }))
    expect(itemValidity(unrelatedItem, currentModel).state).toBe('再検討必要')
  })

  it('ignores a G2 pitch change for a joint that does not contain G2', () => {
    const changedProject = cloneProject(sampleProject())
    changedProject.sections = changedProject.sections.map((section) =>
      section.id === 'section-G2' && section.kind === '大梁'
        ? { ...section, stirrup: { ...section.stirrup, pitch: 200 } }
        : section,
    )
    const current = reviewSnapshot(changedProject)
    const currentModel = {
      project: changedProject,
      fingerprints: current.fingerprints,
      impact: assessImpact(reviewSnapshot(sampleProject()), current),
    }
    expect(itemValidity(item(sampleProject(), { kind: 'joint', columnMemberId: '1F-X1Y1' }), currentModel).state)
      .toBe('有効')
    expect(itemValidity(item(sampleProject(), { kind: 'member', memberId: '1F-G2-X1Y2-X' }), currentModel).state)
      .toBe('再検討必要')
  })

  it('does not invalidate viewer-only or display-only snapshot changes', () => {
    const base = sampleProject()
    const current = reviewSnapshot(base)
    const reviewed = item(base)
    reviewed.snapshot = {
      ...reviewed.snapshot,
      viewer: {
        ...reviewed.snapshot.viewer,
        pose: { position: [1, 2, 3], target: [4, 5, 6] },
        clip: { enabled: true, axis: 'z', ratio: 0.2 },
        layers: { main: false, hoop: true, concrete: false },
        selection: { group: 'group', memberId: 'other', rowId: 'row' },
      },
    }
    base.name = '案件名変更'
    base.notes = { note: 'changed' }
    base.grid = { ...base.grid, xLabels: ['X1', 'X2'], yLabels: ['Y1', 'Y2', 'Y3'] }
    expect(itemValidity(reviewed, { project: base, fingerprints: current.fingerprints, impact: null })).toEqual({ state: '有効' })
  })

  it('ignores check conditions when the item has no finding and exposes stale status separately', () => {
    const project = sampleProject()
    const current = reviewSnapshot(project)
    const changedChecks = { ...current.fingerprints, checkVersion: 2, checkConditions: 'changed' }
    const reviewed = item(project, { kind: 'member', memberId: '1F-X1Y1' }, { status: '確認済' })
    const validity = itemValidity(reviewed, { project, fingerprints: changedChecks, impact: null })

    expect(validity).toEqual({ state: '有効' })
    expect(effectiveItemStatus(reviewed, { state: '再検討必要', reasons: [{ kind: '結果変更', detail: 'changed' }] })).toBe('再検討必要')
    expect(effectiveItemStatus(reviewed, validity)).toBe('確認済')
    expect(itemsNeedingRecheck([reviewed], { project, fingerprints: changedChecks, impact: null })).toEqual([])
  })

  it('reports target disappearance, finding version, and condition changes', () => {
    const base = sampleProject()
    const changed = cloneProject(base)
    changed.members = changed.members.filter(({ id }) => id !== '1F-X1Y1')
    const current = reviewSnapshot(changed)
    const removed = item(base)
    const removedValidity = itemValidity(removed, {
      project: changed,
      fingerprints: current.fingerprints,
      impact: assessImpact(reviewSnapshot(base), current),
    })
    expect(removedValidity.state).toBe('再検討必要')
    if (removedValidity.state !== '再検討必要') throw new Error('expected stale validity')
    expect(removedValidity.reasons.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['対象なし', '対象変更']),
    )

    const findingItem = item(base, { kind: 'member', memberId: '1F-G1-X1Y1-X' }, {
      finding: {
        checkId: 'clearance',
        findingId: 'finding-1',
        kind: '接触',
        clearanceMm: 0,
        a: { memberId: '1F-G1-X1Y1-X', rebarId: 'a', role: '主筋', barIndex: 0, segmentIndex: 0 },
        b: { memberId: '1F-X1Y1', rebarId: 'b', role: '帯筋', barIndex: 0, segmentIndex: 0 },
        closestPoints: [[0, 0, 0], [0, 0, 0]],
        basis: 'basis',
      },
    })
    const changedChecks = { ...current.fingerprints, checkVersion: 2, checkConditions: 'changed' }
    const versionValidity = itemValidity(findingItem, { project: changed, fingerprints: changedChecks, impact: null })
    expect(versionValidity.state).toBe('再検討必要')
    if (versionValidity.state !== '再検討必要') throw new Error('expected stale validity')
    expect(versionValidity.reasons.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['検査版変更', '検査条件変更']),
    )
  })

  it('returns対象なし for a quantity-line-only reference and no 대응要確認 without a baseline impact', () => {
    const quantityItem = item(sampleProject(), { kind: 'quantityLine', lineId: 'missing-line' })
    expect(itemTargetMemberIds(quantityItem, sampleProject()).unresolved).toEqual(quantityItem.targets)
    const validity = itemValidity(quantityItem, {
      project: sampleProject(),
      fingerprints: reviewSnapshot(sampleProject()).fingerprints,
      impact: null,
    })
    expect(validity).toEqual({
      state: '再検討必要',
      reasons: [{ kind: '対象なし', detail: expect.any(String) }],
    })
  })
})
