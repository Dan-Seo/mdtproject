import type {
  BarSize,
  Member,
  MemberKind,
  Section,
} from '../model/member'
import {
  findSection,
  memberGroupKey,
  type Project,
} from '../model/project'
import type { Rebar, RebarRole, RebarShape } from '../model/rebar'
import {
  coverConditions,
  lookupMarkup,
  lookupRule,
  lookupUnitMass,
} from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'

export interface QuantityLine {
  id: string
  groupId: string
  storyName: string
  memberKind: MemberKind
  mark: string
  sectionLabel: string
  role: RebarRole
  size: BarSize
  shape: RebarShape
  lengthMm: number
  countPerMember: number
  places: number
  totalLengthMm: number
  unitMassKgPerM: number
  designKg: number
  requiredKg: number
  rules: RuleHit[]
  inferred: boolean
  formula: string
}

export interface StorySubtotal {
  storyName: string
  designKg: number
  requiredKg: number
}

export interface QuantityTotal {
  designKg: number
  requiredKg: number
}

interface GroupedLine {
  line: QuantityLine
  memberIds: Set<string>
  markupRate: number
}

function storyName(project: Project, member: Member): string {
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) {
    throw new Error(`Story not found: ${member.storyId}`)
  }
  return story.name
}

function sectionLabel(section: Section): string {
  return section.kind === '柱'
    ? `${section.b}×${section.d}`
    : `${section.b}×${section.depth}`
}

function ruleContext(
  member: Member,
  section: Section,
  rebar: Rebar,
): Record<string, unknown> {
  return {
    ...coverConditions(section),
    memberClass: member.memberClass,
    fc: section.fc,
    grade: section.grade,
    hook: rebar.shape === 'hook90',
    barRole: rebar.role,
    size: rebar.size,
    detail:
      section.kind === '大梁' ? '梁主筋の柱内定着' : undefined,
  }
}

function contributionContext(
  key: string,
  context: Record<string, unknown>,
): Record<string, unknown> {
  // 折曲げ定着の採否判定には先に直線 L1 も寄与する。最終形状が hook90
  // でも、この比較元だけは L1 の条件どおり hook:false で再取得する。
  return key === 'anchorage.L1' ? { ...context, hook: false } : context
}

function ruleIdentity(rule: RuleHit): string {
  const conditions = Object.entries(rule.conditions).sort(
    ([left], [right]) => left.localeCompare(right),
  )
  return `${rule.key}\u0000${JSON.stringify(conditions)}`
}

function uniqueRules(rules: RuleHit[]): RuleHit[] {
  const seen = new Set<string>()
  return rules.filter((rule) => {
    const identity = ruleIdentity(rule)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function contributingRules(
  pack: RulePack,
  member: Member,
  section: Section,
  rebar: Rebar,
): { rules: RuleHit[]; unitMass: RuleHit; markup: RuleHit } {
  const context = ruleContext(member, section, rebar)
  const rebarRules = rebar.rules.map((key) =>
    lookupRule(pack, key, contributionContext(key, context)),
  )
  const unitMass = lookupUnitMass(pack, rebar.size)
  const markup = lookupMarkup(pack, member.memberClass)

  if (unitMass.unit !== 'kg/m') {
    throw new Error(`Rule ${unitMass.key} must use kg/m`)
  }
  if (markup.unit !== 'ratio') {
    throw new Error(`Rule ${markup.key} must use ratio`)
  }

  return {
    rules: uniqueRules([...rebarRules, unitMass, markup]),
    unitMass,
    markup,
  }
}

// 同じ符号の柱でも接する大梁のせいが違えば帯筋本数が変わる。加工長と本数を
// 行キーに含め、内訳書の別行として分ける。
export function quantityLineId(groupId: string, rebar: Rebar): string {
  return `${groupId}|${rebar.role}|${rebar.length}|${rebar.count}`
}

function assertCompatible(existing: GroupedLine, rebar: Rebar): void {
  const { line } = existing
  if (line.size !== rebar.size || line.shape !== rebar.shape) {
    throw new Error(`Inconsistent size or shape in quantity group ${line.id}`)
  }
}

function recalculate(grouped: GroupedLine): void {
  const { line, memberIds, markupRate } = grouped
  line.places = memberIds.size
  line.totalLengthMm =
    line.lengthMm * line.countPerMember * line.places
  line.designKg =
    (line.totalLengthMm / 1000) * line.unitMassKgPerM
  line.requiredKg = line.designKg * (1 + markupRate)
  line.inferred = line.rules.some(
    ({ confidence }) => confidence === 'inferred',
  )
}

export function aggregateQuantity(
  project: Project,
  rebars: Rebar[],
  pack: RulePack,
): QuantityLine[] {
  const members = new Map(project.members.map((member) => [member.id, member]))
  const grouped = new Map<string, GroupedLine>()

  for (const rebar of rebars) {
    const member = members.get(rebar.memberId)
    if (!member) {
      throw new Error(`Member not found for Rebar: ${rebar.memberId}`)
    }

    const section = findSection(project, member.sectionId)
    if (section.kind !== member.kind) {
      throw new Error(
        `Member and section kinds do not match: ${member.id} ` +
          `(${member.kind}/${section.kind})`,
      )
    }

    const groupId = memberGroupKey(project, member)
    const id = quantityLineId(groupId, rebar)
    const contributions = contributingRules(
      pack,
      member,
      section,
      rebar,
    )
    const existing = grouped.get(id)

    if (existing) {
      assertCompatible(existing, rebar)
      if (
        existing.line.unitMassKgPerM !== contributions.unitMass.value ||
        existing.markupRate !== contributions.markup.value
      ) {
        throw new Error(`Inconsistent quantity rules in group ${id}`)
      }
      existing.memberIds.add(member.id)
      existing.line.rules = uniqueRules([
        ...existing.line.rules,
        ...contributions.rules,
      ])
      recalculate(existing)
      continue
    }

    const line: QuantityLine = {
      id,
      groupId,
      storyName: storyName(project, member),
      memberKind: member.kind,
      mark: section.mark,
      sectionLabel: sectionLabel(section),
      role: rebar.role,
      size: rebar.size,
      shape: rebar.shape,
      lengthMm: rebar.length,
      countPerMember: rebar.count,
      places: 0,
      totalLengthMm: 0,
      unitMassKgPerM: contributions.unitMass.value,
      designKg: 0,
      requiredKg: 0,
      rules: contributions.rules,
      inferred: false,
      formula: rebar.formula,
    }
    const created: GroupedLine = {
      line,
      memberIds: new Set([member.id]),
      markupRate: contributions.markup.value,
    }
    recalculate(created)
    grouped.set(id, created)
  }

  return [...grouped.values()].map(({ line }) => line)
}

export function hasInferred(lines: QuantityLine[]): boolean {
  return lines.some(({ inferred }) => inferred)
}

export function inferredRules(lines: QuantityLine[]): RuleHit[] {
  return uniqueRules(
    lines.flatMap(({ rules }) =>
      rules.filter(({ confidence }) => confidence === 'inferred'),
    ),
  )
}

export function storySubtotals(lines: QuantityLine[]): StorySubtotal[] {
  const subtotals = new Map<string, StorySubtotal>()

  for (const line of lines) {
    const subtotal = subtotals.get(line.storyName)
    if (subtotal) {
      subtotal.designKg += line.designKg
      subtotal.requiredKg += line.requiredKg
      continue
    }

    subtotals.set(line.storyName, {
      storyName: line.storyName,
      designKg: line.designKg,
      requiredKg: line.requiredKg,
    })
  }

  return [...subtotals.values()]
}

export function grandTotal(lines: QuantityLine[]): QuantityTotal {
  return lines.reduce<QuantityTotal>(
    (total, line) => ({
      designKg: total.designKg + line.designKg,
      requiredKg: total.requiredKg + line.requiredKg,
    }),
    { designKg: 0, requiredKg: 0 },
  )
}
