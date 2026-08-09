import type { BarSize } from '@/domain/model/member'
import type { Rebar } from '@/domain/model/rebar'

export type Point3 = [number, number, number]

export interface Segment {
  from: Point3
  to: Point3
  radius: number
}

export interface Bounds {
  min: Point3
  max: Point3
}

export interface CameraFit {
  position: Point3
  target: Point3
}

export const CAMERA_FOV_DEGREES = 38
export const CAMERA_FRAME_MARGIN = 1.08
export const CAMERA_DIRECTION: Point3 = [0.72, 0.34, 0.86]

const MINIMUM_DISPLAY_DIAMETER = 14
const DISPLAY_DIAMETER_SCALE = 1.6

function barDiameter(size: BarSize): number {
  const diameter = Number(size.replace(/^D/, ''))

  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Invalid BarSize: ${size}`)
  }

  return diameter
}

export function rebarRadius(size: BarSize): number {
  return (
    Math.max(barDiameter(size), MINIMUM_DISPLAY_DIAMETER) *
    DISPLAY_DIAMETER_SCALE
  )
}

export function rebarSegments(rebar: Rebar): Segment[] {
  const { points } = rebar
  const radius = rebarRadius(rebar.size)
  const segments = points.slice(1).map((to, index) => ({
    from: points[index],
    to,
    radius,
  }))

  if (rebar.closed && points.length > 1) {
    segments.push({
      from: points[points.length - 1],
      to: points[0],
      radius,
    })
  }

  return segments
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
  const length = Math.hypot(vector[0], vector[1], vector[2])

  if (!Number.isFinite(length) || length === 0) {
    throw new Error('Cannot normalize an invalid camera vector')
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function boundsCorners({ min, max }: Bounds): Point3[] {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) =>
      [min[2], max[2]].map((z): Point3 => [x, y, z]),
    ),
  )
}

function assertBounds(bounds: Bounds): void {
  for (let axis = 0; axis < bounds.min.length; axis += 1) {
    const min = bounds.min[axis]
    const max = bounds.max[axis]

    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new Error(`Invalid bounds on axis ${axis}: ${min}..${max}`)
    }
  }
}

export function fitCamera(bounds: Bounds): CameraFit {
  assertBounds(bounds)

  const target: Point3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]
  const cameraZ = normalize(CAMERA_DIRECTION)
  const cameraX = normalize(cross([0, 1, 0], cameraZ))
  const cameraY = cross(cameraZ, cameraX)
  const tangent = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360)
  const distance = Math.max(
    Number.EPSILON,
    ...boundsCorners(bounds).map((corner) => {
      const relative = subtract(corner, target)
      const projectedRadius = Math.max(
        Math.abs(dot(relative, cameraX)),
        Math.abs(dot(relative, cameraY)),
      )

      return (
        dot(relative, cameraZ) +
        (CAMERA_FRAME_MARGIN * projectedRadius) / tangent
      )
    }),
  )
  const position: Point3 = [
    target[0] + cameraZ[0] * distance,
    target[1] + cameraZ[1] * distance,
    target[2] + cameraZ[2] * distance,
  ]

  return { position, target }
}
