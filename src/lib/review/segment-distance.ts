import type { Point3 } from '@/lib/viewer/geometry'

export interface Segment {
  from: Point3
  to: Point3
  radius: number
}

export interface SegmentDistance {
  pa: Point3
  pb: Point3
  distance: number
}

const DEGENERATE_LENGTH_SQUARED = 1e-24

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function addScaled(point: Point3, direction: Point3, scale: number): Point3 {
  return [
    point[0] + direction[0] * scale,
    point[1] + direction[1] * scale,
    point[2] + direction[2] * scale,
  ]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Standard closest points on two finite 3D segments, including point segments. */
export function closestPointsBetweenSegments(
  a: Pick<Segment, 'from' | 'to'>,
  b: Pick<Segment, 'from' | 'to'>,
): SegmentDistance {
  const d1 = subtract(a.to, a.from)
  const d2 = subtract(b.to, b.from)
  const r = subtract(a.from, b.from)
  const aa = dot(d1, d1)
  const ee = dot(d2, d2)
  const ff = dot(d2, r)

  let s = 0
  let t = 0

  if (aa <= DEGENERATE_LENGTH_SQUARED && ee <= DEGENERATE_LENGTH_SQUARED) {
    // Both segments are points.
  } else if (aa <= DEGENERATE_LENGTH_SQUARED) {
    // The first segment is a point; project it onto the second segment.
    t = clamp01(ff / ee)
  } else {
    const cc = dot(d1, r)

    if (ee <= DEGENERATE_LENGTH_SQUARED) {
      // The second segment is a point; project it onto the first segment.
      s = clamp01(-cc / aa)
    } else {
      const bb = dot(d1, d2)
      const denominator = aa * ee - bb * bb

      // Parallel segments have no unique unconstrained solution. s=0 gives a
      // valid endpoint-to-segment candidate and the boundary pass below clamps it.
      if (denominator > DEGENERATE_LENGTH_SQUARED) {
        s = clamp01((bb * ff - cc * ee) / denominator)
      }

      const tNumerator = bb * s + ff
      if (tNumerator < 0) {
        t = 0
        s = clamp01(-cc / aa)
      } else if (tNumerator > ee) {
        t = 1
        s = clamp01((bb - cc) / aa)
      } else {
        t = tNumerator / ee
      }
    }
  }

  const pa = addScaled(a.from, d1, s)
  const pb = addScaled(b.from, d2, t)
  const difference = subtract(pa, pb)
  return { pa, pb, distance: Math.sqrt(dot(difference, difference)) }
}

export function capsuleClearanceMm(
  a: Segment,
  b: Segment,
): SegmentDistance & { clearanceMm: number } {
  const closest = closestPointsBetweenSegments(a, b)
  return {
    ...closest,
    clearanceMm: closest.distance - a.radius - b.radius,
  }
}
