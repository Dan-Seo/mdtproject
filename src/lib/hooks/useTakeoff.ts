'use client'

import { useMemo } from 'react'

import type { Rebar } from '@/domain/model/rebar'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  type Project,
} from '@/domain/model/project'
import {
  aggregateQuantity,
  hasInferred as getHasInferred,
  inferredRules as getInferredRules,
  type QuantityLine,
} from '@/domain/quantity'
import { generateColumnRebar } from '@/domain/rebar/column'
import type { RuleHit } from '@/domain/rules/types'
import { useAppStore } from '@/lib/store'
import { jpMlitRulePack } from '@/rulepack'

export interface TakeoffResult {
  rebars: Rebar[]
  lines: QuantityLine[]
  hasInferred: boolean
  inferredRules: RuleHit[]
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
  const rebars = project.members.flatMap((member) => {
    if (member.kind !== '柱') return []

    const section = findSection(project, member.sectionId)
    if (section.kind !== '柱') {
      throw new Error(`柱 member references a non-柱 section: ${member.id}`)
    }

    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) {
      throw new Error(`Story not found: ${member.storyId}`)
    }

    return generateColumnRebar(
      {
        member,
        section,
        story,
        beamDepthAbove: beamDepthAbove(project, member),
        ends: columnEnds(project, member),
      },
      jpMlitRulePack,
    )
  })
  const lines = aggregateQuantity(project, rebars, jpMlitRulePack)

  return {
    rebars,
    lines,
    hasInferred: getHasInferred(lines),
    inferredRules: getInferredRules(lines),
  }
}
