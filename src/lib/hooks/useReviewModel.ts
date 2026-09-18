'use client'

import { useMemo } from 'react'

import type { Project } from '@/domain/model/project'
import { assessImpact, type TakeoffSnapshot } from '@/domain/review/impact'
import {
  checkConditionsFingerprint,
  projectFingerprints,
} from '@/domain/review/fingerprint'
import type { CurrentModel } from '@/domain/review/validity'
import type { ReviewFingerprints } from '@/domain/review/types'
import { GEOMETRY_CHECK_VERSION } from '@/lib/review/geometry-check'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

import { buildTakeoff, useTakeoff, type TakeoffResult } from './useTakeoff'

export function toSnapshot(
  project: Project,
  takeoff: TakeoffResult,
  fingerprints: ReviewFingerprints,
): TakeoffSnapshot {
  return {
    project,
    rebars: takeoff.rebars,
    lines: takeoff.lines,
    unsupportedMemberIds: new Set(
      takeoff.unsupportedMembers.map(({ memberId }) => memberId),
    ),
    fingerprints,
  }
}

export function useReviewModel(): {
  current: CurrentModel
  currentSnapshot: TakeoffSnapshot
  baselineSnapshot: TakeoffSnapshot | null
} {
  const project = useAppStore(({ project }) => project)
  const review = useAppStore(({ review }) => review)
  const takeoff = useTakeoff()
  const checkConditions = useMemo(
    () => checkConditionsFingerprint(review.settings, review.exclusions),
    [review.settings, review.exclusions],
  )
  const unsupportedMemberIds = useMemo(
    () => new Set(takeoff.unsupportedMembers.map(({ memberId }) => memberId)),
    [takeoff],
  )
  const currentFingerprints = useMemo(
    () => projectFingerprints(
      project,
      takeoff.rebars,
      unsupportedMemberIds,
      jpMlitRulePack,
      GEOMETRY_CHECK_VERSION,
      checkConditions,
    ),
    [project, takeoff, unsupportedMemberIds, checkConditions],
  )
  const currentSnapshot = useMemo(
    () => toSnapshot(project, takeoff, currentFingerprints),
    [project, takeoff, currentFingerprints],
  )
  const baselineSnapshot = useMemo(() => {
    const baseline = review.baseline
    return baseline === null
      ? null
      : toSnapshot(
          baseline.project,
          buildTakeoff(baseline.project),
          baseline.fingerprints,
        )
  }, [review.baseline])
  const impact = useMemo(
    () => baselineSnapshot === null
      ? null
      : assessImpact(baselineSnapshot, currentSnapshot),
    [baselineSnapshot, currentSnapshot],
  )
  const current = useMemo(
    () => ({ project, fingerprints: currentFingerprints, impact }),
    [project, currentFingerprints, impact],
  )

  return { current, currentSnapshot, baselineSnapshot }
}
