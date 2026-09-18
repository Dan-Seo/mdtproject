import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSampleProject } from '@/domain/model/sample-project'
import { projectFingerprints } from '@/domain/review/fingerprint'
import { assessImpact } from '@/domain/review/impact'
import { emptyReviewState } from '@/domain/review/state'
import { GEOMETRY_CHECK_VERSION } from '@/lib/review/geometry-check'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

import { toSnapshot, useReviewModel } from './useReviewModel'

describe('useReviewModel', () => {
  beforeEach(() => {
    useAppStore.setState({
      project: createSampleProject(),
      review: emptyReviewState(),
    })
  })

  it('builds snapshots with unsupported member ids and no baseline impact', () => {
    const project = createSampleProject()
    const takeoff = buildTakeoff(project)
    const fingerprints = projectFingerprints(
      project,
      takeoff.rebars,
      new Set(['missing-member']),
      jpMlitRulePack,
      GEOMETRY_CHECK_VERSION,
      null,
    )
    const snapshot = toSnapshot(
      project,
      {
        ...takeoff,
        unsupportedMembers: [
          {
            memberId: 'missing-member',
            mark: 'C1',
            storyName: '1階',
            reason: '寸法不成立',
          },
        ],
      },
      fingerprints,
    )
    expect(snapshot.unsupportedMemberIds).toEqual(new Set(['missing-member']))

    const { result } = renderHook(() => useReviewModel())
    expect(result.current.current.impact).toBeNull()
  })

  it('uses stored baseline fingerprints and assesses the same impact as the core', () => {
    const project = createSampleProject()
    const takeoff = buildTakeoff(project)
    const currentFingerprints = projectFingerprints(
      project,
      takeoff.rebars,
      new Set(takeoff.unsupportedMembers.map(({ memberId }) => memberId)),
      jpMlitRulePack,
      GEOMETRY_CHECK_VERSION,
      null,
    )
    const stored = { ...currentFingerprints, rulepack: 'stored-baseline-rulepack' }
    useAppStore.setState({
      review: {
        ...emptyReviewState(),
        baseline: {
          label: '기준선',
          capturedAt: '2026-09-17T10:00:00+09:00',
          project,
          fingerprints: stored,
        },
      },
    })

    const { result } = renderHook(() => useReviewModel())
    const expected = assessImpact(
      toSnapshot(project, takeoff, stored),
      result.current.currentSnapshot,
    )
    expect(result.current.baselineSnapshot?.fingerprints).toBe(stored)
    expect(result.current.current.impact?.members).toEqual(expected.members)
    expect(result.current.current.impact?.rulepackChanged).toBe(true)
  })

  it('changes the current check-condition fingerprint when clearance changes', () => {
    const { result } = renderHook(() => useReviewModel())
    const before = result.current.current.fingerprints.checkConditions

    act(() => {
      useAppStore.getState().setReview((review) => ({
        ...review,
        settings: {
          ...review.settings,
          clearance: {
            valueMm: 30,
            source: '利用者入力',
            scope: 'same-story',
            enteredAt: '2026-09-17T10:00:00+09:00',
            note: '',
          },
        },
      }))
    })

    expect(result.current.current.fingerprints.checkConditions).not.toBe(before)
  })
})
