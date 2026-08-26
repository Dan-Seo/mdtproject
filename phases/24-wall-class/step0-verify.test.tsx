import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, it } from 'vitest'

import type { WallSection } from '../../src/domain/model/member'
import { coverConditions, lookupRule } from '../../src/domain/rules/lookup'
import { parseRulePack } from '../../src/domain/rules/loader'
import { generateWallRebar } from '../../src/domain/rebar/wall'
import { aggregateQuantity, massLines } from '../../src/domain/quantity'
import {
  createSampleProject,
  slabSection,
  wallSection,
} from '../../src/domain/model/sample-project'
import { wallSpan } from '../../src/domain/model/project'
import type { RulePack } from '../../src/domain/rules/types'
import { SectionImport } from '../../src/components/section/SectionImport'
import { useAppStore } from '../../src/lib/store'
import { parseSectionLists } from '../../src/lib/import/section-list/parse'
import type { TextPage } from '../../src/lib/import/section-list/types'

import ojkkWallSlabFixture from '../../tests/fixtures/section-import/textitems/ojkk-p4.json'

type PremiseStatus = 'upheld' | 'refuted'

interface PremiseResult {
  id: string
  status: PremiseStatus
  evidence: string[]
}

interface Report {
  premises: PremiseResult[]
  verdict: PremiseStatus
  summary: string
}

const reportPath = resolve(
  process.cwd(),
  'phases/24-wall-class/step0-report.json',
)

const wallSlabPage: TextPage = {
  ...ojkkWallSlabFixture.page,
  items: ojkkWallSlabFixture.items,
}

function loadRulePack(): RulePack {
  const root = resolve(process.cwd(), 'src/rulepack/jp-mlit')
  const files = Object.fromEntries(
    [
      'sources.yaml',
      'cover.yaml',
      'anchorage.yaml',
      'lap.yaml',
      'bend.yaml',
      'markup.yaml',
      'measure.yaml',
      'splice.yaml',
    ].map((fileName) => [
      fileName,
      readFileSync(resolve(root, fileName), 'utf8'),
    ]),
  )
  return parseRulePack(files)
}

function withMockCover(
  pack: RulePack,
  section: WallSection,
  value: number,
): RulePack {
  const conditions = coverConditions(section)
  let changed = 0
  const entries = pack.entries.map((entry) => {
    const sameConditions =
      entry.key === 'cover.minimum' &&
      Object.keys(entry.conditions).length === Object.keys(conditions).length &&
      Object.entries(conditions).every(([name, expected]) => entry.conditions[name] === expected)
    if (sameConditions) {
      changed += 1
      return { ...entry, value }
    }
    return entry
  })
  assert.equal(changed, 1, 'the wall cover cell must be unique')
  return { ...pack, entries }
}

function wallProject(section: WallSection) {
  const base = createSampleProject()
  return {
    ...base,
    sections: base.sections.map((candidate) =>
      candidate.id === section.id ? section : candidate,
    ),
    // Unit mass is project input, not a rule-pack value. A unit value makes
    // aggregateQuantity expose the cover-independence of the kg calculation.
    unitMass: { [section.vertical.size]: 1 },
  }
}

function designKg(
  project: ReturnType<typeof wallProject>,
  section: WallSection,
  pack: RulePack,
): number {
  const member = project.members.find((candidate) => candidate.kind === section.kind)
  assert(member, 'sample project must contain a wall member')
  const rebars = generateWallRebar(
    { member, section, span: wallSpan(project, member) },
    pack,
  )
  const lines = aggregateQuantity(project, rebars, pack)
  return massLines(lines).reduce(
    (total, line) => total + (line.designKg ?? 0),
    0,
  )
}

function checkCoverNoKg(pack: RulePack): string[] {
  const wallCover = pack.entries.find(
    (entry) =>
      entry.key === 'cover.minimum' &&
      entry.conditions.memberKind === wallSection.kind &&
      entry.conditions.finish === wallSection.finish &&
      entry.conditions.exposure === wallSection.exposure,
  )
  const slabCover = pack.entries.find(
    (entry) =>
      entry.key === 'cover.minimum' &&
      entry.conditions.memberKind === slabSection.kind &&
      entry.conditions.finish === slabSection.finish,
  )
  const fabrication = lookupRule(pack, 'cover.fabrication.addition', {})
  assert(wallCover && slabCover, 'cover fixture rows must exist')

  const lowCover = slabCover.value
  const highCover = lowCover + wallCover.value + fabrication.value
  assert(highCover > lowCover)

  const thick = { ...wallSection, thickness: wallSection.thickness }
  const lowPack = withMockCover(pack, thick, lowCover)
  const highPack = withMockCover(pack, thick, highCover)
  const lowKg = designKg(wallProject(thick), thick, lowPack)
  const highKg = designKg(wallProject(thick), thick, highPack)
  assert.equal(lowKg, highKg)

  const thickProject = wallProject(thick)
  const thickMember = thickProject.members.find(
    (candidate) => candidate.kind === thick.kind,
  )
  assert(thickMember)
  const lowBars = generateWallRebar(
    { member: thickMember, section: thick, span: wallSpan(thickProject, thickMember) },
    lowPack,
  )
  const highBars = generateWallRebar(
    { member: thickMember, section: thick, span: wallSpan(thickProject, thickMember) },
    highPack,
  )
  assert.notEqual(lowBars[0].points[0][2], highBars[0].points[0][2])

  const thin = { ...wallSection, thickness: wallSection.thickness / 2 }
  const thinProject = wallProject(thin)
  const thinMember = thinProject.members.find(
    (candidate) => candidate.kind === thin.kind,
  )
  assert(thinMember)
  generateWallRebar(
    { member: thinMember, section: thin, span: wallSpan(thinProject, thinMember) },
    lowPack,
  )
  let highGuardError = ''
  try {
    generateWallRebar(
      { member: thinMember, section: thin, span: wallSpan(thinProject, thinMember) },
      highPack,
    )
  } catch (error) {
    highGuardError = String(error)
  }
  assert.notEqual(highGuardError, '')

  return [
    `mock cover values low=${lowCover}mm/high=${highCover}mm`,
    `aggregate designKg low=${lowKg}/high=${highKg}; rebar length/count are unchanged`,
    `3D layer offset changed (${lowBars[0].points[0][2]} -> ${highBars[0].points[0][2]})`,
    `thin-wall double-layer guard: low cover passed, high cover failed (${highGuardError})`,
  ]
}

function checkLapFloor(pack: RulePack): string[] {
  const wallMinimum = lookupRule(pack, 'lap.wall.minimum', {})
  const combo = pack.entries.find(
    (entry) =>
      entry.key === 'lap.L1' &&
      entry.conditions.hook === false &&
      entry.value < wallMinimum.value,
  )
  assert(combo, 'rule pack must contain an L1 row below the wall minimum')

  const conditions = {
    fc: combo.conditions.fc,
    grade: combo.conditions.grade,
    hook: false,
  }
  const tableLap = lookupRule(pack, 'lap.L1', conditions)
  const section: WallSection = {
    ...wallSection,
    fc: Number(conditions.fc),
    grade: conditions.grade as WallSection['grade'],
  }
  const project = wallProject(section)
  const member = project.members.find((candidate) => candidate.kind === section.kind)
  assert(member)
  const bars = generateWallRebar(
    { member, section, span: wallSpan(project, member) },
    pack,
  )
  const first = bars[0]
  assert(first.splice)
  const factor = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const diameter = Number(first.size.replace(/^\D+/, ''))
  const expectedLapContribution =
    wallMinimum.value * diameter * first.splice.countPerBar * factor.value

  assert(tableLap.value < wallMinimum.value)
  assert.equal(first.splice.lengthMm, expectedLapContribution)
  assert(first.splice.rules.some((rule) => rule.key === wallMinimum.key))

  return [
    `selected fc=${conditions.fc}, grade=${conditions.grade}, size=${first.size}`,
    `lap.L1=${tableLap.value}d < ${wallMinimum.value}d lap.wall.minimum`,
    `vertical splice length=${first.splice.lengthMm}mm equals the 40d-floor contribution`,
    `source=${JSON.stringify(wallMinimum.source)}; note=${wallMinimum.note}`,
  ]
}

function checkNoAutoClassification(pack: RulePack): string[] {
  void pack
  const expected = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json',
      ),
      'utf8',
    ),
  ) as {
    lists: Array<{ entries?: Array<Record<string, unknown>> }>
  }
  const noteNeedle = '\u96d1\u58c1'
  const noteMarks = expected.lists
    .flatMap((list) => list.entries ?? [])
    .filter((entry) =>
      Object.values(entry).some(
        (value) => typeof value === 'string' && value.includes(noteNeedle),
      ),
    )
    .map((entry) => String(entry.mark))
  assert(noteMarks.length > 0, 'expected fixture must contain a 雑壁 note')

  const parsed = []
  const source = parseSectionLists(wallSlabPage)
  for (const mark of noteMarks) {
    const candidate = source
      .flatMap((list) => list.candidates)
      .find((entry) => entry.mark === mark)
    assert(candidate, `parser candidate missing for noted wall ${mark}`)
    parsed.push(candidate)
    assert.equal(candidate.kind, wallSection.kind)
    assert(
      !Object.keys(candidate.raw).some((key) => key.includes('備考')),
      `備考 must not be consumed for ${mark}`,
    )
  }

  return [
    `expected fixture notes classify ${noteMarks.join(', ')} as ${noteNeedle}`,
    `parsed candidates remain kind=${parsed.map((candidate) => candidate.kind).join(', ')}`,
    'candidate.raw contains no 備考 field; parser does not infer wallClass from free text',
  ]
}

function checkLookupNoAmbiguity(pack: RulePack): string[] {
  const slabRows = pack.entries.filter(
    (entry) =>
      entry.key === 'cover.minimum' &&
      entry.conditions.memberKind === slabSection.kind,
  )
  assert.equal(slabRows.length, 2)
  const mockRows = slabRows.map((entry) => ({
    ...entry,
    conditions: { ...entry.conditions, memberKind: '\u96d1\u58c1' },
  }))
  const mockPack = { ...pack, entries: [...pack.entries, ...mockRows] }

  const wallHit = lookupRule(mockPack, 'cover.minimum', coverConditions(wallSection))
  const slabHit = lookupRule(mockPack, 'cover.minimum', coverConditions(slabSection))
  const miscHit = lookupRule(mockPack, 'cover.minimum', {
    memberKind: '\u96d1\u58c1',
    soilContact: false,
    finish: slabSection.finish,
  })

  assert.equal(wallHit.conditions.memberKind, wallSection.kind)
  assert.equal(slabHit.conditions.memberKind, slabSection.kind)
  assert.equal(miscHit.conditions.memberKind, '\u96d1\u58c1')

  return [
    'added two in-memory cover rows with memberKind=雑壁',
    `耐震壁 query -> ${wallHit.conditions.memberKind}; 床板 query -> ${slabHit.conditions.memberKind}`,
    `雑壁 query -> ${miscHit.conditions.memberKind}; no ambiguous lookup or cross-hit`,
  ]
}

function checkImportPreserve(): string[] {
  const base = createSampleProject()
  const existing = {
    ...wallSection,
    id: 'section-EW15',
    mark: 'EW15',
    thickness: 240,
    wallClass: '\u8010\u529b\u58c1\u4ee5\u5916',
  } as WallSection & { wallClass: string }
  useAppStore.setState({
    project: { ...base, sections: [...base.sections, existing] },
    locale: 'ja',
  })

  const view = render(<SectionImport initialPages={[wallSlabPage]} />)
  try {
    const row = screen.getByTestId('section-import-candidate-EW15-none')
    const apply = within(row).getByRole('button', { name: '反映' })
    assert(!apply.hasAttribute('disabled'))
    fireEvent.click(apply)

    const updated = useAppStore
      .getState()
      .project.sections.find(({ id }) => id === existing.id)
    assert(updated && updated.kind === wallSection.kind)
    assert.equal((updated as WallSection & { wallClass?: string }).wallClass, existing.wallClass)

    return [
      'executed SectionImport applyCandidate through the real approval button',
      `parsed wall fields changed while wallClass stayed ${existing.wallClass}`,
      'the branch spreads the existing section and only assigns parsed wall fields',
    ]
  } finally {
    view.unmount()
    cleanup()
  }
}

function checkFixtureCoupling(pack: RulePack): string[] {
  const fixture = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'tests/golden/fixtures/spec-r7-ch5.json'),
      'utf8',
    ),
  ) as {
    entries: Array<{
      kind: string
      conditions: { memberKinds?: string[]; soilContact?: boolean; finish?: string }
    }>
  }
  const coverEntry = fixture.entries.find(
    (entry) =>
      entry.kind === 'cover.minimum' &&
      entry.conditions.memberKinds !== undefined &&
      entry.conditions.memberKinds.length > 0,
  )
  assert(coverEntry && coverEntry.conditions.memberKinds)

  const addedMemberKind = '\u96d1\u58c1'
  const mutatedMemberKinds = [...coverEntry.conditions.memberKinds, addedMemberKind]
  const baseConditions = Object.fromEntries(
    Object.entries(coverEntry.conditions).filter(([name]) => name !== 'memberKinds'),
  )
  let newMemberKindFailed = false
  try {
    lookupRule(pack, 'cover.minimum', {
      ...baseConditions,
      memberKind: mutatedMemberKinds.at(-1),
    })
  } catch (error) {
    newMemberKindFailed = true
    assert(String(error).includes('Rule not found'))
  }
  assert(newMemberKindFailed)

  return [
    `in-memory fixture-only mutation appended memberKinds=${addedMemberKind}`,
    'the same coverCases expansion used by spec-tables.test.ts calls lookupRule for the new member kind',
    'one-sided mutation failed with Rule not found; fixture and rulepack must be changed together',
  ]
}

function runCheck(
  id: string,
  fn: () => string[],
  results: PremiseResult[],
): void {
  try {
    results.push({ id, status: 'upheld', evidence: fn() })
  } catch (error) {
    results.push({
      id,
      status: 'refuted',
      evidence: [`verification assertion failed: ${String(error)}`],
    })
  }
}

function writeReport(results: PremiseResult[]): Report {
  const verdict = results.every(({ status }) => status === 'upheld')
    ? 'upheld'
    : 'refuted'
  const report: Report = {
    premises: results,
    verdict,
    summary:
      verdict === 'upheld'
        ? 'ADR-036의 여섯 전제가 현재 코드·픽스처에서 모두 유지되었다.'
        : 'ADR-036의 전제 중 하나 이상이 현재 코드·픽스처에서 반증되었다.',
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

describe('phase 24 step 0 — ADR-036 premise verification', () => {
  afterEach(() => {
    cleanup()
  })

  it('runs all six counterexample checks and writes the report', () => {
    const pack = loadRulePack()
    const results: PremiseResult[] = []

    runCheck('cover-no-kg', () => checkCoverNoKg(pack), results)
    runCheck('lap-floor-unconditional', () => checkLapFloor(pack), results)
    runCheck('no-auto-classification', () => checkNoAutoClassification(pack), results)
    runCheck('lookup-no-ambiguity', () => checkLookupNoAmbiguity(pack), results)
    runCheck('import-preserve', checkImportPreserve, results)
    runCheck('fixture-coupling', () => checkFixtureCoupling(pack), results)

    assert.equal(results.length, 6)
    writeReport(results)
  })
})
