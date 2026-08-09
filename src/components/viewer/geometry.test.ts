import { describe, expect, it } from 'vitest'

import type { ColumnSection } from '@/domain/model/member'
import type { Rebar } from '@/domain/model/rebar'

import {
  CAMERA_FOV_DEGREES,
  CAMERA_FRAME_MARGIN,
  easeOutCubic,
  fitCamera,
  flyInStartPose,
  lerpCameraFit,
  rebarRadius,
  rebarSegments,
  type Bounds,
  type CameraFit,
  type Point3,
} from './geometry'

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
  rules: ['cover.minimum'],
  formula: 'test',
}

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
  count: 36,
  rules: ['cover.minimum'],
  formula: 'test',
}

const section: ColumnSection = {
  id: 'section-C1',
  kind: '柱',
  mark: 'C1',
  b: 800,
  d: 800,
  fc: 24,
  grade: 'SD345',
  main: { size: 'D25', count: 12 },
  hoop: { size: 'D13', pitch: 100 },
}

const HOOP_DISPLAY_RADIUS = rebarRadius(hoop.size)
const MAIN_DISPLAY_RADIUS = rebarRadius(main.size)
// 主筋 축이 かぶり 모서리에서 안쪽으로 밀리는 표시 오프셋:
// 帯筋 표시 지름 + 主筋 표시 반경 → 主筋 표면이 帯筋 안쪽면에 접한다.
const MAIN_INWARD = 2 * HOOP_DISPLAY_RADIUS + MAIN_DISPLAY_RADIUS

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

describe('rebarSegments', () => {
  it('emits segments for every 本 of 帯筋, not just the representative', () => {
    const segments = rebarSegments({ ...hoop, count: 3 }, section)

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
    const segments = rebarSegments({ ...hoop, count: 1 }, section)
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
    const hoopSegments = rebarSegments({ ...hoop, count: 1 }, section)
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
      ...hoop,
      count: 1,
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
      ...hoop,
      count: 1,
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
    const segments = rebarSegments({ ...hoop, count: 1 }, section)

    expect(segments).toHaveLength(4)
    const last = segments[segments.length - 1]
    expect(last.radius).toBeCloseTo(rebarRadius('D13'))
    expectPointCloseTo(last.from, [
      40 + HOOP_DISPLAY_RADIUS,
      0,
      760 - HOOP_DISPLAY_RADIUS,
    ])
    expectPointCloseTo(last.to, [
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
