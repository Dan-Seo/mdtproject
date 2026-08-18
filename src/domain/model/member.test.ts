import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  sectionMarkLabel,
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
  it('supports only 柱 and 大梁 as member kinds', () => {
    expectTypeOf<MemberKind>().toEqualTypeOf<'柱' | '大梁'>()
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
      main: { size: 'D25', topCount: 4, bottomCount: 4 },
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
