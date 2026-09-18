import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import type { Project } from '@/domain/model/project'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { checkConditionsFingerprint, projectFingerprints } from '@/domain/review/fingerprint'
import { emptyReviewState } from '@/domain/review/state'
import type {
  ReviewItem,
  ReviewState,
  WorkPackage,
} from '@/domain/review/types'
import { GEOMETRY_CHECK_VERSION } from '@/lib/review/geometry-check'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

import { WorkPackageBoard } from './WorkPackageBoard'

function currentModel() {
  const { project, review } = useAppStore.getState()
  const takeoff = buildTakeoff(project)
  const unsupportedMemberIds = new Set(
    takeoff.unsupportedMembers.map(({ memberId }) => memberId),
  )
  return {
    project,
    fingerprints: projectFingerprints(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      jpMlitRulePack,
      GEOMETRY_CHECK_VERSION,
      checkConditionsFingerprint(review.settings, review.exclusions),
    ),
    impact: null,
  }
}

function reviewItem(memberId: string): ReviewItem {
  const current = currentModel()
  const memberFingerprint = current.fingerprints.members[memberId]
  if (!memberFingerprint) throw new Error('member fingerprint expected')
  return {
    id: 'review-item-1',
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
    targets: [{ kind: 'member', memberId }],
    title: '接合部の確認',
    body: '確認内容',
    status: '確認済',
    confirmations: [{ by: 'reviewer', at: '2026-09-17T10:00:00.000Z', note: '' }],
    snapshot: {
      capturedAt: '2026-09-17T10:00:00.000Z',
      fingerprints: {
        ...current.fingerprints,
        members: { [memberId]: memberFingerprint },
      },
      viewer: {
        mode: 'member',
        pose: null,
        clip: { enabled: false, axis: 'x', ratio: 0.5 },
        layers: { main: true, hoop: true, concrete: true },
        selection: { group: null, memberId, rowId: null },
      },
    },
  }
}

function packageFixture(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    id: 'work-package-1',
    name: '接合部確認',
    targets: [{ kind: 'member', memberId: '1F-X2Y1' }],
    assignee: 'reviewer',
    dueDate: null,
    checklist: [],
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
    ...overrides,
  }
}

function setReviewState(review: ReviewState): void {
  useAppStore.setState({ review })
}

describe('WorkPackageBoard', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      review: emptyReviewState(),
      locale: 'ja',
      sel: { group: null, memberId: '1F-X2Y1' },
      viewerMode: 'member',
      viewerClip: { enabled: false, axis: 'x', ratio: 0.5 },
      viewerPose: null,
    })
  })

  it('creates a package, confirms a required unlinked item, and derives the core readiness state', () => {
    render(<WorkPackageBoard />)

    fireEvent.click(screen.getByRole('button', { name: '作業パッケージを追加' }))
    fireEvent.change(screen.getByLabelText('作業パッケージ名'), { target: { value: '柱確認' } })
    fireEvent.change(screen.getByLabelText('担当者（ローカル入力・本人認証ではない）'), { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: '現在の選択を追加' }))
    fireEvent.click(screen.getByRole('button', { name: 'チェックリスト項目を追加' }))
    fireEvent.change(screen.getByLabelText('チェックリスト項目 1'), { target: { value: '接合部を確認' } })
    fireEvent.click(within(screen.getByTestId('work-package-form')).getByRole('button', { name: '保存' }))

    const packageId = useAppStore.getState().review.packages[0]?.id
    if (!packageId) throw new Error('work package expected')
    const card = screen.getByTestId(`work-package-card-${packageId}`)
    const checklist = within(card).getByTestId('work-package-checklist')
    const status = within(checklist).getByLabelText('チェックリスト状態')

    fireEvent.change(status, { target: { value: '未確認' } })
    fireEvent.change(status, { target: { value: '確認済' } })
    fireEvent.click(within(checklist).getByRole('button', { name: 'チェックリスト状態を保存' }))
    expect(useAppStore.getState().review.packages[0]?.checklist[0]?.status).toBe('未確認')

    fireEvent.change(within(checklist).getByLabelText('確認者（ローカル入力・本人認証ではない）'), { target: { value: 'reviewer' } })
    fireEvent.click(within(checklist).getByRole('button', { name: 'チェックリスト状態を保存' }))

    // 期待値はテストが直接書く。コンポーネントと同じ packageReadiness を呼んで
    // 突き合わせると、実装が何を返しても通る項進命題になる(phase 48 の C4)。
    // 完全一致にするのは 準備完了 が 準備完了（例外あり） に部分一致するからだ。
    expect(useAppStore.getState().review.packages[0]?.checklist[0]?.status).toBe('確認済')
    expect(within(card).getByTestId('data-package-state')).toHaveTextContent(/^準備完了$/)
    expect(within(card).queryByTestId('data-blocker')).toBeNull()
  })

  // phase 49 step 3 — チェックリストと検討項目の連結を UI から作る。
  // reviewItemIds をフィクスチャで直接入れていたので、連結ハンドラを no-op に
  // しても全テストが通っていた(phase 48 の C3)。
  it('links a checklist entry to a review item through the select', () => {
    const item = reviewItem('1F-X2Y1')
    setReviewState({ ...emptyReviewState(), items: [item] })
    render(<WorkPackageBoard />)

    fireEvent.click(screen.getByRole('button', { name: '作業パッケージを追加' }))
    fireEvent.change(screen.getByLabelText('作業パッケージ名'), { target: { value: '連結確認' } })
    fireEvent.change(screen.getByLabelText('担当者（ローカル入力・本人認証ではない）'), { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'チェックリスト項目を追加' }))
    fireEvent.change(screen.getByLabelText('チェックリスト項目 1'), { target: { value: '接合部を確認' } })

    const link = screen.getByLabelText('関連する検討項目 1') as HTMLSelectElement
    expect(link.value).toBe('')
    expect([...link.options].map((option) => option.value)).toContain(item.id)
    fireEvent.change(link, { target: { value: item.id } })
    expect((screen.getByLabelText('関連する検討項目 1') as HTMLSelectElement).value).toBe(item.id)

    fireEvent.click(within(screen.getByTestId('work-package-form')).getByRole('button', { name: '保存' }))
    expect(useAppStore.getState().review.packages[0]?.checklist[0]?.reviewItemIds).toEqual([item.id])
  })

  // phase 49 追補 — 接合部が成立しない部材は作業パッケージの対象にも入れない。
  // 入れられると readiness が 対象部材なし で止まり、パッケージを消す手段が無い
  // ので永久に 準備未完 のまま残る(独立検証の指摘1)。
  it('refuses to add an unresolvable joint target and says why', () => {
    useAppStore.setState({ viewerMode: 'joint', sel: { group: null, memberId: '1F-G1-X1Y1-X' } })
    render(<WorkPackageBoard />)

    fireEvent.click(screen.getByRole('button', { name: '作業パッケージを追加' }))
    const add = screen.getByRole('button', { name: '現在の選択を追加' })
    expect(add).toBeDisabled()
    expect(screen.getByTestId('work-package-joint-unavailable')).toHaveTextContent('柱ではない')

    fireEvent.click(add)
    fireEvent.change(screen.getByLabelText('作業パッケージ名'), { target: { value: '不成立' } })
    fireEvent.change(screen.getByLabelText('担当者（ローカル入力・本人認証ではない）'), { target: { value: 'reviewer' } })
    fireEvent.click(within(screen.getByTestId('work-package-form')).getByRole('button', { name: '保存' }))
    expect(useAppStore.getState().review.packages[0]?.targets).toEqual([])
  })

  it('keeps a linked item blocked when its target model is stale', () => {
    const item = reviewItem('1F-X2Y1')
    const pkg = packageFixture({
      checklist: [{
        id: 'check-1',
        label: '接合部を確認',
        required: true,
        reviewItemIds: [item.id],
        status: '確認済',
      }],
    })
    setReviewState({ ...emptyReviewState(), items: [item], packages: [pkg] })
    render(<WorkPackageBoard />)

    actUpdateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    }))

    const card = screen.getByTestId(`work-package-card-${pkg.id}`)
    expect(within(card).getByTestId('data-package-state')).toHaveTextContent('準備未完')
    expect(within(card).getByTestId('data-blocker')).toHaveTextContent('前モデルの検討が残っている')
  })

  it('requires a reason for 保留, preserves local typing, and exposes an exception state', () => {
    const pkg = packageFixture({
      checklist: [{
        id: 'check-1',
        label: '接合部を確認',
        required: true,
        reviewItemIds: [],
        status: '未確認',
      }],
    })
    setReviewState({ ...emptyReviewState(), packages: [pkg] })
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    render(<WorkPackageBoard />)
    setReview.mockClear()

    const card = screen.getByTestId(`work-package-card-${pkg.id}`)
    const checklist = within(card).getByTestId('work-package-checklist')
    fireEvent.change(within(checklist).getByLabelText('チェックリスト状態'), { target: { value: '保留' } })
    fireEvent.click(within(checklist).getByRole('button', { name: 'チェックリスト状態を保存' }))
    expect(setReview).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('理由')

    const reason = within(checklist).getByLabelText('保留・除外理由')
    for (const value of ['r', 're', 'rea', 'reas', 'reason']) {
      fireEvent.change(reason, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(within(checklist).getByRole('button', { name: 'チェックリスト状態を保存' }))
    expect(setReview).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().review.packages[0]?.checklist[0]).toEqual(
      expect.objectContaining({ status: '保留', reason: 'reason' }),
    )
    expect(within(card).getByTestId('data-package-state')).toHaveTextContent('準備完了（例外あり）')
    setReview.mockRestore()
  })

  it('reports a blank assignee as a blocker without putting approval words in status elements', () => {
    const pkg = packageFixture({ assignee: '' })
    setReviewState({ ...emptyReviewState(), packages: [pkg] })
    render(<WorkPackageBoard />)

    const card = screen.getByTestId(`work-package-card-${pkg.id}`)
    expect(within(card).getByTestId('data-blocker')).toHaveTextContent('担当者未入力')
    for (const element of screen.getByTestId('work-packages').querySelectorAll('[data-package-state], [data-blocker]')) {
      expect(element.textContent).not.toMatch(/合格|安全|承認|施工可能|適合/)
    }
  })

  it('keeps quantities out of cards, uses a notice outside the footer, and never edits the project', () => {
    setReviewState({ ...emptyReviewState(), packages: [packageFixture()] })
    const updateProject = vi.spyOn(useAppStore.getState(), 'updateProject')
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    render(<WorkPackageBoard />)
    setReview.mockClear()

    const card = screen.getByTestId('work-package-card-work-package-1')
    const footer = within(card).getByTestId('work-package-footer')
    const cardWithoutFooter = card.cloneNode(true) as HTMLElement
    cardWithoutFooter.querySelector('[data-testid="work-package-footer"]')?.remove()
    expect(cardWithoutFooter.textContent).not.toMatch(/kg|数量|%/)
    expect(footer).toHaveTextContent('作業パッケージは数量を持たない')
    expect(screen.getByTestId('data-review-notice')).toHaveTextContent('法的な施工承認や構造安全の判定ではない')

    fireEvent.click(screen.getByRole('button', { name: '作業パッケージを追加' }))
    const name = screen.getByLabelText('作業パッケージ名')
    const assignee = screen.getByLabelText('担当者（ローカル入力・本人認証ではない）')
    for (const value of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      fireEvent.change(name, { target: { value } })
      fireEvent.change(assignee, { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'チェックリスト項目を追加' }))
    const label = screen.getByLabelText('チェックリスト項目 1')
    for (const value of ['l', 'la', 'lab', 'labe', 'label']) {
      fireEvent.change(label, { target: { value } })
    }
    expect(updateProject).not.toHaveBeenCalled()
    expect(setReview).not.toHaveBeenCalled()
    expect(useAppStore.getState().review.packages).toHaveLength(1)
    updateProject.mockRestore()
    setReview.mockRestore()
  })
})

function actUpdateProject(updater: (project: Project) => Project): void {
  act(() => useAppStore.getState().updateProject(updater))
}
