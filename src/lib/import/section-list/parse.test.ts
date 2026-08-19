import { describe, expect, it } from 'vitest'

import { parseSectionLists } from './parse'
import type { ParsedSectionList, SectionCandidate } from './types'

// 실물 도면 픽스처 대조는 tests/section-import/parse.test.ts에 있다.
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

  it('rejects a 主筋 cell with stray characters around the token', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        // 인접 치수선 숫자가 셀에 붙은 경우 — 매치 1개라도 셀 전체가 아니면 거부
        { str: '70016-D25', x: 96, y: 44, w: 54, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.main).toBeUndefined()
    expect(c1.raw['主筋']).toBe('70016-D25')
    expect(c1.issues).not.toHaveLength(0)
  })

  it('does not confirm a 主筋 cell folded onto a second unlabeled line', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '4-D25', x: 105, y: 44, w: 30, h: 8 },
        // 셀 내용이 줄바꿈으로 접힌 둘째 줄 — 라벨이 없는 행이다
        { str: '2-D22', x: 105, y: 56, w: 30, h: 8 },
        { str: '帯筋', x: 10, y: 70, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 70, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    // 첫 줄만 보고 4-D25로 확정하면 2段筋 거부 방침이 줄바꿈 변형에서 샌다
    expect(c1.main).toBeUndefined()
    expect(c1.raw['主筋']).toBe('4-D25')
    expect(c1.raw['主筋(折返し)']).toBe('2-D22')
    // 파서는 완성 문장이 아니라 이슈 코드를 싣는다 — 표시부가 t()로 푼다
    expect(c1.issues).toContain('主筋折返し')
    // 접힘과 무관한 帯筋은 정상 확정
    expect(c1.hoop).toEqual({ size: 'D13', pitchMm: 100 })
  })

  it('does not confirm a 大梁 上筋 cell folded onto a second unlabeled line', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: '断面', x: 10, y: 32, w: 20, h: 8 },
        { str: '400x600', x: 110, y: 32, w: 44, h: 8 },
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 44, w: 30, h: 8 },
        // 上筋 셀의 접힌 둘째 줄 — 라벨이 없는 행
        { str: '2-D22', x: 105, y: 56, w: 30, h: 8 },
        { str: '下筋', x: 10, y: 70, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 70, w: 30, h: 8 },
        { str: 'ST', x: 10, y: 84, w: 16, h: 8 },
        { str: 'D10-@200', x: 100, y: 84, w: 48, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', undefined)

    expect(g1.girderMain).toBeUndefined()
    // 上下 어느 행이 접혔는지까지 남긴다 — 원도에서 찾아볼 곳이 다르다
    expect(g1.raw['上筋(折返し)']).toBe('2-D22')
    expect(g1.issues).toContain('主筋折返し')
    // 접힘과 무관한 断面·あばら筋은 정상 확정
    expect(g1.b).toBe(400)
    expect(g1.depth).toBe(600)
    expect(g1.stirrup).toEqual({ size: 'D10', pitchMm: 200 })
  })

  it('rejects a pitch cell where an adjacent segment was glued onto the number', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '帯筋', x: 10, y: 44, w: 20, h: 8 },
        // 「D13@100」+「2」가 구분자 없이 붙은 잔재 — pitchMm=1002로 확정하면 물량 오류
        { str: 'D13@1002', x: 100, y: 44, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.hoop).toBeUndefined()
    expect(c1.raw['帯筋']).toBe('D13@1002')
    expect(c1.issues).toContain('帯筋解釈不能')
  })

  it('rejects a metric-notation dimension instead of confirming digits around the dot', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '断面', x: 10, y: 44, w: 20, h: 8 },
        // 미터 표기 — 「8×0」만 매치해 b=8·d=0으로 확정하면 조용히 틀린 단면이 된다
        { str: '0.8×0.8', x: 110, y: 44, w: 44, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.d).toBeUndefined()
    expect(c1.raw['断面']).toBe('0.8×0.8')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  it('reads a 主筋 cell written with the U+2015 dash', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        // CP932 0x815C(全角ダッシュ)는 U+2014와 U+2015로 갈려 들어온다. 앞의 것만
        // 접으면 이 셀이 「해석 불능」으로 떨어져 값이 있는데도 빈칸이 된다
        { str: '16―D25', x: 100, y: 44, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.main).toEqual({ count: 16, size: 'D25' })
    expect(c1.issues).toHaveLength(0)
  })

  it('keeps 長音符 intact in the raw fallback instead of folding it to a hyphen', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '断面', x: 10, y: 44, w: 20, h: 8 },
        // ー(U+30FC)는 하이픈이 아니라 가나 글자다 — 하이픈류에 넣어 접으면
        // 「コンクリ-ト」가 되어, 확정하지 못한 셀에 붙이는 원문 참고 표시가 망가진다
        { str: 'コンクリート打放し', x: 110, y: 44, w: 72, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.raw['断面']).toBe('コンクリート打放し')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  it('keeps a dash-only cell visible in the raw fallback', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        // 「―」는 「해당 없음」을 뜻하는 값이다(yokohama p13 腹筋 행). 장식으로만
        // 이루어진 셀이라 stripDecoration이 통째로 지우는데, 그대로 내보내면
        // 원문 참고 표시가 빈칸이 되어 「읽지 못한 셀」과 구별되지 않는다
        { str: '―', x: 114, y: 44, w: 10, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.main).toBeUndefined()
    expect(c1.raw['主筋']).toBe('-')
    expect(c1.issues).toContain('主筋解釈不能')
  })

  // 断面 라벨 행이 없고 치수가 스케치에만 붙은 표(ojkk 柱リスト 형식). 가로 치수는
  // 보통 문자열이고 세로 치수는 회전 문자열이라, 회전 아이템을 버리는 recoverRows만
  // 보면 숫자가 하나뿐이라 확정할 수 없다. 두 방향을 짝지어야 b×d가 나온다
  it('pairs the horizontal and vertical sketch dimensions per mark', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        // 세로 치수는 rot=-90이고 읽기 순서가 y 내림차순이다. 스케치 옆에 붙어
        // 층 라벨보다 위에 오므로, 층 슬라이스의 y대역 안에는 들어오지 않는다
        { str: '6', x: 160, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 28, w: 3, h: 6, rot: -90 },
        { str: '9', x: 280, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 280, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 280, y: 28, w: 3, h: 6, rot: -90 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '800', x: 230, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
        { str: '12-D22', x: 225, y: 64, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')
    const c1 = candidate(columns, 'C1', '1F')
    const c2 = candidate(columns, 'C2', '1F')

    // 가로가 b·세로가 d다. 값을 다르게 준 것은 방향 대응과 열 배정을 함께 못박기 위함
    expect([c1.b, c1.d]).toEqual([700, 600])
    expect([c2.b, c2.d]).toEqual([800, 900])
    expect(c1.issues).toHaveLength(0)
  })

  it('does not confirm a section when only the vertical sketch dimension exists', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        { str: '6', x: 160, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 28, w: 3, h: 6, rot: -90 },
        // 가로 치수가 없다 — 한쪽만으로 정사각형을 만들면 값을 지어내는 것이다
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.d).toBeUndefined()
    // 읽어낸 세로 값은 원문으로 남는다 — 그냥 버리면 사용자는 왜 断面이 비었는지 모른다
    expect(c1.raw['断面']).toBe('600')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  // 창의 하한을 「인식한 라벨 행의 최소 y」로 잡아도, 라벨을 하나도 인식하지 못하면
  // 인자가 slice.endY 하나뿐이라 창이 슬라이스 전체로 열린다. 후보 배출 가드는
  // 断面 하나만 있어도 통과하므로 배근 라벨이 전무한 표에서 断面이 지어진다
  it('runs no horizontal fallback when no 大梁 data row is recognised', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 114, y: 20, w: 12, h: 8 },
        { str: 'G2', x: 234, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '7', x: 152, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 40, w: 3, h: 6, rot: -90 },
        // 라벨이 전부 별칭 밖이다 — 읽어낸 항목이 없으니 断面도 만들지 않는다
        { str: '上主筋', x: 10, y: 62, w: 30, h: 8 },
        { str: '3-D25', x: 104, y: 62, w: 32, h: 8 },
        { str: 'スタラップ', x: 10, y: 74, w: 50, h: 8 },
        { str: '450', x: 108, y: 74, w: 24, h: 8 },
      ],
    })
    const girders = list(parsed, '大梁リスト')
    const g1 = girders.candidates.find(
      (entry) => entry.mark === 'G1' && entry.storyLabel === '1F',
    )

    expect(g1?.b).toBeUndefined()
    // 표가 조용히 사라지지도 않아야 한다 — 사유를 실어 보낸다
    expect(girders.issue).toBe('項目行未認識')
  })

  // 세로 런에는 앵커별 상한이 있는데 같은 앵커를 쓰는 가로 폴백에는 없었다 —
  // 스케치 대역의 아무 단독 숫자나 최근접 符号에 붙어 이슈 없는 확정 b가 된다
  it('bounds the horizontal sketch fallback by the same column limit', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 94, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 194, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '6', x: 130, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 130, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 130, y: 40, w: 3, h: 6, rot: -90 },
        { str: '8', x: 230, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 230, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 230, y: 40, w: 3, h: 6, rot: -90 },
        { str: '700', x: 88, y: 62, w: 24, h: 8 },
        // 어느 열에서도 200pt 떨어진 숫자 — 열 간격 100의 두 배다
        { str: '450', x: 388, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 82, y: 74, w: 36, h: 8 },
        { str: '18-D25', x: 182, y: 74, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')
    const c2 = candidate(columns, 'C2', '1F')

    expect([
      candidate(columns, 'C1', '1F').b,
      candidate(columns, 'C1', '1F').d,
    ]).toEqual([700, 600])
    expect(c2.b).toBeUndefined()
    expect(c2.raw['断面']).toBe('800')
    expect(c2.issues).toContain('断面矩形不成立')
  })

  // 상한이 좌우 간격 중 큰 쪽이면, 촘촘한 열이 반대편 먼 열에서 큰 상한을 물려받아
  // 두 열 사이 빈 대역의 회전 숫자까지 자기 d로 확정한다 — 작은 쪽을 쓴다
  it('does not let a narrow column inherit its far neighbour gap as the limit', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 94, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 154, y: 20, w: 12, h: 8 },
        { str: 'C3', x: 394, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '6', x: 125, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 125, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 125, y: 40, w: 3, h: 6, rot: -90 },
        // C2와 C3 사이 빈 대역. C2 앵커에서 90pt — 왼쪽 간격 60보다 멀지만
        // 오른쪽 간격 240보다는 가깝다
        { str: '9', x: 250, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 250, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 250, y: 40, w: 3, h: 6, rot: -90 },
        { str: '700', x: 88, y: 62, w: 24, h: 8 },
        { str: '500', x: 148, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 82, y: 74, w: 36, h: 8 },
        { str: '16-D25', x: 142, y: 74, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')
    const c2 = candidate(columns, 'C2', '1F')

    expect([
      candidate(columns, 'C1', '1F').b,
      candidate(columns, 'C1', '1F').d,
    ]).toEqual([700, 600])
    expect(c2.b).toBeUndefined()
    expect(c2.raw['断面']).toBe('500')
    expect(c2.issues).toContain('断面矩形不成立')
  })

  // 位置 열은 한 符号을 여러 앵커로 늘린다 — 앵커 수로 재면 단일 符号 표에서도
  // 가드를 통과해 상한 근거 없이 확정한다. 원래 조건은 「符号이 둘 이상」이다
  it('does not pair vertical dimensions for a single 符号 with 位置 columns', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 114, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '柱頭', x: 90, y: 32, w: 20, h: 8 },
        { str: '柱脚', x: 130, y: 32, w: 20, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '6', x: 152, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 40, w: 3, h: 6, rot: -90 },
        { str: '700', x: 108, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 70, y: 74, w: 36, h: 8 },
        { str: '16-D25', x: 134, y: 74, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  // 가로 치수 폴백의 창은 스케치 대역이다. 라벨 행 하나(上端筋)에만 매어 두면 그
  // 라벨을 인식하지 못한 표에서 창이 슬라이스 전체로 열려, 아래 행들의 단독 숫자가
  // b로 확정된다 — 인식한 데이터 라벨 행 중 가장 위를 하한으로 쓴다
  it('closes the 大梁 horizontal window at the first recognised data row', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 114, y: 20, w: 12, h: 8 },
        { str: 'G2', x: 234, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '全断面', x: 105, y: 32, w: 30, h: 8 },
        { str: '全断面', x: 225, y: 32, w: 30, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '7', x: 152, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 40, w: 3, h: 6, rot: -90 },
        // 上端筋이 아니라 「上主筋」이라 라벨을 인식하지 못한다 — 스케치에 가로
        // 치수가 없는데도 창이 열려 있으면 아래 備考 행의 숫자가 b가 된다
        { str: '上主筋', x: 10, y: 62, w: 30, h: 8 },
        { str: '3-D25', x: 104, y: 62, w: 32, h: 8 },
        { str: '下端筋', x: 10, y: 74, w: 30, h: 8 },
        { str: '3-D25', x: 104, y: 74, w: 32, h: 8 },
        { str: 'あばら筋', x: 10, y: 86, w: 40, h: 8 },
        { str: 'D13-@200', x: 100, y: 86, w: 44, h: 8 },
        { str: '備考', x: 10, y: 98, w: 20, h: 8 },
        { str: '450', x: 108, y: 98, w: 24, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', '1F')

    expect(g1.b).toBeUndefined()
    expect(g1.depth).toBeUndefined()
    expect(g1.raw['断面']).toBe('700')
    expect(g1.issues).toContain('断面矩形不成立')
  })

  it('does not confirm a section when a cell holds two vertical dimensions', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        // 한 셀에 세로 숫자가 둘이면 어느 쪽이 断面인지 판정할 근거가 없다 —
        // 가로 숫자에 거는 「열당 정확히 1개」와 같은 규약을 세로에도 건다
        { str: '6', x: 150, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 150, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 150, y: 28, w: 3, h: 6, rot: -90 },
        { str: '2', x: 170, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 170, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 170, y: 28, w: 3, h: 6, rot: -90 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  // 회전 아이템 정렬은 x가 우선이라, x가 1pt 이내로 다른 두 런의 경계에서는 y가
  // 거꾸로 온다. 간격 검사에 하한이 없으면 그 음수가 무조건 통과해 다른 층의
  // 세로 치수가 앞 런에 이어붙는다 — 「600」+「500」이 600500이 되어 둘 다 사라진다
  it('keeps two vertical dimensions apart when their columns differ by a sub-point', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        // 세로 상한(符号 간격의 절반)을 세우려면 符号가 둘 이상이어야 한다
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        { str: '6', x: 160, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 28, w: 3, h: 6, rot: -90 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
        { str: '2F', x: 10, y: 140, w: 10, h: 8 },
        // 같은 열이지만 x가 0.5pt 다르다 — 실물에서 흔한 서브픽셀 차이다
        { str: '5', x: 160.5, y: 134, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160.5, y: 131, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160.5, y: 128, w: 3, h: 6, rot: -90 },
        { str: '800', x: 110, y: 152, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 164, w: 20, h: 8 },
        { str: '18-D25', x: 105, y: 164, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    expect([candidate(columns, 'C1', '1F').b, candidate(columns, 'C1', '1F').d]).toEqual([700, 600])
    expect([candidate(columns, 'C1', '2F').b, candidate(columns, 'C1', '2F').d]).toEqual([800, 500])
  })

  it('drops a vertical run that sits far from the story label it is nearest to', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
        // 1F 셀 한복판에 떠 있는 회전 숫자 — 2F 라벨에 더 가깝다. 마지막 슬라이스의
        // endY가 표 끝이 아니라 페이지 바닥이면 상한이 층 간격의 몇 배로 벌어져
        // 이 숫자가 2F의 확정 d가 된다
        { str: '5', x: 160, y: 100, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 97, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 94, w: 3, h: 6, rot: -90 },
        { str: '2F', x: 10, y: 140, w: 10, h: 8 },
        { str: '800', x: 110, y: 152, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 164, w: 20, h: 8 },
        { str: '18-D25', x: 105, y: 164, w: 36, h: 8 },
      ],
    })
    const second = candidate(list(parsed, '柱リスト'), 'C1', '2F')

    expect(second.b).toBeUndefined()
    expect(second.raw['断面']).toBe('800')
    expect(second.issues).toContain('断面矩形不成立')
  })

  it('counts a comma-grouped vertical number when guarding against two per cell', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        // 「1,200」을 숫자가 아니라고 버리면 카운트에서도 빠져, 옆의 600이 유일한
        // 세로 치수가 되어 d로 확정된다 — 「열당 정확히 1개」 방어가 뚫린다
        { str: '1', x: 160, y: 40, w: 3, h: 6, rot: -90 },
        { str: ',', x: 160, y: 37, w: 3, h: 6, rot: -90 },
        { str: '2', x: 160, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 28, w: 3, h: 6, rot: -90 },
        { str: '6', x: 175, y: 40, w: 3, h: 6, rot: -90 },
        { str: '0', x: 175, y: 37, w: 3, h: 6, rot: -90 },
        { str: '0', x: 175, y: 34, w: 3, h: 6, rot: -90 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  // 符号 라벨은 칸 중앙에 놓이지만 칸 폭은 부재마다 다르다. 중심 사이 중점을 경계로
  // 쓰면 좁은 칸이 넓은 칸의 오른쪽 끝을 먹는다 — 실물 ojkk 大梁 G3(폭 85) 옆의
  // G4(폭 42.5)에서 G3의 세로 치수가 G4 것으로 배정됐다. 位置 열이 더 촘촘한 앵커다
  it('assigns a vertical dimension by 位置 column when the neighbour column is narrower', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 194, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 314, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '柱頭', x: 150, y: 32, w: 20, h: 8 },
        { str: '柱脚', x: 230, y: 32, w: 20, h: 8 },
        { str: '全断面', x: 305, y: 32, w: 30, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        // x=264는 符号 중심 사이 중점(260)의 오른쪽이라 C2 것으로 배정되지만,
        // 실제로는 C1 柱脚(중심 240) 칸 안이다
        { str: '6', x: 264, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 264, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 264, y: 40, w: 3, h: 6, rot: -90 },
        { str: '9', x: 344, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 344, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 344, y: 40, w: 3, h: 6, rot: -90 },
        { str: '700', x: 168, y: 62, w: 24, h: 8 },
        { str: '500', x: 308, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 142, y: 74, w: 36, h: 8 },
        { str: '16-D25', x: 222, y: 74, w: 36, h: 8 },
        { str: '12-D22', x: 302, y: 74, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    expect([
      candidate(columns, 'C1', '1F').b,
      candidate(columns, 'C1', '1F').d,
    ]).toEqual([700, 600])
    expect([
      candidate(columns, 'C2', '1F').b,
      candidate(columns, 'C2', '1F').d,
    ]).toEqual([500, 900])
  })

  // 상한을 「앵커 간격의 중앙값」으로 재면 자기 칸이 남들보다 넓은 열에서 실물 값이
  // 잘린다. 位置 열이 촘촘한 표에 全断面 한 열만 넓게 있으면 그 열의 세로 치수는
  // 중앙값 밖으로 나간다 — ojkk 柱 FC1이 실제로 그 형태다(位置 격자의 2배 폭,
  // 옛 상한의 91% 지점). 상한은 그 앵커의 이웃 간격이어야 한다
  it('keeps a wide 全断面 column pairing when the 位置 grid is much finer', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 114, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 194, y: 20, w: 12, h: 8 },
        { str: 'C3', x: 334, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '柱頭', x: 90, y: 32, w: 20, h: 8 },
        { str: '柱脚', x: 130, y: 32, w: 20, h: 8 },
        { str: '柱頭', x: 170, y: 32, w: 20, h: 8 },
        { str: '柱脚', x: 210, y: 32, w: 20, h: 8 },
        { str: '全断面', x: 325, y: 32, w: 30, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '6', x: 152, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 152, y: 40, w: 3, h: 6, rot: -90 },
        // 앵커 간격은 40·40·40(位置)과 120(全断面)이라 중앙값이 40이다. 이 런은
        // 자기 앵커(340)에서 92pt — 중앙값 밖이지만 자기 칸(폭 200) 안이다
        { str: '9', x: 432, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 432, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 432, y: 40, w: 3, h: 6, rot: -90 },
        { str: '700', x: 108, y: 62, w: 24, h: 8 },
        { str: '800', x: 188, y: 62, w: 24, h: 8 },
        { str: '500', x: 328, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 102, y: 74, w: 36, h: 8 },
        { str: '18-D25', x: 182, y: 74, w: 36, h: 8 },
        { str: '12-D22', x: 322, y: 74, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    expect([
      candidate(columns, 'C1', '1F').b,
      candidate(columns, 'C1', '1F').d,
    ]).toEqual([700, 600])
    expect([
      candidate(columns, 'C3', '1F').b,
      candidate(columns, 'C3', '1F').d,
    ]).toEqual([500, 900])
  })

  // 가로 치수 폴백도 같은 앵커를 봐야 한다. 符号 중심으로 배정하면 넓은 칸의 가로
  // 치수가 좁은 이웃 칸에 끌려가고, 그러면 두 칸 모두 「열당 정확히 1개」에 걸려
  // 조용히 미확정이 된다 — 세로에서 고친 오배정과 같은 원인이다
  it('assigns the horizontal sketch dimension by 位置 column as well', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 94, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 214, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '全断面', x: 85, y: 32, w: 30, h: 8 },
        { str: '端部', x: 160, y: 32, w: 20, h: 8 },
        { str: '中央', x: 260, y: 32, w: 20, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        { str: '6', x: 115, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 115, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 115, y: 40, w: 3, h: 6, rot: -90 },
        { str: '9', x: 310, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 310, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 310, y: 40, w: 3, h: 6, rot: -90 },
        { str: '300', x: 88, y: 62, w: 24, h: 8 },
        // C2 스케치는 端部 열 아래(중심 150)에 있다 — 符号 중심으로는 C1(100)이
        // C2(220)보다 가까워 넓은 칸의 값을 좁은 칸이 가져간다
        { str: '500', x: 138, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '16-D25', x: 76, y: 74, w: 36, h: 8 },
        { str: '12-D22', x: 140, y: 74, w: 36, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    expect([
      candidate(columns, 'C1', '1F').b,
      candidate(columns, 'C1', '1F').d,
    ]).toEqual([300, 600])
    expect([
      candidate(columns, 'C2', '1F').b,
      candidate(columns, 'C2', '1F').d,
    ]).toEqual([500, 900])
  })

  // 세로 치수는 칸 중앙이 아니라 스케치 오른쪽 끝에 붙는다 — 상한을 앵커 간격의
  // 절반으로 두면 마지막 열에서 실물 값이 잘린다 (ojkk 柱 FC1: 앵커에서 51.7pt,
  // 간격의 91%). 상한은 한 칸 폭(이웃 앵커까지의 간격)이다
  it('confirms a vertical dimension that hugs the far edge of the last column', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 94, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 214, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        // 앵커 간격 120의 2/3 지점 — 절반(60)을 넘지만 한 칸 폭 안이다
        { str: '9', x: 300, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 300, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 300, y: 40, w: 3, h: 6, rot: -90 },
        { str: '500', x: 208, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '12-D22', x: 202, y: 74, w: 36, h: 8 },
      ],
    })
    const c2 = candidate(list(parsed, '柱リスト'), 'C2', '1F')

    expect([c2.b, c2.d]).toEqual([500, 900])
  })

  it('drops a vertical run more than one column pitch from every anchor', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 94, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 214, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 50, w: 10, h: 8 },
        // 앵커 간격 120을 넘는 130pt 밖 — 어느 칸 안이라고 말할 근거가 없다
        { str: '9', x: 350, y: 46, w: 3, h: 6, rot: -90 },
        { str: '0', x: 350, y: 43, w: 3, h: 6, rot: -90 },
        { str: '0', x: 350, y: 40, w: 3, h: 6, rot: -90 },
        { str: '500', x: 208, y: 62, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 74, w: 20, h: 8 },
        { str: '12-D22', x: 202, y: 74, w: 36, h: 8 },
      ],
    })
    const c2 = candidate(list(parsed, '柱リスト'), 'C2', '1F')

    expect(c2.b).toBeUndefined()
    expect(c2.raw['断面']).toBe('500')
    expect(c2.issues).toContain('断面矩形不成立')
  })

  it('does not pair vertical dimensions when the table has a single 符号', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        // 符号가 하나뿐이면 열 간격을 잴 수 없다 — 세로 런의 x 상한을 세울 근거가
        // 없으므로 짝짓지 않는다. 원문 참고로 남는 것은 이 변경 전과 같다
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        { str: '6', x: 160, y: 34, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 31, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 28, w: 3, h: 6, rot: -90 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  it('ignores a rotated number that sits outside the table rows', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 10, h: 8 },
        { str: '700', x: 110, y: 52, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 64, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 64, w: 36, h: 8 },
        // 표 마지막 행보다 아래에 있는 회전 숫자 — 표 밖 스케치나 도면 주기다.
        // 근접성만으로 붙이면 이 숫자가 이슈 없는 확정 d가 된다
        { str: '5', x: 160, y: 150, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 147, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 144, w: 3, h: 6, rot: -90 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  // #33이 표제란 図面名称을 타이틀 앵커에서 뺐다. 그 부작용으로 마지막 블록의
  // 수집 창(tableBottom)이 다음 타이틀 없이는 페이지 바닥까지 열린다 — 表 아래
  // 符号 열 x대역 밖의 표제란류 텍스트(도면번호·축척 등)가 blockRows.at(-1)이
  // 되면, 그 텍스트보다 위이지만 실제 마지막 데이터 행보다는 아래인 회전 숫자가
  // 표 안으로 빨려들어 확정 d가 될 수 있다 (#37)
  it('does not let title-block text below the table push tableBottom past the last real row', () => {
    const parsed = parseSectionLists({
      widthPt: 500,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 35, w: 10, h: 8 },
        { str: '700', x: 110, y: 45, w: 24, h: 8 },
        { str: '主筋', x: 10, y: 55, w: 20, h: 8 },
        { str: '16-D25', x: 105, y: 55, w: 36, h: 8 },
        // 符号 열 x대역(≤ tableRight ≈ C2 중심 246) 밖의 표제란류 텍스트. y는
        // 마지막 데이터 행(55)보다 아래다 — 이 행이 blockRows.at(-1)이 되면
        // tableBottom이 120까지 밀려난다
        { str: '図面番号', x: 400, y: 90, w: 40, h: 8 },
        { str: 'A-101', x: 400, y: 120, w: 30, h: 8 },
        // 표 안 C1 열(x대역)의 회전 숫자 — 실제 마지막 데이터 행(55)보다 아래,
        // 표제란 텍스트보다 위. tableBottom이 120까지 밀려나면 이 숫자가 C1의
        // 확정 d(500)가 되어 b가 700으로 채워진다
        { str: '5', x: 160, y: 68, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 65, w: 3, h: 6, rot: -90 },
        { str: '0', x: 160, y: 62, w: 3, h: 6, rot: -90 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
    expect(c1.issues).toContain('断面矩形不成立')
  })

  it('falls back to raw dimension capture when the 断面 label row has no values', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        // 断面 라벨 행에 값 세그먼트가 없다 — 라벨 존재만 보면 폴백이 통째로 막힌다
        { str: '断面', x: 10, y: 44, w: 20, h: 8 },
        { str: '700', x: 115, y: 56, w: 20, h: 8 },
        { str: '主筋', x: 10, y: 70, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 70, w: 36, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.b).toBeUndefined()
    expect(c1.d).toBeUndefined()
    expect(c1.raw['断面']).toBe('700')
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

  it('rejects zero-count 主筋 cells', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        // 0본을 확정하면 물량 0인 부재가 만들어진다
        { str: '0-D25', x: 105, y: 44, w: 30, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.main).toBeUndefined()
    expect(c1.raw['主筋']).toBe('0-D25')
  })

  it('does not spread the first story values when story labels are unrecognized', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        // STORY_PATTERN 밖의 층 표기 — 인식되지 않으면 두 층 블록이 한 슬라이스가 된다
        { str: '一般階', x: 10, y: 32, w: 30, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 44, w: 36, h: 8 },
        { str: '帯筋', x: 10, y: 56, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 56, w: 48, h: 8 },
        { str: '最上階', x: 10, y: 70, w: 30, h: 8 },
        { str: '主筋', x: 10, y: 82, w: 20, h: 8 },
        { str: '20-D25', x: 100, y: 82, w: 36, h: 8 },
        { str: '帯筋', x: 10, y: 94, w: 20, h: 8 },
        { str: 'D13-@150', x: 100, y: 94, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', undefined)

    // 첫 층 값(16-D25·@100)을 「階指定なし」로 확정하면 전 층 값으로 오인된다
    expect(c1.main).toBeUndefined()
    expect(c1.hoop).toBeUndefined()
    expect(c1.issues).toContain('階不明')
  })

  it('labels a top/bottom bar-size mismatch with its own issue code', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '5-D25', x: 105, y: 44, w: 30, h: 8 },
        { str: '下筋', x: 10, y: 58, w: 20, h: 8 },
        { str: '5-D22', x: 105, y: 58, w: 30, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', undefined)

    // 位置는 균일하고 上下 径만 다르다 — 「位置相違」로 몰면 사용자가 원인을 오인한다
    expect(g1.girderMain).toBeUndefined()
    expect(g1.issues).toContain('主筋上下径相違')
  })

  it('keeps a centered-title right table out of the left table band', () => {
    const parsed = parseSectionLists({
      widthPt: 1200,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        // 오른쪽 표의 타이틀이 표 중앙 위에 있다 — 표 라벨열(x=450)은 타이틀보다 왼쪽
        { str: '大梁リスト', x: 600, y: 5, w: 60, h: 8 },
        // 왼쪽: 柱 표
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 150, y: 25, w: 12, h: 8 },
        { str: '1F', x: 10, y: 40, w: 12, h: 8 },
        { str: '主筋', x: 10, y: 55, w: 24, h: 8 },
        { str: '16-D25', x: 130, y: 55, w: 40, h: 8 },
        // 오른쪽: 大梁 표 (라벨열이 타이틀 왼쪽에 있다)
        { str: '符号', x: 450, y: 25, w: 24, h: 8 },
        { str: 'G1', x: 560, y: 25, w: 12, h: 8 },
        { str: '上筋', x: 450, y: 55, w: 24, h: 8 },
        { str: '3-D22', x: 550, y: 55, w: 32, h: 8 },
        { str: '下筋', x: 450, y: 70, w: 24, h: 8 },
        { str: '3-D22', x: 550, y: 70, w: 32, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')
    const girders = list(parsed, '大梁リスト')

    // 우측 경계가 「이웃 타이틀 x−40」 고정이면 오른쪽 표의 라벨열이 왼쪽 대역에
    // 새어 들어와 「16-D25上筋」처럼 이어붙어 확정이 무너진다
    expect(candidate(columns, 'C1', '1F').main).toEqual({
      count: 16,
      size: 'D25',
    })
    expect(candidate(girders, 'G1', undefined).girderMain).toEqual({
      size: 'D22',
      topCount: 3,
      bottomCount: 3,
    })
  })

  it('parses a table whose title is centered above it', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        // 타이틀이 표 위 중앙에 놓인 도면 — 좌측 경계를 타이틀 x−40으로 고정하면
        // 왼쪽 라벨열(符号·主筋)이 잘려 표가 통째로 사라진다
        { str: '柱リスト', x: 200, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 44, w: 36, h: 8 },
      ],
    })

    expect(candidate(list(parsed, '柱リスト'), 'C1', '1F').main).toEqual({
      count: 16,
      size: 'D25',
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

  it('does not confirm the first row when a recognized story slice holds duplicate label rows', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 320,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        // 1F는 인식되고 B1F는 STORY_PATTERN 밖이라 미인식 — 두 층이 1F 슬라이스로 합쳐진다
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 44, w: 36, h: 8 },
        { str: '帯筋', x: 10, y: 56, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 56, w: 48, h: 8 },
        { str: 'B1F', x: 10, y: 70, w: 16, h: 8 },
        { str: '主筋', x: 10, y: 82, w: 20, h: 8 },
        { str: '20-D25', x: 100, y: 82, w: 36, h: 8 },
        { str: '帯筋', x: 10, y: 94, w: 20, h: 8 },
        { str: 'D13-@150', x: 100, y: 94, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    // 階가 인식됐어도 라벨 행이 겹이면 뒤 층 값이 흡수된 것이다 — 첫 행만 확정하면
    // B1F의 主筋·帯筋이 사유도 원문도 없이 사라진다
    expect(c1.main).toBeUndefined()
    expect(c1.hoop).toBeUndefined()
    expect(c1.issues).toContain('項目行重複')
  })

  it('does not confirm the first 大梁 row when a story slice holds duplicate label rows', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 320,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: '2F', x: 10, y: 32, w: 10, h: 8 },
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 44, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 56, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 56, w: 32, h: 8 },
        { str: 'PH階', x: 10, y: 70, w: 24, h: 8 },
        { str: '上筋', x: 10, y: 82, w: 20, h: 8 },
        { str: '4-D25', x: 105, y: 82, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 94, w: 20, h: 8 },
        { str: '4-D25', x: 105, y: 94, w: 32, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', '2F')

    expect(g1.girderMain).toBeUndefined()
    expect(g1.issues).toContain('項目行重複')
  })

  it('keeps the 主筋 cell of a 符号 that owns no 位置 column', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 110, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 260, y: 20, w: 12, h: 8 },
        // 位置 열은 C1에만 붙어 있다 — C2는 位置 배정이 0개다
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '柱頭', x: 90, y: 32, w: 20, h: 8 },
        { str: '柱脚', x: 130, y: 32, w: 20, h: 8 },
        { str: '1F', x: 10, y: 44, w: 10, h: 8 },
        { str: '主筋', x: 10, y: 56, w: 20, h: 8 },
        { str: '16-D25', x: 88, y: 56, w: 36, h: 8 },
        { str: '16-D25', x: 128, y: 56, w: 36, h: 8 },
        { str: '12-D22', x: 250, y: 56, w: 36, h: 8 },
      ],
    })
    const c2 = candidate(list(parsed, '柱リスト'), 'C2', '1F')

    // 位置가 0개면 셀이 통째로 사라져 확정도 원문도 이슈도 남지 않았다
    expect(c2.main ?? c2.raw['主筋']).toBeDefined()
  })

  it('keeps the 上筋 cell of a 大梁 符号 that owns no 位置 column', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 110, y: 20, w: 12, h: 8 },
        { str: 'G2', x: 260, y: 20, w: 12, h: 8 },
        { str: '位置', x: 10, y: 32, w: 20, h: 8 },
        { str: '端部', x: 90, y: 32, w: 20, h: 8 },
        { str: '中央', x: 130, y: 32, w: 20, h: 8 },
        { str: '上筋', x: 10, y: 56, w: 20, h: 8 },
        { str: '3-D22', x: 90, y: 56, w: 32, h: 8 },
        { str: '3-D22', x: 130, y: 56, w: 32, h: 8 },
        { str: '4-D22', x: 252, y: 56, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 70, w: 20, h: 8 },
        { str: '3-D22', x: 90, y: 70, w: 32, h: 8 },
        { str: '3-D22', x: 130, y: 70, w: 32, h: 8 },
        { str: '4-D22', x: 252, y: 70, w: 32, h: 8 },
      ],
    })
    const g2 = candidate(list(parsed, '大梁リスト'), 'G2', undefined)

    expect(g2.girderMain ?? g2.raw['上筋(全断面)'] ?? g2.raw['上筋']).toBeDefined()
  })

  it('does not confirm a 帯筋 cell folded onto a second unlabeled line', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '帯筋', x: 10, y: 44, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 44, w: 48, h: 8 },
        // 셀이 줄바꿈으로 접혔다 — 첫 줄만 확정하면 帯筋 本数가 틀린다
        { str: 'D13-@200', x: 100, y: 56, w: 48, h: 8 },
      ],
    })
    const c1 = candidate(list(parsed, '柱リスト'), 'C1', '1F')

    expect(c1.hoop).toBeUndefined()
    expect(c1.raw['帯筋(折返し)']).toBe('D13-@200')
    expect(c1.issues).toContain('帯筋折返し')
  })

  it('does not confirm an あばら筋 cell folded onto a second unlabeled line', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'ST', x: 10, y: 44, w: 16, h: 8 },
        { str: 'D10-@200', x: 100, y: 44, w: 48, h: 8 },
        { str: 'D10-@100', x: 100, y: 56, w: 48, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', undefined)

    expect(g1.stirrup).toBeUndefined()
    expect(g1.raw['ST(折返し)']).toBe('D10-@100')
    expect(g1.issues).toContain('帯筋折返し')
  })

  it('keeps the 上筋 cell when only one of the 上筋・下筋 labels is recognized', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        // 下筋 행이 아예 잡히지 않은 표 — 읽어낸 上筋까지 사유 없이 버리면
        // 사용자는 인식 실패와 구분할 수 없다
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 44, w: 32, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', undefined)

    expect(g1.girderMain).toBeUndefined()
    expect(g1.raw['上筋(全断面)']).toBe('3-D22')
    expect(g1.issues).toContain('主筋位置欠落')
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

  it('keeps a 柱 符号 whose only 主筋 line is the folded one', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        // C2 열은 라벨 행이 비어 있고 값이 접힌 둘째 줄에만 있다
        { str: '主筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 44, w: 36, h: 8 },
        { str: '4-D25', x: 222, y: 56, w: 32, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    // 접힘 검사 전에 떨어뜨리면 C2는 사유도 원문도 없이 사라진다
    const c2 = candidate(columns, 'C2', '1F')
    expect(c2.main).toBeUndefined()
    // 첫 줄이 애초에 없으므로 「접혀 있다」가 아니다 — 원도에서 찾을 것이 다르다
    expect(c2.raw['主筋(無ラベル行)']).toBe('4-D25')
    expect(c2.issues).toEqual(['主筋ラベル行外'])
    // 접힘과 무관한 옆 符号은 그대로 확정된다
    expect(candidate(columns, 'C1', '1F').main).toEqual({
      size: 'D25',
      count: 16,
    })
  })

  it('keeps a 柱 符号 whose only 帯筋 line is below the label row', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 40, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'C2', x: 240, y: 20, w: 12, h: 8 },
        { str: '1F', x: 10, y: 32, w: 10, h: 8 },
        { str: '帯筋', x: 10, y: 44, w: 20, h: 8 },
        { str: 'D13-@100', x: 100, y: 44, w: 48, h: 8 },
        { str: 'D13-@200', x: 220, y: 56, w: 48, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    const c2 = candidate(columns, 'C2', '1F')
    expect(c2.hoop).toBeUndefined()
    // 첫 줄이 없으므로 「접혀 있다」가 아니다 — 主筋과 같은 규약
    expect(c2.raw['帯筋(無ラベル行)']).toBe('D13-@200')
    expect(c2.issues).toEqual(['帯筋ラベル行外'])
    expect(candidate(columns, 'C1', '1F').hoop).toEqual({
      size: 'D13',
      pitchMm: 100,
    })
  })

  it('keeps a 大梁 符号 whose only 上筋 line is the folded one', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'G2', x: 240, y: 20, w: 12, h: 8 },
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 44, w: 32, h: 8 },
        { str: '2-D22', x: 225, y: 56, w: 32, h: 8 },
      ],
    })
    const girders = list(parsed, '大梁リスト')

    const g2 = candidate(girders, 'G2', undefined)
    expect(g2.girderMain).toBeUndefined()
    expect(g2.raw['上筋(無ラベル行)']).toBe('2-D22')
    expect(g2.issues).toEqual(['主筋ラベル行外'])
    expect(candidate(girders, 'G1', undefined).raw['上筋(全断面)']).toBe('3-D22')
  })

  it('keeps both folded lines when 上筋 and 下筋 are folded together', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 240,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'G1', x: 120, y: 20, w: 12, h: 8 },
        { str: '上筋', x: 10, y: 44, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 44, w: 32, h: 8 },
        { str: '2-D22', x: 105, y: 56, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 70, w: 20, h: 8 },
        { str: '3-D22', x: 105, y: 70, w: 32, h: 8 },
        { str: '2-D19', x: 105, y: 82, w: 32, h: 8 },
      ],
    })
    const g1 = candidate(list(parsed, '大梁リスト'), 'G1', undefined)

    expect(g1.girderMain).toBeUndefined()
    // 한 키에 몰면 나중 줄이 앞 줄을 덮는다 — 접힌 행이 어느 쪽인지도 보여야 한다
    expect(g1.raw['上筋(折返し)']).toBe('2-D22')
    expect(g1.raw['下筋(折返し)']).toBe('2-D19')
    expect(g1.issues).toContain('主筋折返し')
  })

  it('reports a recognized list whose 符号 header row is missing', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱断面リスト', x: 10, y: 5, w: 70, h: 8 },
        // 符号 행을 인식하지 못한 표 — 리스트를 통째로 버리면 화면에는
        // 「断面リスト가 없다」로 보여 사용자가 인식 실패와 구분할 수 없다
        { str: '記号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        { str: '主筋', x: 10, y: 34, w: 20, h: 8 },
        { str: '16-D25', x: 100, y: 34, w: 36, h: 8 },
      ],
    })

    expect(parsed).toHaveLength(1)
    const columns = list(parsed, '柱断面リスト')
    expect(columns.candidates).toEqual([])
    // 사유는 표시부가 「후보가 비었다」로 추론하지 않는다 — 코드로 싣는다
    expect(columns.issue).toBe('符号行未認識')
  })

  it('does not report an unreadable 対象外 list as a failure', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        // 제품 대상이 아닌 리스트다 (ADR-005) — 못 읽었다고 알리면 정상
        // 파싱된 도면에서도 실패 안내가 뜬다
        { str: '小梁断面リスト', x: 10, y: 5, w: 80, h: 8 },
        { str: '記号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'B1', x: 120, y: 20, w: 12, h: 8 },
      ],
    })

    expect(parsed).toEqual([])
  })

  it('does not report a 対象外 list whose item rows are unreadable', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        // 符号 행은 읽히고 항목 행만 못 읽는 경로 — 억제 분기가 둘이다
        { str: '小梁断面リスト', x: 10, y: 5, w: 80, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'B1', x: 120, y: 20, w: 12, h: 8 },
        { str: 'RC規格', x: 10, y: 34, w: 30, h: 8 },
        { str: 'A種', x: 115, y: 34, w: 20, h: 8 },
      ],
    })

    expect(list(parsed, '小梁断面リスト').issue).toBeUndefined()
  })

  it('separates a read 符号 header with no readable item rows', () => {
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 200,
      items: [
        { str: '柱断面リスト', x: 10, y: 5, w: 70, h: 8 },
        { str: '符号', x: 10, y: 20, w: 20, h: 8 },
        { str: 'C1', x: 120, y: 20, w: 12, h: 8 },
        // 断面·主筋·帯筋 어느 라벨도 아닌 미지 형식 (R10)
        { str: 'RC規格', x: 10, y: 34, w: 30, h: 8 },
        { str: 'A種', x: 115, y: 34, w: 20, h: 8 },
      ],
    })
    const columns = list(parsed, '柱断面リスト')

    // 符号은 읽었으니 사용자가 볼 곳은 符号 행이 아니라 항목 행이다
    expect(columns.candidates).toEqual([])
    expect(columns.issue).toBe('項目行未認識')
  })

  it('does not let a title-block 図面名称 cut the last block off the table', () => {
    const parsed = parseSectionLists({
      widthPt: 1000,
      heightPt: 300,
      items: [
        { str: '大梁リスト', x: 10, y: 5, w: 60, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'G1', x: 150, y: 25, w: 12, h: 8 },
        { str: '断面', x: 10, y: 40, w: 24, h: 8 },
        { str: '400x600', x: 130, y: 40, w: 44, h: 8 },
        { str: '上筋', x: 10, y: 55, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 55, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 70, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 70, w: 32, h: 8 },
        { str: 'ST', x: 10, y: 85, w: 16, h: 8 },
        { str: 'D10-@200', x: 126, y: 85, w: 48, h: 8 },
        { str: '符号', x: 10, y: 105, w: 24, h: 8 },
        { str: 'G2', x: 150, y: 105, w: 12, h: 8 },
        // 표제란(도면 우하단)의 図面名称 칸에 도면 이름이 들어간다 — 글자가 리스트
        // 타이틀과 같다. 이것을 아래 표의 타이틀로 보면 여기서 표가 끊겨 마지막
        // 블록의 데이터 행이 통째로 사라진다 (실물 ojkk p3의 2F 7칸)
        { str: '図面名称', x: 830, y: 112, w: 40, h: 8 },
        { str: '梁リスト', x: 900, y: 112, w: 48, h: 8 },
        { str: '断面', x: 10, y: 120, w: 24, h: 8 },
        { str: '500x700', x: 130, y: 120, w: 44, h: 8 },
        { str: '上筋', x: 10, y: 135, w: 24, h: 8 },
        { str: '4-D25', x: 132, y: 135, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 150, w: 24, h: 8 },
        { str: '4-D25', x: 132, y: 150, w: 32, h: 8 },
        { str: 'ST', x: 10, y: 165, w: 16, h: 8 },
        { str: 'D13-@150', x: 126, y: 165, w: 48, h: 8 },
      ],
    })
    const girders = list(parsed, '大梁リスト')

    expect(girders.candidates.map(({ mark }) => mark)).toEqual(['G1', 'G2'])
    expect(candidate(girders, 'G2', undefined)).toMatchObject({
      b: 500,
      depth: 700,
      girderMain: { size: 'D25', topCount: 4, bottomCount: 4 },
      stirrup: { size: 'D13', pitchMm: 150 },
    })
  })

  it('does not let the last column swallow text from outside the table', () => {
    // 표 밖(표제란·인접 도형)의 글자가 표와 같은 행에 걸리면 최근접 열은 언제나
    // 오른쪽 끝 열이다 — 상한이 없으면 확정이던 칸이 解釈不能으로 뒤집힌다
    // (실물 ojkk p3 G5/2F가 「3-D22一級建築士事務所…」가 됐다)
    const parsed = parseSectionLists({
      widthPt: 1000,
      heightPt: 200,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 100, y: 25, w: 12, h: 8 },
        { str: 'C2', x: 200, y: 25, w: 12, h: 8 },
        { str: '主筋', x: 10, y: 40, w: 24, h: 8 },
        { str: '16-D25', x: 86, y: 40, w: 40, h: 8 },
        { str: '12-D22', x: 186, y: 40, w: 40, h: 8 },
        { str: '一級建築士事務所', x: 800, y: 40, w: 90, h: 8 },
      ],
    })
    const columns = list(parsed, '柱リスト')

    expect(candidate(columns, 'C2', undefined).main).toEqual({
      count: 12,
      size: 'D22',
    })
    expect(candidate(columns, 'C2', undefined).issues).toEqual([])
  })

  it('does not report a 図面名称 field as its own list', () => {
    const parsed = parseSectionLists({
      widthPt: 1000,
      heightPt: 300,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 150, y: 25, w: 12, h: 8 },
        { str: '断面', x: 10, y: 40, w: 24, h: 8 },
        { str: '700x700', x: 130, y: 40, w: 44, h: 8 },
        { str: '主筋', x: 10, y: 55, w: 24, h: 8 },
        { str: '16-D25', x: 130, y: 55, w: 40, h: 8 },
        { str: '帯筋', x: 10, y: 70, w: 24, h: 8 },
        { str: 'D13-@100', x: 126, y: 70, w: 48, h: 8 },
        // 라벨과 값이 한 덩이로 붙어 나오는 표제란 (yokohama p14 실측 형태).
        // 리스트로 올리면 화면에 「인식 못 한 표가 있다」는 잘못된 안내가 뜬다
        { str: '図面名称柱リスト', x: 900, y: 200, w: 90, h: 8 },
      ],
    })

    expect(parsed.map(({ listKind }) => listKind)).toEqual(['柱リスト'])
    expect(candidate(list(parsed, '柱リスト'), 'C1', undefined).main).toEqual({
      count: 16,
      size: 'D25',
    })
  })

  it('keeps a real title that shares a row with the title-block strip', () => {
    // 표제란 띠는 도면 폭을 가로지른다(ojkk 실측 x=893~1150) — 「図面名称이 있는
    // 행의 타이틀을 전부 버린다」로 만들면 같은 y에 놓인 진짜 타이틀까지 사라진다
    const parsed = parseSectionLists({
      widthPt: 1000,
      heightPt: 400,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 150, y: 25, w: 12, h: 8 },
        { str: '主筋', x: 10, y: 40, w: 24, h: 8 },
        { str: '16-D25', x: 130, y: 40, w: 40, h: 8 },
        { str: '大梁リスト', x: 30, y: 200, w: 60, h: 8 },
        { str: '図面名称', x: 830, y: 200, w: 40, h: 8 },
        { str: '柱リスト', x: 900, y: 200, w: 48, h: 8 },
        { str: '符号', x: 10, y: 220, w: 24, h: 8 },
        { str: 'G1', x: 150, y: 220, w: 12, h: 8 },
        { str: '上筋', x: 10, y: 235, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 235, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 250, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 250, w: 32, h: 8 },
      ],
    })

    expect(parsed.map(({ listKind }) => listKind)).toEqual([
      '柱リスト',
      '大梁リスト',
    ])
    expect(candidate(list(parsed, '大梁リスト'), 'G1', undefined).girderMain)
      .toEqual({ size: 'D22', topCount: 3, bottomCount: 3 })
  })

  it('splits two lists stacked vertically at the lower title', () => {
    // 위 케이스의 반대 방향 — 표 내용 x대역 안에 있는 아래 타이틀은 진짜 리스트다.
    // 여기서 끊지 않으면 위 표가 아래 표를 삼켜 후보가 두 리스트에 겹쳐 나온다
    const parsed = parseSectionLists({
      widthPt: 400,
      heightPt: 400,
      items: [
        { str: '柱リスト', x: 10, y: 5, w: 48, h: 8 },
        { str: '符号', x: 10, y: 25, w: 24, h: 8 },
        { str: 'C1', x: 150, y: 25, w: 12, h: 8 },
        { str: '断面', x: 10, y: 40, w: 24, h: 8 },
        { str: '700x700', x: 130, y: 40, w: 44, h: 8 },
        { str: '主筋', x: 10, y: 55, w: 24, h: 8 },
        { str: '16-D25', x: 130, y: 55, w: 40, h: 8 },
        { str: '帯筋', x: 10, y: 70, w: 24, h: 8 },
        { str: 'D13-@100', x: 126, y: 70, w: 48, h: 8 },
        { str: '大梁リスト', x: 30, y: 110, w: 60, h: 8 },
        { str: '符号', x: 10, y: 130, w: 24, h: 8 },
        { str: 'G1', x: 150, y: 130, w: 12, h: 8 },
        { str: '断面', x: 10, y: 145, w: 24, h: 8 },
        { str: '400x600', x: 130, y: 145, w: 44, h: 8 },
        { str: '上筋', x: 10, y: 160, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 160, w: 32, h: 8 },
        { str: '下筋', x: 10, y: 175, w: 24, h: 8 },
        { str: '3-D22', x: 132, y: 175, w: 32, h: 8 },
        { str: 'ST', x: 10, y: 190, w: 16, h: 8 },
        { str: 'D10-@200', x: 126, y: 190, w: 48, h: 8 },
      ],
    })

    expect(list(parsed, '柱リスト').candidates.map(({ mark }) => mark)).toEqual([
      'C1',
    ])
    expect(
      list(parsed, '大梁リスト').candidates.map(({ mark }) => mark),
    ).toEqual(['G1'])
  })
})
