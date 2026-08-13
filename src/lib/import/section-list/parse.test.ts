import { describe, expect, it } from 'vitest'

import { parseSectionLists } from './parse'
import type { ParsedSectionList, SectionCandidate } from './types'

// 실물 도면 픽스처 대조는 tests/fixtures/section-import/parse.test.ts에 있다.
// 여기는 합성 TextPage로 파서의 경계 규칙만 고정한다.

function list(
  parsed: ParsedSectionList[],
  listKind: string,
): ParsedSectionList {
  const found = parsed.find((entry) => entry.listKind === listKind)
  expect(found, `missing list: ${listKind}`).toBeDefined()
  return found as ParsedSectionList
}

function candidate(
  parsedList: ParsedSectionList,
  mark: string,
  storyLabel?: string,
): SectionCandidate {
  const found = parsedList.candidates.find(
    (entry) => entry.mark === mark && entry.storyLabel === storyLabel,
  )
  expect(
    found,
    `missing candidate: ${parsedList.listKind} ${mark} ${storyLabel ?? ''}`,
  ).toBeDefined()
  return found as SectionCandidate
}

describe('parseSectionLists (synthetic)', () => {
  it('returns an empty array when no supported list title exists', () => {
    expect(
      parseSectionLists({
        widthPt: 100,
        heightPt: 100,
        items: [{ str: '図面枠', x: 10, y: 10, w: 20, h: 5 }],
      }),
    ).toEqual([])
  })

  it('does not promote one readable 柱 position into a complete 主筋 candidate', () => {
    const parsed = parseSectionLists({
      widthPt: 240,
      heightPt: 120,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 15, w: 20, h: 8 },
        { str: 'C1', x: 115, y: 15, w: 10, h: 8 },
        { str: '位置', x: 10, y: 25, w: 20, h: 8 },
        { str: '柱頭', x: 90, y: 25, w: 20, h: 8 },
        { str: '柱脚', x: 130, y: 25, w: 20, h: 8 },
        { str: '1F', x: 10, y: 35, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 45, w: 20, h: 8 },
        { str: '16-D25', x: 82, y: 45, w: 36, h: 8 },
      ],
    })
    const incomplete = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(incomplete.main).toBeUndefined()
    expect(incomplete.raw['主筋(柱頭)']).toBe('16-D25')
    expect(incomplete.issues).not.toHaveLength(0)
  })

  it('rejects multi-token 主筋・帯筋 cells instead of taking the first match', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '4-D25+2-D22', x: 100, y: 44, w: 60, h: 8 },
        { str: '帯筋', x: 10, y: 56, w: 20, h: 8 },
        { str: 'D13-@100/D10-@200', x: 100, y: 56, w: 80, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    // 2段筋·복수 표기는 첫 매치로 확정하지 않는다 — 빈칸+원문 전체 보존
    expect(c1.main).toBeUndefined()
    expect(c1.raw['主筋']).toBe('4-D25+2-D22')
    expect(c1.hoop).toBeUndefined()
    expect(c1.raw['帯筋']).toBe('D13-@100/D10-@200')
    expect(c1.issues).not.toHaveLength(0)
  })

  it('rejects 組数-prefixed 帯筋 cells instead of dropping the multiplier', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '帯筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '2-D13@100', x: 100, y: 44, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    // 「2-D13@100」의 2는 組数(외주+中子)다 — D13@100 1組로 확정하면 절반 계상
    expect(c1.hoop).toBeUndefined()
    expect(c1.raw['帯筋']).toBe('2-D13@100')
    expect(c1.issues).not.toHaveLength(0)
  })

  it('rejects a dimension cell holding two sections instead of merging digits', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '断面', x: 10, y: 44, w: 20, h: 8 },
        // 이웃 셀이 한 세그먼트로 붙은 경우 — 첫 매치의 두 번째 그룹이 공백 너머
        // 숫자까지 삼키면 b=800·d=800900이 된다
        { str: '800×800 900×900', x: 90, y: 44, w: 90, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.d).toBeUndefined()
    expect(c1.issues).not.toHaveLength(0)
  })

  it('classifies G marks inside a 基礎梁リスト as 対象外 despite the truncated title capture', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        // TITLE_PATTERN 캡처는 「梁リスト」로 잘리지만 対象外 판정은 타이틀 원문을 봐야 한다
        { str: '基礎梁リスト', x: 10, y: 5, w: 72, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'G9', x: 140, y: 25, w: 12, h: 8 },
        { str: '断面', x: 10, y: 40, w: 24, h: 8 },
        { str: '300x500', x: 120, y: 40, w: 44, h: 8 },
      ],
    })

    expect(candidate(list(parsed, '梁リスト'), 'G9', undefined).kind).toBe(
      '対象外',
    )
  })

  it('parses a 柱リスト without story labels as a single unlabeled slice', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        // 平屋 등 階 라벨 행이 없는 표 — 大梁 블록과 같은 폴백으로 처리해야 한다
        { str: '断面', x: 10, y: 35, w: 20, h: 8 },
        { str: '700x700', x: 110, y: 35, w: 44, h: 8 },
        { str: '主筋', x: 10, y: 50, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 50, w: 36, h: 8 },
        { str: '帯筋', x: 10, y: 65, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 65, w: 48, h: 8 },
      ],
    })

    expect(candidate(list(parsed, '柱リスト'), 'C1', undefined)).toMatchObject({
      kind: '柱',
      b: 700,
      d: 700,
      main: { count: 16, size: 'D25' },
      hoop: { size: 'D13', pitchMm: 100 },
    })
  })

  it('parses side-by-side lists without dropping or cross-contaminating them', () => {
    const parsed = parseSectionLists({
      widthPt: 1200,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        { str: '大梁リスト', x: 600, y: 5, w: 60, h: 8 },
        // 왼쪽: 柱 표
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 150, y: 25, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 12, h: 8 },
        { str: '断面', x: 10, y: 55, w: 24, h: 8 },
        { str: '700x700', x: 130, y: 55, w: 44, h: 8 },
        { str: '主筋', x: 10, y: 70, w: 24, h: 8 },
        { str: '16-D25', x: 130, y: 70, w: 40, h: 8 },
        { str: '帯筋', x: 10, y: 85, w: 24, h: 8 },
        { str: 'D13-@100', x: 130, y: 85, w: 48, h: 8 },
        // 오른쪽: 大梁 표 (같은 y대역, x만 떨어져 있다)
        { str: '符号', x: 600, y: 25, w: 24, h: 8 },
        { str: 'G1', x: 740, y: 25, w: 12, h: 8 },
        { str: '断面', x: 600, y: 55, w: 24, h: 8 },
        { str: '400x600', x: 720, y: 55, w: 44, h: 8 },
        { str: '上筋', x: 600, y: 70, w: 24, h: 8 },
        { str: '3-D22', x: 720, y: 70, w: 32, h: 8 },
        { str: '下筋', x: 600, y: 85, w: 24, h: 8 },
        { str: '3-D22', x: 720, y: 85, w: 32, h: 8 },
        { str: 'ST', x: 600, y: 100, w: 16, h: 8 },
        { str: 'D10-@200', x: 720, y: 100, w: 48, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')
    const girders = list(parsed, '大梁リスト')

    expect(columns.candidates.map(({ mark }) => mark)).toEqual(['C1'])
    expect(girders.candidates.map(({ mark }) => mark)).toEqual(['G1'])
    expect(candidate(columns, 'C1', '1F')).toMatchObject({
      kind: '柱',
      b: 700,
      d: 700,
      main: { count: 16, size: 'D25' },
      hoop: { size: 'D13', pitchMm: 100 },
    })
    expect(candidate(girders, 'G1', undefined)).toMatchObject({
      kind: '大梁',
      b: 400,
      depth: 600,
      girderMain: { size: 'D22', topCount: 3, bottomCount: 3 },
      stirrup: { size: 'D10', pitchMm: 200 },
    })
  })

  it('classifies G marks inside 小梁・地中梁 lists as 対象外', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '小梁断面リスト', x: 10, y: 5, w: 80, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'G9', x: 140, y: 25, w: 12, h: 8 },
        { str: '断面', x: 10, y: 40, w: 24, h: 8 },
        { str: '300x500', x: 120, y: 40, w: 44, h: 8 },
      ],
    })

    expect(candidate(list(parsed, '小梁断面リスト'), 'G9', undefined).kind).toBe(
      '対象外',
    )
  })

  it('does not stitch stray dimension-line numbers into a section size', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        // C1 열: 라벨 없는 숫자 1개 → 원문 참고. C2 열: 2개 → 이어붙이지 않는다
        { str: '700', x: 115, y: 44, w: 20, h: 8 },
        { str: '700', x: 232, y: 44, w: 20, h: 8 },
        { str: '900', x: 232, y: 56, w: 20, h: 8 },
        { str: '主筋', x: 10, y: 70, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 70, w: 36, h: 8 },
        { str: '16-D25', x: 220, y: 70, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    const c1 = candidate(columns, 'C1', '1F')
    expect(c1.b).toBeUndefined()
    expect(c1.d).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')

    const c2 = candidate(columns, 'C2', '1F')
    expect(c2.b).toBeUndefined()
    expect(c2.d).toBeUndefined()
    expect(c2.raw['断面']).toBeUndefined()
  })
})
