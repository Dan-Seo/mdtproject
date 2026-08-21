import { describe, expect, it } from 'vitest'

import type {
  ColumnSection,
  GirderSection,
  Member,
} from '../../src/domain/model/member'
import type {
  ColumnEnds,
  GirderRun,
  GirderSpan,
  Story,
} from '../../src/domain/model/project'
import type { Rebar } from '../../src/domain/model/rebar'
import { MemberUnsupportedError } from '../../src/domain/model/unsupported'
import { generateColumnRebar } from '../../src/domain/rebar/column'
import { generateGirderRebar } from '../../src/domain/rebar/girder'
import { coverConditions } from '../../src/domain/rules/lookup'
import { jpMlitRulePack } from '../../src/rulepack'
import fixture from './fixtures/fabrication-length.json'

type Case = (typeof fixture.cases)[number]
type Deviation = NonNullable<Case['deviation']>

/**
 * 加工長 ＝ points が描く折れ線の実長。設計長さ(Rebar.length)を読まないのは、
 * その2つが一致しないことこそ ADR-019 の要点だからだ — 設計長さを読むと
 * このテストは数量側の固定と重複し、3D 形状は誰も固定しないままになる。
 */
function polylineLength(points: Rebar['points'], closed: boolean): number {
  const pairs = points.slice(1).map((point, index) => [points[index], point])
  if (closed) pairs.push([points.at(-1)!, points[0]])

  return pairs.reduce(
    (total, [from, to]) =>
      total +
      Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
    0,
  )
}

function columnSection(given: Case['given']): ColumnSection {
  const source = given.section as ColumnSection
  return {
    id: 'section-C1',
    kind: '柱',
    mark: 'C1',
    b: source.b,
    d: source.d,
    fc: source.fc,
    grade: source.grade,
    exposure: source.exposure,
    finish: source.finish,
    spliceMethod: '重ね継手',
    main: source.main,
    hoop: source.hoop,
  }
}

function girderSection(given: Case['given']): GirderSection {
  const source = given.section as GirderSection
  return {
    id: 'section-G1',
    kind: '大梁',
    mark: 'G1',
    b: source.b,
    depth: source.depth,
    fc: source.fc,
    grade: source.grade,
    exposure: source.exposure,
    finish: source.finish,
    spliceMethod: '重ね継手',
    main: source.main,
    stirrup: source.stirrup,
  }
}

function supportCover(given: Case['given']): Record<string, string | boolean> {
  const support = given.supportSection as ColumnSection
  return coverConditions({ ...support, kind: '柱' } as ColumnSection)
}

function girderRun(given: Case['given']): GirderRun {
  const cover = supportCover(given)
  const spans: GirderSpan[] = given.spans!.map((span) => ({
    axis: 'X',
    centerSpan: span.centerSpan,
    clear: span.clear,
    startFaceOffsetMm: span.startFaceOffsetMm,
    endFaceOffsetMm: span.endFaceOffsetMm,
    startSupportLengthAlongAxisMm: span.startSupportLengthAlongAxisMm,
    endSupportLengthAlongAxisMm: span.endSupportLengthAlongAxisMm,
    startSupportCover: cover,
    endSupportCover: cover,
  }))
  const members: Member[] = spans.map((_, index) => ({
    id: `1F-X${index + 1}Y1`,
    kind: '大梁',
    memberClass: '躯体',
    sectionId: 'section-G1',
    storyId: '1F',
    position: { axis: 'X', ix: index, iy: 0 },
  }))
  // 런 원점에서 각 스팬 시작면까지의 거리 — 앞 스팬들의 内法과 중간 柱せい의 누적
  const memberOffsetsMm = spans.reduce<number[]>((offsets, span, index) => {
    if (index === 0) return [0]
    const previous = spans[index - 1]
    return [
      ...offsets,
      offsets[index - 1] +
        previous.clear +
        previous.endSupportLengthAlongAxisMm,
    ]
  }, [])

  // 픽스처의 coreLengthMm을 그대로 꽂으면 中間柱せい 누적이 테스트 밖에 남는다.
  // 스팬에서 다시 유도해 픽스처 값과 대조하고, 그 값을 런에 넣는다.
  const coreFromSpans = spans.reduce(
    (total, span, index) =>
      total +
      span.clear +
      (index < spans.length - 1 ? span.endSupportLengthAlongAxisMm : 0),
    0,
  )
  expect(coreFromSpans, '中間柱せい の累積').toBe(given.coreLengthMm)

  return {
    axis: 'X',
    members,
    ownerId: members[0].id,
    spans,
    memberOffsetsMm,
    coreLengthMm: coreFromSpans,
  }
}

function generate(testCase: Case): Rebar[] {
  const { given } = testCase

  if (given.kind === '柱') {
    const section = columnSection(given)
    const member: Member = {
      id: '1F-X1Y1',
      kind: '柱',
      memberClass: '躯体',
      sectionId: section.id,
      storyId: '1F',
      position: { ix: 0, iy: 0 },
    }
    const story: Story = {
      id: '1F',
      name: '1階',
      height: given.storyHeightMm!,
    }

    return generateColumnRebar(
      {
        member,
        section,
        story,
        beamDepthAbove: given.beamDepthAboveMm!,
        ends: given.ends as ColumnEnds,
      },
      jpMlitRulePack,
    )
  }

  return generateGirderRebar(
    { run: girderRun(given), section: girderSection(given) },
    jpMlitRulePack,
  )
}

describe('加工長 골든테스트 — 標準仕様書 5章の表から手で導いた加工形状の実長', () => {
  it('픽스처가 참조하는 用語 id는 모두 terms에 있다', () => {
    const known = new Set(fixture.terms.map((term) => term.id))
    const referenced = fixture.cases.flatMap((testCase) => [
      ...testCase.uses,
      ...(testCase.deviation ? [testCase.deviation.term] : []),
    ])

    expect([...new Set(referenced)].filter((id) => !known.has(id))).toEqual([])
  })

  /**
   * 반대 방향도 본다 — 어느 케이스도 구속하지 않는 항이 terms 에 남아 있으면
   * 그 항은 전사돼 있을 뿐 아무것도 지키지 못한다. 실제로 L1h 가 그랬다:
   * 折曲げ定着 全長의 하한이 L1h 에서 L1 로 바뀌자(5.3.4(5)(ｲ)(a)) L1h 는
   * 어떤 값도 정하지 않게 됐고, 그대로 두면 出典이 거짓이 된다.
   */
  it('terms 에 어느 케이스도 쓰지 않는 항이 남아 있지 않다', () => {
    const used = new Set(
      fixture.cases.flatMap((testCase) => [
        ...testCase.uses,
        ...(testCase.deviation ? [testCase.deviation.term] : []),
      ]),
    )

    expect(fixture.terms.filter((term) => !used.has(term.id))).toEqual([])
  })

  it('각 用語는 出典 문서를 하나씩 가리킨다', () => {
    const known = new Set(fixture.sources.map((source) => source.id))

    expect(
      fixture.terms.filter((term) => !known.has(term.sourceId)),
    ).toEqual([])
  })

  /**
   * 期待値이 原文 준거값이 아닌 케이스는 그 사실과 차액을 대장에 적는다
   * (quantity-r5-ch3.json 의 status 대장과 같은 방식). 차액이 맞아떨어지는지
   * 여기서 확인해야 대장이 구현과 따로 놀지 않는다.
   */
  it('原文과 어긋나는 케이스는 차액이 대장과 맞는다', () => {
    const deviating = fixture.cases.filter(
      (testCase): testCase is Case & { deviation: Deviation } =>
        testCase.deviation !== undefined,
    )

    expect(deviating.length).toBeGreaterThan(0)
    for (const testCase of deviating) {
      expect(testCase.status, testCase.id).toBe('deviation-from-source')
      expect(
        testCase.expectedFabricationLengthMm! + testCase.deviation.missingMm,
        `${testCase.id} — ${testCase.deviation.note}`,
      ).toBe(testCase.deviation.withHookTailMm)
    }
  })

  it.each(
    fixture.cases
      .filter((testCase) => !('expectation' in testCase))
      .map((testCase) => [testCase.id, testCase] as const),
  )('%s', (_id, testCase) => {
    const rebar = generate(testCase).find(
      (candidate) => candidate.role === testCase.role,
    )

    expect(rebar, `${testCase.role} should be generated`).toBeDefined()
    expect(
      polylineLength(rebar!.points, rebar!.closed),
      `${testCase.title}\n${testCase.derivation}`,
    ).toBe(testCase.expectedFabricationLengthMm)
  })

  it.each(
    fixture.cases
      .filter((testCase) => 'expectation' in testCase)
      .map((testCase) => [testCase.id, testCase] as const),
  )('%s', (_id, testCase) => {
    let thrown: unknown
    try {
      generate(testCase)
    } catch (error) {
      thrown = error
    }

    expect(
      thrown,
      `${testCase.title}\n${testCase.derivation}`,
    ).toBeInstanceOf(MemberUnsupportedError)
    expect((thrown as MemberUnsupportedError).reason).toBe(testCase.reason)
  })
})
