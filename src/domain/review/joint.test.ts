import { describe, expect, it } from 'vitest'

import { createSampleProject } from '../model/sample-project'
import { findSection, girderRun } from '../model/project'
import { generateGirderRebar } from '../rebar/girder'
import { jpMlitRulePack } from '../../rulepack'
import {
  jointMemberIds,
  jointRebarMemberIds,
  resolveJoint,
  supportColumnIds,
} from './joint'

const COLUMN = '\u67f1'
const GIRDER = '\u5927\u6881'

describe('joint review model', () => {
  it('resolves sample joints by story, grid position, and girder end', () => {
    const project = createSampleProject()

    const first = resolveJoint(project, '1F-X1Y1')
    expect(first.status).toBe('joint')
    if (first.status === 'joint') {
      expect(first.joint.girders.map(({ member, end }) => [member.id, end])).toEqual([
        ['1F-G1-X1Y1-X', '\u59cb\u7aef'],
        ['1F-G1-X1Y1-Y', '\u59cb\u7aef'],
      ])
    }

    const corner = resolveJoint(project, '1F-X2Y1')
    expect(corner.status).toBe('joint')
    if (corner.status === 'joint') {
      expect(corner.joint.girders.map(({ member, end }) => [member.id, end])).toEqual([
        ['1F-G1-X1Y1-X', '\u7d42\u7aef'],
        ['1F-G2-X2Y1-Y', '\u59cb\u7aef'],
      ])
    }

    const mixed = resolveJoint(project, '1F-X2Y2')
    expect(mixed.status).toBe('joint')
    if (mixed.status === 'joint') {
      expect(mixed.joint.girders).toHaveLength(3)
      expect(mixed.joint.girders.map(({ end }) => end)).toEqual([
        '\u7d42\u7aef',
        '\u7d42\u7aef',
        '\u59cb\u7aef',
      ])
      expect(mixed.joint.reference.memberIds).not.toContain('1F-G2-X2Y1-Y')
    }
  })

  it('keeps upper/lower column references and run-owner rebars in the joint scope', () => {
    const project = createSampleProject()
    const upper = resolveJoint(project, '2F-X1Y1')
    expect(upper.status).toBe('joint')
    if (upper.status === 'joint') {
      expect(upper.joint.reference.memberIds).toContain('1F-X1Y1')
    }

    const end = resolveJoint(project, '1F-X1Y3')
    expect(end.status).toBe('joint')
    if (end.status === 'joint') {
      const owner = '1F-G1-X1Y1-Y'
      expect(end.joint.reference.memberIds).toContain(owner)
      expect(jointRebarMemberIds(project, end.joint)).toContain(owner)
      expect(jointMemberIds(end.joint)).toContain('1F-X1Y3')
      const ownerMember = project.members.find(({ id }) => id === owner)!
      const ownerSection = findSection(project, ownerMember.sectionId)
      if (ownerMember.kind !== GIRDER || ownerSection.kind !== GIRDER) throw new Error('大梁 fixture expected')
      const rebars = generateGirderRebar({ run: girderRun(project, ownerMember), section: ownerSection }, jpMlitRulePack)
      expect(rebars.some(({ memberId, role }) => memberId === owner && role === '\u4e0a\u7aef\u7b4b')).toBe(true)
    }
  })

  it('resolves support column ids and explicit unsupported cases', () => {
    const project = createSampleProject()
    expect(supportColumnIds(project, '1F-G1-X1Y1-X')).toEqual({
      start: '1F-X1Y1',
      end: '1F-X2Y1',
    })

    expect(resolveJoint(project, '1F-G1-X1Y1-X')).toEqual({
      status: 'unsupported',
      reason: '\u67f1\u3067\u306f\u306a\u3044',
    })

    const circular = {
      ...project,
      sections: project.sections.map((section) =>
        section.id === 'section-C1' && section.kind === COLUMN
          ? { ...section, shape: '\u5186\u5f62' as const }
          : section,
      ),
    }
    expect(resolveJoint(circular, '1F-X1Y1')).toEqual({
      status: 'unsupported',
      reason: '\u5186\u5f62\u67f1',
    })

    const noGirders = {
      ...project,
      members: project.members.filter(
        (member) => !(member.kind === GIRDER && member.storyId === '1F'),
      ),
    }
    expect(resolveJoint(noGirders, '1F-X1Y1')).toEqual({
      status: 'unsupported',
      reason: '\u53d6\u308a\u4ed8\u304f\u5927\u6881\u306a\u3057',
    })
    expect(resolveJoint(project, 'missing')).toEqual({
      status: 'unsupported',
      reason: '\u90e8\u6750\u306a\u3057',
    })
  })
})
