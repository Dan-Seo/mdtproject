import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  sectionMarkLabel,
  splitGirderMainRow,
  type BarSize,
  type ColumnSection,
  type GirderSection,
  type Member,
  type MemberClass,
  type MemberKind,
  type Section,
  type SteelGrade,
} from './member'

describe('member model', () => {
  it('supports 柱・大梁・耐震壁 as member kinds', () => {
    // 耐震壁は ADR-024 で加わった。壁式構造の壁・スラブ・基礎・小梁は依然として
    // 部材にしない — ここが増えるときは ADR を伴う (ADR-005 の後継)。
    expectTypeOf<MemberKind>().toEqualTypeOf<'柱' | '大梁' | '耐震壁'>()
    expectTypeOf<MemberClass>().toEqualTypeOf<'躯体'>()
  })

  it('keeps the supported input bar sizes and steel grades explicit', () => {
    expectTypeOf<BarSize>().toEqualTypeOf<
      'D10' | 'D13' | 'D16' | 'D19' | 'D22' | 'D25' | 'D29' | 'D32'
    >()
    expectTypeOf<SteelGrade>().toEqualTypeOf<'SD295' | 'SD345' | 'SD390'>()
  })

  it('discriminates sections by their Japanese member kind', () => {
    const column: ColumnSection = {
      id: 'section-C1',
      kind: '柱',
      mark: 'C1',
      b: 800,
      d: 800,
      fc: 24,
      grade: 'SD345',
      exposure: '屋外',
      finish: '仕上げなし',
      spliceMethod: '重ね継手',
      main: { size: 'D25', count: 12 },
      hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
    }
    const girder: GirderSection = {
      id: 'section-G1',
      kind: '大梁',
      mark: 'G1',
      b: 400,
      depth: 750,
      fc: 24,
      grade: 'SD345',
      exposure: '屋外',
      finish: '仕上げなし',
      spliceMethod: '重ね継手',
      main: {
        size: 'D25',
        top: { endCount: 4, centerCount: 4 },
        bottom: { endCount: 4, centerCount: 4 },
        cutoffFromSupportFaceMm: 0,
      },
      stirrup: { size: 'D13', pitch: 100, startOffsetMm: 50 },
    }
    const sections: Section[] = [column, girder]
    const members: Member[] = [
      {
        id: '1F-X1Y1',
        kind: '柱',
        memberClass: '躯体',
        sectionId: column.id,
        storyId: '1F',
        position: { ix: 0, iy: 0 },
      },
      {
        id: '1F-G1-X1Y1-X',
        kind: '大梁',
        memberClass: '躯体',
        sectionId: girder.id,
        storyId: '1F',
        position: { axis: 'X', ix: 0, iy: 0 },
      },
    ]

    expect(sections.map(({ kind }) => kind)).toEqual(['柱', '大梁'])
    expect(members.map(({ kind }) => kind)).toEqual(['柱', '大梁'])
  })

  it('composes the story label for display without storing it in mark', () => {
    const base: ColumnSection = {
      id: 'section-C51',
      kind: '柱',
      mark: 'C51',
      b: 800,
      d: 800,
      fc: 24,
      grade: 'SD345',
      exposure: '屋外',
      finish: '仕上げなし',
      spliceMethod: '重ね継手',
      main: { size: 'D25', count: 18 },
      hoop: { size: 'D13', pitch: 100, startOffsetMm: 0 },
    }

    expect(sectionMarkLabel(base)).toBe('C51')
    expect(sectionMarkLabel({ ...base, storyLabel: '2階' })).toBe('C51(2階)')
    // 内訳書는 이미 階별로 묶인다 — 저장되는 符号에는 階가 들어가지 않는다
    expect({ ...base, storyLabel: '2階' }.mark).toBe('C51')
  })
})

describe('splitGirderMainRow', () => {
  // 積算基準 2（３）梁1) が定めるのは「梁の全長にわたる主筋」だけで、
  // トップ筋・補強筋等は設計図書に委ねられる — 少ない方が通し筋である。
  it('端部が多い断面では差が端部側のカットオフ筋になる', () => {
    expect(splitGirderMainRow({ endCount: 5, centerCount: 3 })).toEqual({
      throughCount: 3,
      cutoffCount: 2,
      cutoffAt: '端部',
    })
  })

  it('中央が多い断面では差が中央側のカットオフ筋になる', () => {
    expect(splitGirderMainRow({ endCount: 2, centerCount: 4 })).toEqual({
      throughCount: 2,
      cutoffCount: 2,
      cutoffAt: '中央',
    })
  })

  it('同数なら通し筋だけでカットオフ筋は立たない', () => {
    expect(splitGirderMainRow({ endCount: 4, centerCount: 4 })).toMatchObject({
      throughCount: 4,
      cutoffCount: 0,
    })
  })
})
