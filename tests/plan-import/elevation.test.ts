import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFrameElevations } from '@/lib/import/framing-plan/elevation'
import type { TextPage } from '@/lib/import/section-list/types'

type TextItemFixture = {
  page: Pick<TextPage, 'widthPt' | 'heightPt'>
  items: TextPage['items']
}

function readPage(file: string): TextPage {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/section-import/textitems',
    file,
  )
  const fixture = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as TextItemFixture

  return { ...fixture.page, items: fixture.items }
}

// 기대값은 도면에서 독립 전사한 값이다 (원본: tests/fixtures/section-import/SOURCES.md).
// 위 계열의 치수 열은 1400·4100·4480·2690이고, 그 경계에 적힌 라벨은 위에서부터
// (없음)·中央棟RCL(水下)·2FL·中央棟1FL＋基準GL·基礎下端이다. 1FL과 GL은 190mm
// 차이라 이 축척(1/100)에서 5pt이고, 도면상 같은 자리로 읽힌다.
describe('yokohama p8 (軸組図)', () => {
  const parsed = parseFrameElevations(readPage('yokohama-p8.json'))

  it('위·아래 두 줄의 軸組図가 각각 계열이 된다', () => {
    expect(parsed.issues).toEqual([])
    expect(parsed.elevations).toHaveLength(2)
  })

  it('階高를 도면의 치수 그대로 낸다 — 1400·4100·4480·2690', () => {
    for (const elevation of parsed.elevations) {
      expect(elevation.heightsMm).toEqual([1400, 4100, 4480, 2690])
      expect(elevation.levels).toHaveLength(5)
    }
  })

  it('레벨 라벨을 원문 그대로 싣고, 같은 높이의 둘은 둘 다 남긴다', () => {
    const labels = parsed.elevations[0].levels.map((level) => level.labels)
    expect(labels[0]).toEqual([])
    expect(labels[1]).toEqual(['中央棟RCL(水下)'])
    expect(labels[2]).toEqual(['2FL'])
    expect(labels[3]).toContain('中央棟1FL')
    expect(labels[3]).toContain('基準GL')
    expect(labels[4]).toEqual(['基礎下端'])
  })

  it('치수 열 하나가 여러 通り의 軸組図에 공통으로 걸린다', () => {
    expect(parsed.elevations[0].titles).toEqual([
      'bY1通り軸組図1/100',
      'bY2通り軸組図1/100',
      'bY3通り軸組図1/100',
    ])
    expect(parsed.elevations[1].titles).toEqual([
      'bY4通り軸組図1/100',
      'bY5通り軸組図1/100',
      'bY6通り軸組図1/100',
    ])
  })

  it('유도 축척은 1/100 부근이다 — 도면 표기가 아니라 치수 관계에서 나온다', () => {
    for (const elevation of parsed.elevations) {
      expect(elevation.scalePtPerMm).toBeGreaterThan(0.027)
      expect(elevation.scalePtPerMm).toBeLessThan(0.03)
    }
  })
})
