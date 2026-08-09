'use client'

import { useMemo } from 'react'

import type { Rebar } from '@/domain/model/rebar'
import {
  beamDepthAbove,
  findSection,
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

export function useTakeoff(): TakeoffResult {
  const project = useAppStore(({ project }) => project)

  return useMemo(() => {
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
  }, [project])
}
