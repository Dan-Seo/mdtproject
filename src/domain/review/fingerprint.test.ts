import { describe, expect, it } from 'vitest'

import { createSampleProject } from '../model/sample-project'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  girderRun,
} from '../model/project'
import { generateColumnRebar } from '../rebar/column'
import { generateGirderRebar } from '../rebar/girder'
import { jpMlitRulePack } from '../../rulepack'
import { memberDependencies } from './dependency'
import {
  canonicalJson,
  checkConditionsFingerprint,
  memberInputFingerprint,
  memberInputs,
  memberResultFingerprint,
  projectFingerprints,
  rulepackFingerprint,
} from './fingerprint'

function generatedGirderRebars(project: ReturnType<typeof createSampleProject>, memberId: string) {
  const member = project.members.find(({ id }) => id === memberId)
  if (!member || member.kind !== '大梁') throw new Error(`大梁 not found: ${memberId}`)
  const section = findSection(project, member.sectionId)
  if (section.kind !== '大梁') throw new Error(`大梁 section not found: ${memberId}`)
  return generateGirderRebar({ run: girderRun(project, member), section }, jpMlitRulePack)
}

function generatedColumnRebars(project: ReturnType<typeof createSampleProject>, memberId: string) {
  const member = project.members.find(({ id }) => id === memberId)
  if (!member || member.kind !== '柱') throw new Error(`柱 not found: ${memberId}`)
  const section = findSection(project, member.sectionId)
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (section.kind !== '柱' || !story) throw new Error(`柱 fixture not found: ${memberId}`)
  return generateColumnRebar({
    member,
    section,
    story,
    beamDepthAbove: beamDepthAbove(project, member),
    ends: columnEnds(project, member),
  }, jpMlitRulePack)
}

describe('review fingerprints', () => {
  it('canonicalizes object key order', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('changes only when rule identity or source values change', () => {
    const note = {
      ...jpMlitRulePack,
      entries: jpMlitRulePack.entries.map((entry, index) => index === 0 ? { ...entry, note: `${entry.note} changed` } : entry),
    }
    const source = {
      ...jpMlitRulePack,
      entries: jpMlitRulePack.entries.map((entry, index) => index === 0 ? { ...entry, source: { ...entry.source, url: 'changed' } } : entry),
    }
    const value = {
      ...jpMlitRulePack,
      entries: jpMlitRulePack.entries.map((entry, index) => index === 0 ? { ...entry, value: entry.value + 1 } : entry),
    }
    expect(rulepackFingerprint(note)).toBe(rulepackFingerprint(jpMlitRulePack))
    expect(rulepackFingerprint(source)).not.toBe(rulepackFingerprint(jpMlitRulePack))
    expect(rulepackFingerprint(value)).not.toBe(rulepackFingerprint(jpMlitRulePack))
  })

  it('excludes review metadata that does not affect check conditions', () => {
    const settings = {
      clearance: {
        valueMm: 30,
        source: '利用者入力' as const,
        scope: 'same-story' as const,
        enteredAt: 'a',
        note: 'a',
      },
    }
    const exclusions = [{
      id: 'x',
      scope: { sameMemberOnly: true, roles: ['主筋', '帯筋'] as [string, string], kinds: ['干渉候補'] as ['干渉候補'] },
      reason: 'a',
      createdAt: 'a',
    }]
    const changedSettings = { clearance: { ...settings.clearance, enteredAt: 'b', note: 'b' } }
    const changedExclusions = [{ ...exclusions[0], reason: 'b', createdAt: 'b' }]
    expect(checkConditionsFingerprint(settings, exclusions)).toBe(checkConditionsFingerprint(changedSettings, changedExclusions))
    expect(checkConditionsFingerprint({ clearance: { ...settings.clearance, valueMm: 31 } }, exclusions)).not.toBe(checkConditionsFingerprint(settings, exclusions))
    expect(checkConditionsFingerprint(settings, [{ ...exclusions[0], scope: { ...exclusions[0].scope, sameMemberOnly: false } }])).not.toBe(checkConditionsFingerprint(settings, exclusions))
  })

  it('includes only the member and read-field dependency inputs', () => {
    const project = createSampleProject()
    const changedColumn = {
      ...project,
      sections: [
        ...project.sections,
        ...project.sections
          .filter((section) => section.id === 'section-C1' && section.kind === '柱')
          .map((section) => {
            if (section.kind !== '柱') throw new Error('column section expected')
            return { ...section, id: 'section-C1-changed', b: section.b + 1 }
          }),
      ],
      members: project.members.map((member) => member.id === '1F-X1Y1' ? { ...member, sectionId: 'section-C1-changed' } : member),
    }
    expect(memberInputFingerprint(project, '1F-X1Y1')).not.toBe(memberInputFingerprint(changedColumn, '1F-X1Y1'))
    expect(memberInputFingerprint(project, '1F-G1-X1Y1-X')).not.toBe(memberInputFingerprint(changedColumn, '1F-G1-X1Y1-X'))
    expect(memberInputFingerprint(project, '1F-G2-X1Y2-X')).toBe(memberInputFingerprint(changedColumn, '1F-G2-X1Y2-X'))
    expect(memberInputFingerprint(project, '2F-X1Y1')).toBe(memberInputFingerprint(changedColumn, '2F-X1Y1'))

    const labelAndMeta = { ...project, name: 'changed', notes: { x: 'changed' }, unitMass: { D25: 9 }, grid: { ...project.grid, xLabels: ['A', 'B'] } }
    for (const member of project.members) {
      expect(memberInputFingerprint(project, member.id)).toBe(memberInputFingerprint(labelAndMeta, member.id))
    }

    const g2Pitch = {
      ...project,
      sections: project.sections.map((section) => section.id === 'section-G2' && section.kind === '大梁' ? { ...section, stirrup: { ...section.stirrup, pitch: section.stirrup.pitch + 1 } } : section),
    }
    expect(memberInputFingerprint(project, '1F-X2Y2')).toBe(memberInputFingerprint(g2Pitch, '1F-X2Y2'))
    const baseTakeoff = generatedGirderRebars(project, '1F-G2-X1Y2-X')
    const changedTakeoff = generatedGirderRebars(g2Pitch, '1F-G2-X1Y2-X')
    expect(memberResultFingerprint('1F-G2-X1Y2-X', baseTakeoff)).not.toBe(memberResultFingerprint('1F-G2-X1Y2-X', changedTakeoff))

    const hoopPitch = {
      ...project,
      sections: project.sections.map((section) => section.id === 'section-C1' && section.kind === '柱' ? { ...section, hoop: { ...section.hoop, pitch: section.hoop.pitch + 1 } } : section),
    }
    const baseColumnRebars = generatedColumnRebars(project, '1F-X1Y1')
    const changedColumnRebars = generatedColumnRebars(hoopPitch, '1F-X1Y1')
    const baseGirderRebars = generatedGirderRebars(project, '1F-G1-X1Y1-X')
    const changedGirderRebars = generatedGirderRebars(hoopPitch, '1F-G1-X1Y1-X')
    expect(memberResultFingerprint('1F-X1Y1', baseColumnRebars)).not.toBe(memberResultFingerprint('1F-X1Y1', changedColumnRebars))
    expect(memberResultFingerprint('1F-G1-X1Y1-X', baseGirderRebars)).toBe(memberResultFingerprint('1F-G1-X1Y1-X', changedGirderRebars))

    const brokenRun = {
      ...project,
      members: project.members.map((member) => member.id === '1F-G1-X1Y2-Y' ? { ...member, sectionId: 'section-G2' } : member),
    }
    expect(memberInputFingerprint(project, '1F-G1-X1Y1-Y')).not.toBe(memberInputFingerprint(brokenRun, '1F-G1-X1Y1-Y'))
    expect(memberInputs(project, '1F-G1-X1Y1-Y')).toEqual(expect.objectContaining({ dependencies: expect.any(Array) }))
    expect(memberDependencies(project, '1F-G1-X1Y1-Y').status).toBe('tracked')
  })

  it('returns null result fingerprints for unsupported members', () => {
    const project = createSampleProject()
    const fingerprints = projectFingerprints(project, [], new Set(['1F-X1Y1']), jpMlitRulePack, 1, null)
    expect(fingerprints.members['1F-X1Y1'].result).toBeNull()
    expect(fingerprints.members['1F-X1Y2'].result).not.toBeNull()
  })
})
