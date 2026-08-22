import type {
  Member,
  MemberKind,
  Section,
  ShearBarSize,
  SpliceMethod,
} from '../model/member'
import {
  findSection,
  memberGroupKey,
  storyNotFound,
  type Project,
} from '../model/project'
import type { Rebar, RebarRole, RebarShape } from '../model/rebar'
import { lookupMarkup } from '../rules/lookup'
import {
  CONFIDENCE_ORDER,
  type RuleConfidence,
  type RuleHit,
  type RulePack,
} from '../rules/types'

/**
 * 内訳書の単位。鉄筋そのものは質量で、継手は箇所で数える — 数量積算基準が
 * 1通則4)・（２）柱2)・（３）梁2) で「継手箇所数」を求めさせるからだ。
 * 両者は足せないので行の型ごと分ける。
 */
export type QuantityUnit = 'kg' | '箇所'

interface QuantityLineBase {
  id: string
  groupId: string
  storyName: string
  memberKind: MemberKind
  mark: string
  sectionLabel: string
  role: RebarRole
  size: ShearBarSize
  /** この行が束ねた部材の数 */
  places: number
  rules: RuleHit[]
  /**
   * 이 행이 기댄 근거 중 **가장 약한** 등급. 한 행이라도 약한 근거를 쓰면
   * 그 행 전체가 그만큼만 확실하다 — 강한 쪽으로 반올림하지 않는다.
   */
  confidence: RuleConfidence
  formula: string
}

/**
 * 質量の3列は「まだ分からない」を持つ。積算基準 1通則 前文は質量を
 * 「設計長さ × JIS G 3112 の単位質量」と定めるが、値そのものは JIS に委ねる。
 * その JIS を確保できていないので、利用者が単位質量を入れるまで kg は出ない —
 * 0 を入れると内訳書で合計され、質量が過小に見える。
 */
export interface MassQuantityLine extends QuantityLineBase {
  unit: 'kg'
  shape: RebarShape
  lengthMm: number
  countPerMember: number
  totalLengthMm: number
  unitMassKgPerM: number | null
  designKg: number | null
  requiredKg: number | null
}

export interface SpliceQuantityLine extends QuantityLineBase {
  unit: '箇所'
  method: SpliceMethod
  /** 1部材あたりの継手箇所数 ＝ 1本あたり箇所数 × 本数 */
  countPerMember: number
  /** 箇所数の合計 ＝ countPerMember × places */
  totalCount: number
}

export type QuantityLine = MassQuantityLine | SpliceQuantityLine

export function isMassLine(line: QuantityLine): line is MassQuantityLine {
  return line.unit === 'kg'
}

export function isSpliceLine(line: QuantityLine): line is SpliceQuantityLine {
  return line.unit === '箇所'
}

export function massLines(lines: QuantityLine[]): MassQuantityLine[] {
  return lines.filter(isMassLine)
}

export function spliceLines(lines: QuantityLine[]): SpliceQuantityLine[] {
  return lines.filter(isSpliceLine)
}

/** 単位質量が一つでも欠けたら小計・合計も出ない — 入った径だけの和は合計ではない。 */
export interface StorySubtotal {
  storyName: string
  designKg: number | null
  requiredKg: number | null
}

export interface QuantityTotal {
  designKg: number | null
  requiredKg: number | null
}

export interface SpliceTotal {
  method: SpliceMethod
  totalCount: number
}

type GroupedLine =
  | { kind: 'kg'; line: MassQuantityLine; memberIds: Set<string>; markupRate: number }
  | { kind: '箇所'; line: SpliceQuantityLine; memberIds: Set<string> }

function storyName(project: Project, member: Member): string {
  const story = project.stories.find(({ id }) => id === member.storyId)
  if (!story) {
    throw storyNotFound(member.storyId)
  }
  return story.name
}

function sectionLabel(section: Section): string {
  // 円形柱は図面と同じ「600φ」で書く。b×d と書くと図面にない矩形断面に見える。
  if (section.kind === '柱') {
    return section.shape === '円形'
      ? `${section.b}φ`
      : `${section.b}×${section.d}`
  }
  if (section.kind === '大梁') return `${section.b}×${section.depth}`

  // 壁は断面が厚さ1つなので図面と同じ「t180」の書き方にする。
  return `t${section.thickness}`
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
  rebar: Rebar,
): { rules: RuleHit[]; markup: RuleHit } {
  // 산정부가 실제로 조회한 행을 그대로 쓴다 — 키에서 조회 조건을 되짚으면
  // 되짚을 수 없는 조회(지점 柱의 かぶり)가 근거에서 사라진다.
  const rebarRules = rebar.ruleHits
  const markup = lookupMarkup(pack, member.memberClass)

  if (markup.unit !== 'ratio') {
    throw new Error(`Rule ${markup.key} must use ratio`)
  }

  return {
    rules: uniqueRules([...rebarRules, markup]),
    markup,
  }
}

// 同じ符号でも階高や内法長さが違えば設計長さ・設計本数が変わる（積算基準
// 1通則2)・7)）。両方を行キーに含め、内訳書の別行として分ける。
//
// 継手箇所数も鍵に入れる。長さが増えない方式（ガス圧接・機械式・溶接は
// measure.splice.length.factor が0）だと箇所数が違っても長さが同じになり、
// 併合された行の算出式・出典が片方についてしか事実でなくなる。
export function quantityLineId(groupId: string, rebar: Rebar): string {
  const spliceKey = rebar.splice ? `|継手${rebar.splice.countPerBar}` : ''
  // 前文は「規格、形状、寸法等ごとに」なので、寸法(設計長さ)だけでなく加工形状も
  // 鍵に入れる — 設計長さが同じでも折れ線が違えば別の鉄筋だ (ADR-019)。同じ行に
  // 落とすと places は部材数で数えるため、同じ部材から来た片方の本数がまるごと
  // 数量から消える（カットオフ筋で実際に起こる — girder.ts の束ね鍵を見よ）。
  const shapeKey = rebar.points.map((point) => point.join(',')).join(';')

  return `${groupId}|${rebar.role}|${rebar.length}|${rebar.count}${spliceKey}|形状${shapeKey}`
}

/**
 * 継手は方式と箇所数で単価が変わるので、質量行とは別の行キーで束ねる。
 * 長さも鍵に入れる — 同じ箇所数でも長さが違えば算出式が語る根拠が違う。
 */
export function spliceLineId(groupId: string, rebar: Rebar): string {
  const splice = rebar.splice
  if (!splice) {
    throw new Error(`Rebar has no splice to key: ${rebar.id}`)
  }

  return `${groupId}|${rebar.role}|継手|${splice.method}|${splice.countPerBar}|${rebar.count}|${rebar.length}`
}

function recalculate(grouped: GroupedLine): void {
  const { line, memberIds } = grouped
  line.places = memberIds.size
  line.confidence = weakestConfidence(line.rules)

  if (grouped.kind === '箇所') {
    grouped.line.totalCount =
      grouped.line.countPerMember * grouped.line.places
    return
  }

  const massLine = grouped.line
  massLine.totalLengthMm =
    massLine.lengthMm * massLine.countPerMember * massLine.places

  if (massLine.unitMassKgPerM === null) {
    massLine.designKg = null
    massLine.requiredKg = null
    return
  }

  massLine.designKg = (massLine.totalLengthMm / 1000) * massLine.unitMassKgPerM
  massLine.requiredKg = massLine.designKg * (1 + grouped.markupRate)
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
    const contributions = contributingRules(pack, member, rebar)
    const existing = grouped.get(id)
    const common = {
      groupId,
      storyName: storyName(project, member),
      memberKind: member.kind,
      mark: section.mark,
      sectionLabel: sectionLabel(section),
      role: rebar.role,
      size: rebar.size,
      places: 0,
      // recalculate() 가 행의 근거 전부를 보고 다시 정한다 — 여기 값은 자리표다.
      confidence: 'stated' as RuleConfidence,
    }

    if (existing) {
      if (existing.kind !== 'kg') {
        throw new Error(`Quantity line ${id} is not measured in kg`)
      }
      if (
        existing.line.size !== rebar.size ||
        existing.line.shape !== rebar.shape
      ) {
        throw new Error(`Inconsistent size or shape in quantity group ${id}`)
      }
      if (existing.markupRate !== contributions.markup.value) {
        throw new Error(`Inconsistent quantity rules in group ${id}`)
      }
      existing.memberIds.add(member.id)
      existing.line.rules = uniqueRules([
        ...existing.line.rules,
        ...contributions.rules,
      ])
      recalculate(existing)
    } else {
      const created: GroupedLine = {
        kind: 'kg',
        line: {
          ...common,
          id,
          unit: 'kg',
          shape: rebar.shape,
          lengthMm: rebar.length,
          countPerMember: rebar.count,
          totalLengthMm: 0,
          // 径で引いて未入力なら null。同じ行に集まる鉄筋は径が同じなので
          // （上の size 検査）、行の中で値が食い違うことはない。
          unitMassKgPerM: project.unitMass?.[rebar.size] ?? null,
          designKg: null,
          requiredKg: null,
          rules: contributions.rules,
          formula: rebar.formula,
        },
        memberIds: new Set([member.id]),
        markupRate: contributions.markup.value,
      }
      recalculate(created)
      grouped.set(id, created)
    }

    // 継手のない鉄筋（フープ・スタラップ）と、条項が 0 か所と数えた鉄筋は
    // 行を作らない — 0 の行は内訳書を埋めるだけで何も伝えない。
    const splice = rebar.splice
    if (!splice || splice.countPerBar === 0) continue

    const spliceId = spliceLineId(groupId, rebar)
    const existingSplice = grouped.get(spliceId)

    if (existingSplice) {
      if (existingSplice.kind !== '箇所') {
        throw new Error(`Quantity line ${spliceId} is not measured in 箇所`)
      }
      existingSplice.memberIds.add(member.id)
      existingSplice.line.rules = uniqueRules([
        ...existingSplice.line.rules,
        ...splice.rules,
      ])
      recalculate(existingSplice)
      continue
    }

    const createdSplice: GroupedLine = {
      kind: '箇所',
      line: {
        ...common,
        id: spliceId,
        unit: '箇所',
        method: splice.method,
        countPerMember: splice.countPerBar * rebar.count,
        totalCount: 0,
        rules: splice.rules,
        formula: splice.formula,
      },
      memberIds: new Set([member.id]),
    }
    recalculate(createdSplice)
    grouped.set(spliceId, createdSplice)
  }

  return [...grouped.values()].map(({ line }) => line)
}

/** 継手は方式ごとに単価が違うので、合計も方式ごとに出す。 */
export function spliceTotals(lines: QuantityLine[]): SpliceTotal[] {
  const totals = new Map<SpliceMethod, SpliceTotal>()

  for (const line of spliceLines(lines)) {
    const total = totals.get(line.method)
    if (total) {
      total.totalCount += line.totalCount
      continue
    }

    totals.set(line.method, {
      method: line.method,
      totalCount: line.totalCount,
    })
  }

  return [...totals.values()]
}

/** 여러 근거를 묶을 때의 대표 등급 — 가장 약한 것. 근거가 없으면 `stated`. */
export function weakestConfidence(rules: RuleHit[]): RuleConfidence {
  return rules.reduce<RuleConfidence>(
    (weakest, { confidence }) =>
      CONFIDENCE_ORDER.indexOf(confidence) < CONFIDENCE_ORDER.indexOf(weakest)
        ? confidence
        : weakest,
    'stated',
  )
}

/**
 * 独立検討가 끝나지 않은 근거가 하나라도 있는가 — 즉 `stated` 가 아닌 행이 있는가.
 * `transcribed`(원문 명시·검토 대기)도 여기 들어간다. 경고를 내릴지 판단하는 값이므로
 * 「원문에 값이 없다」(inferred)만 세면 검토 대기분이 조용히 통과한다 (ADR-015).
 */
export function hasUnverified(lines: QuantityLine[]): boolean {
  return lines.some(({ confidence }) => confidence !== 'stated')
}

export function unverifiedRules(lines: QuantityLine[]): RuleHit[] {
  return uniqueRules(
    lines.flatMap(({ rules }) =>
      rules.filter(({ confidence }) => confidence !== 'stated'),
    ),
  )
}

/** 원문에 값이 아예 없는 근거만. 텔레메트리의 `inferred_rules` 가 이것이다. */
export function inferredRules(lines: QuantityLine[]): RuleHit[] {
  return uniqueRules(
    lines.flatMap(({ rules }) =>
      rules.filter(({ confidence }) => confidence === 'inferred'),
    ),
  )
}

/** 一つでも分からなければ和も分からない — 入った分だけ足すと不足が隠れる。 */
function addMass(sum: number | null, value: number | null): number | null {
  if (sum === null || value === null) return null
  return sum + value
}

export function storySubtotals(lines: QuantityLine[]): StorySubtotal[] {
  const subtotals = new Map<string, StorySubtotal>()

  // 階は行があれば立てるが、足すのは質量だけだ。箇所は質量に足せず、割増
  // （1通則9)）も「設計数量の4%」＝質量に対する規定なので継手行には掛からない。
  for (const line of lines) {
    const subtotal = subtotals.get(line.storyName) ?? {
      storyName: line.storyName,
      designKg: 0,
      requiredKg: 0,
    }

    if (isMassLine(line)) {
      subtotal.designKg = addMass(subtotal.designKg, line.designKg)
      subtotal.requiredKg = addMass(subtotal.requiredKg, line.requiredKg)
    }

    subtotals.set(line.storyName, subtotal)
  }

  return [...subtotals.values()]
}

export function grandTotal(lines: QuantityLine[]): QuantityTotal {
  return massLines(lines).reduce<QuantityTotal>(
    (total, line) => ({
      designKg: addMass(total.designKg, line.designKg),
      requiredKg: addMass(total.requiredKg, line.requiredKg),
    }),
    { designKg: 0, requiredKg: 0 },
  )
}
