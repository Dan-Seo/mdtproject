import type { BarSize, ColumnSection, Member } from '../model/member'
import type { Rebar } from '../model/rebar'
import type { ColumnEnds, Story } from '../model/project'
import { lookupRule } from '../rules/lookup'
import type { RuleHit, RulePack } from '../rules/types'

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

function roundLength(length: number, rounding: RuleHit): number {
  if (rounding.unit !== 'mm' || rounding.value <= 0) {
    throw new Error(`Rule ${rounding.key} must be a positive mm increment`)
  }

  return Math.ceil(length / rounding.value) * rounding.value
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
  const coverRule = lookupRule(pack, 'cover.minimum', {
    memberKind: section.kind,
  })
  const anchorageRule = lookupRule(
    pack,
    'anchorage.L2',
    commonConditions,
  )
  const lapRule = lookupRule(pack, 'lap.L1', commonConditions)
  const hook135Rule = lookupRule(pack, 'bend.hook135', {})
  const roundingRule = lookupRule(pack, 'rounding.length', {})

  const cover = millimetres(coverRule)
  const mainDiameter = barDiameter(section.main.size)
  const anchorageLength = millimetres(anchorageRule, mainDiameter)
  const lapLength = millimetres(lapRule, mainDiameter)

  // 端部条件ごとの伸び (R7)。接合部の継手は上階柱が持ち、定着はスタックの
  // 両端にしか付かない。どちらでもない端は 0 — 相手側で既に数えている。
  const bottomExtension =
    ends.bottom === '継手' ? lapLength : anchorageLength
  const topExtension = ends.top === '定着' ? anchorageLength : 0
  const mainRawLength = story.height + bottomExtension + topExtension
  const mainLength = roundLength(mainRawLength, roundingRule)

  const endTerms: string[] = []
  const mainRuleKeys: string[] = [coverRule.key]

  if (ends.bottom === '継手') {
    endTerms.push(
      `下端 重ね継手長さ L1 ${lapRule.value}d(${lapLength})`,
    )
    mainRuleKeys.push(lapRule.key)
  } else {
    endTerms.push(
      `下端 定着長さ L2 ${anchorageRule.value}d(${anchorageLength})`,
    )
    mainRuleKeys.push(anchorageRule.key)
  }

  if (ends.top === '定着') {
    endTerms.push(
      `上端 定着長さ L2 ${anchorageRule.value}d(${anchorageLength})`,
    )
    if (!mainRuleKeys.includes(anchorageRule.key)) {
      mainRuleKeys.push(anchorageRule.key)
    }
  } else {
    endTerms.push('上端 上階柱が継手を負担 0')
  }

  mainRuleKeys.push(roundingRule.key)

  const hoopDiameter = barDiameter(section.hoop.size)
  const hook135Length = millimetres(hook135Rule, hoopDiameter)
  const hoopWidth = section.b - 2 * cover
  const hoopDepth = section.d - 2 * cover
  const hoopRawLength =
    2 * (hoopWidth + hoopDepth) + 2 * hook135Length
  const hoopLength = roundLength(hoopRawLength, roundingRule)
  const hoopCount =
    Math.ceil((story.height - beamDepthAbove) / section.hoop.pitch) + 1

  const main: Rebar = {
    id: `${member.id}|main`,
    memberId: member.id,
    role: '主筋',
    size: section.main.size,
    shape: 'straight',
    points: [
      [cover, -bottomExtension, cover],
      [cover, story.height + topExtension, cover],
    ],
    closed: false,
    length: mainLength,
    count: section.main.count,
    rules: mainRuleKeys,
    formula:
      `加工長 ＝ 階高 ${story.height} ＋ ${endTerms.join(' ＋ ')} ` +
      `＝ ${mainRawLength} → ` +
      `${roundingRule.value}mm単位切上げ ${mainLength} ／ ` +
      `配置基準 ＝ かぶり厚さ ${cover} ／ ` +
      `本数 ＝ 断面一覧の主筋本数 ${section.main.count}`,
  }

  const hoop: Rebar = {
    id: `${member.id}|hoop`,
    memberId: member.id,
    role: '帯筋',
    size: section.hoop.size,
    shape: 'hoop',
    points: [
      [cover, 0, cover],
      [section.b - cover, 0, cover],
      [section.b - cover, 0, section.d - cover],
      [cover, 0, section.d - cover],
    ],
    closed: true,
    length: hoopLength,
    count: hoopCount,
    rules: [coverRule.key, hook135Rule.key, roundingRule.key],
    formula:
      `加工長 ＝ 2×{(${section.b}−2×${cover})＋` +
      `(${section.d}−2×${cover})} ＋ 2×135°フック余長 ` +
      `${hook135Rule.value}d(${hook135Length}) ＝ ${hoopRawLength} → ` +
      `${roundingRule.value}mm単位切上げ ${hoopLength} ／ ` +
      `本数 ＝ ⌈(階高 ${story.height} − 上部大梁せい ${beamDepthAbove}) ` +
      `÷ 帯筋ピッチ ${section.hoop.pitch}⌉ ＋ 1 ＝ ${hoopCount}`,
  }

  return [main, hoop]
}
