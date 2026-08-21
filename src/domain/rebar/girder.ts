import {
  splitGirderMainRow,
  type GirderSection,
  type Member,
} from '../model/member'
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
  widthTieDesignLengthMm,
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

function endFormula(label: string, detail: GirderEndDetail): string {
  if (detail.kind === '直線定着') {
    return `${label} 直線定着 L1 ${detail.lengthMm}`
  }

  // lengthMm·projectionMm 은 최소치와의 max 결과다 — L1·La 로 표기하면 表5.3.4·
  // 表5.3.5 와 대조하는 검토자에게 근거가 틀린 것으로 보인다. 지배한 항을 밝힌다.
  // max 가 걸리는 대상은 「垂直余長」이 아니라 **全長**이다 — 5.3.4(5)(ｲ)(a) 가
  // 全長에, (b) 가 余長에 하한을 주므로 (b) 를 全長 하한으로 환산해 비교한다.
  const verticalTailMm = detail.lengthMm - detail.projectionMm
  return (
    `${label} 折曲げ定着 全長 ${detail.lengthMm}` +
    `［(a) 直線定着 L1 ${detail.straightMinimumMm} と ` +
    `(b) 投影＋余長下限 ${detail.tailMinimumMm} の大］` +
    `（内訳 ＝ 投影 ${detail.projectionMm}［(c) La ${detail.laMm} と ` +
    `柱せい×投影下限 ${detail.projectionMinimumMm} の大］ ＋ 垂直余長 ${verticalTailMm}）`
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
function spliceFrom(
  countRule: RuleHit,
  countPerBar: number,
  basis: string,
  section: GirderSection,
  lapRule: RuleHit,
  lapLengthMm: number,
  pack: RulePack,
): GirderSplice {
  const factorRule = lookupRule(pack, 'measure.splice.length.factor', {
    method: section.spliceMethod,
  })
  const lengthMm = spliceLengthMm(countPerBar, lapLengthMm, factorRule)
  const rules = [countRule, factorRule]

  if (lengthMm > 0) rules.push(lapRule)

  return { countPerBar, lengthMm, rules, basis }
}

/**
 * 1通則4) — 径ごとの長さの単位で数える。「梁の全長にわたる主筋」でない鉄筋
 * （単独梁の通し筋・カットオフ筋）はここに戻る（（３）梁2) ただし書き）。
 */
function intervalSplice(
  label: string,
  section: GirderSection,
  designLengthBeforeSpliceMm: number,
  lapRule: RuleHit,
  lapLengthMm: number,
  pack: RulePack,
): GirderSplice {
  const countRule = lookupRule(pack, 'measure.splice.interval', {
    size: section.main.size,
  })

  return spliceFrom(
    countRule,
    intervalSpliceCount(designLengthBeforeSpliceMm, countRule),
    `${label} 鉄筋の長さ ${designLengthBeforeSpliceMm} ÷ ${countRule.value}mm ごと（数量積算基準 1通則4)）`,
    section,
    lapRule,
    lapLengthMm,
    pack,
  )
}

function resolveSplice(
  run: GirderRun,
  section: GirderSection,
  designLengthBeforeSpliceMm: number,
  lapRule: RuleHit,
  lapLengthMm: number,
  pack: RulePack,
): GirderSplice {
  if (run.members.length === 1) {
    return intervalSplice(
      '単独梁',
      section,
      designLengthBeforeSpliceMm,
      lapRule,
      lapLengthMm,
      pack,
    )
  }

  const countRule = bandedSpliceRule(
    run.coreLengthMm,
    continuousGirderBands(pack),
  )

  return spliceFrom(
    countRule,
    spliceCount(countRule),
    `連続梁 梁の長さ ${run.coreLengthMm}（数量積算基準 2（３）梁2)）`,
    section,
    lapRule,
    lapLengthMm,
    pack,
  )
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
      `本数 ＝ 断面一覧の${row.role}本数 ${row.count} ／ ` +
      `3D 形状 ＝ 継手位置が未確定なので継手を描かない` +
      `（描かれる加工長 ${drawnLength} は設計長さと一致しない・数量には用いない）`,
  }
}

/**
 * カットオフ筋（梁の全長にわたらない主筋）1本が立つ位置。
 *
 * 数量積算基準 2（３）梁1) が「トップ筋、ハンチ部分の主筋、補強筋等は設計図書
 * による」と委ねるので、切り止め位置は断面一覧の入力である。ここが組み立てるのは
 * その入力と支点寸法・定着長さからの長さだけで、規準値は定着しか使わない。
 */
interface CutoffPosition {
  /** 귀속 부재 — 数量의 束ね 단위가 된다 */
  memberId: string
  /** 부재 로컬 x에서 그리기 시작하는 위치 (mm) */
  fromMm: number
  /** 3D에 그리는 길이 (mm) */
  drawnMm: number
  /** 継手 산입 전의 設計長さ (mm) */
  designMm: number
  /** 이 위치의 길이를 정한 룰 행 (외측 지점의 定着) */
  rules: RuleHit[]
  basis: string
}

interface CutoffRow {
  role: '上端カットオフ筋' | '下端カットオフ筋'
  /** 1か所あたりの本数 = 端部と中央の差 */
  count: number
  at: '端部' | '中央'
  y: number
  bendDirection: '上' | '下'
}

function cutoffPositions(
  input: GirderRebarInput,
  pack: RulePack,
  row: CutoffRow,
): CutoffPosition[] {
  const { run, section } = input
  const cutoffMm = section.main.cutoffFromSupportFaceMm

  if (cutoffMm <= 0) {
    throw new MemberUnsupportedError(
      'カットオフ位置不成立',
      `カットオフ位置 must be positive when 端部と中央の本数が違う: ` +
        `${run.ownerId} (${row.role} ${row.count}本)`,
    )
  }
  // 両端から伸びるカットオフ筋が出会う長さでは、その本数は中央にも立って
  // いることになり「位置別に本数が違う」という入力自体が成り立たない。
  const tooShort = run.spans.find(({ clear }) => clear <= 2 * cutoffMm)
  if (tooShort) {
    throw new MemberUnsupportedError(
      'カットオフ位置不成立',
      `内法長さ must exceed 2×カットオフ位置: ${run.ownerId} ` +
        `(内法 ${tooShort.clear} ≤ 2×${cutoffMm})`,
    )
  }

  if (row.at === '中央') {
    return run.members.map((member, index) => {
      const { clear } = run.spans[index]
      const designMm = clear - 2 * cutoffMm

      return {
        memberId: member.id,
        fromMm: cutoffMm,
        drawnMm: designMm,
        designMm,
        rules: [],
        basis:
          `内法長さ ${clear} − カットオフ位置 ${cutoffMm} ×2 ＝ ${designMm}` +
          `（両側の支点手前で切り止まるので定着はない）`,
      }
    })
  }

  const endInput = {
    barSize: section.main.size,
    fc: section.fc,
    grade: section.grade,
    bendDirection: row.bendDirection,
  }
  const startSpan = run.spans[0]
  const endSpan = run.spans[run.spans.length - 1]
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
  // 始端・終端を名で分けない — 両端の定着が同じなら基礎式も同じ文字列になり、
  // 1行に束ねたときに同じ計算が二度並ばない。違えば設計長さも違うので別行になる。
  const outer = (
    detail: GirderEndDetail,
    fromMm: number,
  ): CutoffPosition => ({
    memberId: run.ownerId,
    fromMm,
    drawnMm: cutoffMm,
    designMm: detail.lengthMm + cutoffMm,
    rules: detail.usedRules,
    basis:
      `${endFormula('外側支点', detail)} ＋ カットオフ位置 ${cutoffMm} ＝ ` +
      `${detail.lengthMm + cutoffMm}`,
  })
  // 中間支点は通し筋と同じく貫通する — 定着はつかず、両隣のスパンへ
  // カットオフ位置ぶんずつ伸びる。
  const interior = run.spans.slice(0, -1).map((_span, index): CutoffPosition => {
    const supportStartMm = run.memberOffsetsMm[index] + run.spans[index].clear
    const supportMm = run.memberOffsetsMm[index + 1] - supportStartMm
    const designMm = 2 * cutoffMm + supportMm

    return {
      memberId: run.ownerId,
      fromMm: supportStartMm - cutoffMm,
      drawnMm: designMm,
      designMm,
      rules: [],
      basis:
        `カットオフ位置 ${cutoffMm} ×2 ＋ 中間柱せい ${supportMm} ＝ ${designMm}` +
        `（中間支点を通すので定着はない）`,
    }
  })

  return [
    outer(start, 0),
    ...interior,
    outer(end, run.coreLengthMm - cutoffMm),
  ]
}

function generateCutoff(
  input: GirderRebarInput,
  pack: RulePack,
  coverRule: RuleHit,
  fabricationCoverAdditionRule: RuleHit,
  fabricationCoverMm: number,
  row: CutoffRow,
): Rebar[] {
  const { section } = input
  const lapRule = lookupRule(pack, 'lap.L1', {
    fc: section.fc,
    grade: section.grade,
    hook: false,
  })
  const lapLengthMm = millimetres(lapRule, barDiameter(section.main.size))
  // 束ねる鍵は設計長さである — 積算基準 前文が「規格、形状、寸法等ごとに」と
  // 定めるので、同じ長さの位置は同じ内訳行になる。3D は代表位置の描画長さで
  // 描くので、設計長さが同じで描画長さが違う位置（定着 − カットオフ位置 が
  // 中間柱せいに一致するときだけ起こる）は代表値で描かれる (ADR-019)。
  const groups = new Map<string, CutoffPosition[]>()

  for (const position of cutoffPositions(input, pack, row)) {
    const key = `${position.memberId}|${position.designMm}`
    const group = groups.get(key)
    if (group) group.push(position)
    else groups.set(key, [position])
  }

  return [...groups.values()].map((positions, index): Rebar => {
    const [first] = positions
    const count = row.count * positions.length
    const splice = intervalSplice(
      'カットオフ筋',
      section,
      first.designMm,
      lapRule,
      lapLengthMm,
      pack,
    )
    const length = first.designMm + splice.lengthMm
    const spliceLengthTerm =
      splice.countPerBar === 0
        ? `0か所 ＝ 0`
        : splice.lengthMm > 0
          ? `${splice.countPerBar}か所 × 重ね継手長さ L1 ${lapRule.value}d(${lapLengthMm}) ＝ ${splice.lengthMm}`
          : `${splice.countPerBar}か所 — ${section.spliceMethod}は長さの変化なし 0`
    const basis = [...new Set(positions.map(({ basis }) => basis))].join(' ／ ')

    return {
      id: `${first.memberId}|cutoff-${row.role}-${index}`,
      memberId: first.memberId,
      role: row.role,
      size: section.main.size,
      shape: 'straight',
      points: [
        [0, row.y, fabricationCoverMm],
        [first.drawnMm, row.y, fabricationCoverMm],
      ],
      closed: false,
      length,
      count,
      axisOffsetsMm: positions.map(({ fromMm }) => fromMm),
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
        ...positions.flatMap(({ rules }) => rules),
        ...splice.rules,
      ]),
      formula:
        `設計長さ ＝ ${basis} ＋ 継手 ${spliceLengthTerm} ＝ ${length} ／ ` +
        `本数 ＝ 1か所あたり ${row.count}（断面一覧の端部・中央の差 — ` +
        `数量積算基準 2（３）梁1)「トップ筋、ハンチ部分の主筋、補強筋等は設計図書` +
        `による」） × ${positions.length}か所 ＝ ${count} ／ ` +
        `配置基準 ＝ 加工用かぶり厚さ ${fabricationCoverMm} ／ ` +
        `3D 形状 ＝ 柱面から内側だけを描く（定着は向きが端で反転するので描かず、` +
        `設計長さにだけ算入する・描かれる長さ ${first.drawnMm} は数量には用いない）`,
    }
  })
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

/**
 * 幅止め筋 (数量積算基準 1通則3)・2（３）梁3))。
 *
 * 設計長さは断面の設計幅そのもの、設計本数は各梁ごとの割付である。隣の
 * 1通則2)（フープ・スタラップ＝周長）と取り違えないよう、長さは専用の
 * `widthTieDesignLengthMm` を通す。
 */
function generateWidthTie(
  member: Member,
  span: GirderSpan,
  section: GirderSection,
  widthTie: NonNullable<GirderSection['widthTie']>,
  fabricationCoverMm: number,
  widthTieLengthAdditionRule: RuleHit,
  distributionAdditionRule: RuleHit,
): Rebar {
  // 幅止め筋はあばら筋に結束するので、第1本の位置はあばら筋と同じ面から測る。
  // これは 3D の作図規則にすぎない — 設計本数は 1通則7) で数えるので初期
  // オフセットに左右されない (ADR-019)。
  const startOffsetMm = section.stirrup.startOffsetMm
  const tieWidthMm = section.b - 2 * fabricationCoverMm

  if (tieWidthMm <= 0) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `幅止め筋 加工寸法 must be positive: ${member.id} ` +
        `(幅 ${section.b} − 2×加工用かぶり ${fabricationCoverMm})`,
    )
  }

  const layout = stirrupPositions(span.clear, widthTie.pitch, startOffsetMm)
  const lengthMm = widthTieDesignLengthMm(
    section.b,
    widthTieLengthAdditionRule,
  )
  const count = distributionCount(
    span.clear,
    widthTie.pitch,
    distributionAdditionRule,
  )
  const midDepthMm = section.depth / 2

  return {
    id: `${member.id}|width-tie`,
    memberId: member.id,
    role: '幅止め筋',
    size: widthTie.size,
    shape: 'straight',
    points: [
      [0, midDepthMm, fabricationCoverMm],
      [0, midDepthMm, section.b - fabricationCoverMm],
    ],
    closed: false,
    length: lengthMm,
    count,
    placement: {
      axis: 'x',
      clearMm: span.clear,
      pitchMm: widthTie.pitch,
      startOffsetMm,
      lastGapMm: layout.lastGapMm,
      positionCount: layout.positionsMm.length,
    },
    ruleHits: [widthTieLengthAdditionRule, distributionAdditionRule],
    formula:
      `設計長さ ＝ コンクリートの設計幅 ${section.b} ＝ ${lengthMm}` +
      `（数量積算基準 1通則3) — フックを計上しない） ／ ` +
      `設計本数 ＝ ⌈内法長さ ${span.clear} ÷ ピッチ ${widthTie.pitch}⌉ ＋ 1 ` +
      `＝ ${count}（同 （３）梁3)・1通則7) — 各梁ごと、内法長さは代表値） ／ ` +
      `3D 形状 ＝ 実配筋（かぶりを控除しあばら筋と同じ初期オフセットに合わせる` +
      `ため、表示される長さ・本数は設計値と一致しない・数量には用いない）`,
  }
}

/**
 * 腹筋 (数量積算基準 2（３）梁3))。
 *
 * この条項が定めるのは「余長は 1通則6) による」の一点だけで、同項は設計図書に
 * 記載がなければ JASS 5 準用とする。JASS 5 は有料規格で未確保、標準仕様書5章に
 * 腹筋の記述は一切ない（R7 全330頁で0件）ので規準値が取れない — 余長も本数も
 * 断面一覧の入力をそのまま使い、ルールパックを引かない (ADR-012、R9②)。
 * だから `ruleHits` は空である。出典のない数値に出典を貼らない。
 */
function generateSideBar(
  member: Member,
  span: GirderSpan,
  section: GirderSection,
  sideBar: NonNullable<GirderSection['sideBar']>,
  fabricationCoverMm: number,
): Rebar {
  if (sideBar.extraLengthMm < 0 || !Number.isFinite(sideBar.extraLengthMm)) {
    throw new MemberUnsupportedError(
      '寸法不成立',
      `腹筋 余長 must be non-negative and finite: ${member.id} ` +
        `(${sideBar.extraLengthMm})`,
    )
  }

  const lengthMm = span.clear + 2 * sideBar.extraLengthMm
  const midDepthMm = section.depth / 2

  return {
    id: `${member.id}|side-bar`,
    memberId: member.id,
    role: '腹筋',
    size: sideBar.size,
    shape: 'straight',
    points: [
      [-sideBar.extraLengthMm, midDepthMm, fabricationCoverMm],
      [span.clear + sideBar.extraLengthMm, midDepthMm, fabricationCoverMm],
    ],
    closed: false,
    length: lengthMm,
    count: sideBar.count,
    ruleHits: [],
    formula:
      `設計長さ ＝ 内法長さ ${span.clear} ＋ 余長 ${sideBar.extraLengthMm} × 2 ` +
      `＝ ${lengthMm}（数量積算基準 2（３）梁3) は余長を 1通則6) に委ね、同項は` +
      `設計図書に記載がなければ JASS 5 準用と定める。JASS 5 は未確保・` +
      `標準仕様書5章に腹筋の記述なし — 余長は断面一覧の入力である／R9②） ／ ` +
      `設計本数 ＝ 断面一覧の腹筋本数 ${sideBar.count}` +
      `（図面に記載された本数なので 1通則7) の割付ではない） ／ ` +
      `3D 形状 ＝ 両側面に振り分けて描く（振り分けは作図規則）`,
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

  // 位置別本数を通し筋とカットオフ筋に分ける。数量積算基準 2（３）梁1) が
  // 長さを定めるのは「梁の全長にわたる主筋」だけで、差の分は設計図書による。
  const rows = [
    {
      id: 'top' as const,
      role: '上端筋' as const,
      cutoffRole: '上端カットオフ筋' as const,
      split: splitGirderMainRow(section.main.top),
      y: section.depth - fabricationCoverMm,
      bendDirection: '下' as const,
    },
    {
      id: 'bottom' as const,
      role: '下端筋' as const,
      cutoffRole: '下端カットオフ筋' as const,
      split: splitGirderMainRow(section.main.bottom),
      y: fabricationCoverMm,
      bendDirection: '上' as const,
    },
  ]
  const through = rows.map((row) =>
    generateMain(
      input,
      pack,
      coverRule,
      fabricationCoverAdditionRule,
      fabricationCoverMm,
      {
        id: row.id,
        role: row.role,
        count: row.split.throughCount,
        y: row.y,
        bendDirection: row.bendDirection,
      },
    ),
  )
  const cutoffs = rows.flatMap((row) =>
    row.split.cutoffCount === 0
      ? []
      : generateCutoff(
          input,
          pack,
          coverRule,
          fabricationCoverAdditionRule,
          fabricationCoverMm,
          {
            role: row.cutoffRole,
            count: row.split.cutoffCount,
            at: row.split.cutoffAt,
            y: row.y,
            bendDirection: row.bendDirection,
          },
        ),
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
  // 幅止め筋・腹筋は断面一覧にある梁にだけ付く。無い梁に製品が足さない (ADR-012)。
  const { widthTie, sideBar } = section
  const widthTies =
    widthTie === undefined
      ? []
      : run.members.map((member, index) =>
          generateWidthTie(
            member,
            run.spans[index],
            section,
            widthTie,
            fabricationCoverMm,
            lookupRule(pack, 'measure.width-tie.length.addition', {}),
            distributionAdditionRule,
          ),
        )
  const sideBars =
    sideBar === undefined
      ? []
      : run.members.map((member, index) =>
          generateSideBar(
            member,
            run.spans[index],
            section,
            sideBar,
            fabricationCoverMm,
          ),
        )

  return [...through, ...cutoffs, ...stirrups, ...widthTies, ...sideBars]
}
