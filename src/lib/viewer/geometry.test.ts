import { describe, expect, it } from 'vitest'

import type {
  ColumnSection,
  GirderSection,
  Member,
  Opening,
  WallSection,
} from '@/domain/model/member'
import {
  girderRun,
  slabRun,
  type WallSpan,
} from '@/domain/model/project'
import type { Rebar, RebarRole } from '@/domain/model/rebar'
import {
  createSampleProject,
  slabSection,
  wallSection,
} from '@/domain/model/sample-project'
import { generateColumnRebar } from '@/domain/rebar/column'
import { generateGirderRebar } from '@/domain/rebar/girder'
import { stirrupPositions } from '@/domain/rebar/stirrup-layout'
import { generateSlabRebar } from '@/domain/rebar/slab'
import { generateWallRebar } from '@/domain/rebar/wall'
import { jpMlitRulePack } from '@/rulepack'

import {
  CAMERA_FOV_DEGREES,
  CAMERA_FRAME_MARGIN,
  clipPlaneForMm,
  easeOutCubic,
  fitCamera,
  flyInStartPose,
  lerpCameraFit,
  boxHoles,
  carveBox,
  rebarBatches,
  rebarPlacements,
  rebarRadius,
  rebarSegments,
  roleToLayer,
  type Bounds,
  type CameraFit,
  type Point3,
} from './geometry'

describe('clipPlaneForMm', () => {
  const bounds: Bounds = {
    min: [-200, 100, 30],
    max: [800, 500, 930],
  }

  it.each([
    {
      axis: 'x' as const,
      normal: [1, 0, 0] as Point3,
      constants: [200, -300, -800],
    },
    {
      axis: 'y' as const,
      normal: [0, 1, 0] as Point3,
      constants: [-100, -300, -500],
    },
    {
      axis: 'z' as const,
      normal: [0, 0, 1] as Point3,
      constants: [-30, -480, -930],
    },
  ])(
    'returns the $axis normal and asymmetric-bound constants at 0, 0.5 and 1',
    ({ axis, normal, constants }) => {
      const results = [0, 0.5, 1].map((ratio) =>
        clipPlaneForMm(bounds, axis, ratio),
      )

      expect(results.map(({ normal: value }) => value)).toEqual([
        normal,
        normal,
        normal,
      ])
      expect(results.map(({ constantMm }) => constantMm)).toEqual(constants)
    },
  )
})

const main: Rebar = {
  id: '1F-X1Y1|main',
  memberId: '1F-X1Y1',
  role: '主筋',
  size: 'D25',
  shape: 'straight',
  points: [
    [40, -875, 40],
    [40, 5200, 40],
  ],
  closed: false,
  length: 6080,
  count: 12,
  ruleHits: [],
  formula: 'test',
}

// 階高 4200 − 上部大梁せい 750. 피치 100으로 나누어떨어지지 않는다 —
// 마지막 帯筋이 内法 안에 남는지가 이 픽스처의 요점이다.
const COLUMN_CLEAR_MM = 3450
const columnHoopLayout = stirrupPositions(COLUMN_CLEAR_MM, 100, 0)
const columnHoopPositions = columnHoopLayout.positionsMm

const hoop: Rebar = {
  id: '1F-X1Y1|hoop',
  memberId: '1F-X1Y1',
  role: '帯筋',
  size: 'D13',
  shape: 'hoop',
  points: [
    [40, 0, 40],
    [760, 0, 40],
    [760, 0, 760],
    [40, 0, 760],
  ],
  closed: true,
  length: 3040,
  count: columnHoopPositions.length,
  placement: {
    axis: 'y',
    clearMm: COLUMN_CLEAR_MM,
    pitchMm: 100,
    startOffsetMm: 0,
    lastGapMm: columnHoopLayout.lastGapMm,
    positionCount: columnHoopPositions.length,
  },
  ruleHits: [],
  formula: 'test',
}

const section: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  shape: '矩形',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  spliceMethod: '重ね継手',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
}

const HOOP_DISPLAY_RADIUS = rebarRadius(hoop.size)
const MAIN_DISPLAY_RADIUS = rebarRadius(main.size)
// 主筋 축이 かぶり 모서리에서 안쪽으로 밀리는 표시 오프셋:
// 帯筋 표시 지름 + 主筋 표시 반경 → 主筋 표면이 帯筋 안쪽면에 접한다.
const MAIN_INWARD = 2 * HOOP_DISPLAY_RADIUS + MAIN_DISPLAY_RADIUS

// `stirrupPositions`는 시작·끝을 항상 포함하므로 최소 本数가 2다. 단면 방향
// 기하만 보는 테스트는 이 헬퍼로 本数와 배치를 일관되게 맞춘다.
function hoopOf(count: number): Rebar {
  const clearMm = (count - 1) * section.hoop.pitch
  const layout = stirrupPositions(clearMm, section.hoop.pitch, 0)

  return {
    ...hoop,
    count: layout.positionsMm.length,
    placement: {
      axis: 'y',
      clearMm,
      pitchMm: section.hoop.pitch,
      startOffsetMm: 0,
      lastGapMm: layout.lastGapMm,
      positionCount: layout.positionsMm.length,
    },
  }
}

const girderSection: GirderSection = {
  id: 'section-G1',
  kind: '大梁',
  mark: 'G1',
  b: 400,
  depth: 750,
  fc: 24,
  grade: 'SD345',
  exposure: '屋外',
  finish: '仕上げなし',
  spliceMethod: '重ね継手',
  main: {
    size: 'D25',
    top: { endCount: 4, centerCount: 4 },
    bottom: { endCount: 3, centerCount: 3 },
    cutoffFromSupportFaceMm: 0,
  },
  stirrup: { size: 'D13', pitch: 200, startOffsetMm: 50 },
}

const girderTop: Rebar = {
  id: '1F-G1|top',
  memberId: '1F-G1',
  role: '上端筋',
  size: 'D25',
  shape: 'straight',
  points: [
    [-500, 700, 50],
    [5700, 700, 50],
  ],
  closed: false,
  length: 6200,
  count: girderSection.main.top.endCount,
  ruleHits: [],
  formula: 'test',
}

const girderBottom: Rebar = {
  ...girderTop,
  id: '1F-G1|bottom',
  role: '下端筋',
  points: [
    [-500, 50, 50],
    [5700, 50, 50],
  ],
  count: girderSection.main.bottom.endCount,
}

const GIRDER_CLEAR_MM = 5250
const girderStirrupLayout = stirrupPositions(
  GIRDER_CLEAR_MM,
  girderSection.stirrup.pitch,
  girderSection.stirrup.startOffsetMm,
)
const girderStirrupPositions = girderStirrupLayout.positionsMm
const girderStirrup: Rebar = {
  id: '1F-G1|stirrup',
  memberId: '1F-G1',
  role: 'あばら筋',
  size: 'D13',
  shape: 'hoop',
  points: [
    [0, 50, 50],
    [0, 700, 50],
    [0, 700, 350],
    [0, 50, 350],
  ],
  closed: true,
  length: 1980,
  count: girderStirrupPositions.length,
  placement: {
    axis: 'x',
    clearMm: GIRDER_CLEAR_MM,
    pitchMm: girderSection.stirrup.pitch,
    startOffsetMm: girderSection.stirrup.startOffsetMm,
    lastGapMm: girderStirrupLayout.lastGapMm,
    positionCount: girderStirrupPositions.length,
  },
  ruleHits: [],
  formula: 'test',
}

function subtract(left: Point3, right: Point3): Point3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

function dot(left: Point3, right: Point3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function cross(left: Point3, right: Point3): Point3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function normalize(vector: Point3): Point3 {
  const length = Math.hypot(...vector)
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function corners({ min, max }: Bounds): Point3[] {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) =>
      [min[2], max[2]].map((z): Point3 => [x, y, z]),
    ),
  )
}

function expectPointCloseTo(actual: Point3, expected: Point3): void {
  expect(actual[0]).toBeCloseTo(expected[0])
  expect(actual[1]).toBeCloseTo(expected[1])
  expect(actual[2]).toBeCloseTo(expected[2])
}

function distanceToSegmentXZ(point: Point3, from: Point3, to: Point3): number {
  const [px, , pz] = point
  const [ax, , az] = from
  const [bx, , bz] = to
  const abx = bx - ax
  const abz = bz - az
  const lengthSq = abx * abx + abz * abz
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lengthSq))

  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz))
}

describe('rebarPlacements for 柱', () => {
  it('uses the domain stirrup layout for every 帯筋 y placement', () => {
    const placements = rebarPlacements(hoop, section)

    expect(placements).toEqual(
      columnHoopPositions.map((y): Point3 => [0, y, 0]),
    )
  })

  it('keeps the last 帯筋 inside the 内法 when the span does not divide by pitch', () => {
    // index×pitch로 전개하면 마지막 本이 3500 — 内法 3450 밖에 그려진다.
    const placements = rebarPlacements(hoop, section)
    const lastY = placements[placements.length - 1][1]

    expect(lastY).toBe(COLUMN_CLEAR_MM)
    expect(lastY).toBeLessThan((hoop.count - 1) * section.hoop.pitch)
  })

  it('refuses a 帯筋 whose placement count disagrees with its own layout args', () => {
    expect(() =>
      rebarPlacements(
        { ...hoop, placement: { ...hoop.placement!, positionCount: 3 } },
        section,
      ),
    ).toThrow()
  })

  it('accepts a 数量本数 that differs from the drawn placement count', () => {
    // 積算基準 1通則7) の設計本数は初期オフセットを見ないので配置本数と
    // 一致しないのが普通だ。ここで弾くと数量が形状に引きずられる (ADR-019)。
    expect(() =>
      rebarPlacements({ ...hoop, count: hoop.count + 7 }, section),
    ).not.toThrow()
  })
})

describe('rebarPlacements for 大梁', () => {
  it.each([
    { rebar: girderTop, yDirection: -1 },
    { rebar: girderBottom, yDirection: 1 },
  ])(
    'places every $rebar.role in one equally spaced z row',
    ({ rebar, yDirection }) => {
      const originalPoints = structuredClone(rebar.points)
      const segments = rebarSegments(rebar, girderSection)
      const inward =
        2 * rebarRadius(girderSection.stirrup.size) +
        rebarRadius(rebar.size)
      const zFrom = rebar.points[0][2] + inward
      const zTo = girderSection.b - rebar.points[0][2] - inward
      const expectedZs = Array.from({ length: rebar.count }, (_, index) =>
        rebar.count === 1
          ? (zFrom + zTo) / 2
          : zFrom + (index * (zTo - zFrom)) / (rebar.count - 1),
      )

      expect(segments).toHaveLength(rebar.count)
      expect(segments.map(({ from }) => from[2])).toEqual(expectedZs)
      for (const { from, to } of segments) {
        expect(from[1]).toBeCloseTo(rebar.points[0][1] + yDirection * inward)
        expect(to[1]).toBeCloseTo(rebar.points[1][1] + yDirection * inward)
      }
      expect(rebar.points).toEqual(originalPoints)
    },
  )

  it('uses the domain stirrup layout for every あばら筋 x placement', () => {
    const placements = rebarPlacements(girderStirrup, girderSection)

    expect(placements).toHaveLength(girderStirrupPositions.length)
    expect(placements).toEqual(
      girderStirrupPositions.map((x): Point3 => [x, 0, 0]),
    )
  })

  it('insets 大梁 あばら筋 explicitly in the Y–Z plane', () => {
    const segments = rebarSegments(girderStirrup, girderSection)
    const radius = rebarRadius(girderStirrup.size)
    const ys = segments.flatMap(({ from, to }) => [from[1], to[1]])
    const zs = segments.flatMap(({ from, to }) => [from[2], to[2]])
    const xs = segments.flatMap(({ from, to }) => [from[0], to[0]])

    expect(Math.min(...ys)).toBeCloseTo(50 + radius)
    expect(Math.max(...ys)).toBeCloseTo(700 - radius)
    expect(Math.min(...zs)).toBeCloseTo(50 + radius)
    expect(Math.max(...zs)).toBeCloseTo(350 - radius)
    expect(new Set(xs)).toEqual(new Set(girderStirrupPositions))
  })

  it('expands continuous-run main bars across the run with section input count and spacing', () => {
    const project = createSampleProject()
    const member = project.members.find(
      ({ id }) => id === '1F-G1-X1Y1-Y',
    )
    if (member?.kind !== '大梁') throw new Error('Sample 大梁 not found')
    const section = project.sections.find(
      ({ id }) => id === member.sectionId,
    )
    if (section?.kind !== '大梁') {
      throw new Error('Sample 大梁 section not found')
    }
    const run = girderRun(project, member)
    const top = generateGirderRebar(
      { run, section },
      jpMlitRulePack,
    ).find(({ role }) => role === '上端筋')
    if (top === undefined) throw new Error('上端筋 not found')

    const placements = rebarPlacements(top, section)
    const horizontalSegments = rebarSegments(top, section).filter(
      ({ from, to }) =>
        from[1] === to[1] && from[0] <= 0 && to[0] >= run.coreLengthMm,
    )
    const zValues = placements.map(([, , z]) => z)
    const gaps = zValues.slice(1).map((z, index) => z - zValues[index])

    expect(run.members).toHaveLength(2)
    expect(horizontalSegments).toHaveLength(section.main.top.endCount)
    expect(placements).toHaveLength(section.main.top.endCount)
    expect(new Set(gaps.map((gap) => gap.toFixed(6)))).toHaveLength(1)
  })
})

describe('rebarPlacements — カットオフ筋', () => {
  // 通し筋とカットオフ筋は同じ段に並ぶ。段の総本数は端部・中央の多い方で、
  // 通し筋が手前の枠、カットオフ筋が残りの枠を取る — 重ねて描くと本数が
  // 見た目で合わなくなる。
  const cutoffSection: GirderSection = {
    ...girderSection,
    main: {
      ...girderSection.main,
      top: { endCount: 6, centerCount: 4 },
      cutoffFromSupportFaceMm: 1500,
    },
  }
  const cutoff: Rebar = {
    id: '1F-G1|cutoff-top-0',
    memberId: '1F-G1',
    role: '上端カットオフ筋',
    size: 'D25',
    shape: 'straight',
    points: [
      [0, 700, 50],
      [1500, 700, 50],
    ],
    closed: false,
    length: 2500,
    // 2本 × 外側支点2か所
    count: 4,
    axisOffsetsMm: [0, 3700],
    ruleHits: [],
    formula: 'test',
  }

  it('位置ごとに本数分だけ置き、通し筋が使わない枠に入れる', () => {
    const through = rebarPlacements(
      { ...girderTop, count: 4 },
      cutoffSection,
    )
    const placements = rebarPlacements(cutoff, cutoffSection)

    expect(placements).toHaveLength(4)
    expect(placements.map(([x]) => x)).toEqual([0, 0, 3700, 3700])
    // 段は6枠。通し筋が 4枠を取り、カットオフ筋は残り 2枠に入る
    expect(through).toHaveLength(4)
    const throughZ = through.map(([, , z]) => z)
    const cutoffZ = placements.map(([, , z]) => z)
    expect(new Set(cutoffZ).size).toBe(2)
    expect(throughZ.some((z) => cutoffZ.includes(z))).toBe(false)
    expect(Math.min(...cutoffZ)).toBeGreaterThan(Math.max(...throughZ))
  })

  it('位置の数だけ離れた場所にセグメントを出す', () => {
    const segments = rebarSegments(cutoff, cutoffSection)
    const starts = segments.map(({ from }) => from[0])

    expect(segments).toHaveLength(4)
    expect(new Set(starts)).toEqual(new Set([0, 3700]))
  })
})

describe('rebarPlacements — ADR-032 nesting 分解', () => {
  const asymmetricSection: GirderSection = {
    ...girderSection,
    main: {
      ...girderSection.main,
      top: { startCount: 4, centerCount: 5, endCount: 8 },
      cutoffFromSupportFaceMm: 1500,
    },
  }
  const through: Rebar = {
    ...girderTop,
    id: '1F-G1|asymmetric-through',
    count: 4,
    points: [
      [0, 700, 50],
      [5200, 700, 50],
    ],
  }
  const endStub: Rebar = {
    ...girderTop,
    id: '1F-G1|asymmetric-end-stub',
    role: '上端カットオフ筋',
    count: 3,
    points: [
      [0, 700, 50],
      [1500, 700, 50],
    ],
    axisOffsetsMm: [3700],
    axisSlotStart: 4,
  }
  const oneSided: Rebar = {
    ...endStub,
    id: '1F-G1|asymmetric-one-sided',
    count: 1,
    points: [
      [0, 700, 50],
      [3700, 700, 50],
    ],
    axisOffsetsMm: [1500],
    axisSlotStart: 7,
  }

  function zAt(
    segments: ReturnType<typeof rebarSegments>,
    x: number,
  ): number[] {
    return [
      ...new Set(
        segments
          .filter(({ from, to }) => from[0] <= x && to[0] >= x)
          .map(({ from }) => from[2]),
      ),
    ]
  }

  it('keeps each x interval at the start, center, and end count', () => {
    const segments = [through, endStub, oneSided].flatMap((rebar) =>
      rebarSegments(rebar, asymmetricSection),
    )

    expect(zAt(segments, 1000)).toHaveLength(4)
    expect(zAt(segments, 2500)).toHaveLength(5)
    expect(zAt(segments, 4500)).toHaveLength(8)
    expect(new Set(zAt(segments, 4500))).toHaveLength(8)
  })
})

describe('rebarSegments', () => {
  it('emits segments for every 本 of 帯筋, not just the representative', () => {
    const segments = rebarSegments(hoopOf(3), section)

    // 닫힌 4점 帯筋 × 3본 — 중심선은 かぶり면에서 표시 반경만큼 안쪽
    expect(segments).toHaveLength(12)
    expectPointCloseTo(segments[0].from, [
      hoop.points[0][0] + HOOP_DISPLAY_RADIUS,
      0,
      hoop.points[0][2] + HOOP_DISPLAY_RADIUS,
    ])
    expectPointCloseTo(segments[4].from, [
      hoop.points[0][0] + HOOP_DISPLAY_RADIUS,
      section.hoop.pitch,
      hoop.points[0][2] + HOOP_DISPLAY_RADIUS,
    ])
  })

  it('keeps the 帯筋 outer display surface on the かぶり face', () => {
    const segments = rebarSegments(hoopOf(2), section)
    const xs = segments.flatMap(({ from, to }) => [from[0], to[0]])
    const zs = segments.flatMap(({ from, to }) => [from[2], to[2]])

    expect(Math.min(...xs) - HOOP_DISPLAY_RADIUS).toBeCloseTo(40)
    expect(Math.max(...xs) + HOOP_DISPLAY_RADIUS).toBeCloseTo(760)
    expect(Math.min(...zs) - HOOP_DISPLAY_RADIUS).toBeCloseTo(40)
    expect(Math.max(...zs) + HOOP_DISPLAY_RADIUS).toBeCloseTo(760)
  })

  it('emits one 主筋 per 本数 spread around the 帯筋 inner perimeter', () => {
    const segments = rebarSegments(main, section)

    expect(segments).toHaveLength(main.count)

    const footprints = segments.map(
      ({ from }) => `${from[0].toFixed(3)},${from[2].toFixed(3)}`,
    )
    expect(new Set(footprints).size).toBe(main.count)

    // 전부 主筋 축 사각형(かぶり + MAIN_INWARD 인셋)의 변 위에 있어야 한다.
    const [inset] = main.points[0]
    const low = inset + MAIN_INWARD
    for (const { from } of segments) {
      const onEdge =
        Math.abs(from[0] - low) < 1e-9 ||
        Math.abs(from[2] - low) < 1e-9 ||
        Math.abs(from[0] - (section.b - low)) < 1e-9 ||
        Math.abs(from[2] - (section.d - low)) < 1e-9
      expect(onEdge).toBe(true)
    }
  })

  it('keeps every 主筋 surface tangent to the 帯筋 inner face, never crossing', () => {
    const hoopSegments = rebarSegments(hoopOf(2), section)
    const mainSegments = rebarSegments(main, section)
    const contact = HOOP_DISPLAY_RADIUS + MAIN_DISPLAY_RADIUS

    for (const { from } of mainSegments) {
      const distances = hoopSegments.map((segment) =>
        distanceToSegmentXZ(from, segment.from, segment.to),
      )

      // 가장 가까운 帯筋 변에 정확히 접하고, 어느 변도 관통하지 않는다.
      expect(Math.min(...distances)).toBeCloseTo(contact)
      for (const distance of distances) {
        expect(distance).toBeGreaterThanOrEqual(contact - 1e-6)
      }
    }
  })

  it('offsets both axes independently for a rectangular section', () => {
    const rectangular: ColumnSection = { ...section, b: 900, d: 600 }
    const rectangularHoop: Rebar = {
      ...hoopOf(2),
      points: [
        [40, 0, 40],
        [860, 0, 40],
        [860, 0, 560],
        [40, 0, 560],
      ],
    }

    const hoopSegments = rebarSegments(rectangularHoop, rectangular)
    const xs = hoopSegments.flatMap(({ from, to }) => [from[0], to[0]])
    const zs = hoopSegments.flatMap(({ from, to }) => [from[2], to[2]])
    expect(Math.min(...xs)).toBeCloseTo(40 + HOOP_DISPLAY_RADIUS)
    expect(Math.max(...xs)).toBeCloseTo(860 - HOOP_DISPLAY_RADIUS)
    expect(Math.min(...zs)).toBeCloseTo(40 + HOOP_DISPLAY_RADIUS)
    expect(Math.max(...zs)).toBeCloseTo(560 - HOOP_DISPLAY_RADIUS)

    for (const { from } of rebarSegments(main, rectangular)) {
      expect(from[0]).toBeGreaterThanOrEqual(40 + MAIN_INWARD - 1e-9)
      expect(from[0]).toBeLessThanOrEqual(900 - 40 - MAIN_INWARD + 1e-9)
      expect(from[2]).toBeGreaterThanOrEqual(40 + MAIN_INWARD - 1e-9)
      expect(from[2]).toBeLessThanOrEqual(600 - 40 - MAIN_INWARD + 1e-9)
    }
  })

  it('respects asymmetric かぶり insets per axis', () => {
    const asymmetric: Rebar = {
      ...main,
      points: [
        [30, -875, 50],
        [30, 5200, 50],
      ],
    }

    const segments = rebarSegments(asymmetric, section)
    expectPointCloseTo(segments[0].from, [
      30 + MAIN_INWARD,
      -875,
      50 + MAIN_INWARD,
    ])
    for (const { from } of segments) {
      expect(from[0]).toBeGreaterThanOrEqual(30 + MAIN_INWARD - 1e-9)
      expect(from[0]).toBeLessThanOrEqual(section.b - 30 - MAIN_INWARD + 1e-9)
      expect(from[2]).toBeGreaterThanOrEqual(50 + MAIN_INWARD - 1e-9)
      expect(from[2]).toBeLessThanOrEqual(section.d - 50 - MAIN_INWARD + 1e-9)
    }
  })

  it('clamps degenerate sections instead of inverting the walk rectangle', () => {
    const tiny: ColumnSection = { ...section, b: 200, d: 200 }

    const mainSegments = rebarSegments({ ...main, count: 4 }, tiny)
    expect(mainSegments).toHaveLength(4)
    for (const { from } of mainSegments) {
      expect(Number.isFinite(from[0])).toBe(true)
      expect(Number.isFinite(from[2])).toBe(true)
      expect(from[0]).toBeGreaterThanOrEqual(40)
      expect(from[0]).toBeLessThanOrEqual(160)
      expect(from[2]).toBeGreaterThanOrEqual(40)
      expect(from[2]).toBeLessThanOrEqual(160)
    }

    const tinyHoop: Rebar = {
      ...hoopOf(2),
      points: [
        [40, 0, 40],
        [60, 0, 40],
        [60, 0, 60],
        [40, 0, 60],
      ],
    }
    for (const { from, to } of rebarSegments(tinyHoop, tiny)) {
      for (const point of [from, to]) {
        expect(point[0]).toBeGreaterThanOrEqual(40)
        expect(point[0]).toBeLessThanOrEqual(60)
        expect(point[2]).toBeGreaterThanOrEqual(40)
        expect(point[2]).toBeLessThanOrEqual(60)
      }
    }
  })

  it('includes the last-to-first segment for a closed 帯筋', () => {
    const segments = rebarSegments(hoopOf(2), section)

    // 4변 × 2본. 첫 본의 마지막 변이 4점째에서 1점째로 닫힌다.
    expect(segments).toHaveLength(8)
    const closing = segments[3]
    expect(closing.radius).toBeCloseTo(rebarRadius('D13'))
    expectPointCloseTo(closing.from, [
      40 + HOOP_DISPLAY_RADIUS,
      0,
      760 - HOOP_DISPLAY_RADIUS,
    ])
    expectPointCloseTo(closing.to, [
      40 + HOOP_DISPLAY_RADIUS,
      0,
      40 + HOOP_DISPLAY_RADIUS,
    ])
  })

  it('does not close an open 主筋', () => {
    const segments = rebarSegments({ ...main, count: 1 }, section)

    expect(segments).toHaveLength(1)
    expect(segments).not.toContainEqual({
      from: main.points.at(-1),
      to: main.points[0],
      radius: rebarRadius(main.size),
    })
  })
})

describe('rebarRadius', () => {
  it('returns the intentional display exaggeration instead of D10 actual size', () => {
    expect(rebarRadius('D10')).toBeCloseTo(22.4)
    expect(rebarRadius('D10')).not.toBe(10)
  })
})

describe('M3c の日本固有詳細を 3D に展開する', () => {
  const widthTieLayout = stirrupPositions(
    GIRDER_CLEAR_MM,
    1000,
    girderSection.stirrup.startOffsetMm,
  )
  const widthTie: Rebar = {
    id: '1F-G1|width-tie',
    memberId: '1F-G1',
    role: '幅止め筋',
    size: 'D10',
    shape: 'straight',
    points: [
      [0, 375, 50],
      [0, 375, 350],
    ],
    closed: false,
    length: girderSection.b,
    count: 7,
    placement: {
      axis: 'x',
      clearMm: GIRDER_CLEAR_MM,
      pitchMm: 1000,
      startOffsetMm: girderSection.stirrup.startOffsetMm,
      lastGapMm: widthTieLayout.lastGapMm,
      positionCount: widthTieLayout.positionsMm.length,
    },
    ruleHits: [],
    formula: 'test',
  }

  it('repeats the 幅止め筋 from the domain layout, not from its 設計本数', () => {
    // count(7) は 1通則7) の割付本数で、配置が作る本数とは正当に違う (ADR-019)。
    const placements = rebarPlacements(widthTie, girderSection)

    expect(placements).toEqual(
      widthTieLayout.positionsMm.map((x): Point3 => [x, 0, 0]),
    )
    // 設計本数を動かしても配置は動かない — 配置の出所はドメインのレイアウトだけだ。
    expect(
      rebarPlacements({ ...widthTie, count: widthTie.count + 5 }, girderSection),
    ).toEqual(placements)
  })

  it('splits the 腹筋 between the two side faces', () => {
    const sideBar: Rebar = {
      id: '1F-G1|side-bar',
      memberId: '1F-G1',
      role: '腹筋',
      size: 'D10',
      shape: 'straight',
      points: [
        [-150, 375, 50],
        [5350, 375, 50],
      ],
      closed: false,
      length: 5500,
      count: 2,
      ruleHits: [],
      formula: 'test',
    }
    const placements = rebarPlacements(sideBar, girderSection)
    const zs = placements.map(([, , z]) => z)

    expect(placements).toHaveLength(2)
    // 代表1本は手前面 (z=50) にあるので、オフセット 0 と 幅−2×かぶり で
    // 両側面に1本ずつ立つ。
    expect(zs).toEqual([0, girderSection.b - 2 * 50])
    // 1段なので高さは動かない。
    expect(placements.map(([, y]) => y)).toEqual([0, 0])
  })

  it('stacks 腹筋 tiers evenly when the section list asks for more than a pair', () => {
    const sideBar: Rebar = {
      id: '1F-G1|side-bar',
      memberId: '1F-G1',
      role: '腹筋',
      size: 'D10',
      shape: 'straight',
      points: [
        [0, 375, 50],
        [5200, 375, 50],
      ],
      closed: false,
      length: 5200,
      count: 4,
      ruleHits: [],
      formula: 'test',
    }
    const placements = rebarPlacements(sideBar, girderSection)
    const ys = placements.map(([, y]) => y)

    const cover = 50
    const webSpan = girderSection.depth - 2 * cover
    const mid = 375

    expect(placements).toHaveLength(4)
    // 2段が上端筋・下端筋の「間」を均等に割る — 代表点(梁せいの中央)からの差で見る。
    // 区間を段数+1 に割った内側の点なので、下端筋(y=かぶり)にも上端筋
    // (y=せい−かぶり)にも重ならない。
    expect(ys).toEqual([
      cover + webSpan / 3 - mid,
      cover + webSpan / 3 - mid,
      cover + (2 * webSpan) / 3 - mid,
      cover + (2 * webSpan) / 3 - mid,
    ])
    // 主筋の列に重ならないことを不等式でも押さえる — 上の等式だけだと、
    // 割り方を変えたときに何が壊れたのか読めない。
    for (const y of ys) {
      expect(y).toBeGreaterThan(cover - mid)
      expect(y).toBeLessThan(girderSection.depth - cover - mid)
    }
  })
})

describe('耐震壁の縦筋・横筋を壁厚方向に分ける', () => {
  const span: WallSpan = {
    axis: 'Y',
    clearLengthMm: 5200,
    clearHeightMm: 3450,
    startFaceOffsetMm: 400,
    endFaceOffsetMm: 400,
    girderDepthAboveMm: 750,
  }
  const wallMember: Member = {
    id: '1F-W1-X1Y1-Y',
    kind: '耐震壁',
    memberClass: '躯体',
    sectionId: wallSection.id,
    storyId: '1F',
    position: { axis: 'Y', ix: 0, iy: 0 },
  }

  /** 壁厚方向に立つ面を、実際に描かれる半径つきで手前から並べる。 */
  function barPlanes(
    section: WallSection,
  ): { z: number; radius: number; role: RebarRole }[] {
    return generateWallRebar(
      { member: wallMember, section, span },
      jpMlitRulePack,
    )
      .flatMap((rebar) => {
        const planes = new Map<number, number>()
        for (const segment of rebarSegments(rebar, section)) {
          planes.set(segment.from[2], segment.radius)
        }

        return [...planes].map(([z, radius]) => ({
          z,
          radius,
          role: rebar.role,
        }))
      })
      .sort((left, right) => left.z - right.z)
  }

  /**
   * 隣り合う鉄筋が食い込まず、どれも壁の中に収まっていること。ちょうど接する配置を
   * 狙っているので、丸め誤差ぶんだけ緩めて比べる。
   */
  const TOLERANCE_MM = 1e-9
  function expectNoOverlap(
    planes: { z: number; radius: number }[],
    thickness: number,
  ): void {
    const last = planes[planes.length - 1]

    expect(planes[0].z - planes[0].radius).toBeGreaterThanOrEqual(-TOLERANCE_MM)
    expect(last.z + last.radius).toBeLessThanOrEqual(thickness + TOLERANCE_MM)

    for (let index = 1; index < planes.length; index += 1) {
      const near = planes[index - 1]
      const far = planes[index]

      expect(far.z - near.z).toBeGreaterThanOrEqual(
        near.radius + far.radius - TOLERANCE_MM,
      )
    }
  }

  it('never draws 縦筋 and 横筋 at the same depth', () => {
    // ドメインの points は縦筋も横筋もかぶり面に置く（柱の主筋・帯筋と同じだ）。
    // 表示半径は誇張されているので、そのまま描くと交差点ごとに互いを貫く。
    const planes = barPlanes(wallSection)

    expect(planes.map(({ role }) => role)).toEqual([
      '縦筋',
      '横筋',
      '横筋',
      '縦筋',
    ])
    expectNoOverlap(planes, wallSection.thickness)
  })

  it('folds the two layers about the mid-plane without letting them meet', () => {
    const planes = barPlanes(wallSection)
    const mid = wallSection.thickness / 2
    const offsets = planes.map(({ z }) => z - mid)

    // ダブルは両面ぶん — 中央面をはさんで鏡像になる。
    expect(offsets[0]).toBeCloseTo(-offsets[3], 9)
    expect(offsets[1]).toBeCloseTo(-offsets[2], 9)
    // 手前の2本はどちらも中央面より手前だ（層が入れ替わっていない）。
    expect(offsets[0]).toBeLessThan(offsets[1])
    expect(offsets[1]).toBeLessThan(0)
  })

  it('backs the pair onto the mid-plane for a single layer', () => {
    const single: WallSection = { ...wallSection, layers: 1 }
    const planes = barPlanes(single)

    expect(planes).toHaveLength(2)
    expect(planes.map(({ role }) => role)).toEqual(['縦筋', '横筋'])
    // 1層なのでかぶり面ではなく壁厚の中央をはさんで背中合わせに立つ。
    expect((planes[0].z + planes[1].z) / 2).toBe(single.thickness / 2)
    expectNoOverlap(planes, single.thickness)
  })

  it('shrinks the display radius until the layers fit a thin wall', () => {
    // 誇張した表示半径のままだと D13 ダブルは 150mm の壁に入らない。壁からはみ出す
    // か層どうしが食い込むかの二択になるので、入る大きさまで一律に縮める。
    const thin: WallSection = { ...wallSection, thickness: 150 }
    const planes = barPlanes(thin)

    expect(planes).toHaveLength(4)
    for (const { radius } of planes) {
      expect(radius).toBeLessThan(rebarRadius(wallSection.vertical.size))
    }
    expectNoOverlap(planes, thin.thickness)
  })

  it('leaves the in-plane distribution to the domain layout', () => {
    const [vertical] = generateWallRebar(
      { member: wallMember, section: wallSection, span },
      jpMlitRulePack,
    )
    const layout = stirrupPositions(
      span.clearLengthMm,
      wallSection.vertical.pitch,
      wallSection.vertical.startOffsetMm,
    )
    const placements = rebarPlacements(vertical, wallSection)

    // 厚さ方向を分けても割付は動かない — 出所はドメインの layout だけである。
    expect(placements.map(([x]) => x)).toEqual([
      ...layout.positionsMm,
      ...layout.positionsMm,
    ])
  })
})

describe('床板の3D — 2方向×2面が板厚に収まる (ADR-028)', () => {
  const project = createSampleProject()
  const slabMember = project.members.find(({ kind }) => kind === '床板')!

  function slabRebars(section = slabSection): Rebar[] {
    return (['X', 'Y'] as const).flatMap((axis) =>
      generateSlabRebar(
        { run: slabRun(project, slabMember, axis), section },
        jpMlitRulePack,
      ),
    )
  }

  /** 板厚方向に立つ面を、実際に描かれる半径つきで下から並べる。 */
  function barPlanes(
    section = slabSection,
  ): { z: number; radius: number; role: RebarRole }[] {
    return slabRebars(section)
      .map((rebar) => {
        // 直線部の高さで代表させる — 上端筋は折れ曲がって下へ落ちる点も持つ。
        const segments = rebarSegments(rebar, section)
        const z = Math.max(...segments.flatMap(({ from, to }) => [from[2], to[2]]))
        return { z, radius: segments[0].radius, role: rebar.role }
      })
      .sort((left, right) => left.z - right.z)
  }

  it('stacks 下端の2方向・上端の2方向 without letting them intersect', () => {
    const planes = barPlanes()

    expect(planes.map(({ role }) => role)).toEqual([
      'X方向下端筋',
      'Y方向下端筋',
      'Y方向上端筋',
      'X方向上端筋',
    ])

    // かぶり面に接するのは X方向 — 作図規則であって規準値ではない (ADR-019)。
    // 隣り合う鉄筋どうしが食い込まないことだけを見る。
    for (let index = 1; index < planes.length; index += 1) {
      const gap = planes[index].z - planes[index - 1].z
      expect(gap + 1e-6).toBeGreaterThanOrEqual(
        planes[index].radius + planes[index - 1].radius,
      )
    }
  })

  it('keeps every bar inside the slab thickness', () => {
    for (const { z, radius } of barPlanes()) {
      expect(z - radius).toBeGreaterThanOrEqual(-1e-6)
      expect(z + radius).toBeLessThanOrEqual(slabSection.thickness + 1e-6)
    }
  })

  it('shrinks the display radius when the slab is too thin for 4 layers', () => {
    // 表示半径は見せるために誇張してあるので、薄い板では 4層が板厚に入らない。
    // 板の外へ突き出すか層どうしが食い込むかのどちらかになるので、入る大きさまで
    // 一律に縮める — 壁でやっているのと同じ扱いである。
    const thin = { ...slabSection, thickness: 120 }
    const planes = barPlanes(thin)

    expect(planes).toHaveLength(4)
    for (const { radius } of planes) {
      expect(radius).toBeLessThan(rebarRadius(slabSection.x.bottom.size))
      expect(radius).toBeGreaterThan(0)
    }
    for (const { z, radius } of planes) {
      expect(z - radius).toBeGreaterThanOrEqual(-1e-6)
      expect(z + radius).toBeLessThanOrEqual(thin.thickness + 1e-6)
    }
  })

  it('leaves the in-plane distribution to the domain layout', () => {
    const [bottom] = generateSlabRebar(
      { run: slabRun(project, slabMember, 'X'), section: slabSection },
      jpMlitRulePack,
    )
    const layout = stirrupPositions(
      bottom.placement!.clearMm,
      bottom.placement!.pitchMm,
      bottom.placement!.startOffsetMm,
    )

    // X方向の鉄筋は y へ並ぶ。厚さ方向を分けても割付は動かない。
    expect(rebarPlacements(bottom, slabSection).map(([, y]) => y)).toEqual(
      layout.positionsMm,
    )
  })
})

describe('開口部の3D — 鉄筋を断ち、コンクリートをくり抜く (ADR-029)', () => {
  const opening: Opening = {
    id: 'op1',
    xMm: 2000,
    yMm: 900,
    widthMm: 1800,
    heightMm: 1200,
  }

  // 内法 5200×3450、D13@200 ダブル。縦筋 27本のうち 8本が開口を横切る。
  const span: WallSpan = {
    axis: 'X',
    clearLengthMm: 5200,
    clearHeightMm: 3450,
    startFaceOffsetMm: 400,
    endFaceOffsetMm: 400,
    girderDepthAboveMm: 750,
  }
  const holedWall: Member = {
    id: '1F-W1-X1Y1-X',
    kind: '耐震壁',
    memberClass: '躯体',
    sectionId: wallSection.id,
    storyId: '1F',
    position: { axis: 'X', ix: 0, iy: 0 },
  }

  function wallBars(openings: Opening[]) {
    return generateWallRebar(
      { member: { ...holedWall, openings }, section: wallSection, span },
      jpMlitRulePack,
    )
  }

  it('cuts every bar that runs through the opening', () => {
    const cut = wallBars([opening]).find(
      (rebar) => rebar.role === '縦筋' && rebar.length < 4000,
    )!
    const segments = rebarSegments(cut, wallSection, rebarRadius, [opening])

    // 縦筋は局所 y に走る。開口の中に入る点が1つも残っていない。
    for (const { from, to } of segments) {
      for (const [x, y] of [from, to]) {
        const inside =
          x > opening.xMm &&
          x < opening.xMm + opening.widthMm &&
          y > opening.yMm &&
          y < opening.yMm + opening.heightMm
        expect(inside).toBe(false)
      }
    }
  })

  it('splits a crossing bar in two instead of shortening it', () => {
    const cut = wallBars([opening]).find(
      (rebar) => rebar.role === '縦筋' && rebar.length < 4000,
    )!
    const whole = rebarSegments(cut, wallSection)
    const clipped = rebarSegments(cut, wallSection, rebarRadius, [opening])

    // 断たれた本は開口の上下2本の破片になる。この行は8本 × ダブル配筋2層で
    // 16本が描かれるので、破片が16だけ増える（定着の区間は開口の外なので割れない）。
    expect(clipped).toHaveLength(whole.length + 16)
  })

  it('leaves bars that miss the opening untouched', () => {
    const full = wallBars([opening]).find(
      (rebar) => rebar.role === '縦筋' && rebar.length > 4000,
    )!

    expect(rebarSegments(full, wallSection, rebarRadius, [opening])).toEqual(
      rebarSegments(full, wallSection),
    )
  })

  it('does not cut a bar that sits exactly on the opening edge', () => {
    // 開口の縁 x ＝ 2000 にちょうど載る本は開口の外だ — 数量の欠除判定と同じ約束。
    const edge: Opening = { ...opening, xMm: 2200, widthMm: 1400 }
    const bar = wallBars([edge]).find(({ role }) => role === '縦筋')!
    const atEdge = (openings: Opening[]) =>
      rebarSegments(bar, wallSection, rebarRadius, openings).filter(
        ({ from }) => from[0] === 2200,
      ).length

    expect(atEdge([edge])).toBe(atEdge([]))
    expect(atEdge([edge])).toBeGreaterThan(0)
  })

  it('keeps the drawn total shorter than the uncut one', () => {
    const bars = wallBars([opening])
    const length = (openings: Opening[]) =>
      bars
        .flatMap((rebar) =>
          rebarSegments(rebar, wallSection, rebarRadius, openings),
        )
        .reduce(
          (sum, { from, to }) =>
            sum + Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
          0,
        )

    expect(length([opening])).toBeLessThan(length([]))
  })

  it('carves the concrete box into the pieces around the opening', () => {
    const box = {
      center: [2600, 1725, 100] as Point3,
      size: [5200, 3450, 200] as Point3,
    }
    const pieces = carveBox(box, [0, 1], boxHoles([opening], 0, 0))

    // 左・右・下・上の4枚。厚さ（軸2）は割らない — 開口は壁を貫くからだ。
    expect(pieces).toHaveLength(4)
    for (const piece of pieces) {
      expect(piece.size[2]).toBe(200)
    }
    // 破片の面積の和 ＝ 元の面積 − 開口の面積
    const area = pieces.reduce(
      (sum, { size }) => sum + size[0] * size[1],
      0,
    )
    expect(area).toBe(5200 * 3450 - 1800 * 1200)
  })

  it('carves nothing when the opening misses the box', () => {
    const box = {
      center: [2600, 1725, 100] as Point3,
      size: [5200, 3450, 200] as Point3,
    }

    expect(
      carveBox(box, [0, 1], boxHoles([opening], 20000, 0)),
    ).toEqual([box])
  })

  it('carves both openings when they overlap in projection', () => {
    const second: Opening = { ...opening, id: 'op2', yMm: 2400, heightMm: 600 }
    const box = {
      center: [2600, 1725, 100] as Point3,
      size: [5200, 3450, 200] as Point3,
    }
    const pieces = carveBox(box, [0, 1], boxHoles([opening, second], 0, 0))
    const area = pieces.reduce((sum, { size }) => sum + size[0] * size[1], 0)

    expect(area).toBe(5200 * 3450 - 1800 * 1200 - 1800 * 600)
  })
})

describe('rebarSegments と 長さ 0', () => {
  /**
   * 書き出し (lib/export/gltf.ts) はこの不変に乗っている。長さ 0 の区間が
   * 降りてくると scale 0 の行列になり、EXT_mesh_gpu_instancing の書き出しで
   * Matrix4.decompose が 1/0 を掛けて回転を NaN にする — 但しそれは
   * ここで切れている。切れていないなら向こうで防ぐ必要がある。
   */
  it('makes no segment out of a path whose points coincide', () => {
    const stuck: Rebar = {
      ...main,
      id: 'stuck',
      points: [main.points[0], main.points[0]],
    }

    expect(rebarSegments(stuck, section)).toHaveLength(0)
  })
})

describe('roleToLayer', () => {
  it.each([
    ['主筋', 'main'],
    ['上端筋', 'main'],
    ['下端筋', 'main'],
    ['上端カットオフ筋', 'main'],
    ['下端カットオフ筋', 'main'],
    ['帯筋', 'hoop'],
    ['あばら筋', 'hoop'],
    ['幅止め筋', 'hoop'],
    ['腹筋', 'main'],
    ['X方向上端筋', 'main'],
    ['X方向下端筋', 'main'],
    ['Y方向上端筋', 'main'],
    ['Y方向下端筋', 'main'],
  ] satisfies [RebarRole, 'main' | 'hoop'][])(
    'maps %s to %s',
    (role, expected) => {
      expect(roleToLayer(role)).toBe(expected)
    },
  )
})

describe('easeOutCubic', () => {
  it('eases from 0 to 1 and clamps outside the range', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })
})

describe('lerpCameraFit', () => {
  const from: CameraFit = { position: [0, 0, 0], target: [10, 10, 10] }
  const to: CameraFit = { position: [100, 200, 300], target: [30, 10, 50] }

  it('returns the endpoints at t=0 and t=1 and blends between', () => {
    expect(lerpCameraFit(from, to, 0)).toEqual(from)
    expect(lerpCameraFit(from, to, 1)).toEqual(to)

    const mid = lerpCameraFit(from, to, 0.5)
    expect(mid.position).toEqual([50, 100, 150])
    expect(mid.target).toEqual([20, 10, 30])
  })
})

describe('flyInStartPose', () => {
  const fit: CameraFit = { position: [100, 50, 0], target: [0, 50, 0] }

  it('keeps the target and scales the camera distance', () => {
    const pose = flyInStartPose(fit, Math.PI / 2, 1.35)

    expect(pose.target).toEqual(fit.target)
    const distance = Math.hypot(
      pose.position[0] - fit.target[0],
      pose.position[1] - fit.target[1],
      pose.position[2] - fit.target[2],
    )
    expect(distance).toBeCloseTo(100 * 1.35)
  })

  it('rotates around the vertical axis through the target', () => {
    const pose = flyInStartPose(fit, Math.PI / 2, 1)

    expect(pose.position[0]).toBeCloseTo(0)
    expect(pose.position[1]).toBeCloseTo(50)
    expect(pose.position[2]).toBeCloseTo(-100)
  })
})

describe('fitCamera', () => {
  it('projects all eight bounds corners inside the 1.08 framing margin', () => {
    const bounds: Bounds = {
      min: [-400, -900, -300],
      max: [800, 5200, 1000],
    }
    const { position, target } = fitCamera(bounds)
    const cameraZ = normalize(subtract(position, target))
    const cameraX = normalize(cross([0, 1, 0], cameraZ))
    const cameraY = cross(cameraZ, cameraX)
    const distance = Math.hypot(...subtract(position, target))
    const tangent = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360)
    const projected = corners(bounds).flatMap((corner) => {
      const relative = subtract(corner, target)
      const depth = distance - dot(relative, cameraZ)
      return [
        Math.abs(dot(relative, cameraX) / (depth * tangent)),
        Math.abs(dot(relative, cameraY) / (depth * tangent)),
      ]
    })
    const projectedLimit = 1 / CAMERA_FRAME_MARGIN

    expect(target).toEqual([200, 2150, 350])
    expect(Math.max(...projected)).toBeCloseTo(projectedLimit, 10)
    expect(projected.every((value) => value <= projectedLimit + 1e-12)).toBe(
      true,
    )
  })
})

describe('rebarBatches 런 오프셋', () => {
  // 連続スパン에서 두 스팬의 あばら筋은 断面이 같으면 加工長·本数가 같아 **같은
  // 내역 행**으로 묶인다. 그래서 오프셋을 배치 단위로 걸면 한쪽이 사라진다 —
  // 병합 전에 철근 단위로 걸어야 2번째 스팬에 스터럽이 남는다.
  const secondSpanStirrup: Rebar = {
    ...girderStirrup,
    id: '1F-G1-2|stirrup',
    memberId: '1F-G1-2',
  }
  const rowId = '1階|G|G1|あばら筋'
  const offsetMm = GIRDER_CLEAR_MM + 800

  it('shifts a rebar into the run frame before merging same-row batches', () => {
    const merged = rebarBatches(
      [
        { rowId, rebar: girderStirrup, originOffsetMm: 0 },
        { rowId, rebar: secondSpanStirrup, originOffsetMm: offsetMm },
      ],
      girderSection,
    )

    expect(merged).toHaveLength(1)

    const xs = merged[0].segments.flatMap(({ from, to }) => [from[0], to[0]])
    expect(Math.min(...xs)).toBeLessThan(GIRDER_CLEAR_MM)
    // 2번째 스팬이 첫 스팬 위에 겹치면 최대 x가 첫 스팬 内法을 못 넘는다.
    expect(Math.max(...xs)).toBeGreaterThan(offsetMm)
  })

  it('leaves an unshifted rebar where the generator put it', () => {
    const [batch] = rebarBatches(
      [{ rowId, rebar: girderStirrup }],
      girderSection,
    )
    const xs = batch.segments.flatMap(({ from, to }) => [from[0], to[0]])

    expect(Math.max(...xs)).toBeLessThanOrEqual(GIRDER_CLEAR_MM)
  })
})

describe('rebarBatches', () => {
  it('emits one batch per takeoff row, not per segment', () => {
    const batches = rebarBatches(
      [
        { rowId: "1階|C|C1|主筋", rebar: main },
        { rowId: "1階|C|C1|帯筋", rebar: hoop },
      ],
      section,
    )

    expect(batches).toHaveLength(2)
    expect(batches.map(({ rowId }) => rowId)).toEqual([
      '1階|C|C1|主筋',
      '1階|C|C1|帯筋',
    ])
    expect(batches.map(({ layer, zone }) => ({ layer, zone }))).toEqual([
      { layer: 'main', zone: null },
      { layer: 'hoop', zone: null },
    ])
  })

  it('keeps every segment the per-rebar builder would have produced', () => {
    const batches = rebarBatches(
      [
        { rowId: "1階|C|C1|主筋", rebar: main },
        { rowId: "1階|C|C1|帯筋", rebar: hoop },
      ],
      section,
    )
    const total = batches.reduce((sum, { segments }) => sum + segments.length, 0)
    const expected =
      rebarSegments(main, section).length + rebarSegments(hoop, section).length

    expect(total).toBe(expected)
    expect(batches[0].segments).toEqual(rebarSegments(main, section))
  })

  it('merges rebars that share a row into a single batch', () => {
    const batches = rebarBatches(
      [
        { rowId: "1階|C|C1|主筋", rebar: main },
        { rowId: "1階|C|C1|主筋", rebar: { ...main, id: "other" } },
      ],
      section,
    )

    expect(batches).toHaveLength(1)
    expect(batches[0].segments).toHaveLength(
      rebarSegments(main, section).length * 2,
    )
  })

  it('splits two end zones from a straight bar into three path batches', () => {
    const zoned: Rebar = {
      ...main,
      count: 1,
      points: [
        [40, 0, 40],
        [40, 1000, 40],
      ],
      length: 1000,
      zones: [
        { kind: '定着', ruleKey: 'anchorage.L1', pathFromMm: 0, pathToMm: 100 },
        {
          kind: '定着',
          ruleKey: 'anchorage.L1',
          pathFromMm: 900,
          pathToMm: 1000,
        },
      ],
    }

    const batches = rebarBatches(
      [{ rowId: '1階|C|C1|主筋', rebar: zoned }],
      section,
    )

    expect(batches.map(({ zone }) => zone)).toEqual([
      '定着',
      null,
      '定着',
    ])
    expect(
      batches.map(({ segments }) =>
        segments.reduce(
          (sum, { from, to }) => sum + Math.hypot(...subtract(to, from)),
          0,
        ),
      ),
    ).toEqual([100, 800, 100])
  })

  it('keeps one zone batch continuous when it crosses a fold', () => {
    const folded: Rebar = {
      ...girderTop,
      count: 1,
      shape: 'hook90',
      points: [
        [0, 100, 50],
        [100, 100, 50],
        [100, 200, 50],
      ],
      length: 200,
      zones: [
        {
          kind: '定着',
          ruleKey: 'anchorage.L1h',
          pathFromMm: 50,
          pathToMm: 150,
        },
      ],
    }

    const batches = rebarBatches(
      [{ rowId: '1階|G|G1|上端筋', rebar: folded }],
      girderSection,
    )

    expect(batches.map(({ zone }) => zone)).toEqual([null, '定着', null])
    expect(batches[1].segments).toHaveLength(2)
    expect(batches[1].segments[0].to).toEqual(batches[1].segments[1].from)
  })

  it('does not create a zero-length segment at a fold on a zone boundary', () => {
    const folded: Rebar = {
      ...girderTop,
      count: 1,
      shape: 'hook90',
      points: [
        [0, 100, 50],
        [100, 100, 50],
        [100, 200, 50],
      ],
      length: 200,
      zones: [
        {
          kind: '定着',
          ruleKey: 'anchorage.L1h',
          pathFromMm: 0,
          pathToMm: 100,
        },
      ],
    }

    const batches = rebarBatches(
      [{ rowId: '1階|G|G1|上端筋', rebar: folded }],
      girderSection,
    )

    expect(batches.map(({ zone }) => zone)).toEqual(['定着', null])
    expect(batches.flatMap(({ segments }) => segments)).toHaveLength(2)
    for (const { from, to } of batches.flatMap(({ segments }) => segments)) {
      expect(Math.hypot(...subtract(to, from))).toBeGreaterThan(0)
    }
  })

  it('keeps a rebar without zones in one null-zone batch', () => {
    const batches = rebarBatches(
      [{ rowId: '1階|G|G1|下端筋', rebar: girderBottom }],
      girderSection,
    )

    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      rowId: '1階|G|G1|下端筋',
      layer: 'main',
      zone: null,
    })
    expect(batches[0].segments).toEqual(
      rebarSegments(girderBottom, girderSection),
    )
  })
})

describe('円形柱の配筋を円周に沿って描く', () => {
  // 数量は 1通則2) の周長で決まる (ADR-027)。ここが見るのは 3D の作図規則で、
  // 矩形柱と同じ約束 — 帯筋の外面がかぶり面に、主筋の表面が帯筋の内面に接する。
  const DIAMETER = 600
  const circularSection: ColumnSection = {
    ...section,
    shape: '円形',
    b: DIAMETER,
    d: DIAMETER,
  }
  const centre = DIAMETER / 2

  function radii(rebar: Rebar): number[] {
    return rebarSegments(rebar, circularSection).flatMap(({ from, to }) =>
      [from, to].map(([x, , z]) => Math.hypot(x - centre, z - centre)),
    )
  }

  const generated = generateColumnRebar(
    {
      member: {
        id: '1F-X1Y1',
        kind: '柱',
        memberClass: '躯体',
        sectionId: circularSection.id,
        storyId: '1F',
        position: { ix: 0, iy: 0 },
      },
      section: circularSection,
      story: { id: '1F', name: '1階', height: 4200 },
      beamDepthAbove: 750,
      ends: { bottom: 'なし', top: '先端' },
    },
    jpMlitRulePack,
  )
  const circularHoop = generated.find(({ role }) => role === '帯筋')!
  const circularMain = generated.find(({ role }) => role === '主筋')!

  // ドメインが置いたかぶり円の半径。円形フープの points[0] は角度0の点なので
  // 中心からの距離で読む — x 座標そのものではない。
  const coverRadius = Math.hypot(
    circularHoop.points[0][0] - centre,
    circularHoop.points[0][2] - centre,
  )

  it('keeps every 帯筋 point on one circle', () => {
    // 표시 반경만큼 안쪽 — 矩形의 insetCoordinate와 같은 약속을 반지름으로 한다
    for (const radius of radii(circularHoop)) {
      expect(radius).toBeCloseTo(coverRadius - HOOP_DISPLAY_RADIUS, 6)
    }
  })

  it('spreads 主筋 evenly around that circle, inside the 帯筋', () => {
    const placements = rebarPlacements(circularMain, circularSection)
    const [originX, , originZ] = circularMain.points[0]
    const distances = placements.map(([dx, , dz]) =>
      Math.hypot(originX + dx - centre, originZ + dz - centre),
    )
    const expected = coverRadius - MAIN_INWARD

    expect(placements).toHaveLength(circularMain.count)
    for (const distance of distances) expect(distance).toBeCloseTo(expected, 6)

    // 等間隔であること — 隣り合う2本の中心間距離が全て同じ
    const points = placements.map(([dx, , dz]): [number, number] => [
      originX + dx,
      originZ + dz,
    ])
    const gaps = points.map(([x, z], index) => {
      const [nextX, nextZ] = points[(index + 1) % points.length]
      return Math.hypot(nextX - x, nextZ - z)
    })
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)
  })

  it('never lets the drawn bars leave the concrete', () => {
    for (const rebar of [circularHoop, circularMain]) {
      const radius = rebarSegments(rebar, circularSection)[0].radius
      for (const distance of radii(rebar)) {
        expect(distance + radius).toBeLessThanOrEqual(centre + 1e-9)
      }
    }
  })
})
