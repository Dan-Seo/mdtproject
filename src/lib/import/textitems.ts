import type { TextItem } from './section-list/types'

/** pdf.js getTextContent()의 items 중 문자열 항목. */
export interface PdfTextItemLike {
  str: string
  width: number
  height: number
  transform: number[]
}

/** pdf.js Util.transform과 동일한 2×3 행렬 합성. */
function multiplyTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

function rotationDegrees(transform: number[]): number | undefined {
  const [, b, c] = transform
  const epsilon = Number.EPSILON * 10

  if (Math.abs(b) <= epsilon && Math.abs(c) <= epsilon) {
    return undefined
  }

  return (Math.atan2(b, transform[0]) * 180) / Math.PI
}

/**
 * pdf.js TextItem → 문자 단위 TextItem[] (좌상 원점, +y 아래, pt, y=베이스라인).
 *
 * 프로덕션 추출기(pdf-text.ts)와 픽스처 생성기(scripts/extract-textitems.mjs)가
 * 반드시 이 함수를 공유한다 — CI가 픽스처로 검증하는 좌표 규약과 제품이 실제로
 * 만드는 좌표 규약이 갈라지면 파서 테스트가 제품 입력을 검증하지 못하게 된다.
 */
export function toTextItems(
  items: readonly PdfTextItemLike[],
  viewportTransform: number[],
): TextItem[] {
  return items.flatMap((item) => {
    if (typeof item.str !== 'string' || item.str.trim() === '') {
      return []
    }

    const transform = multiplyTransform(viewportTransform, item.transform)
    const characters = Array.from(item.str)
    const characterWidth = item.width / characters.length
    const baselineScale = Math.hypot(transform[0], transform[1])
    const directionX = baselineScale === 0 ? 0 : transform[0] / baselineScale
    const directionY = baselineScale === 0 ? 0 : transform[1] / baselineScale
    const rot = rotationDegrees(transform)

    return characters.flatMap((str, index) => {
      if (str.trim() === '') {
        return []
      }

      const extracted: TextItem = {
        str,
        x: transform[4] + directionX * characterWidth * index,
        y: transform[5] + directionY * characterWidth * index,
        w: characterWidth,
        h: item.height,
      }

      return rot === undefined ? [extracted] : [{ ...extracted, rot }]
    })
  })
}
