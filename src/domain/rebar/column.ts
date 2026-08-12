import type { BarSize, ColumnSection, Member } from '../model/member'
import type { Rebar, RebarZone } from '../model/rebar'
import type { ColumnEnds, Story } from '../model/project'
import { MemberUnsupportedError } from '../model/unsupported'
import { coverConditions, lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'
import { stirrupPositions } from './stirrup-layout'

export interface ColumnRebarInput {
  member: Member
  section: ColumnSection
  story: Story
  beamDepthAbove: number
  /** 스택 안에서의 단부 조건. `columnEnds()`가 판정한다 (R7). */
  ends: ColumnEnds
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

export function generateColumnRebar(
  input: ColumnRebarInput,
  pack: RulePack,
): Rebar[] {
  const { member, section, story, beamDepthAbove, ends } = input
  const commonConditions = {
    fc: section.fc,
    grade: section.grade,
    hook: false,
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
  // 柱主筋の定着は表5.3.4の一般値 L1 (注1 — 注2〜4以外)。L2 は「割裂破壊の
  // おそれのない箇所」限定 (注2) で、その判定材料を製品は持たないため一般値を使う。
  const anchorageRule = lookupRule(
    pack,
    'anchorage.L1',
    commonConditions,
  )
  const lapRule = lookupRule(pack, 'lap.L1', commonConditions)
  const hook135Rule = lookupRule(pack, 'bend.hook135', {})

  const minimumCover = millimetres(coverRule)
  const fabricationCoverAddition = millimetres(
    fabricationCoverAdditionRule,
  )
  const fabricationCover = minimumCover + fabricationCoverAddition
  const mainDiameter = barDiameter(section.main.size)
  const anchorageLength = millimetres(anchorageRule, mainDiameter)
  const lapLength = millimetres(lapRule, mainDiameter)

  // 端部条件ごとの伸び (R7)。接合部の継手は上階柱が持ち、定着はスタックの
  // 両端にしか付かない。どちらでもない端は 0 — 相手側で既に数えている。
  const bottomExtension =
    ends.bottom === '継手' ? lapLength : anchorageLength
  const topExtension = ends.top === '定着' ? anchorageLength : 0
  const mainLength = story.height + bottomExtension + topExtension
  const mainZones: RebarZone[] = [
    {
      kind: ends.bottom === '継手' ? '重ね継手' : '定着',
      ruleKey: ends.bottom === '継手' ? lapRule.key : anchorageRule.key,
      pathFromMm: 0,
      pathToMm: bottomExtension,
    },
  ]

  if (ends.top === '定着') {
    mainZones.push({
      kind: '定着',
      ruleKey: anchorageRule.key,
      pathFromMm: mainLength - anchorageLength,
      pathToMm: mainLength,
    })
  }

  const endTerms: string[] = []
  const mainRuleHits: RuleHit[] = [
    coverRule,
    fabricationCoverAdditionRule,
  ]

  if (ends.bottom === '継手') {
    endTerms.push(
      `下端 重ね継手長さ L1 ${lapRule.value}d(${lapLength})`,
    )
    mainRuleHits.push(lapRule)
  } else {
    endTerms.push(
      `下端 定着長さ L1 ${anchorageRule.value}d(${anchorageLength})`,
    )
    mainRuleHits.push(anchorageRule)
  }

  if (ends.top === '定着') {
    endTerms.push(
      `上端 定着長さ L1 ${anchorageRule.value}d(${anchorageLength})`,
    )
    if (!mainRuleHits.includes(anchorageRule)) {
      mainRuleHits.push(anchorageRule)
    }
  } else {
    endTerms.push('上端 上階柱が継手を負担 0')
  }

  const hoopDiameter = barDiameter(section.hoop.size)
  const hook135Length = millimetres(hook135Rule, hoopDiameter)
  const hoopWidth = section.b - 2 * fabricationCover
  const hoopDepth = section.d - 2 * fabricationCover

  // 加工用かぶり×2 보다 작은 단면은 음수 加工長을 만들고, 그 값은 집계에서
  // 마이너스 kg로 조용히 흘러간다 — 조용히 틀린 값 대신 실패한다 (ADR-014).
  if (hoopWidth <= 0 || hoopDepth <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `帯筋 加工寸法 must be positive: ${member.id} ` +
        `(${section.b}×${section.d} − 2×加工用かぶり ${fabricationCover})`,
    )
  }

  const hoopLength =
    2 * (hoopWidth + hoopDepth) + 2 * hook135Length

  // 上部大梁せい가 階高 이상이면 배치 구간이 사라져 本数가 0 이하로 샌다 —
  // 加工寸法 가드와 같은 이유로 실패한다.
  const hoopSpan = story.height - beamDepthAbove
  if (hoopSpan <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `帯筋 配置区間 must be positive: ${member.id} ` +
        `(階高 ${story.height} − 上部大梁せい ${beamDepthAbove})`,
    )
  }

  // 規準에 값이 없는 배치값이다 — 断面一覧의 입력을 그대로 쓴다 (ADR-012)
  const hoopStartOffsetMm = section.hoop.startOffsetMm

  if (hoopSpan <= 2 * hoopStartOffsetMm) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `帯筋 配置区間 must be positive: ${member.id} ` +
        `(配置区間 ${hoopSpan} ≤ 2×初期オフセット ${hoopStartOffsetMm})`,
    )
  }

  const hoopLayout = stirrupPositions(
    hoopSpan,
    section.hoop.pitch,
    hoopStartOffsetMm,
  )
  const hoopCount = hoopLayout.positionsMm.length
  const fabricationCoverFormula =
    `加工用かぶり厚さ（最小かぶり ${minimumCover} ＋ ` +
    `加算 ${fabricationCoverAddition} ＝ ${fabricationCover}）`

  const main: Rebar = {
    id: `${member.id}|main`,
    memberId: member.id,
    role: '主筋',
    size: section.main.size,
    shape: 'straight',
    points: [
      [fabricationCover, -bottomExtension, fabricationCover],
      [
        fabricationCover,
        story.height + topExtension,
        fabricationCover,
      ],
    ],
    closed: false,
    length: mainLength,
    count: section.main.count,
    zones: mainZones,
    ruleHits: mainRuleHits,
    formula:
      `加工長 ＝ 階高 ${story.height} ＋ ${endTerms.join(' ＋ ')} ` +
      `＝ ${mainLength} ／ ` +
      `配置基準 ＝ ${fabricationCoverFormula} ／ ` +
      `本数 ＝ 断面一覧の主筋本数 ${section.main.count}`,
  }

  const hoop: Rebar = {
    id: `${member.id}|hoop`,
    memberId: member.id,
    role: '帯筋',
    size: section.hoop.size,
    shape: 'hoop',
    points: [
      [fabricationCover, 0, fabricationCover],
      [section.b - fabricationCover, 0, fabricationCover],
      [
        section.b - fabricationCover,
        0,
        section.d - fabricationCover,
      ],
      [fabricationCover, 0, section.d - fabricationCover],
    ],
    closed: true,
    length: hoopLength,
    count: hoopCount,
    placement: {
      axis: 'y',
      clearMm: hoopSpan,
      pitchMm: section.hoop.pitch,
      startOffsetMm: hoopStartOffsetMm,
      lastGapMm: hoopLayout.lastGapMm,
    },
    ruleHits: [coverRule, fabricationCoverAdditionRule, hook135Rule],
    formula:
      `加工長 ＝ 2×{(${section.b}−2×${fabricationCover})＋` +
      `(${section.d}−2×${fabricationCover})} ＋ 2×135°フック余長 ` +
      `${hook135Rule.value}d(${hook135Length}) ＝ ${hoopLength} ／ ` +
      `${fabricationCoverFormula} ／ ` +
      `本数 ＝ 帯筋配置（配置区間 ${hoopSpan}［階高 ${story.height} ` +
      `− 上部大梁せい ${beamDepthAbove}］、ピッチ ${section.hoop.pitch}、` +
      `始端・終端オフセット ${hoopStartOffsetMm}）＝ ${hoopCount}`,
  }

  return [main, hoop]
}
