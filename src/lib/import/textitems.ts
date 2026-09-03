import type { TextItem } from './types'

/** pdf.js getTextContent()의 items 중 문자열 항목. */
export interface PdfTextItemLike {
  str: string
  width: number
  height: number
  transform: number[]
}

const DEDUPE_TOLERANCE_PT = 0.5

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
  const extracted = items.flatMap((item) => {
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

  // 일부 CAD/PDF 생성기는 굵은 글자를 같은 위치에 여러 번 그린다. 먼저
  // 나온 글자를 남기되, 모든 후보를 비교하는 O(n²) 대신 0.5pt 공간 버킷을
  // 사용해 인쇄 위치가 많은 페이지에서도 추출 정규화 비용을 선형에 가깝게
  // 유지한다.
  const buckets = new Map<string, Map<string, TextItem[]>>()
  const deduplicated: TextItem[] = []

  for (const item of extracted) {
    const rotationKey = item.rot === undefined ? 'undefined' : String(item.rot)
    const groupKey = `${item.str}\u0000${rotationKey}`
    const group = buckets.get(groupKey) ?? new Map<string, TextItem[]>()
    buckets.set(groupKey, group)

    const bucketX = Math.floor(item.x / DEDUPE_TOLERANCE_PT)
    const bucketY = Math.floor(item.y / DEDUPE_TOLERANCE_PT)
    let duplicate = false

    for (let dx = -1; dx <= 1 && !duplicate; dx += 1) {
      for (let dy = -1; dy <= 1 && !duplicate; dy += 1) {
        const candidates = group.get(`${bucketX + dx},${bucketY + dy}`) ?? []
        duplicate = candidates.some(
          (candidate) =>
            Math.abs(candidate.x - item.x) <= DEDUPE_TOLERANCE_PT &&
            Math.abs(candidate.y - item.y) <= DEDUPE_TOLERANCE_PT,
        )
      }
    }

    if (duplicate) continue

    const bucketKey = `${bucketX},${bucketY}`
    group.set(bucketKey, [...(group.get(bucketKey) ?? []), item])
    deduplicated.push(item)
  }

  return deduplicated
}
