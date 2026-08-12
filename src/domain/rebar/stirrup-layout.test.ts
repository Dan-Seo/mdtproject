import { describe, expect, it } from 'vitest'

import { stirrupPositions } from './stirrup-layout'

// 規準에 값이 없는 배치값이다 — 断面一覧의 입력을 대표하는 표본값으로 검사한다
const startOffsetMm = 50

describe('stirrupPositions', () => {
  it('never places a stirrup beyond the offset interval', () => {
    const layout = stirrupPositions(
      5200,
      150,
      startOffsetMm,
    )

    expect(layout.positionsMm.at(-1)).toBe(5150)
    expect(layout.positionsMm).not.toContain(5250)
  })

  it('does not duplicate the interval end when the pitch divides it exactly', () => {
    const layout = stirrupPositions(
      5200,
      150,
      startOffsetMm,
    )

    expect(layout.positionsMm.filter((position) => position === 5150)).toHaveLength(
      1,
    )
    expect(layout.lastGapMm).toBe(150)
  })

  it('adds the interval end when a remainder exists', () => {
    const layout = stirrupPositions(
      5250,
      150,
      startOffsetMm,
    )

    expect(layout.positionsMm.slice(-2)).toEqual([5150, 5200])
    expect(layout.lastGapMm).toBe(50)
  })

  it('preserves every placement invariant across clear lengths and pitches', () => {
    const clearLengths = [500, 1000, 5200, 5250, 6050]
    const pitches = [50, 100, 150, 200, 333]

    for (const clearMm of clearLengths) {
      for (const pitchMm of pitches) {
        const { positionsMm, lastGapMm } = stirrupPositions(
          clearMm,
          pitchMm,
          startOffsetMm,
        )
        const intervalEndMm = clearMm - startOffsetMm

        expect(positionsMm[0]).toBe(startOffsetMm)
        expect(positionsMm.at(-1)).toBe(intervalEndMm)
        expect(new Set(positionsMm).size).toBe(positionsMm.length)

        for (const position of positionsMm) {
          expect(position).toBeGreaterThanOrEqual(startOffsetMm)
          expect(position).toBeLessThanOrEqual(intervalEndMm)
        }

        for (let index = 1; index < positionsMm.length; index += 1) {
          const gap = positionsMm[index] - positionsMm[index - 1]

          expect(gap).toBeGreaterThan(0)
          expect(gap).toBeLessThanOrEqual(pitchMm)
        }

        expect(lastGapMm).toBe(
          positionsMm.at(-1)! - positionsMm.at(-2)!,
        )
      }
    }
  })

  it.each([0, -1])('throws for an invalid pitch %s', (pitchMm) => {
    expect(() =>
      stirrupPositions(5200, pitchMm, startOffsetMm),
    ).toThrow(/pitchMm/)
  })

  it.each([100, 99])(
    'throws when the symmetric placement interval cannot be formed for clearMm %s',
    (clearMm) => {
      expect(() =>
        stirrupPositions(clearMm, 150, startOffsetMm),
      ).toThrow(/clearMm/)
    },
  )
})
