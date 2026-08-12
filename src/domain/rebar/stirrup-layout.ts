export interface StirrupLayout {
  /** 内法 좌표계(좌측 柱面 = 0)의 위치 배열 (mm) */
  positionsMm: number[]
  /** 마지막 잔여 간격 (mm) — 범례 표시용 */
  lastGapMm: number
}

export function stirrupPositions(
  clearMm: number,
  pitchMm: number,
  startOffsetMm: number,
): StirrupLayout {
  if (!Number.isFinite(clearMm)) {
    throw new Error(`clearMm must be finite: ${clearMm}`)
  }
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) {
    throw new Error(`pitchMm must be positive and finite: ${pitchMm}`)
  }
  if (!Number.isFinite(startOffsetMm) || startOffsetMm < 0) {
    throw new Error(
      `startOffsetMm must be non-negative and finite: ${startOffsetMm}`,
    )
  }
  if (clearMm <= 2 * startOffsetMm) {
    throw new Error(
      `clearMm must exceed twice startOffsetMm: ${clearMm} <= ` +
        `${2 * startOffsetMm}`,
    )
  }

  const intervalStartMm = startOffsetMm
  const intervalEndMm = clearMm - startOffsetMm
  const positionsMm = [intervalStartMm]

  for (let index = 1; ; index += 1) {
    const positionMm = intervalStartMm + index * pitchMm
    if (positionMm >= intervalEndMm) break
    positionsMm.push(positionMm)
  }

  positionsMm.push(intervalEndMm)

  for (let index = 0; index < positionsMm.length; index += 1) {
    const positionMm = positionsMm[index]
    if (positionMm < intervalStartMm || positionMm > intervalEndMm) {
      throw new Error(`あばら筋 position outside placement interval: ${positionMm}`)
    }

    if (index > 0) {
      const gapMm = positionMm - positionsMm[index - 1]
      if (gapMm <= 0 || gapMm > pitchMm) {
        throw new Error(`Invalid あばら筋 gap: ${gapMm}`)
      }
    }
  }

  return {
    positionsMm,
    lastGapMm:
      positionsMm[positionsMm.length - 1] -
      positionsMm[positionsMm.length - 2],
  }
}
