import type { BarSize, GirderSection, Member } from '../model/member'
import type { GirderSpan } from '../model/project'
import type { Rebar, RebarZone } from '../model/rebar'
import { coverConditions, lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import {
  resolveGirderEnd,
  type GirderEndDetail,
} from './girder-ends'
import { stirrupPositions } from './stirrup-layout'

export interface GirderRebarInput {
  member: Member
  section: GirderSection
  span: GirderSpan
}

function barDiameter(size: BarSize): number {
  const diameter = Number(size.replace(/^D/, ''))

  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Invalid BarSize: ${size}`)
  }

  return diameter
}

function millimetres(rule: RuleHit, diameter?: number): number {
  if (rule.unit === 'mm') return rule.value
  if (rule.unit === 'd' && diameter !== undefined) {
    return rule.value * diameter
  }

  throw new Error(
    `Rule ${rule.key} must use mm or use d with a supplied bar diameter`,
  )
}

function uniqueRuleKeys(keys: string[]): string[] {
  return [...new Set(keys)]
}

function endRuleKeys(detail: GirderEndDetail): string[] {
  if (detail.kind === '直線定着') return [detail.lengthRule]

  return [
    'anchorage.L1',
    detail.lengthRule,
    detail.projectionRule,
    'anchorage.bent.tail.minimum',
    'anchorage.bent.projection.minimum',
  ]
}

function endFormula(label: '始端' | '終端', detail: GirderEndDetail): string {
  if (detail.kind === '直線定着') {
    return `${label} 直線定着 L1 ${detail.lengthMm}`
  }

  const verticalTailMm = detail.lengthMm - detail.projectionMm
  return (
    `${label} 折曲げ定着 L1h ${detail.lengthMm}` +
    `（投影定着長さ La ${detail.projectionMm} ＋ 垂直余長 ${verticalTailMm}）`
  )
}

function mainPoints(
  clearMm: number,
  y: number,
  z: number,
  start: GirderEndDetail,
  end: GirderEndDetail,
): Rebar['points'] {
  const points: Rebar['points'] = []

  if (start.kind === '直線定着') {
    points.push([-start.lengthMm, y, z])
  } else {
    const verticalTailMm = start.lengthMm - start.projectionMm
    const direction = start.direction === '上' ? 1 : -1
    points.push(
      [
        -start.projectionMm,
        y + direction * verticalTailMm,
        z,
      ],
      [-start.projectionMm, y, z],
    )
  }

  if (end.kind === '直線定着') {
    points.push([clearMm + end.lengthMm, y, z])
  } else {
    const verticalTailMm = end.lengthMm - end.projectionMm
    const direction = end.direction === '上' ? 1 : -1
    points.push(
      [clearMm + end.projectionMm, y, z],
      [
        clearMm + end.projectionMm,
        y + direction * verticalTailMm,
        z,
      ],
    )
  }

  return points
}

function generateMain(
  input: GirderRebarInput,
  pack: RulePack,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  row: {
    id: 'top' | 'bottom'
    role: '上端筋' | '下端筋'
    count: number
    y: number
    bendDirection: '上' | '下'
  },
): Rebar {
  const { member, section, span } = input
  const endInput = {
    barSize: section.main.size,
    fc: section.fc,
    grade: section.grade,
    bendDirection: row.bendDirection,
  }
  const start = resolveGirderEnd(
    {
      ...endInput,
      supportLengthMm: span.startSupportLengthAlongAxisMm,
    },
    pack,
  )
  const end = resolveGirderEnd(
    {
      ...endInput,
      supportLengthMm: span.endSupportLengthAlongAxisMm,
    },
    pack,
  )
  const length = span.clear + start.lengthMm + end.lengthMm
  const zones: RebarZone[] = [
    { kind: '定着', pathFromMm: 0, pathToMm: start.lengthMm },
    {
      kind: '定着',
      pathFromMm: length - end.lengthMm,
      pathToMm: length,
    },
  ]
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ ` +
    `加算 ${fabricationCoverAdditionRule.value} ＝ ${fabricationCoverMm}）`

  return {
    id: `${member.id}|${row.id}`,
    memberId: member.id,
    role: row.role,
    size: section.main.size,
    shape:
      start.kind === '折曲げ定着' || end.kind === '折曲げ定着'
        ? 'hook90'
        : 'straight',
    points: mainPoints(
      span.clear,
      row.y,
      fabricationCoverMm,
      start,
      end,
    ),
    closed: false,
    length,
    count: row.count,
    zones,
    rules: uniqueRuleKeys([
      coverRule.key,
      fabricationCoverAdditionRule.key,
      ...endRuleKeys(start),
      ...endRuleKeys(end),
    ]),
    formula:
      `加工長 ＝ 内法長さ ${span.clear} ＋ ${endFormula('始端', start)} ` +
      `＋ ${endFormula('終端', end)} ＝ ${length} ／ ` +
      `配置基準 ＝ ${fabricationCoverFormula} ／ ` +
      `本数 ＝ 断面一覧の${row.role}本数 ${row.count}`,
  }
}

export function generateGirderRebar(
  input: GirderRebarInput,
  pack: RulePack,
): Rebar[] {
  const { member, section, span } = input
  const coverRule = lookupRule(
    pack,
    'cover.minimum',
    coverConditions(section),
  )
  const fabricationCoverAdditionRule = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const minimumCoverMm = millimetres(coverRule)
  const fabricationCoverAdditionMm = millimetres(
    fabricationCoverAdditionRule,
  )
  const fabricationCoverMm =
    minimumCoverMm + fabricationCoverAdditionMm

  const top = generateMain(
    input,
    pack,
    coverRule,
    fabricationCoverAdditionRule,
    fabricationCoverMm,
    {
      id: 'top',
      role: '上端筋',
      count: section.main.topCount,
      y: section.depth - fabricationCoverMm,
      bendDirection: '下',
    },
  )
  const bottom = generateMain(
    input,
    pack,
    coverRule,
    fabricationCoverAdditionRule,
    fabricationCoverMm,
    {
      id: 'bottom',
      role: '下端筋',
      count: section.main.bottomCount,
      y: fabricationCoverMm,
      bendDirection: '上',
    },
  )

  const hook135Rule = lookupRule(pack, 'bend.hook135', {})
  const startOffsetRule = lookupRule(pack, 'stirrup.start-offset', {})
  const stirrupDiameter = barDiameter(section.stirrup.size)
  const hook135LengthMm = millimetres(hook135Rule, stirrupDiameter)
  const startOffsetMm = millimetres(startOffsetRule)
  const stirrupWidthMm = section.b - 2 * fabricationCoverMm
  const stirrupDepthMm = section.depth - 2 * fabricationCoverMm

  if (stirrupWidthMm <= 0 || stirrupDepthMm <= 0) {
    throw new Error(
      `あばら筋 加工寸法 must be positive: ${member.id} ` +
        `(${section.b}×${section.depth} − 2×加工用かぶり ${fabricationCoverMm})`,
    )
  }

  const layout = stirrupPositions(
    span.clear,
    section.stirrup.pitch,
    startOffsetMm,
  )
  const stirrupLengthMm =
    2 * (stirrupWidthMm + stirrupDepthMm) + 2 * hook135LengthMm
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${minimumCoverMm} ＋ ` +
    `加算 ${fabricationCoverAdditionMm} ＝ ${fabricationCoverMm}）`
  const stirrup: Rebar = {
    id: `${member.id}|stirrup`,
    memberId: member.id,
    role: 'あばら筋',
    size: section.stirrup.size,
    shape: 'hoop',
    points: [
      [0, fabricationCoverMm, fabricationCoverMm],
      [0, section.depth - fabricationCoverMm, fabricationCoverMm],
      [
        0,
        section.depth - fabricationCoverMm,
        section.b - fabricationCoverMm,
      ],
      [0, fabricationCoverMm, section.b - fabricationCoverMm],
    ],
    closed: true,
    length: stirrupLengthMm,
    count: layout.positionsMm.length,
    rules: [
      coverRule.key,
      fabricationCoverAdditionRule.key,
      hook135Rule.key,
      startOffsetRule.key,
    ],
    formula:
      `加工長 ＝ 2×{(${section.b}−2×${fabricationCoverMm})＋` +
      `(${section.depth}−2×${fabricationCoverMm})} ＋ ` +
      `2×135°フック余長 ${hook135Rule.value}d(${hook135LengthMm}) ` +
      `＝ ${stirrupLengthMm} ／ ${fabricationCoverFormula} ／ ` +
      `本数 ＝ あばら筋配置（内法長さ ${span.clear}、` +
      `ピッチ ${section.stirrup.pitch}、始端・終端オフセット ${startOffsetMm}）` +
      `＝ ${layout.positionsMm.length}`,
  }

  return [top, bottom, stirrup]
}
