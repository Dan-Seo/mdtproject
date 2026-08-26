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
import { openingDeduction } from './opening'
import { stirrupPositions } from './stirrup-layout'

/**
 * 耐震壁（ラーメン構造の壁）の配筋。数量積算基準 2（５）壁**1)**「壁式構造以外」
 * だけを実装する — 2)「壁式構造」は端部筋・壁梁筋まで区分が増える別の条文である。
 *
 * 測る対象は内法だ。躯体の区分（第4編第1章第2節（５）壁）が壁を「柱、梁、床板等に
 * 接する垂直材の内法部分」と定めるので、高さは階高ではなく内法高さ、長さは
 * 柱心間ではなく内法長さになる。柱・大梁と二重に計上しないのはこの定義による。
 *
 * 開口部は 1通則8) で欠除する — `Member.openings` が受け取った内法寸法だけ、
 * その開口を横切る本を短くし、欠除量ごとに内訳の行を分ける。開口を横切った
 * 縦筋の継手は同じ 2（５）壁1)② の但書で 0か所になる。開口補強筋は同項が
 * 「設計図書により計測・計算する」と委任するので製品は作らない (ADR-029・R14)。
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
    span,
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
    ...buildWallBars({
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
      barAxis: 'y',
    }),
    ...buildWallBars({
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
      barAxis: 'x',
    }),
    ...openingReinforcementRebars(member),
  ]
}

function openingReinforcementRebars(member: Member): Rebar[] {
  return (member.openings ?? []).flatMap((opening) =>
    (opening.reinforcements ?? []).map(
      (reinforcement, index): Rebar => ({
        id: `${member.id}|opening-${opening.id}|reinforcement-${index}`,
        memberId: member.id,
        role: '開口補強筋',
        size: reinforcement.size,
        count: reinforcement.count,
        length: reinforcement.lengthMm,
        shape: 'straight',
        points: [
          [0, 0, 0],
          [reinforcement.lengthMm, 0, 0],
        ],
        closed: false,
        formula:
          `設計長さ ＝ 設計図書転記 ${reinforcement.lengthMm}mm ／ ` +
          `本数 ＝ 設計図書転記 ${reinforcement.count}本 ／ 径 ＝ ${reinforcement.size} ` +
          `（数量積算基準 1通則8) なお書き — 開口補強筋は設計図書により計測・計算）`,
        ruleHits: [],
      }),
    ),
  )
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
  span: WallSpan
  role: '縦筋' | '横筋'
  size: BarSize
  pitchMm: number
  startOffsetMm: number
  bodyLengthMm: number
  distributionOverMm: number
  bodyLabel: string
  distributionLabel: string
  repeatAxis: 'x' | 'y'
  /** 鉄筋が走る向き — 繰り返し軸と直交する。開口部の欠除がこれを見る */
  barAxis: 'x' | 'y'
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

function buildWallBars(input: WallBarInput): Rebar[] {
  const {
    member,
    section,
    span,
    role,
    size,
    pitchMm,
    startOffsetMm,
    bodyLengthMm,
    distributionOverMm,
    bodyLabel,
    distributionLabel,
    repeatAxis,
    barAxis,
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

  // 1通則7) の割付本数は1層分だ。層数（シングル／ダブル）は規準ではなく
  // 壁リストの記載であり、断面一覧の入力である (ADR-012)。
  const perLayerCount = distributionCount(
    distributionOverMm,
    pitchMm,
    distributionAdditionRule,
  )
  const layout = stirrupPositions(distributionOverMm, pitchMm, startOffsetMm)

  // 1通則8) — 開口部を横切る本だけが開口の内法寸法だけ短くなる。欠除量ごとに
  // 内訳の行が分かれる（1通則 前文「規格、形状、寸法等ごとに」）。
  const deduction = openingDeduction(
    {
      openings: member.openings ?? [],
      clearXMm: span.clearLengthMm,
      clearYMm: span.clearHeightMm,
      barAxis,
      pitchMm,
      totalCount: perLayerCount,
    },
    pack,
  )
  const openingLayout = deduction.layout
  const ignoredTerm =
    deduction.ignored.length === 0
      ? ''
      : ` ／ 欠除しない開口 ${deduction.ignored
          .map(({ widthMm, heightMm }) => `${widthMm}×${heightMm}`)
          .join('・')}（1通則8) 但書 — 1か所当たり内法面積0.5㎡以下）`

  // 3D に描かれる経路。継手は位置が決まらないので描かない（表5.3.3 が原文で画像）。
  // 開口の欠けもここには現れない — 欠ける位置は本ごとに違うので、表示部が
  // `Member.openings` で切る (ADR-029)。
  const pathLengthMm = bodyLengthMm + 2 * anchorageMm

  const anchorageTarget = role === '縦筋' ? '上下の大梁・床板' : '両側の柱'
  const layerTerm =
    section.layers === 1 ? 'シングル配筋 ×1' : `ダブル配筋 ×${section.layers}`
  const roleKey = role === '縦筋' ? 'vertical' : 'horizontal'

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
      pathFromMm: pathLengthMm - anchorageMm,
      pathToMm: pathLengthMm,
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

  return deduction.groups.map(({ deductionMm, count: groupCount }) => {
    // 1通則4) が継手箇所数を求める「計測・計算した鉄筋の長さ」は欠除後の長さだ。
    const measuredLengthMm = bodyLengthMm - deductionMm + 2 * anchorageMm

    const splice = resolveWallSplice({
      role,
      section,
      size,
      measuredLengthMm,
      lapMm,
      deducted: deductionMm > 0,
      tableLapRule,
      wallLapMinimumRule,
      spliceFactorRule,
      pack,
    })

    const designLengthMm = measuredLengthMm + splice.lengthMm
    const count = groupCount * section.layers
    const positionsMm = openingLayout
      ? openingLayout.positionsMm.filter(
          (_, index) => openingLayout.deductionsMm[index] === deductionMm,
        )
      : null

    const deductionTerm =
      deductionMm === 0
        ? ''
        : ` − 開口部の欠除 ${deductionMm}（数量積算基準 1通則8) — 建具類等` +
          `開口部の内法寸法による）`
    const splitTerm =
      deduction.groups.length === 1
        ? ''
        : ` のうち${
            deductionMm === 0 ? '開口を横切らない' : `${deductionMm}を欠く`
          } ${groupCount}本`

    return {
      id: `${member.id}|${roleKey}${
        deductionMm === 0 ? '' : `|欠除${deductionMm}`
      }`,
      memberId: member.id,
      role,
      size,
      shape: 'straight' as const,
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
        positionCount: positionsMm
          ? positionsMm.length
          : layout.positionsMm.length,
        ...(positionsMm ? { positionsMm } : {}),
      },
      splice,
      zones,
      ruleHits: [
        coverRule,
        fabricationCoverAdditionRule,
        anchorageRule,
        distributionAdditionRule,
        ...deduction.rules,
        ...splice.rules,
      ],
      formula:
        `設計長さ ＝ ${bodyLabel} ${bodyLengthMm}${deductionTerm} ＋ 定着 L1 ` +
        `${anchorageRule.value}d(${anchorageMm}) × 2（両端 — ${anchorageTarget}へ定着）` +
        ` ＋ 継手 ${splice.formula} ＝ ${designLengthMm} ／ ` +
        `本数 ＝ ⌈${distributionLabel} ${distributionOverMm} ÷ ピッチ ${pitchMm}⌉ ` +
        `＋ ${distributionAdditionRule.value}（数量積算基準 1通則7)）＝ ${perLayerCount}` +
        `${splitTerm} × ${layerTerm} ＝ ${count} ／ ` +
        `配置基準 ＝ 加工用かぶり厚さ（最小かぶり ${coverRule.value} ＋ 加算 ` +
        `${fabricationCoverAdditionRule.value} ＝ ${fabricationCover}） ／ ` +
        `3D 形状 ＝ 継手位置が未確定なので継手を描かない（描かれる長さ ` +
        `${pathLengthMm} は設計長さと一致しない・数量には用いない）${ignoredTerm}`,
    }
  })
}

interface WallSpliceInput {
  role: '縦筋' | '横筋'
  section: WallSection
  size: BarSize
  /** 1通則4) が言う「計測・計算した鉄筋の長さ」— 開口部の欠除を引いた後である */
  measuredLengthMm: number
  lapMm: number
  /** この群が開口部を横切って断たれているか (2（５）壁1)② 但書) */
  deducted: boolean
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
    measuredLengthMm,
    lapMm,
    deducted,
    tableLapRule,
    wallLapMinimumRule,
    spliceFactorRule,
    pack,
  } = input

  let countRule: RuleHit
  let countPerBar: number
  let countFormula: string

  if (role === '縦筋' && deducted) {
    // 開口を横切る縦筋は階高全体にわたらず、開口部腰壁・垂れ壁の縦筋になる。
    // 同じ項の但書が「開口部腰壁、手すり壁等の継手はないものとする」と定める。
    countRule = lookupRule(pack, 'measure.splice.wall.opening', {})
    countPerBar = spliceCount(countRule)
    countFormula =
      `${countPerBar}か所（数量積算基準 2（５）壁1)② 但書 — ` +
      `開口部腰壁、手すり壁等の継手はないものとする）`
  } else if (role === '縦筋') {
    countRule = lookupRule(pack, 'measure.splice.wall.vertical', {})
    countPerBar = spliceCount(countRule)
    countFormula = `${countPerBar}か所（数量積算基準 2（５）壁1)② — 縦筋の継手は各階に1か所）`
  } else {
    countRule = lookupRule(pack, 'measure.splice.interval', { size })
    countPerBar = intervalSpliceCount(measuredLengthMm, countRule)
    countFormula =
      `鉄筋の長さ ${measuredLengthMm} ÷ ${countRule.value}mm ごと ＝ ${countPerBar}か所` +
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
