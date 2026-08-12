import type { GirderSection, Member } from '../model/member'
import type { GirderRun, GirderSpan } from '../model/project'
import type { Rebar, RebarZone } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
import { coverConditions, lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import {
  resolveGirderEnd,
  type GirderEndDetail,
} from './girder-ends'
import { distributionCount, hoopDesignLengthMm } from './measurement'
import { stirrupPositions } from './stirrup-layout'

export interface GirderRebarInput {
  run: GirderRun
  section: GirderSection
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

function uniqueRuleHits(hits: RuleHit[]): RuleHit[] {
  return [...new Set(hits)]
}

function endFormula(label: '始端' | '終端', detail: GirderEndDetail): string {
  if (detail.kind === '直線定着') {
    return `${label} 直線定着 L1 ${detail.lengthMm}`
  }

  // lengthMm·projectionMm 은 최소치와의 max 결과다 — L1h·La 로 표기하면 表5.3.4·
  // 表5.3.5 와 대조하는 검토자에게 근거가 틀린 것으로 보인다. 지배한 항을 밝힌다.
  const verticalTailMm = detail.lengthMm - detail.projectionMm
  return (
    `${label} 折曲げ定着 加工長 ${detail.lengthMm}` +
    `（投影 ${detail.projectionMm}［La ${detail.laMm} と 柱せい×投影下限 ` +
    `${detail.projectionMinimumMm} の大］ ＋ 垂直余長 ${verticalTailMm}` +
    `［L1h ${detail.l1hMm} と 投影＋余長下限 ${detail.tailMinimumMm} の大］）`
  )
}

function runCoreFormula(run: GirderRun): string {
  const clearTerms = run.spans.map(({ clear }) => clear).join('＋')
  const intermediateSupportTerms = run.spans
    .slice(0, -1)
    .map(({ endSupportLengthAlongAxisMm }) => endSupportLengthAlongAxisMm)
    .join('＋')

  return intermediateSupportTerms === ''
    ? `内法長さ ${clearTerms}`
    : `内法長さ ${clearTerms} ＋ 中間柱せい ${intermediateSupportTerms}`
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
  const { run, section } = input
  const startSpan = run.spans[0]
  const endSpan = run.spans.at(-1)
  if (startSpan === undefined || endSpan === undefined) {
    throw new Error('GirderRun must contain at least one span')
  }
  const endInput = {
    barSize: section.main.size,
    fc: section.fc,
    grade: section.grade,
    bendDirection: row.bendDirection,
  }
  const start = resolveGirderEnd(
    {
      ...endInput,
      supportLengthMm: startSpan.startSupportLengthAlongAxisMm,
      supportCover: startSpan.startSupportCover,
    },
    pack,
  )
  const end = resolveGirderEnd(
    {
      ...endInput,
      supportLengthMm: endSpan.endSupportLengthAlongAxisMm,
      supportCover: endSpan.endSupportCover,
    },
    pack,
  )
  const length = run.coreLengthMm + start.lengthMm + end.lengthMm
  const zones: RebarZone[] = [
    {
      kind: '定着',
      ruleKey: start.lengthRule,
      pathFromMm: 0,
      pathToMm: start.lengthMm,
    },
    {
      kind: '定着',
      ruleKey: end.lengthRule,
      pathFromMm: length - end.lengthMm,
      pathToMm: length,
    },
  ]
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ ` +
    `加算 ${fabricationCoverAdditionRule.value} ＝ ${fabricationCoverMm}）`

  return {
    id: `${run.ownerId}|${row.id}`,
    memberId: run.ownerId,
    role: row.role,
    size: section.main.size,
    shape:
      start.kind === '折曲げ定着' || end.kind === '折曲げ定着'
        ? 'hook90'
        : 'straight',
    points: mainPoints(
      run.coreLengthMm,
      row.y,
      fabricationCoverMm,
      start,
      end,
    ),
    closed: false,
    length,
    count: row.count,
    zones,
    ruleHits: uniqueRuleHits([
      coverRule,
      fabricationCoverAdditionRule,
      ...start.usedRules,
      ...end.usedRules,
    ]),
    formula:
      `加工長 ＝ ${runCoreFormula(run)} ＋ ${endFormula('始端', start)} ` +
      `＋ ${endFormula('終端', end)} ＝ ${length} ／ ` +
      `配置基準 ＝ ${fabricationCoverFormula} ／ ` +
      `本数 ＝ 断面一覧の${row.role}本数 ${row.count} ／ ` +
      `継手 ＝ 未計上（数量積算基準 1通則4)・（３）梁2) が未実装）`,
  }
}

function generateStirrup(
  member: Member,
  span: GirderSpan,
  section: GirderSection,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  hoopLengthAdditionRule: RuleHit,
  distributionAdditionRule: RuleHit,
): Rebar {
  // 規準에 값이 없는 배치값이다 — 断面一覧의 입력을 그대로 쓴다 (ADR-012)
  const startOffsetMm = section.stirrup.startOffsetMm
  const stirrupWidthMm = section.b - 2 * fabricationCoverMm
  const stirrupDepthMm = section.depth - 2 * fabricationCoverMm

  if (stirrupWidthMm <= 0 || stirrupDepthMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `あばら筋 加工寸法 must be positive: ${member.id} ` +
        `(${section.b}×${section.depth} − 2×加工用かぶり ${fabricationCoverMm})`,
    )
  }

  if (span.clear <= 2 * startOffsetMm) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `あばら筋 配置区間 must be positive: ${member.id} ` +
        `(内法 ${span.clear} ≤ 2×初期オフセット ${startOffsetMm})`,
    )
  }

  const layout = stirrupPositions(
    span.clear,
    section.stirrup.pitch,
    startOffsetMm,
  )
  // 数量は積算基準 1通則2) — 断面の設計寸法による周長、フックは計上しない。
  // かぶりを控除した stirrupWidthMm·stirrupDepthMm は 3D 形状 (points) 専用。
  const stirrupLengthMm = hoopDesignLengthMm(
    section.b,
    section.depth,
    hoopLengthAdditionRule,
  )
  // 同 （３）梁3)＋1通則7) — 各梁ごとに、その部分の長さ÷間隔。「大梁」は躯体の
  // 区分で柱に接する内法部分なので、割るのは内法長さ。初期オフセットは関与しない。
  const stirrupCount = distributionCount(
    span.clear,
    section.stirrup.pitch,
    distributionAdditionRule,
  )
  return {
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
    count: stirrupCount,
    placement: {
      axis: 'x',
      clearMm: span.clear,
      pitchMm: section.stirrup.pitch,
      startOffsetMm,
      lastGapMm: layout.lastGapMm,
      positionCount: layout.positionsMm.length,
    },
    ruleHits: [
      hoopLengthAdditionRule,
      distributionAdditionRule,
      coverRule,
      fabricationCoverAdditionRule,
    ],
    // 内訳行は同じ符号の梁を束ねる。内法長さが違っても割付本数が同じなら
    // 一行になるので、内法長さは代表値だと断る。部材ごとに違う 3D 配置の項は
    // 束ねられた他の梁について事実でなくなるため、ここには載せない。
    formula:
      `設計長さ ＝ 断面の設計寸法による周長 2×(${section.b}＋${section.depth}) ` +
      `＝ ${stirrupLengthMm}` +
      `（数量積算基準 1通則2) — かぶりを控除せずフックも計上しない） ／ ` +
      `設計本数 ＝ ⌈内法長さ ${span.clear} ÷ ピッチ ` +
      `${section.stirrup.pitch}⌉ ＋ 1 ＝ ${stirrupCount}` +
      `（同 （３）梁3)・1通則7) — 各梁ごと、内法長さは代表値）`,
  }
}

export function generateGirderRebar(
  input: GirderRebarInput,
  pack: RulePack,
): Rebar[] {
  const { run, section } = input
  if (run.members.length !== run.spans.length || run.members.length === 0) {
    throw new Error('GirderRun members and spans must have the same non-zero length')
  }

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
  // bend.hook135 を引かないのは積算基準 1通則2) が「フックはないものとする」と
  // 定めるからで、その事実自体を measure.hoop.length.addition が出典付きで持つ。
  const hoopLengthAdditionRule = lookupRule(
    pack,
    'measure.hoop.length.addition',
    {},
  )
  const distributionAdditionRule = lookupRule(
    pack,
    'measure.distribution.addition',
    {},
  )
  const stirrups = run.members.map((member, index) =>
    generateStirrup(
      member,
      run.spans[index],
      section,
      coverRule,
      fabricationCoverAdditionRule,
      fabricationCoverMm,
      hoopLengthAdditionRule,
      distributionAdditionRule,
    ),
  )

  return [top, bottom, ...stirrups]
}
