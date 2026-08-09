import { describe, expect, it } from 'vitest'

import type { Rebar } from '@/domain/model/rebar'

import {
  CAMERA_FOV_DEGREES,
  CAMERA_FRAME_MARGIN,
  fitCamera,
  rebarRadius,
  rebarSegments,
  type Bounds,
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

describe('rebarSegments', () => {
  it('includes the last-to-first segment for a closed 帯筋', () => {
    const segments = rebarSegments(hoop)

    expect(segments).toHaveLength(4)
    expect(segments.at(-1)).toEqual({
      from: [40, 0, 760],
      to: [40, 0, 40],
      radius: rebarRadius('D13'),
    })
  })

  it('does not close an open 主筋', () => {
    const segments = rebarSegments(main)

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
