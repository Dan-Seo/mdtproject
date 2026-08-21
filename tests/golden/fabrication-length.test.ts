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

  return {
    axis: 'X',
    members,
    ownerId: members[0].id,
    spans,
    memberOffsetsMm,
    coreLengthMm: given.coreLengthMm!,
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
    const referenced = fixture.cases.flatMap((testCase) => testCase.uses)

    expect([...new Set(referenced)].filter((id) => !known.has(id))).toEqual([])
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
