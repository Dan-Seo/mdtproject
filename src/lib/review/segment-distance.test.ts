import { describe, expect, it } from 'vitest'

import {
  capsuleClearanceMm,
  closestPointsBetweenSegments,
} from './segment-distance'

describe('segment distance', () => {
  it('handles parallel segments by their closest endpoints', () => {
    const result = closestPointsBetweenSegments(
      { from: [0, 0, 0], to: [10, 0, 0] },
      { from: [0, 3, 4], to: [10, 3, 4] },
    )
    expect(result.pa).toEqual([0, 0, 0])
    expect(result.pb).toEqual([0, 3, 4])
    expect(result.distance).toBeCloseTo(5, 9)
  })

  it('returns zero for crossing segments', () => {
    const result = closestPointsBetweenSegments(
      { from: [-1, 0, 0], to: [1, 0, 0] },
      { from: [0, -1, 0], to: [0, 1, 0] },
    )
    expect(result.pa).toEqual([0, 0, 0])
    expect(result.pb).toEqual([0, 0, 0])
    expect(result.distance).toBeCloseTo(0, 9)
  })

  it('handles skew segments', () => {
    // The closest points are (0,0,0) and (0,2,3), so the separation is 3.
    const result = closestPointsBetweenSegments(
      { from: [0, 0, 0], to: [10, 0, 0] },
      { from: [0, 2, 3], to: [0, 12, 3] },
    )
    expect(result.distance).toBeCloseTo(Math.sqrt(13), 9)
  })

  it('handles point-degenerate segments', () => {
    const result = closestPointsBetweenSegments(
      { from: [2, 3, 4], to: [2, 3, 4] },
      { from: [0, 0, 0], to: [10, 0, 0] },
    )
    expect(result.pa).toEqual([2, 3, 4])
    expect(result.pb).toEqual([2, 0, 0])
    expect(result.distance).toBeCloseTo(5, 9)
  })

  it('clamps the closest point to an endpoint and subtracts radii', () => {
    const result = capsuleClearanceMm(
      { from: [0, 0, 0], to: [1, 0, 0], radius: 1.5 },
      { from: [4, 3, 0], to: [4, 3, 0], radius: 0.5 },
    )
    expect(result.pa).toEqual([1, 0, 0])
    expect(result.pb).toEqual([4, 3, 0])
    expect(result.distance).toBeCloseTo(Math.sqrt(18), 9)
    expect(result.clearanceMm).toBeCloseTo(Math.sqrt(18) - 2, 9)
  })
})
