import type { BarSize, Member, WallSection } from '../model/member'
import type { WallSpan } from '../model/project'
import type { Rebar, RebarSplice, RebarZone } from '../model/rebar'
import { MemberUnsupportedError } from '../model/unsupported'
import { coverConditions, lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import {
  distributionCount,
  intervalSpliceCount,
  spliceCount,
  spliceLengthMm,
} from './measurement'
import { stirrupPositions } from './stirrup-layout'

/**
 * 耐震壁（ラーメン構造の壁）の配筋。数量積算基準 2（５）壁**1)**「壁式構造以外」
 * だけを実装する — 2)「壁式構造」は端部筋・壁梁筋まで区分が増える別の条文である。
 *
 * 測る対象は内法だ。躯体の区分（第4編第1章第2節（５）壁）が壁を「柱、梁、床板等に
 * 接する垂直材の内法部分」と定めるので、高さは階高ではなく内法高さ、長さは
 * 柱心間ではなく内法長さになる。柱・大梁と二重に計上しないのはこの定義による。
 *
 * 開口部は扱わない。1通則8)（開口部による鉄筋の欠除・開口補強筋）は
 * tests/golden/fixtures/quantity-r5-ch3.json で deferred のまま残している。
 */
export interface WallRebarInput {
  member: Member
  section: WallSection
  span: WallSpan
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

export function generateWallRebar(
  input: WallRebarInput,
  pack: RulePack,
): Rebar[] {
  const { member, section, span } = input
  const conditions = { fc: section.fc, grade: section.grade, hook: false }

  const coverRule = lookupRule(pack, 'cover.minimum', coverConditions(section))
  const fabricationCoverAdditionRule = lookupRule(
    pack,
    'cover.fabrication.addition',
    {},
  )
  // 定着は表5.3.4 の一般値 L1。同表に壁専用の列はなく、L2 は小梁・L3 はスラブに
  // 限られる（表頭がその2つだけを名指す）ので、壁筋は一般値を引く。
  const anchorageRule = lookupRule(pack, 'anchorage.L1', conditions)
  const tableLapRule = lookupRule(pack, 'lap.L1', conditions)
  // 5.3.4(3)(ｱ) — 耐力壁だけが持つ下限。柱・梁の主筋と違い表5.3.2 の値をそのまま
  // 使わず、40d と比べて大きい方を取る。
  const wallLapMinimumRule = lookupRule(pack, 'lap.wall.minimum', {})
  const spliceFactorRule = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const distributionAdditionRule = lookupRule(
    pack,
    'measure.distribution.addition',
    {},
  )

  const minimumCover = millimetres(coverRule)
  const fabricationCover =
    minimumCover + millimetres(fabricationCoverAdditionRule)
  const layerOffsets = wallLayerOffsets(member, section, fabricationCover)

  const shared = {
    member,
    section,
    layerOffsets,
    anchorageRule,
    tableLapRule,
    wallLapMinimumRule,
    spliceFactorRule,
    distributionAdditionRule,
    coverRule,
    fabricationCoverAdditionRule,
    fabricationCover,
    pack,
  }

  return [
    buildWallBar({
      ...shared,
      role: '縦筋',
      size: section.vertical.size,
      pitchMm: section.vertical.pitch,
      startOffsetMm: section.vertical.startOffsetMm,
      // 縦筋は壁の高さを測り、内法長さに割り付ける。
      bodyLengthMm: span.clearHeightMm,
      distributionOverMm: span.clearLengthMm,
      bodyLabel: '内法高さ',
      distributionLabel: '内法長さ',
      repeatAxis: 'x',
    }),
    buildWallBar({
      ...shared,
      role: '横筋',
      size: section.horizontal.size,
      pitchMm: section.horizontal.pitch,
      startOffsetMm: section.horizontal.startOffsetMm,
      // 横筋は壁の長さを測り、内法高さに割り付ける。
      bodyLengthMm: span.clearLengthMm,
      distributionOverMm: span.clearHeightMm,
      bodyLabel: '内法長さ',
      distributionLabel: '内法高さ',
      repeatAxis: 'y',
    }),
  ]
}

/**
 * 配筋の層が壁厚のどこに立つか (mm)。ダブルは両面のかぶり位置、シングルは
 * 厚さの中央である。3D 形状にしか効かない — 数量は層数だけを見る。
 */
function wallLayerOffsets(
  member: Member,
  section: WallSection,
  fabricationCover: number,
): number[] {
  if (section.layers === 1) return [section.thickness / 2]

  const inner = section.thickness - fabricationCover

  // 加工用かぶり×2 が壁厚を超えると2層が入れ替わり、3D で裏返った壁になる。
  // 黙って中央に寄せず、その部材だけ落とす（柱の加工寸法ガードと同じ扱い）。
  if (inner <= fabricationCover) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `耐震壁 ダブル配筋 must fit the 壁厚: ${member.id} ` +
        `(壁厚 ${section.thickness} ≤ 2×加工用かぶり ${fabricationCover})`,
    )
  }

  return [fabricationCover, inner]
}

interface WallBarInput {
  member: Member
  section: WallSection
  role: '縦筋' | '横筋'
  size: BarSize
  pitchMm: number
  startOffsetMm: number
  bodyLengthMm: number
  distributionOverMm: number
  bodyLabel: string
  distributionLabel: string
  repeatAxis: 'x' | 'y'
  layerOffsets: number[]
  anchorageRule: RuleHit
  tableLapRule: RuleHit
  wallLapMinimumRule: RuleHit
  spliceFactorRule: RuleHit
  distributionAdditionRule: RuleHit
  coverRule: RuleHit
  fabricationCoverAdditionRule: RuleHit
  fabricationCover: number
  pack: RulePack
}

function buildWallBar(input: WallBarInput): Rebar {
  const {
    member,
    section,
    role,
    size,
    pitchMm,
    startOffsetMm,
    bodyLengthMm,
    distributionOverMm,
    bodyLabel,
    distributionLabel,
    repeatAxis,
    layerOffsets,
    anchorageRule,
    tableLapRule,
    wallLapMinimumRule,
    spliceFactorRule,
    distributionAdditionRule,
    coverRule,
    fabricationCoverAdditionRule,
    fabricationCover,
    pack,
  } = input

  const diameter = barDiameter(size)
  const anchorageMm = millimetres(anchorageRule, diameter)
  const tableLapMm = millimetres(tableLapRule, diameter)
  const wallLapMinimumMm = millimetres(wallLapMinimumRule, diameter)
  const lapMm = Math.max(tableLapMm, wallLapMinimumMm)

  // 3D に描かれる長さ。継手は位置が決まらないので描かない（表5.3.3 が原文で画像）。
  const drawnLengthMm = bodyLengthMm + 2 * anchorageMm

  const splice = resolveWallSplice({
    role,
    section,
    size,
    drawnLengthMm,
    lapMm,
    tableLapRule,
    wallLapMinimumRule,
    spliceFactorRule,
    pack,
  })

  const designLengthMm = drawnLengthMm + splice.lengthMm

  // 1通則7) の割付本数は1層分だ。層数（シングル／ダブル）は規準ではなく
  // 壁リストの記載であり、断面一覧の入力である (ADR-012)。
  const perLayerCount = distributionCount(
    distributionOverMm,
    pitchMm,
    distributionAdditionRule,
  )
  const count = perLayerCount * section.layers
  const layout = stirrupPositions(distributionOverMm, pitchMm, startOffsetMm)

  const zones: RebarZone[] = [
    {
      kind: '定着',
      ruleKey: anchorageRule.key,
      pathFromMm: 0,
      pathToMm: anchorageMm,
    },
    {
      kind: '定着',
      ruleKey: anchorageRule.key,
      pathFromMm: drawnLengthMm - anchorageMm,
      pathToMm: drawnLengthMm,
    },
  ]

  // 代表1本は繰り返し軸の原点に置く — 実際の位置は placement が与える。
  // 帯筋・あばら筋と同じ約束で、表示部が断面からピッチを拾い直さないためである。
  const z = layerOffsets[0]
  const points: [number, number, number][] =
    role === '縦筋'
      ? [
          [0, -anchorageMm, z],
          [0, bodyLengthMm + anchorageMm, z],
        ]
      : [
          [-anchorageMm, 0, z],
          [bodyLengthMm + anchorageMm, 0, z],
        ]

  const anchorageTarget = role === '縦筋' ? '上下の大梁・床板' : '両側の柱'
  const layerTerm =
    section.layers === 1 ? 'シングル配筋 ×1' : `ダブル配筋 ×${section.layers}`

  return {
    id: `${member.id}|${role === '縦筋' ? 'vertical' : 'horizontal'}`,
    memberId: member.id,
    role,
    size,
    shape: 'straight',
    points,
    closed: false,
    length: designLengthMm,
    count,
    placement: {
      axis: repeatAxis,
      clearMm: distributionOverMm,
      pitchMm,
      startOffsetMm,
      lastGapMm: layout.lastGapMm,
      positionCount: layout.positionsMm.length,
    },
    splice,
    zones,
    ruleHits: [
      coverRule,
      fabricationCoverAdditionRule,
      anchorageRule,
      distributionAdditionRule,
      ...splice.rules,
    ],
    formula:
      `設計長さ ＝ ${bodyLabel} ${bodyLengthMm} ＋ 定着 L1 ` +
      `${anchorageRule.value}d(${anchorageMm}) × 2（両端 — ${anchorageTarget}へ定着）` +
      ` ＋ 継手 ${splice.formula} ＝ ${designLengthMm} ／ ` +
      `本数 ＝ ⌈${distributionLabel} ${distributionOverMm} ÷ ピッチ ${pitchMm}⌉ ` +
      `＋ ${distributionAdditionRule.value}（数量積算基準 1通則7)）＝ ${perLayerCount}` +
      ` × ${layerTerm} ＝ ${count} ／ ` +
      `配置基準 ＝ 加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ 加算 ` +
      `${fabricationCoverAdditionRule.value} ＝ ${fabricationCover}） ／ ` +
      `3D 形状 ＝ 継手位置が未確定なので継手を描かない（描かれる長さ ` +
      `${drawnLengthMm} は設計長さと一致しない・数量には用いない）`,
  }
}

interface WallSpliceInput {
  role: '縦筋' | '横筋'
  section: WallSection
  size: BarSize
  drawnLengthMm: number
  lapMm: number
  tableLapRule: RuleHit
  wallLapMinimumRule: RuleHit
  spliceFactorRule: RuleHit
  pack: RulePack
}

/**
 * 2（５）壁1)② — 縦筋と横筋で数え方が分かれる唯一の条文である。
 * 「縦筋の継手は原則として各階に１か所あるものとし……また、横筋の継手は、
 *  １通則４）による」。
 */
function resolveWallSplice(input: WallSpliceInput): RebarSplice {
  const {
    role,
    section,
    size,
    drawnLengthMm,
    lapMm,
    tableLapRule,
    wallLapMinimumRule,
    spliceFactorRule,
    pack,
  } = input

  let countRule: RuleHit
  let countPerBar: number
  let countFormula: string

  if (role === '縦筋') {
    countRule = lookupRule(pack, 'measure.splice.wall.vertical', {})
    countPerBar = spliceCount(countRule)
    countFormula = `${countPerBar}か所（数量積算基準 2（５）壁1)② — 縦筋の継手は各階に1か所）`
  } else {
    countRule = lookupRule(pack, 'measure.splice.interval', { size })
    countPerBar = intervalSpliceCount(drawnLengthMm, countRule)
    countFormula =
      `鉄筋の長さ ${drawnLengthMm} ÷ ${countRule.value}mm ごと ＝ ${countPerBar}か所` +
      `（数量積算基準 2（５）壁1)② が 1通則4) に戻す）`
  }

  const lengthMm = spliceLengthMm(countPerBar, lapMm, spliceFactorRule)
  const rules: RuleHit[] = [countRule, spliceFactorRule]
  if (lengthMm > 0) rules.push(tableLapRule, wallLapMinimumRule)

  const lapTerm =
    lengthMm > 0
      ? `${countPerBar}か所 × 重ね継手長さ ${lapMm}（標準仕様書 5.3.4(3)(ｱ) — ` +
        `表5.3.2 の ${tableLapRule.value}d と耐力壁の下限 ` +
        `${wallLapMinimumRule.value}d の大きい方）＝ ${lengthMm}`
      : `${countPerBar}か所 — ${section.spliceMethod}は長さの変化なし 0`

  return {
    method: section.spliceMethod,
    countPerBar,
    lengthMm,
    rules,
    formula:
      `継手箇所数 ＝ ${countFormula} ／ 方式 ＝ ${section.spliceMethod} ／ ` +
      `設計長さへの算入 ＝ ${lapTerm} ／ ` +
      `位置 ＝ 未確定（表5.3.3 が原文で画像 — 3D には描かない）`,
  }
}
