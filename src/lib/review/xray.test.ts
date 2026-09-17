import { describe, expect, it } from 'vitest'

import { memberGroupKey } from '@/domain/model/project'
import { createSampleProject } from '@/domain/model/sample-project'
import { quantityLineId, spliceLineId } from '@/domain/quantity'
import type { Rebar } from '@/domain/model/rebar'
import { sourceLabel } from '@/lib/rule-source'
import { buildTakeoff } from '@/lib/hooks/useTakeoff'

import {
  rebarsUsingRule,
  xrayForRebar,
  xrayForRow,
} from './xray'

function sample() {
  const project = createSampleProject()
  const takeoff = buildTakeoff(project)
  return { project, ...takeoff }
}

function drawnShape(view: ReturnType<typeof xrayForRebar>) {
  if (!view.shape.drawn) throw new Error('drawn shape expected')
  return view.shape
}

function distance(from: Rebar['points'][number], to: Rebar['points'][number]) {
  return Math.hypot(
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  )
}

describe('calculation x-ray', () => {
  it('keeps design quantity separate from drawn shape and exposes both quantity rows', () => {
    const { project, rebars, lines } = sample()
    const rebar = rebars.find(
      ({ memberId, role }) => memberId === '1F-X1Y1' && role === '主筋',
    )
    if (!rebar) throw new Error('sample column main rebar expected')

    const view = xrayForRebar(rebar, project, lines)
    const shape = drawnShape(view)
    const member = project.members.find(({ id }) => id === rebar.memberId)
    if (!member) throw new Error('sample member expected')
    const groupId = memberGroupKey(project, member)

    expect(view.quantity.designLengthMm).toBe(rebar.length)
    expect(view.quantity.designCount).toBe(rebar.count)
    expect(shape.drawnLengthMm).not.toBe(rebar.length)
    expect(shape.differsFromDesign.length).toBe(true)
    expect(view.quantity.lineIds.mass).toBe(quantityLineId(groupId, rebar))
    expect(view.quantity.lineIds.splice).toBe(spliceLineId(groupId, rebar))
    expect(lines.find(({ id }) => id === view.quantity.lineIds.splice)?.unit).toBe(
      '箇所',
    )
    expect(view.quantity.places).not.toBeNull()
    expect(view.quantity.spliceCountPerBar).toBe(rebar.splice?.countPerBar ?? null)
    expect(view.formula).toBe(rebar.formula)
  })

  it('includes closed edges and hook tails only in drawn length', () => {
    const { project, rebars, lines } = sample()
    const rebar = rebars.find(({ role }) => role === '帯筋')
    if (!rebar || !rebar.hookTails) throw new Error('sample hoop with hooks expected')

    const withShape = drawnShape(xrayForRebar(rebar, project, lines))
    const withoutTails = drawnShape(
      xrayForRebar({ ...rebar, hookTails: undefined }, project, lines),
    )
    const tailLength = rebar.hookTails.reduce(
      (total, tail) => total + distance(rebar.points[0], tail),
      0,
    )
    expect(withShape.drawnLengthMm - withoutTails.drawnLengthMm).toBeCloseTo(
      tailLength,
      8,
    )

    const withoutClosingEdge = drawnShape(
      xrayForRebar(
        { ...rebar, closed: false, hookTails: undefined },
        project,
        lines,
      ),
    )
    const closingEdge = distance(
      rebar.points[rebar.points.length - 1],
      rebar.points[0],
    )
    expect(withoutTails.drawnLengthMm - withoutClosingEdge.drawnLengthMm).toBeCloseTo(
      closingEdge,
      8,
    )
  })

  it('reports initial-offset placement drift and resolves either quantity row', () => {
    const { project, rebars, lines } = sample()
    const rebar = rebars.find(({ role }) => role === '帯筋')
    if (!rebar) throw new Error('sample hoop expected')
    const member = project.members.find(({ id }) => id === rebar.memberId)
    if (!member) throw new Error('sample member expected')
    const groupId = memberGroupKey(project, member)
    const view = xrayForRebar(rebar, project, lines)
    const shape = drawnShape(view)

    expect(view.quantity.designCount).toBe(rebar.count)
    expect(shape.placedCount).toBe(rebar.placement?.positionCount)
    expect(shape.placedCount).not.toBe(view.quantity.designCount)
    expect(shape.differsFromDesign.count).toBe(true)
    expect(shape.positionCount).toBe(rebar.placement?.positionCount ?? null)

    const massId = quantityLineId(groupId, rebar)
    const spliceId = rebar.splice ? spliceLineId(groupId, rebar) : null
    expect(xrayForRow(massId, rebars, project, lines).map(({ rebar: item }) => item.id)).toContain(rebar.id)
    if (spliceId) {
      expect(xrayForRow(spliceId, rebars, project, lines).map(({ rebar: item }) => item.id)).toContain(rebar.id)
    }
  })

  it('uses exact rule identity and labels rules from rule-source', () => {
    const { project, rebars, lines } = sample()
    const rebar = rebars.find(
      ({ memberId, role }) => memberId === '1F-X1Y1' && role === '主筋',
    )
    if (!rebar) throw new Error('sample column main rebar expected')
    const anchorage = rebar.ruleHits.find(({ key }) => key === 'anchorage.L1')
    if (!anchorage) throw new Error('sample anchorage rule expected')

    const view = xrayForRebar(rebar, project, lines)
    const zone = view.zones.find(({ ruleKey }) => ruleKey === anchorage.key)
    if (!zone) throw new Error('sample anchorage zone expected')
    const ruleUse = view.rules.find(({ rule }) => rule === zone.rule)
    expect(ruleUse?.usedFor).toContain('定着')
    expect(ruleUse?.sourceLabel).toBe(sourceLabel(zone.rule))

    const differentConditions: Rebar = {
      ...rebar,
      id: `${rebar.id}-different-condition`,
      ruleHits: rebar.ruleHits.map((rule) =>
        rule === anchorage
          ? {
              ...rule,
              conditions: {
                ...rule.conditions,
                fc: rule.conditions.fc === 24 ? 27 : 24,
              },
            }
          : rule,
      ),
    }
    expect(rebarsUsingRule(anchorage, [rebar, differentConditions])).toEqual([
      rebar,
    ])
  })

  it('rejects a zone whose rule is not present in ruleHits', () => {
    const { project, rebars, lines } = sample()
    const base = rebars.find(({ role }) => role === '主筋')
    const zone = base?.zones?.[0]
    if (!base || !zone) throw new Error('sample zoned rebar expected')
    const missingRule: Rebar = {
      ...base,
      ruleHits: base.ruleHits.filter(({ key }) => key !== zone.ruleKey),
    }

    expect(() => xrayForRebar(missingRule, project, lines)).toThrow(
      `Zone rule not found: ${zone.ruleKey}`,
    )
  })

  it('returns quantity for roles without a 3D shape', () => {
    const { project, rebars } = sample()
    const base = rebars.find(({ role }) => role === '主筋')
    if (!base) throw new Error('sample rebar expected')
    const openingReinforcement: Rebar = {
      ...base,
      id: `${base.id}-opening-reinforcement`,
      role: '開口補強筋',
      points: [[0, 0, 0], [100, 0, 0]],
      closed: false,
      hookTails: undefined,
      length: 1234,
      count: 2,
      placement: undefined,
      splice: undefined,
      zones: [],
    }

    const view = xrayForRebar(openingReinforcement, project, [])
    expect(view.shape).toMatchObject({ drawn: false })
    if (view.shape.drawn) throw new Error('opening reinforcement must be hidden')
    expect(view.shape.reason).toContain('開口補強筋')
    expect(view.quantity.designLengthMm).toBe(1234)
    expect(view.quantity.designCount).toBe(2)
  })
})
