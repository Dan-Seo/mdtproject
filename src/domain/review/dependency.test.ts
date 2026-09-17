import { describe, expect, it } from 'vitest'

import { createSampleProject } from '../model/sample-project'
import { findSection, girderRun } from '../model/project'
import { generateGirderRebar } from '../rebar/girder'
import { jpMlitRulePack } from '../../rulepack'
import { memberDependencies } from './dependency'

function girderRebars(project: ReturnType<typeof createSampleProject>, memberId: string) {
  const member = project.members.find(({ id }) => id === memberId)
  if (!member || member.kind !== '大梁') throw new Error(`大梁 not found: ${memberId}`)
  const section = findSection(project, member.sectionId)
  if (section.kind !== '大梁') throw new Error(`大梁 section not found: ${memberId}`)
  return generateGirderRebar({ run: girderRun(project, member), section }, jpMlitRulePack)
}

describe('review dependencies', () => {
  it('tracks girder supports and continuous run peers with read fields', () => {
    const project = createSampleProject()
    const x = memberDependencies(project, '1F-G1-X1Y1-X')
    expect(x.status).toBe('tracked')
    if (x.status === 'tracked') {
      expect(x.missing).toEqual([])
      expect(x.dependencies.filter(({ via }) => via === '支持柱')).toEqual([
        expect.objectContaining({ memberId: '1F-X1Y1', reads: { shape: '矩形', b: 800, d: 800 } }),
        expect.objectContaining({ memberId: '1F-X2Y1', reads: { shape: '矩形', b: 800, d: 800 } }),
      ])
    }

    const y = memberDependencies(project, '1F-G1-X1Y1-Y')
    expect(y.status).toBe('tracked')
    if (y.status === 'tracked') {
      expect(y.dependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({ memberId: '1F-G1-X1Y2-Y', via: '連続スパン' }),
        expect.objectContaining({ memberId: '1F-X1Y1', via: '支持柱' }),
        expect.objectContaining({ memberId: '1F-X1Y2', via: '支持柱' }),
        expect.objectContaining({ memberId: '1F-X1Y3', via: '支持柱' }),
      ]))
    }
  })

  it('tracks column upper beams and adjacent story columns, and labels walls/slabs untracked', () => {
    const project = createSampleProject()
    const column = memberDependencies(project, '1F-X2Y2')
    expect(column.status).toBe('tracked')
    if (column.status === 'tracked') {
      expect(column.dependencies.filter(({ via }) => via === '上部大梁')).toHaveLength(3)
      expect(column.dependencies).toContainEqual(expect.objectContaining({
        memberId: '2F-X2Y2',
        via: '上下階柱',
        reads: { exists: true },
      }))
    }

    expect(memberDependencies(project, '1F-W1-X1Y1-Y')).toEqual({
      status: 'untracked',
      reason: '依存経路未追跡（耐震壁・床板）',
    })
    expect(memberDependencies(project, '1F-S1-X1Y1')).toEqual({
      status: 'untracked',
      reason: '依存経路未追跡（耐震壁・床板）',
    })
  })

  it('reports missing supports without turning an unsupported member into a throw', () => {
    const project = createSampleProject()
    const missing = {
      ...project,
      members: project.members.filter(({ id }) => id !== '1F-X2Y1'),
    }
    const result = memberDependencies(missing, '1F-G1-X1Y1-X')
    expect(result.status).toBe('tracked')
    if (result.status === 'tracked') {
      expect(result.missing).toContainEqual({ via: '支持柱', detail: '終端 支持柱なし' })
    }
  })

  it('only fingerprints fields read by adjacent calculations', () => {
    const project = createSampleProject()
    const supportChanged = {
      ...project,
      sections: project.sections.map((section) =>
        section.id === 'section-C1' && section.kind === '柱'
          ? { ...section, b: section.b + 1 }
          : section,
      ),
    }
    const base = memberDependencies(project, '1F-G1-X1Y1-X')
    const changed = memberDependencies(supportChanged, '1F-G1-X1Y1-X')
    expect(base).not.toEqual(changed)

    const mainOnly = {
      ...project,
      sections: project.sections.map((section) =>
        section.id === 'section-C1' && section.kind === '柱'
          ? { ...section, main: { ...section.main, count: section.main.count + 1 } }
          : section,
      ),
    }
    expect(memberDependencies(project, '1F-G1-X1Y1-X')).toEqual(
      memberDependencies(mainOnly, '1F-G1-X1Y1-X'),
    )
    const beamId = '1F-G1-X1Y1-X'
    expect(girderRebars(project, beamId)).toEqual(girderRebars(mainOnly, beamId))
  })
})
