import { describe, expect, it } from 'vitest'

import { assessImpact } from './impact'
import {
  cloneProject,
  reviewSnapshot,
  sampleProject,
} from '../../../tests/fixtures/review/snapshot'

function changeSectionB() {
  const project = cloneProject(sampleProject())
  project.sections = project.sections.map((section) =>
    section.id === 'section-C1' && section.kind === '柱'
      ? { ...section, b: 900 }
      : section,
  )
  return project
}

function changeG2Pitch() {
  const project = cloneProject(sampleProject())
  project.sections = project.sections.map((section) =>
    section.id === 'section-G2' && section.kind === '大梁'
      ? { ...section, stirrup: { ...section.stirrup, pitch: 200 } }
      : section,
  )
  return project
}

describe('review impact', () => {
  it('propagates a support-column shape change through the read field only', () => {
    const baseline = reviewSnapshot(sampleProject())
    const current = reviewSnapshot(changeSectionB())
    const report = assessImpact(baseline, current)
    const impacted = new Map(report.members.map((member) => [member.memberId, member]))

    expect(report.entities).toContainEqual(expect.objectContaining({
      kind: 'section',
      change: '変更',
      sectionId: 'section-C1',
      fields: expect.arrayContaining(['b']),
    }))
    expect(impacted.get('1F-X1Y1')?.categories).toContain('入力')
    expect(impacted.get('1F-G1-X1Y1-X')?.path.join(' ')).toContain('支持柱')
    expect(impacted.get('1F-G1-X1Y1-X')?.categories).toEqual(
      expect.arrayContaining(['入力', '形状', '数量']),
    )
    expect(impacted.get('1F-X1Y1')?.support).toEqual({ before: '対応', after: '対応' })
    expect(impacted.has('1F-S1-X1Y1')).toBe(false)
  })

  it('does not propagate a girder stirrup pitch change to columns or other girders', () => {
    const report = assessImpact(
      reviewSnapshot(sampleProject()),
      reviewSnapshot(changeG2Pitch()),
    )
    const impacted = new Set(report.members.map(({ memberId }) => memberId))

    expect(impacted).toContain('1F-G2-X1Y2-X')
    expect(impacted).not.toContain('1F-G1-X1Y1-X')
    expect(impacted).not.toContain('1F-X1Y1')
    expect(impacted).not.toContain('2F-X1Y1')
  })

  it('keeps display-only changes out of model and quantity impact', () => {
    const current = cloneProject(sampleProject())
    current.name = '案件名変更'
    current.notes = { 'line-1': '備考変更' }
    current.grid = {
      ...current.grid,
      xLabels: ['X1', 'X2'],
      yLabels: ['Y1', 'Y2', 'Y3'],
    }

    const report = assessImpact(reviewSnapshot(sampleProject()), reviewSnapshot(current))
    expect(report.members).toEqual([])
    expect(report.lines).toEqual([])
    expect(report.displayOnly).toHaveLength(3)
    expect(report.displayOnly.map((entry) => entry.kind)).toEqual([
      'displayOnly',
      'displayOnly',
      'displayOnly',
    ])
  })

  it('reports unit-mass null to calculated as a state transition, never zero', () => {
    const current = cloneProject(sampleProject())
    current.unitMass = { D13: 0.995 }
    const report = assessImpact(reviewSnapshot(sampleProject()), reviewSnapshot(current))
    const changedMass = report.lines.find((line) => line.mass?.beforeKg === null)

    expect(report.members).toEqual([])
    expect(report.entities).toContainEqual(expect.objectContaining({
      kind: 'unitMass',
      sizes: ['D13'],
    }))
    expect(changedMass?.mass).toEqual(expect.objectContaining({
      before: '単位質量未入力',
      after: '算出',
      beforeKg: null,
      afterKg: expect.any(Number),
    }))
    expect(changedMass?.mass?.beforeKg).not.toBe(0)
  })

  it('uses対応要確認 for an id replacement at the same location', () => {
    const baselineProject = sampleProject()
    const currentProject = cloneProject(baselineProject)
    currentProject.members = currentProject.members.map((member) =>
      member.id === '1F-X1Y1' ? { ...member, id: '1F-X1Y1-renamed' } : member,
    )

    const report = assessImpact(
      reviewSnapshot(baselineProject),
      reviewSnapshot(currentProject),
    )
    const replacement = report.entities.filter(
      (entry) => entry.kind === 'member' && entry.change === '対応要確認',
    )

    expect(replacement.map((entry) => entry.kind === 'member' ? entry.memberId : '')).toEqual(
      expect.arrayContaining(['1F-X1Y1', '1F-X1Y1-renamed']),
    )
    expect(replacement).toHaveLength(2)
    expect(report.members.find(({ memberId }) => memberId === '1F-X1Y1-renamed')?.path).toContain(
      'id 変更の可能性 — 対応要確認',
    )
  })

  it('records unsupported-to-supported transitions as対応状態', () => {
    const baselineProject = cloneProject(sampleProject())
    baselineProject.members = baselineProject.members.filter(
      ({ id }) => id !== '1F-X2Y1',
    )
    const report = assessImpact(
      reviewSnapshot(baselineProject),
      reviewSnapshot(sampleProject()),
    )
    const column = report.members.find(({ memberId }) => memberId === '1F-G1-X1Y1-X')

    expect(column?.categories).toContain('対応状態')
    expect(column?.support).toEqual({ before: '未対応', after: '対応' })
  })

  it('puts a rulepack change on every current member', () => {
    const baseline = reviewSnapshot(sampleProject())
    const current = reviewSnapshot(sampleProject())
    current.fingerprints = { ...current.fingerprints, rulepack: 'changed-rulepack' }
    const report = assessImpact(baseline, current)

    expect(report.rulepackChanged).toBe(true)
    expect(report.members).toHaveLength(current.project.members.length)
    expect(report.members.every(({ categories }) => categories.includes('根拠'))).toBe(true)
  })

  it('marks untracked wall result changes without inventing an input dependency path', () => {
    const current = cloneProject(sampleProject())
    current.sections = current.sections.map((section) =>
      section.id === 'section-W1' && section.kind === '耐震壁'
        ? { ...section, layers: 1 }
        : section,
    )
    const report = assessImpact(reviewSnapshot(sampleProject()), reviewSnapshot(current))
    const wall = report.members.find(({ memberId }) => memberId === '1F-W1-X1Y1-Y')

    expect(wall?.categories).toEqual(expect.arrayContaining(['形状', '数量']))
    expect(wall?.path).toContain('依存経路未追跡 — 結果差分で検出')
  })

  it('ends a propagated input-only path with結果は不変', () => {
    const current = cloneProject(sampleProject())
    current.sections = current.sections.map((section) =>
      section.id === 'section-C1' && section.kind === '柱'
        ? { ...section, storyLabel: '1階' }
        : section,
    )
    const report = assessImpact(reviewSnapshot(sampleProject()), reviewSnapshot(current))
    const column = report.members.find(({ memberId }) => memberId === '1F-X1Y1')

    expect(column?.categories).toEqual(['入力'])
    expect(column?.path).toContain('結果は不変')
  })
})
