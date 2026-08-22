import type { BarSize, SlabSection } from '../model/member'
import type { SlabRun } from '../model/project'
import type { Rebar, RebarRole, RebarZone } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
import { coverConditions, lookupRule, lookupRuleSeries } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import {
  bandedSpliceRule,
  distributionCount,
  intervalSpliceCount,
  spliceCount,
  spliceLengthMm,
  type SpliceBand,
} from './measurement'
import { resolveSlabEnd, type SlabEndDetail } from './slab-ends'
import { stirrupPositions } from './stirrup-layout'

/**
 * 床板（スラブ）の配筋。数量積算基準 2（４）床板 で測る (ADR-027)。
 *
 * 測る対象は内法だ。躯体の区分（第4編第1章第2節（４））が床板を「柱、梁等に接する
 * 水平材の内法部分」と定めるので、長さは通り芯間ではなく両側の大梁の内側面の間に
 * なる。柱・大梁と二重に計上しないのはこの定義による。
 *
 * 1回の呼び出しが受け持つのは**1つのランの1方向**で、上端筋と下端筋の2本を返す。
 * 床板は2方向に主筋が走るので、X方向とY方向で別々に呼ぶ。
 *
 * ローカル座標は x ＝ X通り方向、y ＝ Y通り方向、z ＝ 鉛直（板の下端が 0）。
 * だから X方向の鉄筋は x に伸びて y へ並び、Y方向の鉄筋は y に伸びて x へ並ぶ。
 *
 * 開口部は扱わない。1通則8)（開口部による鉄筋の欠除・開口補強筋）は壁と同じく
 * tests/golden/fixtures/quantity-r5-ch3.json で deferred のまま残しており、
 * 開口のある床板は過大計上になる — 内訳書が常時告知する (R14)。
 */
export interface SlabRebarInput {
  run: SlabRun
  section: SlabSection
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

function uniqueRuleHits(rules: RuleHit[]): RuleHit[] {
  return [...new Set(rules)]
}

/**
 * 2（４）床板2) の区分表。何区分あるかはルールパックが決めるので行をそのまま読む。
 * 梁の表と違い上限なしの区分がない — 13.5m 以上は原文に定めがなく、
 * bandedSpliceRule が MemberUnsupportedError で落とす。
 */
function continuousSlabBands(pack: RulePack): SpliceBand[] {
  const counts = lookupRuleSeries(pack, 'measure.splice.slab.continuous', 'band')
  const upperBounds = new Map(
    lookupRuleSeries(
      pack,
      'measure.splice.slab.continuous.band.upper',
      'band',
    ).map((rule) => [rule.conditions.band, rule]),
  )

  return counts.map((countRule) => ({
    countRule,
    upperBoundRule: upperBounds.get(countRule.conditions.band) ?? null,
  }))
}

export function generateSlabRebar(
  input: SlabRebarInput,
  pack: RulePack,
): Rebar[] {
  const { run, section } = input
  const coverRule = lookupRule(pack, 'cover.minimum', coverConditions(section))
  const fabricationCoverAdditionRule = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  const distributionAdditionRule = lookupRule(
    pack,
    'measure.distribution.addition',
    {},
  )
  const fabricationCoverMm =
    millimetres(coverRule) + millimetres(fabricationCoverAdditionRule)

  // 加工用かぶり×2 が板厚を超えると上端筋と下端筋が入れ替わり、3D で裏返った
  // 板になる。黙って中央に寄せず、その床板だけ落とす（耐震壁のダブル配筋の
  // 寸法ガードと同じ扱い）。
  if (section.thickness <= 2 * fabricationCoverMm) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `床板の上端筋と下端筋が板厚に入らない: ${run.ownerId} ` +
        `(板厚 ${section.thickness} ≤ 2×加工用かぶり ${fabricationCoverMm})`,
    )
  }

  const shared = {
    run,
    section,
    pack,
    coverRule,
    fabricationCoverAdditionRule,
    distributionAdditionRule,
    fabricationCoverMm,
  }

  // 下端筋を先に出す。板の下から順に積む順序がそのまま内訳の並びになる。
  return [
    buildSlabBar({ ...shared, face: '下端' }),
    buildSlabBar({ ...shared, face: '上端' }),
  ]
}

interface SlabBarInput {
  run: SlabRun
  section: SlabSection
  pack: RulePack
  coverRule: RuleHit
  fabricationCoverAdditionRule: RuleHit
  distributionAdditionRule: RuleHit
  fabricationCoverMm: number
  face: '上端' | '下端'
}

function roleOf(axis: 'X' | 'Y', face: '上端' | '下端'): RebarRole {
  if (axis === 'X') return face === '上端' ? 'X方向上端筋' : 'X方向下端筋'
  return face === '上端' ? 'Y方向上端筋' : 'Y方向下端筋'
}

function buildSlabBar(input: SlabBarInput): Rebar {
  const {
    run,
    section,
    pack,
    coverRule,
    fabricationCoverAdditionRule,
    distributionAdditionRule,
    fabricationCoverMm,
    face,
  } = input

  const row = (run.axis === 'X' ? section.x : section.y)[
    face === '上端' ? 'top' : 'bottom'
  ]
  const diameter = barDiameter(row.size)
  const endInput = {
    barSize: row.size,
    fc: section.fc,
    grade: section.grade,
    face,
  }
  const start = resolveSlabEnd(
    {
      ...endInput,
      supportWidthMm: run.startSupport.widthMm,
      supportCover: run.startSupport.cover,
    },
    pack,
  )
  const end = resolveSlabEnd(
    {
      ...endInput,
      supportWidthMm: run.endSupport.widthMm,
      supportCover: run.endSupport.cover,
    },
    pack,
  )

  // 3D に描かれる長さ。継手は位置が決まらないので描かず、設計長さにだけ入る。
  const drawnLengthMm = run.coreLengthMm + start.lengthMm + end.lengthMm
  const lapRule = lookupRule(pack, 'lap.L1', {
    fc: section.fc,
    grade: section.grade,
    hook: false,
  })
  const lapLengthMm = millimetres(lapRule, diameter)
  const splice = resolveSplice({
    run,
    section,
    size: row.size,
    drawnLengthMm,
    lapRule,
    lapLengthMm,
    pack,
  })
  const lengthMm = drawnLengthMm + splice.lengthMm

  const count = distributionCount(
    run.distributionClearMm,
    row.pitch,
    distributionAdditionRule,
  )
  const layout = stirrupPositions(
    run.distributionClearMm,
    row.pitch,
    row.startOffsetMm,
  )

  // 板厚のどこに立つか。下端筋は板の下から、上端筋は板の上から加工用かぶり。
  const barZ =
    face === '上端' ? section.thickness - fabricationCoverMm : fabricationCoverMm

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
      pathFromMm: drawnLengthMm - end.lengthMm,
      pathToMm: drawnLengthMm,
    },
  ]

  const bent = start.kind === '折曲げ定着' || end.kind === '折曲げ定着'

  return {
    id: `${run.ownerId}|slab-${run.axis}-${face === '上端' ? 'top' : 'bottom'}`,
    memberId: run.ownerId,
    role: roleOf(run.axis, face),
    size: row.size,
    shape: bent ? 'hook90' : 'straight',
    points: slabPoints(run.axis, run.coreLengthMm, barZ, start, end),
    closed: false,
    length: lengthMm,
    count,
    // X方向の鉄筋は x に伸びるので y へ並び、Y方向はその逆である。
    placement: {
      axis: run.axis === 'X' ? 'y' : 'x',
      clearMm: run.distributionClearMm,
      pitchMm: row.pitch,
      startOffsetMm: row.startOffsetMm,
      lastGapMm: layout.lastGapMm,
      positionCount: layout.positionsMm.length,
    },
    splice: {
      method: section.spliceMethod,
      countPerBar: splice.countPerBar,
      lengthMm: splice.lengthMm,
      rules: splice.rules,
      formula:
        `継手箇所数 ＝ ${face}筋1本あたり ${splice.countPerBar}か所` +
        `（${splice.basis}） ／ 方式 ＝ ${section.spliceMethod} ／ ` +
        `設計長さへの算入 ＝ ${spliceLengthTerm(splice, section, lapRule, lapLengthMm)} ／ ` +
        `位置 ＝ 未確定（表5.3.3 が原文で画像 — 3D には描かない）`,
    },
    zones,
    ruleHits: uniqueRuleHits([
      coverRule,
      fabricationCoverAdditionRule,
      distributionAdditionRule,
      ...start.usedRules,
      ...end.usedRules,
      ...splice.rules,
    ]),
    formula:
      `設計長さ ＝ ${runCoreFormula(run)} ＋ ${endFormula('始端', start)} ` +
      `＋ ${endFormula('終端', end)} ＋ 継手 ` +
      `${spliceLengthTerm(splice, section, lapRule, lapLengthMm)} ＝ ${lengthMm} ／ ` +
      `本数 ＝ ⌈割付方向の内法長さ ${run.distributionClearMm} ÷ ピッチ ` +
      `${row.pitch}⌉ ＋ ${distributionAdditionRule.value}` +
      `（数量積算基準 1通則7)）＝ ${count} ／ ` +
      `配置基準 ＝ 加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ 加算 ` +
      `${fabricationCoverAdditionRule.value} ＝ ${fabricationCoverMm}・` +
      `表5.3.6「スラブ、耐力壁以外の壁」） ／ ` +
      `3D 形状 ＝ 継手位置が未確定なので継手を描かない（描かれる加工長 ` +
      `${drawnLengthMm} は設計長さと一致しない・数量には用いない）`,
  }
}

function runCoreFormula(run: SlabRun): string {
  const clearTerms = run.bays
    .map((bay) => (run.axis === 'X' ? bay.clearXMm : bay.clearYMm))
    .join('＋')
  const intermediateTerms = run.bays
    .slice(1)
    .map(
      (bay) =>
        (run.axis === 'X' ? bay.supports.minX : bay.supports.minY).widthMm,
    )
    .join('＋')

  return intermediateTerms === ''
    ? `内法長さ ${clearTerms}`
    : `内法長さ ${clearTerms} ＋ 中間大梁の幅 ${intermediateTerms}` +
        `（2（４）床板1) — 幅の1/2 が両側から来て1本分になる）`
}

function endFormula(label: string, detail: SlabEndDetail): string {
  if (detail.kind === '直線定着') {
    const term =
      detail.lengthRule === 'anchorage.L1'
        ? '一般値 L1'
        : detail.lengthRule === 'anchorage.L3'
          ? 'L3 10d'
          : 'L3 の下限 150mm'
    return `${label} 直線定着 ${term} ${detail.lengthMm}`
  }

  const tailMm = detail.lengthMm - detail.projectionMm
  return (
    `${label} 折曲げ定着 全長 ${detail.lengthMm}` +
    `［(a) 直線定着 L1 ${detail.straightMinimumMm} と ` +
    `(b) 投影＋余長下限 ${detail.tailMinimumMm} の大］` +
    `（内訳 ＝ 投影 ${detail.projectionMm}［(c) 表5.3.5 Lb］ ＋ 垂直余長 ${tailMm}）`
  )
}

function spliceLengthTerm(
  splice: SlabSplice,
  section: SlabSection,
  lapRule: RuleHit,
  lapLengthMm: number,
): string {
  // 0か所で長さが増えないのは箇所数のせいで方式のせいではない — 大梁と同じ理由で
  // 分岐を分ける。まとめると 0か所の単独床板まで「その方式は長さが変わらない」と
  // 説明し、出典に挙げる measure.splice.length.factor と食い違う。
  if (splice.countPerBar === 0) return '0か所 ＝ 0'
  if (splice.lengthMm > 0) {
    return (
      `${splice.countPerBar}か所 × 重ね継手長さ L1 ` +
      `${lapRule.value}d(${lapLengthMm}) ＝ ${splice.lengthMm}`
    )
  }
  return `${splice.countPerBar}か所 — ${section.spliceMethod}は長さの変化なし 0`
}

interface SlabSplice {
  countPerBar: number
  lengthMm: number
  rules: RuleHit[]
  basis: string
}

interface SlabSpliceInput {
  run: SlabRun
  section: SlabSection
  size: BarSize
  drawnLengthMm: number
  lapRule: RuleHit
  lapLengthMm: number
  pack: RulePack
}

/**
 * 2（４）床板2) — ランが2ベイ以上なら「連続する床板」で区分表が 1通則4) を
 * 上書きする。1ベイのランは「単独床板」なので同条ただし書きで 1通則4) に戻り、
 * 径ごとの長さの単位で数える。大梁の resolveSplice と同じ形だ。
 */
function resolveSplice(input: SlabSpliceInput): SlabSplice {
  const { run, section, size, drawnLengthMm, lapRule, lapLengthMm, pack } = input

  let countRule: RuleHit
  let countPerBar: number
  let basis: string

  if (run.members.length === 1) {
    countRule = lookupRule(pack, 'measure.splice.interval', { size })
    countPerBar = intervalSpliceCount(drawnLengthMm, countRule)
    basis =
      `単独床板 鉄筋の長さ ${drawnLengthMm} ÷ ${countRule.value}mm ごと` +
      `（数量積算基準 1通則4) — 2（４）床板2) ただし書き）`
  } else {
    countRule = bandedSpliceRule(run.coreLengthMm, continuousSlabBands(pack))
    countPerBar = spliceCount(countRule)
    basis = `連続床板 床板の長さ ${run.coreLengthMm}（数量積算基準 2（４）床板2)）`
  }

  const factorRule = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const lengthMm = spliceLengthMm(countPerBar, lapLengthMm, factorRule)
  const rules = [countRule, factorRule]
  if (lengthMm > 0) rules.push(lapRule)

  return { countPerBar, lengthMm, rules, basis }
}

/**
 * 加工形状。上端筋が大梁の中で下へ折れ曲がる — 板の中から梁の中へ落ちるので、
 * 折れた先の z は板の下端（0）より下になることがある。それが実際の姿である。
 * 下端筋は折れない（表5.3.5 Lb は上端筋の列、表5.3.4 L3h のスラブ欄は「─」）。
 */
function slabPoints(
  axis: 'X' | 'Y',
  coreLengthMm: number,
  barZ: number,
  start: SlabEndDetail,
  end: SlabEndDetail,
): Rebar['points'] {
  const at = (along: number, z: number): [number, number, number] =>
    axis === 'X' ? [along, 0, z] : [0, along, z]
  const points: Rebar['points'] = []

  if (start.kind === '直線定着') {
    points.push(at(-start.lengthMm, barZ))
  } else {
    const tailMm = start.lengthMm - start.projectionMm
    points.push(
      at(-start.projectionMm, barZ - tailMm),
      at(-start.projectionMm, barZ),
    )
  }

  if (end.kind === '直線定着') {
    points.push(at(coreLengthMm + end.lengthMm, barZ))
  } else {
    const tailMm = end.lengthMm - end.projectionMm
    points.push(
      at(coreLengthMm + end.projectionMm, barZ),
      at(coreLengthMm + end.projectionMm, barZ - tailMm),
    )
  }

  return points
}
