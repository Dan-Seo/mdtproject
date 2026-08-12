'use client'

import { useMemo } from 'react'

import type { Rebar } from '@/domain/model/rebar'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  girderSpan,
  girderSupport,
  type Project,
} from '@/domain/model/project'
import {
  MemberUnsupportedError,
  type UnsupportedReason,
} from '@/domain/model/unsupported'
import {
  aggregateQuantity,
  hasInferred as getHasInferred,
  inferredRules as getInferredRules,
  type QuantityLine,
} from '@/domain/quantity'
import { generateColumnRebar } from '@/domain/rebar/column'
import { generateGirderRebar } from '@/domain/rebar/girder'
import type { RuleHit } from '@/domain/rules/types'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

export interface TakeoffResult {
  rebars: Rebar[]
  lines: QuantityLine[]
  hasInferred: boolean
  inferredRules: RuleHit[]
  unsupportedMembers: UnsupportedMember[]
}

export interface UnsupportedMember {
  memberId: string
  mark: string
  storyName: string
  reason: UnsupportedReason
}

/**
 * `Project`는 갱신될 때마다 통째로 교체되므로 참조가 곧 버전이다. 직전 결과 하나만
 * 들고 있으면 같은 버전을 보는 모든 소비자(TakeoffPane·TakeoffActions·Viewer3D)가
 * 한 번의 계산을 나눠 쓴다. `useMemo`만으로는 컴포넌트마다 따로 계산한다.
 */
let lastComputed: { project: Project; result: TakeoffResult } | null = null

function computeTakeoff(project: Project): TakeoffResult {
  if (lastComputed !== null && lastComputed.project === project) {
    return lastComputed.result
  }

  const result = buildTakeoff(project)
  lastComputed = { project, result }
  return result
}

export function useTakeoff(): TakeoffResult {
  const project = useAppStore(({ project }) => project)

  return useMemo(() => computeTakeoff(project), [project])
}

function buildTakeoff(project: Project): TakeoffResult {
  const rebars: Rebar[] = []
  const unsupportedMembers: UnsupportedMember[] = []

  for (const member of project.members) {
    const section = findSection(project, member.sectionId)
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) {
      throw new Error(`Story not found: ${member.storyId}`)
    }

    if (member.kind === '柱') {
      if (section.kind !== '柱') {
        throw new Error(`柱 member references a non-柱 section: ${member.id}`)
      }

      rebars.push(
        ...generateColumnRebar(
          {
            member,
            section,
            story,
            beamDepthAbove: beamDepthAbove(project, member),
            ends: columnEnds(project, member),
          },
          jpMlitRulePack,
        ),
      )
      continue
    }

    if (section.kind !== '大梁') {
      throw new Error(`大梁 member references a non-大梁 section: ${member.id}`)
    }

    const support = girderSupport(project, member)
    if (!support.supported) {
      unsupportedMembers.push({
        memberId: member.id,
        mark: section.mark,
        storyName: story.name,
        reason: support.reason,
      })
      continue
    }

    // 성립 불가 형상(定着·寸法)은 그 부재만 빼고 나머지 산정을 계속한다.
    // MemberUnsupportedError만 잡는다 — 룰팩 공백 같은 결함은 그대로 터진다.
    try {
      rebars.push(
        ...generateGirderRebar(
          { member, section, span: girderSpan(project, member) },
          jpMlitRulePack,
        ),
      )
    } catch (error) {
      if (!(error instanceof MemberUnsupportedError)) throw error

      unsupportedMembers.push({
        memberId: member.id,
        mark: section.mark,
        storyName: story.name,
        reason: error.reason,
      })
    }
  }

  const lines = aggregateQuantity(project, rebars, jpMlitRulePack)

  return {
    rebars,
    lines,
    hasInferred: getHasInferred(lines),
    inferredRules: getInferredRules(lines),
    unsupportedMembers,
  }
}
