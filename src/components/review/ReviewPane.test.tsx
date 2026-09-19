import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatLength } from '@/components/quantity/TakeoffPane'
import { memberGroupKey } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { quantityLineId } from '@/domain/quantity'
import { checkConditionsFingerprint, projectFingerprints } from '@/domain/review/fingerprint'
import { assessImpact } from '@/domain/review/impact'
import { resolveJoint } from '@/domain/review/joint'
import { emptyReviewState } from '@/domain/review/state'
import {
  effectiveItemStatus,
  itemTargetMemberIds,
  itemValidity,
} from '@/domain/review/validity'
import { t } from '@/lib/i18n'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { toSnapshot } from '@/lib/hooks/useReviewModel'
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
      viewerLayers: { main: true, hoop: true, concrete: true },
      viewerClip: { enabled: false, axis: 'x', ratio: 0.5 },
      viewerPose: null,
      requestedViewerPose: null,
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

  function snapshotFor(project: ReturnType<typeof createSampleProject>, fingerprints: ReturnType<typeof currentFingerprints>) {
    return toSnapshot(project, buildTakeoff(project), fingerprints)
  }

  function normalizedText(element: Element): string {
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
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
    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', { name: '保存' }))

    const first = useAppStore.getState().review.items[0]
    if (!first) throw new Error('review item expected')
    expect(first.finding?.clearanceMm).toBe(-22)
    expect(new Set(Object.keys(first.snapshot.fingerprints.members))).toEqual(
      new Set(itemTargetMemberIds(first, useAppStore.getState().project).memberIds),
    )
    expect(first.snapshot.viewer.clip).toEqual(useAppStore.getState().viewerClip)
    expect(expected.findings[4]?.clearanceMm).toBe(-22)

    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', { name: '保存' }))
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

    setReview.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    const confirmBy = screen.getByLabelText('確認者（ローカル入力・本人認証ではない）')
    const confirmNote = screen.getByLabelText('確認メモ')
    for (const value of ['r', 're', 'rev', 'revi', 'reviewer']) {
      fireEvent.change(confirmBy, { target: { value } })
      fireEvent.change(confirmNote, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '確認を保存' }))
    expect(setReview).toHaveBeenCalledTimes(1)

    setReview.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '保留' }))
    fireEvent.click(screen.getByRole('button', { name: '保留を保存' }))
    expect(screen.getByRole('alert')).toHaveTextContent('保留理由')
    expect(useAppStore.getState().review.items[0]?.status).toBe('確認済')
    const holdReason = screen.getByLabelText('保留理由')
    for (const value of ['l', 'la', 'lat', 'late', 'later']) {
      fireEvent.change(holdReason, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保留を保存' }))
    expect(setReview).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().review.items[0]?.status).toBe('保留')
    setReview.mockRestore()
  })

  it('marks changed target members for recheck and filters them', () => {
    act(() => useAppStore.getState().updateProject((project) => {
      const section = project.sections.find((candidate) => candidate.id === 'section-C1')
      if (!section || section.kind !== '柱') throw new Error('sample column section expected')
      return {
        ...project,
        sections: [...project.sections, { ...section, id: 'section-C2', mark: 'C2' }],
        members: project.members.map((member) => member.id === '2F-X1Y1'
          ? { ...member, sectionId: 'section-C2' }
          : member),
      }
    }))
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    act(() => useAppStore.getState().selectMember('2F-X1Y1'))
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const item2BaselineFingerprints = currentFingerprints()
    const item2MemberFingerprint = item2BaselineFingerprints.members['2F-X1Y1']
    if (item2MemberFingerprint === undefined) throw new Error('second target fingerprint expected')
    act(() => useAppStore.getState().setReview((review) => ({
      ...review,
      items: review.items.map((item, index) => index === 1
        ? {
            ...item,
            targets: [{ kind: 'member' as const, memberId: '2F-X1Y1' }],
            snapshot: {
              ...item.snapshot,
              fingerprints: {
                ...item2BaselineFingerprints,
                members: { '2F-X1Y1': item2MemberFingerprint },
              },
            },
          }
        : item),
    })))

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    })))

    const state = useAppStore.getState()
    const current = { project: state.project, fingerprints: currentFingerprints(), impact: null }
    const changedItem = state.review.items[0]
    const unchangedItem = state.review.items[1]
    if (!changedItem || !unchangedItem) throw new Error('review items expected')
    const changedCard = screen.getByTestId(changedItem.id)
    const unchangedCard = screen.getByTestId(unchangedItem.id)
    expect(changedCard.querySelector('[data-review-status]')).toHaveTextContent(
      effectiveItemStatus(changedItem, itemValidity(changedItem, current)),
    )
    expect(changedCard).toHaveTextContent('入力が変更されています: 1F-X2Y1')
    expect(unchangedCard.querySelector('[data-review-status]')).toHaveTextContent(
      effectiveItemStatus(unchangedItem, itemValidity(unchangedItem, current)),
    )
    expect(unchangedCard.querySelector('[data-review-status]')).toHaveTextContent('未確認')

    const statusesBeforeUnrelatedChanges = [...screen.getByTestId('review-items').querySelectorAll('[data-review-status]')]
      .map((status) => status.textContent)
    act(() => {
      useAppStore.getState().updateProject((project) => ({
        ...project,
        name: 'renamed',
        notes: { unrelated: 'memo' },
      }))
      useAppStore.getState().setViewerClip({ enabled: true, axis: 'z', ratio: 0.25 })
      useAppStore.getState().setViewerPose({
        position: [1, 2, 3],
        target: [4, 5, 6],
      })
    })
    expect([...screen.getByTestId('review-items').querySelectorAll('[data-review-status]')]
      .map((status) => status.textContent)).toEqual(statusesBeforeUnrelatedChanges)

    fireEvent.click(screen.getByLabelText('今回の変更で再検討が必要なものだけ'))
    expect(screen.getByTestId(changedItem.id)).toBeInTheDocument()
    expect(screen.queryByTestId(unchangedItem.id)).not.toBeInTheDocument()
  })

  it('replays a saved viewer state and renders the safety notice', () => {
    const savedPose = {
      position: [10, 20, 30] as [number, number, number],
      target: [40, 50, 60] as [number, number, number],
    }
    act(() => useAppStore.getState().setViewerPose(savedPose))
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
      useAppStore.getState().selectMember('2F-X1Y1')
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
    expect(screen.getByTestId('data-review-notice')).toHaveAttribute('data-review-notice')
  })

  it('keeps review status attributes free of approval language and review actions off the project', () => {
    const updateProject = vi.spyOn(useAppStore.getState(), 'updateProject')
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '検討項目を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    for (const status of screen.getByTestId('review-items').querySelectorAll('[data-review-status]')) {
      expect(status.textContent).not.toMatch(/合格|安全|承認|施工可能|適合/)
    }
    fireEvent.click(screen.getByRole('button', { name: '再現' }))
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    fireEvent.click(screen.getByRole('button', { name: '保留' }))
    fireEvent.click(screen.getByRole('button', { name: '判断不可' }))
    expect(updateProject).not.toHaveBeenCalled()
    updateProject.mockRestore()
  })

  it('fixes an immutable baseline and renders core impact counts and paths', () => {
    const originalProject = useAppStore.getState().project
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    const updateProject = vi.spyOn(useAppStore.getState(), 'updateProject')
    render(<ReviewPane />)
    setReview.mockClear()
    updateProject.mockClear()

    const label = screen.getByLabelText('基準案ラベル')
    for (const value of ['b', 'ba', 'bas', 'base', 'baseline']) {
      fireEvent.change(label, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '現在案を基準案として固定' }))
    expect(setReview).toHaveBeenCalledTimes(1)
    expect(updateProject).not.toHaveBeenCalled()

    const fixed = useAppStore.getState().review.baseline
    if (!fixed) throw new Error('baseline expected')
    expect(fixed.project).not.toBe(originalProject)
    expect(fixed.project).toEqual(originalProject)
    expect(fixed.project.sections).not.toBe(originalProject.sections)

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    })))

    const state = useAppStore.getState()
    expect(state.review.baseline?.project).toEqual(originalProject)
    const currentSnapshot = snapshotFor(state.project, currentFingerprints())
    const baselineSnapshot = snapshotFor(fixed.project, fixed.fingerprints)
    const expected = assessImpact(baselineSnapshot, currentSnapshot)
    const summary = screen.getByTestId('review-compare-summary')
    expect(summary).toHaveTextContent(`部材影響 ${expected.members.length}`)
    expect(summary).toHaveTextContent(`数量行変更 ${expected.lines.length}`)
    expect(summary).toHaveTextContent(`表示のみ ${expected.displayOnly.length}`)
    const expectedSummary = `部材影響 ${expected.members.length} · 数量行変更 ${expected.lines.length} · 表示のみ ${expected.displayOnly.length}`
    expect(normalizedText(summary)).toBe(expectedSummary)

    const entityList = screen.getByTestId('review-compare-entities')
    const expectedEntities = expected.entities.filter((entity) => entity.kind !== 'displayOnly')
    const renderedEntities = [...entityList.querySelectorAll('[data-review-entity]')]
    expect(renderedEntities).toHaveLength(expectedEntities.length)
    for (const entity of expectedEntities) {
      const rendered = renderedEntities.find((candidate) =>
        candidate.getAttribute('data-review-entity-kind') === entity.kind &&
        candidate.getAttribute('data-review-entity-change') === entity.change,
      )
      expect(rendered).toBeDefined()
      const kindLabels: Record<string, string> = {
        member: '部材',
        section: '断面',
        story: '階',
        grid: '通り芯',
        unitMass: '単位質量',
        rulepack: 'ルールパック',
      }
      expect(rendered).toHaveTextContent(kindLabels[entity.kind] ?? entity.kind)
      expect(rendered).toHaveTextContent(entity.change)
      expect(rendered).toHaveTextContent(entity.detail)
    }

    const expectedMember = expected.members.find(({ memberId }) =>
      state.project.members.some(({ id }) => id === memberId),
    )
    if (!expectedMember) throw new Error('current member impact expected')
    const memberTable = screen.getByTestId('review-compare-members')
    const memberButton = within(memberTable).getByRole('button', { name: expectedMember.memberId })
    const memberRow = memberButton.closest('tr')
    if (!memberRow) throw new Error('member row expected')
    expect(memberRow).toHaveTextContent(`${expectedMember.support.before} → ${expectedMember.support.after}`)
    for (const path of expectedMember.path) expect(memberRow).toHaveTextContent(path)
    const categoryChips = memberRow.querySelectorAll('[data-review-member-category]')
    expect(categoryChips).toHaveLength(expectedMember.categories.length)
    expect(categoryChips[0]?.className).toMatch(/compareCategory/)
    fireEvent.click(memberButton)
    expect(useAppStore.getState().sel.memberId).toBe(expectedMember.memberId)
    expect(screen.getByTestId('review-compare-lines')).toHaveTextContent('柱 帯筋')
    setReview.mockRestore()
    updateProject.mockRestore()
  })

  it('shows display-only, mass transitions, and rulepack changes from the impact report', () => {
    const baselineName = useAppStore.getState().project.name
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '現在案を基準案として固定' }))

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      name: '別案件名',
    })))
    const displaySummary = screen.getByTestId('review-compare-summary')
    expect(normalizedText(displaySummary)).toBe('部材影響 0 · 数量行変更 0 · 表示のみ 1')
    const displayOnly = screen.getByTestId('review-compare-display-only')
    expect(displayOnly.querySelectorAll('[data-review-display-only-item]')).toHaveLength(1)
    expect(displayOnly).toHaveTextContent(`案件名 ${baselineName}→別案件名`)

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      unitMass: { ...(project.unitMass ?? {}), D13: 0.995 },
    })))
    expect(screen.getByTestId('review-compare-lines')).toHaveTextContent('単位質量未入力 → 算出')
    for (const cell of screen.getByTestId('review-compare-lines').querySelectorAll('[data-review-line-mass]')) {
      expect(cell.textContent).not.toBe('0')
      expect(cell.textContent).toContain('—')
      expect(cell.textContent).not.toMatch(/\(0(?:\.0+)? →/)
    }

    act(() => useAppStore.getState().setReview((review) => {
      if (!review.baseline) throw new Error('baseline expected')
      return {
        ...review,
        baseline: {
          ...review.baseline,
          fingerprints: {
            ...review.baseline.fingerprints,
            rulepack: 'changed-rulepack',
          },
        },
      }
    }))
    expect(screen.getByTestId('review-compare')).toHaveTextContent(
      '根拠（ルールパック）が変わった — 基準案の数量は現在のルールパックで再計算',
    )
    act(() => useAppStore.getState().setReview((review) => {
      if (!review.baseline) throw new Error('baseline expected')
      return {
        ...review,
        baseline: {
          ...review.baseline,
          fingerprints: {
            ...review.baseline.fingerprints,
            checkVersion: 999,
          },
        },
      }
    }))
    expect(screen.getByTestId('review-compare')).toHaveTextContent('検査版が変わった')
  })

  it('renders correspondence entities with an explicit review badge', () => {
    render(<ReviewPane />)
    fireEvent.click(screen.getByRole('button', { name: '現在案を基準案として固定' }))

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      members: project.members.map((member) => member.id === '1F-X1Y1'
        ? { ...member, id: '1F-X1Y1-renamed' }
        : member),
    })))

    const entities = screen.getByTestId('review-compare-entities')
    const correspondence = entities.querySelectorAll('[data-review-entity-change="対応要確認"]')
    expect(correspondence.length).toBe(2)
    for (const entity of correspondence) {
      expect(entity).toHaveTextContent('対応要確認')
      expect(entity).toHaveTextContent('同じ要素と自動で確定していない')
      const badge = entity.querySelector('[data-review-entity-needs-review]')
      expect(badge).not.toBeNull()
      expect(badge?.className).toMatch(/compareNeedsReview/)
    }
  })

  it('requires a second discard click and keeps comparison inputs local', () => {
    const setReview = vi.spyOn(useAppStore.getState(), 'setReview')
    const updateProject = vi.spyOn(useAppStore.getState(), 'updateProject')
    render(<ReviewPane />)
    setReview.mockClear()
    updateProject.mockClear()
    const label = screen.getByLabelText('基準案ラベル')
    for (const value of ['1', '12', '123', '1234', '12345']) {
      fireEvent.change(label, { target: { value } })
    }
    expect(setReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '現在案を基準案として固定' }))
    expect(setReview).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '基準案を破棄' }))
    expect(useAppStore.getState().review.baseline).not.toBeNull()
    expect(screen.getByTestId('review-compare')).toHaveTextContent('この操作は元に戻せません')
    fireEvent.click(screen.getByRole('button', { name: '基準案を破棄' }))
    expect(useAppStore.getState().review.baseline).toBeNull()
    expect(updateProject).not.toHaveBeenCalled()
    setReview.mockRestore()
    updateProject.mockRestore()
  })

  // phase 49 step 1 — 接合部が成立しない部材では接合部の検討項目を作れない。
  // 作れてしまうと validity が 対象なし を付け続け、その項目は永久に 再検討必要 で
  // 確認済 に到達しない(phase 48 の C1)。判定は domain/review/joint.ts が持つ。
  const unresolvableSelections = [
    {
      name: '大梁',
      project: () => createSampleProject(),
      memberId: '1F-G1-X1Y1-X',
      reason: '柱ではない',
    },
    {
      name: '円形柱',
      project: () => {
        const base = createSampleProject()
        return {
          ...base,
          sections: base.sections.map((section) => section.kind === '柱'
            ? { ...section, shape: '円形' as const }
            : section),
        }
      },
      memberId: '1F-X2Y1',
      reason: '円形柱',
    },
    {
      name: '取り付く大梁なし柱',
      project: () => {
        const base = createSampleProject()
        return { ...base, members: base.members.filter(({ kind }) => kind !== '大梁') }
      },
      memberId: '1F-X2Y1',
      reason: '取り付く大梁なし',
    },
  ]

  for (const { name, project, memberId, reason } of unresolvableSelections) {
    it(`refuses to create a joint review item for ${name} and shows the domain reason`, () => {
      useAppStore.setState({ project: project(), sel: { group: null, memberId } })
      render(<ReviewPane />)

      const add = screen.getByRole('button', { name: t('ja', 'review.items.add') })
      expect(add).toBeDisabled()

      const notice = screen.getByTestId('review-items-joint-unavailable')
      expect(notice).toHaveTextContent(t('ja', 'review.items.jointUnavailable'))
      expect(notice).toHaveTextContent(reason)

      fireEvent.click(add)
      expect(screen.queryByLabelText(t('ja', 'review.items.formTitle'))).toBeNull()
      expect(useAppStore.getState().review.items).toHaveLength(0)
    })
  }

  it('leaves the creation flow untouched on a column whose joint resolves', () => {
    render(<ReviewPane />)

    const add = screen.getByRole('button', { name: t('ja', 'review.items.add') })
    expect(add).toBeEnabled()
    expect(screen.queryByTestId('review-items-joint-unavailable')).toBeNull()

    fireEvent.click(add)
    fireEvent.change(screen.getByLabelText(t('ja', 'review.items.formTitle')), {
      target: { value: 'joint item' },
    })
    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', {
      name: t('ja', 'review.items.save'),
    }))

    const item = useAppStore.getState().review.items[0]
    if (!item) throw new Error('review item expected')
    expect(item.targets).toEqual([{ kind: 'joint', columnMemberId: '1F-X2Y1' }])
    const card = screen.getByTestId(item.id)
    expect(card.querySelector('[data-review-status]')?.getAttribute('data-review-status')).toBe('未確認')
  })

  // phase 49 step 2 — 前モデル再現の注意書きは 再検討必要 のときだけ出す。
  // 片側だけ書くと「常に描画」に変えても通ってしまうので、出る状態と出ない状態を
  // 両方固定する(phase 48 の C2 — この文言には参照が一つも無かった)。
  it('shows the stale replay notice only while the item needs re-review', () => {
    render(<ReviewPane />)

    fireEvent.click(screen.getByRole('button', { name: t('ja', 'review.items.add') }))
    fireEvent.change(screen.getByLabelText(t('ja', 'review.items.formTitle')), {
      target: { value: 'stale notice' },
    })
    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', {
      name: t('ja', 'review.items.save'),
    }))

    const item = useAppStore.getState().review.items[0]
    if (!item) throw new Error('review item expected')
    const notice = t('ja', 'review.items.staleNotice')

    const currentModel = () => ({
      project: useAppStore.getState().project,
      fingerprints: currentFingerprints(),
      impact: null,
    })
    expect(itemValidity(item, currentModel()).state).toBe('有効')
    expect(within(screen.getByTestId(item.id)).queryByText(notice)).toBeNull()

    act(() => useAppStore.getState().updateProject((project) => ({
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1'
        ? { ...section, b: 900 }
        : section),
    })))

    expect(itemValidity(useAppStore.getState().review.items[0]!, currentModel()).state)
      .toBe('再検討必要')
    expect(within(screen.getByTestId(item.id)).getByText(notice)).toBeInTheDocument()
  })

  // phase 49 追補 — 所見から作る項目は、その所見を出した検査の接合部を指す。
  // 以前は sel.memberId が優先されたので、検査後に別の柱を選んでから
  // 「検討項目にする」を押すと、B の接合部の所見を A の接合部に結びつけた項目が
  // できていた(独立検証の指摘2)。
  it('targets the checked joint, not the current selection, when an item comes from a finding', () => {
    render(<ReviewPane />)

    fireEvent.click(screen.getByRole('button', { name: t('ja', 'review.check.execute') }))
    act(() => useAppStore.getState().selectMember('1F-X1Y2'))
    fireEvent.click(
      within(screen.getByTestId('review-findings')).getAllByRole('button', {
        name: t('ja', 'review.check.createItem'),
      })[0],
    )
    fireEvent.change(screen.getByLabelText(t('ja', 'review.items.formTitle')), {
      target: { value: 'from finding' },
    })
    fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', {
      name: t('ja', 'review.items.save'),
    }))

    const item = useAppStore.getState().review.items[0]
    if (!item) throw new Error('review item expected')
    expect(item.targets[0]).toEqual({ kind: 'joint', columnMemberId: '1F-X2Y1' })
    // 検査を実行して 698 件の所見表を描き、そのうえで項目を作り直す分だけ重い。
    // 単独では 3 秒弱だが全体実行の並列下で既定の 5 秒を超える。
  }, 20000)

  describe('Finding Filter', () => {
    it('renders default filter bar with all kinds selected, reset disabled via aria-disabled, and full row count', () => {
      const expected = directGeometryCheck()
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      const filterBar = screen.getByTestId('review-findings-filter')
      const findingsTable = screen.getByTestId('review-findings')

      // Verify filter bar renders above review-findings table
      expect(filterBar.compareDocumentPosition(findingsTable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      // Verify kind chips have aria-pressed="true"
      const chipInterference = screen.getByRole('button', { name: '干渉候補' })
      const chipClearance = screen.getByRole('button', { name: 'あき不足候補' })
      const chipContact = screen.getByRole('button', { name: '接触' })
      expect(chipInterference).toHaveAttribute('aria-pressed', 'true')
      expect(chipClearance).toHaveAttribute('aria-pressed', 'true')
      expect(chipContact).toHaveAttribute('aria-pressed', 'true')

      // Verify table row count equals directGeometryCheck().findings.length (dynamic oracle)
      const rows = findingsTable.querySelectorAll('tbody tr')
      expect(rows).toHaveLength(expected.findings.length)

      // Verify hideExcluded checkbox defaults to unchecked
      const hideExcludedCheckbox = screen.getByLabelText('除外された指摘を非表示') as HTMLInputElement
      expect(hideExcludedCheckbox.checked).toBe(false)

      // Verify reset button has aria-disabled="true" and disabled === false
      const resetButton = screen.getByRole('button', { name: 'フィルターを解除' }) as HTMLButtonElement
      expect(resetButton).toHaveAttribute('aria-disabled', 'true')
      expect(resetButton.disabled).toBe(false)
      expect(resetButton).not.toBeDisabled()
    }, 20000)

    it('handles focus-safe reset button activation and chips interaction', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      const resetButton = screen.getByRole('button', { name: 'フィルターを解除' }) as HTMLButtonElement
      const chipClearance = screen.getByRole('button', { name: 'あき不足候補' })

      // Initial state: reset button has aria-disabled="true"
      expect(resetButton).toHaveAttribute('aria-disabled', 'true')

      // Click 'あき不足候補' chip -> aria-pressed becomes "false". Row count unchanged.
      fireEvent.click(chipClearance)
      expect(chipClearance).toHaveAttribute('aria-pressed', 'false')

      // Verify reset button becomes aria-disabled="false" (structural check M1 succeeds)
      expect(resetButton).toHaveAttribute('aria-disabled', 'false')

      // Keyboard activate reset button: focus it, verify activeElement, fireEvent.click
      resetButton.focus()
      expect(document.activeElement).toBe(resetButton)

      fireEvent.click(resetButton)

      // After reset: aria-disabled is "true", disabled is false, activeElement preserved, chip re-selected
      expect(resetButton).toHaveAttribute('aria-disabled', 'true')
      expect(resetButton.disabled).toBe(false)
      expect(resetButton).not.toBeDisabled()
      expect(document.activeElement).toBe(resetButton)
      expect(chipClearance).toHaveAttribute('aria-pressed', 'true')

      // Verify clicking reset button while aria-disabled="true" is a no-op
      fireEvent.click(resetButton)
      expect(resetButton).toHaveAttribute('aria-disabled', 'true')
    }, 20000)

    it('resets filter state and clears 3D focus when check is re-run with changed clearance', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      const select = screen.getByLabelText('部材・役割ペア') as HTMLSelectElement
      expect(select.options.length).toBeGreaterThan(1)
      const firstNonAllPair = select.options[1].value
      expect(firstNonAllPair).not.toBe('all')

      fireEvent.change(select, { target: { value: firstNonAllPair } })
      expect(select.value).toBe(firstNonAllPair)

      // Click a finding row to focus it
      const findingsTable = screen.getByTestId('review-findings')
      const firstRow = findingsTable.querySelector('tbody tr') as HTMLElement
      fireEvent.click(firstRow)
      expect(useAppStore.getState().reviewFocus).not.toBeNull()

      // Enter a clearance basis (26mm) and click 検査を実行 (producing new checkId)
      const clearanceInput = screen.getByLabelText('鉄筋のあき（利用者入力）')
      fireEvent.change(clearanceInput, { target: { value: '26' } })
      fireEvent.blur(clearanceInput)

      const expected = directGeometryCheck()
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Falsifying assertion for R2-B2: reviewFocus is cleared when checkId changes
      expect(useAppStore.getState().reviewFocus).toBeNull()

      // Invariance / state reset assertions: select reset to 'all'
      const newSelect = screen.getByLabelText('部材・役割ペア') as HTMLSelectElement
      expect(newSelect.value).toBe('all')

      // Table renders all findings from the new check
      const newFindings = screen.getByTestId('review-findings')
      expect(newFindings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)
    }, 20000)

    it('renders empty notice outside table without role="status" and updates polite live region', () => {
      const expected = directGeometryCheck()
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      const chipInterference = screen.getByRole('button', { name: '干渉候補' })
      const chipClearance = screen.getByRole('button', { name: 'あき不足候補' })
      const chipContact = screen.getByRole('button', { name: '接触' })

      // Deselect all three kind chips
      fireEvent.click(chipInterference)
      fireEvent.click(chipClearance)
      fireEvent.click(chipContact)

      // Verify tbody tr has length 0
      const findingsTable = screen.getByTestId('review-findings')
      expect(findingsTable.querySelectorAll('tbody tr')).toHaveLength(0)

      // Verify empty notice displays without role="status"
      const emptyNotice = screen.getByTestId('review-findings-empty')
      expect(emptyNotice).toHaveTextContent('該当する指摘はありません')
      expect(emptyNotice).not.toHaveAttribute('role')

      // Verify count summary polite live region displays 0 / total件
      const liveRegion = screen.getByRole('status')
      expect(liveRegion).toHaveTextContent(`0 / ${expected.findings.length}件`)

      // Re-select a chip -> empty notice is removed and matching rows render
      fireEvent.click(chipInterference)
      expect(screen.queryByTestId('review-findings-empty')).toBeNull()
      expect(findingsTable.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    }, 20000)

    it('maintains single live region for filter summary and no live region on empty notice', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Count summary is the sole live region with role="status"
      const statuses = screen.getAllByRole('status')
      expect(statuses).toHaveLength(1)
      expect(statuses[0]).toHaveAttribute('aria-live', 'polite')

      // Deselect all chips to trigger empty notice
      fireEvent.click(screen.getByRole('button', { name: '干渉候補' }))
      fireEvent.click(screen.getByRole('button', { name: 'あき不足候補' }))
      fireEvent.click(screen.getByRole('button', { name: '接触' }))

      const emptyNotice = screen.getByTestId('review-findings-empty')
      expect(emptyNotice).not.toHaveAttribute('role')
      expect(screen.getAllByRole('status')).toHaveLength(1)
    }, 20000)

    it('clears reviewFocus when focused row is hidden by filter within the same check', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Click first row (干渉候補)
      const findingsTable = screen.getByTestId('review-findings')
      const firstRow = findingsTable.querySelector('tbody tr') as HTMLElement
      expect(firstRow).toHaveTextContent('干渉候補')
      fireEvent.click(firstRow)

      expect(useAppStore.getState().reviewFocus).not.toBeNull()
      expect(useAppStore.getState().viewerMode).toBe('joint')

      // Deselect 干渉候補 chip -> reviewFocus becomes null
      fireEvent.click(screen.getByRole('button', { name: '干渉候補' }))
      expect(useAppStore.getState().reviewFocus).toBeNull()

      // Re-test with still-visible finding:
      // Re-select 干渉候補 chip
      fireEvent.click(screen.getByRole('button', { name: '干渉候補' }))

      // Click a 接触 row to focus it
      const allRows = findingsTable.querySelectorAll('tbody tr')
      const contactRow = Array.from(allRows).find((row) => row.textContent?.includes('接触')) as HTMLElement
      expect(contactRow).toBeTruthy()
      fireEvent.click(contactRow)
      expect(useAppStore.getState().reviewFocus).not.toBeNull()

      // Deselect 干渉候補 chip -> verify reviewFocus remains set because 接触 finding is still visible
      fireEvent.click(screen.getByRole('button', { name: '干渉候補' }))
      expect(useAppStore.getState().reviewFocus).not.toBeNull()
    }, 20000)

    it('targets the correct finding and item id on row actions under an active filter', () => {
      const expected = directGeometryCheck()
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Hide 干渉候補 -> only 接触 rows remain
      fireEvent.click(screen.getByRole('button', { name: '干渉候補' }))

      const findingsTable = screen.getByTestId('review-findings')
      const visibleRows = findingsTable.querySelectorAll('tbody tr')
      const expectedContactFindings = expected.findings.filter((f) => f.kind === '接触')
      expect(visibleRows).toHaveLength(expectedContactFindings.length)

      // (a) Click first visible row: assert reviewFocus.point matches the midpoint of first 接触 finding
      const firstVisibleRow = visibleRows[0] as HTMLElement
      expect(firstVisibleRow).toHaveTextContent('接触')
      fireEvent.click(firstVisibleRow)

      const focus = useAppStore.getState().reviewFocus
      const firstContactFinding = expectedContactFindings[0]
      expect(focus?.point[0]).toBeCloseTo(firstContactFinding.midpoint[0])
      expect(focus?.point[1]).toBeCloseTo(firstContactFinding.midpoint[1])
      expect(focus?.point[2]).toBeCloseTo(firstContactFinding.midpoint[2])

      // (b) Click 検討項目にする on that first visible row: save item, assert review.items[0].finding.id matches
      const createButton = within(firstVisibleRow).getByRole('button', { name: '検討項目にする' })
      fireEvent.click(createButton)

      fireEvent.change(screen.getByLabelText('タイトル'), {
        target: { value: 'filtered item' },
      })
      fireEvent.click(within(screen.getByTestId('review-items')).getByRole('button', { name: '保存' }))

      const savedItem = useAppStore.getState().review.items[0]
      expect(savedItem).toBeTruthy()
      expect(savedItem?.finding?.findingId).toBe(firstContactFinding.id)
    }, 20000)

    it('displays default exclusions by default and hides them when hideExcluded is checked', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '既定の除外を追加' }))
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      const findingsTable = screen.getByTestId('review-findings')
      const rowsWithExcluded = findingsTable.querySelectorAll('tbody tr')
      expect(findingsTable).toHaveTextContent('除外:')
      const initialRowCount = rowsWithExcluded.length

      // Check hideExcluded checkbox -> verify excluded rows are hidden
      const hideExcludedCheckbox = screen.getByLabelText('除外された指摘を非表示')
      fireEvent.click(hideExcludedCheckbox)

      const filteredRows = findingsTable.querySelectorAll('tbody tr')
      expect(filteredRows.length).toBeLessThan(initialRowCount)
      expect(findingsTable).not.toHaveTextContent('除外:')
    }, 20000)

    it('persists filter selections when check is re-run with identical inputs', () => {
      render(<ReviewPane />)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Deselect あき不足候補 and 接触 -> only 干渉候補 selected
      const chipClearance = screen.getByRole('button', { name: 'あき不足候補' })
      const chipContact = screen.getByRole('button', { name: '接触' })
      fireEvent.click(chipClearance)
      fireEvent.click(chipContact)

      expect(chipClearance).toHaveAttribute('aria-pressed', 'false')
      expect(chipContact).toHaveAttribute('aria-pressed', 'false')

      // Click 検査を実行 again with identical inputs (checkId unchanged)
      fireEvent.click(screen.getByRole('button', { name: '検査を実行' }))

      // Verify filter state persisted
      expect(chipClearance).toHaveAttribute('aria-pressed', 'false')
      expect(chipContact).toHaveAttribute('aria-pressed', 'false')
      const findingsTable = screen.getByTestId('review-findings')
      expect(findingsTable).not.toHaveTextContent('接触')
    }, 20000)
  })
})
