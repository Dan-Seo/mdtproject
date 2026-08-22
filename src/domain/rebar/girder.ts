import type { GirderSection, Member } from '../model/member'
import type { GirderRun, GirderSpan } from '../model/project'
import type { Rebar, RebarZone } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
import {
  coverConditions,
  lookupRule,
  lookupRuleSeries,
} from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import {
  barDiameter,
  resolveGirderEnd,
  type GirderEndDetail,
} from './girder-ends'
import {
  bandedSpliceRule,
  distributionCount,
  hoopDesignLengthMm,
  intervalSpliceCount,
  spliceCount,
  spliceLengthMm,
  type SpliceBand,
} from './measurement'
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

/** 始端側の定着を描く点列。x は run 原点（始端柱の内側面）が 0 である。 */
function startAnchorPoints(
  start: GirderEndDetail,
  y: number,
  z: number,
): Rebar['points'] {
  if (start.kind === '直線定着') return [[-start.lengthMm, y, z]]

  const verticalTailMm = start.lengthMm - start.projectionMm
  const direction = start.direction === '上' ? 1 : -1
  return [
    [-start.projectionMm, y + direction * verticalTailMm, z],
    [-start.projectionMm, y, z],
  ]
}

/** 終端側の定着を描く点列。x の原点は始端と同じ。 */
function endAnchorPoints(
  atMm: number,
  end: GirderEndDetail,
  y: number,
  z: number,
): Rebar['points'] {
  if (end.kind === '直線定着') return [[atMm + end.lengthMm, y, z]]

  const verticalTailMm = end.lengthMm - end.projectionMm
  const direction = end.direction === '上' ? 1 : -1
  return [
    [atMm + end.projectionMm, y, z],
    [atMm + end.projectionMm, y + direction * verticalTailMm, z],
  ]
}

function mainPoints(
  clearMm: number,
  y: number,
  z: number,
  start: GirderEndDetail,
  end: GirderEndDetail,
): Rebar['points'] {
  return [
    ...startAnchorPoints(start, y, z),
    ...endAnchorPoints(clearMm, end, y, z),
  ]
}

/**
 * （３）梁2) の区分表。何区分あるかはルールパックが決めるので、行をそのまま読む。
 * 上限を持たない行が最後の区分になる — 判定は bandedSpliceRule がやる。
 */
function continuousGirderBands(pack: RulePack): SpliceBand[] {
  const counts = lookupRuleSeries(
    pack,
    'measure.splice.girder.continuous',
    'band',
  )
  const upperBounds = new Map(
    lookupRuleSeries(
      pack,
      'measure.splice.girder.continuous.band.upper',
      'band',
    ).map((rule) => [rule.conditions.band, rule]),
  )

  return counts.map((countRule) => ({
    countRule,
    upperBoundRule: upperBounds.get(countRule.conditions.band) ?? null,
  }))
}

interface GirderSplice {
  countPerBar: number
  lengthMm: number
  rules: RuleHit[]
  basis: string
}

/**
 * 通し筋の継手 (数量積算基準)。
 *
 * ランが2スパン以上なら「連続する梁の全長にわたる主筋」なので （３）梁2) の
 * 区分表が 1通則4) を上書きする。1スパンのランは単独梁なので同条ただし書きで
 * 1通則4) に戻り、径ごとの長さの単位で数える。
 */
function resolveSplice(
  run: GirderRun,
  section: GirderSection,
  designLengthBeforeSpliceMm: number,
  lapRule: RuleHit,
  lapLengthMm: number,
  pack: RulePack,
): GirderSplice {
  const continuous = run.members.length > 1
  const countRule = continuous
    ? bandedSpliceRule(run.coreLengthMm, continuousGirderBands(pack))
    : lookupRule(pack, 'measure.splice.interval', { size: section.main.size })
  const countPerBar = continuous
    ? spliceCount(countRule)
    : intervalSpliceCount(designLengthBeforeSpliceMm, countRule)
  const factorRule = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const lengthMm = spliceLengthMm(countPerBar, lapLengthMm, factorRule)
  const rules = [countRule, factorRule]

  if (lengthMm > 0) rules.push(lapRule)

  return {
    countPerBar,
    lengthMm,
    rules,
    basis: continuous
      ? `連続梁 梁の長さ ${run.coreLengthMm}（数量積算基準 2（３）梁2)）`
      : `単独梁 鉄筋の長さ ${designLengthBeforeSpliceMm} ÷ ${countRule.value}mm ごと（同 1通則4)）`,
  }
}

interface MainRow {
  id: 'top' | 'bottom'
  role: '上端筋' | '下端筋'
  /** 全長にわたる主筋の本数 */
  count: number
  /** その本数がどこから来たか — 位置別に本数が違う断面では小さい方を採った旨 */
  countBasis: string
  y: number
  bendDirection: '上' | '下'
}

interface GeneratedMain {
  rebar: Rebar
  start: GirderEndDetail
  end: GirderEndDetail
  lapRule: RuleHit
  lapLengthMm: number
}

function generateMain(
  input: GirderRebarInput,
  pack: RulePack,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  row: MainRow,
): GeneratedMain {
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
  // 3D に描かれる長さ。継手は位置が決まらないので描かず、設計長さにだけ入る。
  const drawnLength = run.coreLengthMm + start.lengthMm + end.lengthMm
  const lapRule = lookupRule(pack, 'lap.L1', {
    fc: section.fc,
    grade: section.grade,
    hook: false,
  })
  const lapLengthMm = millimetres(lapRule, barDiameter(section.main.size))
  const splice = resolveSplice(
    run,
    section,
    drawnLength,
    lapRule,
    lapLengthMm,
    pack,
  )
  const length = drawnLength + splice.lengthMm
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
      pathFromMm: drawnLength - end.lengthMm,
      pathToMm: drawnLength,
    },
  ]
  // 0か所で長さが増えないのは箇所数のせいで、方式のせいではない。
  // 一つの分岐にまとめると 0か所の単独梁まで「その方式は長さが変わらない」と
  // 説明し、同じ行が出典に挙げる measure.splice.length.factor と食い違う。
  const spliceLengthTerm =
    splice.countPerBar === 0
      ? `0か所 ＝ 0`
      : splice.lengthMm > 0
        ? `${splice.countPerBar}か所 × 重ね継手長さ L1 ${lapRule.value}d(${lapLengthMm}) ＝ ${splice.lengthMm}`
        : `${splice.countPerBar}か所 — ${section.spliceMethod}は長さの変化なし 0`
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ ` +
    `加算 ${fabricationCoverAdditionRule.value} ＝ ${fabricationCoverMm}）`

  const rebar: Rebar = {
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
    splice: {
      method: section.spliceMethod,
      countPerBar: splice.countPerBar,
      lengthMm: splice.lengthMm,
      rules: splice.rules,
      formula:
        `継手箇所数 ＝ ${row.role}1本あたり ${splice.countPerBar}か所` +
        `（${splice.basis}） ／ ` +
        `方式 ＝ ${section.spliceMethod} ／ ` +
        `設計長さへの算入 ＝ ${spliceLengthTerm} ／ ` +
        `位置 ＝ 未確定（表5.3.3 が原文で画像 — 3D には描かない）`,
    },
    ruleHits: uniqueRuleHits([
      coverRule,
      fabricationCoverAdditionRule,
      ...start.usedRules,
      ...end.usedRules,
      ...splice.rules,
    ]),
    formula:
      `設計長さ ＝ ${runCoreFormula(run)} ＋ ${endFormula('始端', start)} ` +
      `＋ ${endFormula('終端', end)} ＋ 継手 ${spliceLengthTerm} ＝ ${length} ／ ` +
      `配置基準 ＝ ${fabricationCoverFormula} ／ ` +
      `本数 ＝ ${row.countBasis} ／ ` +
      `3D 形状 ＝ 継手位置が未確定なので継手を描かない` +
      `（描かれる加工長 ${drawnLength} は設計長さと一致しない・数量には用いない）`,
  }

  return { rebar, start, end, lapRule, lapLengthMm }
}

/**
 * 全長にわたらない主筋（端部だけ・中央だけに入る追加筋）の一区間。
 *
 * 数量積算基準 2（３）梁1) は「梁の全長にわたる主筋」の長さだけを定め、
 * 「トップ筋、ハンチ部分の主筋、補強筋等は設計図書による」と委ねる。
 * したがってこの区間の長さを決めるのは規準ではなく断面一覧の入力（止め位置）で
 * あり、定着だけが標準仕様書 5章の表から来る。
 */
interface PartialSegment {
  id: string
  zoneLabel: string
  points: Rebar['points']
  lengthMm: number
  zones: RebarZone[]
  anchorRules: RuleHit[]
  lengthFormula: string
}

function endPartialSegments(
  run: GirderRun,
  cutoffMm: number,
  y: number,
  z: number,
  start: GirderEndDetail,
  end: GirderEndDetail,
): PartialSegment[] {
  const segments: PartialSegment[] = [
    {
      id: '始端',
      zoneLabel: '始端',
      points: [...startAnchorPoints(start, y, z), [cutoffMm, y, z]],
      lengthMm: start.lengthMm + cutoffMm,
      zones: [
        {
          kind: '定着',
          ruleKey: start.lengthRule,
          pathFromMm: 0,
          pathToMm: start.lengthMm,
        },
      ],
      anchorRules: start.usedRules,
      lengthFormula: `${endFormula('始端', start)} ＋ 止め位置 ${cutoffMm}`,
    },
  ]

  // 中間支点では追加筋も通し筋と同じように接合部を貫くので定着は付かない。
  // 両側のスパンに止め位置まで伸びる1本である (R7②と同じ理由)。
  run.spans.slice(0, -1).forEach((span, index) => {
    const supportFromMm = run.memberOffsetsMm[index] + span.clear
    const supportToMm = run.memberOffsetsMm[index + 1]
    segments.push({
      id: `中間支点${index + 1}`,
      zoneLabel: `中間支点${index + 1}`,
      points: [
        [supportFromMm - cutoffMm, y, z],
        [supportToMm + cutoffMm, y, z],
      ],
      lengthMm: supportToMm - supportFromMm + 2 * cutoffMm,
      zones: [],
      anchorRules: [],
      lengthFormula:
        `止め位置 ${cutoffMm} ＋ 中間柱せい ${supportToMm - supportFromMm} ` +
        `＋ 止め位置 ${cutoffMm}`,
    })
  })

  segments.push({
    id: '終端',
    zoneLabel: '終端',
    points: [
      [run.coreLengthMm - cutoffMm, y, z],
      ...endAnchorPoints(run.coreLengthMm, end, y, z),
    ],
    lengthMm: cutoffMm + end.lengthMm,
    zones: [
      {
        kind: '定着',
        ruleKey: end.lengthRule,
        pathFromMm: cutoffMm,
        pathToMm: cutoffMm + end.lengthMm,
      },
    ],
    anchorRules: end.usedRules,
    lengthFormula: `止め位置 ${cutoffMm} ＋ ${endFormula('終端', end)}`,
  })

  return segments
}

function centerPartialSegments(
  run: GirderRun,
  cutoffMm: number,
  y: number,
  z: number,
): PartialSegment[] {
  return run.spans.map((span, index) => {
    const fromMm = run.memberOffsetsMm[index] + cutoffMm
    return {
      id: `中央${index + 1}`,
      zoneLabel: run.spans.length === 1 ? '中央' : `中央${index + 1}`,
      points: [
        [fromMm, y, z],
        [fromMm + span.clear - 2 * cutoffMm, y, z],
      ] as Rebar['points'],
      lengthMm: span.clear - 2 * cutoffMm,
      zones: [],
      anchorRules: [],
      lengthFormula:
        `内法長さ ${span.clear} − 止め位置 ${cutoffMm} × 2`,
    }
  })
}

/**
 * 全長にわたらない主筋の継手 (数量積算基準 1通則4))。
 *
 * （３）梁2) の区分表は「連続する梁の**全長にわたる**主筋」の継手にしか及ばない
 * ので、ここは一般則の 1通則4) — 径ごとの長さの単位で数える — に戻る。
 */
function partialSplice(
  section: GirderSection,
  lengthMm: number,
  lapRule: RuleHit,
  lapLengthMm: number,
  pack: RulePack,
): { countPerBar: number; lengthMm: number; rules: RuleHit[]; term: string } {
  const countRule = lookupRule(pack, 'measure.splice.interval', {
    size: section.main.size,
  })
  const countPerBar = intervalSpliceCount(lengthMm, countRule)
  const factorRule = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const addedMm = spliceLengthMm(countPerBar, lapLengthMm, factorRule)
  const rules = [countRule, factorRule]
  if (addedMm > 0) rules.push(lapRule)

  return {
    countPerBar,
    lengthMm: addedMm,
    rules,
    term:
      countPerBar === 0
        ? '0か所 ＝ 0'
        : addedMm > 0
          ? `${countPerBar}か所 × 重ね継手長さ L1 ${lapRule.value}d(${lapLengthMm}) ＝ ${addedMm}`
          : `${countPerBar}か所 — ${section.spliceMethod}は長さの変化なし 0`,
  }
}

function generatePartialRebar(
  input: GirderRebarInput,
  pack: RulePack,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  row: MainRow,
  zone: '端部' | '中央',
  count: number,
  segment: PartialSegment,
  lapRule: RuleHit,
  lapLengthMm: number,
): Rebar {
  const { section } = input
  const splice = partialSplice(
    section,
    segment.lengthMm,
    lapRule,
    lapLengthMm,
    pack,
  )
  const length = segment.lengthMm + splice.lengthMm
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ ` +
    `加算 ${fabricationCoverAdditionRule.value} ＝ ${fabricationCoverMm}）`

  return {
    id: `${input.run.ownerId}|${row.id}-${zone === '端部' ? 'end' : 'center'}-${segment.id}`,
    memberId: input.run.ownerId,
    role: row.role,
    size: section.main.size,
    shape: segment.zones.length > 0 ? 'hook90' : 'straight',
    points: segment.points,
    closed: false,
    length,
    count,
    // 通し筋と同じ高さに置くと重なる。あきを定める行が確保した文献にないので
    // domain の points には段を書かず、段番号だけ渡して表示部でずらす。
    layerIndex: 1,
    zones: segment.zones,
    splice: {
      method: section.spliceMethod,
      countPerBar: splice.countPerBar,
      lengthMm: splice.lengthMm,
      rules: splice.rules,
      formula:
        `継手箇所数 ＝ ${row.role}(${segment.zoneLabel})1本あたり ` +
        `${splice.countPerBar}か所（全長にわたらない主筋なので ` +
        `（３）梁2) の区分表ではなく 1通則4)） ／ ` +
        `方式 ＝ ${section.spliceMethod} ／ ` +
        `設計長さへの算入 ＝ ${splice.term}`,
    },
    ruleHits: uniqueRuleHits([
      coverRule,
      fabricationCoverAdditionRule,
      ...segment.anchorRules,
      ...splice.rules,
    ]),
    formula:
      `設計長さ ＝ ${segment.lengthFormula} ＋ 継手 ${splice.term} ＝ ${length}` +
      `（数量積算基準 2（３）梁1) は全長にわたらない主筋を「設計図書による」と` +
      `委ねる — 止め位置 ${section.main.cutoffMm} は断面一覧の入力） ／ ` +
      `配置区間 ＝ ${segment.zoneLabel} ／ ` +
      `本数 ＝ 断面一覧の${zone}欄と中央欄の差 ${count} ／ ` +
      `配置基準 ＝ ${fabricationCoverFormula} ／ ` +
      `3D 形状 ＝ 段のあきを定める行が出典にないので通し筋と同じ高さで描く`,
  }
}

/**
 * 位置別に本数が分かれている断面の追加主筋。
 *
 * 全長にわたる本数（＝どの位置にもある本数）は中央欄と端部欄の小さい方とする。
 * これは条文ではなく実務の読み方なので、算出式にその旨を書いて跡を残す (R2)。
 */
function generatePartials(
  input: GirderRebarInput,
  pack: RulePack,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  row: MainRow,
  endCount: number,
  centerCount: number,
  main: GeneratedMain,
): Rebar[] {
  const { run, section } = input
  const endExtra = endCount - row.count
  const centerExtra = centerCount - row.count
  if (endExtra === 0 && centerExtra === 0) return []

  const cutoffMm = section.main.cutoffMm
  if (cutoffMm === undefined) {
    throw new MemberUnsupportedError(
      '止め位置未入力',
      `大梁 ${section.mark} の${row.role}は位置により本数が違う` +
        `（端部 ${endCount}・中央 ${centerCount}）が、止め位置が入力されていない`,
    )
  }
  if (cutoffMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `大梁 止め位置 must be positive: ${section.mark} (${cutoffMm} mm)`,
    )
  }
  for (const span of run.spans) {
    if (span.clear <= 2 * cutoffMm) {
      throw new MemberUnsupportedError(
        '寸法不成立',
        `大梁 内法長さ must exceed both 止め位置: ${section.mark} ` +
          `(内法 ${span.clear} ≤ 2×止め位置 ${cutoffMm})`,
      )
    }
  }

  const z = fabricationCoverMm
  const segments: Array<{ zone: '端部' | '中央'; count: number; segment: PartialSegment }> = []

  if (endExtra > 0) {
    for (const segment of endPartialSegments(
      run,
      cutoffMm,
      row.y,
      z,
      main.start,
      main.end,
    )) {
      segments.push({ zone: '端部', count: endExtra, segment })
    }
  }
  if (centerExtra > 0) {
    for (const segment of centerPartialSegments(run, cutoffMm, row.y, z)) {
      segments.push({ zone: '中央', count: centerExtra, segment })
    }
  }

  return segments.map(({ zone, count, segment }) =>
    generatePartialRebar(
      input,
      pack,
      coverRule,
      fabricationCoverAdditionRule,
      fabricationCoverMm,
      row,
      zone,
      count,
      segment,
      main.lapRule,
      main.lapLengthMm,
    ),
  )
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
    // 設計長さ・設計本数を決めたのはこの2条項だけだ。かぶりは 3D 形状
    // (points) にしか効かないので、載せると算出式に現れない行を根拠として
    // 示すことになる — その梁のかぶり出典は上端筋・下端筋の行が持つ。
    ruleHits: [hoopLengthAdditionRule, distributionAdditionRule],
    // 内訳行は同じ符号の梁を束ねる。内法長さが違っても割付本数が同じなら
    // 一行になるので、内法長さは代表値だと断る。部材ごとに違う 3D 配置の項は
    // 束ねられた他の梁について事実でなくなるため、ここには載せない。
    formula:
      `設計長さ ＝ 断面の設計寸法による周長 2×(${section.b}＋${section.depth}) ` +
      `＝ ${stirrupLengthMm}` +
      `（数量積算基準 1通則2) — かぶりを控除せずフックも計上しない） ／ ` +
      `設計本数 ＝ ⌈内法長さ ${span.clear} ÷ ピッチ ` +
      `${section.stirrup.pitch}⌉ ＋ 1 ＝ ${stirrupCount}` +
      `（同 （３）梁3)・1通則7) — 各梁ごと、内法長さは代表値） ／ ` +
      `3D 形状 ＝ 実配筋（かぶりを控除し初期オフセットを見込むため、` +
      `表示される長さ・本数は設計値と一致しない・数量には用いない）`,
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

  // 断面一覧が位置別に本数を分けていない断面では端部欄＝中央欄であり、
  // 追加筋は 0 本になって v6 までとまったく同じ結果に落ちる。
  const rowInputs = [
    {
      id: 'top' as const,
      role: '上端筋' as const,
      centerCount: section.main.topCount,
      endCount: section.main.endCount?.topCount ?? section.main.topCount,
      y: section.depth - fabricationCoverMm,
      bendDirection: '下' as const,
    },
    {
      id: 'bottom' as const,
      role: '下端筋' as const,
      centerCount: section.main.bottomCount,
      endCount: section.main.endCount?.bottomCount ?? section.main.bottomCount,
      y: fabricationCoverMm,
      bendDirection: '上' as const,
    },
  ]
  const mains = rowInputs.map((rowInput) => {
    const throughCount = Math.min(rowInput.centerCount, rowInput.endCount)
    const row: MainRow = {
      id: rowInput.id,
      role: rowInput.role,
      count: throughCount,
      countBasis:
        rowInput.centerCount === rowInput.endCount
          ? `断面一覧の${rowInput.role}本数 ${throughCount}`
          : `全長にわたる主筋 ${throughCount}（断面一覧 端部 ` +
            `${rowInput.endCount}・中央 ${rowInput.centerCount} の小さい方 — ` +
            `どの位置にもある本数が全長を通ると読む。条文にはない実務の読み方）`,
      y: rowInput.y,
      bendDirection: rowInput.bendDirection,
    }
    const main = generateMain(
      input,
      pack,
      coverRule,
      fabricationCoverAdditionRule,
      fabricationCoverMm,
      row,
    )
    const partials = generatePartials(
      input,
      pack,
      coverRule,
      fabricationCoverAdditionRule,
      fabricationCoverMm,
      row,
      rowInput.endCount,
      rowInput.centerCount,
      main,
    )
    return { rebar: main.rebar, partials }
  })
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

  return [
    ...mains.map(({ rebar }) => rebar),
    ...mains.flatMap(({ partials }) => partials),
    ...stirrups,
  ]
}
