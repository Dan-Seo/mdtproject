import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatLength } from '@/components/quantity/TakeoffPane'
import { memberGroupKey } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { quantityLineId } from '@/domain/quantity'
import { checkConditionsFingerprint, projectFingerprints } from '@/domain/review/fingerprint'
import { resolveJoint } from '@/domain/review/joint'
import { emptyReviewState } from '@/domain/review/state'
import { itemTargetMemberIds } from '@/domain/review/validity'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'
import { xrayForRow } from '@/lib/review/xray'
import * as geometryCheck from '@/lib/review/geometry-check'
import { jpMlitRulePack } from '@/rulepack'

import { ReviewPane } from './ReviewPane'

describe('ReviewPane', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      review: emptyReviewState(),
      locale: 'ja',
      sel: { group: null, memberId: '1F-X2Y1' },
      hoverRowId: null,
      viewerMode: 'member',
    })
  })

  function directGeometryCheck() {
    const { project, review } = useAppStore.getState()
    const takeoff = buildTakeoff(project)
    const unsupportedMemberIds = new Set(
      takeoff.unsupportedMembers.map(({ memberId }) => memberId),
    )
    const fingerprints = projectFingerprints(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      jpMlitRulePack,
      geometryCheck.GEOMETRY_CHECK_VERSION,
      checkConditionsFingerprint(review.settings, review.exclusions),
    )
    const resolution = resolveJoint(project, '1F-X2Y1')
    if (resolution.status !== 'joint') throw new Error('sample joint expected')
    return geometryCheck.runGeometryCheck({
      project,
      rebars: takeoff.rebars,
      unsupportedMemberIds,
      joint: resolution.joint,
      settings: review.settings,
      exclusions: review.exclusions,
      fingerprints,
    })
  }

  function currentFingerprints() {
    const { project, review } = useAppStore.getState()
    const takeoff = buildTakeoff(project)
    const unsupportedMemberIds = new Set(
      takeoff.unsupportedMembers.map(({ memberId }) => memberId),
    )
    return projectFingerprints(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      jpMlitRulePack,
      geometryCheck.GEOMETRY_CHECK_VERSION,
      checkConditionsFingerprint(review.settings, review.exclusions),
    )
  }

  it('shows the selected column joint and rejects a selected girder', () => {
    render(<ReviewPane />)

    const joint = within(screen.getByTestId('review-joint'))
    expect(joint.getByText('G1 終端')).toBeInTheDocument()
    expect(joint.getByText('G2 始端')).toBeInTheDocument()
    expect(joint.getByText('参考表示（検討対象外）')).toBeInTheDocument()

    act(() => useAppStore.getState().selectMember('1F-G1-X1Y1-X'))

    expect(screen.getByTestId('review-joint')).toHaveTextContent('柱ではありません')
    expect(screen.getByTestId('review-joint')).toHaveTextContent('柱を選択してください')
  })

  it('keeps design and 3D values separate and expands exact rule users', () => {
    const project = createSampleProject()
    const takeoff = buildTakeoff(project)
    const rebar = takeoff.rebars.find(
      ({ memberId, role }) => memberId === '1F-X1Y1' && role === '主筋',
    )
    if (!rebar) throw new Error('sample column main rebar expected')
    const member = project.members.find(({ id }) => id === rebar.memberId)
    if (!member) throw new Error('sample column expected')
    const rowId = quantityLineId(memberGroupKey(project, member), rebar)
    const expected = xrayForRow(rowId, takeoff.rebars, project, takeoff.lines)
    if (expected.length === 0 || !expected[0].shape.drawn) {
      throw new Error('sample xray expected')
    }
    act(() => useAppStore.getState().setHoverRow(rowId))

    render(<ReviewPane />)

    const designLengths = screen.getAllByTestId('xray-design-length')
    const drawnLengths = screen.getAllByTestId('xray-drawn-length')
    expect(designLengths.map((cell) => cell.textContent)).toContain(
      formatLength(expected[0].quantity.designLengthMm),
    )
    expect(drawnLengths.map((cell) => cell.textContent)).toContain(
      formatLength(expected[0].shape.drawnLengthMm),
    )
    expect(designLengths[0].textContent).not.toBe(drawnLengths[0].textContent)
    expect(screen.getAllByTestId('xray-differs')[0]).toHaveTextContent(
      '一致しない（数量には用いない）',
    )
    expect(screen.getAllByTestId('xray-rule-anchorage.L1')[0]).toHaveTextContent('fc=24')
    expect(screen.getAllByTestId('xray-rule-lap.L1')[0]).toBeInTheDocument()
    expect(screen.getAllByTestId('xray-rule-cover.minimum')[0]).toBeInTheDocument()

    const anchorageRule = screen.getAllByTestId('xray-rule-anchorage.L1')[0]
    fireEvent.click(
      within(anchorageRule).getByRole('button', { name: 'この根拠を使う鉄筋' }),
    )

    const users = within(anchorageRule).getAllByRole('button')
    expect(users.length).toBeGreaterThan(1)
    fireEvent.click(users[1])
    expect(useAppStore.getState().hoverRowId).toBeTruthy()
  })

  it('runs the geometry check and renders all findings without a clearance basis', () => {
    const expected = directGeometryCheck()
    render(<ReviewPane />)

    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

    const check = screen.getByTestId('review-check')
    const findings = screen.getByTestId('review-findings')
    expect(findings).toHaveTextContent('干渉候補')
    expect(findings).toHaveTextContent('G1')
    expect(findings).toHaveTextContent('G2')
    expect(screen.getAllByTestId('review-verdict')).toHaveLength(3)
    expect(check).toHaveTextContent('判断不可（あき基準未入力）')
    expect(check).toHaveTextContent('継手位置')
    expect(findings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)
  })

  it('commits a user clearance basis on blur and reports clearance findings', () => {
    render(<ReviewPane />)

    const input = screen.getByLabelText('鉄筋のあき（利用者入力）')
    fireEvent.change(input, { target: { value: '26' } })
    fireEvent.blur(input)

    expect(useAppStore.getState().review.settings.clearance).toMatchObject({
      valueMm: 26,
      source: '利用者入力',
    })

    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))
    const findings = screen.getByTestId('review-findings')
    expect(findings).toHaveTextContent('あき不足候補')
    expect(findings).toHaveTextContent('25.0')
    expect(findings).toHaveTextContent('利用者入力')
  })

  it('adds default exclusions without removing excluded findings', () => {
    const before = directGeometryCheck()
    render(<ReviewPane />)

    fireEvent.click(screen.getByRole('button', { name: '既定の除外を追加' }))
    expect(useAppStore.getState().review.exclusions).toHaveLength(3)

    const expected = directGeometryCheck()
    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))
    const findings = screen.getByTestId('review-findings')
    expect(findings).toHaveTextContent('除外:')
    expect(findings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)
    expect(expected.findings.length).toBe(before.findings.length)
  })

  it('focuses both finding segments in the joint viewer', () => {
    const expected = directGeometryCheck()
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

    fireEvent.click(screen.getByTestId('review-findings').querySelector('tbody tr') as HTMLElement)

    const focus = useAppStore.getState().reviewFocus
    const finding = expected.findings[0]
    if (!finding) throw new Error('sample finding expected')
    expect(focus?.segments[0]).not.toBeNull()
    expect(focus?.segments[1]).not.toBeNull()
    expect(focus?.point[0]).toBeCloseTo(finding.midpoint[0])
    expect(focus?.point[1]).toBeCloseTo(finding.midpoint[1])
    expect(focus?.point[2]).toBeCloseTo(finding.midpoint[2])
    expect(useAppStore.getState().viewerMode).toBe('joint')
  })

  it('commits clearance and exclusion edits only at their boundaries', () => {
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    render(<ReviewPane />)

    const input = screen.getByLabelText('鉄筋のあき（利用者入力）')
    for (const value of ['2', '26', '260', '26', '']) {
      fireEvent.change(input, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '26' } })
    fireEvent.blur(input)
    expect(setReview).toHaveBeenCalledTimes(1)

    const note = screen.getByLabelText('メモ')
    fireEvent.change(note, { target: { value: 'memo' } })
    fireEvent.blur(note)
    expect(useAppStore.getState().review.settings.clearance?.note).toBe('memo')

    const reason = screen.getByLabelText('理由')
    fireEvent.change(reason, { target: { value: 'reason' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(useAppStore.getState().review.exclusions[0]?.reason).toBe('reason')
    setReview.mockRestore()
  })

  it('never runs automatically when the project or review inputs change', () => {
    const run = vi.spyOn(geometryCheck, 'runGeometryCheck')
    render(<ReviewPane />)
    expect(run).not.toHaveBeenCalled()

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: [...project.sections],
    })))
    const input = screen.getByLabelText('鉄筋のあき（利用者入力）')
    fireEvent.change(input, { target: { value: '26' } })
    fireEvent.blur(input)
    expect(run).not.toHaveBeenCalled()
    run.mockRestore()
  })

  it('does not use approval language in the verdicts', () => {
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))
    for (const verdict of screen.getAllByTestId('review-verdict')) {
      expect(verdict).not.toHaveTextContent(/合格|安全|承認|施工可能|適合/)
    }
  })

  it('creates findings and plain review items with scoped snapshots', () => {
    const expected = directGeometryCheck()
    render(<ReviewPane />)

    fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))
    const rows = screen.getByTestId('review-findings').querySelectorAll('tbody tr')
    const findingRow = rows[4] as HTMLElement
    fireEvent.click(within(findingRow).getByRole('button', { name: '検討項目にする' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const first = useAppStore.getState().review.items[0]
    if (!first) throw new Error('review item expected')
    expect(first.finding?.clearanceMm).toBe(-22)
    expect(new Set(Object.keys(first.snapshot.fingerprints.members))).toEqual(
      new Set(itemTargetMemberIds(first, useAppStore.getState().project).memberIds),
    )
    expect(first.snapshot.viewer.clip).toEqual(useAppStore.getState().viewerClip)
    expect(expected.findings[4]?.clearanceMm).toBe(-22)

    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect('finding' in useAppStore.getState().review.items[1]).toBe(false)
  })

  it('confirms only after a by value and refreshes target fingerprints', () => {
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    })))
    fireEvent.click(screen.getByRole('button', { name: '確認' }))

    const by = screen.getByLabelText('確認者（ローカル入力・本人認証ではない）')
    fireEvent.click(screen.getByRole('button', { name: '確認を保存' }))
    expect(useAppStore.getState().review.items[0]?.status).toBe('未確認')
    expect(useAppStore.getState().review.items[0]?.confirmations).toHaveLength(0)

    fireEvent.change(by, { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: '確認を保存' }))
    const item = useAppStore.getState().review.items[0]
    expect(item?.status).toBe('確認済')
    expect(item?.confirmations).toHaveLength(1)
    expect(item?.snapshot.fingerprints.rulepack).toBe(currentFingerprints().rulepack)
    const targetMemberId = itemTargetMemberIds(item!, useAppStore.getState().project).memberIds[0]
    expect(item?.snapshot.fingerprints.members[targetMemberId]).toEqual(
      currentFingerprints().members[targetMemberId],
    )
  })

  it('requires a hold reason and keeps form edits local until commit', () => {
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    render(<ReviewPane />)
    setReview.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    const title = screen.getByLabelText('タイトル')
    const body = screen.getByLabelText('本文')
    for (const value of ['a', 'ab', 'abc', 'abcd', '']) {
      fireEvent.change(title, { target: { value } })
      fireEvent.change(body, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(setReview).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '保留' }))
    fireEvent.click(screen.getByRole('button', { name: '保留を保存' }))
    expect(screen.getByRole('alert')).toHaveTextContent('保留理由')
    expect(useAppStore.getState().review.items[0]?.status).toBe('未確認')
    fireEvent.change(screen.getByLabelText('保留理由'), { target: { value: 'later' } })
    fireEvent.click(screen.getByRole('button', { name: '保留を保存' }))
    expect(useAppStore.getState().review.items[0]?.status).toBe('保留')
    setReview.mockRestore()
  })

  it('marks changed target members for recheck and filters them', () => {
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    })))

    const card = screen.getByTestId('review-item-1')
    expect(card.querySelector('[data-review-status]')).toHaveTextContent('再検討必要')
    expect(card).toHaveTextContent('入力が変更されています: 1F-X2Y1')
    fireEvent.click(screen.getByLabelText('今回の変更で再検討が必要なものだけ'))
    expect(screen.getByTestId('review-item-1')).toBeInTheDocument()
  })

  it('replays a saved viewer state and renders the safety notice', () => {
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    const snapshot = useAppStore.getState().review.items[0]?.snapshot
    if (!snapshot) throw new Error('snapshot expected')

    act(() => {
      useAppStore.getState().setViewerMode('building')
      useAppStore.getState().setViewerClip({ enabled: true, axis: 'z', ratio: 0.2 })
      useAppStore.getState().toggleViewerLayer('main')
      useAppStore.getState().setHoverRow('changed')
      useAppStore.getState().requestViewerPose(null)
    })
    fireEvent.click(screen.getByRole('button', { name: '再現' }))

    const state = useAppStore.getState()
    expect(state.viewerMode).toBe(snapshot.viewer.mode)
    expect(state.viewerClip).toEqual(snapshot.viewer.clip)
    expect(state.viewerLayers).toEqual(snapshot.viewer.layers)
    expect(state.sel.memberId).toBe(snapshot.viewer.selection.memberId)
    expect(state.hoverRowId).toBe(snapshot.viewer.selection.rowId)
    expect(state.requestedViewerPose).toEqual(snapshot.viewer.pose)
    expect(screen.getByTestId('data-review-notice')).toHaveTextContent('構造安全・法規適合・施工承認')
  })
})
